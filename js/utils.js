/**
 * utils.js — 유틸리티 함수 모음
 * ResearchMethodAgent v4.0
 */

/**
 * HTML 특수문자 이스케이프 + 줄바꿈을 <br>로 변환
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

/**
 * 안전한 JSON 파싱 (Gemini 응답에서 마크다운/불완전 JSON 처리)
 *
 * 1차: 원본 그대로 파싱
 * 2차: 첫 { ~ 마지막 } 추출 후 파싱 (코드블록 자동 제거)
 * 3차: 괄호 불일치 보정 후 파싱
 *
 * @param {string} raw — Gemini API 응답 원본
 * @returns {Object}
 * @throws {Error}
 */
export function safeParseJSON(raw) {
  const trimmed = raw.trim();

  // 1차: 그대로 파싱
  try {
    return JSON.parse(trimmed);
  } catch (_) { /* fall through */ }

  // 2차: 첫 { ~ 마지막 } 추출
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error(`JSON을 찾을 수 없습니다. 원본:\n${trimmed.substring(0, 300)}...`);
  }

  let sliced = trimmed.slice(start, end + 1);
  try {
    return JSON.parse(sliced);
  } catch (_) { /* fall through */ }

  // 3차: 괄호 보정
  sliced = repairBrackets(sliced);
  try {
    return JSON.parse(sliced);
  } catch (_) {
    throw new Error(`JSON 파싱 실패. 원본:\n${trimmed.substring(0, 300)}...`);
  }
}

/**
 * 괄호 불일치 보정 — 열린 만큼 닫기
 * @param {string} json
 * @returns {string}
 */
function repairBrackets(json) {
  // 마지막 쉼표 제거
  let repaired = json.replace(/,\s*$/, '');

  const openBrackets  = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  const openBraces    = (repaired.match(/\{/g) || []).length;
  const closeBraces   = (repaired.match(/\}/g) || []).length;

  for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
  for (let i = 0; i < openBraces - closeBraces; i++)    repaired += '}';

  return repaired;
}

/**
 * 코드 문자열에서 Python/R 블록 추출
 * 구분자 기반(===PYTHON===) 우선, 없으면 코드블록(```) 폴백
 *
 * @param {string} raw — Agent 3 코드 응답
 * @returns {{ python: string, r: string }}
 */
export function extractCode(raw) {
  const pyMatch = raw.match(/===PYTHON===([\s\S]*?)===R===/i);
  const rMatch  = raw.match(/===R===([\s\S]*?)===END===/i);

  let python = pyMatch
    ? pyMatch[1].trim()
    : (raw.match(/```(?:python)?\s*([\s\S]*?)```/i) || [])[1] || '';

  let r = rMatch
    ? rMatch[1].trim()
    : (raw.match(/```(?:r|R)\s*([\s\S]*?)```/i) || [])[1] || '';

  // 남은 백틱 제거
  python = python.replace(/```/g, '').trim();
  r = r.replace(/```/g, '').trim();

  return {
    python: python || '# 코드 생성 실패 — 재시도해주세요',
    r:      r      || '# 코드 생성 실패 — 재시도해주세요',
  };
}

/**
 * 클립보드에 텍스트 복사
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
