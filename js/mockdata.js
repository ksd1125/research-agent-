/**
 * mockdata.js — 논문 결과 기반 가상 데이터 생성기
 * ResearchMethodAgent v4.0
 *
 * 논문의 기술통계(평균, 표준편차, 최솟값, 최댓값)를 역산하여
 * 유사한 통계적 특성을 가진 가상 데이터셋을 생성합니다.
 */

import { API } from './config.js';
import { safeParseJSON } from './utils.js';
import { callGemini } from './agents.js';

/* ============================================================
   PDF → Markdown 변환 (Gemini 기반)
   ============================================================ */

function buildPdfToMdPrompt(rawText) {
  return `당신은 '학술 문서 구조화 전문가'입니다.

아래 PDF에서 추출한 원시 텍스트를 **구조화된 마크다운(Markdown)**으로 변환하세요.

규칙:
1. 논문의 원래 구조(제목, 초록, 서론, 문헌검토, 연구방법, 결과, 결론 등)를 # / ## / ### 헤딩으로 표현
2. 표(Table)는 마크다운 테이블(| ... |)로 변환. 숫자 정확도를 유지
3. 수식은 인라인 $...$ 또는 블록 $$...$$ 형태로 표현
4. 각주·참고문헌은 원문 유지
5. 불필요한 줄바꿈, 깨진 문자, 헤더/푸터(페이지번호 등) 제거
6. 한국어 논문이면 한국어 그대로 유지
7. 원문의 내용을 절대 삭제하거나 요약하지 말 것 — 전문을 구조화만 하세요

PDF 원시 텍스트:
${rawText}

위 텍스트를 구조화된 마크다운으로 변환하여 출력하세요. 마크다운만 출력하고 다른 설명은 붙이지 마세요.`;
}

/**
 * PDF 원시 텍스트를 Gemini로 마크다운으로 변환
 * @param {string} apiKey
 * @param {string} rawText — pdf.js에서 추출한 원시 텍스트
 * @returns {Promise<string>} — 구조화된 마크다운 텍스트
 */
export async function convertPdfToMarkdown(apiKey, rawText) {
  // 텍스트가 너무 길면 Gemini 토큰 제한 때문에 분할 처리
  const MAX_CHUNK = 25000; // 글자 수 기준

  if (rawText.length <= MAX_CHUNK) {
    const prompt = buildPdfToMdPrompt(rawText);
    return await callGemini(apiKey, prompt, 8000);
  }

  // 긴 텍스트: 청크 분할 → 각각 변환 → 합치기
  const chunks = [];
  for (let i = 0; i < rawText.length; i += MAX_CHUNK) {
    chunks.push(rawText.slice(i, i + MAX_CHUNK));
  }

  const mdParts = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkPrompt = buildPdfToMdPrompt(chunks[i]);
    const md = await callGemini(apiKey, chunkPrompt, 8000);
    mdParts.push(md);
  }

  return mdParts.join('\n\n---\n\n');
}

/* ============================================================
   Agent 4: 기술통계 추출 → 가상 데이터 생성 프롬프트
   ============================================================ */

function buildStatExtractionPrompt(paperText, paperContext) {
  const category = paperContext?.analysis_category || '';

  // 분석 유형에 따른 데이터 구조 설명 및 역할 용어 동적 설정
  let structureExample, roleOptions, modelDesc;

  if (category === 'experimental') {
    structureExample = '실험 데이터 설명 (예: 2×3 요인설계, 처리군 120명 × 통제군 120명)';
    roleOptions = 'outcome/factor/covariate/blocking';
    modelDesc = '분석 모형 설명 (예: 이원분산분석 Y ~ A * B + covariates)';
  } else if (category === 'spatial') {
    structureExample = '공간 데이터 설명 (예: 250 municipalities, spatial weights W)';
    roleOptions = 'dependent/independent/control/spatial_lag';
    modelDesc = '공간 모형 설명 (예: SAR: Y = ρWY + Xβ + ε)';
  } else if (category === 'time_series') {
    structureExample = '시계열 데이터 설명 (예: monthly data, 2000-2020, 240 observations)';
    roleOptions = 'dependent/predictor/exogenous/instrument';
    modelDesc = '시계열 모형 설명 (예: VAR(2) with Y1, Y2, Y3)';
  } else if (category === 'survival') {
    structureExample = '생존 데이터 설명 (예: 500 patients, median follow-up 36 months)';
    roleOptions = 'time/event/treatment/covariate';
    modelDesc = '생존 모형 설명 (예: Cox PH: h(t) = h0(t)exp(Xβ))';
  } else if (category === 'machine_learning') {
    structureExample = '데이터 설명 (예: 10000 samples, 50 features, binary classification)';
    roleOptions = 'target/feature/id';
    modelDesc = '모형 설명 (예: Random Forest with 100 trees)';
  } else {
    // regression, panel, 기본값
    structureExample = '데이터 구조 설명 (예: panel 162 counties × 6 years, 또는 cross-section N=5000)';
    roleOptions = 'dependent/independent/control/instrument';
    modelDesc = '핵심 분석 모형을 수식 또는 문장으로 설명';
  }

  return `당신은 '기술통계 추출 전문 에이전트'입니다.

아래 논문 텍스트에서 분석에 사용된 변수들의 기술통계 정보를 찾아 JSON으로 추출하세요.

추출 전략:
1. Summary Statistics, Descriptive Statistics 테이블, 또는 본문에서 변수별 평균/표준편차/빈도 정보를 찾으세요.
2. 테이블이 집단별/그룹별로 나뉘어 있다면 전체 표본 기준으로 통합하여 추정하세요.
3. 결과변수, 핵심 설명변수, 통제변수/공변량을 모두 포함하세요.
4. 평균/표준편차가 명시되지 않은 변수는 논문 맥락에서 합리적으로 추정하세요.
5. 비율(0~1) 변수는 type: "binary", 연속형은 "continuous", 범주형은 "categorical", 서열형은 "ordinal"로 지정하세요.
6. 실험설계의 경우 요인(factor)과 수준(level) 정보도 포함하세요.

논문 텍스트:
${paperText}

반드시 순수 JSON만 출력하세요. 첫 글자는 { 이어야 합니다. 마크다운 코드블록은 사용하지 마세요.

{
  "sample_size": 2190,
  "data_structure": "${structureExample}",
  "variables": [
    {
      "name_kr": "한국어 변수명",
      "name_en": "영문 변수명 (snake_case)",
      "mean": 8.5,
      "sd": 4.2,
      "min": 0,
      "max": 30,
      "type": "continuous",
      "role": "${roleOptions} 중 선택",
      "description": "변수 설명",
      "levels": ["해당 시에만: 범주/요인의 수준 목록"]
    }
  ],
  "dependent_var": "결과변수 name_en",
  "key_independent_var": "핵심 설명변수 name_en",
  "model_description": "${modelDesc}"
}`;
}

