/**
 * agents.js — 에이전트 프롬프트 정의 및 API 호출
 * ResearchMethodAgent v5.0
 */

import { API, MESSAGES } from './config.js';
import { safeParseJSON } from './utils.js';

/* ============================================================
   Gemini API 호출
   ============================================================ */

/** 현재 파이프라인의 AbortController (취소 기능용) */
let _abortController = null;

/**
 * 새 AbortController 생성 (파이프라인 시작 시 호출)
 * @returns {AbortController}
 */
export function createAbortController() {
  _abortController = new AbortController();
  return _abortController;
}

/**
 * 현재 파이프라인 취소
 */
export function abortPipeline() {
  if (_abortController) {
    _abortController.abort();
    _abortController = null;
  }
}

/**
 * Gemini API에 프롬프트 전송
 * @param {string} apiKey
 * @param {string} prompt  — 텍스트 프롬프트
 * @param {number} [maxTokens=4000]
 * @returns {Promise<string>} — 응답 텍스트
 */
export async function callGemini(apiKey, prompt, maxTokens = 4000) {
  if (!apiKey) throw new Error(MESSAGES.errors.noApiKey);

  const url = `${API.baseUrl}/${API.defaultModel}:generateContent?key=${apiKey}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: API.defaultTemp,
          maxOutputTokens: maxTokens,
        },
      }),
      signal: _abortController?.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('파이프라인이 취소되었습니다.');
    throw new Error(`네트워크 오류: ${err.message}`);
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error('API 호출 한도 초과 — 잠시 후 다시 시도해주세요.');
    if (status === 401 || status === 403) throw new Error('API 키가 유효하지 않습니다. 키를 확인해주세요.');
    throw new Error(`API 오류 (HTTP ${status}): ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error(MESSAGES.errors.emptyResponse);

  return candidate.content.parts.map(p => p.text || '').join('');
}

/**
 * Gemini API에 PDF 바이너리(base64) + 텍스트 프롬프트 전송 (멀티모달)
 * PDF의 표, 그림, 수식을 직접 인식하여 정확도 향상.
 *
 * @param {string} apiKey
 * @param {string} pdfBase64 — PDF 파일의 base64 인코딩 문자열
 * @param {string} prompt    — 텍스트 프롬프트
 * @param {number} [maxTokens=8000]
 * @returns {Promise<string>} — 응답 텍스트
 */
export async function callGeminiWithPdf(apiKey, pdfBase64, prompt, maxTokens = 8000) {
  if (!apiKey) throw new Error(MESSAGES.errors.noApiKey);
  if (!pdfBase64) throw new Error('PDF 데이터가 없습니다.');

  const url = `${API.baseUrl}/${API.defaultModel}:generateContent?key=${apiKey}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: API.defaultTemp,
          maxOutputTokens: maxTokens,
        },
      }),
      signal: _abortController?.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('파이프라인이 취소되었습니다.');
    throw new Error(`네트워크 오류: ${err.message}`);
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error('API 호출 한도 초과 — 잠시 후 다시 시도해주세요.');
    if (status === 401 || status === 403) throw new Error('API 키가 유효하지 않습니다. 키를 확인해주세요.');
    // 413: payload too large — PDF 크기 초과
    if (status === 413) throw new Error('PDF 파일이 API 크기 제한을 초과합니다. 더 작은 파일을 사용해주세요.');
    throw new Error(`API 오류 (HTTP ${status}): ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error(MESSAGES.errors.emptyResponse);

  return candidate.content.parts.map(p => p.text || '').join('');
}

/* ============================================================
   Agent 1: 문서 분석기 — 도메인/방법론 감지
   ============================================================ */

/**
 * 연구 방법론 분류 체계 (Methodology Reference Taxonomy)
 *
 * Agent 1이 논문을 분석하기 전에 참조하는 "교과서" 역할.
 * 각 방법론 계열의 식별 신호, 데이터 구조, 핵심 통계량, 분석 기법을 정리.
 */
