/* ============================================================================
   ResearchMethodAgent v5.0 - UI Module
   ============================================================================
   역할: HTML 요소 관리, 사용자 상호작용 처리, 분석 결과 렌더링
   - 4개 탭 전환 (논문개요, 실습, 리뷰, Q&A)
   - 로딩 상태 업데이트
   - PDF 업로드 및 분석 파이프라인 UI
   ============================================================================ */

import { generateMockData, computeStats, downloadCSV } from './mockdata.js';
import {
  loadAnalysisSteps,
  executeStep,
  loadReview,
  sendQnA,
  getState,
  getMethods,
  getDataStructure,
  getPaperContext,
  getPaperText
} from './pipeline.js';
import { escapeHtml, copyToClipboard } from './utils.js';
import { initPyodide, runPython, isPyodideReady } from './pyodide-runner.js';
import {
  renderApaTable,
  renderApaFigures,
  renderApaText,
  generateApaReport,
} from './apa-renderer.js';

/* ============================================================================
   DOM 헬퍼 & 상태 관리
   ============================================================================ */

const $ = (id) => document.getElementById(id);
let currentMethodIndex = 0;
let currentLanguage = 'python';
let mockDataCache = null;
/** @type {boolean} Pyodide 초기화 중 여부 */
let pyodideInitializing = false;

/* ============================================================================
   뷰 전환 함수 (UI 표시/숨김)
   ============================================================================ */

export function showLoadingView() {
  // 설정 카드 숨김
  const configCard = $('config-card');
  if (configCard) configCard.style.display = 'none';

  // 입력 카드 숨김
  const inputCard = $('input-card');
  if (inputCard) inputCard.style.display = 'none';

  // 로딩 카드 표시
  const loadingCard = $('loading-card');
  if (loadingCard) loadingCard.style.display = 'block';

  // 결과 영역 숨김
  const resultWrap = $('result-wrap');
  if (resultWrap) resultWrap.style.display = 'none';
}

export function showInputView() {
  // 설정 카드 표시
  const configCard = $('config-card');
  if (configCard) configCard.style.display = 'block';

  // 입력 카드 표시
  const inputCard = $('input-card');
  if (inputCard) inputCard.style.display = 'block';

  // 로딩 카드 숨김
  const loadingCard = $('loading-card');
  if (loadingCard) loadingCard.style.display = 'none';

  // 결과 영역 숨김
  const resultWrap = $('result-wrap');
  if (resultWrap) resultWrap.style.display = 'none';
}

export function showResultView() {
  // 설정 카드 숨김
  const configCard = $('config-card');
  if (configCard) configCard.style.display = 'none';

  // 입력 카드 숨김
  const inputCard = $('input-card');
  if (inputCard) inputCard.style.display = 'none';

  // 로딩 카드 숨김
  const loadingCard = $('loading-card');
  if (loadingCard) loadingCard.style.display = 'none';

  // 결과 영역 표시
  const resultWrap = $('result-wrap');
  if (resultWrap) resultWrap.style.display = 'block';
}

/* ============================================================================
   로딩 상태 업데이트
   ============================================================================ */

export function updateLoadingStep(stepIndex, status) {
  // status: 'running' | 'done'
  const steps = document.querySelectorAll('.loading-step');
  if (steps.length > stepIndex) {
    const step = steps[stepIndex];
    const icon = step.querySelector('.loading-step-icon');
    if (status === 'running') {
      step.classList.add('running');
      step.classList.remove('done');
      if (icon) icon.textContent = '⏳';
    } else if (status === 'done') {
      step.classList.remove('running');
      step.classList.add('done');
      if (icon) icon.textContent = '✅';
    }
  }
}

export function setLoadingMessage(message) {
  const msgEl = $('loading-message');
  if (msgEl) msgEl.textContent = message;
}

export function showStatus(message) {
  // 간단한 상태 메시지 표시 (alert 또는 알림 div)
  alert(message);
}

/* ============================================================================
   PDF 업로드 관련 UI
   ============================================================================ */

export function showPdfFileName(name) {
  const fileNameEl = $('file-name');
  if (fileNameEl) fileNameEl.textContent = name;
}

export function showPdfProgress(message) {
  const fileNameEl = $('file-name');
  if (fileNameEl) fileNameEl.textContent = message;
}

export function showPdfSuccess(pages, sizeKB) {
  const fileNameEl = $('file-name');
  if (fileNameEl) {
    // sizeKB가 1024 이상이면 MB로 표시
    const sizeStr = sizeKB >= 1024
      ? `${(sizeKB / 1024).toFixed(1)}MB`
      : `${sizeKB}KB`;
    fileNameEl.textContent = `✅ 준비 완료: ${pages}페이지, ${sizeStr}`;
  }
}

export function showPdfError(message) {
  const fileNameEl = $('file-name');
  if (fileNameEl) {
    fileNameEl.textContent = `❌ 오류: ${message}`;
    fileNameEl.style.color = '#e74c3c';
  }
}

/* ============================================================================
   초기 결과 렌더링 (Tab 1: 논문 개요 & 데이터 구조)
   ============================================================================ */

