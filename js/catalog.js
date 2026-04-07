/**
 * catalog.js — 방법론 카탈로그 (경로 B: 방법론 학습)
 * ResearchMethodAgent v6.0
 *
 * 12개 방법론 카테고리 정의 + 메타데이터
 * steps.js 카테고리와 1:1 대응
 */

/**
 * @typedef {Object} MethodologyItem
 * @property {string} id - 카테고리 ID (steps.js와 동일)
 * @property {string} icon - 이모지 아이콘
 * @property {string} title - 한글 제목
 * @property {string} subtitle - 영문 부제목
 * @property {string} description - 간단 설명
 * @property {string} group - 상위 그룹 (basic, causal, advanced, special)
 * @property {string[]} keywords - 검색 키워드
 * @property {string[]} sampleVariables - 예시 변수 목록
 * @property {string} difficulty - 난이도 (beginner, intermediate, advanced)
 */

/** @type {MethodologyItem[]} */
export const METHODOLOGY_CATALOG = [
  // ── 기초 통계 ──
  {
    id: 'regression',
    icon: '📈',
    title: '회귀분석',
    subtitle: 'Regression Analysis',
    description: 'OLS, 로지스틱, 위계적 회귀를 통한 변수 간 관계 분석',
    group: 'basic',
    keywords: ['회귀', 'OLS', '로지스틱', '위계적', 'regression', 'logistic'],
    sampleVariables: ['ROA', 'firm_size', 'leverage', 'R&D_intensity', 'firm_age'],
    difficulty: 'beginner',
  },
  {
    id: 'experimental',
    icon: '🧪',
    title: '실험설계',
    subtitle: 'Experimental Design',
    description: 'ANOVA, t-test를 활용한 집단 간 차이 검정',
    group: 'basic',
    keywords: ['실험', 'ANOVA', 't-test', '분산분석', 'experimental'],
    sampleVariables: ['group', 'score', 'pre_test', 'post_test', 'treatment'],
    difficulty: 'beginner',
  },
  {
    id: 'sem',
    icon: '🔗',
    title: '구조방정식',
    subtitle: 'Structural Equation Modeling',
    description: 'SEM, CFA를 통한 잠재변수 간 구조적 관계 분석',
    group: 'basic',
    keywords: ['구조방정식', 'SEM', 'CFA', '잠재변수', '요인분석'],
    sampleVariables: ['satisfaction', 'loyalty', 'quality', 'trust', 'commitment'],
    difficulty: 'intermediate',
  },
  {
    id: 'survey',
    icon: '📝',
    title: '설문분석',
    subtitle: 'Survey Analysis',
    description: '리커트 척도, 신뢰도, 타당도 분석',
    group: 'basic',
    keywords: ['설문', '리커트', '신뢰도', '타당도', 'Cronbach', 'survey'],
    sampleVariables: ['q1', 'q2', 'q3', 'q4', 'q5', 'age', 'gender'],
    difficulty: 'beginner',
  },

  // ── 인과추론 ──
  {
    id: 'causal_inference',
    icon: '⚖️',
    title: '인과추론',
    subtitle: 'Causal Inference',
    description: 'PSM, DID, IV, RDD를 활용한 인과관계 추정',
    group: 'causal',
    keywords: ['인과', 'PSM', 'DID', 'IV', 'RDD', '도구변수', '이중차분'],
    sampleVariables: ['outcome', 'treatment', 'post', 'entity_id', 'year', 'control1'],
    difficulty: 'advanced',
  },
  {
    id: 'causal_ml',
    icon: '🤖',
    title: '인과 ML',
    subtitle: 'Causal Machine Learning',
    description: 'DML, Causal Forest를 활용한 이질적 처리효과 추정',
    group: 'causal',
    keywords: ['DML', 'Causal Forest', 'CATE', '이질적 처리효과'],
    sampleVariables: ['outcome', 'treatment', 'X1', 'X2', 'X3', 'X4'],
    difficulty: 'advanced',
  },
  {
    id: 'bayesian',
    icon: '🎲',
    title: '베이지안',
    subtitle: 'Bayesian Analysis',
    description: 'MCMC, 사전/사후 분포를 활용한 확률적 추론',
    group: 'causal',
    keywords: ['베이지안', 'MCMC', '사전분포', '사후분포', 'Bayesian'],
    sampleVariables: ['y', 'x1', 'x2', 'x3', 'prior_mean'],
    difficulty: 'advanced',
  },

  // ── 고급 분석 ──
  {
    id: 'time_series',
    icon: '📊',
    title: '시계열분석',
    subtitle: 'Time Series Analysis',
    description: 'ARIMA, VAR 모형을 활용한 시간 의존적 데이터 분석',
    group: 'advanced',
    keywords: ['시계열', 'ARIMA', 'VAR', '정상성', 'ADF', 'time series'],
    sampleVariables: ['date', 'value', 'gdp', 'interest_rate', 'inflation'],
    difficulty: 'intermediate',
  },
  {
    id: 'spatial',
    icon: '🗺️',
    title: '공간분석',
    subtitle: 'Spatial Analysis',
    description: 'SAR, GWR을 활용한 공간적 의존성 분석',
    group: 'advanced',
    keywords: ['공간', 'SAR', 'GWR', '공간자기상관', 'spatial'],
    sampleVariables: ['region', 'lat', 'lon', 'value', 'population', 'income'],
    difficulty: 'advanced',
  },
  {
    id: 'survival',
    icon: '⏱️',
    title: '생존분석',
    subtitle: 'Survival Analysis',
    description: 'Cox 회귀, Kaplan-Meier 생존곡선 분석',
    group: 'advanced',
    keywords: ['생존', 'Cox', 'Kaplan-Meier', '해저드', 'survival'],
    sampleVariables: ['time', 'event', 'age', 'treatment', 'stage'],
    difficulty: 'intermediate',
  },

  // ── 특수 분석 ──
  {
    id: 'machine_learning',
    icon: '🧠',
    title: '머신러닝',
    subtitle: 'Machine Learning',
    description: 'Random Forest, XGBoost, 딥러닝 기반 예측 모델링',
    group: 'special',
    keywords: ['머신러닝', 'RF', 'XGBoost', '딥러닝', 'ML', 'machine learning'],
    sampleVariables: ['target', 'feature1', 'feature2', 'feature3', 'feature4'],
    difficulty: 'intermediate',
  },
  {
    id: 'unstructured_data',
    icon: '💬',
    title: '텍스트분석',
    subtitle: 'Text & NLP Analysis',
    description: 'NLP, 감성분석, 토픽모델링, 워드클라우드',
    group: 'special',
    keywords: ['텍스트', 'NLP', '감성', '토픽', '워드클라우드', 'SNS'],
    sampleVariables: ['text', 'label', 'date', 'source', 'sentiment'],
    difficulty: 'intermediate',
  },
];

