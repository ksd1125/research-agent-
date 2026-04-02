/**
 * mockdata.js — 논문 결과 기반 가상 데이터 생성기
 * ResearchMethodAgent v4.0
 *
 * 논문의 기술통계(평균, 표준편차, 최솟값, 최댓값)를 역산하여
 * 유사한 통계적 특성을 가진 가상 데이터셋을 생성합니다.
 */

import { API } from './config.js';
import { safeParseJSON } from './utils.js';
import { callGemini, callGeminiWithPdf } from './agents.js';

/* ============================================================
   PDF → Markdown 변환 (Gemini 멀티모달 기반)
   ============================================================ */

/** PDF→MD 변환 프롬프트 (Gemini 멀티모달용) */
const PDF_TO_MD_PROMPT = `당신은 '학술 문서 구조화 전문가'입니다.

첨부된 PDF 논문을 **구조화된 마크다운(Markdown)**으로 변환하세요.

규칙:
1. 논문의 원래 구조(제목, 초록, 서론, 문헌검토, 연구방법, 결과, 결론 등)를 # / ## / ### 헤딩으로 표현
2. 표(Table)는 마크다운 테이블(| ... |)로 변환. 숫자 정확도를 유지
3. 수식은 인라인 $...$ 또는 블록 $$...$$ 형태로 표현
4. 각주·참고문헌은 원문 유지
5. 불필요한 줄바꿈, 깨진 문자, 헤더/푸터(페이지번호 등) 제거
6. 한국어 논문이면 한국어 그대로 유지
7. 원문의 내용을 절대 삭제하거나 요약하지 말 것 — 전문을 구조화만 하세요
8. 그림(Figure)은 [Figure X: 캡션 내용] 형태로 위치와 설명을 표시

마크다운만 출력하고 다른 설명은 붙이지 마세요.`;

/** 텍스트 기반 PDF→MD 변환 프롬프트 (폴백용) */
function buildPdfToMdPromptFromText(rawText) {
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
 * PDF를 Gemini 멀티모달로 마크다운 변환
 * PDF base64가 있으면 직접 전송, 없으면 텍스트 기반 폴백.
 *
 * @param {string} apiKey
 * @param {string|null} pdfBase64 — PDF base64 데이터 (없으면 rawText 사용)
 * @param {string|null} rawText   — pdf.js 추출 텍스트 (폴백용)
 * @returns {Promise<string>} — 구조화된 마크다운 텍스트
 */
export async function convertPdfToMarkdown(apiKey, pdfBase64, rawText) {
  // 방법 1: PDF base64 → Gemini 멀티모달 (표/그림 직접 인식)
  if (pdfBase64) {
    try {
      return await callGeminiWithPdf(apiKey, pdfBase64, PDF_TO_MD_PROMPT, 8000);
    } catch (err) {
      console.warn('Gemini 멀티모달 PDF→MD 실패, 텍스트 폴백 시도:', err.message);
      // 멀티모달 실패 시 텍스트 기반 폴백으로 전환
    }
  }

  // 방법 2: 텍스트 기반 변환 (폴백)
  if (!rawText) {
    throw new Error('PDF 변환에 실패했습니다. Gemini API 오류이거나 PDF 형식이 지원되지 않습니다. "텍스트 붙여넣기" 탭을 이용해 주세요.');
  }

  const MAX_CHUNK = 25000;
  if (rawText.length <= MAX_CHUNK) {
    const prompt = buildPdfToMdPromptFromText(rawText);
    return await callGemini(apiKey, prompt, 8000);
  }

  // 긴 텍스트: 청크 분할
  const chunks = [];
  for (let i = 0; i < rawText.length; i += MAX_CHUNK) {
    chunks.push(rawText.slice(i, i + MAX_CHUNK));
  }
  const mdParts = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkPrompt = buildPdfToMdPromptFromText(chunks[i]);
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
  } else if (category === 'causal_ml') {
    structureExample = '고차원 관측 데이터 설명 (예: 5000 obs, 30 covariates, binary treatment)';
    roleOptions = 'outcome/treatment/confounder/moderator';
    modelDesc = '인과 모형 설명 (예: DML with Y = θ(X)·T + g(X) + ε, Causal Forest for CATE)';
  } else if (category === 'unstructured_data') {
    structureExample = '비정형 데이터 설명 (예: 10000 documents corpus, 300-dim embeddings, 5 categories)';
    roleOptions = 'text/label/embedding/feature/metadata';
    modelDesc = '분석 모형 설명 (예: BERT fine-tuning for 5-class classification, LDA K=10 topics)';
  } else if (category === 'causal_inference' || category === 'panel') {
    structureExample = '패널/인과추론 데이터 설명 (예: panel 162 counties × 6 years, staggered treatment adoption)';
    roleOptions = 'dependent/independent/control/treatment/instrument/time/entity';
    modelDesc = '인과 모형 설명 (예: Staggered DID with TWFE, 또는 Synthetic Control, 또는 IV/2SLS)';
  } else {
    // regression, 기본값
    structureExample = '데이터 구조 설명 (예: cross-section N=5000)';
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
 * Cholesky 분해 — 양정치 대칭행렬을 하삼각행렬 L로 분해 (A = L * L^T)
 * @param {number[][]} matrix — n×n 양정치 대칭행렬
 * @returns {number[][]} L — 하삼각행렬
 */
function choleskyDecompose(matrix) {
  const n = matrix.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        const diag = matrix[i][i] - sum;
        L[i][j] = diag > 0 ? Math.sqrt(diag) : 0;
      } else {
        L[i][j] = L[j][j] !== 0 ? (matrix[i][j] - sum) / L[j][j] : 0;
      }
    }
  }
  return L;
}

