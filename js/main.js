/**
 * main.js — 앱 초기화 및 이벤트 바인딩
 * ResearchMethodAgent v6.0
 *
 * 역할: 홈 화면 경로 분기, PDF 업로드, API 키 관리, 분석 시작 트리거
 * 경로 A: 논문 실습 (기존 v5.0)
 * 경로 B: 방법론 학습 (v6.0 신규)
 */

import * as ui from './ui.js';
import { processPdfFile, extractTextFromPDF, getExtractedText, getPdfBase64, resetExtractedText } from './pdf.js';
import { runInitialPipeline } from './pipeline.js';
import { initPyodide, isPyodideReady } from './pyodide-runner.js';
import { METHODOLOGY_CATALOG, METHODOLOGY_GROUPS, getCatalogByGroup, searchCatalog, getCatalogItem } from './catalog.js';
import { initChat, showMethodologyOverview } from './ui-chat.js';

/** @type {string} 로컬 스토리지 키 */
const STORAGE_KEY = 'rma_api_key';
const STORAGE_KEYS = ['rma_api_key_1', 'rma_api_key_2', 'rma_api_key_3'];
let currentKeyIndex = 0;

/** @type {'home'|'path-a'|'path-b-catalog'|'path-b-learn'} 현재 화면 상태 */
let currentScreen = 'home';

/**
 * 앱 초기화
 */
function init() {
  // ===== 홈 화면 경로 분기 =====
  initHomeScreen();

  const pdfFileInput = document.getElementById('pdf-file');
  const uploadBtn = document.getElementById('upload-btn');
  const analyzeBtn = document.getElementById('analyze-btn');

  // ===== API 키 UI 초기화 =====
  initApiKeyUI();

  // agents.js에서 키 전환 접근할 수 있도록 전역 등록
  window._rmaGetApiKey = getApiKey;
  window._rmaSwitchToNextKey = switchToNextKey;

  // ===== PDF 업로드 버튼 =====
  if (uploadBtn && pdfFileInput) {
    uploadBtn.addEventListener('click', () => pdfFileInput.click());
    pdfFileInput.addEventListener('change', () => {
      const file = pdfFileInput.files[0];
      if (file) handlePdfFile(file);
    });
  }

  // ===== 분석 시작 =====
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      const apiKey = getApiKey();
      if (!apiKey) {
        ui.showStatus('API 키를 먼저 입력해주세요. 상단 🔑 API 키 > 설정 버튼을 눌러주세요.');
        const body = document.getElementById('api-key-body');
        if (body) body.style.display = 'block';
        const input = document.getElementById('api-key-input');
        if (input) input.focus();
        return;
      }

      // 선택된 섹션
      const selectedSections = [];
      document.querySelectorAll('#section-selector input:checked')
        .forEach(chk => selectedSections.push(chk.value));

      runInitialPipeline(apiKey, selectedSections);
    });
  }

  // ===== Pyodide 사전 로딩 (백그라운드) =====
  // 페이지 로드 후 5초 뒤 백그라운드에서 Python 환경을 미리 초기화
  // 사용자가 분석실습 탭에 도달할 때 즉시 실행 가능
  setTimeout(() => {
    if (!isPyodideReady()) {
      initPyodide().catch(err => console.warn('Pyodide 사전 로딩 실패 (분석 시 재시도):', err.message));
    }
  }, 5000);

}

// ============================================================
// 홈 화면 & 경로 분기 (v6.0)
// ============================================================

/**
 * 화면 전환
 * @param {'home'|'path-a'|'path-b-catalog'|'path-b-learn'} screen
 */
function navigateTo(screen) {
  currentScreen = screen;
  const homeScreen = document.getElementById('home-screen');
  const pathAWrap = document.getElementById('path-a-wrap');
  const pathBWrap = document.getElementById('path-b-wrap');
  const catalogScreen = document.getElementById('catalog-screen');
  const learnScreen = document.getElementById('learn-screen');

  // 모두 숨김
  if (homeScreen) homeScreen.style.display = 'none';
  if (pathAWrap) pathAWrap.style.display = 'none';
  if (pathBWrap) pathBWrap.style.display = 'none';

  // Path B에서는 넓은 레이아웃
  const isWide = screen.startsWith('path-b');
  document.body.classList.toggle('wide-mode', isWide);

  switch (screen) {
    case 'home':
      if (homeScreen) homeScreen.style.display = 'block';
      break;
    case 'path-a':
      if (pathAWrap) pathAWrap.style.display = 'block';
      break;
    case 'path-b-catalog':
      if (pathBWrap) pathBWrap.style.display = 'block';
      if (catalogScreen) catalogScreen.style.display = 'block';
      if (learnScreen) learnScreen.style.display = 'none';
      break;
    case 'path-b-learn':
      if (pathBWrap) pathBWrap.style.display = 'block';
      if (catalogScreen) catalogScreen.style.display = 'none';
      if (learnScreen) learnScreen.style.display = 'flex';
      break;
  }
}