const METHODOLOGY_TAXONOMY = `
[연구 방법론 분류 체계 — 분류 전 반드시 참조]

아래는 12가지 주요 분석 카테고리입니다. 논문의 데이터 구조, 키워드, 결과 테이블 형태를 아래와 대조하여 analysis_category를 결정하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. regression (회귀분석 — 횡단면)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: OLS, linear regression, logistic regression, probit, tobit, quantile regression, robust SE, heteroskedasticity
• 데이터 구조: 횡단면(cross-section), 단일 시점, N개 관측치
• 결과 테이블 특징: 계수(β), 표준오차(SE), t-값, p-값, R², 조정 R²
• 대표 분석: OLS, WLS, GLS, 로지스틱회귀, 프로빗, 토빗, 분위수회귀
• 주의: 패널/시계열이 아닌 단일 시점 데이터에만 적용

2. causal_inference (인과추론 — 패널/준실험)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: panel data, fixed effects, random effects, DID, difference-in-differences, staggered DID, staggered adoption, two-way fixed effects(TWFE), event study, PSM-DID, synthetic control, synthetic difference-in-differences, RDD, regression discontinuity, sharp RDD, fuzzy RDD, instrumental variable, 2SLS, IV, GMM, Hausman test, entity effects, time effects, within estimator, Callaway-Sant'Anna, Sun-Abraham, de Chaisemartin-D'Haultfoeuille, parallel trends
• 데이터 구조: 패널(entity × time), 다기간 관측, 개체 추적, 처리군/통제군 비교
• 결과 테이블 특징: 고정효과/랜덤효과 계수, Hausman검정, 처리효과(ATT/ATE/CATT), 1st stage F-stat(IV), bandwidth(RDD), 사건연구 그래프(event-study plot), 합성대조군 경로 그래프
• 대표 분석: 고정효과(FE), 랜덤효과(RE), 전통 DID, 다기간 DID(Staggered DID), PSM-DID, 합성대조군(SC/SDID), RDD(Sharp/Fuzzy), IV/2SLS, system GMM
• 핵심 구분:
  - "처리군 vs 통제군" + "처리 전 vs 처리 후" → DID
  - 처리 시점이 개체마다 다르면 → Staggered DID (Callaway-Sant'Anna, Sun-Abraham)
  - 성향점수 매칭 → PSM-DID
  - 소수 처리 단위 + 다수 통제 단위 가중합 → Synthetic Control
  - 임계값/컷오프 기준 → RDD
  - 내생성 통제를 위한 외생 변수 → IV/2SLS

3. experimental (실험 설계)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: RCT, randomized controlled trial, experiment, treatment group, control group, between-subjects, within-subjects, factorial design, ANOVA, MANOVA, ANCOVA, repeated measures, effect size, Cohen's d, η², random assignment, manipulation check
• 데이터 구조: 실험군/통제군, 요인설계(2×2, 2×3 등), 반복측정
• 결과 테이블 특징: F-값, 자유도(df), 효과크기(η², d), 사후검정(Tukey, Bonferroni), 조건별 평균/SD
• 대표 분석: 독립표본 t-검정, 일원/이원 ANOVA, MANOVA, ANCOVA, 반복측정 ANOVA, 혼합설계 ANOVA
• 핵심 구분: "무작위 배정"이 명시 → experimental. "처리군/통제군"만 있고 무작위 미언급 → causal_inference(DID) 가능성.

4. spatial (공간 분석)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: spatial regression, spatial lag, spatial error, SAR, SEM(spatial error model), SDM, GWR, spatial weights, contiguity, Moran's I, spatial autocorrelation, LISA, geographically weighted, municipality, county, region, neighborhood
• 데이터 구조: 공간 단위(지역/구역/격자), 좌표(위경도), 공간 가중행렬(W)
• 결과 테이블 특징: 공간자기상관 계수(ρ, λ), Moran's I, 직접효과/간접효과/총효과, LM검정
• 대표 분석: SAR, SEM, SDM, SARAR, GWR, 공간 패널
• 핵심 구분: "이웃(neighbor)", "인접(contiguity)", "가중행렬(W)", "Moran" 언급 → spatial

5. time_series (시계열 분석)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: time series, ARIMA, VAR, VECM, cointegration, unit root, ADF test, Granger causality, stationarity, differencing, GARCH, volatility, forecast, impulse response, lag order, autocorrelation, ACF, PACF, seasonal
• 데이터 구조: 단일 또는 다변량 시계열, 시간 인덱스(일/월/분기/연), 장기간 관측
• 결과 테이블 특징: AR/MA 계수, 단위근검정 통계량, AIC/BIC, Johansen 검정, IRF 그래프, 분산분해
• 대표 분석: AR, MA, ARIMA, SARIMA, VAR, VECM, GARCH, 공적분분석
• 핵심 구분: 단일 변수 예측 → ARIMA. 다변수 상호작용 → VAR/VECM. 변동성 모형 → GARCH.

6. machine_learning (기계학습 — 예측 중심)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: machine learning, random forest, XGBoost, gradient boosting, neural network, deep learning, SVM, support vector, cross-validation, k-fold, hyperparameter, feature importance, ROC, AUC, confusion matrix, train/test split, overfitting, ensemble
• 데이터 구조: 특성변수(features) × 표본, 대규모 데이터셋, 학습/테스트 분할
• 결과 테이블 특징: Accuracy, Precision, Recall, F1, AUC-ROC, RMSE, MAE, feature importance ranking
• 대표 분석: 랜덤포레스트, XGBoost, SVM, 로지스틱(ML맥락), kNN, 신경망, 앙상블
• 핵심 구분: "예측" 목적 + 교차검증/하이퍼파라미터 → ML. "인과추론" 목적이면 causal_ml 또는 causal_inference.

7. causal_ml (인과적 기계학습)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: Double Machine Learning(DML), causal forest, generalized random forest(GRF), CATE(Conditional Average Treatment Effect), heterogeneous treatment effects, debiased machine learning, Chernozhukov, orthogonal learning, meta-learners(T-learner, S-learner, X-learner), targeted learning(TMLE), AIPW(augmented inverse propensity weighting), Belloni, post-double-selection LASSO
• 데이터 구조: 고차원 데이터(다수 공변량) + 처리/통제 구조, 이질적 처리효과 탐색
• 결과 테이블 특징: ATE/CATE 추정치, 신뢰구간, 변수 중요도(처리효과 이질성 기준), 처리효과 분포 그래프
• 대표 분석: DML, Causal Forest, GRF, Meta-learners, TMLE, AIPW, Post-LASSO
• 핵심 구분: ML 기법을 사용하되 "인과적 효과 추정"이 목표 → causal_ml. 단순 예측이 목표 → machine_learning.

8. unstructured_data (비정형 데이터 분석)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: NLP, natural language processing, text mining, topic modeling, LDA, sentiment analysis, word embedding, Word2Vec, BERT, GPT, transformer, fine-tuning, zero-shot classification, few-shot learning, text classification, named entity recognition(NER), CNN, RNN, LSTM, image classification, computer vision, transfer learning, pre-trained model, embedding, cosine similarity, TF-IDF, tokenization
• 데이터 구조: 텍스트 코퍼스, 이미지 데이터셋, 오디오/비디오, 임베딩 벡터, 문서-용어 행렬(DTM)
• 결과 테이블 특징: 토픽 분포, 감성 점수, 분류 정확도(Accuracy/F1), 혼동행렬, 임베딩 시각화(t-SNE/UMAP), 어텐션 맵, 단어 빈도/중요도
• 대표 분석: LDA 토픽모델링, BERT 기반 텍스트 분류, 제로샷/퓨샷 분류, 감성분석, CNN/RNN 이미지/텍스트 분류, 트랜스포머 미세조정, 워드 임베딩 분석
• 핵심 구분: 텍스트/이미지/오디오 등 비정형 데이터가 주요 분석 대상 → unstructured_data. 정형 데이터의 ML 예측 → machine_learning.

9. bayesian (베이지안 분석)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: Bayesian, prior, posterior, MCMC, Gibbs sampling, Metropolis-Hastings, credible interval, BF(Bayes Factor), hierarchical model, informative prior, noninformative prior, convergence diagnostics, Rhat, trace plot
• 데이터 구조: 다양 (횡단면, 계층, 시계열 모두 가능)
• 결과 테이블 특징: 사후분포(posterior) 요약(평균, 중앙값, 95% CrI), Rhat, ESS, Bayes Factor
• 대표 분석: 베이지안 회귀, 베이지안 계층모형(HLM), BVAR
• 핵심 구분: "사전분포(prior)", "사후분포(posterior)", "MCMC" 명시 → bayesian

10. sem (구조방정식 모형)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: SEM, structural equation, path analysis, latent variable, factor loading, CFA, confirmatory factor analysis, EFA, exploratory factor analysis, measurement model, structural model, fit indices, CFI, TLI, RMSEA, SRMR, modification indices
• 데이터 구조: 다중 관측변수 → 잠재변수 구조, 설문 기반 데이터
• 결과 테이블 특징: 요인적재량(λ), 경로계수(β), 적합도지수(χ², CFI, TLI, RMSEA, SRMR), AVE, CR
• 대표 분석: CFA, 경로분석, 완전구조방정식모형, 다집단분석, 매개/조절분석
• 핵심 구분: "잠재변수(latent)", "적합도(fit index)", "경로계수(path coefficient)" → sem

11. survival (생존 분석)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: survival analysis, Cox regression, Cox PH, proportional hazards, Kaplan-Meier, log-rank test, hazard ratio, censoring, event time, time-to-event, AFT model, competing risks, recurrent events
• 데이터 구조: 시간-이벤트 데이터, 중도절단(censoring) 포함, 추적관찰 기간
• 결과 테이블 특징: 위험비(HR), 95% CI, 생존곡선, 중앙생존시간, log-rank p-value
• 대표 분석: Kaplan-Meier, Cox 비례위험모형, 가속실패시간(AFT), 경쟁위험 모형
• 핵심 구분: "위험(hazard)", "생존(survival)", "중도절단(censoring)" → survival

12. meta_analysis (메타분석)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: meta-analysis, systematic review, effect size, pooled estimate, heterogeneity, I², Q-statistic, forest plot, funnel plot, publication bias, Egger's test, random-effects model, fixed-effect model, subgroup analysis
• 데이터 구조: 개별 연구들의 효과크기/표준오차/표본크기 집합
• 결과 테이블 특징: 통합 효과크기, 95% CI, I², Q, 숲 그림(forest plot), 깔때기 그림(funnel plot)
• 대표 분석: 고정효과 메타분석, 랜덤효과 메타분석, 네트워크 메타분석

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
분류 우선순위 규칙:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 공간 가중행렬(W) 또는 Moran's I 언급 → spatial
2. 시간-이벤트/생존/위험 → survival
3. RCT/무작위 배정/요인설계/ANOVA → experimental
4. MCMC/사전분포/사후분포 → bayesian
5. 잠재변수/CFA/경로분석/적합도 → sem
6. 메타분석/숲그림/I² → meta_analysis
7. DML/Causal Forest/CATE/이질적 처리효과 + ML 기법 → causal_ml
8. 텍스트/NLP/BERT/CNN/RNN/토픽모델/임베딩/비정형 → unstructured_data
9. 교차검증/feature importance/예측 모형(인과 아닌 순수 예측) → machine_learning
10. 단위근/ARIMA/VAR/공적분 → time_series
11. 패널(entity×time)/FE/RE/DID/Staggered DID/Synthetic Control/IV/PSM/RDD → causal_inference
12. 위에 해당 없으면 → regression
`;