export function renderInitialResult(docResult, dataStructure) {
  try {
    const meta = docResult.metadata || {};
    const ctx = docResult.paper_context || {};

    // 논문 정보 렌더링
    const titleEl = $('r-title');
    const metaEl = $('r-meta');
    const contextEl = $('r-context');

    if (titleEl) titleEl.textContent = meta.title || '논문 제목';
    if (metaEl) metaEl.textContent = meta.summary || '';

    // 컨텍스트 태그
    if (contextEl) {
      let ctxHtml = '';
      if (ctx.domain)               ctxHtml += `<span class="context-tag">📚 ${escapeHtml(ctx.domain)}</span>`;
      if (ctx.research_type)        ctxHtml += `<span class="context-tag">🔬 ${escapeHtml(ctx.research_type)}</span>`;
      if (ctx.data_characteristics) ctxHtml += `<span class="context-tag">📊 ${escapeHtml(ctx.data_characteristics)}</span>`;
      if (ctx.analysis_category)    ctxHtml += `<span class="context-tag">🏷️ ${escapeHtml(ctx.analysis_category)}</span>`;
      if (ctx.category_evidence)    ctxHtml += `<span class="context-tag context-tag-evidence" title="${escapeHtml(ctx.category_evidence)}">📌 ${escapeHtml(ctx.category_evidence)}</span>`;
      contextEl.innerHTML = ctxHtml;
    }

    // 섹션 인덱스 렌더링
    renderSectionIndex(docResult.section_index || []);

    // 데이터 구조 카드 렌더링
    renderDataStructureCard(dataStructure);

    // 메소드 네비게이션 렌더링
    renderMethodNav();

    // 메소드 선택 핸들러 설정
    setupMethodNavHandlers();

    // 탭 전환 핸들러 설정
    setupTabHandlers();

    // 언어 선택 핸들러 설정
    setupLanguageToggleHandlers();

    // Q&A 입력 핸들러 설정
    setupQnAHandlers();

    // 홈 링크 핸들러
    setupHomeLink();

    // Mock 데이터 생성 핸들러
    setupMockDataGeneration();

    // 리뷰 핸들러
    setupReviewHandlers();

    showResultView();

    // === 자동 데이터 생성: dataStructure가 있으면 바로 500행 생성 ===
    if (dataStructure && dataStructure.variables && dataStructure.variables.length > 0) {
      try {
        mockDataCache = generateMockData(dataStructure, 500);
        const statusEl = $('mockdata-status');
        if (statusEl) {
          statusEl.innerHTML = `<p style="color: #27ae60;">✅ 데이터 자동 생성 완료 (${mockDataCache.data.length}행 × ${mockDataCache.variables.length}변수)</p>`;
        }
        const downloadBtn = $('download-csv-btn');
        if (downloadBtn) downloadBtn.style.display = 'inline-block';
        renderDataPreview(mockDataCache.data, mockDataCache.variables);
        renderVariableTable(mockDataCache.variables);
      } catch (autoErr) {
        console.warn('자동 데이터 생성 실패 (수동 생성 가능):', autoErr.message);
      }
    }
  } catch (error) {
    console.error('초기 결과 렌더링 중 오류:', error);
    showStatus('결과 렌더링 중 오류가 발생했습니다.');
  }
}

/* ============================================================================
   섹션 인덱스 렌더링
   ============================================================================ */

function renderSectionIndex(sections) {
  const indexWrap = $('section-index');
  if (!indexWrap) return;

  if (!sections || sections.length === 0) {
    indexWrap.innerHTML = '<p>섹션 정보를 찾을 수 없습니다.</p>';
    return;
  }

  let html = '<div class="section-title">📑 논문 구조</div>';
  sections.forEach(sec => {
    const tables = (sec.key_tables || []).map(t => `<span class="pkg">${escapeHtml(t)}</span>`).join(' ');
    html += `
      <div class="index-item">
        <div class="index-section">${escapeHtml(sec.section || '')}</div>
        <div class="index-summary">${escapeHtml(sec.summary || '')}</div>
        ${tables ? `<div class="index-tables">${tables}</div>` : ''}
      </div>`;
  });

  indexWrap.innerHTML = html;
}

/* ============================================================================
   데이터 구조 카드 렌더링
   ============================================================================ */

function renderDataStructureCard(dataStructure) {
  if (!dataStructure) {
    const descEl = $('data-structure-desc');
    if (descEl) descEl.innerHTML = '<p class="text-muted">데이터 구조를 추출하지 못했습니다.</p>';
    return;
  }

  const descEl = $('data-structure-desc');
  if (descEl) {
    let descHtml = '';
    if (dataStructure.data_description) {
      descHtml += `<p>${escapeHtml(dataStructure.data_description)}</p>`;
    }
    if (dataStructure.structure_diagram) {
      descHtml += `<div class="structure-diagram"><code>${escapeHtml(dataStructure.structure_diagram)}</code></div>`;
    }
    if (dataStructure.sample_info) {
      const si = dataStructure.sample_info;
      const infoParts = [];
      if (si.n_obs)      infoParts.push(`관측치: ${si.n_obs}`);
      if (si.n_entities) infoParts.push(`개체: ${si.n_entities}`);
      if (si.n_periods)  infoParts.push(`기간: ${si.n_periods}`);
      if (si.time_range) infoParts.push(`기간: ${si.time_range}`);
      if (infoParts.length > 0) {
        descHtml += `<div class="sample-info">${infoParts.map(p => `<span class="info-badge">${escapeHtml(p)}</span>`).join(' ')}</div>`;
      }
    }
    if (dataStructure.limitations) {
      descHtml += `<div class="data-limitations">⚠️ ${escapeHtml(dataStructure.limitations)}</div>`;
    }
    descEl.innerHTML = descHtml;
  }

  // 변수 테이블 (Agent 4+ 형식: name_kr, name_en, role, type, mean, sd, min, max)
  renderVariableTable(dataStructure.variables || []);
}

