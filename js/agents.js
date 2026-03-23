/**
 * agents.js — 에이전트 프롬프트 정의 및 API 호출
 * ResearchMethodAgent v4.0
 */

import { API, MESSAGES } from './config.js';
import { safeParseJSON } from './utils.js';

/* ============================================================
   Gemini API 호출
   ============================================================ */

/** 현재 파이프라인의 AbortController (취소 기능용) */
let _abortController = null;

/**
 * 새 AbortController 생성 (파이프라인 시작 시 호출)
 * @returns {AbortController}
 */
export function createAbortController() {
  _abortController = new AbortController();
  return _abortController;
}

/**
 * 현재 파이프라인 취소
 */
export function abortPipeline() {
  if (_abortController) {
    _abortController.abort();
    _abortController = null;
  }
}

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

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: API.defaultTemp,
          maxOutputTokens: maxTokens,
        },
      }),
      signal: _abortController?.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('파이프라인이 취소되었습니다.');
    throw new Error(`네트워크 오류: ${err.message}`);
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error('API 호출 한도 초과 — 잠시 후 다시 시도해주세요.');
    if (status === 401 || status === 403) throw new Error('API 키가 유효하지 않습니다. 키를 확인해주세요.');
    throw new Error(`API 오류 (HTTP ${status}): ${response.statusText}`);
  }

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
  "section_index": [
    {
      "section": "섹션 제목 (예: I. Introduction, III. Data, IV. Empirical Strategy 등)",
      "summary": "해당 섹션의 핵심 내용 1~2문장 요약",
      "key_tables": ["Table 1", "Figure 2"]
    }
  ],
  "detected_methods": [
    {
      "raw_name": "방법론 명칭 (논문에서 사용한 이름 그대로)",
      "evidence_text": "방법론 언급 발췌 (50자 이내)",
      "target_result_location": "결과 위치 (예: Table 3, Figure 2 등)",
      "source_section": "이 방법론이 설명된 섹션명"
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

function buildAgent3SingleLangPrompt(lang, standardName, steps, paperContext, targetLocation) {
  const langConfig = lang === 'python'
    ? { name: 'Python', libs: 'pandas, numpy, statsmodels, linearmodels, scipy 등', dataGen: 'numpy/pandas' }
    : { name: 'R', libs: 'fixest, plm, AER, dplyr, tidyr 등', dataGen: 'base R / dplyr' };

  return `당신은 ${langConfig.name} 데이터 분석 전문가입니다.
아래 정보를 바탕으로 ${langConfig.name} 코드 하나만 작성하세요.
코드 외의 설명은 일절 쓰지 마세요. 순수 ${langConfig.name} 코드만 출력하세요.

[방법론]: ${standardName}
[학문 분야]: ${paperContext.domain || '사회과학'}
[연구 유형]: ${paperContext.research_type || '실증 연구'}
[데이터 특성]: ${paperContext.data_characteristics || '일반 데이터'}
[목표 결과물]: ${targetLocation}
[분석 절차]: ${JSON.stringify(steps)}

코드 작성 조건:
1. Mock 데이터 생성: 논문의 데이터 구조를 모방한 가상 데이터를 ${langConfig.dataGen}로 생성
   - 변수명은 논문 맥락에 맞는 영문 snake_case
   - 종속변수, 독립변수, 통제변수를 모두 포함
   - 패널/횡단면/시계열 등 데이터 구조를 반영
2. 분석 절차의 모든 단계를 순서대로 구현
3. 결과 출력은 ${targetLocation}와 유사한 테이블 형태로 출력
4. 한국어 주석으로 각 단계를 설명
5. ${langConfig.libs} 사용
6. 코드는 복사해서 바로 실행 가능해야 함 (import/library 포함)

${langConfig.name} 코드만 출력하세요:`;
}

/**
 * 코드 응답에서 순수 코드만 추출 (마크다운 코드블록 제거)
 */
function cleanCodeResponse(raw, lang) {
  let code = raw.trim();
  // ```python ... ``` 또는 ```r ... ``` 제거
  const blockMatch = code.match(new RegExp('```(?:' + lang + ')?\\s*([\\s\\S]*?)```', 'i'));
  if (blockMatch) code = blockMatch[1].trim();
  // 남은 ``` 제거
  code = code.replace(/```/g, '').trim();
  return code || `# ${lang} 코드 생성 실패 — 재시도해주세요`;
}

/**
 * Agent 3 실행 — 패키지 목록 + Python/R 코드 개별 생성
 * @param {string} apiKey
 * @param {Object} statResult — Agent 2 결과
 * @param {Object} paperContext
 * @param {string} targetLocation
 * @returns {Promise<{ packages: Object, pythonCode: string, rCode: string }>}
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

  // 3-2: Python 코드 생성
  let pythonCode = '# Python 코드 생성 실패 — 재시도해주세요';
  try {
    const pyRaw = await callGemini(
      apiKey,
      buildAgent3SingleLangPrompt('python', statResult.standard_name, statResult.steps, paperContext, targetLocation),
      API.tokens.agent3Code
    );
    pythonCode = cleanCodeResponse(pyRaw, 'python');
  } catch (err) {
    pythonCode = `# Python 코드 생성 실패\n# 오류: ${err.message}`;
  }

  // 3-3: R 코드 생성
  let rCode = '# R 코드 생성 실패 — 재시도해주세요';
  try {
    const rRaw = await callGemini(
      apiKey,
      buildAgent3SingleLangPrompt('r', statResult.standard_name, statResult.steps, paperContext, targetLocation),
      API.tokens.agent3Code
    );
    rCode = cleanCodeResponse(rRaw, 'r');
  } catch (err) {
    rCode = `# R 코드 생성 실패\n# 오류: ${err.message}`;
  }

  return { packages, pythonCode, rCode };
}

/* ============================================================
   Agent 5: 대화형 Q&A — 논문 맥락 기반 질의응답
   ============================================================ */

/**
 * 논문 맥락 기반 Q&A
 * @param {string} apiKey
 * @param {string} question — 사용자 질문
 * @param {string} paperText — 논문 전문
 * @param {Object} paperContext — Agent 1의 paper_context
 * @returns {Promise<string>} — 답변 텍스트
 */
export async function runQnA(apiKey, question, paperText, paperContext) {
  const prompt = `당신은 학술 논문 분석 및 실험 설계 전문가입니다. 아래 논문을 기반으로 질문에 답변하세요.

[논문 분야]: ${paperContext.domain || '사회과학'}
[연구 유형]: ${paperContext.research_type || '실증 연구'}
[데이터 특성]: ${paperContext.data_characteristics || '패널 데이터'}

논문 텍스트:
${paperText.substring(0, 20000)}

사용자 질문: ${question}

답변 규칙:
1. 논문에 근거하여 답변하세요. 추측은 명시적으로 "추정"이라고 표기.
2. 관련 테이블이나 섹션이 있으면 "→ Table X 참조", "→ Section Y 참조" 형태로 출처를 표기.
3. 통계 방법론에 대한 질문이면 쉬운 말로 설명 후 수식이나 예시를 포함.
4. 한국어로 답변하세요. 학술 용어는 영문을 병기(괄호).

**What-if 시나리오 지원:**
- 사용자가 "만약 ~을 제거하면?" 또는 "~을 추가하면?" 같은 가정 질문을 하면:
  a) 해당 변경이 모델에 미치는 통계적 영향을 설명 (예: 내생성 문제, 편향 방향)
  b) 예상되는 계수 변화 방향과 이유를 설명
  c) 실제 코드에서 어떤 부분을 수정해야 하는지 간단한 코드 스니펫 제시

**아이디어 실험 지원:**
- 사용자가 새로운 연구 아이디어를 제안하면:
  a) 논문의 기존 프레임워크 내에서 실현 가능성을 평가
  b) 필요한 추가 변수나 데이터 설명
  c) 예상 결과와 해석 방향을 제시
  d) 구현을 위한 코드 수정 방향을 안내

답변은 체계적이되 간결하게 (5~10문장) 작성하세요.`;

  return await callGemini(apiKey, prompt, API.tokens.qna);
}

/* ============================================================
   Agent 6: 분석 결과 해석 가이드
   ============================================================ */

/**
 * 가상 데이터로 분석했을 때의 예상 결과와 해석 가이드 생성
 * @param {string} apiKey
 * @param {Object} methodResult — Agent 2의 분석 결과
 * @param {Object} paperContext
 * @param {string} targetLocation — 목표 테이블
 * @returns {Promise<string>} — 해석 가이드 (마크다운)
 */
export async function runInterpretationGuide(apiKey, methodResult, paperContext, targetLocation) {
  const prompt = `당신은 통계 분석 교육 전문가입니다.

학생이 논문의 "${targetLocation}" 결과를 가상 데이터로 재현했습니다.
이 학생이 결과를 단계별로 이해할 수 있도록, **논문의 실제 결과 구조를 기반으로** 구체적인 해석 가이드를 작성하세요.

[방법론]: ${methodResult.standard_name}
[논문 분야]: ${paperContext.domain || '사회과학'}
[데이터 특성]: ${paperContext.data_characteristics || '패널 데이터'}
[목표 결과]: ${targetLocation}
[분석 절차]: ${JSON.stringify(methodResult.steps)}

아래 5단계로 한국어 가이드를 작성하세요. **일반론이 아닌 이 논문에 특화된 내용**으로 작성하세요:

## Step 1: 결과 테이블 구조 파악
- ${targetLocation}의 열(column)과 행(row) 구조 설명
- 각 열이 의미하는 모델 사양(specification) 설명
- "Model (1)은 ~, Model (2)는 ~를 추가한 것" 형태로 구체적 설명

## Step 2: 핵심 계수(coefficient) 읽기
- 종속변수가 무엇이고, 핵심 독립변수의 계수가 의미하는 것
- "계수 β = X.XX는 [독립변수]가 1단위 증가할 때 [종속변수]가 X.XX만큼 변화함을 의미"
- 괄호 안의 표준오차(SE)와 별표(*)의 유의수준 해석법

## Step 3: 가상 데이터로 테이블/그래프/문서 만들기
- 코드 실행 결과를 논문의 ${targetLocation}과 같은 형태의 테이블로 정리하는 방법
- 주요 결과를 시각화하는 그래프(bar chart, scatter plot 등) 제작 가이드
- 결과를 학술 문서 스타일로 기술하는 방법 (예: "분석 결과, X는 Y에 유의한 양의 영향을 미쳤다(β=..., p<...)")

## Step 4: 원본 논문 결과와 비교 해석
- 가상 데이터 결과가 원본과 다를 수 있는 이유 (데이터 생성 한계)
- 부호(방향), 크기(magnitude), 유의성 중 무엇을 비교해야 하는지
- "결과가 다르다고 실패가 아니다 — 방법론의 원리를 이해하는 것이 목표"

## Step 5: 심화 실습 과제
1. 통제변수를 하나씩 제거하며 계수 변화 관찰 (민감도 분석)
2. 표본을 하위집단으로 나누어 이질적 효과 확인
3. 다른 추정 방법(OLS vs IV 등)으로 결과 비교`;

  return await callGemini(apiKey, prompt, API.tokens.interpretation);
}
