/**
 * simulator.js — Gemini 기반 코드 실행 결과 시뮬레이션
 * ResearchMethodAgent v5.0
 */

import { callGemini } from './agents.js';
import { API } from './config.js';
import { safeParseJSON } from './utils.js';

/**
 * 코드 실행 결과 시뮬레이션
 * @param {string} apiKey
 * @param {string} code - Python or R code
 * @param {string} lang - 'python' or 'r'
 * @param {Object} context - { domain, analysisType, outcome, treatment, dataCharacteristics, descriptiveStats }
 * @returns {Promise<{ table: string, chartDesc: string, interpretation: string, paperComparison: string }>}
 */
export async function simulateExecution(apiKey, code, lang, context) {
  // Build prompt asking Gemini to simulate running the code
  // Include the descriptive stats context so results are realistic
  // Parse response into structured sections using delimiters:
  // ===RESULT_TABLE=== ... ===END_TABLE===
  // ===CHART_DESC=== ... ===END_CHART===
  // ===INTERPRETATION=== ... ===END_INTERPRETATION===
  // ===PAPER_COMPARISON=== ... ===END_COMPARISON===

  const langName = lang === 'python' ? 'Python' : 'R';

  // 이슈 17: 변수 목록을 프롬프트에 포함하여 변수명 일관성 확보
  const varListText = context.variableNames && context.variableNames.length > 0
    ? `\n- 사용 변수 목록 (반드시 이 변수명을 사용하세요): ${context.variableNames.join(', ')}`
    : '';

  const prompt = `당신은 ${langName} 데이터 분석 전문가입니다.
아래 코드를 가상 데이터로 실행했을 때 예상되는 결과를 생성하세요.

[가상 데이터 기술통계]:
${context.descriptiveStats ? JSON.stringify(context.descriptiveStats, null, 2) : '기술통계 정보 없음 — 합리적으로 추정하세요'}

[실행할 ${langName} 코드]:
${code}

[분석 맥락]:
- 논문 분야: ${context.domain || '사회과학'}
- 분석 유형: ${context.analysisType || '미지정'}
- 종속변수: ${context.outcome || '미지정'}
- 핵심 독립변수: ${context.treatment || '미지정'}
- 데이터 특성: ${context.dataCharacteristics || '일반 데이터'}${varListText}

**중요**: 결과 테이블과 해석에서 반드시 위에 명시된 변수명을 그대로 사용하세요. 임의로 변수명을 바꾸지 마세요.

반드시 아래 구분자 형식으로 출력하세요. 각 섹션을 빠짐없이 포함하세요:

===RESULT_TABLE===
마크다운 테이블 형식으로 결과를 출력하세요.
분석 결과 테이블(계수, 표준오차, p-value, 유의수준 별표 등)을 포함하세요.
기술통계라면 변수별 평균, SD, Min, Max 등을 포함하세요.
===END_TABLE===

===CHART_DESC===
이 분석에서 생성되는 핵심 그래프를 설명하세요:
- 그래프 유형 (예: forest plot, event-study plot, 히스토그램 등)
- X축, Y축 설명
- 핵심 패턴 및 시각적 특징
===END_CHART===

===INTERPRETATION===
이 결과의 의미를 한국어로 2~4문장으로 해석하세요.
학술 용어는 영문을 병기(괄호)하세요.
===END_INTERPRETATION===

===PAPER_COMPARISON===
논문에서 보고된 결과와 가상 데이터 결과 간의 예상 차이점을 설명하세요.
"가상 데이터는 실습용이므로 정확한 재현보다 방법론 이해가 목표입니다" 안내를 포함하세요.
===END_COMPARISON===`;

  const raw = await callGemini(apiKey, prompt, 4000);
  return parseSimulationResult(raw);
}

/**
 * 시뮬레이션 응답 파싱
 */