function renderVariableTable(variables) {
  const wrapEl = $('variable-table-wrap');
  if (!wrapEl) return;

  if (!variables || variables.length === 0) {
    wrapEl.innerHTML = '<p class="text-muted">변수 정보 없음</p>';
    return;
  }

  let html = '<table class="variable-table"><thead><tr>';
  html += '<th>변수명(한)</th><th>변수명(영)</th><th>역할</th><th>유형</th><th>평균</th><th>SD</th><th>Min</th><th>Max</th>';
  html += '</tr></thead><tbody>';

  variables.forEach(v => {
    const est = v._estimated ? ' title="추정값 (논문에서 추출 불가)"' : '';
    const estStyle = v._estimated ? ' style="color: #7f8c8d; font-style: italic;"' : '';
    html += '<tr>';
    html += `<td>${escapeHtml(v.name_kr || '')}</td>`;
    html += `<td><code>${escapeHtml(v.name_en || '')}</code></td>`;
    html += `<td><span class="role-badge role-${(v.role || '').replace(/\s/g, '')}">${escapeHtml(v.role || '')}</span></td>`;
    html += `<td>${escapeHtml(v.type || '')}</td>`;
    html += `<td${est}${estStyle}>${v.mean != null ? escapeHtml(String(v.mean)) + (v._estimated ? '~' : '') : '—'}</td>`;
    html += `<td${est}${estStyle}>${v.sd != null ? escapeHtml(String(v.sd)) + (v._estimated ? '~' : '') : '—'}</td>`;
    html += `<td${est}${estStyle}>${v.min != null ? escapeHtml(String(v.min)) + (v._estimated ? '~' : '') : '—'}</td>`;
    html += `<td${est}${estStyle}>${v.max != null ? escapeHtml(String(v.max)) + (v._estimated ? '~' : '') : '—'}</td>`;
    html += '</tr>';
  });

  html += '</tbody></table>';
  wrapEl.innerHTML = html;
}

/* ============================================================================
   메소드 네비게이션 렌더링
   ============================================================================ */

function renderMethodNav() {
  const navEl = $('method-nav');
  if (!navEl) return;

  const methods = getMethods();
  if (!methods || methods.length === 0) {
    navEl.innerHTML = '';
    return;
  }

  let html = '<div class="method-nav-container">';
  methods.forEach((method, idx) => {
    const activeClass = idx === 0 ? 'active' : '';
    html += `<button class="method-nav-btn ${activeClass}" data-method-idx="${idx}">`;
    html += escapeHtml(method.raw_name || `방법 ${idx + 1}`);
    html += '</button>';
  });
  html += '</div>';

  navEl.innerHTML = html;
}

/* ============================================================================
   탭 전환 핸들러 설정
   ============================================================================ */

function setupTabHandlers() {
  // 결과 탭 전환
  const tabBtns = document.querySelectorAll('.result-tab');
  const panels = document.querySelectorAll('.result-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.getAttribute('data-panel');

      // 기존 활성 탭 비활성화
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      // 선택된 탭 활성화
      btn.classList.add('active');
      const targetPanel = $(`panel-${panelId}`);
      if (targetPanel) {
        targetPanel.classList.add('active');

        // Tab 2 (practice) 클릭 시 분석 스텝 로드
        if (panelId === 'practice') {
          loadAndRenderAnalysisSteps(currentMethodIndex);
        }

        // Tab 3 (review) 클릭 시 리뷰 & 대안 버튼 표시
        if (panelId === 'review') {
          // 버튼은 이미 HTML에 있음
        }
      }
    });
  });
}

/* ============================================================================
   메소드 네비게이션 핸들러
   ============================================================================ */

function setupMethodNavHandlers() {
  const methodBtns = document.querySelectorAll('.method-nav-btn');
  methodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const methodIdx = parseInt(btn.getAttribute('data-method-idx'), 10);
      currentMethodIndex = methodIdx;

      // 활성 버튼 업데이트
      methodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 현재 탭이 practice 또는 review라면 리로드
      const currentPanel = document.querySelector('.result-panel.active');
      if (currentPanel) {
        const panelId = currentPanel.getAttribute('id');
        if (panelId === 'panel-practice') {
          loadAndRenderAnalysisSteps(methodIdx);
        } else if (panelId === 'panel-review') {
          // 리뷰도 메소드에 따라 바뀌므로 리로드 필요
          clearReviewSections();
        }
      }
    });
  });
}

/* ============================================================================
   언어 토글 핸들러 (Python/R)
   ============================================================================ */

function setupLanguageToggleHandlers() {
  const langBtns = document.querySelectorAll('.code-lang-tab');
  langBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      currentLanguage = lang;

      // 활성 버튼 업데이트
      langBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 현재 탭이 practice라면 코드 업데이트
      const practicePanel = $('panel-practice');
      if (practicePanel && practicePanel.classList.contains('active')) {
        updatePracticeStepsForLanguage(lang);
      }
    });
  });
}

/* ============================================================================
   분석 스텝 로드 및 렌더링 (Tab 2)
   ============================================================================ */

async function loadAndRenderAnalysisSteps(methodIndex) {
  try {
    const stepsContainer = $('practice-steps');
    if (!stepsContainer) return;

    // 로딩 표시
    stepsContainer.innerHTML = '<div class="loading-text">분석 스텝 로드 중...</div>';

    const result = await loadAnalysisSteps(methodIndex);
    if (!result || !result.steps) {
      stepsContainer.innerHTML = '<p>분석 스텝을 찾을 수 없습니다.</p>';
      return;
    }

    // 스텝 카드 렌더링
    let html = '';
    result.steps.forEach((step, idx) => {
      html += renderStepCard(step, idx, methodIndex);
    });

    stepsContainer.innerHTML = html;

    // 실행 버튼 핸들러 설정
    setupStepExecutionHandlers(methodIndex);
  } catch (error) {
    console.error('분석 스텝 로드 오류:', error);
    const stepsContainer = $('practice-steps');
    if (stepsContainer) {
      stepsContainer.innerHTML = '<p>오류: 분석 스텝을 로드할 수 없습니다.</p>';
    }
  }
}

