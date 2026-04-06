/**
 * steps.js — 카테고리별 분석 Step 정의 (3-Group Structure)
 * ResearchMethodAgent v5.0
 *
 * 각 분석 카테고리에 대해 3개 그룹(descriptive/inferential/visualization)으로
 * 구조화된 분석 항목을 반환합니다.
 *
 * 반환 형식:
 * {
 *   descriptive:   { label: '기술통계',  items: [...] },
 *   inferential:   { label: '추론통계',  items: [...] },
 *   visualization: { label: '시각화',    items: [...] }
 * }
 */

// ─── Auto-detect templates ───────────────────────────────────────

function getAutoDetectBase(outcome, treatment) {
  return `
# === 변수 자동감지 ===
numeric_df = df.select_dtypes(include='number')
_skip = ['id', 'ID', 'entity_id', 'Unnamed: 0', 'year', 'time']
num_cols = [c for c in numeric_df.columns if c not in _skip]

outcome = '${outcome}' if '${outcome}' in df.columns else (num_cols[0] if len(num_cols) > 0 else None)
treatment = '${treatment}' if '${treatment}' in df.columns else (num_cols[1] if len(num_cols) > 1 else None)
remaining = [c for c in num_cols if c != outcome and c != treatment]

if outcome: print(f"종속변수(Y): {outcome}")
if treatment: print(f"독립변수(X): {treatment}")`;
}

function getAutoDetectMediation(outcome, treatment, mediator) {
  return `
# === 변수 자동감지 ===
numeric_df = df.select_dtypes(include='number')
num_cols = [c for c in numeric_df.columns if c not in ['id', 'ID', 'entity_id', 'Unnamed: 0']]

# 종속변수(Y)
outcome = '${outcome}' if '${outcome}' in df.columns else (num_cols[0] if len(num_cols) > 0 else None)
# 독립변수(X)
treatment = '${treatment}' if '${treatment}' in df.columns else (num_cols[1] if len(num_cols) > 1 else None)
# 매개변수(M): 지정된 이름이 없으면 X, Y를 제외한 첫 번째 수치 컬럼
remaining = [c for c in num_cols if c != outcome and c != treatment]
mediator = '${mediator}' if '${mediator}' in df.columns else (remaining[0] if len(remaining) > 0 else None)

if not outcome or not treatment or not mediator:
    print("ERROR: 분석에 필요한 변수(X, M, Y)를 찾을 수 없습니다.")
    print(f"  사용 가능 컬럼: {list(df.columns)}")
else:
    print(f"독립변수(X): {treatment}")
    print(f"매개변수(M): {mediator}")
    print(f"종속변수(Y): {outcome}")`;
}

function getAutoDetectModeration(outcome, treatment, moderator) {
  return `
# === 변수 자동감지 ===
numeric_df = df.select_dtypes(include='number')
num_cols = [c for c in numeric_df.columns if c not in ['id', 'ID', 'entity_id', 'Unnamed: 0']]

outcome = '${outcome}' if '${outcome}' in df.columns else (num_cols[0] if len(num_cols) > 0 else None)
treatment = '${treatment}' if '${treatment}' in df.columns else (num_cols[1] if len(num_cols) > 1 else None)
remaining = [c for c in num_cols if c != outcome and c != treatment]
moderator = '${moderator}' if '${moderator}' in df.columns else (remaining[0] if len(remaining) > 0 else None)

if not outcome or not treatment or not moderator:
    print("ERROR: 분석에 필요한 변수(X, W, Y)를 찾을 수 없습니다.")
    print(f"  사용 가능 컬럼: {list(df.columns)}")
else:
    print(f"독립변수(X): {treatment}")
    print(f"조절변수(W): {moderator}")
    print(f"종속변수(Y): {outcome}")`;
}

function getAutoDetectModMed(outcome, treatment, mediator, moderator) {
  return `
# === 변수 자동감지 ===
numeric_df = df.select_dtypes(include='number')
num_cols = [c for c in numeric_df.columns if c not in ['id', 'ID', 'entity_id', 'Unnamed: 0']]

outcome = '${outcome}' if '${outcome}' in df.columns else (num_cols[0] if len(num_cols) > 0 else None)
treatment = '${treatment}' if '${treatment}' in df.columns else (num_cols[1] if len(num_cols) > 1 else None)
remaining = [c for c in num_cols if c != outcome and c != treatment]
mediator = '${mediator}' if '${mediator}' in df.columns else (remaining[0] if len(remaining) > 0 else None)
remaining2 = [c for c in remaining if c != mediator]
moderator = '${moderator}' if '${moderator}' in df.columns else (remaining2[0] if len(remaining2) > 0 else None)

if not all([outcome, treatment, mediator, moderator]):
    print("ERROR: 분석에 필요한 변수(X, M, W, Y)를 찾을 수 없습니다.")
    print(f"  사용 가능 컬럼: {list(df.columns)}")
else:
    print(f"독립변수(X): {treatment}")
    print(f"매개변수(M): {mediator}")
    print(f"조절변수(W): {moderator}")
    print(f"종속변수(Y): {outcome}")`;
}

function getAutoDetectHierarchical(outcome, treatment) {
  return `
# === 변수 자동감지 ===
numeric_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_cols = [c for c in numeric_df.columns if c not in id_cols]

outcome = '${outcome}' if '${outcome}' in df.columns else (num_cols[0] if len(num_cols) > 0 else None)
treatment = '${treatment}' if '${treatment}' in df.columns else (num_cols[1] if len(num_cols) > 1 else None)

if not outcome or not treatment:
    print("ERROR: 분석에 필요한 변수(X, Y)를 찾을 수 없습니다.")
    print(f"  사용 가능 컬럼: {list(df.columns)}")
else:
    print(f"독립변수(X): {treatment}")
    print(f"종속변수(Y): {outcome}")`;
}

// ─── Common descriptive items ────────────────────────────────────