function buildAgent1Prompt(paperText) {
  return `${METHODOLOGY_TAXONOMY}

논문 텍스트:
${paperText}

당신은 '문서 분석 전문 에이전트'입니다. 위의 [연구 방법론 분류 체계]를 참조하여 논문을 분석하세요.
반드시 순수 JSON만 출력하세요. 첫 글자는 반드시 { 이어야 합니다. 마크다운 코드블록(\`\`\`json 등)은 절대 사용하지 마세요.

분류 절차:
1. 논문의 데이터 구조(횡단면/패널/시계열/공간/실험 등)를 먼저 파악
2. 핵심 키워드(위 분류 체계의 "식별 키워드")와 결과 테이블 형태를 대조
3. 분류 우선순위 규칙에 따라 analysis_category를 결정
4. 각 방법론에 대해 구체적 analysis_type을 자유 기술 (예: PSM-DID, 이원 ANOVA, SAR 등)

중요: detected_methods는 가장 핵심적인 방법론 최대 ${API.maxMethods}개만 포함하세요.

출력 형식:
{
  "metadata": {
    "title": "논문 제목",
    "summary": "1문장 요약"
  },
  "paper_context": {
    "domain": "학문 분야 (예: 심리학, 경제학, 빅데이터, 의학, 도시계획 등)",
    "research_type": "연구 형태 (예: 실험 연구, 준실험 연구, 횡단 연구, 종단 연구, 메타분석 등)",
    "data_characteristics": "데이터 특성 (간략히 30자 이내)",
    "analysis_category": "위 분류 체계의 12개 카테고리 중 가장 적합한 것 1개: regression | causal_inference | experimental | spatial | time_series | machine_learning | causal_ml | unstructured_data | bayesian | sem | survival | meta_analysis",
    "category_evidence": "이 카테고리를 선택한 근거 (어떤 식별 신호/키워드를 발견했는지 1~2문장)"
  },
  "section_index": [
    {
      "section": "섹션 제목",
      "summary": "핵심 내용 1~2문장 요약",
      "key_tables": ["Table 1", "Figure 2"]
    }
  ],
  "detected_methods": [
    {
      "raw_name": "방법론 명칭 (논문에서 사용한 이름 그대로)",
      "evidence_text": "방법론 언급 발췌 (50자 이내)",
      "target_result_location": "결과 위치 (예: Table 3, Figure 2 등)",
      "source_section": "이 방법론이 설명된 섹션명",
      "analysis_type": "구체적 분석 유형 (예: OLS, 2SLS/IV, DID, PSM-DID, RDD, ANOVA, MANOVA, spatial_lag, spatial_error, VAR, ARIMA, random_forest, logistic, Cox_PH, SEM 등 자유 기술)",
      "key_variables": {
        "outcome": "종속변수/반응변수/결과변수 설명 (30자 이내)",
        "treatment": "처리변수/핵심독립변수/요인 설명 (30자 이내)",
        "controls": "통제변수/공변량/블록변수 설명 (30자 이내)"
      }
    }
  ]
}`;
}

/**
 * Agent 1 실행 — 문서 분석
 * @param {string} apiKey
 * @param {string} paperText
 * @returns {Promise<Object>}
 */
export async function runAgent1(apiKey, paperText) {
  const prompt = buildAgent1Prompt(paperText);
  const raw = await callGemini(apiKey, prompt, API.tokens.agent1);

  try {
    return safeParseJSON(raw);
  } catch (err) {
    // 강제 복구 시도
    const start = raw.indexOf('{');
    if (start >= 0) {
      let partial = raw.slice(start).replace(/,\s*$/, '');
      const ob = (partial.match(/\[/g) || []).length - (partial.match(/\]/g) || []).length;
      const oc = (partial.match(/\{/g) || []).length - (partial.match(/\}/g) || []).length;
      for (let i = 0; i < ob; i++) partial += ']';
      for (let i = 0; i < oc; i++) partial += '}';
      try { return JSON.parse(partial); }
      catch { throw new Error(MESSAGES.errors.agent1Parse + raw.substring(0, 400)); }
    }
    throw new Error(MESSAGES.errors.agent1NoJson + raw.substring(0, 400));
  }
}

/* ============================================================
   Agent 2: 통계 분석기 — 방법론 해석
   ============================================================ */

function buildAgent2Prompt(rawName, evidenceText, paperContext) {
  return `당신은 '통계분석 전문 에이전트'입니다. 반드시 순수 JSON만 출력하세요.
\`\`\`json 코드블록, 마크다운, 설명 텍스트를 절대 포함하지 마세요. 첫 글자는 반드시 { 이어야 합니다.

[논문 분야]: ${paperContext.domain || '알 수 없음'}
[연구 유형]: ${paperContext.research_type || '알 수 없음'}
[데이터 특성]: ${paperContext.data_characteristics || '알 수 없음'}
[발췌 문장]: "${evidenceText}"
[방법론 명칭]: "${rawName}"

위 맥락을 바탕으로 이 방법론을 분석하세요:

{
  "standard_name": "표준화된 학술적 명칭 (예: Ordinary Least Squares Regression)",
  "concept": "이 방법론의 통계적 개념을 위 [논문 분야]의 관점에서 설명 (2~3문장)",
  "why_used": "위 [데이터 특성]과 [연구 유형]을 고려했을 때, 이 논문에서 이 방법을 채택한 학술적 이유 (2~3문장)",
  "steps": [
    {"step": 1, "name": "단계명", "desc": "구체적 분석/전처리 절차 설명"}
  ]
}`;
}

/**
 * Agent 2 실행 — 방법론 통계 분석
 * @param {string} apiKey
 * @param {Object} method  — Agent 1이 감지한 방법론 객체
 * @param {Object} paperContext — 논문 컨텍스트
 * @returns {Promise<Object>}
 */
export async function runAgent2(apiKey, method, paperContext) {
  const prompt = buildAgent2Prompt(method.raw_name, method.evidence_text, paperContext);
  const raw = await callGemini(apiKey, prompt, API.tokens.agent2);

  try {
    return safeParseJSON(raw);
  } catch {
    return {
      standard_name: method.raw_name,
      concept: '분석 실패 — 재시도해주세요.',
      why_used: '분석 실패 — 재시도해주세요.',
      steps: [],
    };
  }
}

/* ============================================================
   Agent 3: 코드 생성기 — Python/R 코드 + 패키지 목록
   ============================================================ */

function buildAgent3MetaPrompt(standardName, paperContext) {
  return `당신은 '데이터 프로그래밍 전문 에이전트'입니다. 반드시 순수 JSON만 출력하세요.
첫 글자는 반드시 { 이어야 합니다.

[목표 방법론]: "${standardName}"
[데이터 특성]: "${paperContext.data_characteristics || '일반 데이터'}"

이 방법론에 필요한 Python 패키지와 R 패키지 목록만 JSON으로 출력하세요.
{"packages":{"python":["pandas","numpy"],"r":["dplyr","fixest"]}}`;
}

/**
 * 분석 카테고리에 따른 동적 라이브러리 및 데이터 구조 힌트
 */
