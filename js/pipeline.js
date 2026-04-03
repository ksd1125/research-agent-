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

import { MESSAGES, API } from './config.js';
import { escapeHtml } from './utils.js';
import {
  runAgent1,
  runAgent2,
  runAgent4Plus,
  extractCorrelationMatrix,
  extractRegressionAndBuildCorr,
  runReviewGuide,
  runQnA,
  createAbortController,
  abortPipeline,
} from './agents.js';
import { getExtractedText, getPdfBase64, getPdfFile, extractHeadingsFromPDF } from './pdf.js';
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
  reviewResult: null,      // Agent 6+ 결과 (레거시, 단일 캐시)
  reviewResults: {},       // Agent 6+ 결과 캐시: { methodIndex: result }
  selectedMethod: 0,       // 현재 선택된 방법론 인덱스
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
   변수명 해소: Agent1 한국어명 → Agent4+ 영문 컬럼명 매핑
   ============================================================ */

/**
 * Agent1의 한국어 key_variables를 Agent4+의 영문 name_en으로 치환
 * mock 데이터 CSV는 name_en을 컬럼명으로 사용하므로, steps.js 코드 템플릿에
 * 영문명이 들어가야 KeyError가 발생하지 않음
 *
 * @param {Object} method — Agent1의 detected_method (원본은 변경하지 않음)
 * @param {Object|null} dataStructure — Agent4+의 결과 ({ variables: [...] })
 * @returns {Object} — key_variables가 영문명으로 치환된 method 복사본
 */
function resolveVariableNames(method, dataStructure) {
  if (!method?.key_variables || !dataStructure?.variables?.length) {
    return method;
  }

  const vars = dataStructure.variables;

  /**
   * 한국어 변수명에 가장 가까운 Agent4+ 변수의 name_en을 반환
   * 1차: name_kr 정확 일치
   * 2차: name_kr가 한국어명을 포함하거나, 한국어명이 name_kr를 포함
   * 3차: role 기반 폴백 (outcome → role이 '종속' 포함, treatment → role이 '독립'/'처리' 포함)
   */
  function findEnglishName(koreanName, role) {
    if (!koreanName) return koreanName;

    // 1차: 정확 일치
    const exact = vars.find(v => v.name_kr === koreanName);
    if (exact?.name_en) return exact.name_en;

    // 2차: 부분 일치 (양방향)
    const partial = vars.find(v =>
      v.name_kr && (v.name_kr.includes(koreanName) || koreanName.includes(v.name_kr))
    );
    if (partial?.name_en) return partial.name_en;

    // 3차: role 기반 폴백
    if (role === 'outcome') {
      const byRole = vars.find(v =>
        v.role && (v.role.includes('종속') || v.role.includes('결과') || v.role === 'dependent')
      );
      if (byRole?.name_en) return byRole.name_en;
    } else if (role === 'treatment') {
      const byRole = vars.find(v =>
        v.role && (v.role.includes('독립') || v.role.includes('처리') || v.role.includes('핵심') || v.role === 'independent')
      );
      if (byRole?.name_en) return byRole.name_en;
    }

    // 매핑 실패: 원본 반환
    return koreanName;
  }

  // 원본 method 불변 유지 — 얕은 복사 후 key_variables만 교체
  const resolved = { ...method };
  const kv = { ...method.key_variables };

  kv.outcome = findEnglishName(kv.outcome, 'outcome');
  kv.treatment = findEnglishName(kv.treatment, 'treatment');

  // controls가 문자열(쉼표 구분) 또는 배열일 수 있음
  if (kv.controls) {
    if (typeof kv.controls === 'string') {
      kv.controls = kv.controls.split(/[,，]\s*/)
        .map(c => findEnglishName(c.trim(), 'control'))
        .join(', ');
    } else if (Array.isArray(kv.controls)) {
      kv.controls = kv.controls.map(c => findEnglishName(c, 'control'));
    }
  }

  resolved.key_variables = kv;

  // analysis_design의 mediator/moderator도 영문명 매핑
  if (resolved.analysis_design) {
    const ad = { ...resolved.analysis_design };
    if (ad.mediator) ad.mediator = findEnglishName(ad.mediator, 'mediator');
    if (ad.moderator) ad.moderator = findEnglishName(ad.moderator, 'moderator');
    if (Array.isArray(ad.covariates)) {
      ad.covariates = ad.covariates.map(c => findEnglishName(c, 'control'));
    }
    resolved.analysis_design = ad;
  }

  console.log('[변수명 매핑]', {
    original: method.key_variables,
    resolved: kv,
    analysis_design: resolved.analysis_design || null,
  });

  return resolved;
}

/* ============================================================
   Phase 1: 초기 파이프라인 (PDF 업로드 → Agent 1 → Agent 4+)
   ============================================================ */

/**
 * 초기 파이프라인 실행
 * @param {string} apiKey — Gemini API 키
 * @param {string[]} selectedSections — 분석 대상 섹션
 */