/**
 * 상관구조를 보존한 다변량 데이터 생성 (Cholesky 분해 기반)
 * @param {Array} continuousVars — 연속형 변수 목록 [{name_en, mean, sd, min, max}]
 * @param {number[][]} corrMatrix — 상관행렬 (continuousVars와 동일 순서)
 * @param {number} n — 생성할 행 수
 * @returns {Object[]} 생성된 데이터 배열
 */
function generateCorrelatedData(continuousVars, corrMatrix, n) {
  const p = continuousVars.length;
  const L = choleskyDecompose(corrMatrix);

  // 1. 독립 표준정규 벡터 생성 → Cholesky 변환으로 상관 부여
  const zMatrix = [];
  for (let i = 0; i < n; i++) {
    const indep = [];
    for (let j = 0; j < p; j++) {
      indep.push(normalRandom(0, 1));
    }
    const correlated = [];
    for (let j = 0; j < p; j++) {
      let val = 0;
      for (let k = 0; k <= j; k++) {
        val += L[j][k] * indep[k];
      }
      correlated.push(val);
    }
    zMatrix.push(correlated);
  }

  // 2. 표준정규 → 각 변수의 mean, sd로 스케일링 + 범위 클램핑
  const data = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    for (let j = 0; j < p; j++) {
      const v = continuousVars[j];
      const mean = v.mean ?? 0;
      const sd = v.sd ?? 1;
      let val = mean + sd * zMatrix[i][j];
      val = clamp(val, v.min ?? -Infinity, v.max ?? Infinity);
      row[v.name_en] = Math.round(val * 100) / 100;
    }
    data.push(row);
  }

  return data;
}

/**
 * 변수의 type과 role에 따라 합리적인 기술통계 추정값 생성
 * Agent 4+가 mean/sd를 추출하지 못했을 때 사용
 */