function renderStepCard(step, stepIdx, methodIndex) {
  const stepId = step.id || `step-${stepIdx}`;
  const lang = currentLanguage;
  const code = (step.codeTemplate && step.codeTemplate[lang]) || step[`code_${lang}`] || step.code || '';

  let html = `<div class="step-card" data-step-idx="${stepIdx}" data-step-id="${stepId}">`;
  html += `<div class="step-header">`;
  html += `<h3 class="step-title">${escapeHtml(step.title || `Step ${stepIdx + 1}`)}</h3>`;
  html += `</div>`;

  if (step.description) {
    html += `<div class="step-description">`;
    html += markdownToHtml(step.description);
    html += `</div>`;
  }

  // 코드 블록 (접을 수 있음)
  html += `<div class="step-code-section">`;
  html += `<button class="code-toggle" data-step-idx="${stepIdx}">💻 코드 보기</button>`;
  html += `<pre class="code-block" data-step-idx="${stepIdx}" style="display:none;">`;
  html += `<code>${escapeHtml(code)}</code>`;
  html += `</pre>`;
  html += `</div>`;

  // 실행 버튼 영역
  html += `<div class="step-action-buttons">`;
  if (lang === 'python') {
    html += `<button class="btn-run-python" data-step-idx="${stepIdx}" data-step-id="${stepId}">🐍 Python 실행</button>`;
  }
  html += `<button class="btn-execute" data-step-idx="${stepIdx}" data-step-id="${stepId}">🤖 AI 시뮬레이션</button>`;
  html += `</div>`;

  // Pyodide 상태 표시 영역
  html += `<div class="pyodide-status" data-step-idx="${stepIdx}" style="display:none;"></div>`;

  // 결과 영역 (처음에는 숨김)
  html += `<div class="step-result" data-step-idx="${stepIdx}" style="display:none; margin-top: 10px;">`;
  html += `</div>`;

  html += `</div>`;
  return html;
}

function setupStepExecutionHandlers(methodIndex) {
  // 코드 토글 핸들러
  const codeToggles = document.querySelectorAll('.code-toggle');
  codeToggles.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const stepIdx = btn.getAttribute('data-step-idx');
      const codeBlock = document.querySelector(`.code-block[data-step-idx="${stepIdx}"]`);
      if (codeBlock) {
        const isHidden = codeBlock.style.display === 'none';
        codeBlock.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden ? '💻 코드 숨기기' : '💻 코드 보기';
      }
    });
  });

  // AI 시뮬레이션 버튼 핸들러
  const executeButtons = document.querySelectorAll('.btn-execute');
  executeButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const stepIdx = parseInt(btn.getAttribute('data-step-idx'), 10);
      const stepId = btn.getAttribute('data-step-id');
      const lang = currentLanguage;

      const codeBlock = document.querySelector(`.code-block[data-step-idx="${stepIdx}"]`);
      const code = codeBlock ? codeBlock.textContent : '';

      await executeAnalysisStep(methodIndex, stepId, code, lang, stepIdx);
    });
  });

  // 🐍 Python 실행 버튼 핸들러
  const pythonButtons = document.querySelectorAll('.btn-run-python');
  pythonButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const stepIdx = parseInt(btn.getAttribute('data-step-idx'), 10);

      const codeBlock = document.querySelector(`.code-block[data-step-idx="${stepIdx}"]`);
      const code = codeBlock ? codeBlock.textContent : '';

      await executePythonStep(code, stepIdx);
    });
  });
}

async function executeAnalysisStep(methodIndex, stepId, code, lang, stepIdx) {
  try {
    const resultDiv = document.querySelector(`.step-result[data-step-idx="${stepIdx}"]`);
    if (!resultDiv) return;

    resultDiv.innerHTML = '<div class="loading-text">실행 중...</div>';
    resultDiv.style.display = 'block';

    const result = await executeStep(methodIndex, stepId, code, lang);

    // 결과 렌더링
    let resultHtml = '<div class="step-execution-result">';

    if (result.table) {
      resultHtml += '<div class="result-subsection"><h4>📊 결과 테이블</h4>';
      resultHtml += renderResultTable(result.table);
      resultHtml += '</div>';
    }

    if (result.chartDesc) {
      resultHtml += '<div class="result-subsection"><h4>📈 차트 설명</h4>';
      resultHtml += `<p>${escapeHtml(result.chartDesc)}</p>`;
      resultHtml += '</div>';
    }

    if (result.interpretation) {
      resultHtml += '<div class="result-subsection"><h4>🔍 해석</h4>';
      resultHtml += markdownToHtml(result.interpretation);
      resultHtml += '</div>';
    }

    if (result.paperComparison) {
      resultHtml += '<div class="result-subsection"><h4>📄 논문 비교</h4>';
      resultHtml += markdownToHtml(result.paperComparison);
      resultHtml += '</div>';
    }

    resultHtml += '</div>';
    resultDiv.innerHTML = resultHtml;
  } catch (error) {
    console.error('스텝 실행 오류:', error);
    const resultDiv = document.querySelector(`.step-result[data-step-idx="${stepIdx}"]`);
    if (resultDiv) {
      resultDiv.innerHTML = `<p style="color: #e74c3c;">오류: ${escapeHtml(error.message)}</p>`;
      resultDiv.style.display = 'block';
    }
  }
}

