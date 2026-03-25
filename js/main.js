/**
 * main.js — 앱 초기화 및 이벤트 바인딩
 * ResearchMethodAgent v5.0
 *
 * 역할: PDF 업로드, API 키 관리, 분석 시작 트리거
 * 결과 화면의 탭/버튼 이벤트는 ui.js의 renderInitialResult() 내에서 바인딩됨
 */

import * as ui from './ui.js';
import { extractTextFromPDF, getExtractedText, resetExtractedText } from './pdf.js';
import { runInitialPipeline, resetState } from './pipeline.js';

/** @type {string} 로컬 스토리지 키 */
const STORAGE_KEY = 'rma_api_key';

/**
 * 앱 초기화
 */
function init() {
  const pdfFileInput = document.getElementById('pdf-file');
  const uploadBtn = document.getElementById('upload-btn');
  const analyzeBtn = document.getElementById('analyze-btn');

  // ===== PDF 업로드 버튼 =====
  if (uploadBtn && pdfFileInput) {
    uploadBtn.addEventListener('click', () => pdfFileInput.click());
    pdfFileInput.addEventListener('change', () => {
      const file = pdfFileInput.files[0];
      if (file) handlePdfFile(file);
    });
  }

  // ===== 분석 깊이 선택 =====
  const depthBtns = document.querySelectorAll('.depth-btn');
  depthBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      depthBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ===== 분석 시작 =====
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      const apiKey = getApiKey();
      if (!apiKey) {
        ui.showStatus('API 키가 필요합니다. URL에 ?key=YOUR_KEY를 추가해주세요.');
        return;
      }

      // 분석 깊이
      const activeDepth = document.querySelector('.depth-btn.active');
      const depth = activeDepth ? activeDepth.dataset.depth : 'basic';

      // 선택된 섹션
      const selectedSections = [];
      document.querySelectorAll('#section-selector input:checked')
        .forEach(chk => selectedSections.push(chk.value));

      runInitialPipeline(apiKey, depth, selectedSections);
    });
  }

  // ===== 새 분석 (결과 화면 → 초기화) =====
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('home-link')) {
      resetState();
      location.reload();
    }
  });
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
 * @param {File} file
 */
async function handlePdfFile(file) {
  resetExtractedText();
  ui.showPdfFileName(file.name);

  try {
    const result = await extractTextFromPDF(file, (msg) => {
      ui.showPdfProgress(msg);
    });
    ui.showPdfSuccess(result.pages, Math.round(result.text.length / 2));

    // 입력 카드 표시 (분석 깊이 + 분석 시작 버튼)
    const inputCard = document.getElementById('input-card');
    if (inputCard) inputCard.style.display = 'block';
  } catch (err) {
    ui.showPdfError(err.message);
  }
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', init);
