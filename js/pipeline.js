/**
 * pipeline.js — v5 파이프라인 오케스트레이션
 * ResearchMethodAgent v5.0
 *
 * v5 파이프라인:
 * [초기] PDF 텍스트 추출 → Agent 1 (문서분석) → Agent 4+ (데이터 구조)
 *        → 탭 1 렌더링 (논문 개요 & 데이터 구조)
 *
 * [온디맨드] 탭 2 진입 → Agent 2 (통계해석) + Step 목록 생성
 * [온디맨드] Step [실행] 클릭 → simulator.js (결과 시뮬레이션)
 * [온디맨드] 탭 3 [리뷰 생성] 클릭 → Agent 6+ (리뷰 & 대안)
 * [온디맨드] 탭 4 Q&A → Agent 5 (Q&A)
 */

import { MESSAGES } from './config.js';
import { escapeHtml } from './utils.js';
import {
  runAgent1,
  runAgent2,
  runAgent4Plus,
  runReviewGuide,
  runQnA,
  createAbortController,
  abortPipeline,
  getAnalysisProfile,
} from './agents.js';
import { getExtractedText, getPdfBase64 } from './pdf.js';
import { convertPdfToMarkdown } from './mockdata.js';
import { getStepsForCategory } from './steps.js';
import { simulateExecution, simulateAlternativeMethod } from './simulator.js';
import * as ui from './ui.js';

/* ============================================================
   앱 상태 관리
   ============================================================ */

/** @type {Object} 파이프라인 전체 상태 */
const state = {
  apiKey: '',
  paperText: '',           // 원본/변환된 논문 텍스트
  docResult: null,         // Agent 1 결과
  paperContext: null,      // Agent 1의 paper_context
  methods: [],             // Agent 1의 detected_methods (최대 2개)
  dataStructure: null,     // Agent 4+의 결과 (데이터 구조 + 변수 테이블)
  statResults: {},         // Agent 2 결과 캐시: { methodIndex: statResult }
  steps: {},               // Step 목록 캐시: { methodIndex: stepsArray }
  simulationResults: {},   // 시뮬레이션 결과 캐시: { 'methodIdx-stepId': result }
  reviewResult: null,      // Agent 6+ 결과 (peer, alternatives, future)
  selectedMethod: 0,       // 현재 선택된 방법론 인덱스
  depth: 'basic',          // 분석 깊이 (basic, intermediate, advanced)
  selectedSections: [],    // 선택된 분석 대상 섹션
};

/**
 * 상태 접근자
 */
export function getState() { return state; }
export function getApiKey() { return state.apiKey; }
export function getPaperText() { return state.paperText; }
export function getPaperContext() { return state.paperContext; }
export function getDataStructure() { return state.dataStructure; }
export function getMethods() { return state.methods; }
export function getDocResult() { return state.docResult; }

/* ============================================================
   Phase 1: 초기 파이프라인 (PDF 업로드 → Agent 1 → Agent 4+)
   ============================================================ */

/**
 * 초기 파이프라인 실행
 * @param {string} apiKey — Gemini API 키
 * @param {string} depth — 분석 깊이 (basic/intermediate/advanced)
 * @param {string[]} selectedSections — 분석 대상 섹션
 */