/**
 * Python 코드를 Pyodide로 실제 실행
 * @param {string} code — Python 코드
 * @param {number} stepIdx — Step 인덱스 (결과 렌더링 위치)
 */
async function executePythonStep(code, stepIdx) {
  const resultDiv = document.querySelector(`.step-result[data-step-idx="${stepIdx}"]`);
  const statusDiv = document.querySelector(`.pyodide-status[data-step-idx="${stepIdx}"]`);
  if (!resultDiv) return;

  // Pyodide 초기화 (최초 1회)
  if (!isPyodideReady() && !pyodideInitializing) {
    pyodideInitializing = true;
    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = '<div class="pyodide-loading">🐍 Python 환경 로딩 중... (최초 1회, 약 5~10초)</div>';
    }
    try {
      await initPyodide((msg) => {
        if (statusDiv) statusDiv.innerHTML = `<div class="pyodide-loading">${escapeHtml(msg)}</div>`;
      });
    } catch (err) {
      if (statusDiv) {
        statusDiv.innerHTML = `<div class="pyodide-error">❌ Python 환경 로드 실패: ${escapeHtml(err.message)}</div>`;
      }
      pyodideInitializing = false;
      return;
    }
    pyodideInitializing = false;
    if (statusDiv) statusDiv.style.display = 'none';
  } else if (pyodideInitializing) {
    // 이미 초기화 중이면 대기
    resultDiv.innerHTML = '<div class="loading-text">Python 환경 로딩 대기 중...</div>';
    resultDiv.style.display = 'block';
    return;
  }

  // 실행 중 UI
  resultDiv.innerHTML = '<div class="loading-text">🐍 Python 코드 실행 중...</div>';
  resultDiv.style.display = 'block';

  try {
    // CSV 데이터 준비 — 없으면 자동 생성 시도
    let csvData = mockDataCache ? mockDataCache.csv : null;
    if (!csvData) {
      const ds = getDataStructure();
      if (ds && ds.variables && ds.variables.length > 0) {
        try {
          mockDataCache = generateMockData(ds, 500);
          csvData = mockDataCache.csv;
          const statusEl = $('mockdata-status');
          if (statusEl) statusEl.innerHTML = `<p style="color: #27ae60;">✅ 실습용 데이터 자동 생성 (${mockDataCache.data.length}행 × ${mockDataCache.variables.length}변수)</p>`;
        } catch (autoErr) {
          console.warn('자동 데이터 생성 실패:', autoErr.message);
        }
      }
    }
    if (!csvData) {
      resultDiv.innerHTML = '<div class="pyodide-error">⚠️ 먼저 "논문 개요 & 데이터" 탭에서 🧪 실습 데이터 생성 버튼을 눌러주세요.<br><small>또는 내 CSV 파일을 업로드할 수 있습니다.</small></div>';
      return;
    }

    // 실행
    const result = await runPython(code, csvData);

    // 결과 렌더링
    let html = '<div class="python-execution-result">';
    html += '<div class="result-badge python-badge">🐍 Python 실행 결과</div>';

    // stdout 출력
    if (result.stdout && result.stdout.trim()) {
      html += '<div class="result-subsection">';
      html += '<h4>📋 출력 (stdout)</h4>';
      html += `<pre class="python-stdout">${escapeHtml(result.stdout)}</pre>`;
      html += '</div>';

      // APA 테이블 자동 변환
      const apaTableHtml = renderApaTable(result.stdout, 1);
      if (apaTableHtml) {
        html += '<div class="result-subsection">';
        html += '<h4>📑 APA Style Table</h4>';
        html += apaTableHtml;
        html += '</div>';
      }
    }

    // 그래프 이미지 (APA Figure 스타일)
    if (result.images && result.images.length > 0) {
      html += '<div class="result-subsection">';
      html += `<h4>📊 APA Figure (${result.images.length}개)</h4>`;
      html += renderApaFigures(result.images, 1);
      html += '</div>';
    }

    // 에러 (부분 실행 성공 + 에러)
    if (result.error) {
      html += '<div class="result-subsection">';
      html += '<h4>⚠️ 오류</h4>';
      html += `<pre class="python-error">${escapeHtml(result.error)}</pre>`;
      html += '</div>';
    }

    // 출력이 전혀 없을 때
    if ((!result.stdout || !result.stdout.trim()) && (!result.images || result.images.length === 0) && !result.error) {
      html += '<div class="result-subsection"><p>코드가 실행되었으나 출력이 없습니다.</p></div>';
    }

    // APA 보고서 생성 버튼 (stdout이 있을 때만)
    if (result.stdout && result.stdout.trim() && !result.error) {
      html += `<div class="apa-report-action">`;
      html += `<button class="btn-apa-report" data-step-idx="${stepIdx}">📝 APA 스타일 해석 보고서 생성</button>`;
      html += `</div>`;
      html += `<div class="apa-report-result" data-step-idx="${stepIdx}" style="display:none;"></div>`;
    }

    html += '</div>';
    resultDiv.innerHTML = html;

    // APA 보고서 생성 버튼 이벤트 바인딩
    const apaBtn = resultDiv.querySelector(`.btn-apa-report[data-step-idx="${stepIdx}"]`);
    if (apaBtn) {
      apaBtn.addEventListener('click', async () => {
        await generateAndRenderApaReport(stepIdx, result.stdout, result.images);
      });
    }
  } catch (error) {
    console.error('Python 실행 오류:', error);
    resultDiv.innerHTML = `<div class="pyodide-error">❌ 실행 오류: ${escapeHtml(error.message)}</div>`;
  }
}

/**
 * APA 스타일 해석 보고서 생성 (Gemini 호출)
 * @param {number} stepIdx
 * @param {string} stdout — Python 실행 결과
 * @param {string[]} images — 그래프 이미지 (base64)
 */
