/**
 * agents.js — 에이전트 프롬프트 정의 및 API 호출
 * ResearchMethodAgent v4.0
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

아래는 10가지 주요 분석 카테고리입니다. 논문의 데이터 구조, 키워드, 결과 테이블 형태를 아래와 대조하여 analysis_category를 결정하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. regression (회귀분석 — 횡단면)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: OLS, linear regression, logistic regression, probit, tobit, quantile regression, robust SE, heteroskedasticity
• 데이터 구조: 횡단면(cross-section), 단일 시점, N개 관측치
• 결과 테이블 특징: 계수(β), 표준오차(SE), t-값, p-값, R², 조정 R²
• 대표 분석: OLS, WLS, GLS, 로지스틱회귀, 프로빗, 토빗, 분위수회귀
• 주의: 패널/시계열이 아닌 단일 시점 데이터에만 적용

2. panel (패널/종단 분석)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: panel data, fixed effects, random effects, DID, difference-in-differences, PSM-DID, RDD, regression discontinuity, instrumental variable, 2SLS, IV, GMM, Hausman test, entity effects, time effects, within estimator
• 데이터 구조: 패널(entity × time), 다기간 관측, 개체 추적
• 결과 테이블 특징: 고정효과/랜덤효과 계수, Hausman검정, 처리효과(ATT/ATE), 1st stage F-stat(IV), bandwidth(RDD)
• 대표 분석: 고정효과(FE), 랜덤효과(RE), DID, PSM-DID, RDD, IV/2SLS, system GMM
• 핵심 구분: "처리군 vs 통제군" + "처리 전 vs 처리 후" 구조 → DID. 성향점수 매칭 언급 → PSM-DID. 임계값/컷오프 기준 → RDD.

3. experimental (실험 설계)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: RCT, randomized controlled trial, experiment, treatment group, control group, between-subjects, within-subjects, factorial design, ANOVA, MANOVA, ANCOVA, repeated measures, effect size, Cohen's d, η², random assignment, manipulation check
• 데이터 구조: 실험군/통제군, 요인설계(2×2, 2×3 등), 반복측정
• 결과 테이블 특징: F-값, 자유도(df), 효과크기(η², d), 사후검정(Tukey, Bonferroni), 조건별 평균/SD
• 대표 분석: 독립표본 t-검정, 일원/이원 ANOVA, MANOVA, ANCOVA, 반복측정 ANOVA, 혼합설계 ANOVA
• 핵심 구분: "무작위 배정"이 명시 → experimental. "처리군/통제군"만 있고 무작위 미언급 → panel(DID) 가능성.

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

6. machine_learning (기계학습)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: machine learning, random forest, XGBoost, gradient boosting, neural network, deep learning, SVM, support vector, cross-validation, k-fold, hyperparameter, feature importance, ROC, AUC, confusion matrix, train/test split, overfitting, ensemble
• 데이터 구조: 특성변수(features) × 표본, 대규모 데이터셋, 학습/테스트 분할
• 결과 테이블 특징: Accuracy, Precision, Recall, F1, AUC-ROC, RMSE, MAE, feature importance ranking
• 대표 분석: 랜덤포레스트, XGBoost, SVM, 로지스틱(ML맥락), kNN, 신경망, 앙상블
• 핵심 구분: "예측" 목적 + 교차검증/하이퍼파라미터 → ML. "설명/인과" 목적 → regression 또는 panel.

7. bayesian (베이지안 분석)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: Bayesian, prior, posterior, MCMC, Gibbs sampling, Metropolis-Hastings, credible interval, BF(Bayes Factor), hierarchical model, informative prior, noninformative prior, convergence diagnostics, Rhat, trace plot
• 데이터 구조: 다양 (횡단면, 계층, 시계열 모두 가능)
• 결과 테이블 특징: 사후분포(posterior) 요약(평균, 중앙값, 95% CrI), Rhat, ESS, Bayes Factor
• 대표 분석: 베이지안 회귀, 베이지안 계층모형(HLM), BVAR
• 핵심 구분: "사전분포(prior)", "사후분포(posterior)", "MCMC" 명시 → bayesian

8. sem (구조방정식 모형)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: SEM, structural equation, path analysis, latent variable, factor loading, CFA, confirmatory factor analysis, EFA, exploratory factor analysis, measurement model, structural model, fit indices, CFI, TLI, RMSEA, SRMR, modification indices
• 데이터 구조: 다중 관측변수 → 잠재변수 구조, 설문 기반 데이터
• 결과 테이블 특징: 요인적재량(λ), 경로계수(β), 적합도지수(χ², CFI, TLI, RMSEA, SRMR), AVE, CR
• 대표 분석: CFA, 경로분석, 완전구조방정식모형, 다집단분석, 매개/조절분석
• 핵심 구분: "잠재변수(latent)", "적합도(fit index)", "경로계수(path coefficient)" → sem

9. survival (생존 분석)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 식별 키워드: survival analysis, Cox regression, Cox PH, proportional hazards, Kaplan-Meier, log-rank test, hazard ratio, censoring, event time, time-to-event, AFT model, competing risks, recurrent events
• 데이터 구조: 시간-이벤트 데이터, 중도절단(censoring) 포함, 추적관찰 기간
• 결과 테이블 특징: 위험비(HR), 95% CI, 생존곡선, 중앙생존시간, log-rank p-value
• 대표 분석: Kaplan-Meier, Cox 비례위험모형, 가속실패시간(AFT), 경쟁위험 모형
• 핵심 구분: "위험(hazard)", "생존(survival)", "중도절단(censoring)" → survival

10. meta_analysis (메타분석)
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
7. 교차검증/feature importance/예측 모형 → machine_learning
8. 단위근/ARIMA/VAR/공적분 → time_series
9. 패널(entity×time)/FE/RE/DID/IV/PSM → panel
10. 위에 해당 없으면 → regression
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
    "analysis_category": "위 분류 체계의 10개 카테고리 중 가장 적합한 것 1개: regression | panel | experimental | spatial | time_series | machine_learning | bayesian | sem | survival | meta_analysis",
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
function getAnalysisProfile(category, analysisType, lang) {
  const profiles = {
    regression: {
      python: 'pandas, numpy, statsmodels, scipy',
      r: 'dplyr, lmtest, sandwich, car',
      dataHint: '횡단면 데이터를 생성하세요. 종속변수, 독립변수, 통제변수를 포함.',
    },
    panel: {
      python: 'pandas, numpy, statsmodels, linearmodels, scipy',
      r: 'fixest, plm, dplyr, lmtest',
      dataHint: '패널 데이터(entity-time 구조)를 생성하세요. entity ID와 시간 변수를 포함.',
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
    else if (at.includes('did') || at.includes('panel') || at.includes('psm') || at.includes('rdd') || at.includes('iv') || at.includes('2sls'))
      profile = profiles.panel;
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

코드 작성 조건:
1. Mock 데이터 생성: ${dataHint}
   - 변수명은 논문 맥락에 맞는 영문 snake_case
   - ${dataGen}로 생성
2. 분석 절차의 모든 단계를 순서대로 구현
3. 결과 출력은 ${targetLocation}와 유사한 형태로 출력
4. 한국어 주석으로 각 단계를 설명
5. 권장 라이브러리: ${libs} (필요 시 다른 라이브러리도 자유롭게 사용)
6. 코드는 복사해서 바로 실행 가능해야 함 (import/library 포함)

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
  } else {
    // 기본: 회귀분석/패널/DID/IV 등
    step2Guide = `## Step 2: 핵심 계수(coefficient) 읽기
- 종속변수가 무엇이고, 핵심 독립변수의 계수가 의미하는 것
- "계수 β = X.XX는 [독립변수]가 1단위 증가할 때 [종속변수]가 X.XX만큼 변화함을 의미"
- 괄호 안의 표준오차(SE)와 별표(*)의 유의수준 해석법`;
    step5Tasks = `## Step 5: 심화 실습 과제
1. 통제변수를 하나씩 제거하며 계수 변화 관찰 (민감도 분석)
2. 표본을 하위집단으로 나누어 이질적 효과 확인
3. 다른 추정 방법(예: OLS vs IV, Logit vs Probit)으로 결과 비교`;
  }

  const prompt = `당신은 통계 분석 교육 전문가입니다.

학생이 논문의 "${targetLocation}" 결과를 가상 데이터로 재현했습니다.
이 학생이 결과를 단계별로 이해할 수 있도록, **논문의 실제 결과 구조를 기반으로** 구체적인 해석 가이드를 작성하세요.

[방법론]: ${methodResult.standard_name}
[분석 유형]: ${analysisType || '미지정'}
[논문 분야]: ${paperContext.domain || '사회과학'}
[데이터 특성]: ${paperContext.data_characteristics || '일반 데이터'}
[목표 결과]: ${targetLocation}
[분석 절차]: ${JSON.stringify(methodResult.steps)}

아래 5단계로 한국어 가이드를 작성하세요. **일반론이 아닌 이 논문에 특화된 내용**으로 작성하세요:

## Step 1: 결과 테이블/그림 구조 파악
- ${targetLocation}의 구조(행/열, 패널, 범례 등) 설명
- 각 열 또는 패널이 의미하는 모델 사양/조건/집단 설명

${step2Guide}

## Step 3: 가상 데이터로 테이블/그래프/문서 만들기
- 코드 실행 결과를 논문의 ${targetLocation}과 같은 형태로 정리하는 방법
- 주요 결과를 시각화하는 적절한 그래프 유형과 제작 가이드
- 결과를 학술 문서 스타일로 기술하는 방법

## Step 4: 원본 논문 결과와 비교 해석
- 가상 데이터 결과가 원본과 다를 수 있는 이유 (데이터 생성 한계)
- 어떤 측면(방향, 크기, 유의성, 패턴)을 비교해야 하는지
- "결과가 다르다고 실패가 아니다 — 방법론의 원리를 이해하는 것이 목표"

${step5Tasks}

## Step 6: 방법론 한계 및 최신 대안 (Method Evolution)
이 논문이 사용한 "${methodResult.standard_name}" 방법론에 대해 다음을 분석하세요:

1. **이 방법론의 알려진 한계점** (2~3가지):
   - 이 논문의 구체적 맥락(분야: ${paperContext.domain}, 데이터: ${paperContext.data_characteristics})에서 어떤 한계가 있는지
   - 어떤 가정(assumption)이 위반될 가능성이 있는지

2. **최신 대안 방법론** (2~3가지):
   - 최근 학술 문헌에서 이 한계를 보완하기 위해 사용되는 새로운 방법론
   - 각 대안이 기존 한계를 어떻게 해결하는지 1~2문장
   - 대표 논문 또는 제안자 (예: "Callaway & Sant'Anna, 2021")

3. **구현 패키지 안내**:
   - 각 대안 방법론을 구현할 수 있는 Python 패키지명과 R 패키지명
   - 핵심 함수/명령어 1~2개 (예: \`did.att_gt()\`, \`synthdid::synthdid_estimate()\`)

이 Step 6는 학생이 "논문이 이렇게 분석했지만, 최근에는 이런 방법도 있다"는 시야를 갖도록 하기 위함입니다.`;

  return await callGemini(apiKey, prompt, API.tokens.interpretation);
}
