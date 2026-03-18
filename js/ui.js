/**
 * ui.js — UI 렌더링 및 상호작용
 * ResearchMethodAgent v4.0
 */

import { escapeHtml, copyToClipboard } from './utils.js';

/* ============================================================
   DOM 요소 캐싱
   ============================================================ */

const $ = (id) => document.getElementById(id);

export const dom = {
  get apiKey()        { return $('api-key'); },
  get txtInput()      { return $('txt-input'); },
  get configCard()    { return $('config-card'); },
  get inputCard()     { return $('input-card'); },
  get loadingCard()   { return $('loading-card'); },
  get loadingMsg()    { return $('loading-msg'); },
  get statusMsg()     { return $('status-msg'); },
  get runBtn()        { return $('run-btn'); },
  get resultWrap()    { return $('result-wrap'); },
  get paperTitle()    { return $('r-title'); },
  get paperMeta()     { return $('r-meta'); },
  get contextTags()   { return $('r-context'); },
  get methodNav()     { return $('method-nav'); },
  get methodBlocks()  { return $('method-blocks'); },
  // Tab
  get tabText()       { return $('tab-text'); },
  get tabPdf()        { return $('tab-pdf'); },
  get panelText()     { return $('panel-text'); },
  get panelPdf()      { return $('panel-pdf'); },
  // PDF
  get dropZone()      { return $('drop-zone'); },
  get pdfFile()       { return $('pdf-file'); },
  get pdfName()       { return $('pdf-name'); },
  get pdfStatus()     { return $('pdf-extract-status'); },
};

/* ============================================================
   탭 전환
   ============================================================ */

let currentTab = 'text';
export function getCurrentTab() { return currentTab; }

export function switchTab(tab) {
  currentTab = tab;
  dom.tabText.classList.toggle('active', tab === 'text');
  dom.tabPdf.classList.toggle('active',  tab === 'pdf');
  dom.panelText.style.display = tab === 'text' ? 'block' : 'none';
  dom.panelPdf.style.display  = tab === 'pdf'  ? 'block' : 'none';
}

/* ============================================================
   상태 메시지
   ============================================================ */

export function showStatus(message) {
  dom.statusMsg.innerHTML = message;
  dom.statusMsg.classList.add('visible');
}

export function hideStatus() {
  dom.statusMsg.classList.remove('visible');
}

export function setLoading(message) {
  dom.loadingMsg.innerHTML = message;
}

/* ============================================================
   화면 전환 (입력 → 로딩 → 결과)
   ============================================================ */

export function showLoadingView() {
  hideStatus();
  dom.runBtn.disabled = true;
  dom.inputCard.style.display = 'none';
  dom.loadingCard.style.display = 'block';
}

export function showInputView() {
  dom.loadingCard.style.display = 'none';
  dom.inputCard.style.display = 'block';
  dom.runBtn.disabled = false;
}

export function showResultView() {
  dom.loadingCard.style.display = 'none';
  dom.resultWrap.classList.add('visible');
}

/* ============================================================
   PDF 상태 표시
   ============================================================ */

export function showPdfFileName(name) {
  dom.pdfName.style.display = 'block';
  dom.pdfName.textContent = `선택됨: ${name}`;
}

export function showPdfProgress(message) {
  dom.pdfStatus.style.display = 'block';
  dom.pdfStatus.style.color = '';
  dom.pdfStatus.textContent = message;
}

export function showPdfSuccess(pages, charCount) {
  dom.pdfStatus.style.color = 'var(--color-success)';
  dom.pdfStatus.textContent = `✅ 추출 완료 — ${pages}페이지 / 약 ${charCount}자`;
}

export function showPdfError(message) {
  dom.pdfStatus.style.color = 'var(--color-danger)';
  dom.pdfStatus.textContent = `❌ ${message}`;
}

/* ============================================================
   분석 결과 렌더링
   ============================================================ */

/**
 * 분석 결과 전체 렌더링
 * @param {Object} data — 최종 분석 결과 객체
 */
export function renderResult(data) {
  const meta = data.metadata || {};
  const ctx = data.paper_context || {};
  const methods = data.methods || [];

  // 논문 정보
  dom.paperTitle.textContent = meta.title || '제목 미상';
  dom.paperMeta.textContent = meta.summary || '';

  // 컨텍스트 태그
  let ctxHtml = '';
  if (ctx.domain)               ctxHtml += `<div class="context-tag">분야: ${escapeHtml(ctx.domain)}</div>`;
  if (ctx.research_type)        ctxHtml += `<div class="context-tag">유형: ${escapeHtml(ctx.research_type)}</div>`;
  if (ctx.data_characteristics) ctxHtml += `<div class="context-tag">데이터: ${escapeHtml(ctx.data_characteristics)}</div>`;
  dom.contextTags.innerHTML = ctxHtml;

  // 방법론 없을 때
  dom.methodNav.innerHTML = '';
  dom.methodBlocks.innerHTML = '';

  if (methods.length === 0) {
    dom.methodBlocks.innerHTML = `
      <div class="desc-box text-danger">
        방법론을 감지하지 못했습니다. 논문의 분석 방법 섹션이 포함된 텍스트를 붙여넣으세요.
        ${data._debug ? '<br><br>' + escapeHtml(data._debug) : ''}
      </div>`;
    return;
  }

  // 방법론 탭 + 블록 렌더링
  methods.forEach((m, i) => {
    // 네비게이션 버튼
    const btn = document.createElement('button');
    btn.className = `method-nav-btn${i === 0 ? ' active' : ''}`;
    btn.textContent = m.standard_name || m.raw_name;
    btn.dataset.idx = i;
    btn.addEventListener('click', () => switchMethod(i));
    dom.methodNav.appendChild(btn);

    // 방법론 블록
    const block = document.createElement('div');
    block.className = `card method-block${i === 0 ? ' active' : ''}`;
    block.id = `mblock-${i}`;
    block.innerHTML = buildMethodBlockHtml(m, i, ctx);
    dom.methodBlocks.appendChild(block);
  });

  // 코드 복사 버튼 이벤트 바인딩
  bindCopyButtons();
  // 코드 언어 탭 이벤트 바인딩
  bindLangTabs();
}