async function generateAndRenderApaReport(stepIdx, stdout, images) {
  const reportDiv = document.querySelector(`.apa-report-result[data-step-idx="${stepIdx}"]`);
  if (!reportDiv) return;

  reportDiv.style.display = 'block';
  reportDiv.innerHTML = '<div class="loading-text">📝 APA 스타일 보고서 생성 중...</div>';

  try {
    const state = getState();
    const apiKey = state.apiKey;
    const methods = getMethods();
    const paperContext = getPaperContext();
    const currentMethod = methods[currentMethodIndex] || {};

    const context = {
      stepTitle: document.querySelector(`.step-card[data-step-idx="${stepIdx}"] .step-title`)?.textContent || '',
      analysisType: currentMethod.analysis_type || '',
      domain: paperContext?.domain || '',
      outcome: currentMethod.key_variables?.outcome || '',
      treatment: currentMethod.key_variables?.treatment || '',
    };

    const apa = await generateApaReport(apiKey, stdout, context);

    let html = '<div class="apa-report-content">';
    html += '<div class="result-badge apa-badge">📝 APA 7th Edition 결과 보고서</div>';

    // APA 텍스트 보고
    if (apa.text) {
      html += '<div class="apa-text-section">';
      html += '<h4>결과 보고 (Results)</h4>';
      html += `<div class="apa-report-text">${renderApaText(apa.text)}</div>`;
      html += '</div>';
    }

    // APA Figure caption 업데이트
    if (apa.figureCaption && images && images.length > 0) {
      html += '<div class="apa-text-section">';
      html += '<h4>Figure Caption</h4>';
      html += renderApaFigures(images, 1, apa.figureCaption);
      html += '</div>';
    }

    // Table caption
    if (apa.tableCaption) {
      html += '<div class="apa-text-section">';
      html += `<p class="apa-table-caption-text"><em>Table caption:</em> ${escapeHtml(apa.tableCaption)}</p>`;
      html += '</div>';
    }

    html += '</div>';
    reportDiv.innerHTML = html;
  } catch (error) {
    console.error('APA 보고서 생성 오류:', error);
    reportDiv.innerHTML = `<div class="pyodide-error">APA 보고서 생성 실패: ${escapeHtml(error.message)}</div>`;
  }
}

function updatePracticeStepsForLanguage(lang) {
  // 언어 변경 시 전체 스텝을 다시 렌더링 (코드 템플릿이 언어별로 다름)
  loadAndRenderAnalysisSteps(currentMethodIndex);
}

/**
 * 결과 테이블 렌더링 — 마크다운 테이블 문자열을 HTML로 변환
 * simulator.js가 마크다운 테이블 형식으로 반환하므로 문자열을 파싱
 * @param {string|Array} tableData — 마크다운 테이블 문자열 또는 객체 배열
 * @returns {string} HTML
 */