export async function runInitialPipeline(apiKey, depth, selectedSections) {
  state.apiKey = apiKey;
  state.depth = depth || 'basic';
  state.selectedSections = selectedSections || [];

  const pdfBase64 = getPdfBase64();
  const rawInput = getExtractedText();

  // 입력 검증: PDF base64 또는 텍스트 입력 중 하나는 있어야 함
  if (!apiKey)                  { ui.showStatus(MESSAGES.errors.noApiKey);  return; }
  if (!pdfBase64 && !rawInput)  { ui.showStatus(MESSAGES.errors.noPdfText); return; }

  // UI: 로딩 시작
  createAbortController();
  ui.showLoadingView();

  try {
    // ===== Step 0: PDF → Markdown 변환 =====
    ui.updateLoadingStep(0, 'running');
    if (pdfBase64) {
      ui.setLoadingMessage('PDF를 Gemini 멀티모달로 분석하여 구조화 중... (표/그림 직접 인식)');
    } else {
      ui.setLoadingMessage('PDF 텍스트를 구조화된 마크다운으로 변환 중...');
    }

    let inputText = rawInput || '';
    try {
      inputText = await convertPdfToMarkdown(apiKey, pdfBase64, rawInput);
    } catch (err) {
      console.warn('PDF→MD 변환 실패, 원본 텍스트 사용:', err.message);
      // 폴백: rawInput이 있으면 그대로 사용
      if (!rawInput) throw err;
      inputText = rawInput;
    }
    state.paperText = inputText;
    ui.updateLoadingStep(0, 'done');

    // ===== Step 1: Agent 1 — 문서 분석 =====
    ui.updateLoadingStep(1, 'running');
    ui.setLoadingMessage('논문의 학문 분야와 연구 방법론을 분석 중...');

    const docResult = await runAgent1(apiKey, inputText);
    state.docResult = docResult;
    state.paperContext = docResult.paper_context || {};
    state.methods = (docResult.detected_methods || []).slice(0, 2);

    ui.updateLoadingStep(1, 'done');

    // 방법론 미감지 시
    if (state.methods.length === 0) {
      ui.showStatus(MESSAGES.errors.noMethods);
      ui.showInputView();
      return;
    }

    // ===== Step 2: Agent 4+ — 데이터 구조 추출 =====
    ui.updateLoadingStep(2, 'running');
    ui.setLoadingMessage('데이터 구조와 변수 정보를 추출 중...');

    try {
      const dataStructure = await runAgent4Plus(
        apiKey, inputText, state.paperContext, state.methods
      );
      state.dataStructure = dataStructure;
    } catch (err) {
      console.warn('Agent 4+ (데이터 구조) 실패:', err.message);
      state.dataStructure = null;
    }
    ui.updateLoadingStep(2, 'done');

    // ===== 결과 렌더링: 탭 1 =====
    ui.renderInitialResult(docResult, state.dataStructure);
    ui.showResultView();

  } catch (err) {
    ui.showInputView();
    ui.showStatus(`오류 발생: ${err.message}`);
  }
}

/* ============================================================
   Phase 2: 온디맨드 — 탭 2 진입 시 Agent 2 + Step 목록 생성
   ============================================================ */

/**
 * 방법론 통계 해석 + Step 목록 생성 (탭 2 진입 시)
 * @param {number} methodIndex — 방법론 인덱스 (0 or 1)
 * @returns {Promise<{ statResult: Object, steps: Array }>}
 */
export async function loadAnalysisSteps(methodIndex = 0) {
  state.selectedMethod = methodIndex;
  const method = state.methods[methodIndex];
  if (!method) throw new Error('선택된 방법론이 없습니다.');

  // 캐시 확인
  if (state.statResults[methodIndex] && state.steps[methodIndex]) {
    return {
      statResult: state.statResults[methodIndex],
      steps: state.steps[methodIndex],
    };
  }

  // Agent 2: 통계 해석
  const statResult = await runAgent2(state.apiKey, method, state.paperContext);
  state.statResults[methodIndex] = statResult;

  // Step 목록 생성 (steps.js)
  const category = state.paperContext.analysis_category || 'regression';
  const steps = getStepsForCategory(category, method, state.paperContext);
  state.steps[methodIndex] = steps;

  return { statResult, steps };
}

/* ============================================================
   Phase 3: 온디맨드 — Step [실행] 클릭 시 시뮬레이션
   ============================================================ */

/**
 * Step 실행 (결과 시뮬레이션)
 * @param {number} methodIndex — 방법론 인덱스
 * @param {string} stepId — Step ID
 * @param {string} code — 실행할 코드
 * @param {string} lang — 'python' or 'r'
 * @returns {Promise<Object>} — { table, chartDesc, interpretation, paperComparison }
 */