function parseSimulationResult(raw) {
  // 코드펜스 스트리핑 (이슈 16): Gemini가 ```markdown 등으로 감쌀 수 있음
  const stripped = raw.replace(/```[\w]*\n?([\s\S]*?)```/g, '$1');

  const extract = (tag) => {
    const patterns = {
      'RESULT_TABLE': /===RESULT_TABLE===([\s\S]*?)===END_TABLE===/,
      'CHART_DESC': /===CHART_DESC===([\s\S]*?)===END_CHART===/,
      'INTERPRETATION': /===INTERPRETATION===([\s\S]*?)===END_INTERPRETATION===/,
      'PAPER_COMPARISON': /===PAPER_COMPARISON===([\s\S]*?)===END_COMPARISON===/,
    };
    // stripped에서 먼저 시도, 실패하면 raw에서 재시도
    const match = stripped.match(patterns[tag]) || raw.match(patterns[tag]);
    return match ? match[1].trim() : '';
  };

  const result = {
    table: extract('RESULT_TABLE'),
    chartDesc: extract('CHART_DESC'),
    interpretation: extract('INTERPRETATION'),
    paperComparison: extract('PAPER_COMPARISON'),
  };

  // 4-Q: 파싱 강건화 — delimiter 매칭 실패 시 폴백
  // interpretation이 빈데 전체 텍스트에 해석 내용이 있는 경우 복구 시도
  if (!result.interpretation && stripped.length > 100) {
    // 한국어 해석 패턴 탐색: "해석", "의미", "결과는", "시사" 등을 포함하는 문단
    const interpPatterns = [
      /(?:해석|분석 결과|의미|시사점|결론)[:\s]*([\s\S]{30,500}?)(?=\n\n|===|$)/i,
      /(?:이 결과는|분석에 따르면|통계적으로)([\s\S]{30,400}?)(?=\n\n|===|$)/i,
    ];
    for (const pat of interpPatterns) {
      const m = stripped.match(pat);
      if (m) {
        result.interpretation = m[0].trim();
        console.log('[simulator] interpretation 폴백 파싱 성공');
        break;
      }
    }
  }

  // table이 비어있으면 마크다운 테이블 패턴으로 폴백 탐색
  if (!result.table && stripped.includes('|')) {
    const tableMatch = stripped.match(/(\|[\s\S]*?\|[\s\S]*?\n(?:\|[-:| ]+\|\n)?(?:\|[\s\S]*?\|\n?)+)/);
    if (tableMatch) {
      result.table = tableMatch[1].trim();
      console.log('[simulator] table 폴백 파싱 성공');
    }
  }

  // 모든 필드가 빈 경우: 전체 텍스트를 interpretation으로 폴백
  const hasContent = result.table || result.chartDesc || result.interpretation || result.paperComparison;
  if (!hasContent && stripped.length > 50) {
    result.interpretation = stripped.trim();
    console.log('[simulator] 전체 응답을 interpretation으로 폴백');
  }

  return result;
}

/**
 * 대안 방법론 분석 시뮬레이션
 * @param {string} apiKey
 * @param {string} altMethodName - 대안 방법론 이름
 * @param {Object} context - 논문 맥락
 * @param {Object} originalResult - 기존 분석 결과 (비교용)
 * @returns {Promise<{ code: string, table: string, chartDesc: string, interpretation: string, comparison: string }>}
 */
