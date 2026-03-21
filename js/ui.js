/**
 * ui.js — UI 렌더링 및 상호작용
 * ResearchMethodAgent v4.0
 */

import { escapeHtml, copyToClipboard } from './utils.js';
import { generateMockData, computeStats, downloadCSV } from './mockdata.js';
import { runQnA, runInterpretationGuide } from './agents.js';

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
  get loadingTip()    { return $('loading-tip'); },
  get progressBar()   { return $('progress-bar'); },
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
   로딩 애니메이션 — 에이전트 스텝 + 프로그레스 + 팁
   ============================================================ */

const TIPS = [
  { label: '💡 Tip', text: 'OLS 추정은 편의(bias)가 존재할 수 있어 도구변수(IV) 추정법으로 보완합니다.' },
  { label: '📚 알아두기', text: '도구변수는 적합성(relevance)과 외생성(exogeneity) 두 조건을 만족해야 합니다.' },
  { label: '🔬 방법론', text: '2SLS(Two-Stage Least Squares)는 내생성 문제를 해결하는 대표적인 추정 방법입니다.' },
  { label: '💡 Tip', text: '가상 데이터는 원본의 기술통계(평균, 표준편차)를 모방하여 유사한 분석 결과를 재현합니다.' },
  { label: '📊 통계', text: 'F-통계량이 10 이상이면 약한 도구변수(weak IV) 문제가 없다고 판단합니다.' },
  { label: '🧪 실습', text: '생성된 가상 데이터로 Python/R 코드를 직접 실행해보면 분석 방법을 체득할 수 있습니다.' },
  { label: '💡 Tip', text: '이분산-일치(HC) 표준오차를 사용하면 이분산성에 강건한 추론이 가능합니다.' },
  { label: '📚 알아두기', text: '내생성(endogeneity)은 설명변수와 오차항이 상관될 때 발생하는 추정 문제입니다.' },
];

let tipInterval = null;

/**
 * 에이전트 스텝 활성화 (0=전처리, 1~4=에이전트)
 * @param {number} step — 현재 활성 단계 (0: PDF→MD, 1~4: 에이전트)
 */