/** 그룹 메타데이터 */
export const METHODOLOGY_GROUPS = {
  basic:    { label: '기초 통계', icon: '📐' },
  causal:   { label: '인과추론',  icon: '⚖️' },
  advanced: { label: '고급 분석', icon: '📊' },
  special:  { label: '특수 분석', icon: '🔬' },
};

/**
 * 카탈로그에서 ID로 방법론 찾기
 * @param {string} id
 * @returns {MethodologyItem|undefined}
 */
export function getCatalogItem(id) {
  return METHODOLOGY_CATALOG.find(m => m.id === id);
}

/**
 * 그룹별로 분류된 카탈로그 반환
 * @returns {Object<string, MethodologyItem[]>}
 */
export function getCatalogByGroup() {
  const grouped = {};
  for (const item of METHODOLOGY_CATALOG) {
    if (!grouped[item.group]) grouped[item.group] = [];
    grouped[item.group].push(item);
  }
  return grouped;
}

/**
 * 키워드 검색
 * @param {string} query
 * @returns {MethodologyItem[]}
 */
export function searchCatalog(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [...METHODOLOGY_CATALOG];
  return METHODOLOGY_CATALOG.filter(item =>
    item.title.includes(q) ||
    item.subtitle.toLowerCase().includes(q) ||
    item.description.includes(q) ||
    item.keywords.some(k => k.toLowerCase().includes(q))
  );
}