export function getAnalysisProfile(category, analysisType, lang) {
  const profiles = {
    regression: {
      python: 'pandas, numpy, statsmodels, scipy',
      r: 'dplyr, lmtest, sandwich, car',
      dataHint: '횡단면 데이터를 생성하세요. 종속변수, 독립변수, 통제변수를 포함.',
    },
    causal_inference: {
      python: 'pandas, numpy, statsmodels, linearmodels, scipy, matplotlib',
      r: 'fixest, plm, did, dplyr, lmtest, ggplot2',
      dataHint: '패널 데이터(entity-time 구조)를 생성하세요. entity ID, 시간 변수, 처리 여부(treatment indicator)를 포함. 처리 시점이 다른 다기간 설계도 고려.',
    },
    // 하위 호환성: 기존 panel 카테고리를 causal_inference로 매핑
    panel: {
      python: 'pandas, numpy, statsmodels, linearmodels, scipy, matplotlib',
      r: 'fixest, plm, did, dplyr, lmtest, ggplot2',
      dataHint: '패널 데이터(entity-time 구조)를 생성하세요. entity ID, 시간 변수, 처리 여부(treatment indicator)를 포함.',
    },
    experimental: {
      python: 'pandas, numpy, scipy.stats, statsmodels.stats, pingouin',
      r: 'dplyr, car, emmeans, effectsize, multcomp',
      dataHint: '실험 데이터를 생성하세요. 처리 집단(group/condition)과 반응변수를 포함. 요인(factor)별 수준(level)을 반영.',
    },
    spatial: {
      python: 'pandas, numpy, geopandas, libpysal, spreg, esda',
      r: 'spdep, spatialreg, sf, dplyr',
      dataHint: '공간 데이터를 생성하세요. 좌표(위경도 또는 x,y)와 공간 가중행렬(W)을 포함.',
    },
    time_series: {
      python: 'pandas, numpy, statsmodels.tsa, arch, matplotlib',
      r: 'forecast, tseries, vars, urca, dplyr',
      dataHint: '시계열 데이터를 생성하세요. 날짜 인덱스와 시간적 의존성(자기상관)을 반영.',
    },
    machine_learning: {
      python: 'pandas, numpy, scikit-learn, matplotlib, seaborn',
      r: 'caret, randomForest, glmnet, dplyr, ggplot2',
      dataHint: '학습용 데이터를 생성하세요. 특성변수(features)와 목표변수(target)를 포함. 학습/테스트 분할을 포함.',
    },
    causal_ml: {
      python: 'pandas, numpy, econml, doubleml, scikit-learn, matplotlib, seaborn',
      r: 'grf, DoubleML, dplyr, ggplot2',
      dataHint: '고차원 관측 데이터를 생성하세요. 처리변수(treatment), 결과변수(outcome), 다수의 공변량(confounders)을 포함. 처리효과의 이질성(heterogeneity)이 드러나도록 교호작용을 반영.',
    },
    unstructured_data: {
      python: 'pandas, numpy, scikit-learn, matplotlib, seaborn',
      r: 'tidytext, text2vec, caret, dplyr, ggplot2',
      dataHint: '비정형 데이터(텍스트/이미지) 분석을 위한 데이터를 생성하세요. 텍스트 분석의 경우 문서-용어 행렬(DTM) 또는 임베딩 벡터를 포함. 레이블/카테고리 변수도 포함.',
    },
    bayesian: {
      python: 'pandas, numpy, pymc, arviz, matplotlib',
      r: 'brms, rstanarm, bayesplot, dplyr',
      dataHint: '사전분포를 반영한 데이터를 생성하세요. 모수의 불확실성을 반영.',
    },
    sem: {
      python: 'pandas, numpy, semopy, factor_analyzer',
      r: 'lavaan, semPlot, dplyr',
      dataHint: '잠재변수를 반영한 데이터를 생성하세요. 관측변수와 잠재요인 간의 구조를 반영.',
    },
    survival: {
      python: 'pandas, numpy, lifelines, matplotlib',
      r: 'survival, survminer, dplyr',
      dataHint: '생존 데이터를 생성하세요. 시간 변수, 이벤트(사건) 발생 여부, 중도절단(censoring)을 포함.',
    },
    meta_analysis: {
      python: 'pandas, numpy, statsmodels, forestplot',
      r: 'metafor, meta, dplyr',
      dataHint: '개별 연구의 효과크기(effect size), 표준오차, 표본크기를 포함한 데이터를 생성하세요.',
    },
  };

  // 프로필 매칭: category → analysisType 키워드 → 기본값
  let profile = profiles[category];
  if (!profile) {
    // analysisType 키워드로 추론
    const at = (analysisType || '').toLowerCase();
    if (at.includes('anova') || at.includes('experiment') || at.includes('rct'))
      profile = profiles.experimental;
    else if (at.includes('spatial') || at.includes('sar') || at.includes('sem_spatial'))
      profile = profiles.spatial;
    else if (at.includes('arima') || at.includes('var') || at.includes('garch') || at.includes('time'))
      profile = profiles.time_series;
    else if (at.includes('dml') || at.includes('causal_forest') || at.includes('causal forest') || at.includes('cate') || at.includes('double_machine'))
      profile = profiles.causal_ml;
    else if (at.includes('did') || at.includes('panel') || at.includes('psm') || at.includes('rdd') || at.includes('iv') || at.includes('2sls') || at.includes('synthetic'))
      profile = profiles.causal_inference;
    else if (at.includes('nlp') || at.includes('bert') || at.includes('topic') || at.includes('lda') || at.includes('text') || at.includes('cnn') || at.includes('rnn') || at.includes('transformer') || at.includes('embedding'))
      profile = profiles.unstructured_data;
    else if (at.includes('cox') || at.includes('survival') || at.includes('hazard'))
      profile = profiles.survival;
    else if (at.includes('random_forest') || at.includes('xgboost') || at.includes('neural') || at.includes('svm'))
      profile = profiles.machine_learning;
    else if (at.includes('lavaan') || at.includes('structural_equation'))
      profile = profiles.sem;
    else if (at.includes('bayes') || at.includes('mcmc'))
      profile = profiles.bayesian;
    else if (at.includes('meta'))
      profile = profiles.meta_analysis;
    else
      profile = profiles.regression; // 최종 기본값
  }

  return {
    libs: lang === 'python' ? profile.python : profile.r,
    dataHint: profile.dataHint,
  };
}

function buildAgent3SingleLangPrompt(lang, standardName, steps, paperContext, targetLocation, methodMeta) {
  const langName = lang === 'python' ? 'Python' : 'R';
  const dataGen = lang === 'python' ? 'numpy/pandas' : 'base R / dplyr';

  const analysisType = methodMeta?.analysis_type || '';
  const category = paperContext.analysis_category || '';
  const keyVars = methodMeta?.key_variables || {};
  const { libs, dataHint } = getAnalysisProfile(category, analysisType, lang);

  // 카테고리별 시각화 힌트
  const vizHints = {
    causal_inference: lang === 'python'
      ? 'Event-study plot(처리효과 시점별 추이), parallel trends 사전 검정 그래프, ATT 계수 forest plot'
      : 'Event-study plot(처리효과 시점별 추이), parallel trends 사전 검정 그래프, ATT 계수 forest plot',
    panel: lang === 'python'
      ? 'Event-study plot(처리효과 시점별 추이), 계수 비교 forest plot'
      : 'Event-study plot(처리효과 시점별 추이), 계수 비교 forest plot',
    experimental: '집단별 평균 비교 막대/바이올린 그래프, 교호작용 plot',
    spatial: 'Choropleth 지도(계수 분포), Moran scatter plot',
    time_series: 'IRF(충격반응함수) 그래프, 시계열 분해 plot, 예측 vs 실제 비교 그래프',
    machine_learning: 'Feature importance 막대 그래프, ROC curve, 혼동행렬 히트맵',
    causal_ml: 'CATE 분포 히스토그램, 처리효과 이질성 변수별 partial dependence plot, feature importance(처리효과 기준)',
    unstructured_data: '토픽 분포 막대 그래프 / 임베딩 t-SNE/UMAP 산점도, 단어 빈도 워드클라우드, 혼동행렬',
    bayesian: 'Posterior 분포 plot, trace plot, forest plot(사후 요약)',
    sem: 'Path diagram, 적합도 지표 비교 테이블',
    survival: 'Kaplan-Meier 생존 곡선(집단별 비교), Hazard ratio forest plot, Schoenfeld residuals plot',
    meta_analysis: 'Forest plot(개별 연구 + 통합 효과), funnel plot(출판 편향)',
    regression: '계수 forest plot, 잔차 진단 그래프(Q-Q plot, 잔차 vs 적합값)',
  };

  const vizHint = vizHints[category] || vizHints.regression;

  return `당신은 ${langName} 데이터 분석 전문가입니다.
아래 정보를 바탕으로 ${langName} 코드 하나만 작성하세요.
코드 외의 설명은 일절 쓰지 마세요. 순수 ${langName} 코드만 출력하세요.

[방법론]: ${standardName}
[분석 유형]: ${analysisType || '미지정'}
[학문 분야]: ${paperContext.domain || '사회과학'}
[연구 유형]: ${paperContext.research_type || '실증 연구'}
[데이터 특성]: ${paperContext.data_characteristics || '일반 데이터'}
[목표 결과물]: ${targetLocation}
[분석 절차]: ${JSON.stringify(steps)}
${keyVars.outcome ? `[결과변수]: ${keyVars.outcome}` : ''}
${keyVars.treatment ? `[핵심변수]: ${keyVars.treatment}` : ''}
${keyVars.controls ? `[통제/공변량]: ${keyVars.controls}` : ''}

★★★ 코드는 반드시 아래 4개 Phase 구조로 작성하세요 ★★★

# ============================================================
# Phase A: 원천 데이터 생성 (Raw Data Generation)
# ============================================================
# - ${dataHint}
# - 변수명은 논문 맥락에 맞는 영문 snake_case
# - ${dataGen}로 생성
# - 논문의 기술통계(평균, 표준편차, 범위)를 최대한 반영

# ============================================================
# Phase B: 데이터 전처리 및 가공 (Data Preprocessing)
# ============================================================
# - 분석 방법론에 맞게 데이터를 변환
# - 예: wide→long form 변환(melt/pivot), 결측치 처리, 로그 변환, 더미 변수 생성
# - 이상치 처리, 스케일링, 변수 생성 등 필요한 전처리 단계를 모두 포함
# - 최종 분석에 사용할 데이터프레임의 구조를 print로 확인

# ============================================================
# Phase C: 분석 및 결과 도출 (Analysis & Results)
# ============================================================
# - 분석 절차의 모든 단계를 순서대로 구현
# - 통계 모형 적합(fitting) 및 결과값 도출
# - 계수(coefficient), p-value, 적합도(R², AIC 등), 처리효과 등을 명확히 출력
# - 결과 출력은 ${targetLocation}와 유사한 학술 논문 스타일 테이블로 정리

# ============================================================
# Phase D: 테이블 및 시각화 (Tables & Visualization)
# ============================================================
# - 학술 논문 스타일의 결과 테이블(계수, SE, p-value, 유의수준 별표 포함) 출력
# - 추천 시각화: ${vizHint}
# - 최소 1개 이상의 핵심 그래프를 반드시 포함
# - 그래프에는 한국어 제목, 축 레이블, 범례를 포함
# - 학술 논문에 바로 삽입 가능한 수준의 시각화 품질

추가 조건:
1. 한국어 주석으로 각 Phase와 세부 단계를 설명
2. 권장 라이브러리: ${libs} (필요 시 다른 라이브러리도 자유롭게 사용)
3. 코드는 복사해서 바로 실행 가능해야 함 (import/library 포함)
4. Phase 사이에 빈 줄과 구분선 주석(# ====...)을 반드시 넣으세요

${langName} 코드만 출력하세요:`;
}

