/**
 * apa-renderer.js — APA 7th Edition 스타일 결과 렌더링
 * ResearchMethodAgent v5.0
 *
 * Python 실행 결과(stdout)를 APA 양식의 텍스트, 테이블, 그래프로 변환합니다.
 * - 텍스트: APA 스타일 결과 보고 (이탤릭 통계량, 효과크기 등)
 * - 테이블: APA 7th 3선 구조 (caption 상단, 이탤릭 통계량)
 * - 그래프: APA Figure caption 형식
 */

import { callGemini } from './agents.js';
import { escapeHtml } from './utils.js';

/* ============================================================
   APA 테이블 파싱 & 렌더링
   ============================================================ */

/**
 * Python stdout에서 테이블 데이터를 추출하여 APA 테이블 HTML 생성
 * pandas DataFrame의 출력 형식을 파싱
 *
 * @param {string} stdout — Python stdout 텍스트
 * @param {number} tableNumber — 테이블 번호 (Table 1, Table 2...)
 * @param {string} [caption] — 테이블 제목
 * @returns {string} APA 스타일 HTML 테이블
 */
export function renderApaTable(stdout, tableNumber, caption) {
  // pandas의 일반적 출력 형식 감지 및 파싱
  const tables = extractTablesFromStdout(stdout);
  if (tables.length === 0) return '';

  let html = '';
  for (let i = 0; i < tables.length; i++) {
    const tbl = tables[i];
    const num = tableNumber + i;

    html += '<div class="apa-table-wrap">';

    // APA Table caption (상단, 이탤릭 제목)
    html += `<div class="apa-table-caption">`;
    html += `<div class="apa-table-number">Table ${num}</div>`;
    html += `<div class="apa-table-title">${escapeHtml(tbl.title || caption || 'Analysis Results')}</div>`;
    html += `</div>`;

    // APA 3선 테이블
    html += '<table class="apa-table"><thead>';
    html += '<tr>';
    for (const header of tbl.headers) {
      html += `<th>${formatApaHeader(header)}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (const row of tbl.rows) {
      html += '<tr>';
      for (let j = 0; j < row.length; j++) {
        const isFirstCol = j === 0;
        const cellClass = isFirstCol ? 'apa-row-label' : 'apa-cell-value';
        html += `<td class="${cellClass}">${formatApaCell(row[j])}</td>`;
      }
      html += '</tr>';
    }

    html += '</tbody></table>';

    // APA 테이블 노트 (유의수준)
    html += '<div class="apa-table-note">';
    html += '<em>Note.</em> * <em>p</em> &lt; .05. ** <em>p</em> &lt; .01. *** <em>p</em> &lt; .001.';
    html += '</div>';

    html += '</div>';
  }

  return html;
}

/**
 * stdout 텍스트에서 테이블 구조 추출
 * pandas DataFrame, statsmodels summary 등의 출력 파싱
 */
function extractTablesFromStdout(stdout) {
  const tables = [];
  const lines = stdout.split('\n');

  let currentTitle = '';
  let headerLine = -1;
  let collecting = false;
  let headers = [];
  let rows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 제목 감지 (=== ... ===)
    if (line.startsWith('===') && line.endsWith('===')) {
      if (collecting && rows.length > 0) {
        tables.push({ title: currentTitle, headers, rows: [...rows] });
        rows = [];
        headers = [];
        collecting = false;
      }
      currentTitle = line.replace(/^=+\s*/, '').replace(/\s*=+$/, '');
      continue;
    }

    // 구분선 감지 (--- 또는 빈 줄)
    if (line === '' || /^[-=]+$/.test(line)) {
      if (collecting && rows.length > 0) {
        tables.push({ title: currentTitle, headers, rows: [...rows] });
        rows = [];
        headers = [];
        collecting = false;
      }
      continue;
    }

    // 데이터행 감지 (공백 또는 탭으로 구분된 값)
    const cells = line.split(/\s{2,}|\t/).map(s => s.trim()).filter(Boolean);

    if (cells.length >= 2) {
      if (!collecting) {
        // 첫 번째 데이터행을 헤더로 간주 (숫자가 적으면)
        const numericCount = cells.filter(c => !isNaN(parseFloat(c))).length;
        if (numericCount < cells.length / 2) {
          headers = cells;
          collecting = true;
          continue;
        } else {
          // 인덱스 없는 경우 — 기본 헤더 생성
          headers = cells.map((_, idx) => idx === 0 ? 'Variable' : `Col ${idx}`);
          collecting = true;
        }
      }

      if (collecting) {
        rows.push(cells);
      }
    }
  }

  // 마지막 수집 중인 테이블 저장
  if (collecting && rows.length > 0) {
    tables.push({ title: currentTitle, headers, rows });
  }

  return tables;
}

/**
 * APA 헤더 포맷팅 (통계 약어 이탤릭 처리)
 */
function formatApaHeader(header) {
  // 통계 약어를 이탤릭으로
  return header
    .replace(/\b(M|SD|SE|df|t|F|p|r|R²|β|B|OR|CI|η²|d|n|N|χ²)\b/g, '<em>$1</em>')
    .replace(/R-squared/gi, '<em>R</em>²')
    .replace(/Std\.?\s*Err\.?/gi, '<em>SE</em>')
    .replace(/P>\|[tz]\|/g, '<em>p</em>');
}

/**
 * APA 셀 값 포맷팅
 */
function formatApaCell(value) {
  if (!value && value !== 0) return '';
  const str = String(value).trim();

  // 유의수준 별표 처리
  const numMatch = str.match(/^(-?\d+\.?\d*)\s*(\*{1,3})?$/);
  if (numMatch) {
    const num = parseFloat(numMatch[1]);
    const stars = numMatch[2] || '';

    // p-value 형식: 0 제거 (APA 규정: .05 not 0.05)
    if (Math.abs(num) < 1 && num !== 0) {
      const formatted = num.toFixed(3).replace(/^-?0\./, (m) => m.startsWith('-') ? '-.' : '.');
      return `${formatted}${stars ? `<sup>${stars}</sup>` : ''}`;
    }

    // 일반 숫자: 소수점 2~3자리
    const decimals = str.includes('.') ? Math.min((str.split('.')[1] || '').replace(/\*+$/, '').length, 3) : 0;
    return `${num.toFixed(decimals)}${stars ? `<sup>${stars}</sup>` : ''}`;
  }

  return escapeHtml(str);
}

/* ============================================================
   APA 텍스트 보고 (Gemini 기반)
   ============================================================ */

/**
 * Python 실행 결과를 APA 스타일 텍스트로 변환 (Gemini 호출)
 *
 * @param {string} apiKey
 * @param {string} stdout — Python 실행 결과 stdout
 * @param {Object} context — { stepTitle, analysisType, domain, outcome, treatment }
 * @returns {Promise<{ text: string, tableCaption: string, figureCaption: string }>}
 */
export async function generateApaReport(apiKey, stdout, context) {
  // 분석 프레임워크에 따른 보고 가이드 결정
  const framework = context.framework || 'none';
  let reportGuide = '';

  if (framework === 'mediation' || framework === 'PROCESS' || framework === 'moderated_mediation') {
    reportGuide = `
이 분석은 매개분석/조절된 매개분석입니다. 보고 시 반드시:
- 회귀계수(*B* 또는 *b*)와 표준오차(*SE*), 유의확률(*p*)을 중심으로 보고
- 경로 a, 경로 b, 직접효과(c'), 간접효과(a×b)를 각각 보고
- F값은 전체 모형 적합도일 뿐이므로 핵심 보고 대상이 아님
- 간접효과는 부트스트래핑 95% CI와 함께 보고
- 예: "경로 a에서 X가 M에 미치는 영향은 유의하였다, *B* = .47, *SE* = .06, *p* < .001"`;
  } else if (framework === 'moderation') {
    reportGuide = `
이 분석은 조절분석입니다. 보고 시 반드시:
- 상호작용항의 회귀계수(*B*), *SE*, *p*를 중심으로 보고
- 단순기울기(simple slopes) 결과를 조절변수 수준별로 보고
- ΔR²(상호작용항 추가로 인한 설명력 변화)를 보고`;
  } else if (framework === 'hierarchical_regression') {
    reportGuide = `
이 분석은 위계적 회귀분석입니다. 보고 시 반드시:
- 각 단계별 R², ΔR², F change를 보고
- 핵심 독립변수의 회귀계수(*B* 또는 *β*), *SE*, *p*를 중심으로 보고`;
  } else {
    reportGuide = `
보고 시 반드시:
- 회귀계수(*B* 또는 *β*)와 표준오차(*SE*), *t*값, *p*를 중심으로 보고
- R²는 모형의 설명력으로 보고
- 개별 변수의 효과를 회귀계수 기반으로 해석`;
  }

  const prompt = `당신은 APA 7th Edition 학술 논문 작성 전문가입니다.

아래 Python 분석 실행 결과를 **APA 7th Edition 스타일**로 보고하세요.

[분석 결과 (Python stdout)]:
${stdout.substring(0, 4000)}

[분석 맥락]:
- 분석 단계: ${context.stepTitle || '미지정'}
- 단계 설명: ${context.stepDescription || ''}
- 분석 유형: ${context.analysisType || '미지정'}
- 분석 프레임워크: ${framework}
- 학문 분야: ${context.domain || '사회과학'}
- 종속변수: ${context.outcome || '미지정'}
- 독립변수: ${context.treatment || '미지정'}
${context.mediator ? `- 매개변수: ${context.mediator}` : ''}
${context.moderator ? `- 조절변수: ${context.moderator}` : ''}
${reportGuide}

반드시 아래 구분자 형식으로 출력하세요:

===APA_TEXT===
APA 스타일 결과 보고문을 한국어로 작성하세요.
핵심 규칙:
- **회귀계수(*B*)와 *p*값을 중심으로 보고** — F값은 모형 전체 적합도이므로 부차적
- 통계량은 APA 형식으로: *B* = 0.47, *SE* = 0.06, *t*(498) = 7.83, *p* < .001
- p값이 1 미만이면 0 생략: *p* = .012 (not 0.012)
- 효과크기(R², η² 등) 반드시 포함
- 95% CI 표기: 95% CI [1.23, 4.56]
- 3~5문장으로 핵심 결과를 보고
- stdout의 수치를 정확히 인용 (반올림/변경 금지)
===END_APA_TEXT===

===TABLE_CAPTION===
APA Table caption (한국어)
===END_TABLE_CAPTION===

===FIGURE_CAPTION===
APA Figure caption (한국어)
===END_FIGURE_CAPTION===`;

  try {
    const raw = await callGemini(apiKey, prompt, 2000);
    const result = parseApaReport(raw);
    if (!result.text) {
      console.warn('[APA] 파싱 결과 비어있음. raw 응답:', raw?.substring(0, 200));
    }
    return result;
  } catch (err) {
    console.error('[APA] 보고서 생성 실패:', err);
    return { text: '', tableCaption: '', figureCaption: '' };
  }
}

function parseApaReport(raw) {
  const extract = (start, end) => {
    const regex = new RegExp(`${start}([\\s\\S]*?)${end}`);
    const match = raw.match(regex);
    return match ? match[1].trim() : '';
  };

  let text = extract('===APA_TEXT===', '===END_APA_TEXT===');
  const tableCaption = extract('===TABLE_CAPTION===', '===END_TABLE_CAPTION===');
  const figureCaption = extract('===FIGURE_CAPTION===', '===END_FIGURE_CAPTION===');

  // 구분자 파싱 실패 시 전체 응답을 APA 텍스트로 사용 (fallback)
  if (!text && raw && raw.length > 20) {
    // 코드펜스 제거
    let cleaned = raw.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();
    // 구분자 태그 제거
    cleaned = cleaned.replace(/===\w+===/g, '').trim();
    if (cleaned.length > 10) {
      text = cleaned;
    }
  }

  return { text, tableCaption, figureCaption };
}

/* ============================================================
   APA Figure Caption 렌더링
   ============================================================ */

/**
 * 그래프 이미지에 APA Figure caption을 추가하여 렌더링
 *
 * @param {string[]} images — base64 PNG 이미지 배열
 * @param {number} figureStartNumber — Figure 번호 시작값
 * @param {string} [captionText] — Gemini가 생성한 Figure caption
 * @returns {string} HTML
 */
export function renderApaFigures(images, figureStartNumber, captionText) {
  if (!images || images.length === 0) return '';

  let html = '';
  const captions = captionText ? captionText.split('\n').filter(Boolean) : [];

  for (let i = 0; i < images.length; i++) {
    const figNum = figureStartNumber + i;
    const caption = captions[i] || `Figure ${figNum}. Analysis result.`;

    html += '<div class="apa-figure-wrap">';
    html += `<div class="apa-figure-img-wrap">`;
    html += `<img src="data:image/png;base64,${images[i]}" alt="Figure ${figNum}" class="apa-figure-img" />`;
    html += `</div>`;
    html += `<div class="apa-figure-caption">`;
    html += `<span class="apa-figure-label"><em>Figure ${figNum}</em>. </span>`;
    html += escapeHtml(caption.replace(/^Figure\s*\d+\.?\s*/i, ''));
    html += `</div>`;
    html += '</div>';
  }

  return html;
}

/* ============================================================
   APA 스타일 텍스트 렌더링 (이탤릭 변환)
   ============================================================ */

/**
 * APA 텍스트의 *이탤릭* 마크업을 HTML <em>으로 변환
 * @param {string} text
 * @returns {string} HTML
 */
export function renderApaText(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // *text* → <em>text</em> (APA 통계 기호 이탤릭)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 단락 처리
  html = html.split('\n\n').map(p => `<p>${p.trim()}</p>`).join('');
  html = html.replace(/\n/g, '<br>');

  return html;
}