/**
 * 홈 화면 초기화 — 경로 선택 버튼 바인딩
 */
function initHomeScreen() {
  const pathABtn = document.getElementById('path-a-btn');
  const pathBBtn = document.getElementById('path-b-btn');
  const pathBHomeBtn = document.getElementById('path-b-home-btn');
  const backCatalogBtn = document.getElementById('back-catalog-btn');

  if (pathABtn) {
    pathABtn.addEventListener('click', () => navigateTo('path-a'));
  }
  if (pathBBtn) {
    pathBBtn.addEventListener('click', () => {
      navigateTo('path-b-catalog');
      renderCatalog();
    });
  }
  if (pathBHomeBtn) {
    pathBHomeBtn.addEventListener('click', () => navigateTo('home'));
  }
  if (backCatalogBtn) {
    backCatalogBtn.addEventListener('click', () => navigateTo('path-b-catalog'));
  }

  // "← 새 논문 분석하기" 버튼 → 홈으로
  document.querySelectorAll('.home-link').forEach(btn => {
    btn.addEventListener('click', () => navigateTo('home'));
  });

  // 카탈로그 검색
  const searchInput = document.getElementById('catalog-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderCatalog(searchInput.value);
    });
  }

  // 자유 질의 시작
  const freeInput = document.getElementById('catalog-free-input');
  const freeSend = document.getElementById('catalog-free-send');
  if (freeSend && freeInput) {
    const startFreeChat = () => {
      const query = freeInput.value.trim();
      if (!query) return;
      enterLearnScreen(null, query);
    };
    freeSend.addEventListener('click', startFreeChat);
    freeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') startFreeChat();
    });
  }

  // 방법론 드롭다운 변경
  const methodSelect = document.getElementById('learn-method-select');
  if (methodSelect) {
    methodSelect.addEventListener('change', () => {
      const item = getCatalogItem(methodSelect.value);
      if (item) {
        document.getElementById('learn-topbar-title').textContent = `${item.icon} ${item.title}`;
        // TODO: Phase 2에서 Q&A 컨텍스트 전환
      }
    });
  }
}

/**
 * 카탈로그 그리드 렌더링
 * @param {string} [query] - 검색어
 */
function renderCatalog(query) {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;

  const items = query ? searchCatalog(query) : METHODOLOGY_CATALOG;
  const grouped = {};
  for (const item of items) {
    if (!grouped[item.group]) grouped[item.group] = [];
    grouped[item.group].push(item);
  }

  let html = '';
  for (const [groupId, groupItems] of Object.entries(grouped)) {
    const groupMeta = METHODOLOGY_GROUPS[groupId];
    html += `<div class="catalog-group">
      <div class="catalog-group-label">${groupMeta.icon} ${groupMeta.label}</div>
      <div class="catalog-group-cards">`;
    for (const item of groupItems) {
      const diffClass = `diff-${item.difficulty}`;
      html += `<button class="catalog-card ${diffClass}" data-id="${item.id}">
        <span class="catalog-card-icon">${item.icon}</span>
        <span class="catalog-card-title">${item.title}</span>
        <span class="catalog-card-subtitle">${item.subtitle}</span>
        <span class="catalog-card-desc">${item.description}</span>
      </button>`;
    }
    html += `</div></div>`;
  }
  grid.innerHTML = html;

  // 카드 클릭 이벤트
  grid.querySelectorAll('.catalog-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      enterLearnScreen(id);
    });
  });
}

/**
 * 학습 화면 진입
 * @param {string|null} categoryId - 선택된 방법론 ID (null이면 자유 질의)
 * @param {string} [freeQuery] - 자유 질의 텍스트
 */
