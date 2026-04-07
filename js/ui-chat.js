/**
 * ui-chat.js — 대화형 Q&A UI 모듈 (경로 B: 방법론 학습)
 * ResearchMethodAgent v6.0
 *
 * Gemini API 연동 + 채팅 메시지 렌더링 + 코드↔Q&A 연동
 * 코드 실행 → 결과 → AI 해석 통합
 */

import {
  generateMethodologyOverview,
  runMethodologyChat,
  interpretResult,
  generateQuickToolCode,
} from './agents.js';
import { initPyodide, runPython, isPyodideReady } from './pyodide-runner.js';

/** @type {Array<{role: 'user'|'ai', content: string, code?: string}>} */
let chatHistory = [];

/** @type {string|null} 현재 선택된 카테고리 ID */
let currentCategory = null;

/** @type {string|null} 현재 선택된 카테고리 한글 제목 */
let currentCategoryTitle = null;

/** @type {boolean} 현재 AI 응답 대기 중 */
let isProcessing = false;

/** @type {string|null} 최근 실행 결과 텍스트 */
let lastExecutionResult = null;

/**
 * API 키 가져오기 (main.js에서 전역 등록한 함수)
 * @returns {string}
 */
function getApiKey() {
  return window._rmaGetApiKey ? window._rmaGetApiKey() : '';
}

/**
 * 채팅 모듈 초기화
 * @param {string|null} categoryId - 선택된 방법론 카테고리 ID
 * @param {string|null} categoryTitle - 선택된 방법론 한글 제목
 */
export function initChat(categoryId, categoryTitle) {
  currentCategory = categoryId;
  currentCategoryTitle = categoryTitle;
  chatHistory = [];
  lastExecutionResult = null;
  isProcessing = false;

  bindEventListeners();
  bindRunButton();
}

/**
 * 이벤트 리스너 바인딩 (기존 리스너 제거 후 재등록)
 */
function bindEventListeners() {
  // 전송 버튼
  const sendBtn = document.getElementById('learn-chat-send');
  if (sendBtn) {
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    newSendBtn.addEventListener('click', handleSend);
  }

  // 채팅 입력
  const chatInput = document.getElementById('learn-chat-input');
  if (chatInput) {
    const newInput = chatInput.cloneNode(true);
    chatInput.parentNode.replaceChild(newInput, chatInput);
    newInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // 빠른 도구 버튼
  document.querySelectorAll('.learn-quick-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      handleQuickTool(newBtn.dataset.action);
    });
  });
}

/**
 * 실행 버튼 + AI 수정 버튼 바인딩
 */
function bindRunButton() {
  const runBtn = document.getElementById('learn-run-btn');
  if (runBtn) {
    const newBtn = runBtn.cloneNode(true);
    runBtn.parentNode.replaceChild(newBtn, runBtn);
    newBtn.addEventListener('click', handleRunCode);
  }

  const aiEditBtn = document.getElementById('learn-ai-edit-btn');
  if (aiEditBtn) {
    const newBtn = aiEditBtn.cloneNode(true);
    aiEditBtn.parentNode.replaceChild(newBtn, aiEditBtn);
    newBtn.addEventListener('click', handleAiEdit);
  }
}

// ============================================================
// 메시지 처리
// ============================================================

/**
 * 채팅 메시지 전송 처리
 */
