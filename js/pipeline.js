/**
 * pipeline.js — 멀티 에이전트 파이프라인 오케스트레이션
 * ResearchMethodAgent v4.0
 *
 * PDF → MD 변환 → Agent 1 (문서 분석) → Agent 2 (통계 해석)
 * → Agent 3 (코드 생성) → Agent 4 (기술통계 추출)
 */

import { MESSAGES } from './config.js';
import { escapeHtml } from './utils.js';
import { runAgent1, runAgent2, runAgent3, createAbortController, abortPipeline } from './agents.js';
import { getExtractedText } from './pdf.js';
import { convertPdfToMarkdown, extractDescriptiveStats } from './mockdata.js';
import * as ui from './ui.js';

/**
 * 파이프라인 실행
 */
export async function runPipeline() {
  const apiKey = ui.dom.apiKey.value.trim();
  const textInput = ui.dom.txtInput.value.trim();
  const currentTab = ui.getCurrentTab();

  // ===== 입력 검증 =====
  if (!apiKey)                               { ui.showStatus(MESSAGES.errors.noApiKey);    return; }
  if (currentTab === 'pdf' && !getExtractedText()) { ui.showStatus(MESSAGES.errors.noPdfText);   return; }
  if (currentTab === 'text' && !textInput)   { ui.showStatus(MESSAGES.errors.noTextInput); return; }

  const rawInput = currentTab === 'pdf' ? getExtractedText() : textInput;

  // ===== UI: 로딩 시작 =====
  createAbortController();
  ui.showLoadingView();

  try {
    // ===== Step 0: PDF → Markdown 변환 (PDF 탭인 경우) =====
    let inputText = rawInput;

    if (currentTab === 'pdf') {
      ui.setAgentStep(0);
      ui.setProgress(2);
      ui.setLoading(MESSAGES.loading.pdfToMd);

      try {
        inputText = await convertPdfToMarkdown(apiKey, rawInput);
        // 변환된 MD를 UI에 저장 (나중에 다운로드 가능)
        ui.setConvertedMarkdown(inputText);
      } catch (err) {
        // MD 변환 실패 시 원본 텍스트로 진행
        console.warn('PDF→MD 변환 실패, 원본 텍스트 사용:', err.message);
        inputText = rawInput;
      }
    }

    // 원본 텍스트 저장 (Q&A용)
    ui.setPaperText(inputText);

    // ===== Agent 1: 문서 분석 =====
    ui.setAgentStep(1);
    ui.setProgress(10);
    ui.setLoading(MESSAGES.loading.agent1);
    const docResult = await runAgent1(apiKey, inputText);
    const paperContext = docResult.paper_context || {};
    const methods = (docResult.detected_methods || []).slice(0, 2);
    ui.setProgress(25);

    // 방법론 미감지 시
    if (methods.length === 0) {
      docResult.methods = [];
      docResult._debug = MESSAGES.errors.noMethods;
      ui.renderResult(docResult);
      ui.showResultView();
      return;
    }

    // ===== Agent 2 + 3: 각 방법론에 대해 순차 실행 =====
    const finalMethods = [];
    const progressPerMethod = 45 / methods.length;

    for (let i = 0; i < methods.length; i++) {
      const m = methods[i];
      const idx = i + 1;
      const total = methods.length;
      const baseProgress = 25 + (i * progressPerMethod);

      // Agent 2: 통계 분석
      ui.setAgentStep(2);
      ui.setProgress(Math.round(baseProgress));
      ui.setLoading(MESSAGES.loading.agent2(
        idx, total,
        paperContext.domain || '해당 분야',
        escapeHtml(m.raw_name)
      ));
      const statResult = await runAgent2(apiKey, m, paperContext);
      ui.setProgress(Math.round(baseProgress + progressPerMethod * 0.4));

      // Agent 3: 코드 생성
      ui.setAgentStep(3);
      ui.setProgress(Math.round(baseProgress + progressPerMethod * 0.5));
      ui.setLoading(MESSAGES.loading.agent3(idx, total));
      let codeResult;
      try {
        const { packages, pythonCode, rCode } = await runAgent3(
          apiKey, statResult, paperContext, m.target_result_location
        );
        codeResult = {
          packages,
          python_code: pythonCode,
          r_code: rCode,
        };
      } catch (err) {
        codeResult = {
          packages: { python: [], r: [] },
          python_code: `# 코드 생성 실패\n# 오류: ${err.message}`,
          r_code:      `# 코드 생성 실패\n# 오류: ${err.message}`,
        };
      }
      ui.setProgress(Math.round(baseProgress + progressPerMethod));

      // 결과 조합
      finalMethods.push({
        raw_name:        m.raw_name,
        evidence:        m.evidence_text,
        target_location: m.target_result_location,
        source_section:  m.source_section || '',
        standard_name:   statResult.standard_name,
        concept:         statResult.concept,
        why_used:        statResult.why_used,
        steps:           statResult.steps,
        packages:        codeResult.packages,
        python_code:     codeResult.python_code,
        r_code:          codeResult.r_code,
      });
    }

    // ===== Agent 4: 기술통계 추출 (가상 데이터 준비) =====
    ui.setAgentStep(4);
    ui.setProgress(78);
    ui.setLoading(MESSAGES.loading.agent4);

    try {
      const descStats = await extractDescriptiveStats(apiKey, inputText);
      ui.setDescriptiveStats(descStats);
      ui.setProgress(95);
    } catch (err) {
      // Agent 4 실패해도 나머지 결과는 보여줌
      console.warn('Agent 4 (기술통계 추출) 실패:', err.message);
      ui.setDescriptiveStats(null);
    }

    // ===== 결과 렌더링 =====
    ui.setProgress(100);
    docResult.methods = finalMethods;
    ui.renderResult(docResult);
    ui.showResultView();

  } catch (err) {
    // 에러 시 입력 화면으로 복귀
    ui.showInputView();
    ui.showStatus(`오류 발생: ${err.message}`);
  }
}