function enterLearnScreen(categoryId, freeQuery) {
  // 방법론 드롭다운 채우기
  const select = document.getElementById('learn-method-select');
  if (select) {
    select.innerHTML = METHODOLOGY_CATALOG.map(m =>
      `<option value="${m.id}" ${m.id === categoryId ? 'selected' : ''}>${m.icon} ${m.title}</option>`
    ).join('');
  }

  // 상단 바 제목
  const titleEl = document.getElementById('learn-topbar-title');
  if (categoryId) {
    const item = getCatalogItem(categoryId);
    if (titleEl && item) titleEl.textContent = `${item.icon} ${item.title}`;
  } else {
    if (titleEl) titleEl.textContent = '🎓 방법론 학습';
  }

  // 초기 환영 메시지
  const chatMessages = document.getElementById('learn-chat-messages');
  if (chatMessages) {
    if (categoryId) {
      const item = getCatalogItem(categoryId);
      chatMessages.innerHTML = `
        <div class="chat-bubble chat-ai">
          <strong>${item.icon} ${item.title} (${item.subtitle})</strong>에 대해 학습을 시작합니다!<br><br>
          ${item.description}<br><br>
          궁금한 점을 자유롭게 질문하거나, 아래 빠른 도구 버튼을 사용해보세요.
        </div>`;
    } else if (freeQuery) {
      chatMessages.innerHTML = `
        <div class="chat-bubble chat-user">${freeQuery}</div>
        <div class="chat-bubble chat-ai">
          질문을 분석하고 있습니다... 잠시만 기다려주세요.
        </div>`;
    }
  }

  // 결과 영역 초기화
  const resultBody = document.getElementById('learn-result-body');
  if (resultBody) {
    resultBody.innerHTML = '<div class="learn-empty-state">코드를 실행하면 결과가 여기에 표시됩니다</div>';
  }

  // 코드 편집기 초기화
  const codeEditor = document.getElementById('learn-code-editor');
  if (codeEditor) codeEditor.value = '';

  navigateTo('path-b-learn');

  // 채팅 모듈 초기화
  const item = categoryId ? getCatalogItem(categoryId) : null;
  initChat(categoryId, item?.title);

  // 방법론 개요 자동 생성 (API 키 있으면 Gemini로)
  if (item) {
    showMethodologyOverview(categoryId, {
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      description: item.description,
    });
  }

  // 자유 질의가 있으면 Gemini로 전송
  if (freeQuery && !categoryId) {
    // 채팅 모듈이 초기화된 후 자유 질의 처리
    const chatInput = document.getElementById('learn-chat-input');
    if (chatInput) {
      chatInput.value = freeQuery;
      document.getElementById('learn-chat-send')?.click();
    }
  }
}

/**
 * API 키 UI 초기화 — 멀티 키 (최대 3개) 토글, 저장, 상태 표시
 */
function initApiKeyUI() {
  const toggleBtn = document.getElementById('api-key-toggle');
  const body = document.getElementById('api-key-body');

  // URL 파라미터에서 키 가져와 첫 슬롯에 저장
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get('key') || params.get('apiKey') || params.get('api_key');
  if (urlKey) {
    try { localStorage.setItem(STORAGE_KEYS[0], urlKey); } catch { /* 무시 */ }
  }

  // 레거시 단일 키 → 슬롯1로 마이그레이션
  try {
    const legacyKey = localStorage.getItem(STORAGE_KEY);
    if (legacyKey && !localStorage.getItem(STORAGE_KEYS[0])) {
      localStorage.setItem(STORAGE_KEYS[0], legacyKey);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* 무시 */ }

  updateApiKeyStatus();

  // 토글 버튼
  if (toggleBtn && body) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '닫기' : '설정';
      if (isHidden) refreshKeyInputPlaceholders();
    });
  }

  // 각 슬롯의 저장 버튼 바인딩
  for (let i = 0; i < 3; i++) {
    const saveBtn = document.getElementById(`save-key-btn-${i}`);
    const input = document.getElementById(`api-key-input-${i}`);
    if (saveBtn && input) {
      saveBtn.addEventListener('click', () => saveApiKeySlot(i));
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKeySlot(i);
      });
    }
  }
}

/**
 * 슬롯별 API 키 저장
 */
function saveApiKeySlot(slotIndex) {
  const input = document.getElementById(`api-key-input-${slotIndex}`);
  if (!input) return;

  const key = input.value.trim();
  if (!key) {
    // 빈 값 → 슬롯 삭제
    try { localStorage.removeItem(STORAGE_KEYS[slotIndex]); } catch { /* 무시 */ }
  } else {
    try { localStorage.setItem(STORAGE_KEYS[slotIndex], key); } catch { /* 무시 */ }
  }
  input.value = '';
  refreshKeyInputPlaceholders();
  updateApiKeyStatus();
}

