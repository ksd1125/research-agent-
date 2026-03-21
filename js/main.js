/**
 * main.js — 앱 초기화 및 이벤트 바인딩
 * ResearchMethodAgent v4.0
 */

import * as ui from './ui.js';
import { extractTextFromPDF, initDropZone, resetExtractedText } from './pdf.js';
import { runPipeline } from './pipeline.js';
import { abortPipeline } from './agents.js';

/**
 * 앱 초기화
 */
function init() {
  // 탭 전환
  ui.dom.tabText.addEventListener('click', () => ui.switchTab('text'));
  ui.dom.tabPdf.addEventListener('click',  () => ui.switchTab('pdf'));

  // PDF 드롭존 초기화
  initDropZone(ui.dom.dropZone, ui.dom.pdfFile, handlePdfFile);

  // 실행 버튼
  ui.dom.runBtn.addEventListener('click', runPipeline);

  // 취소 버튼
  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      abortPipeline();
      ui.showInputView();
      ui.showStatus('분석이 취소되었습니다.');
    });
  }

  // 새 분석 (결과 화면 → 초기화)
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('home-link')) {
      location.reload();
    }
  });
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
  } catch (err) {
    ui.showPdfError(err.message);
  }
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', init);