export async function runInitialPipeline(apiKey, selectedSections) {
  state.apiKey = apiKey;
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

    // 백그라운드 텍스트 추출이 진행 중일 수 있으므로 대기 (최대 8초)
    let fallbackText = rawInput;
    if (!fallbackText && pdfBase64) {
      for (let i = 0; i < 16; i++) {
        await new Promise(r => setTimeout(r, 500));
        fallbackText = getExtractedText();
        if (fallbackText) break;
      }
    }

    let inputText = fallbackText || '';
    try {
      inputText = await convertPdfToMarkdown(apiKey, pdfBase64, fallbackText);
    } catch (err) {
      console.warn('PDF→MD 변환 실패, 원본 텍스트 사용:', err.message);
      // 폴백: fallbackText가 있으면 그대로 사용
      if (!fallbackText) throw err;
      inputText = fallbackText;
    }
    state.paperText = inputText;
    ui.updateLoadingStep(0, 'done');

    // ===== Step 1: Agent 1 — 문서 분석 =====
    ui.updateLoadingStep(1, 'running');
    ui.setLoadingMessage('논문의 학문 분야와 연구 방법론을 분석 중...');

    // pdf.js 폰트 기반 헤딩 감지 (Sprint 2-A): Agent1 섹션 힌트 주입용
    let extractedSections = [];
    const currentPdfFile = getPdfFile();
    if (currentPdfFile) {
      try {
        extractedSections = await extractHeadingsFromPDF(currentPdfFile);
        console.log(`[pdf.js 헤딩 감지] ${extractedSections.length}개 섹션 감지:`, extractedSections.map(s => s.text));
      } catch (headingErr) {
        console.warn('[pdf.js 헤딩 감지] 실패, 건너뜀:', headingErr.message);
      }
    }

    const docResult = await runAgent1(apiKey, inputText, extractedSections);
    state.docResult = docResult;
    state.paperContext = docResult.paper_context || {};
    state.methods = (docResult.detected_methods || []).slice(0, API.maxMethods);
    // analysis_design 로그
    state.methods.forEach((m, i) => {
      const ad = m.analysis_design;
      if (ad && ad.framework !== 'none') {
        console.log(`[Agent1] 방법론${i}: analysis_design =`, ad.framework, ad.model_number || '', 'mediator:', ad.mediator, 'moderator:', ad.moderator);
      }
    });

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
      // 상관행렬 추출 결과 로그
      const cm = dataStructure?.correlation_matrix;
      if (cm && cm.matrix && cm.variables) {
        console.log(`[Agent4+] ✅ correlation_matrix 추출 성공: ${cm.variables.length}변수`, cm.variables);
      } else {
        console.warn('[Agent4+] ⚠️ correlation_matrix 미추출 — 전용 추출 시도');
        // 2차 시도: 상관행렬 전용 추출
        try {
          const corrResult = await extractCorrelationMatrix(apiKey, inputText, dataStructure.variables || []);
          if (corrResult) {
            dataStructure.correlation_matrix = corrResult;
            state.dataStructure = dataStructure;
            console.log('[CorrelationExtractor] ✅ 2차 추출 성공, dataStructure에 반영됨');
          } else {
            // 3차 시도: Phase 6-C — 회귀계수 기반 상관행렬 역산
            console.warn('[CorrelationExtractor] 2차 추출 실패 — Phase 6-C 회귀계수 역산 시도');
            try {
              const regCorr = await extractRegressionAndBuildCorr(apiKey, inputText, dataStructure.variables || []);
              if (regCorr) {
                dataStructure.correlation_matrix = regCorr;
                state.dataStructure = dataStructure;
                console.log('[Phase6C] ✅ 회귀계수 기반 상관행렬 역산 성공');
              } else {
                console.warn('[Phase6C] 역산 실패 — 독립 데이터 생성으로 진행');
              }
            } catch (regErr) {
              console.warn('[Phase6C] 오류:', regErr.message);
            }
          }
        } catch (corrErr) {
          console.warn('[CorrelationExtractor] 2차 추출 오류:', corrErr.message);
        }
      }
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
  // 이슈 23: Agent1 한국어 변수명 → Agent4+ 영문 컬럼명 매핑
  const resolvedMethod = resolveVariableNames(method, state.dataStructure);
  const category = state.paperContext.analysis_category || 'regression';
  const steps = getStepsForCategory(category, resolvedMethod, state.paperContext);
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

  // 이슈 17: Agent4+ 변수 목록을 context에 주입하여 변수명 일관성 확보
  const variableNames = dataStats.map(v => v.name_en).filter(Boolean);

  const context = {
    domain: state.paperContext.domain,
    analysisType: method?.analysis_type,
    outcome: keyVars.outcome,
    treatment: keyVars.treatment,
    dataCharacteristics: state.paperContext.data_characteristics,
    descriptiveStats,
    variableNames,
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
  // 캐시를 methodIndex별로 관리
  if (!state.reviewResults) state.reviewResults = {};

  if (state.reviewResults[methodIndex]) {
    return state.reviewResults[methodIndex];
  }

  const method = state.methods[methodIndex];
  const statResult = state.statResults[methodIndex] || {
    standard_name: method?.raw_name || '미지정',
    steps: [],
  };

  const result = await runReviewGuide(
    state.apiKey, state.paperContext, statResult, method
  );
  state.reviewResults[methodIndex] = result;
  // 하위 호환: 기존 reviewResult도 업데이트
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
  state.reviewResults = {};
  state.selectedMethod = 0;
  state.selectedSections = [];
}