async function handleSend() {
  if (isProcessing) return;
  const input = document.getElementById('learn-chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  appendMessage('user', text);

  const apiKey = getApiKey();
  if (!apiKey) {
    appendMessage('ai', '⚠️ API 키가 설정되지 않았습니다. 상단의 🔑 API 키를 먼저 설정해주세요.');
    return;
  }

  await sendToGemini(text);
}

/**
 * Gemini API로 질문 전송
 * @param {string} question
 */
async function sendToGemini(question) {
  isProcessing = true;
  const loadingBubble = appendLoadingBubble();

  try {
    const apiKey = getApiKey();
    const codeEditor = document.getElementById('learn-code-editor');
    const context = {
      category: currentCategory,
      categoryTitle: currentCategoryTitle || currentCategory,
      currentCode: codeEditor?.value || '',
      lastResult: lastExecutionResult,
      chatHistory: chatHistory,
    };

    const { answer, code } = await runMethodologyChat(apiKey, question, context);
    removeLoadingBubble(loadingBubble);
    appendMessage('ai', answer, code);
  } catch (err) {
    removeLoadingBubble(loadingBubble);
    appendMessage('ai', `⚠️ 오류가 발생했습니다: ${err.message}<br>다시 시도해주세요.`);
  } finally {
    isProcessing = false;
  }
}

/**
 * 빠른 도구 버튼 클릭 처리
 * @param {string} action
 */
async function handleQuickTool(action) {
  if (isProcessing) return;

  const actionLabels = {
    'descriptive': '📊 기술통계를 실행해주세요',
    'visualization': '📈 시각화를 만들어주세요',
    'assumption': '🧪 가정 검정을 실행해주세요',
    'generate-data': '🔄 가상 데이터를 생성해주세요',
    'apa-report': '📝 APA 스타일 보고서를 작성해주세요',
    'recommend': '💡 추천 분석 방법을 알려주세요',
  };

  const text = actionLabels[action] || action;
  appendMessage('user', text);

  const apiKey = getApiKey();
  if (!apiKey) {
    appendMessage('ai', '⚠️ API 키가 설정되지 않았습니다. 상단의 🔑 API 키를 먼저 설정해주세요.');
    return;
  }

  isProcessing = true;
  const loadingBubble = appendLoadingBubble();

  try {
    const codeEditor = document.getElementById('learn-code-editor');
    const context = {
      category: currentCategory,
      categoryTitle: currentCategoryTitle || currentCategory,
      currentCode: codeEditor?.value || '',
    };

    const { code, explanation } = await generateQuickToolCode(apiKey, action, context);
    removeLoadingBubble(loadingBubble);

    appendMessage('ai', `${explanation}<br><br>좌측 코드 편집기에 코드를 삽입했습니다. <strong>▶ 실행</strong>을 눌러 결과를 확인하세요.`, code);
  } catch (err) {
    removeLoadingBubble(loadingBubble);
    appendMessage('ai', `⚠️ 코드 생성 중 오류: ${err.message}`);
  } finally {
    isProcessing = false;
  }
}

// ============================================================
// 코드 실행 & 결과 해석
// ============================================================

/**
 * ▶ 실행 버튼 클릭 — Pyodide에서 코드 실행 + 결과 표시 + AI 해석
 */
async function handleRunCode() {
  const codeEditor = document.getElementById('learn-code-editor');
  const resultBody = document.getElementById('learn-result-body');
  if (!codeEditor || !resultBody) return;

  const code = codeEditor.value.trim();
  if (!code) {
    resultBody.innerHTML = '<div class="learn-empty-state">실행할 코드가 없습니다. Q&A에서 분석을 요청해보세요.</div>';
    return;
  }

  // 실행 중 표시
  resultBody.innerHTML = '<div class="learn-result-loading">⏳ Python 실행 중...</div>';

  try {
    // Pyodide 초기화
    if (!isPyodideReady()) {
      resultBody.innerHTML = '<div class="learn-result-loading">⏳ Python 환경 로딩 중... (첫 실행 시 10-15초)</div>';
      await initPyodide();
    }

    // 코드 실행
    const result = await runPython(code);

    // 결과 렌더링
    let resultHtml = '';
    if (result.error) {
      resultHtml = `<div class="learn-result-error"><strong>❌ 오류</strong><pre>${escapeHtml(result.error)}</pre></div>`;
      lastExecutionResult = `오류: ${result.error}`;
    } else {
      const stdout = result.stdout || '(출력 없음)';
      resultHtml = `<div class="learn-result-stdout"><pre>${escapeHtml(stdout)}</pre></div>`;

      // 그래프가 있으면 표시 (base64 → data URL)
      if (result.images && result.images.length > 0) {
        for (const img of result.images) {
          resultHtml += `<div class="learn-result-chart"><img src="data:image/png;base64,${img}" alt="Chart"></div>`;
        }
      }

      lastExecutionResult = stdout;
    }

    resultBody.innerHTML = resultHtml;

    // AI 자동 해석 (결과가 있고 API 키가 있으면)
    const apiKey = getApiKey();
    if (!result.error && apiKey && lastExecutionResult && lastExecutionResult !== '(출력 없음)') {
      requestResultInterpretation(apiKey, code, lastExecutionResult);
    }
  } catch (err) {
    resultBody.innerHTML = `<div class="learn-result-error"><strong>❌ 실행 실패</strong><pre>${escapeHtml(err.message)}</pre></div>`;
    lastExecutionResult = `실행 실패: ${err.message}`;
  }
}

/**
 * AI 수정 버튼 — 코드 수정 요청을 채팅으로 전환
 */
function handleAiEdit() {
  const input = document.getElementById('learn-chat-input');
  if (input) {
    input.value = '이 코드를 개선해주세요: ';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

/**
 * 실행 결과 AI 해석 요청 (비동기, 채팅에 자동 추가)
 */
async function requestResultInterpretation(apiKey, code, result) {
  try {
    const interpretation = await interpretResult(
      apiKey, code, result, currentCategoryTitle || currentCategory || '통계 분석'
    );
    appendMessage('ai', `📊 <strong>결과 해석</strong><br><br>${interpretation}`);
  } catch {
    // 해석 실패는 무시 (필수가 아님)
  }
}

// ============================================================
// 방법론 개요 생성
// ============================================================

/**
 * 방법론 개요를 생성하여 채팅에 표시
 * @param {string|null} categoryId
 * @param {Object} methodInfo - { id, title, subtitle, description }
 */
export async function showMethodologyOverview(categoryId, methodInfo) {
  if (!categoryId || !methodInfo) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    // API 키 없으면 정적 개요만 표시
    return;
  }

  const loadingBubble = appendLoadingBubble();
  try {
    const overview = await generateMethodologyOverview(apiKey, methodInfo);
    removeLoadingBubble(loadingBubble);

    // 마크다운 → HTML 간단 변환
    const html = simpleMarkdownToHtml(overview);
    appendMessage('ai', html);
  } catch {
    removeLoadingBubble(loadingBubble);
    // 실패 시 무시 — 정적 환영 메시지가 이미 표시됨
  }
}

// ============================================================
// UI 헬퍼
// ============================================================

/**
 * 채팅 메시지 추가
 * @param {'user'|'ai'} role
 * @param {string} content - HTML 컨텐츠
 * @param {string} [code] - 코드 편집기에 삽입할 Python 코드
 */
export function appendMessage(role, content, code) {
  chatHistory.push({ role, content, code });

  const container = document.getElementById('learn-chat-messages');
  if (!container) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble chat-${role}`;
  bubble.innerHTML = content;
  container.appendChild(bubble);

  // 코드가 포함된 AI 응답이면 코드 편집기에 삽입
  if (role === 'ai' && code) {
    const codeEditor = document.getElementById('learn-code-editor');
    if (codeEditor) {
      codeEditor.value = code;
      // 코드 삽입 알림 효과
      codeEditor.classList.add('code-flash');
      setTimeout(() => codeEditor.classList.remove('code-flash'), 600);
    }
  }

  // 스크롤 하단으로
  container.scrollTop = container.scrollHeight;
}

/**
 * 로딩 버블 추가 (타이핑 중 애니메이션)
 * @returns {HTMLElement}
 */
function appendLoadingBubble() {
  const container = document.getElementById('learn-chat-messages');
  if (!container) return null;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-ai chat-loading';
  bubble.innerHTML = '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span> 생각 중...';
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

/**
 * 로딩 버블 제거
 * @param {HTMLElement} bubble
 */
function removeLoadingBubble(bubble) {
  if (bubble && bubble.parentNode) {
    bubble.parentNode.removeChild(bubble);
  }
}

/**
 * HTML 이스케이프
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 간단한 마크다운 → HTML 변환
 */
function simpleMarkdownToHtml(md) {
  return md
    // 코드 블록
    .replace(/```python\s*([\s\S]*?)```/g, '<pre class="chat-code-block"><code>$1</code></pre>')
    .replace(/```\s*([\s\S]*?)```/g, '<pre class="chat-code-block"><code>$1</code></pre>')
    // 인라인 코드
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 헤더
    .replace(/^### (.+)$/gm, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>')
    // 볼드
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 리스트
    .replace(/^- (.+)$/gm, '• $1')
    .replace(/^\d+\. (.+)$/gm, (_, text, offset, full) => {
      // 번호 리스트 유지
      const linesBefore = full.slice(0, offset).split('\n');
      return `${linesBefore.length}. ${text}`;
    })
    // 줄바꿈
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

/**
 * 현재 채팅 히스토리 반환
 * @returns {Array}
 */
export function getChatHistory() {
  return [...chatHistory];
}

/**
 * 채팅 히스토리 초기화
 */
export function clearChat() {
  chatHistory = [];
  lastExecutionResult = null;
  const container = document.getElementById('learn-chat-messages');
  if (container) container.innerHTML = '';
}
