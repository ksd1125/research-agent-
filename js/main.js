/**
 * main.js — 앱 초기화 및 이벤트 바인딩
 * ResearchMethodAgent v5.0
 *
 * 역할: PDF 업로드, API 키 관리, 분석 시작 트리거
 * 결과 화면의 탭/버튼 이벤트는 ui.js의 renderInitialResult() 내에서 바인딩됨
 */

import * as ui from './ui.js';
import { processPdfFile, extractTextFromPDF, getExtractedText, getPdfBase64, resetExtractedText } from './pdf.js';
import { runInitialPipeline, resetState } from './pipeline.js';
import { initPyodide, isPyodideReady } from './pyodide-runner.js';

/** @type {string} 로컬 스토리지 키 */
const STORAGE_KEY = 'rma_api_key';

/**
 * 앱 초기화
 */
function init() {
  const pdfFileInput = document.getElementById('pdf-file');
  const uploadBtn = document.getElementById('upload-btn');
  const analyzeBtn = document.getElementById('analyze-btn');

  // ===== API 키 UI 초기화 =====
  initApiKeyUI();

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

  // ===== 새 분석 (결과 화면 → 초기화) =====
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('home-link')) {
      resetState();
      location.reload();
    }
  });
}

/**
 * API 키 UI 초기화 — 토글, 저장, 상태 표시
 */
function initApiKeyUI() {
  const toggleBtn = document.getElementById('api-key-toggle');
  const body = document.getElementById('api-key-body');
  const saveBtn = document.getElementById('save-key-btn');
  const input = document.getElementById('api-key-input');
  const statusEl = document.getElementById('api-key-status');

  // URL 파라미터에서 키 가져와 저장
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get('key') || params.get('apiKey') || params.get('api_key');
  if (urlKey) {
    try { localStorage.setItem(STORAGE_KEY, urlKey); } catch { /* 무시 */ }
  }

  // 현재 저장된 키 상태 표시
  updateApiKeyStatus();

  // 토글 버튼
  if (toggleBtn && body) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '닫기' : '설정';
      // 기존 키가 있으면 마스킹 표시
      if (isHidden && input) {
        const savedKey = getApiKey();
        if (savedKey) {
          input.placeholder = '저장됨: ' + savedKey.slice(0, 6) + '...' + savedKey.slice(-4);
        }
      }
    });
  }

  // 저장 버튼
  if (saveBtn && input) {
    saveBtn.addEventListener('click', () => saveApiKeyFromInput());
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveApiKeyFromInput();
    });
  }
}

/**
 * API 키 입력 필드에서 키 저장
 */
function saveApiKeyFromInput() {
  const input = document.getElementById('api-key-input');
  const body = document.getElementById('api-key-body');
  const toggleBtn = document.getElementById('api-key-toggle');

  if (!input) return;
  const key = input.value.trim();
  if (!key) {
    ui.showStatus('API 키를 입력해주세요.');
    return;
  }

  try { localStorage.setItem(STORAGE_KEY, key); } catch { /* 무시 */ }
  input.value = '';
  if (body) body.style.display = 'none';
  if (toggleBtn) toggleBtn.textContent = '설정';
  updateApiKeyStatus();
}

/**
 * API 키 상태 표시 업데이트
 */
function updateApiKeyStatus() {
  const statusEl = document.getElementById('api-key-status');
  if (!statusEl) return;

  const key = getApiKey();
  if (key) {
    statusEl.textContent = `✅ 저장됨 (${key.slice(0, 4)}...${key.slice(-4)})`;
    statusEl.className = 'api-key-status has-key';
  } else {
    statusEl.textContent = '❌ 미설정';
    statusEl.className = 'api-key-status no-key';
  }
}

/**
 * API 키 가져오기 (URL 파라미터 → 로컬 스토리지)
 * @returns {string}
 */
function getApiKey() {
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get('key') || params.get('apiKey') || params.get('api_key');
  if (urlKey) {
    try { localStorage.setItem(STORAGE_KEY, urlKey); } catch { /* 무시 */ }
    return urlKey;
  }
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

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