export async function executeStep(methodIndex, stepId, code, lang) {
  const cacheKey = `${methodIndex}-${stepId}-${lang}`;

  // 캐시 확인
  if (state.simulationResults[cacheKey]) {
    return state.simulationResults[cacheKey];
  }

  const method = state.methods[methodIndex];
  const keyVars = method?.key_variables || {};
  const dataStats = state.dataStructure?.variables || [];

  // 기술통계를 컨텍스트로 구성
  const descriptiveStats = {};
  dataStats.forEach(v => {
    if (v.name_en && v.mean !== null) {
      descriptiveStats[v.name_en] = {
        mean: v.mean, sd: v.sd, min: v.min, max: v.max,
      };
    }
  });

  const context = {
    domain: state.paperContext.domain,
    analysisType: method?.analysis_type,
    outcome: keyVars.outcome,
    treatment: keyVars.treatment,
    dataCharacteristics: state.paperContext.data_characteristics,
    descriptiveStats,
  };

  const result = await simulateExecution(state.apiKey, code, lang, context);
  state.simulationResults[cacheKey] = result;
  return result;
}

/* ============================================================
   Phase 4: 온디맨드 — 탭 3 리뷰 & 대안 방법론
   ============================================================ */

/**
 * 리뷰 & 대안 방법론 생성 (탭 3에서 [리뷰 & 대안 생성] 클릭 시)
 * @param {number} methodIndex — 방법론 인덱스
 * @returns {Promise<{ peer: string, alternatives: string, future: string }>}
 */
export async function loadReview(methodIndex = 0) {
  // 캐시 확인
  if (state.reviewResult) {
    return state.reviewResult;
  }

  const method = state.methods[methodIndex];
  const statResult = state.statResults[methodIndex] || {
    standard_name: method?.raw_name || '미지정',
    steps: [],
  };

  const result = await runReviewGuide(
    state.apiKey, state.paperContext, statResult, method
  );
  state.reviewResult = result;
  return result;
}

/**
 * 대안 방법론으로 분석 시뮬레이션
 * @param {string} altMethodName — 대안 방법론 이름
 * @param {number} methodIndex — 원본 방법론 인덱스
 * @returns {Promise<Object>}
 */
export async function executeAlternativeMethod(altMethodName, methodIndex = 0) {
  const method = state.methods[methodIndex];
  const keyVars = method?.key_variables || {};
  const dataStats = state.dataStructure?.variables || [];

  const descriptiveStats = {};
  dataStats.forEach(v => {
    if (v.name_en && v.mean !== null) {
      descriptiveStats[v.name_en] = {
        mean: v.mean, sd: v.sd, min: v.min, max: v.max,
      };
    }
  });

  const context = {
    domain: state.paperContext.domain,
    originalMethod: method?.raw_name,
    outcome: keyVars.outcome,
    treatment: keyVars.treatment,
    dataCharacteristics: state.paperContext.data_characteristics,
    descriptiveStats,
  };

  return await simulateAlternativeMethod(
    state.apiKey, altMethodName, context, null
  );
}

/* ============================================================
   Phase 5: 온디맨드 — 탭 4 Q&A
   ============================================================ */

/**
 * Q&A 질문 전송
 * @param {string} question — 사용자 질문
 * @returns {Promise<string>} — 답변 텍스트
 */
export async function sendQnA(question) {
  return await runQnA(
    state.apiKey, question, state.paperText, state.paperContext
  );
}

/* ============================================================
   유틸리티
   ============================================================ */

/**
 * 파이프라인 취소 (agents.js에서 import 후 re-export)
 */
export { abortPipeline };

/**
 * 상태 초기화
 */
export function resetState() {
  state.apiKey = '';
  state.paperText = '';
  state.docResult = null;
  state.paperContext = null;
  state.methods = [];
  state.dataStructure = null;
  state.statResults = {};
  state.steps = {};
  state.simulationResults = {};
  state.reviewResult = null;
  state.selectedMethod = 0;
  state.depth = 'basic';
  state.selectedSections = [];
}