/**
 * 논문에서 기술통계를 추출
 * @param {string} apiKey
 * @param {string} paperText
 * @param {Object} [paperContext] — Agent 1의 paper_context (analysis_category 포함)
 * @returns {Promise<Object>}
 */
export async function extractDescriptiveStats(apiKey, paperText, paperContext) {
  const prompt = buildStatExtractionPrompt(paperText, paperContext);
  const raw = await callGemini(apiKey, prompt, 3000);
  return safeParseJSON(raw);
}

/* ============================================================
   가상 데이터 생성 엔진 (클라이언트 사이드)
   ============================================================ */

/**
 * 정규분포 난수 생성 (Box-Muller 변환)
 */
function normalRandom(mean = 0, sd = 1) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z;
}

/**
 * 값을 범위 내로 클램핑
 */
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/**
 * 기술통계 기반 가상 데이터셋 생성
 *
 * @param {Object} stats — extractDescriptiveStats 결과
 * @param {number} [n] — 생성할 관측치 수 (기본: 원본 표본 크기)
 * @returns {{ csv: string, data: Array<Object>, variables: Array }}
 */
export function generateMockData(stats, n = null) {
  const sampleSize = n || stats.sample_size || 500;
  const variables = stats.variables || [];
  const data = [];

  for (let i = 0; i < sampleSize; i++) {
    const row = {};

    for (const v of variables) {
      const { name_en, mean, sd, min, max, type, levels } = v;

      if (type === 'binary') {
        // 이진 변수: 평균 = 확률
        row[name_en] = Math.random() < (mean || 0.5) ? 1 : 0;
      } else if (type === 'categorical' && levels && levels.length > 0) {
        // 범주형 변수: levels에서 균등 랜덤 선택
        row[name_en] = levels[Math.floor(Math.random() * levels.length)];
      } else if (type === 'ordinal' || (Number.isInteger(min) && Number.isInteger(max) && max - min <= 10)) {
        // 서열/이산 변수: 정규분포 → 반올림 → 클램핑
        let val = normalRandom(mean || 0, sd || 1);
        val = Math.round(val);
        row[name_en] = clamp(val, min ?? 0, max ?? 10);
      } else {
        // 연속 변수: 정규분포 → 클램핑
        let val = normalRandom(mean || 0, sd || 1);
        val = clamp(val, min ?? -Infinity, max ?? Infinity);
        row[name_en] = Math.round(val * 100) / 100; // 소수점 2자리
      }
    }

    data.push(row);
  }

  // CSV 생성
  const headers = variables.map(v => v.name_en);
  const csvRows = [headers.join(',')];
  for (const row of data) {
    csvRows.push(headers.map(h => row[h] ?? '').join(','));
  }
  const csv = csvRows.join('\n');

  return { csv, data, variables };
}

/**
 * 생성된 데이터의 기술통계 계산 (검증용)
 * @param {Array<Object>} data
 * @param {Array} variables
 * @returns {Array<Object>}
 */
export function computeStats(data, variables) {
  return variables.map(v => {
    const vals = data.map(row => row[v.name_en]).filter(x => x !== undefined);
    const n = vals.length;
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
    const min = Math.min(...vals);
    const max = Math.max(...vals);

    return {
      name_kr: v.name_kr,
      name_en: v.name_en,
      original_mean: v.mean,
      generated_mean: Math.round(mean * 1000) / 1000,
      original_sd: v.sd,
      generated_sd: Math.round(sd * 1000) / 1000,
      min, max,
    };
  });
}

/**
 * CSV를 Blob으로 변환하여 다운로드
 * @param {string} csv
 * @param {string} filename
 */
export function downloadCSV(csv, filename = 'mock_data.csv') {
  // UTF-8 BOM 추가 (엑셀 한글 호환)
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