export function setAgentStep(step) {
  // step 0 = 전처리(PDF→MD), step 1~4 = 에이전트
  for (let i = 0; i <= 4; i++) {
    const el = $(`step-agent${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < step) el.classList.add('done');
    else if (i === step) el.classList.add('active');
  }
}

/**
 * 프로그레스 바 업데이트
 * @param {number} percent — 0~100
 */
export function setProgress(percent) {
  if (dom.progressBar) {
    dom.progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }
}

/**
 * 로딩 팁 순환 시작
 */
export function startTipRotation() {
  showRandomTip();
  tipInterval = setInterval(showRandomTip, 6000);
}

/**
 * 로딩 팁 순환 중지
 */
export function stopTipRotation() {
  if (tipInterval) {
    clearInterval(tipInterval);
    tipInterval = null;
  }
  if (dom.loadingTip) dom.loadingTip.style.display = 'none';
}

function showRandomTip() {
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  if (dom.loadingTip) {
    dom.loadingTip.style.display = 'block';
    dom.loadingTip.innerHTML = `<span class="loading-tip-label">${tip.label}</span> ${tip.text}`;
    // 리-애니메이션
    dom.loadingTip.style.animation = 'none';
    dom.loadingTip.offsetHeight; // reflow
    dom.loadingTip.style.animation = 'fadeInUp 0.5s ease';
  }
}

/* ============================================================
   화면 전환 (입력 → 로딩 → 결과)
   ============================================================ */

export function showLoadingView() {
  hideStatus();
  dom.runBtn.disabled = true;
  dom.configCard.style.display = 'none';
  dom.inputCard.style.display = 'none';
  dom.loadingCard.style.display = 'block';
  // 초기화
  setAgentStep(0);
  setProgress(0);
  startTipRotation();
}

export function showInputView() {
  dom.loadingCard.style.display = 'none';
  dom.configCard.style.display = 'block';
  dom.inputCard.style.display = 'block';
  dom.runBtn.disabled = false;
  stopTipRotation();
}

export function showResultView() {
  dom.loadingCard.style.display = 'none';
  dom.resultWrap.classList.add('visible');
  stopTipRotation();
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

/** 분석 결과 전체 저장 (Q&A용) */
let _analysisData = null;

/** 원본 텍스트 저장 (Q&A용) */
let _paperText = null;

export function setPaperText(text) {
  _paperText = text;
}

/** 변환된 마크다운 저장 (PDF→MD) */
let _convertedMarkdown = null;

export function setConvertedMarkdown(md) {
  _convertedMarkdown = md;
}

export function getConvertedMarkdown() {
  return _convertedMarkdown;
}

/** 저장된 기술통계 (가상 데이터 생성용) */
let _descriptiveStats = null;

export function setDescriptiveStats(stats) {
  _descriptiveStats = stats;
}

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
  // PDF→MD 변환 결과가 있으면 다운로드 버튼 추가
  if (_convertedMarkdown) {
    ctxHtml += `<button class="context-tag btn-md-download" id="btn-md-download" style="cursor:pointer;background:var(--color-primary);color:#fff;border:none">📄 구조화 MD 다운로드</button>`;
  }
  dom.contextTags.innerHTML = ctxHtml;

  // MD 다운로드 버튼 바인딩
  const mdBtn = $('btn-md-download');
  if (mdBtn && _convertedMarkdown) {
    mdBtn.addEventListener('click', () => {
      const bom = '\uFEFF';
      const blob = new Blob([bom + _convertedMarkdown], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(meta.title || 'paper').replace(/[^a-zA-Z0-9가-힣]/g, '_')}_structured.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // 섹션 색인 렌더링
  const sectionIndex = data.section_index || [];
  const indexEl = $('section-index');
  if (indexEl && sectionIndex.length > 0) {
    let indexHtml = '';
    for (const sec of sectionIndex) {
      const tables = (sec.key_tables || []).map(t => `<span class="pkg">${escapeHtml(t)}</span>`).join(' ');
      indexHtml += `
        <div class="index-item">
          <div class="index-section">${escapeHtml(sec.section)}</div>
          <div class="index-summary">${escapeHtml(sec.summary)}</div>
          ${tables ? `<div class="index-tables">${tables}</div>` : ''}
        </div>`;
    }
    indexEl.innerHTML = indexHtml;
    indexEl.closest('.card')?.style.setProperty('display', 'block');
  }

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

  // 전체 분석 컨텍스트 저장 (Q&A용)
  _analysisData = data;

  // 방법론 탭 + 블록 렌더링
  methods.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.className = `method-nav-btn${i === 0 ? ' active' : ''}`;
    btn.textContent = m.standard_name || m.raw_name;
    btn.dataset.idx = i;
    btn.addEventListener('click', () => switchMethod(i));
    dom.methodNav.appendChild(btn);

    const block = document.createElement('div');
    block.className = `card method-block${i === 0 ? ' active' : ''}`;
    block.id = `mblock-${i}`;
    block.innerHTML = buildMethodBlockHtml(m, i, ctx);
    dom.methodBlocks.appendChild(block);
  });

  bindCopyButtons();
  bindLangTabs();
  bindMockDataButtons();
  bindInterpretationButtons();
  bindQnA();
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
      <div class="target-box">🎯 <b>목표 재현 위치:</b> ${escapeHtml(m.target_location)}
        ${m.source_section ? `&nbsp;&nbsp;📑 <b>출처 섹션:</b> ${escapeHtml(m.source_section)}` : ''}</div>
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

    <!-- 가상 데이터 생성 섹션 -->
    <div class="section mockdata-section">
      <div class="section-title">🧪 실습용 가상 데이터 (Agent 4)</div>
      <div class="text-xs text-muted mb-8">
        논문의 기술통계를 역산하여 유사한 특성의 가상 데이터를 생성합니다. 위 코드에 바로 활용할 수 있습니다.
      </div>
      <div>
        <button class="btn-mockdata" data-idx="${index}" id="mockdata-btn-${index}">
          🧪 가상 데이터 생성
        </button>
        <button class="btn-download" data-idx="${index}" id="download-btn-${index}" style="display:none">
          📥 CSV 다운로드
        </button>
      </div>
      <div id="mockdata-result-${index}" style="margin-top:10px"></div>
    </div>

    <!-- 분석 결과 해석 가이드 -->
    <div class="section interpretation-section">
      <div class="section-title">📖 분석 결과 해석 가이드</div>
      <div class="text-xs text-muted mb-8">
        가상 데이터로 코드를 실행한 후, 결과를 어떻게 읽고 해석해야 하는지 안내합니다.
      </div>
      <button class="btn-interpret" data-idx="${index}" id="interpret-btn-${index}">
        📖 해석 가이드 생성
      </button>
      <div id="interpret-result-${index}" style="margin-top:10px"></div>
    </div>
  `;
}

/* ============================================================
   가상 데이터 생성 버튼 바인딩
   ============================================================ */

function bindMockDataButtons() {
  document.querySelectorAll('.btn-mockdata').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.idx;
      handleMockDataGeneration(idx);
    });
  });
}

