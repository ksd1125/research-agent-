/**
 * agents.js — 에이전트 프롬프트 정의 및 API 호출
 * ResearchMethodAgent v4.0
 */

import { API, MESSAGES } from './config.js';
import { safeParseJSON } from './utils.js';

/* ============================================================
   Gemini API 호출
   ============================================================ */

/**
 * Gemini API에 프롬프트 전송
 * @param {string} apiKey
 * @param {string} prompt  — 텍스트 프롬프트
 * @param {number} [maxTokens=4000]
 * @returns {Promise<string>} — 응답 텍스트
 */
export async function callGemini(apiKey, prompt, maxTokens = 4000) {
  if (!apiKey) throw new Error(MESSAGES.errors.noApiKey);

  const url = `${API.baseUrl}/${API.defaultModel}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: API.defaultTemp,
        maxOutputTokens: maxTokens,
      },
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error(MESSAGES.errors.emptyResponse);

  return candidate.content.parts.map(p => p.text || '').join('');
}

/* ============================================================
   Agent 1: 문서 분석기 — 도메인/방법론 감지
   ============================================================ */

function buildAgent1Prompt(paperText) {
  return `논문 텍스트:
${paperText}

당신은 '문서 분석 전문 에이전트'입니다. 위 논문 텍스트를 분석하여 반드시 순수 JSON만 출력하세요.
첫 글자는 반드시 { 이어야 합니다. 마크다운 코드블록(\`\`\`json 등)은 절대 사용하지 마세요.

중요: detected_methods는 가장 핵심적인 방법론 최대 ${API.maxMethods}개만 포함하세요.

출력 형식:
{
  "metadata": {
    "title": "논문 제목",
    "summary": "1문장 요약"
  },
  "paper_context": {
    "domain": "학문 분야 (예: 심리학, 경제학, 빅데이터 등)",
    "research_type": "연구 형태 (예: 실험 연구, 횡단 연구, 종단 연구 등)",
    "data_characteristics": "데이터 특성 (간략히 30자 이내)"
  },
  "detected_methods": [
    {
      "raw_name": "방법론 명칭 (논문에서 사용한 이름 그대로)",
      "evidence_text": "방법론 언급 발췌 (50자 이내)",
      "target_result_location": "결과 위치 (예: Table 3, Figure 2 등)"
    }
  ]
}`;
}

/**
 * Agent 1 실행 — 문서 분석
 * @param {string} apiKey
 * @param {string} paperText
 * @returns {Promise<Object>}
 */
export async function runAgent1(apiKey, paperText) {
  const prompt = buildAgent1Prompt(paperText);
  const raw = await callGemini(apiKey, prompt, API.tokens.agent1);

  try {
    return safeParseJSON(raw);
  } catch (err) {
    // 강제 복구 시도
    const start = raw.indexOf('{');
    if (start >= 0) {
      let partial = raw.slice(start).replace(/,\s*$/, '');
      const ob = (partial.match(/\[/g) || []).length - (partial.match(/\]/g) || []).length;
      const oc = (partial.match(/\{/g) || []).length - (partial.match(/\}/g) || []).length;
      for (let i = 0; i < ob; i++) partial += ']';
      for (let i = 0; i < oc; i++) partial += '}';
      try { return JSON.parse(partial); }
      catch { throw new Error(MESSAGES.errors.agent1Parse + raw.substring(0, 400)); }
    }
    throw new Error(MESSAGES.errors.agent1NoJson + raw.substring(0, 400));
  }
}

/* ============================================================
   Agent 2: 통계 분석기 — 방법론 해석
   ============================================================ */

function buildAgent2Prompt(rawName, evidenceText, paperContext) {
  return `당신은 '통계분석 전문 에이전트'입니다. 반드시 순수 JSON만 출력하세요.
\`\`\`json 코드블록, 마크다운, 설명 텍스트를 절대 포함하지 마세요. 첫 글자는 반드시 { 이어야 합니다.

[논문 분야]: ${paperContext.domain || '알 수 없음'}
[연구 유형]: ${paperContext.research_type || '알 수 없음'}
[데이터 특성]: ${paperContext.data_characteristics || '알 수 없음'}
[발췌 문장]: "${evidenceText}"
[방법론 명칭]: "${rawName}"

위 맥락을 바탕으로 이 방법론을 분석하세요:

{
  "standard_name": "표준화된 학술적 명칭 (예: Ordinary Least Squares Regression)",
  "concept": "이 방법론의 통계적 개념을 위 [논문 분야]의 관점에서 설명 (2~3문장)",
  "why_used": "위 [데이터 특성]과 [연구 유형]을 고려했을 때, 이 논문에서 이 방법을 채택한 학술적 이유 (2~3문장)",
  "steps": [
    {"step": 1, "name": "단계명", "desc": "구체적 분석/전처리 절차 설명"}
  ]
}`;
}

/**
 * Agent 2 실행 — 방법론 통계 분석
 * @param {string} apiKey
 * @param {Object} method  — Agent 1이 감지한 방법론 객체
 * @param {Object} paperContext — 논문 컨텍스트
 * @returns {Promise<Object>}
 */
export async function runAgent2(apiKey, method, paperContext) {
  const prompt = buildAgent2Prompt(method.raw_name, method.evidence_text, paperContext);
  const raw = await callGemini(apiKey, prompt, API.tokens.agent2);

  try {
    return safeParseJSON(raw);
  } catch {
    return {
      standard_name: method.raw_name,
      concept: '분석 실패 — 재시도해주세요.',
      why_used: '분석 실패 — 재시도해주세요.',
      steps: [],
    };
  }
}

/* ============================================================
   Agent 3: 코드 생성기 — Python/R 코드 + 패키지 목록
   ============================================================ */

function buildAgent3MetaPrompt(standardName, paperContext) {
  return `당신은 '데이터 프로그래밍 전문 에이전트'입니다. 반드시 순수 JSON만 출력하세요.
첫 글자는 반드시 { 이어야 합니다.

[목표 방법론]: "${standardName}"
[데이터 특성]: "${paperContext.data_characteristics || '일반 데이터'}"

이 방법론에 필요한 Python 패키지와 R 패키지 목록만 JSON으로 출력하세요.
{"packages":{"python":["pandas","numpy"],"r":["dplyr","fixest"]}}`;
}

function buildAgent3CodePrompt(standardName, steps, paperContext, targetLocation) {
  return `당신은 데이터 분석 전문가입니다. Python 코드와 R 코드를 각각 작성하세요.

[방법론]: ${standardName}
[데이터 특성]: ${paperContext.data_characteristics || '일반 데이터'}
[목표 결과물]: ${targetLocation}
[분석 절차]: ${JSON.stringify(steps)}

조건:
1. 데이터 특성을 모방한 Mock 데이터 생성 코드를 최상단에 포함
2. 분석 절차에 따라 모델 피팅 수행
3. 마지막 출력문은 목표 결과물(${targetLocation}) 형태로 출력
4. 코드에 한국어 주석을 포함

반드시 아래 형식으로만 출력하세요:

===PYTHON===
(Python 코드)
===R===
(R 코드)
===END===`;
}

/**
 * Agent 3 실행 — 패키지 목록 + 코드 생성
 * @param {string} apiKey
 * @param {Object} statResult — Agent 2 결과
 * @param {Object} paperContext
 * @param {string} targetLocation
 * @returns {Promise<{ packages: Object, python: string, r: string }>}
 */
export async function runAgent3(apiKey, statResult, paperContext, targetLocation) {
  // 3-1: 패키지 목록 (실패해도 계속 진행)
  let packages = { python: [], r: [] };
  try {
    const metaRaw = await callGemini(
      apiKey,
      buildAgent3MetaPrompt(statResult.standard_name, paperContext),
      API.tokens.agent3Meta
    );
    const metaResult = safeParseJSON(metaRaw);
    packages = metaResult.packages || packages;
  } catch { /* 패키지 파싱 실패는 무시 */ }

  // 3-2: 코드 생성
  const codeRaw = await callGemini(
    apiKey,
    buildAgent3CodePrompt(statResult.standard_name, statResult.steps, paperContext, targetLocation),
    API.tokens.agent3Code
  );

  // 코드 추출은 utils의 extractCode 사용 (main에서 처리)
  return { packages, codeRaw };
}
