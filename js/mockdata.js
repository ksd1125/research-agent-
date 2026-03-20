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

function buildStatExtractionPrompt(paperText) {
  return `당신은 '기술통계 추출 전문 에이전트'입니다.

아래 논문 텍스트에서 기술통계표(descriptive statistics table)에 해당하는 정보를 찾아 JSON으로 추출하세요.
각 변수의 평균(mean), 표준편차(sd), 최솟값(min), 최댓값(max), 변수유형(type: continuous/binary/ordinal)을 추출합니다.

논문 텍스트:
${paperText}

반드시 순수 JSON만 출력하세요. 첫 글자는 { 이어야 합니다.

{
  "sample_size": 1148,
  "variables": [
    {
      "name_kr": "한국어 변수명",
      "name_en": "영문 변수명 (코드용, snake_case)",
      "mean": 1.64,
      "sd": 0.74,
      "min": 0,
      "max": 5,
      "type": "continuous",
      "description": "종속변수: 18세 이하 자녀수"
    }
  ],
  "dependent_var": "영문 종속변수명",
  "key_independent_var": "영문 핵심 독립변수명"
}`;
}

/**
 * 논문에서 기술통계를 추출
 * @param {string} apiKey
 * @param {string} paperText
 * @returns {Promise<Object>}
 */
export async function extractDescriptiveStats(apiKey, paperText) {
  const prompt = buildStatExtractionPrompt(paperText);
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
      const { name_en, mean, sd, min, max, type } = v;

      if (type === 'binary') {
        // 이진 변수: 평균 = 확률
        row[name_en] = Math.random() < (mean || 0.5) ? 1 : 0;
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