/**
 * 키 입력 필드 placeholder 업데이트
 */
function refreshKeyInputPlaceholders() {
  for (let i = 0; i < 3; i++) {
    const input = document.getElementById(`api-key-input-${i}`);
    if (!input) continue;
    try {
      const saved = localStorage.getItem(STORAGE_KEYS[i]);
      if (saved) {
        input.placeholder = `저장됨: ${saved.slice(0, 6)}...${saved.slice(-4)}`;
      } else {
        input.placeholder = `API 키 ${i + 1} 입력`;
      }
    } catch {
      input.placeholder = `API 키 ${i + 1} 입력`;
    }
  }
}

/**
 * API 키 상태 표시 업데이트
 */
function updateApiKeyStatus() {
  const statusEl = document.getElementById('api-key-status');
  if (!statusEl) return;

  const keys = getAllApiKeys();
  const count = keys.length;
  if (count > 0) {
    const active = keys[0];
    statusEl.textContent = `✅ ${count}개 키 (활성: ${active.slice(0, 4)}...${active.slice(-4)})`;
    statusEl.className = 'api-key-status has-key';
  } else {
    statusEl.textContent = '❌ 미설정';
    statusEl.className = 'api-key-status no-key';
  }
}

/**
 * 저장된 모든 API 키 목록 반환 (빈 슬롯 제외)
 */
function getAllApiKeys() {
  const keys = [];
  for (const sk of STORAGE_KEYS) {
    try {
      const k = localStorage.getItem(sk);
      if (k && k.trim()) keys.push(k.trim());
    } catch { /* 무시 */ }
  }
  return keys;
}

/**
 * 현재 활성 API 키 가져오기
 * 429 에러 시 switchToNextKey()로 인덱스 전환 후 재호출됨
 * @returns {string}
 */
function getApiKey() {
  const keys = getAllApiKeys();
  if (keys.length === 0) return '';
  // 인덱스가 범위를 벗어나면 리셋
  if (currentKeyIndex >= keys.length) currentKeyIndex = 0;
  return keys[currentKeyIndex];
}

/**
 * 다음 API 키로 전환 (429 에러 시 호출)
 * @returns {string|null} 다음 키 또는 null (더 이상 키 없음)
 */
function switchToNextKey() {
  const keys = getAllApiKeys();
  if (keys.length <= 1) return null;
  const prevIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  // 모든 키를 한 바퀴 돌았으면 null
  if (currentKeyIndex === 0 && prevIndex === keys.length - 1) return null;
  const nextKey = keys[currentKeyIndex];
  console.log(`[API 키 전환] 키${prevIndex + 1} → 키${currentKeyIndex + 1} (${nextKey.slice(0, 4)}...${nextKey.slice(-4)})`);
  updateApiKeyStatus();
  return nextKey;
}

// (전역 등록은 init() 안에서 수행)

/**
 * PDF 파일 선택 시 처리
 * v5: PDF 바이너리를 base64로 저장 → Gemini 멀티모달에 직접 전송.
 *     pdf.js 텍스트 추출은 폴백으로만 유지.
 * @param {File} file
 */
async function handlePdfFile(file) {
  resetExtractedText();
  ui.showPdfFileName(file.name);

  try {
    // 1단계: PDF base64 변환 + 페이지 수 확인
    const result = await processPdfFile(file, (msg) => {
      ui.showPdfProgress(msg);
    });

    // 성공: 페이지 수 + 파일 크기 표시
    ui.showPdfSuccess(result.pages, result.sizeKB);

    // 2단계: 텍스트 기반 폴백을 위해 pdf.js 텍스트도 추출 (백그라운드)
    // Gemini 멀티모달 실패 시 사용됨
    extractTextFromPDF(file, () => {}).catch(() => {
      // 텍스트 추출 실패해도 무시 — 멀티모달이 메인
      console.info('텍스트 폴백 추출 실패 (무시됨 — 멀티모달 사용)');
    });

    // 입력 카드 표시 (분석 깊이 + 분석 시작 버튼)
    const inputCard = document.getElementById('input-card');
    if (inputCard) inputCard.style.display = 'block';
  } catch (err) {
    ui.showPdfError(err.message);
  }
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', init);