/**
 * 방법론 블록 HTML 생성
 */
function buildMethodBlockHtml(m, index, ctx) {
  const pkgPy = (m.packages?.python || []).map(p => `<span class="pkg">${escapeHtml(p)}</span>`).join('');
  const pkgR  = (m.packages?.r || []).map(p => `<span class="pkg">${escapeHtml(p)}</span>`).join('');

  const stepsHtml = (m.steps || []).map((s, si) => `
    <div class="step-item">
      <div class="step-num">${s.step || si + 1}</div>
      <div class="step-text"><b>${escapeHtml(s.name)}</b> — ${escapeHtml(s.desc)}</div>
    </div>
  `).join('');

  return `
    <div class="method-header">
      <div class="method-badge">Agent 2 표준화</div>
      <div class="method-name">
        ${escapeHtml(m.standard_name)}
        <span class="raw">(원문: ${escapeHtml(m.raw_name)})</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">추출 근거 및 목표 (Agent 1)</div>
      <div class="evidence-box">"${escapeHtml(m.evidence)}"</div>
      <div class="target-box">🎯 <b>목표 재현 위치:</b> ${escapeHtml(m.target_location)}</div>
    </div>

    <div class="section">
      <div class="section-title">학술적 해석 및 절차 (Agent 2)</div>
      <div class="insight-box mb-8"><b>도메인 맞춤 해석:</b><br>${escapeHtml(m.why_used)}</div>
      <div class="desc-box mb-8">${escapeHtml(m.concept)}</div>
      <div class="step-list">${stepsHtml}</div>
    </div>

    <div class="section">
      <div class="section-title">맞춤형 재현 코드 (Agent 3)</div>
      <div class="text-sm text-muted mb-8">
        ※ ${escapeHtml(ctx.data_characteristics)} 특성을 반영한 Mock 데이터를 자동 생성합니다.
      </div>
      <div class="mb-8">
        <div class="text-xs text-muted">Python: <span class="pkg-row" style="display:inline-flex">${pkgPy}</span></div>
        <div class="text-xs text-muted" style="margin-top:4px">R: <span class="pkg-row" style="display:inline-flex">${pkgR}</span></div>
      </div>
      <div class="code-lang-bar">
        <button class="code-lang-tab active" data-lang="py" data-idx="${index}">Python</button>
        <button class="code-lang-tab" data-lang="r" data-idx="${index}">R</button>
      </div>
      <div class="code-wrap">
        <div class="code-block active" id="code-py-${index}">
          <button class="copy-btn" data-target="code-py-${index}">복사</button>
          <pre>${escapeHtml(m.python_code)}</pre>
        </div>
        <div class="code-block" id="code-r-${index}">
          <button class="copy-btn" data-target="code-r-${index}">복사</button>
          <pre>${escapeHtml(m.r_code)}</pre>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   인터랙션: 방법론 전환, 언어 탭, 복사
   ============================================================ */

function switchMethod(idx) {
  document.querySelectorAll('.method-nav-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.idx) === idx);
  });
  document.querySelectorAll('.method-block').forEach(block => {
    block.classList.toggle('active', block.id === `mblock-${idx}`);
  });
}

function bindLangTabs() {
  document.querySelectorAll('.code-lang-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const { lang, idx } = tab.dataset;
      // 같은 인덱스의 언어 탭 토글
      tab.parentElement.querySelectorAll('.code-lang-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.lang === lang);
      });
      const wrap = tab.closest('.section').querySelector('.code-wrap');
      wrap.querySelectorAll('.code-block').forEach(block => {
        block.classList.toggle('active', block.id === `code-${lang}-${idx}`);
      });
    });
  });
}

function bindCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = btn.dataset.target;
      const pre = document.getElementById(target)?.querySelector('pre');
      if (!pre) return;

      const success = await copyToClipboard(pre.textContent);
      if (success) {
        btn.textContent = '복사됨!';
        setTimeout(() => { btn.textContent = '복사'; }, 1500);
      }
    });
  });
}
