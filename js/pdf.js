/**
 * pdf.js — PDF 업로드 및 텍스트 추출
 * ResearchMethodAgent v4.0
 */

/* pdf.js Worker 경로 설정 (CDN 버전과 일치해야 함) */
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/** @type {string|null} 추출된 텍스트 */
let extractedText = null;

/**
 * 현재 추출된 PDF 텍스트 반환
 * @returns {string|null}
 */
export function getExtractedText() {
  return extractedText;
}

/**
 * 추출 텍스트 초기화
 */
export function resetExtractedText() {
  extractedText = null;
}

/**
 * PDF 파일에서 텍스트를 추출
 * pdf.js 라이브러리 사용 (전역 pdfjsLib)
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
    // pdfjsLib는 CDN에서 전역으로 로드됨
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    let allText = '';

    for (let p = 1; p <= totalPages; p++) {
      onProgress(`📖 텍스트 추출 중... (${p}/${totalPages} 페이지)`);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      allText += pageText + '\n\n';
    }

    extractedText = allText.trim();

    // 스캔 PDF 감지: 텍스트가 거의 없으면 경고
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
    throw new Error(err.message || `텍스트 추출 실패: ${err.message}`);
  }
}

/**
 * PDF 드롭존 이벤트 초기화
 * @param {HTMLElement} dropZone
 * @param {HTMLInputElement} fileInput
 * @param {function} onFileReady — (file: File) => void
 */
export function initDropZone(dropZone, fileInput, onFileReady) {
  // 클릭으로 파일 선택
  dropZone.addEventListener('click', () => fileInput.click());

  // 파일 선택 이벤트
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) onFileReady(file);
  });

  // 드래그 앤 드롭
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
      // 파일 입력에도 반영
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      onFileReady(file);
    }
  });
}