function getCommonDescriptiveItems(outcome, treatment) {
  return [
    {
      id: 'basic_stats',
      label: '기술통계 확인',
      checked: false,
      description: '데이터의 기본 특성(평균, 표준편차, 분포)을 확인합니다.',
      code: `import pandas as pd
import numpy as np

# 데이터 로드
df = pd.read_csv('mock_data.csv')

# 수치형 변수만 선택하여 기술통계 (식별자 제외)
id_cols = ['entity_id', 'year', 'time', 'id', 'ID']
numeric_df = df.select_dtypes(include='number').drop(columns=[c for c in id_cols if c in df.columns], errors='ignore')
print("=== 기술통계 (수치형 변수) ===")
print(numeric_df.describe().round(3))

# 범주형 변수 분포 확인
cat_cols = df.select_dtypes(exclude='number').columns.tolist()
if cat_cols:
    print("\\n=== 범주형 변수 분포 ===")
    for col in cat_cols:
        print(f"\\n[{col}]")
        print(df[col].value_counts())

# 변수별 결측치 확인
print("\\n=== 결측치 ===")
print(df.isnull().sum())`,
      refLinks: [
        { label: 'Pandas Describe', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.08-aggregation-and-grouping.html' }
      ]
    },
    {
      id: 'correlation',
      label: '상관행렬 (유의성 포함)',
      checked: false,
      description: '수치형 변수 간 상관계수와 유의성을 확인합니다.',
      code: `import pandas as pd
import numpy as np
from scipy import stats as sp_stats

df = pd.read_csv('mock_data.csv')

id_cols = ['entity_id', 'year', 'time', 'id', 'ID']
numeric_df = df.select_dtypes(include='number').drop(columns=[c for c in id_cols if c in df.columns], errors='ignore')

if len(numeric_df.columns) > 1:
    corr = numeric_df.corr()
    n = len(numeric_df)
    cols = numeric_df.columns
    print("=== 상관행렬 (유의성: * p<.05, ** p<.01, *** p<.001) ===")
    result_lines = [' ' * 25 + '  '.join(f'{c:>12}' for c in cols)]
    for i, r in enumerate(cols):
        row_vals = []
        for j, c in enumerate(cols):
            r_val = corr.iloc[i, j]
            if i == j:
                row_vals.append(f'{"—":>12}')
            else:
                t_stat = r_val * np.sqrt((n-2) / (1-r_val**2)) if abs(r_val) < 1 else 0
                p_val = 2 * (1 - sp_stats.t.cdf(abs(t_stat), n-2)) if abs(r_val) < 1 else 0
                sig = '***' if p_val < .001 else '**' if p_val < .01 else '*' if p_val < .05 else ''
                row_vals.append(f'{r_val:>9.3f}{sig:<3}')
        print(f'{r:<25}' + '  '.join(row_vals))
else:
    print("상관행렬 계산에 2개 이상의 수치형 변수가 필요합니다.")`,
      refLinks: [
        { label: 'Correlation Analysis', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.02-introducing-scikit-learn.html' }
      ]
    }
  ];
}

// ─── Main export ─────────────────────────────────────────────────

/**
 * 분석 카테고리별 3-Group Step 목록 반환
 * @param {string} category - 분석 카테고리
 * @param {Object} methodMeta - Agent 1의 detected_method
 * @param {Object} paperContext - Agent 1의 paper_context
 * @returns {{ descriptive: { label: string, items: Array }, inferential: { label: string, items: Array }, visualization: { label: string, items: Array } }}
 */
export function getStepsForCategory(category, methodMeta, paperContext) {
  const keyVars = methodMeta?.key_variables || {};
  const outcome = keyVars.outcome || 'y';
  const treatment = keyVars.treatment || 'x';
  const analysisDesign = methodMeta?.analysis_design || {};
  const framework = analysisDesign.framework || 'none';

  // Design-specific (mediation/moderation/etc) - when framework !== 'none' and category === 'regression'
  if (framework !== 'none' && category === 'regression') {
    const mediator = analysisDesign.mediator || 'mediator_var';
    const moderator = analysisDesign.moderator || 'moderator_var';
    const covariates = (analysisDesign.covariates || []).join("', '");

    switch (framework) {
      case 'mediation':
      case 'PROCESS':
        if (analysisDesign.moderator && analysisDesign.mediator) {
          return getModeratedMediationMenu(outcome, treatment, mediator, moderator, covariates);
        }
        if (analysisDesign.moderator && !analysisDesign.mediator) {
          return getModerationMenu(outcome, treatment, moderator, covariates);
        }
        return getMediationMenu(outcome, treatment, mediator, covariates);

      case 'moderation':
        return getModerationMenu(outcome, treatment, moderator, covariates);

      case 'moderated_mediation':
        return getModeratedMediationMenu(outcome, treatment, mediator, moderator, covariates);

      case 'hierarchical_regression':
        return getHierarchicalRegressionMenu(outcome, treatment, covariates);

      case 'path_analysis':
        return getMediationMenu(outcome, treatment, mediator, covariates);

      default:
        break;
    }
  }

  // Category-specific
  return getCategoryMenu(category, outcome, treatment, keyVars, paperContext);
}

// ─── Category router ─────────────────────────────────────────────

function getCategoryMenu(category, outcome, treatment, keyVars, paperContext) {
  switch (category) {
    case 'regression':        return getRegressionMenu(outcome, treatment);
    case 'causal_inference':  return getCausalInferenceMenu(outcome, treatment);
    case 'spatial':           return getSpatialMenu(outcome, treatment);
    case 'time_series':       return getTimeSeriesMenu(outcome, treatment);
    case 'machine_learning':  return getMachineLearningMenu(outcome, treatment);
    case 'causal_ml':         return getCausalMlMenu(outcome, treatment);
    case 'bayesian':          return getBayesianMenu(outcome, treatment);
    case 'sem':               return getSemMenu(outcome, treatment);
    case 'survival':          return getSurvivalMenu(outcome, treatment);
    case 'meta_analysis':     return getMetaAnalysisMenu(outcome, treatment);
    case 'unstructured_data': return getUnstructuredDataMenu(outcome, treatment);
    case 'experimental':      return getExperimentalMenu(outcome, treatment);
    default:                  return getDefaultMenu(outcome, treatment);
  }
}

// ─── Regression ──────────────────────────────────────────────────

function getRegressionMenu(outcome, treatment) {
  const autoDetectBase = getAutoDetectBase(outcome, treatment);

  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '데이터 전처리',
          checked: false,
          description: '결측치 처리, 변수 변환, 더미 변수 생성 등 분석 준비를 합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv')
df = df.dropna()
${autoDetectBase}

print(f"\\n전처리 후 데이터: {df.shape[0]}행 × {df.shape[1]}열")
print(df.head())`,
          refLinks: [
            { label: 'Data Manipulation', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.00-introduction-to-pandas.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'baseline',
          label: '기본 모형 추정 (OLS)',
          checked: false,
          description: '최소자승법(OLS)으로 기본 회귀 모형을 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectBase}

# 범주형 변수 자동 처리
if df[treatment].dtype == 'object' or str(df[treatment].dtype) == 'category':
    X1 = pd.get_dummies(df[[treatment]], drop_first=True, dtype=float)
    print(f"\\n[INFO] '{treatment}'은(는) 범주형 → 더미 인코딩 ({X1.shape[1]}개 변수)")
else:
    X1 = df[[treatment]].astype(float)

X1 = sm.add_constant(X1)
model1 = sm.OLS(df[outcome].astype(float), X1).fit(cov_type='HC1')
print("\\n=== Model 1: 기본 모형 ===")
print(model1.summary())`,
          refLinks: [
            { label: 'Linear Regression', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'full_model',
          label: '확장 모형 추정 (통제변수 포함)',
          checked: false,
          description: '통제변수를 추가하여 핵심 효과의 강건성을 확인합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectBase}

# 범주형 변수 자동 처리
control_cols = [c for c in remaining][:5]
all_x_cols = [treatment] + control_cols
X2_parts = []
for col in all_x_cols:
    if df[col].dtype == 'object' or str(df[col].dtype) == 'category':
        dummies = pd.get_dummies(df[[col]], drop_first=True, dtype=float)
        X2_parts.append(dummies)
        print(f"[INFO] '{col}' 범주형 → 더미 인코딩 ({dummies.shape[1]}개)")
    else:
        X2_parts.append(df[[col]].astype(float))
X2 = sm.add_constant(pd.concat(X2_parts, axis=1))
model2 = sm.OLS(df[outcome].astype(float), X2).fit(cov_type='HC1')
print("\\n=== Model 2: 통제변수 포함 ===")
print(model2.summary())`,
          refLinks: [
            { label: 'Multiple Regression', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: '계수 Forest Plot',
          checked: false,
          description: '계수 forest plot과 잔차 진단 그래프를 생성합니다.',
          code: `import matplotlib.pyplot as plt
import numpy as np
import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectBase}

numeric_df = df.select_dtypes(include='number').drop(columns=[c for c in _skip if c in df.columns], errors='ignore')
# 범주형 변수 더미 인코딩 추가
cat_df = df.select_dtypes(include=['object', 'category'])
if not cat_df.empty:
    cat_dummies = pd.get_dummies(cat_df, drop_first=True, dtype=float)
    all_X = pd.concat([numeric_df.drop(columns=[outcome], errors='ignore'), cat_dummies], axis=1)
else:
    all_X = numeric_df.drop(columns=[outcome], errors='ignore')
X = sm.add_constant(all_X)
model = sm.OLS(df[outcome].astype(float), X).fit(cov_type='HC1')

# 계수 Forest Plot
fig, ax = plt.subplots(figsize=(8, 5))
coefs = model.params[1:]
ci = model.conf_int().iloc[1:]
ax.errorbar(coefs, range(len(coefs)), xerr=[coefs-ci[0], ci[1]-coefs], fmt='o', capsize=3)
ax.set_yticks(range(len(coefs)))
ax.set_yticklabels(coefs.index)
ax.axvline(x=0, color='red', linestyle='--', alpha=0.5)
ax.set_xlabel('계수 추정치')
ax.set_title('회귀 계수 Forest Plot')
plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Matplotlib Basics', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}

// ─── Causal Inference ────────────────────────────────────────────

function getCausalInferenceMenu(outcome, treatment) {
  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '데이터 전처리',
          checked: false,
          description: '데이터 구조 확인, 변수 분포, 결측치를 점검합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv')

# === 데이터 구조 확인 ===
id_cols = ['entity_id', 'year', 'time', 'id', 'ID']
has_panel = 'entity_id' in df.columns and 'year' in df.columns

if has_panel:
    print(f"개체 수: {df['entity_id'].nunique()}")
    print(f"시간 범위: {df['year'].min()} ~ {df['year'].max()}")
print(f"총 관측치: {len(df)}")
print(f"컬럼: {list(df.columns)}")

# 수치형 변수만 기술통계 (식별자 제외)
numeric_df = df.select_dtypes(include='number').drop(columns=[c for c in id_cols if c in df.columns], errors='ignore')
print("\\n=== 수치형 변수 기술통계 ===")
print(numeric_df.describe().round(3))

# 변수명 안내 (코드에서 사용할 컬럼명)
print("\\n=== 분석 변수 ===")
target_y = '${outcome}'
target_x = '${treatment}'
if target_y in df.columns:
    print(f"종속변수(Y): {target_y}")
else:
    candidates = [c for c in numeric_df.columns]
    print(f"\\u26a0\\ufe0f '{target_y}' 컬럼 없음. 사용 가능: {candidates}")
if target_x in df.columns:
    print(f"독립변수(X): {target_x}")
else:
    candidates = [c for c in numeric_df.columns]
    print(f"\\u26a0\\ufe0f '{target_x}' 컬럼 없음. 사용 가능: {candidates}")

# 연도별 종속변수 평균
if has_panel and target_y in df.columns:
    print(f"\\n=== 연도별 {target_y} 평균 ===")
    print(df.groupby('year')[target_y].mean().round(3))`,
          refLinks: [
            { label: 'Panel Data', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.08-aggregation-and-grouping.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'baseline_fe',
          label: '기본 모형',
          checked: false,
          description: '핵심 독립변수와 종속변수의 관계를 추정합니다.',
          code: `import pandas as pd
import numpy as np
import statsmodels.api as sm

df = pd.read_csv('mock_data.csv')

# --- 변수 자동 감지 ---
id_cols = ['entity_id', 'year', 'time', 'id', 'ID']
numeric_df = df.select_dtypes(include='number')
analysis_cols = [c for c in numeric_df.columns if c not in id_cols]

target_y = '${outcome}' if '${outcome}' in df.columns else (analysis_cols[0] if analysis_cols else None)
target_x = '${treatment}' if '${treatment}' in df.columns else (analysis_cols[1] if len(analysis_cols) > 1 else None)

if not target_y or not target_x:
    print(f"\\u26a0\\ufe0f 분석 변수를 찾을 수 없습니다. 사용 가능 컬럼: {analysis_cols}")
else:
    print(f"종속변수: {target_y}, 독립변수: {target_x}")
    y = pd.to_numeric(df[target_y], errors='coerce').dropna()
    x = pd.to_numeric(df[target_x], errors='coerce')
    valid = y.index.intersection(x.dropna().index)
    y, x = y.loc[valid], x.loc[valid]

    has_panel = 'entity_id' in df.columns and 'year' in df.columns

    if has_panel:
        # Within 변환 (개체 평균 제거) — 더미변수 없이 FE 추정
        panel = df.loc[valid].copy()
        panel['_y'] = y.values
        panel['_x'] = x.values
        entity_means_y = panel.groupby('entity_id')['_y'].transform('mean')
        entity_means_x = panel.groupby('entity_id')['_x'].transform('mean')
        y_demean = panel['_y'] - entity_means_y
        x_demean = panel['_x'] - entity_means_x
        X = sm.add_constant(x_demean.astype(float))
        model1 = sm.OLS(y_demean.astype(float), X).fit(cov_type='HC1')
        print("=== Model 1: 고정효과 모형 (Within 변환) ===")
    else:
        X = sm.add_constant(x.astype(float))
        model1 = sm.OLS(y.astype(float), X).fit(cov_type='HC1')
        print("=== Model 1: OLS ===")

    print(model1.summary().tables[1])
    print(f"\\nR-squared: {model1.rsquared:.4f}")
    print(f"관측치: {len(y)}")`,
          refLinks: [
            { label: 'Fixed Effects', url: 'https://www.kaggle.com/learn/intro-to-machine-learning' }
          ]
        },
        {
          id: 'full_model_fe',
          label: '확장 모형 (통제변수 포함)',
          checked: false,
          description: '통제변수를 추가하여 핵심 효과의 강건성을 확인합니다.',
          code: `import pandas as pd
import numpy as np
import statsmodels.api as sm

df = pd.read_csv('mock_data.csv')

# --- 변수 자동 감지 ---
id_cols = ['entity_id', 'year', 'time', 'id', 'ID']
numeric_df = df.select_dtypes(include='number')
analysis_cols = [c for c in numeric_df.columns if c not in id_cols]

target_y = '${outcome}' if '${outcome}' in df.columns else (analysis_cols[0] if analysis_cols else None)
target_x = '${treatment}' if '${treatment}' in df.columns else (analysis_cols[1] if len(analysis_cols) > 1 else None)

if not target_y or not target_x:
    print(f"\\u26a0\\ufe0f 분석 변수를 찾을 수 없습니다. 사용 가능 컬럼: {analysis_cols}")
else:
    # 통제변수: 종속/독립 제외한 나머지 수치형
    control_cols = [c for c in analysis_cols if c not in [target_y, target_x]][:4]
    print(f"종속: {target_y}, 독립: {target_x}, 통제: {control_cols}")

    cols_to_use = [target_y, target_x] + control_cols
    sub = df[cols_to_use].apply(pd.to_numeric, errors='coerce').dropna()
    y = sub[target_y].astype(float)

    has_panel = 'entity_id' in df.columns and 'year' in df.columns

    if has_panel:
        panel = df.loc[sub.index].copy()
        for col in cols_to_use:
            panel[col] = sub[col].values
        for col in cols_to_use:
            panel[col] = panel[col] - panel.groupby('entity_id')[col].transform('mean')
        y = panel[target_y].astype(float)
        X = sm.add_constant(panel[[target_x] + control_cols].astype(float))
        model2 = sm.OLS(y, X).fit(cov_type='HC1')
        print("=== Model 2: FE + 통제변수 (Within 변환) ===")
    else:
        X = sm.add_constant(sub[[target_x] + control_cols].astype(float))
        model2 = sm.OLS(y, X).fit(cov_type='HC1')
        print("=== Model 2: OLS + 통제변수 ===")

    print(model2.summary().tables[1])
    print(f"\\nR-squared: {model2.rsquared:.4f}")
    print(f"관측치: {len(y)}")`,
          refLinks: [
            { label: 'Robust SE', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'robustness',
          label: '강건성 검정',
          checked: false,
          description: 'Pooled OLS 비교, 부트스트래핑 등을 수행합니다.',
          code: `import pandas as pd
import numpy as np
import statsmodels.api as sm

df = pd.read_csv('mock_data.csv')

# --- 변수 자동 감지 ---
id_cols = ['entity_id', 'year', 'time', 'id', 'ID']
numeric_df = df.select_dtypes(include='number')
analysis_cols = [c for c in numeric_df.columns if c not in id_cols]

target_y = '${outcome}' if '${outcome}' in df.columns else (analysis_cols[0] if analysis_cols else None)
target_x = '${treatment}' if '${treatment}' in df.columns else (analysis_cols[1] if len(analysis_cols) > 1 else None)

if not target_y or not target_x:
    print(f"\\u26a0\\ufe0f 분석 변수를 찾을 수 없습니다. 사용 가능 컬럼: {analysis_cols}")
else:
    sub = df[[target_y, target_x]].apply(pd.to_numeric, errors='coerce').dropna()
    y = sub[target_y].astype(float)
    x = sub[target_x].astype(float)

    # Pooled OLS
    X_pooled = sm.add_constant(x)
    pooled = sm.OLS(y, X_pooled).fit(cov_type='HC1')
    print("=== Pooled OLS (Robust SE) ===")
    print(f"계수({target_x}): {pooled.params.iloc[1]:.4f}")
    print(f"SE: {pooled.bse.iloc[1]:.4f}")
    print(f"p-value: {pooled.pvalues.iloc[1]:.4f}")
    print(f"R\\u00b2: {pooled.rsquared:.4f}")

    # 부트스트래핑 CI
    boot_coefs = []
    for _ in range(1000):
        idx = np.random.choice(len(sub), len(sub), replace=True)
        yb = y.iloc[idx]
        Xb = sm.add_constant(x.iloc[idx])
        try:
            boot_coefs.append(sm.OLS(yb, Xb).fit().params.iloc[1])
        except:
            pass
    if boot_coefs:
        ci = np.percentile(boot_coefs, [2.5, 97.5])
        print(f"\\n=== Bootstrap 95% CI (1000회) ===")
        print(f"계수 95% CI: [{ci[0]:.4f}, {ci[1]:.4f}]")

    has_panel = 'entity_id' in df.columns
    if has_panel:
        try:
            from statsmodels.regression.mixed_linear_model import MixedLM
            groups = df.loc[sub.index, 'entity_id']
            re_model = MixedLM(y, sm.add_constant(x), groups=groups)
            re_result = re_model.fit(reml=True)
            print(f"\\n=== Random Effects (MixedLM) ===")
            print(re_result.summary().tables[1])
        except Exception as e:
            print(f"\\nRandom Effects 추정 실패: {e}")`,
          refLinks: [
            { label: 'Bootstrap Methods', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.03-hyperparameters-and-model-validation.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: '추이 및 산점도',
          checked: false,
          description: '주요 변수의 추이와 분포를 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv')

# --- 변수 자동 감지 ---
id_cols = ['entity_id', 'year', 'time', 'id', 'ID']
numeric_df = df.select_dtypes(include='number')
analysis_cols = [c for c in numeric_df.columns if c not in id_cols]

target_y = '${outcome}' if '${outcome}' in df.columns else (analysis_cols[0] if analysis_cols else None)
target_x = '${treatment}' if '${treatment}' in df.columns else (analysis_cols[1] if len(analysis_cols) > 1 else None)
has_panel = 'year' in df.columns

if target_y and has_panel:
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    # 1. 연도별 추이
    yearly = df.groupby('year')[target_y].mean()
    axes[0].plot(yearly.index, yearly.values, 'o-', color='#185FA5', linewidth=2)
    axes[0].set_xlabel('연도')
    axes[0].set_ylabel(target_y)
    axes[0].set_title(f'연도별 {target_y} 평균 추이')

    # 2. 산점도 (독립 vs 종속)
    if target_x:
        x_data = pd.to_numeric(df[target_x], errors='coerce')
        y_data = pd.to_numeric(df[target_y], errors='coerce')
        valid = x_data.notna() & y_data.notna()
        axes[1].scatter(x_data[valid], y_data[valid], alpha=0.3, s=10, color='#D32F2F')
        axes[1].set_xlabel(target_x)
        axes[1].set_ylabel(target_y)
        axes[1].set_title(f'{target_x} vs {target_y}')

    plt.tight_layout()
    plt.show()
elif target_y and target_x:
    fig, ax = plt.subplots(figsize=(8, 5))
    x_data = pd.to_numeric(df[target_x], errors='coerce')
    y_data = pd.to_numeric(df[target_y], errors='coerce')
    valid = x_data.notna() & y_data.notna()
    ax.scatter(x_data[valid], y_data[valid], alpha=0.3, s=15, color='#185FA5')
    ax.set_xlabel(target_x)
    ax.set_ylabel(target_y)
    ax.set_title(f'{target_x} vs {target_y}')
    plt.tight_layout()
    plt.show()
else:
    print("시각화할 변수를 찾을 수 없습니다.")`,
          refLinks: [
            { label: 'Matplotlib', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}

// ─── Spatial ─────────────────────────────────────────────────────

function getSpatialMenu(outcome, treatment) {
  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '공간 데이터 전처리',
          checked: false,
          description: '공간 단위(지역/좌표) 확인, 공간 가중치 행렬 준비, 이상값 탐색을 수행합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv')

# 공간 단위 확인
print("=== 공간 단위 확인 ===")
print(f"관측치: {len(df)}")
print(f"고유 지역 수: {df.iloc[:,0].nunique()}")
print("\\n=== 변수별 기술통계 ===")
print(df.describe().round(3))

# 공간적 분포 확인
print("\\n=== 종속변수 분포 ===")
print(f"평균: {df['${outcome}'].mean():.3f}")
print(f"표준편차: {df['${outcome}'].std():.3f}")
print(f"왜도: {df['${outcome}'].skew():.3f}")`,
          refLinks: [
            { label: 'Spatial Data', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.00-introduction-to-pandas.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'ols_baseline',
          label: 'OLS 기준 모형 (공간효과 미포함)',
          checked: false,
          description: '공간효과를 고려하지 않은 OLS 모형을 추정하여 기준선을 설정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()

# OLS 기준 모형
X = sm.add_constant(df[['${treatment}']])
model_ols = sm.OLS(df['${outcome}'], X).fit(cov_type='HC1')
print("=== OLS 기준 모형 ===")
print(model_ols.summary())

# 잔차의 공간적 패턴 확인용
print("\\n=== 잔차 기술통계 ===")
resid = model_ols.resid
print(f"평균: {resid.mean():.6f}")
print(f"Durbin-Watson: {sm.stats.durbin_watson(resid):.3f}")`,
          refLinks: [
            { label: 'OLS Regression', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'spatial_model',
          label: '공간 회귀 모형 (SAR/SEM)',
          checked: false,
          description: '공간 자기상관을 고려한 SAR(Spatial Autoregressive) 또는 SEM(Spatial Error Model)을 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()

# 참고: 실제 공간 모형은 PySAL/spreg 필요
# 여기서는 지역 고정효과로 공간 이질성을 근사합니다
region_col = df.columns[0]  # 첫 번째 열을 지역 변수로 가정
df_dummies = pd.get_dummies(df, columns=[region_col], drop_first=True, dtype=int)

X = sm.add_constant(df_dummies.drop(columns=['${outcome}']))
model_fe = sm.OLS(df_dummies['${outcome}'], X).fit(cov_type='HC1')
print("=== 지역 고정효과 모형 ===")
print(f"R\\u00b2: {model_fe.rsquared:.4f}")
print(f"Adj R\\u00b2: {model_fe.rsquared_adj:.4f}")
print(f"${'${treatment}'} 계수: {model_fe.params['${treatment}']:.4f} (p={model_fe.pvalues['${treatment}']:.4f})")`,
          refLinks: [
            { label: 'Spatial Analysis', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: '공간 패턴 시각화',
          checked: false,
          description: '지역별 분포 히트맵, 잔차 패턴 등을 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv')

fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# 지역별 평균 비교
region_col = df.columns[0]
region_means = df.groupby(region_col)['${outcome}'].mean().sort_values()
axes[0].barh(range(min(len(region_means),20)), region_means.values[:20])
axes[0].set_yticks(range(min(len(region_means),20)))
axes[0].set_yticklabels(region_means.index[:20], fontsize=8)
axes[0].set_xlabel(f'평균 ${'${outcome}'}')
axes[0].set_title(f'지역별 ${'${outcome}'} 평균')

# 핵심 변수 산점도
axes[1].scatter(df['${treatment}'], df['${outcome}'], alpha=0.4, s=20)
z = np.polyfit(df['${treatment}'].dropna(), df['${outcome}'].dropna(), 1)
p = np.poly1d(z)
x_line = np.linspace(df['${treatment}'].min(), df['${treatment}'].max(), 100)
axes[1].plot(x_line, p(x_line), 'r--', alpha=0.8)
axes[1].set_xlabel('${treatment}')
axes[1].set_ylabel('${outcome}')
axes[1].set_title('핵심 변수 관계')

plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Visualization', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}

// ─── Time Series ─────────────────────────────────────────────────

function getTimeSeriesMenu(outcome, treatment) {
  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '시계열 데이터 전처리',
          checked: false,
          description: '시간 변수 파싱, 정상성(stationarity) 검정, 결측치 보간을 수행합니다.',
          code: `import pandas as pd
import numpy as np
from scipy import stats

df = pd.read_csv('mock_data.csv')

# 시계열 기본 정보
print("=== 시계열 정보 ===")
print(f"관측치 수: {len(df)}")
print(f"열: {list(df.columns)}")

# 종속변수 시계열 특성
y = df['${outcome}']
print(f"\\n=== ${'${outcome}'} 시계열 특성 ===")
print(f"평균: {y.mean():.3f}")
print(f"표준편차: {y.std():.3f}")
print(f"자기상관(lag 1): {y.autocorr(lag=1):.3f}")

# 추세 검정 (Mann-Kendall 근사)
n = len(y)
tau, p_val = stats.kendalltau(range(n), y)
print(f"추세 (Kendall tau): {tau:.3f} (p={p_val:.4f})")`,
          refLinks: [
            { label: 'Time Series', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.11-working-with-time-series.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'stationarity',
          label: '정상성 검정 (ADF / KPSS)',
          checked: false,
          description: '단위근 검정으로 시계열의 정상성 여부를 확인합니다.',
          code: `import pandas as pd
import numpy as np
from statsmodels.tsa.stattools import adfuller, kpss

df = pd.read_csv('mock_data.csv')
y = df['${outcome}'].dropna()

# ADF 검정 (H0: 단위근 존재 = 비정상)
adf_result = adfuller(y, autolag='AIC')
print("=== ADF 검정 ===")
print(f"ADF 통계량: {adf_result[0]:.4f}")
print(f"p-value: {adf_result[1]:.4f}")
print(f"결론: {'정상' if adf_result[1] < 0.05 else '비정상 (차분 필요)'}")

# 1차 차분 후 재검정
if adf_result[1] >= 0.05:
    y_diff = y.diff().dropna()
    adf_diff = adfuller(y_diff, autolag='AIC')
    print(f"\\n=== 1차 차분 후 ADF ===")
    print(f"ADF 통계량: {adf_diff[0]:.4f}")
    print(f"p-value: {adf_diff[1]:.4f}")
    print(f"결론: {'정상' if adf_diff[1] < 0.05 else '여전히 비정상'}")`,
          refLinks: [
            { label: 'Stationarity', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.11-working-with-time-series.html' }
          ]
        },
        {
          id: 'arima',
          label: 'ARIMA 모형 추정',
          checked: false,
          description: 'ARIMA(p,d,q) 모형을 추정하고 잔차 진단을 수행합니다.',
          code: `import pandas as pd
import numpy as np
from statsmodels.tsa.arima.model import ARIMA
import warnings
warnings.filterwarnings('ignore')

df = pd.read_csv('mock_data.csv')
y = df['${outcome}'].dropna().values

# ARIMA 모형 탐색 (간단한 그리드 서치)
best_aic = np.inf
best_order = (1,0,0)
for p in range(3):
    for d in range(2):
        for q in range(3):
            try:
                model = ARIMA(y, order=(p,d,q))
                result = model.fit()
                if result.aic < best_aic:
                    best_aic = result.aic
                    best_order = (p,d,q)
            except:
                continue

print(f"최적 ARIMA 차수: {best_order} (AIC: {best_aic:.2f})")

# 최적 모형 추정
model = ARIMA(y, order=best_order).fit()
print("\\n=== ARIMA 모형 요약 ===")
print(model.summary())`,
          refLinks: [
            { label: 'ARIMA', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.11-working-with-time-series.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: '시계열 시각화',
          checked: false,
          description: '원 시계열, 예측값, ACF/PACF를 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
from statsmodels.graphics.tsaplots import plot_acf, plot_pacf

df = pd.read_csv('mock_data.csv')
y = df['${outcome}'].dropna()

fig, axes = plt.subplots(2, 2, figsize=(12, 8))

# 원 시계열
axes[0,0].plot(y.values)
axes[0,0].set_title('원 시계열')
axes[0,0].set_xlabel('시점')

# 이동평균
window = min(12, len(y)//4)
axes[0,1].plot(y.values, alpha=0.5, label='원본')
axes[0,1].plot(y.rolling(window).mean().values, color='red', label=f'{window}기 이동평균')
axes[0,1].set_title('이동평균')
axes[0,1].legend()

# ACF
plot_acf(y, ax=axes[1,0], lags=min(20, len(y)//3))
axes[1,0].set_title('ACF')

# PACF
plot_pacf(y, ax=axes[1,1], lags=min(20, len(y)//3))
axes[1,1].set_title('PACF')

plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Time Series Viz', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}

// ─── Machine Learning ────────────────────────────────────────────

function getMachineLearningMenu(outcome, treatment) {
  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '데이터 전처리 및 분할',
          checked: false,
          description: '특성 스케일링, 결측치 처리, 학습/검증/테스트 세트 분할을 수행합니다.',
          code: `import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

df = pd.read_csv('mock_data.csv').dropna()

# 특성과 타깃 분리
X = df.drop(columns=['${outcome}'])
y = df['${outcome}']

# 수치형만 선택
X = X.select_dtypes(include=[np.number])

# 학습/테스트 분할 (80:20)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 스케일링
scaler = StandardScaler()
X_train_sc = scaler.fit_transform(X_train)
X_test_sc = scaler.transform(X_test)

print(f"학습 세트: {X_train.shape}")
print(f"테스트 세트: {X_test.shape}")
print(f"특성: {list(X.columns)}")
print(f"타깃 평균: {y.mean():.3f}")`,
          refLinks: [
            { label: 'Train/Test Split', url: 'https://scikit-learn.org/stable/modules/cross_validation.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'model_training',
          label: '모형 학습 (Random Forest / Gradient Boosting)',
          checked: false,
          description: 'Random Forest와 Gradient Boosting 모형을 학습하고 성능을 비교합니다.',
          code: `import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, r2_score

df = pd.read_csv('mock_data.csv').dropna()
X = df.drop(columns=['${outcome}']).select_dtypes(include=[np.number])
y = df['${outcome}']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Random Forest
rf = RandomForestRegressor(n_estimators=100, random_state=42, max_depth=5)
rf.fit(X_train, y_train)
rf_pred = rf.predict(X_test)
print("=== Random Forest ===")
print(f"R\\u00b2: {r2_score(y_test, rf_pred):.4f}")
print(f"RMSE: {np.sqrt(mean_squared_error(y_test, rf_pred)):.4f}")

# Gradient Boosting
gb = GradientBoostingRegressor(n_estimators=100, random_state=42, max_depth=3)
gb.fit(X_train, y_train)
gb_pred = gb.predict(X_test)
print("\\n=== Gradient Boosting ===")
print(f"R\\u00b2: {r2_score(y_test, gb_pred):.4f}")
print(f"RMSE: {np.sqrt(mean_squared_error(y_test, gb_pred)):.4f}")`,
          refLinks: [
            { label: 'Random Forests', url: 'https://scikit-learn.org/stable/modules/ensemble.html' },
            { label: 'Kaggle ML', url: 'https://www.kaggle.com/learn/intro-to-machine-learning' }
          ]
        },
        {
          id: 'feature_importance',
          label: '특성 중요도 분석',
          checked: false,
          description: '모형의 특성 중요도를 분석하여 핵심 예측 변수를 식별합니다.',
          code: `import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split

df = pd.read_csv('mock_data.csv').dropna()
X = df.drop(columns=['${outcome}']).select_dtypes(include=[np.number])
y = df['${outcome}']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

rf = RandomForestRegressor(n_estimators=100, random_state=42, max_depth=5)
rf.fit(X_train, y_train)

# 특성 중요도
imp = pd.Series(rf.feature_importances_, index=X.columns).sort_values(ascending=False)
print("=== 특성 중요도 (Impurity-based) ===")
for feat, val in imp.items():
    bar = '\\u2588' * int(val * 50)
    print(f"  {feat:20s}: {val:.4f} {bar}")`,
          refLinks: [
            { label: 'Feature Importance', url: 'https://scikit-learn.org/stable/modules/ensemble.html#feature-importance-evaluation' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: '모형 성능 시각화',
          checked: false,
          description: '예측 vs 실측, 잔차 분포, 특성 중요도 차트를 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score

df = pd.read_csv('mock_data.csv').dropna()
X = df.drop(columns=['${outcome}']).select_dtypes(include=[np.number])
y = df['${outcome}']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

rf = RandomForestRegressor(n_estimators=100, random_state=42, max_depth=5)
rf.fit(X_train, y_train)
pred = rf.predict(X_test)

fig, axes = plt.subplots(1, 3, figsize=(15, 4))

# 예측 vs 실측
axes[0].scatter(y_test, pred, alpha=0.5, s=20)
axes[0].plot([y_test.min(), y_test.max()], [y_test.min(), y_test.max()], 'r--')
axes[0].set_xlabel('실측'); axes[0].set_ylabel('예측')
axes[0].set_title(f'예측 vs 실측 (R\\u00b2={r2_score(y_test,pred):.3f})')

# 잔차 분포
residuals = y_test - pred
axes[1].hist(residuals, bins=20, edgecolor='black', alpha=0.7)
axes[1].set_xlabel('잔차'); axes[1].set_title('잔차 분포')

# 특성 중요도
imp = pd.Series(rf.feature_importances_, index=X.columns).sort_values()
axes[2].barh(imp.index, imp.values)
axes[2].set_xlabel('중요도'); axes[2].set_title('특성 중요도')

plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Model Evaluation', url: 'https://scikit-learn.org/stable/modules/model_evaluation.html' }
          ]
        }
      ]
    }
  };
}

// ─── Causal ML ───────────────────────────────────────────────────

function getCausalMlMenu(outcome, treatment) {
  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '인과 ML 데이터 전처리',
          checked: false,
          description: '처리군/통제군 확인, 공변량 균형, 성향점수 추정 준비를 합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()

# 처리 변수 분포
treat_col = '${treatment}'
print("=== 처리 변수 분포 ===")
print(df[treat_col].value_counts())
print(f"처리율: {df[treat_col].mean():.2%}")

# 공변량 균형 확인
covariates = [c for c in df.select_dtypes(include=[np.number]).columns if c not in ['${outcome}', treat_col]]
print("\\n=== 공변량 균형 (표준화 평균차) ===")
for c in covariates[:8]:
    t_mean = df[df[treat_col]==1][c].mean()
    c_mean = df[df[treat_col]==0][c].mean()
    pooled_sd = df[c].std()
    smd = (t_mean - c_mean) / pooled_sd if pooled_sd > 0 else 0
    balance = '\\u2705' if abs(smd) < 0.1 else '\\u26a0\\ufe0f'
    print(f"  {c:20s}: SMD = {smd:+.3f} {balance}")`,
          refLinks: [
            { label: 'Causal Inference', url: 'https://www.kaggle.com/learn/intro-to-machine-learning' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'propensity_score',
          label: '성향점수 추정 (Propensity Score)',
          checked: false,
          description: '로지스틱 회귀로 성향점수를 추정하고 매칭/가중 준비를 합니다.',
          code: `import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression

df = pd.read_csv('mock_data.csv').dropna()
treat_col = '${treatment}'
outcome_col = '${outcome}'

covariates = [c for c in df.select_dtypes(include=[np.number]).columns if c not in [outcome_col, treat_col]]
X = df[covariates]
T = df[treat_col]

# 성향점수 추정
ps_model = LogisticRegression(max_iter=1000, random_state=42)
ps_model.fit(X, T)
df['ps'] = ps_model.predict_proba(X)[:,1]

print("=== 성향점수 분포 ===")
print(f"처리군 PS 평균: {df[df[treat_col]==1]['ps'].mean():.3f}")
print(f"통제군 PS 평균: {df[df[treat_col]==0]['ps'].mean():.3f}")
print(f"겹침 범위: [{df['ps'].min():.3f}, {df['ps'].max():.3f}]")

# IPW (역확률 가중) 추정
df['ipw'] = np.where(T==1, 1/df['ps'], 1/(1-df['ps']))
att = np.average(df[T==1][outcome_col], weights=df[T==1]['ipw']) - np.average(df[T==0][outcome_col], weights=df[T==0]['ipw'])
print(f"\\nIPW 추정 ATE: {att:.4f}")`,
          refLinks: [
            { label: 'Propensity Score', url: 'https://scikit-learn.org/stable/modules/linear_model.html#logistic-regression' }
          ]
        },
        {
          id: 'causal_forest',
          label: '이질적 처리효과 (CATE) 추정',
          checked: false,
          description: '처리효과의 이질성을 분석합니다. (Causal Forest 개념 기반)',
          code: `import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor

df = pd.read_csv('mock_data.csv').dropna()
treat_col = '${treatment}'
outcome_col = '${outcome}'
covariates = [c for c in df.select_dtypes(include=[np.number]).columns if c not in [outcome_col, treat_col]]

# T-Learner (간단한 이질적 효과 추정)
treated = df[df[treat_col] == 1]
control = df[df[treat_col] == 0]

# 처리군/통제군 각각 모형 학습
rf_t = RandomForestRegressor(n_estimators=100, random_state=42, max_depth=5)
rf_c = RandomForestRegressor(n_estimators=100, random_state=42, max_depth=5)
rf_t.fit(treated[covariates], treated[outcome_col])
rf_c.fit(control[covariates], control[outcome_col])

# CATE 추정
df['cate'] = rf_t.predict(df[covariates]) - rf_c.predict(df[covariates])
print("=== CATE (이질적 처리효과) 분포 ===")
print(f"평균 CATE: {df['cate'].mean():.4f}")
print(f"표준편차: {df['cate'].std():.4f}")
print(f"범위: [{df['cate'].min():.4f}, {df['cate'].max():.4f}]")

# 하위집단별 CATE
for c in covariates[:3]:
    median = df[c].median()
    low = df[df[c] <= median]['cate'].mean()
    high = df[df[c] > median]['cate'].mean()
    print(f"\\n{c}: Low={low:.4f}, High={high:.4f}, Diff={high-low:.4f}")`,
          refLinks: [
            { label: 'CATE', url: 'https://scikit-learn.org/stable/modules/ensemble.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: '인과 추론 시각화',
          checked: false,
          description: '성향점수 분포, CATE 분포, 공변량 균형 차트를 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestRegressor

df = pd.read_csv('mock_data.csv').dropna()
treat_col = '${treatment}'; outcome_col = '${outcome}'
covariates = [c for c in df.select_dtypes(include=[np.number]).columns if c not in [outcome_col, treat_col]]

# 성향점수
ps = LogisticRegression(max_iter=1000).fit(df[covariates], df[treat_col])
df['ps'] = ps.predict_proba(df[covariates])[:,1]

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# 성향점수 분포
axes[0].hist(df[df[treat_col]==1]['ps'], bins=20, alpha=0.6, label='처리군', color='#D32F2F')
axes[0].hist(df[df[treat_col]==0]['ps'], bins=20, alpha=0.6, label='통제군', color='#185FA5')
axes[0].set_xlabel('성향점수'); axes[0].legend()
axes[0].set_title('성향점수 분포')

# 하위집단별 처리효과
if len(covariates) >= 1:
    c0 = covariates[0]
    bins = pd.qcut(df[c0], 4, labels=['Q1','Q2','Q3','Q4'])
    grouped = df.groupby(bins).apply(
        lambda g: g[g[treat_col]==1][outcome_col].mean() - g[g[treat_col]==0][outcome_col].mean()
    )
    axes[1].bar(range(len(grouped)), grouped.values)
    axes[1].set_xticks(range(len(grouped)))
    axes[1].set_xticklabels(grouped.index)
    axes[1].set_xlabel(f'{c0} 분위')
    axes[1].set_ylabel('처리효과')
    axes[1].set_title(f'{c0}별 이질적 처리효과')

plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Visualization', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}

// ─── Bayesian ────────────────────────────────────────────────────

function getBayesianMenu(outcome, treatment) {
  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '데이터 준비 및 사전분포 설정',
          checked: false,
          description: '데이터를 확인하고 사전분포(prior) 설정을 위한 정보를 수집합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()

# 데이터 기본 정보
print("=== 데이터 요약 ===")
print(f"표본 크기: {len(df)}")
print(df.describe().round(3))

# 종속변수 분포 특성 (사전분포 설정 참고)
y = df['${outcome}']
print(f"\\n=== ${'${outcome}'} 분포 특성 ===")
print(f"평균: {y.mean():.3f}")
print(f"표준편차: {y.std():.3f}")
print(f"왜도: {y.skew():.3f}")
print(f"첨도: {y.kurtosis():.3f}")

# 약한 정보적 사전분포 제안
print("\\n=== 추천 사전분포 ===")
print(f"절편: Normal({y.mean():.1f}, {y.std()*2:.1f})")
print(f"회귀계수: Normal(0, {y.std():.1f})")
print(f"오차 SD: HalfCauchy(0, {y.std():.1f})")`,
          refLinks: [
            { label: 'Bayesian Thinking', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.01-what-is-machine-learning.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'frequentist_baseline',
          label: 'MLE 기준 모형 (빈도주의 비교용)',
          checked: false,
          description: '베이지안 결과와 비교하기 위한 빈도주의 MLE 기준 모형을 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()

X = sm.add_constant(df[['${treatment}']])
model = sm.OLS(df['${outcome}'], X).fit()
print("=== MLE 기준 모형 (비교용) ===")
print(model.summary())
print(f"\\n비교 포인트:")
print(f"  ${'${treatment}'} 계수: {model.params['${treatment}']:.4f}")
print(f"  95% CI: [{model.conf_int().loc['${treatment}',0]:.4f}, {model.conf_int().loc['${treatment}',1]:.4f}]")`,
          refLinks: [
            { label: 'OLS Baseline', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'bayesian_estimation',
          label: '베이지안 사후분포 추정 (MCMC 근사)',
          checked: false,
          description: '메트로폴리스-헤이스팅스 MCMC로 사후분포를 근사 추정합니다.',
          code: `import numpy as np
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
y = df['${outcome}'].values
x = df['${treatment}'].values
n = len(y)

# 간단한 베이지안 선형회귀 (정규-정규 결합 사후분포)
# y = a + b*x + e, e ~ N(0, sigma\\u00b2)
# 사전분포: a ~ N(y_mean, 10\\u00b2), b ~ N(0, 10\\u00b2), sigma ~ HalfCauchy

X = np.column_stack([np.ones(n), x])
# 정규 사전분포 + 정규 우도 -> 정규 사후분포 (해석적 해)
prior_mean = np.array([y.mean(), 0])
prior_var = np.diag([100, 100])

sigma2 = np.var(y - X @ np.linalg.lstsq(X, y, rcond=None)[0])
post_var = np.linalg.inv(np.linalg.inv(prior_var) + X.T @ X / sigma2)
post_mean = post_var @ (np.linalg.inv(prior_var) @ prior_mean + X.T @ y / sigma2)

print("=== 베이지안 사후분포 (해석적 해) ===")
print(f"절편: {post_mean[0]:.4f} \\u00b1 {np.sqrt(post_var[0,0]):.4f}")
print(f"${'${treatment}'}: {post_mean[1]:.4f} \\u00b1 {np.sqrt(post_var[1,1]):.4f}")

# 95% 신용구간
from scipy import stats
for i, name in enumerate(['절편', '${treatment}']):
    lo = post_mean[i] - 1.96*np.sqrt(post_var[i,i])
    hi = post_mean[i] + 1.96*np.sqrt(post_var[i,i])
    print(f"  {name} 95% CI: [{lo:.4f}, {hi:.4f}]")

# P(b > 0) 계산
prob_positive = 1 - stats.norm.cdf(0, post_mean[1], np.sqrt(post_var[1,1]))
print(f"\\nP(${'${treatment}'} > 0) = {prob_positive:.4f}")`,
          refLinks: [
            { label: 'Bayesian Estimation', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.01-what-is-machine-learning.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: '사후분포 시각화',
          checked: false,
          description: '사전분포/사후분포 비교, 신용구간, 수렴 진단을 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats

df = pd.read_csv('mock_data.csv').dropna()
y = df['${outcome}'].values; x = df['${treatment}'].values; n = len(y)
X = np.column_stack([np.ones(n), x])

prior_mean = np.array([y.mean(), 0])
prior_var = np.diag([100, 100])
sigma2 = np.var(y - X @ np.linalg.lstsq(X, y, rcond=None)[0])
post_var = np.linalg.inv(np.linalg.inv(prior_var) + X.T @ X / sigma2)
post_mean = post_var @ (np.linalg.inv(prior_var) @ prior_mean + X.T @ y / sigma2)

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# 사전분포 vs 사후분포
x_range = np.linspace(post_mean[1]-4*np.sqrt(post_var[1,1]), post_mean[1]+4*np.sqrt(post_var[1,1]), 200)
prior_pdf = stats.norm.pdf(x_range, 0, 10)
post_pdf = stats.norm.pdf(x_range, post_mean[1], np.sqrt(post_var[1,1]))

axes[0].plot(x_range, prior_pdf, 'b--', label='사전분포', linewidth=2)
axes[0].plot(x_range, post_pdf, 'r-', label='사후분포', linewidth=2)
axes[0].axvline(0, color='gray', linestyle=':', alpha=0.5)
axes[0].fill_between(x_range, post_pdf, alpha=0.2, color='red')
axes[0].set_xlabel(f'${'${treatment}'} 계수')
axes[0].set_title('사전분포 vs 사후분포')
axes[0].legend()

# 95% 신용구간
lo = post_mean[1] - 1.96*np.sqrt(post_var[1,1])
hi = post_mean[1] + 1.96*np.sqrt(post_var[1,1])
samples = np.random.normal(post_mean[1], np.sqrt(post_var[1,1]), 2000)
axes[1].hist(samples, bins=40, density=True, alpha=0.6, color='steelblue')
axes[1].axvline(lo, color='red', linestyle='--', label=f'95% CI [{lo:.3f}, {hi:.3f}]')
axes[1].axvline(hi, color='red', linestyle='--')
axes[1].axvline(post_mean[1], color='black', label=f'사후 평균: {post_mean[1]:.3f}')
axes[1].set_title('사후 샘플 분포')
axes[1].legend(fontsize=8)

plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Bayesian Viz', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}

// ─── SEM ─────────────────────────────────────────────────────────

function getSemMenu(outcome, treatment) {
  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: 'SEM 데이터 준비',
          checked: false,
          description: '잠재변수 지표 확인, 정규성 검정, 상관행렬 분석을 수행합니다.',
          code: `import pandas as pd
import numpy as np
from scipy import stats

df = pd.read_csv('mock_data.csv').dropna()

print("=== SEM 데이터 기초 분석 ===")
print(f"표본 크기: {len(df)} (SEM 권장 최소: 200)")

# 상관행렬
corr = df.select_dtypes(include=[np.number]).corr().round(3)
print("\\n=== 상관행렬 ===")
print(corr)

# 다변량 정규성 근사 검정 (Mardia's kurtosis 근사)
numeric_df = df.select_dtypes(include=[np.number])
for col in numeric_df.columns:
    stat, p = stats.shapiro(numeric_df[col][:500])
    normal = '\\u2705' if p > 0.05 else '\\u26a0\\ufe0f'
    print(f"  {col}: Shapiro p={p:.4f} {normal}")`,
          refLinks: [
            { label: 'SEM Basics', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.09-principal-component-analysis.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'cfa',
          label: '확인적 요인분석 (CFA)',
          checked: false,
          description: '측정 모형의 타당성을 확인합니다. 요인적재량, 적합도 지수를 분석합니다.',
          code: `import pandas as pd
import numpy as np
from sklearn.decomposition import FactorAnalysis

df = pd.read_csv('mock_data.csv').dropna()
numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

# 탐색적 요인분석 (CFA 전 단계)
n_factors = min(3, len(numeric_cols)//2)
fa = FactorAnalysis(n_components=n_factors, random_state=42)
fa.fit(df[numeric_cols])

print(f"=== 요인분석 (n_factors={n_factors}) ===")
loadings = pd.DataFrame(fa.components_.T, index=numeric_cols,
                         columns=[f'Factor_{i+1}' for i in range(n_factors)])
print("\\n요인적재량:")
print(loadings.round(3))
print(f"\\n설명 분산: {fa.noise_variance_.mean():.3f}")

# 적합도 근사
log_lik = fa.score(df[numeric_cols]).sum()
print(f"\\nLog-likelihood: {log_lik:.2f}")
print(f"BIC 근사: {-2*log_lik + n_factors*np.log(len(df)):.2f}")`,
          refLinks: [
            { label: 'Factor Analysis', url: 'https://scikit-learn.org/stable/modules/decomposition.html#factor-analysis' }
          ]
        },
        {
          id: 'path_model',
          label: '경로 모형 / 구조 모형 추정',
          checked: false,
          description: '잠재변수 간 구조적 관계(경로)를 추정합니다.',
          code: `import pandas as pd
import numpy as np
import statsmodels.api as sm

df = pd.read_csv('mock_data.csv').dropna()
numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
_skip = ['id', 'ID', 'entity_id', 'Unnamed: 0', 'year', 'time']
numeric_cols = [c for c in numeric_cols if c not in _skip]

# 경로 모형 근사 (다중 회귀 체인)
print("=== 경로 분석 (다중 회귀 근사) ===")
if len(numeric_cols) >= 3:
    # 변수 자동 배정: Y(종속), X(독립), M(매개) -- 모두 다른 변수
    y_var = '${outcome}' if '${outcome}' in df.columns else numeric_cols[0]
    x_var = '${treatment}' if '${treatment}' in df.columns and '${treatment}' != y_var else numeric_cols[1]
    remaining_m = [c for c in numeric_cols if c != y_var and c != x_var]
    m_var = remaining_m[0] if remaining_m else numeric_cols[2]

    print(f"X(독립): {x_var}")
    print(f"M(매개): {m_var}")
    print(f"Y(종속): {y_var}")

    # 경로 a: X -> M
    X_a = sm.add_constant(df[[x_var]])
    path_a = sm.OLS(df[m_var], X_a).fit()
    a = path_a.params[x_var]
    print(f"\\n경로 a ({x_var} -> {m_var}): {a:.4f} (p={path_a.pvalues[x_var]:.4f})")

    # 경로 b + c': M + X -> Y
    X_bc = sm.add_constant(df[[x_var, m_var]])
    path_bc = sm.OLS(df[y_var], X_bc).fit()
    b = path_bc.params[m_var]
    c_prime = path_bc.params[x_var]
    print(f"경로 b ({m_var} -> {y_var}): {b:.4f} (p={path_bc.pvalues[m_var]:.4f})")
    print(f"직접효과 c' ({x_var} -> {y_var}): {c_prime:.4f} (p={path_bc.pvalues[x_var]:.4f})")
    print(f"간접효과 a\\u00d7b: {a*b:.4f}")
    print(f"총효과 c'+a\\u00d7b: {c_prime + a*b:.4f}")
else:
    print("경로 분석에 최소 3개 수치 변수가 필요합니다.")`,
          refLinks: [
            { label: 'Path Analysis', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: 'SEM 결과 시각화',
          checked: false,
          description: '경로 다이어그램, 적합도 비교, 요인적재량 차트를 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
from sklearn.decomposition import FactorAnalysis

df = pd.read_csv('mock_data.csv').dropna()
numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

n_factors = min(3, len(numeric_cols)//2)
fa = FactorAnalysis(n_components=n_factors, random_state=42)
fa.fit(df[numeric_cols])

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# 요인적재량 히트맵
loadings = fa.components_
im = axes[0].imshow(loadings, cmap='RdBu_r', aspect='auto', vmin=-1, vmax=1)
axes[0].set_xticks(range(len(numeric_cols)))
axes[0].set_xticklabels(numeric_cols, rotation=45, ha='right', fontsize=7)
axes[0].set_yticks(range(n_factors))
axes[0].set_yticklabels([f'Factor {i+1}' for i in range(n_factors)])
axes[0].set_title('요인적재량 히트맵')
plt.colorbar(im, ax=axes[0])

# 상관행렬
corr = df[numeric_cols].corr()
im2 = axes[1].imshow(corr, cmap='coolwarm', vmin=-1, vmax=1)
axes[1].set_xticks(range(len(numeric_cols)))
axes[1].set_xticklabels(numeric_cols, rotation=45, ha='right', fontsize=7)
axes[1].set_yticks(range(len(numeric_cols)))
axes[1].set_yticklabels(numeric_cols, fontsize=7)
axes[1].set_title('상관행렬')
plt.colorbar(im2, ax=axes[1])

plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Heatmap', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.04-density-and-contour-plots.html' }
          ]
        }
      ]
    }
  };
}

// ─── Survival ────────────────────────────────────────────────────

function getSurvivalMenu(outcome, treatment) {
  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '생존 데이터 전처리',
          checked: false,
          description: '생존 시간, 사건 발생 여부, 중도절단 패턴을 확인합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()

# 생존 데이터 기본 정보
# 가정: outcome = 생존시간, treatment = 사건(event) 여부
time_col = '${outcome}'
event_col = '${treatment}'

print("=== 생존 데이터 요약 ===")
print(f"총 관측치: {len(df)}")
print(f"사건 발생: {df[event_col].sum()} ({df[event_col].mean():.1%})")
print(f"중도절단: {(1-df[event_col]).sum()} ({(1-df[event_col]).mean():.1%})")
print(f"\\n생존시간 분포:")
print(f"  평균: {df[time_col].mean():.2f}")
print(f"  중위수: {df[time_col].median():.2f}")
print(f"  범위: [{df[time_col].min():.2f}, {df[time_col].max():.2f}]")`,
          refLinks: [
            { label: 'Survival Data', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.00-introduction-to-pandas.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'kaplan_meier',
          label: 'Kaplan-Meier 생존 곡선',
          checked: false,
          description: '비모수적 생존 함수를 추정하고 집단 간 비교를 수행합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()
time_col = '${outcome}'
event_col = '${treatment}'

# Kaplan-Meier 추정 (수작업)
times = sorted(df[time_col].unique())
n_risk = len(df)
survival = []
se_list = []
current_surv = 1.0

for t in times:
    at_risk = (df[time_col] >= t).sum()
    events = ((df[time_col] == t) & (df[event_col] == 1)).sum()
    if at_risk > 0:
        hazard = events / at_risk
        current_surv *= (1 - hazard)
    survival.append(current_surv)

# 중위 생존시간
median_idx = next((i for i, s in enumerate(survival) if s <= 0.5), len(times)-1)
median_time = times[median_idx]

print("=== Kaplan-Meier 생존 추정 ===")
print(f"중위 생존시간: {median_time:.2f}")
print(f"1사분위 생존시간: {times[next((i for i,s in enumerate(survival) if s<=0.75), 0)]:.2f}")
print("\\n시점별 생존률:")
for i in range(0, len(times), max(1, len(times)//10)):
    print(f"  t={times[i]:.1f}: S(t)={survival[i]:.3f}")`,
          refLinks: [
            { label: 'Kaplan-Meier', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.00-introduction-to-pandas.html' }
          ]
        },
        {
          id: 'cox_regression',
          label: 'Cox 비례위험 모형',
          checked: false,
          description: '공변량의 위험비(Hazard Ratio)를 추정합니다.',
          code: `import pandas as pd
import numpy as np
from scipy import stats

df = pd.read_csv('mock_data.csv').dropna()
time_col = '${outcome}'
event_col = '${treatment}'
covariates = [c for c in df.select_dtypes(include=[np.number]).columns if c not in [time_col, event_col]]

# Cox 모형 근사 (로지스틱 회귀로 사건 확률 추정)
# 참고: 정확한 Cox 모형은 lifelines 패키지 필요
from sklearn.linear_model import LogisticRegression

if len(covariates) > 0:
    model = LogisticRegression(max_iter=1000)
    model.fit(df[covariates], df[event_col])

    print("=== Cox 비례위험 모형 근사 (로지스틱 회귀) ===")
    print("변수            | 계수     | OR(위험비) | 95% CI")
    print("-" * 55)
    for i, c in enumerate(covariates):
        coef = model.coef_[0][i]
        or_val = np.exp(coef)
        se = 1 / np.sqrt(len(df))  # 근사 SE
        ci_lo = np.exp(coef - 1.96*se)
        ci_hi = np.exp(coef + 1.96*se)
        print(f"  {c:15s} | {coef:+.4f} | {or_val:.4f}    | [{ci_lo:.3f}, {ci_hi:.3f}]")`,
          refLinks: [
            { label: 'Cox Regression', url: 'https://scikit-learn.org/stable/modules/linear_model.html#logistic-regression' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: '생존 분석 시각화',
          checked: false,
          description: 'KM 곡선, 위험비 Forest Plot을 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()
time_col = '${outcome}'; event_col = '${treatment}'

# KM 곡선
times = sorted(df[time_col].unique())
surv = 1.0; survival = []
for t in times:
    at_risk = (df[time_col] >= t).sum()
    events = ((df[time_col]==t) & (df[event_col]==1)).sum()
    if at_risk > 0: surv *= (1 - events/at_risk)
    survival.append(surv)

fig, axes = plt.subplots(1, 2, figsize=(12, 5))
axes[0].step(times, survival, where='post', linewidth=2)
axes[0].axhline(0.5, color='gray', linestyle=':', alpha=0.5)
axes[0].set_xlabel('시간'); axes[0].set_ylabel('생존 확률')
axes[0].set_title('Kaplan-Meier 생존 곡선')
axes[0].set_ylim(0, 1.05)

# 사건 발생 시점 분포
axes[1].hist(df[df[event_col]==1][time_col], bins=20, alpha=0.7, label='사건 발생', color='#D32F2F')
axes[1].hist(df[df[event_col]==0][time_col], bins=20, alpha=0.5, label='중도절단', color='#185FA5')
axes[1].set_xlabel('시간'); axes[1].set_ylabel('빈도')
axes[1].set_title('사건/중도절단 분포')
axes[1].legend()

plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Survival Viz', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}

// ─── Meta-Analysis ───────────────────────────────────────────────

function getMetaAnalysisMenu(outcome, treatment) {
  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '메타분석 데이터 준비',
          checked: false,
          description: '개별 연구 효과크기(ES), 표준오차, 표본크기를 확인합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()

# 메타분석 데이터 가정: 각 행 = 개별 연구
# outcome = 효과크기(ES), treatment = 표준오차(SE)
es_col = '${outcome}'; se_col = '${treatment}'

print("=== 메타분석 데이터 요약 ===")
print(f"포함된 연구 수: {len(df)}")
print(f"\\n효과크기 분포:")
print(f"  평균 ES: {df[es_col].mean():.4f}")
print(f"  중위 ES: {df[es_col].median():.4f}")
print(f"  범위: [{df[es_col].min():.4f}, {df[es_col].max():.4f}]")
print(f"\\n표준오차 분포:")
print(f"  평균 SE: {df[se_col].mean():.4f}")
print(f"  범위: [{df[se_col].min():.4f}, {df[se_col].max():.4f}]")

# 가중치 계산 (역분산)
df['weight'] = 1 / (df[se_col] ** 2)
print(f"\\n가중치 범위: [{df['weight'].min():.2f}, {df['weight'].max():.2f}]")`,
          refLinks: [
            { label: 'Meta-Analysis', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.08-aggregation-and-grouping.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'fixed_effects',
          label: '고정효과 메타분석',
          checked: false,
          description: '역분산 가중 고정효과 모형으로 통합 효과크기를 추정합니다.',
          code: `import pandas as pd
import numpy as np
from scipy import stats

df = pd.read_csv('mock_data.csv').dropna()
es_col = '${outcome}'; se_col = '${treatment}'

es = df[es_col].values
se = df[se_col].values
w = 1 / (se ** 2)

# 고정효과 통합 추정
fe_es = np.sum(w * es) / np.sum(w)
fe_se = 1 / np.sqrt(np.sum(w))
fe_ci = (fe_es - 1.96*fe_se, fe_es + 1.96*fe_se)
fe_z = fe_es / fe_se
fe_p = 2 * (1 - stats.norm.cdf(abs(fe_z)))

print("=== 고정효과 메타분석 ===")
print(f"통합 ES: {fe_es:.4f}")
print(f"SE: {fe_se:.4f}")
print(f"95% CI: [{fe_ci[0]:.4f}, {fe_ci[1]:.4f}]")
print(f"z = {fe_z:.3f}, p = {fe_p:.4f}")`,
          refLinks: [
            { label: 'Fixed Effects Meta', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'random_effects',
          label: '랜덤효과 메타분석 + 이질성 검정',
          checked: false,
          description: 'DerSimonian-Laird 랜덤효과 모형과 I\u00b2, Q 검정을 수행합니다.',
          code: `import pandas as pd
import numpy as np
from scipy import stats

df = pd.read_csv('mock_data.csv').dropna()
es_col = '${outcome}'; se_col = '${treatment}'

es = df[es_col].values; se = df[se_col].values
w = 1 / (se ** 2); k = len(es)

# 고정효과 추정
fe_es = np.sum(w * es) / np.sum(w)

# Q 통계량 (이질성 검정)
Q = np.sum(w * (es - fe_es)**2)
Q_df = k - 1
Q_p = 1 - stats.chi2.cdf(Q, Q_df)

# I\\u00b2 통계량
I2 = max(0, (Q - Q_df) / Q) * 100

# DerSimonian-Laird \\u03c4\\u00b2
c = np.sum(w) - np.sum(w**2) / np.sum(w)
tau2 = max(0, (Q - Q_df) / c)

# 랜덤효과 추정
w_re = 1 / (se**2 + tau2)
re_es = np.sum(w_re * es) / np.sum(w_re)
re_se = 1 / np.sqrt(np.sum(w_re))
re_ci = (re_es - 1.96*re_se, re_es + 1.96*re_se)
re_z = re_es / re_se
re_p = 2 * (1 - stats.norm.cdf(abs(re_z)))

print("=== 랜덤효과 메타분석 (DL) ===")
print(f"통합 ES: {re_es:.4f}")
print(f"SE: {re_se:.4f}")
print(f"95% CI: [{re_ci[0]:.4f}, {re_ci[1]:.4f}]")
print(f"z = {re_z:.3f}, p = {re_p:.4f}")
print(f"\\n=== 이질성 검정 ===")
print(f"Q = {Q:.2f} (df={Q_df}, p={Q_p:.4f})")
print(f"I\\u00b2 = {I2:.1f}%")
print(f"\\u03c4\\u00b2 = {tau2:.4f}")

heterogeneity = '낮음' if I2 < 25 else '중간' if I2 < 75 else '높음'
print(f"이질성 수준: {heterogeneity}")`,
          refLinks: [
            { label: 'Random Effects Meta', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: 'Forest Plot & Funnel Plot',
          checked: false,
          description: '개별 연구 효과크기 Forest Plot과 출판 편향 Funnel Plot을 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
es_col = '${outcome}'; se_col = '${treatment}'
es = df[es_col].values; se = df[se_col].values
k = len(es)

# 랜덤효과 추정
w = 1/(se**2); fe = np.sum(w*es)/np.sum(w)
Q = np.sum(w*(es-fe)**2); c = np.sum(w)-np.sum(w**2)/np.sum(w)
tau2 = max(0, (Q-(k-1))/c)
w_re = 1/(se**2+tau2); re_es = np.sum(w_re*es)/np.sum(w_re)

fig, axes = plt.subplots(1, 2, figsize=(14, max(6, k*0.3+2)))

# Forest Plot
y_pos = range(k)
ci_lo = es - 1.96*se; ci_hi = es + 1.96*se
axes[0].errorbar(es, y_pos, xerr=[es-ci_lo, ci_hi-es], fmt='s', capsize=3,
                 markersize=w_re/w_re.max()*10+3, color='steelblue')
axes[0].axvline(re_es, color='red', linestyle='--', label=f'통합 ES={re_es:.3f}')
axes[0].axvline(0, color='gray', linestyle=':', alpha=0.5)
axes[0].set_yticks(y_pos)
axes[0].set_yticklabels([f'연구 {i+1}' for i in range(k)], fontsize=8)
axes[0].set_xlabel('효과크기')
axes[0].set_title('Forest Plot')
axes[0].legend()

# Funnel Plot
axes[1].scatter(es, se, s=40, alpha=0.7, color='steelblue')
axes[1].axvline(re_es, color='red', linestyle='--')
# 95% 신뢰 깔때기
se_range = np.linspace(0.001, max(se)*1.2, 100)
axes[1].plot(re_es - 1.96*se_range, se_range, 'k--', alpha=0.3)
axes[1].plot(re_es + 1.96*se_range, se_range, 'k--', alpha=0.3)
axes[1].invert_yaxis()
axes[1].set_xlabel('효과크기')
axes[1].set_ylabel('표준오차')
axes[1].set_title('Funnel Plot')

plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Forest Plot', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}

// ─── Unstructured Data ───────────────────────────────────────────

function getUnstructuredDataMenu(outcome, treatment) {
  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '비정형 데이터 전처리',
          checked: false,
          description: '텍스트 정제, 토큰화, TF-IDF 벡터화 등을 수행합니다.',
          code: `import pandas as pd
import numpy as np
import re

df = pd.read_csv('mock_data.csv')

# 수치형 변수 분석 (비정형에서 추출된 특성)
print("=== 데이터 구조 ===")
print(f"관측치: {len(df)}")
print(f"열: {list(df.columns)}")
print("\\n=== 기술통계 ===")
print(df.describe().round(3))

# 텍스트 열 탐색 (있는 경우)
text_cols = df.select_dtypes(include=['object']).columns
if len(text_cols) > 0:
    for col in text_cols:
        print(f"\\n=== 텍스트 열: {col} ===")
        print(f"  고유값: {df[col].nunique()}")
        print(f"  평균 길이: {df[col].str.len().mean():.0f}자")
        print(f"  샘플: {df[col].iloc[0][:100]}...")`,
          refLinks: [
            { label: 'Text Processing', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.04-feature-engineering.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'feature_extraction',
          label: '특성 추출 (TF-IDF / 임베딩)',
          checked: false,
          description: '비정형 데이터에서 수치적 특성을 추출합니다.',
          code: `import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

df = pd.read_csv('mock_data.csv').dropna()

# 수치형 특성 간 상관 분석
numeric_df = df.select_dtypes(include=[np.number])
if len(numeric_df.columns) > 1:
    corr = numeric_df.corr()
    print("=== 수치적 특성 상관행렬 ===")
    print(corr.round(3))

    # 주성분분석 (차원 축소)
    from sklearn.decomposition import PCA
    from sklearn.preprocessing import StandardScaler

    X_scaled = StandardScaler().fit_transform(numeric_df)
    pca = PCA(n_components=min(5, len(numeric_df.columns)))
    pca.fit(X_scaled)

    print("\\n=== PCA 분산 설명률 ===")
    for i, var in enumerate(pca.explained_variance_ratio_):
        cum = sum(pca.explained_variance_ratio_[:i+1])
        print(f"  PC{i+1}: {var:.3f} (누적: {cum:.3f})")`,
          refLinks: [
            { label: 'PCA', url: 'https://scikit-learn.org/stable/modules/decomposition.html#pca' },
            { label: 'TF-IDF', url: 'https://scikit-learn.org/stable/modules/feature_extraction.html#text-feature-extraction' }
          ]
        },
        {
          id: 'model',
          label: '모형 추정',
          checked: false,
          description: '추출된 특성을 활용하여 분류/회귀 모형을 추정합니다.',
          code: `import pandas as pd
import numpy as np
import statsmodels.api as sm

df = pd.read_csv('mock_data.csv').dropna()
numeric_df = df.select_dtypes(include=[np.number])

# 회귀 모형
X = sm.add_constant(numeric_df.drop(columns=['${outcome}']))
model = sm.OLS(numeric_df['${outcome}'], X).fit(cov_type='HC1')
print("=== 모형 추정 결과 ===")
print(model.summary())`,
          refLinks: [
            { label: 'Regression', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: 'PCA 및 변수 관계 시각화',
          checked: false,
          description: '주성분 산점도, 변수 관계 시각화를 생성합니다.',
          code: `import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

df = pd.read_csv('mock_data.csv').dropna()
numeric_df = df.select_dtypes(include=[np.number])

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# PCA 2D 산점도
X_scaled = StandardScaler().fit_transform(numeric_df)
pca = PCA(n_components=2)
pc = pca.fit_transform(X_scaled)

axes[0].scatter(pc[:,0], pc[:,1], alpha=0.4, s=20, c=numeric_df['${outcome}'], cmap='viridis')
axes[0].set_xlabel(f'PC1 ({pca.explained_variance_ratio_[0]:.1%})')
axes[0].set_ylabel(f'PC2 ({pca.explained_variance_ratio_[1]:.1%})')
axes[0].set_title('PCA 2D 산점도')

# 핵심 변수 산점도
axes[1].scatter(numeric_df.iloc[:,0], numeric_df['${outcome}'], alpha=0.4, s=20)
axes[1].set_xlabel(numeric_df.columns[0])
axes[1].set_ylabel('${outcome}')
axes[1].set_title('핵심 변수 관계')

plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'PCA Visualization', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.09-principal-component-analysis.html' }
          ]
        }
      ]
    }
  };
}

// ─── Experimental ────────────────────────────────────────────────

function getExperimentalMenu(outcome, treatment) {
  const autoDetectBase = getAutoDetectBase(outcome, treatment);

  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '실험 데이터 전처리',
          checked: false,
          description: '실험 집단 확인, 요인 수준, 표본 크기 균형을 점검합니다.',
          code: `import pandas as pd
df = pd.read_csv('mock_data.csv')
${autoDetectBase}

# 집단 변수 자동감지
cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
group_col = cat_cols[0] if cat_cols else 'group'

print("=== 집단별 표본 크기 ===")
print(df.groupby(group_col).size())
print("\\n=== 집단별 기술통계 ===")
print(df.groupby(group_col)[outcome].describe().round(3))`,
          refLinks: [
            { label: 'Experimental Design', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.08-aggregation-and-grouping.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'anova',
          label: 'ANOVA / t-검정',
          checked: false,
          description: '집단 간 차이를 검정합니다.',
          code: `import pandas as pd
from scipy import stats
import pingouin as pg

df = pd.read_csv('mock_data.csv')
${autoDetectBase}

cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
group_col = cat_cols[0] if cat_cols else 'group'

# 일원 ANOVA
anova_result = pg.anova(data=df, dv=outcome, between=group_col)
print("=== ANOVA ===")
print(anova_result)

# 사후 검정 (Tukey HSD)
posthoc = pg.pairwise_tukey(data=df, dv=outcome, between=group_col)
print("\\n=== 사후 검정 (Tukey HSD) ===")
print(posthoc)`,
          refLinks: [
            { label: 'ANOVA', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'effect_size',
          label: '효과 크기 계산',
          checked: false,
          description: "Cohen's d, eta-squared 등 효과 크기를 계산합니다.",
          code: `import pingouin as pg
import pandas as pd

df = pd.read_csv('mock_data.csv')
${autoDetectBase}

cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
group_col = cat_cols[0] if cat_cols else 'group'

# \\u03b7\\u00b2 (이타-제곱)
anova = pg.anova(data=df, dv=outcome, between=group_col, effsize='np2')
print("=== 효과 크기 (partial \\u03b7\\u00b2) ===")
print(anova[['Source','np2']])`,
          refLinks: [
            { label: 'Effect Size', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: '집단 비교 시각화',
          checked: false,
          description: '집단별 비교 박스플롯, 바이올린 플롯을 생성합니다.',
          code: `import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd

df = pd.read_csv('mock_data.csv')
${autoDetectBase}

cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
group_col = cat_cols[0] if cat_cols else 'group'

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# 박스플롯
sns.boxplot(data=df, x=group_col, y=outcome, ax=axes[0])
axes[0].set_title(f'집단별 {outcome} 분포')

# 바이올린 플롯
sns.violinplot(data=df, x=group_col, y=outcome, ax=axes[1])
axes[1].set_title(f'집단별 {outcome} 분포 (바이올린)')

plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Seaborn', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.14-visualization-with-seaborn.html' }
          ]
        }
      ]
    }
  };
}

// ─── Default (fallback) ─────────────────────────────────────────

function getDefaultMenu(outcome, treatment) {
  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing',
          label: '데이터 전처리',
          checked: false,
          description: '분석에 필요한 데이터 변환 및 전처리를 수행합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv')
df = df.dropna()
print(f"전처리 후: {df.shape}")
print(df.head())`,
          refLinks: [
            { label: 'Pandas', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/03.00-introduction-to-pandas.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'baseline',
          label: '기본 모형 추정',
          checked: false,
          description: '핵심 독립변수만 포함한 기본 모형을 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
X = sm.add_constant(df[['${treatment}']])
model = sm.OLS(df['${outcome}'], X).fit()
print(model.summary())`,
          refLinks: [
            { label: 'OLS', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'full_model',
          label: '확장 모형 추정',
          checked: false,
          description: '통제변수를 추가한 확장 모형을 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID']
numeric_df = df.select_dtypes(include='number').drop(columns=[c for c in id_cols if c in df.columns], errors='ignore')
X = sm.add_constant(numeric_df.drop(columns=['${outcome}']))
model = sm.OLS(df['${outcome}'], X).fit(cov_type='HC1')
print(model.summary())`,
          refLinks: [
            { label: 'Multiple Regression', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization',
          label: '핵심 변수 산점도',
          checked: false,
          description: '분석 결과를 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_csv('mock_data.csv')

# 핵심 변수 산점도
plt.figure(figsize=(8,5))
plt.scatter(df['${treatment}'], df['${outcome}'], alpha=0.5)
plt.xlabel('${treatment}')
plt.ylabel('${outcome}')
plt.title('핵심 변수 관계')
plt.show()`,
          refLinks: [
            { label: 'Scatter Plot', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.02-simple-scatter-plots.html' }
          ]
        }
      ]
    }
  };
}

// ─── Mediation (design-specific) ─────────────────────────────────

function getMediationMenu(outcome, treatment, mediator, covariates) {
  const covList = covariates ? `covs = ['${covariates}']` : `covs = []`;
  const autoDetect = getAutoDetectMediation(outcome, treatment, mediator);

  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing_mediation',
          label: '매개분석 전처리',
          checked: false,
          description: '매개변수, 독립변수, 종속변수의 분포를 확인하고 분석을 준비합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()
${autoDetect}

# 기술통계
key_vars = [treatment, mediator, outcome]
available = [v for v in key_vars if v and v in df.columns]
print("\\n=== 기술통계 ===")
print(df[available].describe().round(3))

# 변수 간 상관
print("\\n=== 상관행렬 ===")
print(df[available].corr().round(3))`,
          refLinks: [
            { label: 'Mediation Analysis', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'path_a',
          label: '경로 a: X -> M (독립->매개)',
          checked: false,
          description: '독립변수가 매개변수에 미치는 효과(경로 a)를 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetect}
${covList}
cov_cols = [c for c in covs if c in df.columns]

# 경로 a: X -> M
X_a = sm.add_constant(df[[treatment] + cov_cols])
model_a = sm.OLS(df[mediator], X_a).fit(cov_type='HC1')
print(f"=== 경로 a: {treatment} -> {mediator} ===")
print(model_a.summary())
print(f"\\na = {model_a.params[treatment]:.4f}, p = {model_a.pvalues[treatment]:.4f}")`,
          refLinks: [
            { label: 'Path Analysis', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'path_b_cprime',
          label: "경로 b, c': M -> Y + 직접효과",
          checked: false,
          description: "매개변수->종속변수 경로(b)와 직접효과(c')를 동시에 추정합니다.",
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetect}
${covList}
cov_cols = [c for c in covs if c in df.columns]

# 경로 b + c': M, X -> Y
X_bc = sm.add_constant(df[[treatment, mediator] + cov_cols])
model_bc = sm.OLS(df[outcome], X_bc).fit(cov_type='HC1')
print(f"=== 경로 b, c': {treatment} + {mediator} -> {outcome} ===")
print(model_bc.summary())

b = model_bc.params[mediator]
c_prime = model_bc.params[treatment]
print(f"\\nb (매개->종속) = {b:.4f}, p = {model_bc.pvalues[mediator]:.4f}")
print(f"c' (직접효과) = {c_prime:.4f}, p = {model_bc.pvalues[treatment]:.4f}")

# 총효과 모형 (c = c' + a*b)
X_c = sm.add_constant(df[[treatment] + cov_cols])
model_c = sm.OLS(df[outcome], X_c).fit(cov_type='HC1')
c_total = model_c.params[treatment]
print(f"\\nc (총효과) = {c_total:.4f}, p = {model_c.pvalues[treatment]:.4f}")`,
          refLinks: [
            { label: 'Mediation Paths', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'indirect_effect',
          label: '간접효과 + 부트스트래핑 CI',
          checked: false,
          description: '간접효과(a*b)를 계산하고 부트스트래핑으로 신뢰구간을 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()
${autoDetect}
${covList}
cov_cols = [c for c in covs if c in df.columns]

# 원래 간접효과 계산
X_a = sm.add_constant(df[[treatment] + cov_cols])
a = sm.OLS(df[mediator], X_a).fit().params[treatment]

X_bc = sm.add_constant(df[[treatment, mediator] + cov_cols])
b = sm.OLS(df[outcome], X_bc).fit().params[mediator]
c_prime = sm.OLS(df[outcome], X_bc).fit().params[treatment]

indirect = a * b
print(f"간접효과 (a \\u00d7 b) = {indirect:.4f}")
print(f"직접효과 (c') = {c_prime:.4f}")
print(f"총효과 (c' + a*b) = {c_prime + indirect:.4f}")

# 부트스트래핑 (5000회)
n_boot = 5000
boot_indirect = np.zeros(n_boot)
n = len(df)

for i in range(n_boot):
    idx = np.random.choice(n, size=n, replace=True)
    boot_df = df.iloc[idx]

    X_a_b = sm.add_constant(boot_df[[treatment] + cov_cols])
    a_b = sm.OLS(boot_df[mediator], X_a_b).fit().params[treatment]

    X_bc_b = sm.add_constant(boot_df[[treatment, mediator] + cov_cols])
    b_b = sm.OLS(boot_df[outcome], X_bc_b).fit().params[mediator]

    boot_indirect[i] = a_b * b_b

ci_lower = np.percentile(boot_indirect, 2.5)
ci_upper = np.percentile(boot_indirect, 97.5)

print(f"\\n=== 부트스트래핑 95% CI (N={n_boot}) ===")
print(f"간접효과: {indirect:.4f} [{ci_lower:.4f}, {ci_upper:.4f}]")
print(f"{'-> 유의' if ci_lower > 0 or ci_upper < 0 else '-> 비유의'} (0이 CI에 {'미포함' if ci_lower > 0 or ci_upper < 0 else '포함'})")`,
          refLinks: [
            { label: 'Bootstrap CI', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.03-hyperparameters-and-model-validation.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization_mediation',
          label: '매개효과 경로 다이어그램',
          checked: false,
          description: '경로 다이어그램과 부트스트래핑 분포를 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import statsmodels.api as sm
import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()
${autoDetect}
${covList}
cov_cols = [c for c in covs if c in df.columns]

# 계수 추정
X_a = sm.add_constant(df[[treatment] + cov_cols])
model_a = sm.OLS(df[mediator], X_a).fit()
a = model_a.params[treatment]
a_p = model_a.pvalues[treatment]

X_bc = sm.add_constant(df[[treatment, mediator] + cov_cols])
model_bc = sm.OLS(df[outcome], X_bc).fit()
b = model_bc.params[mediator]
b_p = model_bc.pvalues[mediator]
c_prime = model_bc.params[treatment]
cp_p = model_bc.pvalues[treatment]

indirect = a * b

# 경로 다이어그램
fig, ax = plt.subplots(figsize=(10, 6))
ax.set_xlim(0, 10)
ax.set_ylim(0, 8)
ax.axis('off')

# 변수 박스
for pos, label in [((1, 4), f'{treatment}\\n(X)'), ((5, 7), f'{mediator}\\n(M)'), ((9, 4), f'{outcome}\\n(Y)')]:
    ax.add_patch(mpatches.FancyBboxPatch((pos[0]-0.8, pos[1]-0.5), 1.6, 1, boxstyle="round,pad=0.1", facecolor='lightblue', edgecolor='black'))
    ax.text(pos[0], pos[1], label, ha='center', va='center', fontsize=11, fontweight='bold')

# 화살표 + 계수
sig = lambda p: '***' if p < .001 else '**' if p < .01 else '*' if p < .05 else ''
ax.annotate('', xy=(4.2, 7), xytext=(1.8, 4.5), arrowprops=dict(arrowstyle='->', lw=2))
ax.text(2.5, 6.2, f'a = {a:.3f}{sig(a_p)}', fontsize=10, fontweight='bold')
ax.annotate('', xy=(8.2, 4.5), xytext=(5.8, 7), arrowprops=dict(arrowstyle='->', lw=2))
ax.text(7.2, 6.2, f'b = {b:.3f}{sig(b_p)}', fontsize=10, fontweight='bold')
ax.annotate('', xy=(8.2, 4), xytext=(1.8, 4), arrowprops=dict(arrowstyle='->', lw=2, linestyle='dashed'))
ax.text(5, 3.3, f"c' = {c_prime:.3f}{sig(cp_p)}", fontsize=10, fontweight='bold')
ax.text(5, 2.3, f"간접효과(a\\u00d7b) = {indirect:.4f}", fontsize=11, ha='center', fontweight='bold', color='darkred')

ax.set_title('매개효과 경로 다이어그램', fontsize=14, fontweight='bold', pad=20)
plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Path Diagram', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}

// ─── Moderation (design-specific) ────────────────────────────────

function getModerationMenu(outcome, treatment, moderator, covariates) {
  const covList = covariates ? `covs = ['${covariates}']` : `covs = []`;
  const autoDetectMod = getAutoDetectModeration(outcome, treatment, moderator);

  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing_moderation',
          label: '조절분석 전처리 (평균중심화)',
          checked: false,
          description: '조절변수와 독립변수를 평균중심화하고 상호작용항을 생성합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectMod}

# 평균중심화
df[treatment + '_c'] = df[treatment] - df[treatment].mean()
df[moderator + '_c'] = df[moderator] - df[moderator].mean()

# 상호작용항 생성
df['interaction'] = df[treatment + '_c'] * df[moderator + '_c']

print("\\n=== 기술통계 (중심화 후) ===")
key = [treatment + '_c', moderator + '_c', 'interaction', outcome]
available = [v for v in key if v in df.columns]
print(df[available].describe().round(3))

print("\\n=== 상관행렬 ===")
print(df[available].corr().round(3))`,
          refLinks: [
            { label: 'Moderation', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'interaction_model',
          label: '상호작용 모형 추정',
          checked: false,
          description: '독립변수, 조절변수, 상호작용항을 포함한 회귀모형을 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectMod}
${covList}
cov_cols = [c for c in covs if c in df.columns]

# 평균중심화
df[treatment + '_c'] = df[treatment] - df[treatment].mean()
df[moderator + '_c'] = df[moderator] - df[moderator].mean()
df['interaction'] = df[treatment + '_c'] * df[moderator + '_c']

x_c = treatment + '_c'
w_c = moderator + '_c'

# 모형 1: 주효과만
X1 = sm.add_constant(df[[x_c, w_c] + cov_cols])
model1 = sm.OLS(df[outcome], X1).fit(cov_type='HC1')
print("=== 모형 1: 주효과만 ===")
print(model1.summary())

# 모형 2: 상호작용항 포함
X2 = sm.add_constant(df[[x_c, w_c, 'interaction'] + cov_cols])
model2 = sm.OLS(df[outcome], X2).fit(cov_type='HC1')
print("\\n=== 모형 2: 상호작용항 포함 ===")
print(model2.summary())

# R\\u00b2 변화
delta_r2 = model2.rsquared - model1.rsquared
print(f"\\n\\u0394R\\u00b2 = {delta_r2:.4f}")
print(f"상호작용 계수 = {model2.params['interaction']:.4f}, p = {model2.pvalues['interaction']:.4f}")`,
          refLinks: [
            { label: 'Interaction Effects', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'simple_slopes',
          label: '단순기울기 분석 (Simple Slopes)',
          checked: false,
          description: '조절변수의 수준별(M-1SD, M, M+1SD) 독립변수->종속변수 효과를 분석합니다.',
          code: `import statsmodels.api as sm
import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectMod}
${covList}
cov_cols = [c for c in covs if c in df.columns]

x_c = treatment + '_c'
w_c = moderator + '_c'
df[x_c] = df[treatment] - df[treatment].mean()
df[w_c] = df[moderator] - df[moderator].mean()
df['interaction'] = df[x_c] * df[w_c]

X = sm.add_constant(df[[x_c, w_c, 'interaction'] + cov_cols])
model = sm.OLS(df[outcome], X).fit(cov_type='HC1')

b1 = model.params[x_c]
b3 = model.params['interaction']
w_sd = df[moderator].std()

print("=== 단순기울기 분석 ===")
for label, w_val in [('M - 1SD', -w_sd), ('M (평균)', 0), ('M + 1SD', w_sd)]:
    slope = b1 + b3 * w_val
    vcov = model.cov_params()
    se = np.sqrt(vcov.loc[x_c, x_c] +
                 2*w_val*vcov.loc[x_c, 'interaction'] +
                 w_val**2*vcov.loc['interaction','interaction'])
    t_val = slope / se
    p_val = 2 * (1 - __import__('scipy').stats.t.cdf(abs(t_val), model.df_resid))
    sig = '***' if p_val < .001 else '**' if p_val < .01 else '*' if p_val < .05 else 'ns'
    print(f"{label}: slope = {slope:.4f}, SE = {se:.4f}, t = {t_val:.4f}, p = {p_val:.4f} {sig}")`,
          refLinks: [
            { label: 'Simple Slopes', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization_moderation',
          label: '조절효과 시각화',
          checked: false,
          description: '조절변수 수준별 회귀선 그래프(상호작용 플롯)를 생성합니다.',
          code: `import matplotlib.pyplot as plt
import statsmodels.api as sm
import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectMod}

x_c = treatment + '_c'
w_c = moderator + '_c'
df[x_c] = df[treatment] - df[treatment].mean()
df[w_c] = df[moderator] - df[moderator].mean()
df['interaction'] = df[x_c] * df[w_c]

X = sm.add_constant(df[[x_c, w_c, 'interaction']])
model = sm.OLS(df[outcome], X).fit()

b0, b1, b2, b3 = model.params['const'], model.params[x_c], model.params[w_c], model.params['interaction']
w_sd = df[moderator].std()

x_range = np.linspace(df[x_c].min(), df[x_c].max(), 100)

fig, ax = plt.subplots(figsize=(8, 6))
for w_val, label, color in [(-w_sd, 'Low (-1SD)', 'blue'), (0, 'Mean', 'green'), (w_sd, 'High (+1SD)', 'red')]:
    y_pred = b0 + (b1 + b3 * w_val) * x_range + b2 * w_val
    ax.plot(x_range, y_pred, label=f'{moderator} {label}', color=color, linewidth=2)

ax.set_xlabel(f'{treatment} (중심화)', fontsize=12)
ax.set_ylabel(f'{outcome}', fontsize=12)
ax.set_title(f'조절효과: {moderator} 수준별 {treatment}->{outcome} 관계', fontsize=13)
ax.legend(fontsize=11)
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Interaction Plot', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}

// ─── Moderated Mediation (design-specific) ───────────────────────

function getModeratedMediationMenu(outcome, treatment, mediator, moderator, covariates) {
  const covList = covariates ? `covs = ['${covariates}']` : `covs = []`;
  const autoDetectModMed = getAutoDetectModMed(outcome, treatment, mediator, moderator);

  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing_modmed',
          label: '조절된 매개분석 전처리',
          checked: false,
          description: '변수 확인, 평균중심화, 상관행렬을 확인합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectModMed}

# 평균중심화
for v in [treatment, mediator, moderator]:
    if v and v in df.columns:
        df[v + '_c'] = df[v] - df[v].mean()

key_vars = [treatment, mediator, moderator, outcome]
available = [v for v in key_vars if v and v in df.columns]
print("\\n=== 상관행렬 ===")
print(df[available].corr().round(3))`,
          refLinks: [
            { label: 'Moderated Mediation', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'path_a_modmed',
          label: '경로 a: X -> M',
          checked: false,
          description: '독립변수->매개변수 경로를 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectModMed}
${covList}
cov_cols = [c for c in covs if c in df.columns]

X_a = sm.add_constant(df[[treatment] + cov_cols])
model_a = sm.OLS(df[mediator], X_a).fit(cov_type='HC1')
print(f"=== 경로 a: {treatment} -> {mediator} ===")
print(model_a.summary())`,
          refLinks: [
            { label: 'Path a', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'path_b_moderated',
          label: '경로 b(조절됨): M*W -> Y',
          checked: false,
          description: '매개변수->종속변수 경로에 조절변수의 상호작용을 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectModMed}
${covList}
cov_cols = [c for c in covs if c in df.columns]

# 평균중심화
m_c = mediator + '_c'
w_c = moderator + '_c'
df[m_c] = df[mediator] - df[mediator].mean()
df[w_c] = df[moderator] - df[moderator].mean()
df['MW_interaction'] = df[m_c] * df[w_c]

X = sm.add_constant(df[[treatment, m_c, w_c, 'MW_interaction'] + cov_cols])
model = sm.OLS(df[outcome], X).fit(cov_type='HC1')
print("=== M + W + M\\u00d7W -> Y (직접효과 포함) ===")
print(model.summary())

print(f"\\nb (M->Y 주효과) = {model.params[m_c]:.4f}")
print(f"상호작용 (M\\u00d7W) = {model.params['MW_interaction']:.4f}, p = {model.pvalues['MW_interaction']:.4f}")`,
          refLinks: [
            { label: 'Moderated Path b', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'conditional_indirect',
          label: '조건부 간접효과 (부트스트래핑)',
          checked: false,
          description: '조절변수 수준별 간접효과를 부트스트래핑으로 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectModMed}
${covList}
cov_cols = [c for c in covs if c in df.columns]

w_mean = df[moderator].mean()
w_sd = df[moderator].std()
w_levels = {'Low (-1SD)': w_mean - w_sd, 'Mean': w_mean, 'High (+1SD)': w_mean + w_sd}

n_boot = 5000
n = len(df)
results = {k: np.zeros(n_boot) for k in w_levels}

for i in range(n_boot):
    idx = np.random.choice(n, size=n, replace=True)
    bd = df.iloc[idx].copy()

    # 경로 a
    X_a = sm.add_constant(bd[[treatment] + cov_cols])
    a = sm.OLS(bd[mediator], X_a).fit().params[treatment]

    # 경로 b (조절됨)
    bd['m_c'] = bd[mediator] - bd[mediator].mean()
    bd['w_c'] = bd[moderator] - bd[moderator].mean()
    bd['mw'] = bd['m_c'] * bd['w_c']
    X_b = sm.add_constant(bd[[treatment, 'm_c', 'w_c', 'mw'] + cov_cols])
    model_b = sm.OLS(bd[outcome], X_b).fit()
    b_main = model_b.params['m_c']
    b_int = model_b.params['mw']

    for label, w_val in w_levels.items():
        b_cond = b_main + b_int * (w_val - w_mean)
        results[label][i] = a * b_cond

print("=== 조건부 간접효과 (부트스트래핑 95% CI) ===")
for label, boots in results.items():
    ci_lo, ci_hi = np.percentile(boots, [2.5, 97.5])
    mean_ie = np.mean(boots)
    sig = '유의' if ci_lo > 0 or ci_hi < 0 else '비유의'
    print(f"{label}: indirect = {mean_ie:.4f} [{ci_lo:.4f}, {ci_hi:.4f}] -> {sig}")

# 조절된 매개 지수 (Index of Moderated Mediation)
idx_mm = results['High (+1SD)'] - results['Low (-1SD)']
ci_lo, ci_hi = np.percentile(idx_mm, [2.5, 97.5])
print(f"\\n조절된 매개 지수 = {np.mean(idx_mm):.4f} [{ci_lo:.4f}, {ci_hi:.4f}]")`,
          refLinks: [
            { label: 'Conditional Indirect Effects', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.03-hyperparameters-and-model-validation.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization_modmed',
          label: '조건부 간접효과 시각화',
          checked: false,
          description: '조절변수 수준별 간접효과 그래프를 생성합니다.',
          code: `import matplotlib.pyplot as plt
import numpy as np
import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectModMed}
${covList}
cov_cols = [c for c in covs if c in df.columns]

w_mean = df[moderator].mean()
w_sd = df[moderator].std()

# 경로 a 추정
X_a = sm.add_constant(df[[treatment] + cov_cols])
a = sm.OLS(df[mediator], X_a).fit().params[treatment]

# 경로 b (조절됨) 추정
df['m_c'] = df[mediator] - df[mediator].mean()
df['w_c'] = df[moderator] - df[moderator].mean()
df['mw'] = df['m_c'] * df['w_c']
X_b = sm.add_constant(df[[treatment, 'm_c', 'w_c', 'mw'] + cov_cols])
model_b = sm.OLS(df[outcome], X_b).fit()
b_main = model_b.params['m_c']
b_int = model_b.params['mw']

# 조절변수 범위에서 간접효과 계산
w_range = np.linspace(df[moderator].min(), df[moderator].max(), 50)
indirect_effects = [a * (b_main + b_int * (w - w_mean)) for w in w_range]

fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(w_range, indirect_effects, 'b-', linewidth=2)
ax.axhline(y=0, color='red', linestyle='--', alpha=0.5)
ax.fill_between(w_range, 0, indirect_effects, alpha=0.1, color='blue')

# 수준 표시
for w_val, label in [(w_mean - w_sd, '-1SD'), (w_mean, 'M'), (w_mean + w_sd, '+1SD')]:
    ie = a * (b_main + b_int * (w_val - w_mean))
    ax.axvline(x=w_val, color='gray', linestyle=':', alpha=0.5)
    ax.plot(w_val, ie, 'ro', markersize=8)
    ax.annotate(f'{label}\\n{ie:.3f}', xy=(w_val, ie), xytext=(5, 10), textcoords='offset points', fontsize=9)

ax.set_xlabel(f'{moderator}', fontsize=12)
ax.set_ylabel('간접효과 (a \\u00d7 b)', fontsize=12)
ax.set_title(f'조건부 간접효과: {moderator} 수준에 따른 매개효과 변화', fontsize=13)
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Conditional Effects Viz', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}

// ─── Hierarchical Regression (design-specific) ───────────────────

function getHierarchicalRegressionMenu(outcome, treatment, covariates) {
  const covList = covariates ? `covs = ['${covariates}']` : `covs = []`;
  const autoDetectHier = getAutoDetectHierarchical(outcome, treatment);

  return {
    descriptive: {
      label: '기술통계',
      items: [
        ...getCommonDescriptiveItems(outcome, treatment),
        {
          id: 'preprocessing_hierarchical',
          label: '위계적 회귀분석 전처리',
          checked: false,
          description: '변수 확인 및 분석 준비를 합니다.',
          code: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectHier}
${covList}
cov_cols = [c for c in covs if c in df.columns]

if not cov_cols:
    cov_cols = [c for c in num_cols if c != outcome and c != treatment][:3]

print(f"\\n통제변수: {cov_cols}")
print(f"\\n=== 기술통계 ===")
print(df[[outcome, treatment] + cov_cols].describe().round(3))
print(f"\\n=== 상관행렬 ===")
print(df[[outcome, treatment] + cov_cols].corr().round(3))`,
          refLinks: [
            { label: 'Hierarchical Regression', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    inferential: {
      label: '추론통계',
      items: [
        {
          id: 'model_step1',
          label: '1단계: 통제변수 모형',
          checked: false,
          description: '통제변수만 포함한 기저 모형을 추정합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectHier}
${covList}
cov_cols = [c for c in covs if c in df.columns]

if not cov_cols:
    cov_cols = [c for c in num_cols if c != outcome and c != treatment][:3]

X1 = sm.add_constant(df[cov_cols])
model1 = sm.OLS(df[outcome], X1).fit(cov_type='HC1')
print("=== 1단계: 통제변수 모형 ===")
print(model1.summary())
print(f"\\nR\\u00b2 = {model1.rsquared:.4f}")`,
          refLinks: [
            { label: 'Step 1 Model', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'model_step2',
          label: '2단계: 핵심 독립변수 추가',
          checked: false,
          description: '핵심 독립변수를 추가하고 R-squared 변화량을 확인합니다.',
          code: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectHier}
${covList}
cov_cols = [c for c in covs if c in df.columns]

if not cov_cols:
    cov_cols = [c for c in num_cols if c != outcome and c != treatment][:3]

# 1단계
X1 = sm.add_constant(df[cov_cols])
model1 = sm.OLS(df[outcome], X1).fit(cov_type='HC1')

# 2단계: + 핵심 독립변수
X2 = sm.add_constant(df[cov_cols + [treatment]])
model2 = sm.OLS(df[outcome], X2).fit(cov_type='HC1')
print("=== 2단계: 핵심 독립변수 추가 ===")
print(model2.summary())

delta_r2 = model2.rsquared - model1.rsquared
print(f"\\nR\\u00b2 변화: {model1.rsquared:.4f} -> {model2.rsquared:.4f}")
print(f"\\u0394R\\u00b2 = {delta_r2:.4f}")

# F 변화 검정
from scipy import stats
df_num = model2.df_model - model1.df_model
df_den = model2.df_resid
f_change = (delta_r2 / df_num) / ((1 - model2.rsquared) / df_den)
p_change = 1 - stats.f.cdf(f_change, df_num, df_den)
print(f"F change = {f_change:.4f}, p = {p_change:.4f}")`,
          refLinks: [
            { label: 'R-squared Change', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        },
        {
          id: 'model_comparison',
          label: '모형 비교 (delta-R-squared 종합)',
          checked: false,
          description: '모든 단계의 R-squared 변화와 F 검정 결과를 종합합니다.',
          code: `import statsmodels.api as sm
import pandas as pd
import numpy as np
from scipy import stats

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectHier}
${covList}
cov_cols = [c for c in covs if c in df.columns]

if not cov_cols:
    cov_cols = [c for c in num_cols if c != outcome and c != treatment][:3]

models = []
# 1단계
X1 = sm.add_constant(df[cov_cols])
m1 = sm.OLS(df[outcome], X1).fit()
models.append(('1단계: 통제변수', m1))

# 2단계
X2 = sm.add_constant(df[cov_cols + [treatment]])
m2 = sm.OLS(df[outcome], X2).fit()
models.append(('2단계: + 핵심 IV', m2))

print("=== 위계적 회귀분석 종합 ===")
print(f"{'단계':<20} {'R\\u00b2':>8} {'adj R\\u00b2':>8} {'\\u0394R\\u00b2':>8} {'F change':>10} {'p':>8}")
print("-" * 65)

prev_r2 = 0
for name, m in models:
    dr2 = m.rsquared - prev_r2
    if prev_r2 == 0:
        f_ch, p_ch = m.fvalue, m.f_pvalue
    else:
        df_num = m.df_model - models[models.index((name,m))-1][1].df_model
        df_den = m.df_resid
        f_ch = (dr2 / max(df_num, 1)) / ((1 - m.rsquared) / df_den)
        p_ch = 1 - stats.f.cdf(f_ch, max(df_num, 1), df_den)
    sig = '***' if p_ch < .001 else '**' if p_ch < .01 else '*' if p_ch < .05 else ''
    print(f"{name:<20} {m.rsquared:>8.4f} {m.rsquared_adj:>8.4f} {dr2:>8.4f} {f_ch:>10.4f} {p_ch:>7.4f} {sig}")
    prev_r2 = m.rsquared`,
          refLinks: [
            { label: 'Model Comparison', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/05.06-linear-regression.html' }
          ]
        }
      ]
    },
    visualization: {
      label: '시각화',
      items: [
        {
          id: 'visualization_hierarchical',
          label: 'R-squared 변화 시각화',
          checked: false,
          description: '각 단계별 R-squared 변화를 막대그래프로 시각화합니다.',
          code: `import matplotlib.pyplot as plt
import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
${autoDetectHier}
${covList}
cov_cols = [c for c in covs if c in df.columns]

if not cov_cols:
    cov_cols = [c for c in num_cols if c != outcome and c != treatment][:3]

X1 = sm.add_constant(df[cov_cols])
m1 = sm.OLS(df[outcome], X1).fit()

X2 = sm.add_constant(df[cov_cols + [treatment]])
m2 = sm.OLS(df[outcome], X2).fit()

stages = ['1단계\\n(통제변수)', f'2단계\\n(+ {treatment})']
r2_vals = [m1.rsquared, m2.rsquared]
delta_r2 = [m1.rsquared, m2.rsquared - m1.rsquared]

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# R\\u00b2 누적
axes[0].bar(stages, r2_vals, color=['steelblue', 'coral'])
axes[0].set_ylabel('R\\u00b2')
axes[0].set_title('단계별 R\\u00b2 (누적)')
for i, v in enumerate(r2_vals):
    axes[0].text(i, v + 0.01, f'{v:.4f}', ha='center', fontweight='bold')

# \\u0394R\\u00b2
colors = ['steelblue', 'coral']
axes[1].bar(stages, delta_r2, color=colors)
axes[1].set_ylabel('\\u0394R\\u00b2')
axes[1].set_title('단계별 R\\u00b2 변화량')
for i, v in enumerate(delta_r2):
    axes[1].text(i, v + 0.005, f'{v:.4f}', ha='center', fontweight='bold')

plt.suptitle('위계적 회귀분석: R\\u00b2 변화', fontsize=14, fontweight='bold')
plt.tight_layout()
plt.show()`,
          refLinks: [
            { label: 'Bar Charts', url: 'https://jakevdp.github.io/PythonDataScienceHandbook/04.00-introduction-to-matplotlib.html' }
          ]
        }
      ]
    }
  };
}
