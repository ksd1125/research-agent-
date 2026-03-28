/**
 * pdf.js — PDF 업로드, 페이지 수 확인, base64 변환
 * ResearchMethodAgent v5.0
 *
 * v5: Gemini File API(멀티모달)를 활용하므로 텍스트 추출은 최소화.
 *     PDF 바이너리를 base64로 변환하여 Gemini에 직접 전송.
 *     pdf.js는 페이지 수 확인 + 스캔 PDF 감지용으로만 사용.
 */

/* pdf.js Worker 경로 설정 (CDN 버전과 일치해야 함) */
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/** @type {string|null} PDF base64 인코딩 데이터 */
let pdfBase64 = null;

/** @type {number} PDF 페이지 수 */
let pdfPageCount = 0;

/** @type {string|null} 기존 호환: 추출된 텍스트 (텍스트 직접 입력 시 사용) */
let extractedText = null;

/**
 * PDF base64 데이터 반환 (Gemini 멀티모달 전송용)
 * @returns {string|null}
 */
export function getPdfBase64() {
  return pdfBase64;
}

/**
 * PDF 페이지 수 반환
 * @returns {number}
 */
export function getPdfPageCount() {
  return pdfPageCount;
}

/**
 * 현재 추출된 텍스트 반환 (텍스트 직접 입력 시 사용)
 * @returns {string|null}
 */
export function getExtractedText() {
  return extractedText;
}

/**
 * 텍스트 직접 입력 시 저장
 * @param {string} text
 */
export function setExtractedText(text) {
  extractedText = text;
}

/**
 * 모든 PDF/텍스트 데이터 초기화
 */
export function resetExtractedText() {
  pdfBase64 = null;
  pdfPageCount = 0;
  extractedText = null;
}

/**
 * ArrayBuffer를 base64 문자열로 변환
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * PDF 파일을 처리: base64 변환 + 페이지 수 확인
 * Gemini 멀티모달 API에 직접 전송하기 위한 준비 단계.
 *
 * @param {File} file — PDF File 객체
 * @param {function} onProgress — (message: string) => void 진행 콜백
 * @returns {Promise<{ pages: number, sizeKB: number }>}
 */
export async function processPdfFile(file, onProgress) {
  pdfBase64 = null;
  pdfPageCount = 0;
  extractedText = null;

  onProgress('📄 PDF 파일 읽는 중...');

  try {
    const arrayBuffer = await file.arrayBuffer();

    // 파일 크기 확인 (Gemini inline_data 제한: ~20MB)
    const sizeKB = Math.round(arrayBuffer.byteLength / 1024);
    if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
      throw new Error(
        `PDF 파일이 너무 큽니다 (${Math.round(sizeKB / 1024)}MB).\n` +
        'Gemini API 제한(20MB)을 초과합니다. 더 작은 파일을 사용해주세요.'
      );
    }

    // base64 변환
    onProgress('📄 PDF 데이터 변환 중...');
    pdfBase64 = arrayBufferToBase64(arrayBuffer);

    // pdf.js로 페이지 수 확인
    onProgress('📄 PDF 구조 확인 중...');
    if (typeof pdfjsLib !== 'undefined') {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      pdfPageCount = pdf.numPages;
    }

    return { pages: pdfPageCount, sizeKB };
  } catch (err) {
    pdfBase64 = null;
    pdfPageCount = 0;
    throw new Error(err.message || 'PDF 파일 처리에 실패했습니다. 파일을 확인해주세요.');
  }
}

/**
 * [레거시 호환] PDF 파일에서 텍스트를 추출
 * 텍스트 직접 입력 모드 또는 Gemini API 실패 시 폴백으로 사용
 *
 * @param {File} file — PDF File 객체
 * @param {function} onProgress — (message: string) => void 진행 콜백
 * @returns {Promise<{ text: string, pages: number }>}
 */
export async function extractTextFromPDF(file, onProgress) {
  extractedText = null;
  onProgress('📖 PDF 텍스트 추출 중...');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    let allText = '';

    for (let p = 1; p <= totalPages; p++) {
      onProgress(`📖 텍스트 추출 중... (${p}/${totalPages} 페이지)`);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      let pageText = '';
      let lastY = null;
      for (const item of content.items) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) {
          pageText += '\n';
        } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' ';
        }
        pageText += item.str;
        lastY = item.transform[5];
      }
      allText += pageText.trim() + '\n\n';
    }

    extractedText = allText.trim();

    if (extractedText.length < 50) {
      extractedText = null;
      throw new Error(
        '이 PDF는 스캔된 이미지 문서로 보입니다. 텍스트를 추출할 수 없습니다.\n' +
        '→ "텍스트 붙여넣기" 탭에서 논문 내용을 직접 복사해서 붙여넣어 주세요.'
      );
    }

    return { text: extractedText, pages: totalPages };
  } catch (err) {
    extractedText = null;
    throw new Error(err.message || '텍스트 추출에 실패했습니다. 파일을 확인해주세요.');
  }
}

/**
 * PDF 드롭존 이벤트 초기화
 * @param {HTMLElement} dropZone
 * @param {HTMLInputElement} fileInput
 * @param {function} onFileReady — (file: File) => void
 */
export function initDropZone(dropZone, fileInput, onFileReady) {
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) onFileReady(file);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('active');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('active');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      onFileReady(file);
    }
  });
}
