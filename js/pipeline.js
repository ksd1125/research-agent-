/**
 * pipeline.js — 멀티 에이전트 파이프라인 오케스트레이션
 * ResearchMethodAgent v4.0
 */

import { MESSAGES } from './config.js';
import { escapeHtml, extractCode } from './utils.js';
import { runAgent1, runAgent2, runAgent3 } from './agents.js';
import { getExtractedText } from './pdf.js';
import * as ui from './ui.js';

/**
 * 파이프라인 실행
 * Agent 1 (문서 분석) → Agent 2 (통계 해석) → Agent 3 (코드 생성)
 */
export async function runPipeline() {
  const apiKey = ui.dom.apiKey.value.trim();
  const textInput = ui.dom.txtInput.value.trim();
  const currentTab = ui.getCurrentTab();

  // ===== 입력 검증 =====
  if (!apiKey)                               { ui.showStatus(MESSAGES.errors.noApiKey);    return; }
  if (currentTab === 'pdf' && !getExtractedText()) { ui.showStatus(MESSAGES.errors.noPdfText);   return; }
  if (currentTab === 'text' && !textInput)   { ui.showStatus(MESSAGES.errors.noTextInput); return; }

  const inputText = currentTab === 'pdf' ? getExtractedText() : textInput;

  // ===== UI: 로딩 시작 =====
  ui.showLoadingView();

  try {
    // ===== Agent 1: 문서 분석 =====
    ui.setLoading(MESSAGES.loading.agent1);
    const docResult = await runAgent1(apiKey, inputText);
    const paperContext = docResult.paper_context || {};
    const methods = (docResult.detected_methods || []).slice(0, 2);

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

    for (let i = 0; i < methods.length; i++) {
      const m = methods[i];
      const idx = i + 1;
      const total = methods.length;

      // Agent 2: 통계 분석
      ui.setLoading(MESSAGES.loading.agent2(
        idx, total,
        paperContext.domain || '해당 분야',
        escapeHtml(m.raw_name)
      ));
      const statResult = await runAgent2(apiKey, m, paperContext);

      // Agent 3: 코드 생성
      ui.setLoading(MESSAGES.loading.agent3(idx, total));
      let codeResult;
      try {
        const { packages, codeRaw } = await runAgent3(
          apiKey, statResult, paperContext, m.target_result_location
        );
        const code = extractCode(codeRaw);
        codeResult = {
          packages,
          python_code: code.python,
          r_code: code.r,
        };
      } catch (err) {
        codeResult = {
          packages: { python: [], r: [] },
          python_code: `# 코드 생성 실패\n# 오류: ${err.message}`,
          r_code:      `# 코드 생성 실패\n# 오류: ${err.message}`,
        };
      }

      // 결과 조합
      finalMethods.push({
        raw_name:        m.raw_name,
        evidence:        m.evidence_text,
        target_location: m.target_result_location,
        standard_name:   statResult.standard_name,
        concept:         statResult.concept,
        why_used:        statResult.why_used,
        steps:           statResult.steps,
        packages:        codeResult.packages,
        python_code:     codeResult.python_code,
        r_code:          codeResult.r_code,
      });
    }

    // ===== 결과 렌더링 =====
    docResult.methods = finalMethods;
    ui.renderResult(docResult);
    ui.showResultView();

  } catch (err) {
    // 에러 시 입력 화면으로 복귀
    ui.showInputView();
    ui.showStatus(`오류 발생: ${err.message}`);
  }
}