/**
 * 코드 응답에서 순수 코드만 추출 (마크다운 코드블록 제거)
 */
function cleanCodeResponse(raw, lang) {
  let code = raw.trim();
  // ```python ... ``` 또는 ```r ... ``` 제거
  const blockMatch = code.match(new RegExp('```(?:' + lang + ')?\\s*([\\s\\S]*?)```', 'i'));
  if (blockMatch) code = blockMatch[1].trim();
  // 남은 ``` 제거
  code = code.replace(/```/g, '').trim();
  return code || `# ${lang} 코드 생성 실패 — 재시도해주세요`;
}

/**
 * Agent 3 실행 — 패키지 목록 + Python/R 코드 개별 생성
 * @param {string} apiKey
 * @param {Object} statResult — Agent 2 결과
 * @param {Object} paperContext
 * @param {string} targetLocation
 * @param {Object} [methodMeta] — Agent 1의 detected_method 원본 (analysis_type, key_variables 포함)
 * @returns {Promise<{ packages: Object, pythonCode: string, rCode: string }>}
 */
export async function runAgent3(apiKey, statResult, paperContext, targetLocation, methodMeta) {
  // 3-1: 패키지 목록 (실패해도 계속 진행)
  let packages = { python: [], r: [] };
  try {
    const metaRaw = await callGemini(
      apiKey,
      buildAgent3MetaPrompt(statResult.standard_name, paperContext),
      API.tokens.agent3Meta
    );
    const metaResult = safeParseJSON(metaRaw);
    packages = metaResult.packages || packages;
  } catch { /* 패키지 파싱 실패는 무시 */ }

  // 3-2: Python 코드 생성
  let pythonCode = '# Python 코드 생성 실패 — 재시도해주세요';
  try {
    const pyRaw = await callGemini(
      apiKey,
      buildAgent3SingleLangPrompt('python', statResult.standard_name, statResult.steps, paperContext, targetLocation, methodMeta),
      API.tokens.agent3Code
    );
    pythonCode = cleanCodeResponse(pyRaw, 'python');
  } catch (err) {
    pythonCode = `# Python 코드 생성 실패\n# 오류: ${err.message}`;
  }

  // 3-3: R 코드 생성
  let rCode = '# R 코드 생성 실패 — 재시도해주세요';
  try {
    const rRaw = await callGemini(
      apiKey,
      buildAgent3SingleLangPrompt('r', statResult.standard_name, statResult.steps, paperContext, targetLocation, methodMeta),
      API.tokens.agent3Code
    );
    rCode = cleanCodeResponse(rRaw, 'r');
  } catch (err) {
    rCode = `# R 코드 생성 실패\n# 오류: ${err.message}`;
  }

  return { packages, pythonCode, rCode };
}

/* ============================================================
   Agent 5: 대화형 Q&A — 논문 맥락 기반 질의응답
   ============================================================ */

/**
 * 논문 맥락 기반 Q&A
 * @param {string} apiKey
 * @param {string} question — 사용자 질문
 * @param {string} paperText — 논문 전문
 * @param {Object} paperContext — Agent 1의 paper_context
 * @returns {Promise<string>} — 답변 텍스트
 */
export async function runQnA(apiKey, question, paperText, paperContext) {
  const prompt = `당신은 학술 논문 분석 및 실험 설계 전문가입니다. 아래 논문을 기반으로 질문에 답변하세요.

[논문 분야]: ${paperContext.domain || '사회과학'}
[연구 유형]: ${paperContext.research_type || '실증 연구'}
[데이터 특성]: ${paperContext.data_characteristics || '패널 데이터'}

논문 텍스트:
${paperText.substring(0, 20000)}

사용자 질문: ${question}

답변 규칙:
1. 논문에 근거하여 답변하세요. 추측은 명시적으로 "추정"이라고 표기.
2. 관련 테이블이나 섹션이 있으면 "→ Table X 참조", "→ Section Y 참조" 형태로 출처를 표기.
3. 통계 방법론에 대한 질문이면 쉬운 말로 설명 후 수식이나 예시를 포함.
4. 한국어로 답변하세요. 학술 용어는 영문을 병기(괄호).

**What-if 시나리오 지원:**
- 사용자가 "만약 ~을 제거하면?" 또는 "~을 추가하면?" 같은 가정 질문을 하면:
  a) 해당 변경이 모델에 미치는 통계적 영향을 설명 (예: 내생성 문제, 편향 방향)
  b) 예상되는 계수 변화 방향과 이유를 설명
  c) 실제 코드에서 어떤 부분을 수정해야 하는지 간단한 코드 스니펫 제시

**아이디어 실험 지원:**
- 사용자가 새로운 연구 아이디어를 제안하면:
  a) 논문의 기존 프레임워크 내에서 실현 가능성을 평가
  b) 필요한 추가 변수나 데이터 설명
  c) 예상 결과와 해석 방향을 제시
  d) 구현을 위한 코드 수정 방향을 안내

답변은 체계적이되 간결하게 (5~10문장) 작성하세요.`;

  return await callGemini(apiKey, prompt, API.tokens.qna);
}

/* ============================================================
   Agent 6: 분석 결과 해석 가이드
   ============================================================ */

/**
 * 가상 데이터로 분석했을 때의 예상 결과와 해석 가이드 생성
 * @param {string} apiKey
 * @param {Object} methodResult — Agent 2의 분석 결과
 * @param {Object} paperContext
 * @param {string} targetLocation — 목표 테이블
 * @returns {Promise<string>} — 해석 가이드 (마크다운)
 */
export async function runInterpretationGuide(apiKey, methodResult, paperContext, targetLocation) {
  const category = paperContext.analysis_category || '';
  const analysisType = methodResult.analysis_type || '';

  // 분석 유형에 따라 Step 2, 5의 용어/내용을 동적으로 설정
  let step2Guide, step5Tasks;

  const at = (analysisType + ' ' + category).toLowerCase();

  if (at.includes('anova') || at.includes('experiment')) {
    step2Guide = `## Step 2: 핵심 통계량 읽기
- F-값(F-statistic)과 p-value의 의미: 집단 간 차이가 통계적으로 유의한지
- 효과크기(η², partial η²)의 해석: 독립변수가 종속변수 변동의 몇 %를 설명하는지
- 사후검정(post-hoc test) 결과: 어느 집단 쌍 간에 유의한 차이가 있는지`;
    step5Tasks = `## Step 5: 심화 실습 과제
1. 요인의 수준을 늘리거나 줄여서 검정력 변화 관찰
2. 공변량(covariate)을 추가하여 ANCOVA로 확장
3. 비모수 대안(Kruskal-Wallis 등)과 결과 비교`;
  } else if (at.includes('spatial')) {
    step2Guide = `## Step 2: 핵심 통계량 읽기
- 공간자기상관 계수(ρ 또는 λ)의 의미: 인근 지역 간 종속변수의 상관 정도
- Moran's I 통계량: 전역적 공간자기상관의 유의성
- 직접효과(direct)와 간접효과(indirect/spillover)의 구분`;
    step5Tasks = `## Step 5: 심화 실습 과제
1. 공간 가중행렬(W)의 정의를 바꿔서 결과 민감도 확인 (queen vs rook vs knn)
2. 공간 래그 모형(SAR)과 공간 오차 모형(SEM)의 결과 비교
3. Moran's I scatter plot으로 공간적 패턴 시각화`;
  } else if (at.includes('time') || at.includes('arima') || at.includes('var')) {
    step2Guide = `## Step 2: 핵심 통계량 읽기
- 자기회귀 계수(AR coefficients)와 이동평균 계수(MA coefficients)의 의미
- 충격반응함수(IRF)의 해석: 변수 간 동태적 관계
- 단위근 검정(ADF/PP) 결과: 시계열의 안정성(stationarity)`;
    step5Tasks = `## Step 5: 심화 실습 과제
1. 시차(lag) 수를 변경하여 모형 적합도(AIC/BIC) 비교
2. 예측(forecast)을 수행하고 실제 값과 비교
3. Granger 인과성 검정으로 변수 간 선후 관계 확인`;
  } else if (at.includes('survival') || at.includes('cox') || at.includes('hazard')) {
    step2Guide = `## Step 2: 핵심 통계량 읽기
- 위험비(Hazard Ratio, HR)의 의미: HR > 1이면 해당 변수가 이벤트 발생 위험을 높임
- Kaplan-Meier 생존 곡선의 해석: 집단 간 생존율 차이
- Log-rank 검정의 p-value: 생존 곡선 간 유의한 차이 여부`;
    step5Tasks = `## Step 5: 심화 실습 과제
1. 공변량을 추가/제거하며 위험비 변화 관찰
2. 하위집단별 Kaplan-Meier 곡선 비교 (성별, 연령대 등)
3. 비례위험 가정(PH assumption) 진단 검정 수행`;
  } else if (at.includes('machine') || at.includes('random_forest') || at.includes('xgboost')) {
    step2Guide = `## Step 2: 핵심 성능 지표 읽기
- 정확도(Accuracy), 정밀도(Precision), 재현율(Recall), F1-score의 의미
- 특성 중요도(Feature Importance): 어떤 변수가 예측에 가장 영향력 있는지
- 과적합 여부: 학습 성능 vs 테스트 성능 비교`;
    step5Tasks = `## Step 5: 심화 실습 과제
1. 하이퍼파라미터 튜닝으로 성능 향상 시도
2. 다른 알고리즘(예: 로지스틱 vs 랜덤포레스트 vs XGBoost)과 비교
3. SHAP 또는 Permutation Importance로 모형 해석`;
  } else if (at.includes('causal_ml') || at.includes('dml') || at.includes('causal_forest') || at.includes('causal forest')) {
    step2Guide = `## Step 2: 핵심 인과추론 결과 읽기
- ATE/CATE(조건부 평균 처리효과) 추정치와 신뢰구간의 의미
- 처리효과 이질성: 어떤 하위집단에서 효과가 크거나 작은지
- 변수 중요도(처리효과 이질성 기준): 어떤 공변량이 처리효과의 차이를 주도하는지`;
    step5Tasks = `## Step 5: 심화 실습 과제
1. 공변량 집합을 변경하여 CATE 추정의 민감도 확인
2. DML과 Causal Forest 결과를 비교하여 모형 가정의 영향 관찰
3. 처리효과의 정책적 함의를 해석 (예: 어떤 집단에 정책을 집중해야 하는지)`;
  } else if (at.includes('unstructured') || at.includes('nlp') || at.includes('bert') || at.includes('topic') || at.includes('text') || at.includes('cnn') || at.includes('rnn')) {
    step2Guide = `## Step 2: 핵심 결과 읽기
- 분류 성능 지표(Accuracy, F1, AUC)의 의미와 모형 간 비교
- 토픽 모델링 결과: 각 토픽의 대표 키워드와 문서 분포 해석
- 임베딩 시각화(t-SNE/UMAP): 클러스터 구조가 무엇을 의미하는지`;
    step5Tasks = `## Step 5: 심화 실습 과제
1. 사전학습 모델(BERT 등)과 전통 ML(TF-IDF + SVM)의 성능 비교
2. 토픽 수(K)를 변경하여 Coherence score 비교
3. 임베딩 차원 축소 방법(t-SNE vs UMAP)에 따른 시각화 차이 관찰`;
  } else {
    // 기본: 회귀분석/인과추론/DID/IV 등
    step2Guide = `## Step 2: 핵심 계수(coefficient) 읽기
- 종속변수가 무엇이고, 핵심 독립변수의 계수가 의미하는 것
- "계수 β = X.XX는 [독립변수]가 1단위 증가할 때 [종속변수]가 X.XX만큼 변화함을 의미"
- 괄호 안의 표준오차(SE)와 별표(*)의 유의수준 해석법`;
    step5Tasks = `## Step 5: 심화 실습 과제
1. 통제변수를 하나씩 제거하며 계수 변화 관찰 (민감도 분석)
2. 표본을 하위집단으로 나누어 이질적 효과 확인
3. 다른 추정 방법(예: OLS vs IV, Logit vs Probit)으로 결과 비교`;
  }

  const prompt = `당신은 통계 분석 교육 전문가이자 학술 논문 평가 전문가입니다. 결과 해석, 독립적 평가, 유사논문 비교를 3파트로 작성합니다.

학생이 논문의 "${targetLocation}" 결과를 가상 데이터로 재현했습니다.
결과를 저자 관점에서 해석(70%)하고, AI 평가자로서 독립 평가(30%)하고, 유사논문과 비교 분석하세요.

[방법론]: ${methodResult.standard_name}
[분석 유형]: ${analysisType || '미지정'}
[논문 분야]: ${paperContext.domain || '사회과학'}
[데이터 특성]: ${paperContext.data_characteristics || '일반 데이터'}
[목표 결과]: ${targetLocation}
[분석 절차]: ${JSON.stringify(methodResult.steps)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Part I: 저자 관점의 결과 해석 (Author's Interpretation — 70%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

논문 저자의 시각에서 결과를 해석하세요. 논문 본문에 기술된 해석을 최대한 충실하게 반영하되,
통계적 결과를 읽는 방법을 구체적으로 안내하세요.

## Step 1: 결과 테이블/그림 구조 파악
- ${targetLocation}의 구조(행/열, 패널, 범례 등) 설명
- 각 열 또는 패널이 의미하는 모델 사양/조건/집단 설명

${step2Guide}

## Step 3: 가상 데이터로 테이블/그래프/문서 만들기
- 코드 실행 결과를 논문의 ${targetLocation}과 같은 형태로 정리하는 방법
- Phase D에서 생성한 시각화의 해석 방법
- 결과를 학술 문서 스타일로 기술하는 방법

## Step 4: 원본 논문 결과와 비교 해석
- 가상 데이터 결과가 원본과 다를 수 있는 이유 (데이터 생성 한계)
- 어떤 측면(방향, 크기, 유의성, 패턴)을 비교해야 하는지
- "결과가 다르다고 실패가 아니다 — 방법론의 원리를 이해하는 것이 목표"

${step5Tasks}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Part II: AI 평가자의 독립 평가 (AI Assessment — 30%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

당신은 이제 **독립적 평가자(evaluator)**입니다. 저자의 해석에 동의하는 부분과 의문을 제기하는 부분을 구분하여 작성하세요.

## 평가 1: 방법론 적절성 평가
- 이 연구 목적에 "${methodResult.standard_name}" 방법론이 **최적의 선택이었는지** 평가
- 핵심 가정(assumptions) 위반 가능성과 결과에 미치는 영향
- "만약 내가 심사위원이라면 지적할 사항" 2~3가지

## 평가 2: 결과의 강건성 평가
- 이 결과가 민감도 분석(robustness check)을 통과할 수 있는지
- 내생성(endogeneity) 또는 선택편향(selection bias) 우려
- 빠져있는 강건성 검정 제안 (위약검정, 표본제한 분석 등)

## 평가 3: 대안 방법론 제안
- 더 효과적인 대안 방법론 2~3가지 (구체적 이유와 함께)
- 각 대안의 Python/R 패키지명 + 핵심 함수
- 대표 논문/제안자 인용

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Part III: 유사 논문 비교 분석 (Comparative Analysis)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

이 논문과 동일하거나 유사한 주제/방법론을 사용한 **최근 학술 논문 3~5편**을 제시하고 비교 분석하세요.

## 유사 논문 1: [저자(연도), 논문제목]
- **공통점**: 이 논문과 공유하는 방법론/데이터/주제
- **차이점**: 이 논문과 다른 접근법이나 결과
- **시사점**: 이 논문의 결과를 보완하거나 반박하는 증거

(3~5편 반복)

## 종합 비교 평가
- 이 논문의 기여가 기존 문헌 대비 어떤 부분에서 차별화되는지
- 기존 문헌에서 이 논문이 놓치고 있는 관점이 있다면 제시

한국어로 작성하세요. 학술 용어는 영문을 병기(괄호)하세요.`;

  return await callGemini(apiKey, prompt, API.tokens.interpretation);
}

/**
 * 사고확장: 데이터 변형 아이디어 생성
 * @param {string} apiKey
 * @param {Object} paperContext — 논문 컨텍스트
 * @param {Object} methodResult — Agent 2 분석 결과
 * @returns {Promise<string>} — 마크다운 텍스트
 */
export async function runExpandIdeas(apiKey, paperContext, methodResult) {
  const prompt = `당신은 연구 설계 전문가입니다.

[논문 분야]: ${paperContext.domain || '사회과학'}
[분석 카테고리]: ${paperContext.analysis_category || '미지정'}
[데이터 특성]: ${paperContext.data_characteristics || '일반 데이터'}
[현재 방법론]: ${methodResult.standard_name || '미지정'}
[핵심 변수]: ${JSON.stringify(methodResult.key_variables || {})}

현재 논문의 데이터를 **변형하거나 확장**하여 새로운 연구 질문을 탐구할 수 있는 아이디어 3~5가지를 제안하세요.

각 아이디어에 대해:
## 아이디어 N: [제목]
- **변형 방향**: 어떤 데이터/변수를 어떻게 바꾸는지 (예: "소매업 → 음식점업", "횡단면 → 시계열", "국내 → 국가간 비교")
- **연구 질문**: 변형된 데이터로 답할 수 있는 새로운 질문
- **예상 가설**: 기대되는 결과 방향과 근거
- **필요 데이터**: 추가로 수집해야 할 데이터와 출처
- **분석 방법**: 적합한 분석 방법론과 코드 수정 방향
- **실현 가능성**: 상/중/하 + 이유

아이디어는 구체적이고 실행 가능해야 합니다. 단순한 제안이 아니라 "이렇게 하면 이런 결과가 나올 것이다"까지 추론하세요.
한국어로 작성하세요. 학술 용어는 영문을 병기(괄호)하세요.`;

  return await callGemini(apiKey, prompt, API.tokens.interpretation);
}

/**
 * 사고확장: 대안 방법론 상세 제안
 * @param {string} apiKey
 * @param {Object} paperContext
 * @param {Object} methodResult
 * @returns {Promise<string>}
 */
export async function runExpandMethods(apiKey, paperContext, methodResult) {
  const prompt = `당신은 계량경제학/통계방법론 전문가입니다.

[논문 분야]: ${paperContext.domain || '사회과학'}
[현재 방법론]: ${methodResult.standard_name || '미지정'}
[분석 유형]: ${methodResult.analysis_type || '미지정'}
[데이터 특성]: ${paperContext.data_characteristics || '일반 데이터'}

현재 논문이 사용한 "${methodResult.standard_name}" 대신 사용할 수 있는 **대안 방법론 3~4가지**를 상세하게 제안하세요.

각 대안에 대해:
## 대안 N: [방법론 명칭]
- **왜 대안인가**: 현재 방법론의 어떤 한계를 극복하는지
- **핵심 원리**: 이 방법론의 핵심 아이디어 (2~3문장)
- **장점**: 현재 방법론 대비 구체적 장점
- **단점/한계**: 이 대안의 한계와 적용 조건
- **적용 시 예상 결과**: "이 방법론을 적용하면 [구체적 변화]가 예상됩니다"
- **구현 코드 스니펫**:
  - Python: 핵심 코드 3~5줄 (패키지명 + 주요 함수)
  - R: 핵심 코드 3~5줄 (패키지명 + 주요 함수)
- **대표 논문**: 저자(연도), "논문 제목", 저널명

단순 나열이 아니라, "이 논문에 이 방법론을 적용하면 구체적으로 어떤 결과가 달라지는지"를 추론하세요.
한국어로 작성하세요. 코드와 학술 용어는 영문을 유지하세요.`;

  return await callGemini(apiKey, prompt, API.tokens.interpretation);
}

/* ============================================================
   Agent 4+: 데이터 구조 설명 + 기술통계 추출 + 변수 테이블 (v5 신규)
   ============================================================ */

/**
 * Agent 4+ 프롬프트 — 데이터 구조, 변수 목록, 기술통계를 한 번에 추출
 * @param {string} paperText — 논문 전문
 * @param {Object} paperContext — Agent 1의 paper_context
 * @param {Array} detectedMethods — Agent 1의 detected_methods
 * @returns {string} 프롬프트
 */
function buildAgent4PlusPrompt(paperText, paperContext, detectedMethods) {
  const category = paperContext.analysis_category || 'regression';
  const keyVars = detectedMethods?.[0]?.key_variables || {};

  // 카테고리별 데이터 구조 힌트
  const structureHints = {
    regression: '횡단면 데이터(cross-section): N개 관측치, 단일 시점',
    causal_inference: '패널 데이터(panel): entity × time 구조, 개체 추적, 처리군/통제군',
    experimental: '실험 데이터: 처리군/통제군, 요인설계(factorial design)',
    spatial: '공간 데이터: 지역 단위, 좌표/공간 가중행렬 포함',
    time_series: '시계열 데이터: 시간 인덱스, 단일/다변량',
    machine_learning: '특성-목표 데이터: features × samples, train/test 분할',
    causal_ml: '고차원 관측 데이터: 처리변수 + 다수 공변량 + 결과변수',
    unstructured_data: '비정형 데이터: 텍스트/이미지/임베딩 벡터',
    bayesian: '관측 데이터 + 사전분포 정보',
    sem: '설문/관측 데이터: 다중 관측변수 → 잠재변수 구조',
    survival: '생존 데이터: 시간-이벤트, 중도절단 포함',
    meta_analysis: '메타 데이터: 개별 연구별 효과크기/표준오차/표본크기',
  };

  const hint = structureHints[category] || structureHints.regression;

  return `당신은 데이터 분석 전문가입니다. 아래 논문에서 데이터 구조와 변수 정보를 추출하세요.
반드시 순수 JSON만 출력하세요. 첫 글자는 반드시 { 이어야 합니다. 마크다운 코드블록은 절대 사용하지 마세요.

[논문 분야]: ${paperContext.domain || '사회과학'}
[분석 카테고리]: ${category}
[데이터 구조 힌트]: ${hint}
[데이터 특성]: ${paperContext.data_characteristics || '알 수 없음'}
${keyVars.outcome ? `[종속변수]: ${keyVars.outcome}` : ''}
${keyVars.treatment ? `[핵심 독립변수]: ${keyVars.treatment}` : ''}
${keyVars.controls ? `[통제변수]: ${keyVars.controls}` : ''}

논문 텍스트 (앞부분):
${paperText.substring(0, 15000)}

아래 JSON 형식으로 출력하세요:
{
  "data_description": "이 논문이 사용하는 데이터에 대한 구체적 설명 (예: '249개 시군구 × 7년(2005-2011) 패널 데이터'). 2~3문장.",
  "data_type": "panel | cross_section | time_series | experimental | spatial | text_corpus | image | meta | other",
  "sample_info": {
    "n_obs": "전체 관측치 수 (논문에 명시된 경우, 없으면 추정치)",
    "n_entities": "개체 수 (패널인 경우)",
    "n_periods": "기간 수 (패널/시계열인 경우)",
    "time_range": "관측 기간 (예: '2005-2011')"
  },
  "variables": [
    {
      "name_kr": "한국어 변수명",
      "name_en": "영문 변수명 (snake_case)",
      "role": "종속 | 독립 | 통제 | 도구 | 매개 | 조절 | 고정효과 | 기타",
      "type": "연속 | 이진 | 범주 | 순서 | 시간 | ID",
      "mean": "평균 (논문에서 추출, 없으면 null)",
      "sd": "표준편차 (논문에서 추출, 없으면 null)",
      "min": "최솟값 (없으면 null)",
      "max": "최댓값 (없으면 null)",
      "description": "변수 설명 (15자 이내)"
    }
  ],
  "structure_diagram": "데이터 구조를 텍스트로 도식화. 패널이면 'entity_id × year → treatment, outcome, controls', 실험이면 '집단(처리/통제) × 시점(사전/사후)' 등. 1~2줄.",
  "limitations": "이 데이터의 알려진 한계점 (1~2문장). 예: '가상 데이터는 원본의 기술통계를 기반으로 역산한 것이므로 변수 간 복잡한 상관구조가 완벽히 재현되지 않을 수 있습니다.'"
}

중요:
- variables 배열에는 논문에서 식별 가능한 **모든 주요 변수** (최소 5개, 최대 15개)를 포함
- 기술통계(mean, sd, min, max)는 논문의 Table 1(기술통계표)에서 직접 추출
- 기술통계가 논문에 없으면 데이터 특성과 분야 지식으로 합리적으로 추정하고, 추정값에는 (추정) 표시
- name_en은 코드에서 바로 사용할 수 있는 영문 snake_case로 작성`;
}

/**
 * Agent 4+ 실행 — 데이터 구조 + 기술통계 + 변수 테이블 통합 추출
 * v5에서 Agent 1 직후에 호출 (파이프라인 초기)
 * @param {string} apiKey
 * @param {string} paperText — 논문 전문
 * @param {Object} paperContext — Agent 1의 paper_context
 * @param {Array} detectedMethods — Agent 1의 detected_methods
 * @returns {Promise<Object>} — 데이터 구조 정보
 */
export async function runAgent4Plus(apiKey, paperText, paperContext, detectedMethods) {
  const prompt = buildAgent4PlusPrompt(paperText, paperContext, detectedMethods);
  const raw = await callGemini(apiKey, prompt, API.tokens.agent4Plus || 4000);

  try {
    const result = safeParseJSON(raw);
    // 변수 배열 검증
    if (!Array.isArray(result.variables)) {
      result.variables = [];
    }
    return result;
  } catch (err) {
    // 강제 복구 시도
    const start = raw.indexOf('{');
    if (start >= 0) {
      let partial = raw.slice(start).replace(/,\s*$/, '');
      const ob = (partial.match(/\[/g) || []).length - (partial.match(/\]/g) || []).length;
      const oc = (partial.match(/\{/g) || []).length - (partial.match(/\}/g) || []).length;
      for (let i = 0; i < ob; i++) partial += ']';
      for (let i = 0; i < oc; i++) partial += '}';
      try { return JSON.parse(partial); }
      catch { /* 아래 기본값 반환 */ }
    }
    // 기본 구조 반환
    return {
      data_description: '데이터 구조를 추출하지 못했습니다.',
      data_type: 'unknown',
      sample_info: {},
      variables: [],
      structure_diagram: '',
      limitations: '데이터 구조 추출에 실패했습니다. 논문의 기술통계 표를 직접 참조해주세요.',
    };
  }
}

/* ============================================================
   Agent 6+: 리뷰 & 대안 방법론 (v5 — 탭3 온디맨드)
   ============================================================ */

/**
 * 리뷰 가이드 생성 — 동료 리뷰 + 대안 방법론 + 후속 연구 통합
 * v5 탭3에서 [리뷰 & 대안 생성] 버튼 클릭 시 호출
 * @param {string} apiKey
 * @param {Object} paperContext — Agent 1의 paper_context
 * @param {Object} methodResult — Agent 2의 분석 결과 (standard_name, steps 등)
 * @param {Object} methodMeta — Agent 1의 detected_method 원본
 * @returns {Promise<{ peer: string, alternatives: string, future: string }>}
 */
export async function runReviewGuide(apiKey, paperContext, methodResult, methodMeta) {
  const category = paperContext.analysis_category || '';
  const analysisType = methodMeta?.analysis_type || methodResult.analysis_type || '';
  const keyVars = methodMeta?.key_variables || {};
  const targetLocation = methodMeta?.target_result_location || '';

  const prompt = `당신은 학술 논문 심사위원이자 방법론 전문가입니다.
아래 논문의 분석 방법에 대해 3파트로 나누어 심층 리뷰를 작성하세요.

[방법론]: ${methodResult.standard_name || '미지정'}
[분석 유형]: ${analysisType || '미지정'}
[논문 분야]: ${paperContext.domain || '사회과학'}
[데이터 특성]: ${paperContext.data_characteristics || '일반 데이터'}
[분석 카테고리]: ${category}
[목표 결과]: ${targetLocation}
${keyVars.outcome ? `[종속변수]: ${keyVars.outcome}` : ''}
${keyVars.treatment ? `[핵심 독립변수]: ${keyVars.treatment}` : ''}
${keyVars.controls ? `[통제변수]: ${keyVars.controls}` : ''}

반드시 아래 구분자 형식으로 출력하세요. 각 섹션을 빠짐없이 포함하세요.

===PEER_REVIEW===
## 동료 리뷰 (Peer Review)

### 1. 방법론 핵심 가정과 위반 가능성
- 이 방법론("${methodResult.standard_name}")의 핵심 가정 3가지를 나열하세요.
- 각 가정이 이 논문의 데이터/맥락에서 위반될 가능성과 그 영향을 평가하세요.

### 2. 내적 타당성 및 강건성 우려
- 내생성(endogeneity), 선택편향(selection bias) 등 인과추론 위협 요소를 평가하세요.
- 결과의 민감도(robustness)에 대한 우려 사항을 기술하세요.

### 3. 빠진 강건성 검정 제안
- 논문에서 수행하지 않았지만 수행해야 할 강건성 검정 3~5가지를 구체적으로 제안하세요.
- 각 검정의 목적, 방법, 기대 결과를 간략히 설명하세요.

### 4. 심사위원 의견 종합
- "만약 내가 이 논문의 심사위원이라면" 관점에서 주요 지적 사항 3가지를 요약하세요.
- 각 지적에 대한 개선 방향도 함께 제시하세요.

한국어로 작성하세요. 학술 용어는 영문을 병기(괄호)하세요.
===END_PEER_REVIEW===

===ALTERNATIVES===
## 대안 방법론 제안

아래 형식으로 대안 방법론 3~4가지를 제안하세요. 각 대안에 대해 반드시 모든 항목을 포함하세요.

### 대안 1: [방법론 명칭]
- **왜 대안인가**: 현재 방법론의 어떤 한계를 극복하는지
- **핵심 원리**: 이 방법론의 핵심 아이디어 (2~3문장)
- **장점**: 현재 방법론 대비 구체적 장점
- **단점/한계**: 이 대안의 한계와 적용 조건
- **적용 시 예상 결과**: 이 논문 데이터에 적용하면 구체적으로 어떤 변화가 예상되는지
- **구현 정보**: Python 패키지/함수, R 패키지/함수
- **대표 논문**: 저자(연도), 저널명

(3~4개 반복)

한국어로 작성하세요. 코드와 학술 용어는 영문을 유지하세요.
===END_ALTERNATIVES===

===FUTURE_RESEARCH===
## 후속 연구 아이디어

이 논문을 기반으로 확장할 수 있는 후속 연구 방향 3~5가지를 제안하세요.

### 아이디어 1: [제목]
- **확장 방향**: 데이터/변수/방법을 어떻게 확장하는지
- **연구 질문**: 새로운 연구 질문
- **필요 데이터**: 추가 데이터와 출처
- **분석 방법**: 적합한 분석 방법론
- **예상 결과**: 기대되는 결과 방향
- **실현 가능성**: 상/중/하 + 이유

(3~5개 반복)

한국어로 작성하세요. 학술 용어는 영문을 병기(괄호)하세요.
===END_FUTURE_RESEARCH===`;

  const raw = await callGemini(apiKey, prompt, API.tokens.review || 8000);

  // 3파트 파싱 (end marker 누락 시 다음 섹션 시작을 경계로 사용)
  const peerMatch = raw.match(/===PEER_REVIEW===([\s\S]*?)(?:===END_PEER_REVIEW===|===ALTERNATIVES===)/);
  const altMatch = raw.match(/===ALTERNATIVES===([\s\S]*?)(?:===END_ALTERNATIVES===|===FUTURE_RESEARCH===)/);
  const futureMatch = raw.match(/===FUTURE_RESEARCH===([\s\S]*?)(?:===END_FUTURE_RESEARCH===|$)/);

  // fallback: end marker도 다음 섹션도 없으면 원본에서 섹션 구분자 제거 후 반환
  const cleanRaw = raw.replace(/===\w+===/g, '').trim();

  return {
    peer: peerMatch ? peerMatch[1].trim() : cleanRaw,
    alternatives: altMatch ? altMatch[1].trim() : '',
    future: futureMatch ? futureMatch[1].trim() : '',
  };
}