function renderResultTable(tableData) {
  if (!tableData) return '';

  // 문자열(마크다운 테이블)인 경우 — simulator.js 기본 반환 형식
  if (typeof tableData === 'string') {
    return markdownTableToHtml(tableData);
  }

  // 배열인 경우 — 직접 테이블 생성
  if (Array.isArray(tableData) && tableData.length > 0) {
    const headers = Object.keys(tableData[0]);
    let html = '<table class="result-table"><thead><tr>';
    headers.forEach(h => { html += `<th>${escapeHtml(h)}</th>`; });
    html += '</tr></thead><tbody>';
    tableData.forEach(row => {
      html += '<tr>';
      headers.forEach(h => {
        let value = row[h];
        if (typeof value === 'number') value = value.toFixed(4);
        html += `<td>${escapeHtml(String(value ?? ''))}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  return '<p>데이터 없음</p>';
}

/**
 * 마크다운 테이블 문자열 → HTML 테이블 변환
 * @param {string} md — | col1 | col2 | 형식의 마크다운
 * @returns {string} HTML
 */
function markdownTableToHtml(md) {
  if (!md || !md.includes('|')) return `<div class="result-text">${markdownToHtml(md)}</div>`;

  const lines = md.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return `<div class="result-text">${markdownToHtml(md)}</div>`;

  let html = '<table class="result-table">';

  lines.forEach((line, idx) => {
    // 구분선(---) 건너뛰기
    if (/^\|[\s\-:]+\|$/.test(line.trim()) || /^[\s\-:|]+$/.test(line.trim())) return;

    const cells = line.split('|').filter(c => c.trim() !== '');
    if (cells.length === 0) return;

    if (idx === 0) {
      html += '<thead><tr>';
      cells.forEach(c => { html += `<th>${escapeHtml(c.trim())}</th>`; });
      html += '</tr></thead><tbody>';
    } else {
      html += '<tr>';
      cells.forEach(c => { html += `<td>${escapeHtml(c.trim())}</td>`; });
      html += '</tr>';
    }
  });

  html += '</tbody></table>';
  return html;
}

/* ============================================================================
   리뷰 & 대안 (Tab 3)
   ============================================================================ */

function setupReviewHandlers() {
  const subTabBtns = document.querySelectorAll('.interpret-sub-tab');
  const reviewSections = document.querySelectorAll('.review-section');

  subTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const subTab = btn.getAttribute('data-sub');

      subTabBtns.forEach(b => b.classList.remove('active'));
      reviewSections.forEach(s => s.classList.remove('active'));

      btn.classList.add('active');
      const targetSection = $(`review-${subTab}`);
      if (targetSection) {
        targetSection.classList.add('active');
      }
    });
  });

  // 리뷰 & 대안 생성 버튼
  const reviewBtn = $('review-generate-btn');
  if (reviewBtn) {
    reviewBtn.addEventListener('click', async () => {
      await generateReviewAndAlternatives(currentMethodIndex);
    });
  }
}

async function generateReviewAndAlternatives(methodIndex) {
  try {
    const peerSection = $('review-peer');
    const altSection = $('review-alt');
    const futureSection = $('review-future');

    if (peerSection) peerSection.innerHTML = '<div class="loading-text">로드 중...</div>';
    if (altSection) altSection.innerHTML = '<div class="loading-text">로드 중...</div>';
    if (futureSection) futureSection.innerHTML = '<div class="loading-text">로드 중...</div>';

    const result = await loadReview(methodIndex);

    if (peerSection && result.peer) {
      peerSection.innerHTML = markdownToHtml(result.peer);
    }
    if (altSection && result.alternatives) {
      altSection.innerHTML = markdownToHtml(result.alternatives);
    }
    if (futureSection && result.future) {
      futureSection.innerHTML = markdownToHtml(result.future);
    }
  } catch (error) {
    console.error('리뷰 로드 오류:', error);
    showStatus('리뷰를 로드할 수 없습니다.');
  }
}

function clearReviewSections() {
  const sections = document.querySelectorAll('.review-section');
  sections.forEach(s => {
    s.innerHTML = '';
  });
}

/* ============================================================================
   Q&A 채팅 (Tab 4)
   ============================================================================ */

function setupQnAHandlers() {
  const qnaInput = $('qna-input');
  const qnaSendBtn = $('qna-send');

  if (qnaSendBtn) {
    qnaSendBtn.addEventListener('click', async () => {
      const question = qnaInput ? qnaInput.value.trim() : '';
      if (!question) return;

      await sendQnAMessage(question);
      if (qnaInput) qnaInput.value = '';
    });
  }

  // 엔터 키 전송
  if (qnaInput) {
    qnaInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        qnaSendBtn.click();
      }
    });
  }
}

async function sendQnAMessage(question) {
  try {
    const chatDiv = $('qna-chat');
    if (!chatDiv) return;

    // 사용자 메시지 추가
    const userMsg = document.createElement('div');
    userMsg.className = 'qna-message user-message';
    userMsg.textContent = question;
    chatDiv.appendChild(userMsg);

    // 로딩 메시지
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'qna-message loading-message';
    loadingMsg.textContent = 'AI 응답 생성 중...';
    chatDiv.appendChild(loadingMsg);

    // 스크롤 하단으로
    chatDiv.scrollTop = chatDiv.scrollHeight;

    // AI 응답 가져오기
    const answer = await sendQnA(question);

    // 로딩 메시지 제거
    loadingMsg.remove();

    // AI 응답 추가
    const aiMsg = document.createElement('div');
    aiMsg.className = 'qna-message ai-message';
    aiMsg.innerHTML = markdownToHtml(answer);
    chatDiv.appendChild(aiMsg);

    chatDiv.scrollTop = chatDiv.scrollHeight;
  } catch (error) {
    console.error('Q&A 오류:', error);
    const chatDiv = $('qna-chat');
    if (chatDiv) {
      const errMsg = document.createElement('div');
      errMsg.className = 'qna-message error-message';
      errMsg.textContent = `오류: ${error.message}`;
      chatDiv.appendChild(errMsg);
    }
  }
}

/* ============================================================================
   홈 링크 핸들러 (새 논문 분석)
   ============================================================================ */

function setupHomeLink() {
  const homeLink = document.querySelector('.home-link');
  if (homeLink) {
    homeLink.addEventListener('click', () => {
      // 상태 초기화 후 showInputView() 호출
      mockDataCache = null;
      currentMethodIndex = 0;
      currentLanguage = 'python';

      // 입력 뷰로 돌아가기
      showInputView();

      // PDF 파일 입력 초기화
      const pdfInput = $('pdf-file');
      if (pdfInput) pdfInput.value = '';

      showPdfFileName('파일을 선택해주세요');
    });
  }
}

/* ============================================================================
   실습 데이터 생성 (Mock Data)
   ============================================================================ */

function setupMockDataGeneration() {
  const mockDataBtn = $('gen-mockdata-btn');
  const downloadCsvBtn = $('download-csv-btn');
  const uploadCsvBtn = $('upload-csv-btn');
  const csvFileInput = $('csv-file-input');
  const mockDataStatus = $('mockdata-status');
  const dataPreview = $('data-preview');

  // ===== 가상 데이터 생성 =====
  if (mockDataBtn) {
    mockDataBtn.addEventListener('click', async () => {
      try {
        mockDataBtn.disabled = true;
        if (mockDataStatus) mockDataStatus.innerHTML = '<div class="loading-text">데이터 생성 중...</div>';

        const dataStructure = getDataStructure();
        mockDataCache = generateMockData(dataStructure);
        // mockDataCache = { csv, data, variables }

        if (mockDataStatus) {
          mockDataStatus.innerHTML = `<p style="color: #27ae60;">✅ 데이터 생성 완료 (${mockDataCache.data.length}행 × ${mockDataCache.variables.length}변수)</p>`;
        }

        if (downloadCsvBtn) downloadCsvBtn.style.display = 'inline-block';

        // 데이터 프리뷰 렌더링
        renderDataPreview(mockDataCache.data, mockDataCache.variables);
      } catch (error) {
        console.error('Mock 데이터 생성 오류:', error);
        if (mockDataStatus) {
          mockDataStatus.innerHTML = `<p style="color: #e74c3c;">❌ 오류: ${escapeHtml(error.message)}</p>`;
        }
      } finally {
        mockDataBtn.disabled = false;
      }
    });
  }

  // ===== CSV 다운로드 =====
  if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener('click', () => {
      try {
        if (!mockDataCache || !mockDataCache.csv) {
          showStatus('먼저 실습 데이터를 생성해주세요.');
          return;
        }
        downloadCSV(mockDataCache.csv, 'mock_data.csv');
        showStatus('CSV 파일이 다운로드되었습니다.');
      } catch (error) {
        console.error('CSV 다운로드 오류:', error);
        showStatus('CSV 다운로드 중 오류가 발생했습니다.');
      }
    });
  }

  // ===== CSV 업로드 =====
  if (uploadCsvBtn && csvFileInput) {
    uploadCsvBtn.addEventListener('click', () => csvFileInput.click());
    csvFileInput.addEventListener('change', () => {
      const file = csvFileInput.files[0];
      if (!file) return;
      handleCsvUpload(file);
    });
  }
}

/**
 * CSV 파일 업로드 처리
 * @param {File} file
 */
function handleCsvUpload(file) {
  const mockDataStatus = $('mockdata-status');
  const downloadCsvBtn = $('download-csv-btn');

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const { data, variables, csv } = parseCsvText(text);

      if (data.length === 0) {
        if (mockDataStatus) mockDataStatus.innerHTML = '<p style="color: #e74c3c;">❌ CSV 파일에 데이터가 없습니다.</p>';
        return;
      }

      mockDataCache = { csv: text, data, variables };

      if (mockDataStatus) {
        mockDataStatus.innerHTML = `<p style="color: #27ae60;">✅ 데이터 업로드 완료: ${file.name} (${data.length}행 × ${variables.length}변수)</p>`;
      }
      if (downloadCsvBtn) downloadCsvBtn.style.display = 'inline-block';

      renderDataPreview(data, variables);
    } catch (err) {
      console.error('CSV 파싱 오류:', err);
      if (mockDataStatus) {
        mockDataStatus.innerHTML = `<p style="color: #e74c3c;">❌ CSV 파싱 오류: ${escapeHtml(err.message)}</p>`;
      }
    }
  };
  reader.readAsText(file, 'UTF-8');
}

/**
 * CSV 텍스트를 파싱하여 data 배열 + variables 배열로 변환
 * @param {string} text — CSV 텍스트
 * @returns {{ data: Array<Object>, variables: Array, csv: string }}
 */
function parseCsvText(text) {
  // BOM 제거
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter(line => line.trim());

  if (lines.length < 2) throw new Error('헤더와 데이터가 최소 1행 필요합니다.');

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const variables = headers.map(name => ({
    name_en: name,
    name_kr: name,
    type: 'continuous',
    role: 'unknown',
  }));

  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const val = values[j];
      // 숫자 여부 판별
      const num = Number(val);
      row[headers[j]] = (val !== '' && !isNaN(num)) ? num : val;
    }
    data.push(row);
  }

  // 변수 타입 추론
  for (const v of variables) {
    const vals = data.map(r => r[v.name_en]).filter(x => x !== '' && x !== undefined);
    const numericCount = vals.filter(x => typeof x === 'number').length;
    if (numericCount < vals.length * 0.5) {
      v.type = 'categorical';
    } else {
      const uniq = new Set(vals);
      if (uniq.size <= 2 && vals.every(x => x === 0 || x === 1)) {
        v.type = 'binary';
      }
    }
  }

  return { data, variables, csv: cleaned };
}

/**
 * 데이터 프리뷰 테이블 렌더링 (최대 20행)
 * @param {Array<Object>} data
 * @param {Array} variables
 */
function renderDataPreview(data, variables) {
  const container = $('data-preview');
  if (!container) return;

  const maxRows = 20;
  const displayData = data.slice(0, maxRows);
  const headers = variables.map(v => v.name_en);

  let html = `<div class="data-preview-header">
    <span class="info-badge">📊 데이터 프리뷰 (${data.length}행 중 상위 ${Math.min(maxRows, data.length)}행)</span>
  </div>`;

  html += '<div class="data-table-scroll"><table class="data-preview-table"><thead><tr>';
  html += '<th>#</th>';
  for (const h of headers) {
    html += `<th>${escapeHtml(h)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let i = 0; i < displayData.length; i++) {
    html += `<tr><td class="row-num">${i + 1}</td>`;
    for (const h of headers) {
      const val = displayData[i][h];
      const display = val !== undefined && val !== null ? String(val) : '';
      html += `<td>${escapeHtml(display)}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';

  if (data.length > maxRows) {
    html += `<div class="data-preview-footer">... ${data.length - maxRows}행 더 있음</div>`;
  }

  container.innerHTML = html;
  container.style.display = 'block';
}

/* ============================================================================
   Markdown to HTML 변환 (간단한 구현)
   ============================================================================ */

function markdownToHtml(markdown) {
  if (!markdown) return '';

  let html = escapeHtml(markdown);

  // 헤더 (# -> <h3>, ## -> <h4>, etc.)
  html = html.replace(/^### (.*?)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.*?)$/gm, '<h2>$1</h2>');

  // 굵은 글씨 (**text** -> <strong>text</strong>)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 기울임 (*text* -> <em>text</em>)
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 코드 블록 (```code``` -> <pre><code>code</code></pre>)
  html = html.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');

  // 인라인 코드 (`code` -> <code>code</code>)
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // 리스트 (- item -> <li>item</li>)
  html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>');

  // 순서 리스트 (1. item -> <li>item</li>)
  html = html.replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');

  // 줄바꿈
  html = html.replace(/\n/g, '<br>');

  return html;
}