function estimateVariableStats(v) {
  const type = (v.type || 'continuous').toLowerCase();
  const role = (v.role || '').toLowerCase();
  const name = (v.name_en || '').toLowerCase();

  if (type === 'binary') {
    const p = 0.3 + Math.random() * 0.4;
    return { mean: Math.round(p * 100) / 100, sd: Math.round(Math.sqrt(p * (1 - p)) * 100) / 100, min: 0, max: 1 };
  }
  if (type === 'categorical') {
    const nLevels = (v.levels && v.levels.length) || 3;
    return { mean: null, sd: null, min: 1, max: nLevels };
  }
  if (type === 'ordinal') {
    const lo = v.min != null ? v.min : 1;
    const hi = v.max != null ? v.max : 5;
    return { mean: Math.round((lo + hi) / 2 * 100) / 100, sd: Math.round((hi - lo) / 4 * 100) / 100, min: lo, max: hi };
  }
  if (name.includes('age') || name.includes('연령')) return { mean: 42, sd: 12, min: 18, max: 80 };
  if (name.includes('income') || name.includes('revenue') || name.includes('sales') || name.includes('wage') || name.includes('소득') || name.includes('매출'))
    return { mean: 3500, sd: 2000, min: 0, max: 15000 };
  if (name.includes('edu') || name.includes('school') || name.includes('학력')) return { mean: 14, sd: 3, min: 6, max: 22 };
  if (name.includes('experience') || name.includes('tenure') || name.includes('경력')) return { mean: 8, sd: 5, min: 0, max: 35 };
  if (name.includes('rate') || name.includes('ratio') || name.includes('비율')) return { mean: 0.45, sd: 0.2, min: 0, max: 1 };
  if (name.includes('score') || name.includes('index') || name.includes('점수') || name.includes('지수')) return { mean: 55, sd: 18, min: 0, max: 100 };
  if (name.includes('size') || name.includes('count') || name.includes('num_') || name.includes('규모')) return { mean: 25, sd: 15, min: 1, max: 100 };
  if (name.includes('cost') || name.includes('price') || name.includes('amount') || name.includes('비용') || name.includes('가격')) return { mean: 500, sd: 300, min: 0, max: 3000 };
  if (name.includes('duration') || name.includes('time') || name.includes('period') || name.includes('기간')) return { mean: 12, sd: 6, min: 1, max: 48 };
  if (name.includes('satisf') || name.includes('만족') || name.includes('likert')) return { mean: 3.5, sd: 0.9, min: 1, max: 5 };
  if (role.includes('dependent') || role.includes('outcome') || role.includes('target')) return { mean: 50, sd: 20, min: 0, max: 100 };
  if (role.includes('treatment') || role.includes('factor')) return { mean: 0.5, sd: 0.5, min: 0, max: 1 };
  return { mean: 30, sd: 15, min: 0, max: 100 };
}

/**
 * 독립 난수 기반 데이터 생성 (상관행렬 없을 때 폴백)
 */
function generateIndependentData(enrichedVars, n) {
  const data = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    for (const v of enrichedVars) {
      const { name_en, mean, sd, min, max, type, levels } = v;
      const t = (type || 'continuous').toLowerCase();
      if (t === 'binary') {
        row[name_en] = Math.random() < (mean || 0.5) ? 1 : 0;
      } else if (t === 'categorical' || t === '범주') {
        const cats = v.categories ? String(v.categories).split(/[,，;；]/).map(s => s.trim()).filter(Boolean)
                   : (levels && levels.length > 0) ? levels : null;
        if (cats && cats.length > 0) {
          row[name_en] = cats[Math.floor(Math.random() * cats.length)];
        } else {
          row[name_en] = Math.floor(Math.random() * ((max || 4) - (min || 1) + 1)) + (min || 1);
        }
      } else if (t === 'ordinal' || (Number.isInteger(min) && Number.isInteger(max) && max - min <= 10)) {
        let val = normalRandom(mean || 3, sd || 1);
        val = Math.round(val);
        row[name_en] = clamp(val, min ?? 1, max ?? 5);
      } else {
        let val = normalRandom(mean || 30, sd || 15);
        val = clamp(val, min ?? -Infinity, max ?? Infinity);
        row[name_en] = Math.round(val * 100) / 100;
      }
    }
    data.push(row);
  }
  return data;
}

/**
 * 기술통계 기반 가상 데이터셋 생성
 * Agent 4+가 mean/sd를 추출하지 못해도 변수 구조 기반으로 500행 생성
 *
 * @param {Object} stats — extractDescriptiveStats 또는 Agent4+ 결과
 * @param {number} [n=500] — 생성할 관측치 수 (기본 500행)
 * @returns {{ csv: string, data: Array<Object>, variables: Array }}
 */