async function handleMockDataGeneration(idx) {
  const btn = $(`mockdata-btn-${idx}`);
  const dlBtn = $(`download-btn-${idx}`);
  const resultEl = $(`mockdata-result-${idx}`);

  if (!_descriptiveStats || !_descriptiveStats.variables?.length) {
    resultEl.innerHTML = '<div class="desc-box text-danger">기술통계를 추출하지 못했습니다. 논문에 기술통계표가 포함되어 있는지 확인하세요.</div>';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ 생성 중...';

  try {
    // 가상 데이터 생성
    const { csv, data, variables } = generateMockData(_descriptiveStats);
    const comparison = computeStats(data, variables);

    // CSV 저장 (다운로드 버튼용)
    btn._csv = csv;
    btn._filename = `mock_data_${_descriptiveStats.sample_size || 500}obs.csv`;

    // 비교표 렌더링
    let tableHtml = `
      <table class="stats-table">
        <thead>
          <tr>
            <th>변수</th>
            <th>원본 평균</th>
            <th>생성 평균</th>
            <th>원본 SD</th>
            <th>생성 SD</th>
            <th>유사도</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const row of comparison) {
      const meanDiff = row.original_mean
        ? Math.abs(row.generated_mean - row.original_mean) / Math.max(Math.abs(row.original_mean), 0.01)
        : 0;
      const matchClass = meanDiff < 0.1 ? 'match-good' : 'match-ok';
      const matchText = meanDiff < 0.1 ? '✓ 우수' : '△ 보통';

      tableHtml += `
        <tr>
          <td class="var-name">${escapeHtml(row.name_kr)}</td>
          <td>${row.original_mean ?? '-'}</td>
          <td>${row.generated_mean}</td>
          <td>${row.original_sd ?? '-'}</td>
          <td>${row.generated_sd}</td>
          <td class="${matchClass}">${matchText}</td>
        </tr>
      `;
    }

    tableHtml += '</tbody></table>';

    resultEl.innerHTML = `
      <div class="desc-box mb-8">
        ✅ <b>${data.length}개</b> 관측치 × <b>${variables.length}개</b> 변수의 가상 데이터가 생성되었습니다.
      </div>
      <div class="text-xs text-muted mb-6"><b>원본 vs 생성 데이터 기술통계 비교</b></div>
      <div class="stats-comparison">${tableHtml}</div>
    `;

    // 다운로드 버튼 표시
    dlBtn.style.display = 'inline-flex';
    dlBtn.onclick = () => downloadCSV(btn._csv, btn._filename);

    btn.textContent = '🔄 재생성';
    btn.disabled = false;
  } catch (err) {
    resultEl.innerHTML = `<div class="desc-box text-danger">생성 실패: ${escapeHtml(err.message)}</div>`;
    btn.textContent = '🧪 가상 데이터 생성';
    btn.disabled = false;
  }
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

/* ============================================================
   해석 가이드 버튼 바인딩
   ============================================================ */

function bindInterpretationButtons() {
  document.querySelectorAll('.btn-interpret').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const resultEl = $(`interpret-result-${idx}`);
      const apiKey = dom.apiKey.value.trim();

      if (!apiKey) { resultEl.innerHTML = '<div class="desc-box text-danger">API 키를 입력해주세요.</div>'; return; }
      if (!_analysisData?.methods?.[idx]) return;

      btn.disabled = true;
      btn.textContent = '⏳ 생성 중...';

      try {
        const method = _analysisData.methods[idx];
        const ctx = _analysisData.paper_context || {};
        const guide = await runInterpretationGuide(apiKey, method, ctx, method.target_location);

        // 마크다운을 간단한 HTML로 변환
        const html = simpleMarkdownToHtml(guide);
        resultEl.innerHTML = `<div class="interpret-guide">${html}</div>`;

        btn.textContent = '🔄 재생성';
        btn.disabled = false;
      } catch (err) {
        resultEl.innerHTML = `<div class="desc-box text-danger">생성 실패: ${escapeHtml(err.message)}</div>`;
        btn.textContent = '📖 해석 가이드 생성';
        btn.disabled = false;
      }
    });
  });
}

/* ============================================================
   대화형 Q&A 바인딩
   ============================================================ */

function bindQnA() {
  const sendBtn = $('qna-send');
  const input = $('qna-input');
  const chatArea = $('qna-chat');

  if (!sendBtn || !input || !chatArea) return;

  // Q&A 영역 표시
  const qnaCard = sendBtn.closest('.card');
  if (qnaCard) qnaCard.style.display = 'block';

  const handleSend = async () => {
    const question = input.value.trim();
    const apiKey = dom.apiKey.value.trim();
    if (!question || !apiKey) return;

    // 사용자 질문 표시
    chatArea.innerHTML += `<div class="qna-msg qna-user"><b>Q:</b> ${escapeHtml(question)}</div>`;
    input.value = '';

    // 로딩 표시
    const loadingId = `qna-loading-${Date.now()}`;
    chatArea.innerHTML += `<div class="qna-msg qna-loading" id="${loadingId}">💬 답변 생성 중...</div>`;
    chatArea.scrollTop = chatArea.scrollHeight;

    try {
      const ctx = _analysisData?.paper_context || {};
      const text = _paperText || '';
      const answer = await runQnA(apiKey, question, text, ctx);

      const loadingEl = $(loadingId);
      if (loadingEl) loadingEl.remove();

      chatArea.innerHTML += `<div class="qna-msg qna-bot"><b>A:</b> ${simpleMarkdownToHtml(answer)}</div>`;
    } catch (err) {
      const loadingEl = $(loadingId);
      if (loadingEl) loadingEl.remove();
      chatArea.innerHTML += `<div class="qna-msg qna-bot text-danger">오류: ${escapeHtml(err.message)}</div>`;
    }

    chatArea.scrollTop = chatArea.scrollHeight;
  };

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}

/* ============================================================
   간이 마크다운 → HTML 변환
   ============================================================ */

function simpleMarkdownToHtml(md) {
  // 1단계: 인라인 서식 변환
  let html = md
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

  // 2단계: 리스트 변환 — 연속된 리스트 아이템을 그룹으로 묶기
  html = html
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');

  // 연속된 <li>를 <ul>로 감싸기 (비연속 리스트는 별도 <ul>)
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');

  // 3단계: 줄바꿈
  html = html
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');

  return html;
}