export async function simulateAlternativeMethod(apiKey, altMethodName, context, originalResult) {
  const prompt = `당신은 통계 분석 전문가입니다.

기존 논문이 사용한 방법론 대신 "${altMethodName}" 방법론을 적용하여 분석하는 Python 코드와 예상 결과를 생성하세요.

[논문 맥락]:
- 분야: ${context.domain || '사회과학'}
- 기존 방법론: ${context.originalMethod || '미지정'}
- 데이터 특성: ${context.dataCharacteristics || '일반 데이터'}
- 종속변수: ${context.outcome || '미지정'}
- 핵심 독립변수: ${context.treatment || '미지정'}

[가상 데이터 기술통계]:
${context.descriptiveStats ? JSON.stringify(context.descriptiveStats, null, 2) : '합리적으로 추정하세요'}

반드시 아래 구분자 형식으로 출력하세요:

===ALT_CODE===
Python 코드를 작성하세요. 가상 데이터 생성 → 분석 → 결과 출력을 모두 포함.
===END_ALT_CODE===

===RESULT_TABLE===
예상 분석 결과 테이블 (마크다운)
===END_TABLE===

===CHART_DESC===
핵심 시각화 설명
===END_CHART===

===INTERPRETATION===
결과 해석 (한국어, 2~4문장)
===END_INTERPRETATION===

===COMPARISON===
기존 방법론(${context.originalMethod})과 이 대안 방법론(${altMethodName})의 결과 차이점과 각각의 장단점을 비교 설명하세요.
===END_COMPARISON===`;

  const raw = await callGemini(apiKey, prompt, 6000);

  const codeMatch = raw.match(/===ALT_CODE===([\s\S]*?)===END_ALT_CODE===/);
  const tableMatch = raw.match(/===RESULT_TABLE===([\s\S]*?)===END_TABLE===/);
  const chartMatch = raw.match(/===CHART_DESC===([\s\S]*?)===END_CHART===/);
  const interpMatch = raw.match(/===INTERPRETATION===([\s\S]*?)===END_INTERPRETATION===/);
  const compMatch = raw.match(/===COMPARISON===([\s\S]*?)===END_COMPARISON===/);

  return {
    code: codeMatch ? codeMatch[1].trim() : '# 코드 생성 실패',
    table: tableMatch ? tableMatch[1].trim() : '',
    chartDesc: chartMatch ? chartMatch[1].trim() : '',
    interpretation: interpMatch ? interpMatch[1].trim() : '',
    comparison: compMatch ? compMatch[1].trim() : '',
  };
}

/**
 * Q&A에서 코드 수정 + 결과 시뮬레이션
 */
export async function simulateModifiedAnalysis(apiKey, question, originalCode, context) {
  const prompt = `당신은 통계 분석 전문가이자 교육자입니다.

학생이 아래 분석 코드에 대해 질문했습니다. 질문에 답변하면서, 필요시 코드를 수정하고 수정된 코드의 예상 실행 결과도 제공하세요.

[학생 질문]: ${question}

[기존 분석 코드 (Python)]:
${originalCode.substring(0, 3000)}

[분석 맥락]:
- 분야: ${context.domain || '사회과학'}
- 방법론: ${context.originalMethod || '미지정'}
- 종속변수: ${context.outcome || '미지정'}
- 핵심 독립변수: ${context.treatment || '미지정'}

답변 형식:

===ANSWER===
질문에 대한 답변 (한국어, 학술 용어 영문 병기)
===END_ANSWER===

===MODIFIED_CODE===
(코드 수정이 필요한 경우만) 수정된 Python 코드
수정이 필요 없으면 "수정 불필요"라고 작성
===END_MODIFIED_CODE===

===RESULT_TABLE===
(코드 수정 시) 수정된 코드의 예상 실행 결과 테이블
수정 불필요 시 "해당 없음"
===END_TABLE===

===INTERPRETATION===
(코드 수정 시) 수정된 결과의 해석과 기존 결과와의 차이 설명
===END_INTERPRETATION===`;

  const raw = await callGemini(apiKey, prompt, 4000);

  const answerMatch = raw.match(/===ANSWER===([\s\S]*?)===END_ANSWER===/);
  const codeMatch = raw.match(/===MODIFIED_CODE===([\s\S]*?)===END_MODIFIED_CODE===/);
  const tableMatch = raw.match(/===RESULT_TABLE===([\s\S]*?)===END_TABLE===/);
  const interpMatch = raw.match(/===INTERPRETATION===([\s\S]*?)===END_INTERPRETATION===/);

  return {
    answer: answerMatch ? answerMatch[1].trim() : raw.trim(),
    modifiedCode: codeMatch ? codeMatch[1].trim() : null,
    table: tableMatch ? tableMatch[1].trim() : null,
    interpretation: interpMatch ? interpMatch[1].trim() : null,
  };
}