export function generateMockData(stats, n = 500, category = null, correlationMatrix = null) {
  const sampleSize = n || 500;
  const variables = stats.variables || [];

  if (variables.length === 0) {
    throw new Error('변수 정보가 없습니다. 논문 분석을 먼저 진행해주세요.');
  }

  // 패널 데이터 카테고리일 때 entity_id/year 자동 추가 (이슈 19)
  const isPanelCategory = category === 'causal_inference' || category === 'panel';
  const hasEntityId = variables.some(v => v.name_en === 'entity_id' || v.name_en === 'firm_id');
  const hasYear = variables.some(v => v.name_en === 'year');

  if (isPanelCategory && (!hasEntityId || !hasYear)) {
    const numEntities = 250;
    const years = [2015, 2016, 2017, 2018, 2019];
    const panelN = numEntities * years.length; // 1250 rows

    // enrichedVars 생성 (패널 식별자 제외)
    const enrichedVars = variables.map(v => {
      const enriched = { ...v };
      const hasMean = (v.mean != null && v.mean !== '' && !isNaN(v.mean));
      const hasSd   = (v.sd != null && v.sd !== '' && !isNaN(v.sd));
      const hasMin  = (v.min != null && v.min !== '' && !isNaN(v.min));
      const hasMax  = (v.max != null && v.max !== '' && !isNaN(v.max));
      const type = (v.type || 'continuous').toLowerCase();
      if (!hasMean || !hasSd) {
        const est = estimateVariableStats(v);
        if (!hasMean) enriched.mean = est.mean;
        if (!hasSd) enriched.sd = est.sd;
        if (!hasMin) enriched.min = est.min;
        if (!hasMax) enriched.max = est.max;
        enriched._estimated = true;
      } else {
        if (!hasMin) enriched.min = Math.round((enriched.mean - 3 * enriched.sd) * 100) / 100;
        if (!hasMax) enriched.max = Math.round((enriched.mean + 3 * enriched.sd) * 100) / 100;
      }
      return enriched;
    });

    // 패널 데이터 생성
    const data = [];
    for (let e = 1; e <= numEntities; e++) {
      for (const yr of years) {
        const row = { entity_id: e, year: yr };
        for (const v of enrichedVars) {
          const { name_en, mean, sd, min, max, type, levels } = v;
          const t = (type || 'continuous').toLowerCase();
          if (t === 'binary') {
            row[name_en] = Math.random() < (mean || 0.5) ? 1 : 0;
          } else if (t === 'categorical' || t === '범주') {
            const cats = v.categories ? String(v.categories).split(/[,，;；]/).map(s => s.trim()).filter(Boolean)
                       : (levels && levels.length > 0) ? levels : null;
            if (cats && cats.length > 0) {
              row[name_en] = cats[Math.floor(Math.random() * cats.length)];
            } else {
              row[name_en] = Math.floor(Math.random() * ((max || 4) - (min || 1) + 1)) + (min || 1);
            }
          } else {
            let val = normalRandom(mean || 30, sd || 15);
            val = clamp(val, min ?? -Infinity, max ?? Infinity);
            row[name_en] = Math.round(val * 100) / 100;
          }
        }
        data.push(row);
      }
    }

    // 패널 식별자를 enrichedVars 앞에 추가
    const panelVars = [
      { name_kr: '개체 ID', name_en: 'entity_id', role: '식별자', type: 'continuous' },
      { name_kr: '연도', name_en: 'year', role: '시간', type: 'continuous' },
      ...enrichedVars
    ];
    const headers = panelVars.map(v => v.name_en);
    const csvRows = [headers.join(',')];
    for (const row of data) {
      csvRows.push(headers.map(h => {
        const val = row[h];
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return val ?? '';
      }).join(','));
    }
    return { csv: csvRows.join('\n'), data, variables: panelVars };
  }

  // 1단계: 빠진 통계를 추정하여 보완
  const enrichedVars = variables.map(v => {
    const enriched = { ...v };
    const hasMean = (v.mean != null && v.mean !== '' && !isNaN(v.mean));
    const hasSd   = (v.sd != null && v.sd !== '' && !isNaN(v.sd));
    const hasMin  = (v.min != null && v.min !== '' && !isNaN(v.min));
    const hasMax  = (v.max != null && v.max !== '' && !isNaN(v.max));
    const type = (v.type || 'continuous').toLowerCase();

    if (type === 'binary' || type === 'categorical') {
      if (!hasMean || !hasMin || !hasMax) {
        const est = estimateVariableStats(v);
        if (!hasMean) enriched.mean = est.mean;
        if (!hasMin) enriched.min = est.min;
        if (!hasMax) enriched.max = est.max;
        if (!hasSd) enriched.sd = est.sd;
        enriched._estimated = true;
      }
      return enriched;
    }
    if (!hasMean || !hasSd) {
      const est = estimateVariableStats(v);
      if (!hasMean) enriched.mean = est.mean;
      if (!hasSd) enriched.sd = est.sd;
      if (!hasMin) enriched.min = est.min;
      if (!hasMax) enriched.max = est.max;
      enriched._estimated = true;
    } else {
      if (!hasMin) enriched.min = Math.round((enriched.mean - 3 * enriched.sd) * 100) / 100;
      if (!hasMax) enriched.max = Math.round((enriched.mean + 3 * enriched.sd) * 100) / 100;
    }
    return enriched;
  });

  // 2단계: 데이터 생성
  let data;

  // 상관행렬이 있으면 Cholesky 기반 상관 데이터 생성
  const corrInfo = correlationMatrix || stats.correlation_matrix;
  console.log('[MockData] correlation_matrix 수신:', corrInfo ? `${corrInfo.variables?.length || 0}변수, ${corrInfo.matrix?.length || 0}×${corrInfo.matrix?.[0]?.length || 0} 행렬` : 'null/없음');

  if (corrInfo && corrInfo.matrix && corrInfo.variables) {
    const corrVarNames = corrInfo.variables;
    const enrichedNames = enrichedVars.map(v => v.name_en);
    const corrVarsOrdered = corrVarNames
      .map(name => enrichedVars.find(v => v.name_en === name))
      .filter(Boolean);

    console.log('[MockData] 상관행렬 변수 매칭:', {
      corrVarNames,
      enrichedNames,
      matchedCount: corrVarsOrdered.length,
    });

    if (corrVarsOrdered.length >= 2 && corrInfo.matrix.length === corrVarsOrdered.length) {
      console.log('[MockData] ✅ Cholesky 경로 사용');
      const correlatedData = generateCorrelatedData(corrVarsOrdered, corrInfo.matrix, sampleSize);
      const corrVarNameSet = new Set(corrVarsOrdered.map(v => v.name_en));

      data = [];
      for (let i = 0; i < sampleSize; i++) {
        const row = { ...correlatedData[i] };
        for (const v of enrichedVars) {
          if (corrVarNameSet.has(v.name_en)) continue;
          const { name_en, mean, sd, min, max, type, levels } = v;
          const t = (type || 'continuous').toLowerCase();
          if (t === 'binary') {
            row[name_en] = Math.random() < (mean || 0.5) ? 1 : 0;
          } else if (t === 'categorical' || t === '범주') {
            const cats = v.categories ? String(v.categories).split(/[,，;；]/).map(s => s.trim()).filter(Boolean)
                       : (levels && levels.length > 0) ? levels : null;
            row[name_en] = cats && cats.length > 0
              ? cats[Math.floor(Math.random() * cats.length)]
              : Math.floor(Math.random() * ((max || 4) - (min || 1) + 1)) + (min || 1);
          } else {
            let val = normalRandom(mean || 30, sd || 15);
            val = clamp(val, min ?? -Infinity, max ?? Infinity);
            row[name_en] = Math.round(val * 100) / 100;
          }
        }
        data.push(row);
      }
    } else {
      console.warn('[MockData] ⚠️ 상관행렬 변수 매칭 실패 → 독립 생성 폴백');
      data = generateIndependentData(enrichedVars, sampleSize);
    }
  } else {
    console.log('[MockData] ℹ️ 상관행렬 없음 → 독립 데이터 생성');
    data = generateIndependentData(enrichedVars, sampleSize);
  }

  // 3단계: CSV 생성
  const headers = enrichedVars.map(v => v.name_en);
  const csvRows = [headers.join(',')];
  for (const row of data) {
    csvRows.push(headers.map(h => {
      const val = row[h];
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
      return val ?? '';
    }).join(','));
  }
  const csv = csvRows.join('\n');

  return { csv, data, variables: enrichedVars };
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
