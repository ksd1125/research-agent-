/**
 * steps.js — 카테고리별 분석 Step 정의
 * ResearchMethodAgent v5.0
 *
 * 각 분석 카테고리(12개)에 대해 단계별 실습 Step을 정의합니다.
 * Step은 동적으로 생성되며, 사용자가 [실행] 버튼을 클릭하면
 * simulator.js를 통해 Gemini가 결과를 시뮬레이션합니다.
 */

/**
 * 분석 카테고리별 Step 목록 반환
 * @param {string} category - 12개 카테고리 중 하나
 * @param {Object} methodMeta - Agent 1의 detected_method (analysis_type, key_variables 등)
 * @param {Object} paperContext - Agent 1의 paper_context
 * @returns {Array<{ id: string, title: string, description: string, codeTemplate: { python: string, r: string } }>}
 */
export function getStepsForCategory(category, methodMeta, paperContext) {
  const keyVars = methodMeta?.key_variables || {};
  const outcome = keyVars.outcome || 'y';
  const treatment = keyVars.treatment || 'x';
  const controls = keyVars.controls || 'controls';
  const analysisType = methodMeta?.analysis_type || '';

  // Base steps that apply to all categories
  const baseSteps = [
    {
      id: 'descriptive',
      title: '기술통계 확인',
      description: '데이터의 기본 특성(평균, 표준편차, 분포)을 확인합니다.',
      codeTemplate: {
        python: `import pandas as pd
import numpy as np

# 데이터 로드
df = pd.read_csv('mock_data.csv')

# 수치형 변수만 선택하여 기술통계
numeric_df = df.select_dtypes(include='number')
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
print(df.isnull().sum())

# 상관행렬 (수치형만)
if len(numeric_df.columns) > 1:
    print("\\n=== 상관행렬 ===")
    print(numeric_df.corr().round(3))`,
        r: `library(dplyr)

# 데이터 로드
df <- read.csv('mock_data.csv')

# 기술통계
summary(df)

# 결측치 확인
sapply(df, function(x) sum(is.na(x)))

# 상관행렬 (수치형만)
cor(df[sapply(df, is.numeric)], use="complete.obs") |> round(3)`
      }
    }
  ];

  // Category-specific steps
  const categorySteps = getCategorySpecificSteps(category, analysisType, keyVars, paperContext);

  return [...baseSteps, ...categorySteps];
}

function getCategorySpecificSteps(category, analysisType, keyVars, paperContext) {
  const outcome = keyVars.outcome || 'outcome_var';
  const treatment = keyVars.treatment || 'treatment_var';
  const controls = keyVars.controls || 'control_vars';

  const stepsMap = {
    regression: [
      {
        id: 'preprocessing',
        title: '데이터 전처리',
        description: '결측치 처리, 변수 변환, 더미 변수 생성 등 분석 준비를 합니다.',
        codeTemplate: {
          python: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv')

# 로그 변환 (필요 시)
# df['log_${outcome}'] = np.log(df['${outcome}'] + 1)

# 결측치 처리
df = df.dropna()

# 더미 변수 생성 (범주형 변수)
# df = pd.get_dummies(df, columns=['category_var'], drop_first=True)

print(f"전처리 후 데이터: {df.shape[0]}행 × {df.shape[1]}열")
print(df.head())`,
          r: `library(dplyr)
df <- read.csv('mock_data.csv')

# 결측치 처리
df <- na.omit(df)

# 로그 변환 (필요 시)
# df$log_outcome <- log(df$${outcome} + 1)

cat(sprintf("전처리 후 데이터: %d행 × %d열\\n", nrow(df), ncol(df)))
head(df)`
        }
      },
      {
        id: 'baseline',
        title: '기본 모형 추정 (OLS)',
        description: '최소자승법(OLS)으로 기본 회귀 모형을 추정합니다.',
        codeTemplate: {
          python: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()

# 모형 1: 기본 모형 (핵심 독립변수만)
X1 = sm.add_constant(df[['${treatment}']])
model1 = sm.OLS(df['${outcome}'], X1).fit(cov_type='HC1')
print("=== Model 1: 기본 모형 ===")
print(model1.summary())`,
          r: `library(lmtest)
library(sandwich)
df <- read.csv('mock_data.csv') |> na.omit()

# 모형 1: 기본 모형
model1 <- lm(${outcome} ~ ${treatment}, data=df)
coeftest(model1, vcov=vcovHC(model1, type="HC1"))`
        }
      },
      {
        id: 'full_model',
        title: '확장 모형 추정 (통제변수 포함)',
        description: '통제변수를 추가하여 핵심 효과의 강건성을 확인합니다.',
        codeTemplate: {
          python: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()

# 모형 2: 통제변수 포함
numeric_cols = df.select_dtypes(include='number').columns.tolist()
control_cols = [c for c in numeric_cols if c not in ['${outcome}', '${treatment}']]
X2 = sm.add_constant(df[['${treatment}'] + control_cols[:5]])
model2 = sm.OLS(df['${outcome}'], X2).fit(cov_type='HC1')
print("=== Model 2: 통제변수 포함 ===")
print(model2.summary())`,
          r: `df <- read.csv('mock_data.csv') |> na.omit()

# 모형 2: 통제변수 포함
model2 <- lm(${outcome} ~ ., data=df)
summary(model2)
coeftest(model2, vcov=vcovHC(model2, type="HC1"))`
        }
      },
      {
        id: 'visualization',
        title: '시각화',
        description: '계수 forest plot과 잔차 진단 그래프를 생성합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
import numpy as np
import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
numeric_df = df.select_dtypes(include='number')
X = sm.add_constant(numeric_df.drop(columns=['${outcome}']))
model = sm.OLS(df['${outcome}'], X).fit(cov_type='HC1')

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
          r: `library(ggplot2)
library(broom)
df <- read.csv('mock_data.csv') |> na.omit()

model <- lm(${outcome} ~ ., data=df)
td <- tidy(model, conf.int=TRUE) |> filter(term != "(Intercept)")

ggplot(td, aes(x=estimate, y=term)) +
  geom_point() +
  geom_errorbarh(aes(xmin=conf.low, xmax=conf.high), height=0.2) +
  geom_vline(xintercept=0, linetype="dashed", color="red") +
  labs(title="회귀 계수 Forest Plot", x="계수 추정치", y="변수") +
  theme_minimal()`
        }
      }
    ],

    causal_inference: [
      {
        id: 'preprocessing',
        title: '패널 데이터 전처리',
        description: '패널 구조(entity × time) 확인, 처리군/통제군 식별, 변수 변환을 수행합니다.',
        codeTemplate: {
          python: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv')

# 패널 구조 확인
if 'entity_id' in df.columns:
    print(f"개체 수: {df['entity_id'].nunique()}")
if 'year' in df.columns:
    print(f"시간 범위: {df['year'].min()} ~ {df['year'].max()}")
print(f"총 관측치: {len(df)}")

# 수치형 변수만 기술통계
numeric_df = df.select_dtypes(include='number')
print("\\n=== 수치형 변수 기술통계 ===")
print(numeric_df.describe().round(3))

# 처리변수 분포 (있는 경우)
if '${treatment}' in df.columns:
    vals = df['${treatment}']
    if vals.dtype in ['int64','float64']:
        print(f"\\n처리변수(${treatment}) 평균: {vals.mean():.4f}")

# 연도별 종속변수 평균
if 'year' in df.columns and '${outcome}' in df.columns:
    print("\\n=== 연도별 ${outcome} 평균 ===")
    print(df.groupby('year')['${outcome}'].mean().round(3))`,
          r: `library(dplyr)
df <- read.csv('mock_data.csv')

# 패널 구조 확인
if ("entity_id" %in% names(df)) cat("개체 수:", n_distinct(df$entity_id), "\\n")
if ("year" %in% names(df)) cat("시간 범위:", min(df$year), "~", max(df$year), "\\n")
cat("총 관측치:", nrow(df), "\\n")

# 수치형 변수 기술통계
summary(df[sapply(df, is.numeric)])

# 연도별 종속변수 평균
if ("year" %in% names(df)) {
  df |> group_by(year) |> summarise(mean_outcome = mean(${outcome}, na.rm=TRUE))
}`
        }
      },
      {
        id: 'baseline_fe',
        title: '기본 고정효과 모형 (Baseline FE)',
        description: '개체 고정효과와 시간 고정효과를 포함한 기본 모형을 추정합니다.',
        codeTemplate: {
          python: `import pandas as pd
import statsmodels.api as sm

df = pd.read_csv('mock_data.csv')

# Entity & Time 더미변수 생성
entity_dummies = pd.get_dummies(df['entity_id'], prefix='entity', drop_first=True, dtype=float)
time_dummies = pd.get_dummies(df['year'], prefix='year', drop_first=True, dtype=float)

# 모형 1: Entity FE + Time FE (더미변수 방식)
X = pd.concat([df[['${treatment}']], entity_dummies, time_dummies], axis=1)
X = sm.add_constant(X)
model1 = sm.OLS(df['${outcome}'], X).fit(cov_type='cluster', cov_kwds={'groups': df['entity_id']})
print("=== Model 1: 기본 고정효과 모형 ===")
print(model1.summary().tables[1])`,
          r: `library(fixest)
df <- read.csv('mock_data.csv')

# 모형 1: Entity FE + Time FE (클러스터 SE)
model1 <- feols(${outcome} ~ ${treatment} | entity_id + year,
                data=df, cluster=~entity_id)
summary(model1)`
        }
      },
      {
        id: 'full_model_fe',
        title: '확장 모형 (통제변수 포함)',
        description: '시간 가변 통제변수를 추가하여 핵심 효과의 강건성을 확인합니다.',
        codeTemplate: {
          python: `import pandas as pd
import statsmodels.api as sm

df = pd.read_csv('mock_data.csv')

# Entity & Time 더미변수 생성
entity_dummies = pd.get_dummies(df['entity_id'], prefix='entity', drop_first=True, dtype=float)
time_dummies = pd.get_dummies(df['year'], prefix='year', drop_first=True, dtype=float)

# 통제변수 선택 (수치형만, 식별자 제외)
numeric_cols = df.select_dtypes(include='number').columns.tolist()
control_cols = [c for c in numeric_cols if c not in ['${outcome}', '${treatment}', 'entity_id', 'year']]

# 모형 2: FE + 통제변수
X = pd.concat([df[['${treatment}'] + control_cols[:4]], entity_dummies, time_dummies], axis=1)
X = sm.add_constant(X)
model2 = sm.OLS(df['${outcome}'], X).fit(cov_type='cluster', cov_kwds={'groups': df['entity_id']})
print("=== Model 2: 통제변수 포함 ===")
print(model2.summary().tables[1])`,
          r: `library(fixest)
df <- read.csv('mock_data.csv')

# 모형 2: 통제변수 포함
model2 <- feols(${outcome} ~ ${treatment} + . | entity_id + year,
                data=df, cluster=~entity_id)
summary(model2)`
        }
      },
      {
        id: 'robustness',
        title: '강건성 검정',
        description: 'Pooled OLS 비교, 하위 표본 분석 등을 수행합니다.',
        codeTemplate: {
          python: `import pandas as pd
import statsmodels.api as sm
from statsmodels.regression.mixed_linear_model import MixedLM

df = pd.read_csv('mock_data.csv')

# 강건성 1: Pooled OLS (고정효과 없이)
X_pooled = sm.add_constant(df[['${treatment}']])
pooled = sm.OLS(df['${outcome}'], X_pooled).fit(cov_type='HC1')
print("=== Pooled OLS ===")
print(f"계수: {pooled.params['${treatment}']:.4f}, p-value: {pooled.pvalues['${treatment}']:.4f}")

# 강건성 2: Random Effects (Mixed Linear Model)
re_model = MixedLM(df['${outcome}'], df[['${treatment}']], groups=df['entity_id'])
re_result = re_model.fit(reml=True)
print(f"\\n=== Random Effects (MixedLM) ===")
print(re_result.summary().tables[1])`,
          r: `library(fixest)
library(plm)
df <- read.csv('mock_data.csv')

# Pooled OLS
pooled <- lm(${outcome} ~ ${treatment}, data=df)
summary(pooled)

# Hausman 검정 (FE vs RE)
fe <- plm(${outcome} ~ ${treatment}, data=df,
          index=c("entity_id","year"), model="within")
re <- plm(${outcome} ~ ${treatment}, data=df,
          index=c("entity_id","year"), model="random")
phtest(fe, re)`
        }
      },
      {
        id: 'visualization',
        title: '시각화',
        description: 'Event-study plot, 계수 비교 forest plot을 생성합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv')

# Event-study style plot: 연도별 종속변수 추이
if 'year' in df.columns and '${treatment}' in df.columns:
    treated = df[df['${treatment}']==1].groupby('year')['${outcome}'].mean()
    control = df[df['${treatment}']==0].groupby('year')['${outcome}'].mean()

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(treated.index, treated.values, 'o-', label='처리군', color='#D32F2F')
    ax.plot(control.index, control.values, 's--', label='통제군', color='#185FA5')
    ax.set_xlabel('연도')
    ax.set_ylabel('${outcome} 평균')
    ax.set_title('처리군 vs 통제군 추이 비교')
    ax.legend()
    plt.tight_layout()
    plt.show()
elif 'year' in df.columns:
    yearly = df.groupby('year')['${outcome}'].mean()
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(yearly.index, yearly.values, 'o-', color='#185FA5')
    ax.set_xlabel('연도')
    ax.set_ylabel('${outcome} 평균')
    ax.set_title('연도별 ${outcome} 추이')
    plt.tight_layout()
    plt.show()`,
          r: `library(ggplot2)
library(dplyr)
df <- read.csv('mock_data.csv')

# 연도별 종속변수 추이
if ("year" %in% names(df) & "${treatment}" %in% names(df)) {
  trends <- df |>
    group_by(year, ${treatment}) |>
    summarise(mean_y = mean(${outcome}), .groups="drop") |>
    mutate(group = ifelse(${treatment}==1, "처리군", "통제군"))

  ggplot(trends, aes(x=year, y=mean_y, color=group)) +
    geom_line(size=1) + geom_point(size=2) +
    labs(title="처리군 vs 통제군 추이 비교", x="연도", y="${outcome}") +
    theme_minimal()
} else if ("year" %in% names(df)) {
  df |> group_by(year) |> summarise(mean_y = mean(${outcome})) |>
    ggplot(aes(x=year, y=mean_y)) + geom_line() + geom_point() +
    labs(title="연도별 ${outcome} 추이") + theme_minimal()
}`
        }
      }
    ],

    spatial: [
      {
        id: 'preprocessing',
        title: '공간 데이터 전처리',
        description: '공간 단위(지역/좌표) 확인, 공간 가중치 행렬 준비, 이상값 탐색을 수행합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(dplyr)
df <- read.csv('mock_data.csv')
summary(df)
cat("\\n고유 지역 수:", n_distinct(df[,1]), "\\n")
hist(df$${outcome}, main="종속변수 분포", xlab="${outcome}")`
        }
      },
      {
        id: 'ols_baseline',
        title: 'OLS 기준 모형 (공간효과 미포함)',
        description: '공간효과를 고려하지 않은 OLS 모형을 추정하여 기준선을 설정합니다.',
        codeTemplate: {
          python: `import statsmodels.api as sm
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
          r: `df <- read.csv('mock_data.csv') |> na.omit()
model_ols <- lm(${outcome} ~ ${treatment}, data=df)
summary(model_ols)
car::durbinWatsonTest(model_ols)`
        }
      },
      {
        id: 'spatial_model',
        title: '공간 회귀 모형 (SAR/SEM)',
        description: '공간 자기상관을 고려한 SAR(Spatial Autoregressive) 또는 SEM(Spatial Error Model)을 추정합니다.',
        codeTemplate: {
          python: `import statsmodels.api as sm
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
print(f"R²: {model_fe.rsquared:.4f}")
print(f"Adj R²: {model_fe.rsquared_adj:.4f}")
print(f"${treatment} 계수: {model_fe.params['${treatment}']:.4f} (p={model_fe.pvalues['${treatment}']:.4f})")`,
          r: `library(lmtest)
df <- read.csv('mock_data.csv') |> na.omit()

# 지역 고정효과 모형
model_fe <- lm(${outcome} ~ ${treatment} + factor(df[,1]), data=df)
coeftest(model_fe, vcov=vcovHC(model_fe, type="HC1"))`
        }
      },
      {
        id: 'visualization',
        title: '공간 패턴 시각화',
        description: '지역별 분포 히트맵, 잔차 패턴 등을 시각화합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
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
axes[0].set_xlabel('평균 ${outcome}')
axes[0].set_title('지역별 ${outcome} 평균')

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
          r: `library(ggplot2)
df <- read.csv('mock_data.csv')

ggplot(df, aes(x=${treatment}, y=${outcome})) +
  geom_point(alpha=0.4) + geom_smooth(method="lm") +
  labs(title="공간 데이터: 핵심 변수 관계") + theme_minimal()`
        }
      }
    ],

    time_series: [
      {
        id: 'preprocessing',
        title: '시계열 데이터 전처리',
        description: '시간 변수 파싱, 정상성(stationarity) 검정, 결측치 보간을 수행합니다.',
        codeTemplate: {
          python: `import pandas as pd
import numpy as np
from scipy import stats

df = pd.read_csv('mock_data.csv')

# 시계열 기본 정보
print("=== 시계열 정보 ===")
print(f"관측치 수: {len(df)}")
print(f"열: {list(df.columns)}")

# 종속변수 시계열 특성
y = df['${outcome}']
print(f"\\n=== ${outcome} 시계열 특성 ===")
print(f"평균: {y.mean():.3f}")
print(f"표준편차: {y.std():.3f}")
print(f"자기상관(lag 1): {y.autocorr(lag=1):.3f}")

# 추세 검정 (Mann-Kendall 근사)
n = len(y)
tau, p_val = stats.kendalltau(range(n), y)
print(f"추세 (Kendall tau): {tau:.3f} (p={p_val:.4f})")`,
          r: `df <- read.csv('mock_data.csv')
y <- ts(df$${outcome})
plot(y, main="시계열 플롯", ylab="${outcome}")
acf(y, main="자기상관함수(ACF)")
pacf(y, main="편자기상관함수(PACF)")`
        }
      },
      {
        id: 'stationarity',
        title: '정상성 검정 (ADF / KPSS)',
        description: '단위근 검정으로 시계열의 정상성 여부를 확인합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(tseries)
df <- read.csv('mock_data.csv')
y <- df$${outcome}

# ADF 검정
adf.test(y)
# 1차 차분 후
adf.test(diff(y))`
        }
      },
      {
        id: 'arima',
        title: 'ARIMA 모형 추정',
        description: 'ARIMA(p,d,q) 모형을 추정하고 잔차 진단을 수행합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(forecast)
df <- read.csv('mock_data.csv')
y <- ts(df$${outcome})

# 자동 ARIMA
model <- auto.arima(y)
summary(model)
checkresiduals(model)`
        }
      },
      {
        id: 'visualization',
        title: '시계열 시각화',
        description: '원 시계열, 예측값, ACF/PACF를 시각화합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
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
          r: `library(forecast)
df <- read.csv('mock_data.csv')
y <- ts(df$${outcome})

par(mfrow=c(2,2))
plot(y, main="원 시계열")
plot(ma(y, 12), main="이동평균")
acf(y, main="ACF")
pacf(y, main="PACF")`
        }
      }
    ],

    machine_learning: [
      {
        id: 'preprocessing',
        title: '데이터 전처리 및 분할',
        description: '특성 스케일링, 결측치 처리, 학습/검증/테스트 세트 분할을 수행합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(caret)
df <- read.csv('mock_data.csv') |> na.omit()
set.seed(42)
idx <- createDataPartition(df$${outcome}, p=0.8, list=FALSE)
train_df <- df[idx,]; test_df <- df[-idx,]
cat("학습:", nrow(train_df), "/ 테스트:", nrow(test_df))`
        }
      },
      {
        id: 'model_training',
        title: '모형 학습 (Random Forest / Gradient Boosting)',
        description: 'Random Forest와 Gradient Boosting 모형을 학습하고 성능을 비교합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
print(f"R²: {r2_score(y_test, rf_pred):.4f}")
print(f"RMSE: {np.sqrt(mean_squared_error(y_test, rf_pred)):.4f}")

# Gradient Boosting
gb = GradientBoostingRegressor(n_estimators=100, random_state=42, max_depth=3)
gb.fit(X_train, y_train)
gb_pred = gb.predict(X_test)
print("\\n=== Gradient Boosting ===")
print(f"R²: {r2_score(y_test, gb_pred):.4f}")
print(f"RMSE: {np.sqrt(mean_squared_error(y_test, gb_pred)):.4f}")`,
          r: `library(randomForest)
library(caret)
df <- read.csv('mock_data.csv') |> na.omit()
set.seed(42)
idx <- createDataPartition(df$${outcome}, p=0.8, list=FALSE)
train_df <- df[idx,]; test_df <- df[-idx,]

rf <- randomForest(${outcome} ~ ., data=train_df, ntree=100)
print(rf)
importance(rf)`
        }
      },
      {
        id: 'feature_importance',
        title: '특성 중요도 분석',
        description: '모형의 특성 중요도를 분석하여 핵심 예측 변수를 식별합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
    bar = '█' * int(val * 50)
    print(f"  {feat:20s}: {val:.4f} {bar}")`,
          r: `library(randomForest)
df <- read.csv('mock_data.csv') |> na.omit()
rf <- randomForest(${outcome} ~ ., data=df, ntree=100)
varImpPlot(rf, main="특성 중요도")`
        }
      },
      {
        id: 'visualization',
        title: '모형 성능 시각화',
        description: '예측 vs 실측, 잔차 분포, 특성 중요도 차트를 시각화합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
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
axes[0].set_title(f'예측 vs 실측 (R²={r2_score(y_test,pred):.3f})')

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
          r: `library(ggplot2)
df <- read.csv('mock_data.csv') |> na.omit()
plot(df$${treatment}, df$${outcome}, main="핵심 변수 관계", pch=20, col=rgb(0,0,1,0.3))`
        }
      }
    ],

    causal_ml: [
      {
        id: 'preprocessing',
        title: '인과 ML 데이터 전처리',
        description: '처리군/통제군 확인, 공변량 균형, 성향점수 추정 준비를 합니다.',
        codeTemplate: {
          python: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()

# 처리 변수 분포
print("=== 처리 변수 분포 ===")
treat_col = '${treatment}'
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
    balance = '✅' if abs(smd) < 0.1 else '⚠️'
    print(f"  {c:20s}: SMD = {smd:+.3f} {balance}")`,
          r: `library(dplyr)
df <- read.csv('mock_data.csv') |> na.omit()
table(df$${treatment})
cat("처리율:", mean(df$${treatment}), "\\n")`
        }
      },
      {
        id: 'propensity_score',
        title: '성향점수 추정 (Propensity Score)',
        description: '로지스틱 회귀로 성향점수를 추정하고 매칭/가중 준비를 합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(MatchIt)
df <- read.csv('mock_data.csv') |> na.omit()
m <- matchit(${treatment} ~ ., data=df[,!names(df) %in% c("${outcome}")], method="nearest")
summary(m)`
        }
      },
      {
        id: 'causal_forest',
        title: '이질적 처리효과 (CATE) 추정',
        description: '처리효과의 이질성을 분석합니다. (Causal Forest 개념 기반)',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(grf)
df <- read.csv('mock_data.csv') |> na.omit()
X <- as.matrix(df[,!names(df) %in% c("${outcome}","${treatment}")])
cf <- causal_forest(X, df$${outcome}, df$${treatment})
print(average_treatment_effect(cf))`
        }
      },
      {
        id: 'visualization',
        title: '인과 추론 시각화',
        description: '성향점수 분포, CATE 분포, 공변량 균형 차트를 시각화합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
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
          r: `df <- read.csv('mock_data.csv') |> na.omit()
boxplot(df$${outcome} ~ df$${treatment}, main="처리군 vs 통제군", xlab="${treatment}", ylab="${outcome}")`
        }
      }
    ],

    bayesian: [
      {
        id: 'preprocessing',
        title: '데이터 준비 및 사전분포 설정',
        description: '데이터를 확인하고 사전분포(prior) 설정을 위한 정보를 수집합니다.',
        codeTemplate: {
          python: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv').dropna()

# 데이터 기본 정보
print("=== 데이터 요약 ===")
print(f"표본 크기: {len(df)}")
print(df.describe().round(3))

# 종속변수 분포 특성 (사전분포 설정 참고)
y = df['${outcome}']
print(f"\\n=== ${outcome} 분포 특성 ===")
print(f"평균: {y.mean():.3f}")
print(f"표준편차: {y.std():.3f}")
print(f"왜도: {y.skew():.3f}")
print(f"첨도: {y.kurtosis():.3f}")

# 약한 정보적 사전분포 제안
print("\\n=== 추천 사전분포 ===")
print(f"절편: Normal({y.mean():.1f}, {y.std()*2:.1f})")
print(f"회귀계수: Normal(0, {y.std():.1f})")
print(f"오차 SD: HalfCauchy(0, {y.std():.1f})")`,
          r: `df <- read.csv('mock_data.csv') |> na.omit()
summary(df)
hist(df$${outcome}, main="종속변수 분포", xlab="${outcome}", prob=TRUE)
curve(dnorm(x, mean(df$${outcome}), sd(df$${outcome})), add=TRUE, col="red")`
        }
      },
      {
        id: 'frequentist_baseline',
        title: 'MLE 기준 모형 (빈도주의 비교용)',
        description: '베이지안 결과와 비교하기 위한 빈도주의 MLE 기준 모형을 추정합니다.',
        codeTemplate: {
          python: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()

X = sm.add_constant(df[['${treatment}']])
model = sm.OLS(df['${outcome}'], X).fit()
print("=== MLE 기준 모형 (비교용) ===")
print(model.summary())
print(f"\\n비교 포인트:")
print(f"  ${treatment} 계수: {model.params['${treatment}']:.4f}")
print(f"  95% CI: [{model.conf_int().loc['${treatment}',0]:.4f}, {model.conf_int().loc['${treatment}',1]:.4f}]")`,
          r: `df <- read.csv('mock_data.csv') |> na.omit()
model <- lm(${outcome} ~ ${treatment}, data=df)
summary(model)
confint(model)`
        }
      },
      {
        id: 'bayesian_estimation',
        title: '베이지안 사후분포 추정 (MCMC 근사)',
        description: '메트로폴리스-헤이스팅스 MCMC로 사후분포를 근사 추정합니다.',
        codeTemplate: {
          python: `import numpy as np
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
y = df['${outcome}'].values
x = df['${treatment}'].values
n = len(y)

# 간단한 베이지안 선형회귀 (정규-정규 결합 사후분포)
# y = a + b*x + e, e ~ N(0, sigma²)
# 사전분포: a ~ N(y_mean, 10²), b ~ N(0, 10²), sigma ~ HalfCauchy

X = np.column_stack([np.ones(n), x])
# 정규 사전분포 + 정규 우도 → 정규 사후분포 (해석적 해)
prior_mean = np.array([y.mean(), 0])
prior_var = np.diag([100, 100])

sigma2 = np.var(y - X @ np.linalg.lstsq(X, y, rcond=None)[0])
post_var = np.linalg.inv(np.linalg.inv(prior_var) + X.T @ X / sigma2)
post_mean = post_var @ (np.linalg.inv(prior_var) @ prior_mean + X.T @ y / sigma2)

print("=== 베이지안 사후분포 (해석적 해) ===")
print(f"절편: {post_mean[0]:.4f} ± {np.sqrt(post_var[0,0]):.4f}")
print(f"${treatment}: {post_mean[1]:.4f} ± {np.sqrt(post_var[1,1]):.4f}")

# 95% 신용구간
from scipy import stats
for i, name in enumerate(['절편', '${treatment}']):
    lo = post_mean[i] - 1.96*np.sqrt(post_var[i,i])
    hi = post_mean[i] + 1.96*np.sqrt(post_var[i,i])
    print(f"  {name} 95% CI: [{lo:.4f}, {hi:.4f}]")

# P(b > 0) 계산
prob_positive = 1 - stats.norm.cdf(0, post_mean[1], np.sqrt(post_var[1,1]))
print(f"\\nP(${treatment} > 0) = {prob_positive:.4f}")`,
          r: `library(BayesFactor)
df <- read.csv('mock_data.csv') |> na.omit()
bf <- regressionBF(${outcome} ~ ${treatment}, data=df)
print(bf)
posterior(bf, iterations=5000) |> summary()`
        }
      },
      {
        id: 'visualization',
        title: '사후분포 시각화',
        description: '사전분포/사후분포 비교, 신용구간, 수렴 진단을 시각화합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
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

# 사전분포 vs 사후분포 (${treatment} 계수)
x_range = np.linspace(post_mean[1]-4*np.sqrt(post_var[1,1]), post_mean[1]+4*np.sqrt(post_var[1,1]), 200)
prior_pdf = stats.norm.pdf(x_range, 0, 10)
post_pdf = stats.norm.pdf(x_range, post_mean[1], np.sqrt(post_var[1,1]))

axes[0].plot(x_range, prior_pdf, 'b--', label='사전분포', linewidth=2)
axes[0].plot(x_range, post_pdf, 'r-', label='사후분포', linewidth=2)
axes[0].axvline(0, color='gray', linestyle=':', alpha=0.5)
axes[0].fill_between(x_range, post_pdf, alpha=0.2, color='red')
axes[0].set_xlabel('${treatment} 계수')
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
          r: `# R 시각화
df <- read.csv('mock_data.csv') |> na.omit()
model <- lm(${outcome} ~ ${treatment}, data=df)
plot(density(rnorm(5000, coef(model)[2], summary(model)$coef[2,2])), main="사후분포 (정규 근사)")`
        }
      }
    ],

    sem: [
      {
        id: 'preprocessing',
        title: 'SEM 데이터 준비',
        description: '잠재변수 지표 확인, 정규성 검정, 상관행렬 분석을 수행합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
    normal = '✅' if p > 0.05 else '⚠️'
    print(f"  {col}: Shapiro p={p:.4f} {normal}")`,
          r: `library(psych)
df <- read.csv('mock_data.csv') |> na.omit()
describe(df)
cor(df[sapply(df, is.numeric)]) |> round(3)
mardia(df[sapply(df, is.numeric)])`
        }
      },
      {
        id: 'cfa',
        title: '확인적 요인분석 (CFA)',
        description: '측정 모형의 타당성을 확인합니다. 요인적재량, 적합도 지수를 분석합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(lavaan)
df <- read.csv('mock_data.csv') |> na.omit()
# CFA 모형 정의 (변수에 맞게 수정 필요)
cfa_model <- '
  factor1 =~ x1 + x2 + x3
  factor2 =~ x4 + x5 + x6
'
fit <- cfa(cfa_model, data=df)
summary(fit, fit.measures=TRUE, standardized=TRUE)`
        }
      },
      {
        id: 'path_model',
        title: '경로 모형 / 구조 모형 추정',
        description: '잠재변수 간 구조적 관계(경로)를 추정합니다.',
        codeTemplate: {
          python: `import pandas as pd
import numpy as np
import statsmodels.api as sm

df = pd.read_csv('mock_data.csv').dropna()
numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

# 경로 모형 근사 (다중 회귀 체인)
# Path 1: mediator ~ treatment
print("=== 경로 분석 (다중 회귀 근사) ===")
if len(numeric_cols) >= 3:
    mediator = numeric_cols[1] if numeric_cols[1] != '${outcome}' else numeric_cols[2]

    # 경로 a: treatment → mediator
    X_a = sm.add_constant(df[['${treatment}']])
    path_a = sm.OLS(df[mediator], X_a).fit()
    a = path_a.params['${treatment}']
    print(f"경로 a ({treatment} → {mediator}): {a:.4f} (p={path_a.pvalues['${treatment}']:.4f})")

    # 경로 b + c': mediator + treatment → outcome
    X_bc = sm.add_constant(df[['${treatment}', mediator]])
    path_bc = sm.OLS(df['${outcome}'], X_bc).fit()
    b = path_bc.params[mediator]
    c_prime = path_bc.params['${treatment}']
    print(f"경로 b ({mediator} → ${outcome}): {b:.4f} (p={path_bc.pvalues[mediator]:.4f})")
    print(f"직접효과 c' (${treatment} → ${outcome}): {c_prime:.4f} (p={path_bc.pvalues['${treatment}']:.4f})")
    print(f"간접효과 a×b: {a*b:.4f}")
    print(f"총효과 c'+a×b: {c_prime + a*b:.4f}")`,
          r: `library(lavaan)
df <- read.csv('mock_data.csv') |> na.omit()
sem_model <- '
  ${outcome} ~ ${treatment}
'
fit <- sem(sem_model, data=df)
summary(fit, fit.measures=TRUE)`
        }
      },
      {
        id: 'visualization',
        title: 'SEM 결과 시각화',
        description: '경로 다이어그램, 적합도 비교, 요인적재량 차트를 시각화합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
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
          r: `library(lavaan)
library(semPlot)
# semPaths(fit, what="est", layout="tree")`
        }
      }
    ],

    survival: [
      {
        id: 'preprocessing',
        title: '생존 데이터 전처리',
        description: '생존 시간, 사건 발생 여부, 중도절단 패턴을 확인합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(survival)
df <- read.csv('mock_data.csv') |> na.omit()
surv_obj <- Surv(df$${outcome}, df$${treatment})
summary(surv_obj)`
        }
      },
      {
        id: 'kaplan_meier',
        title: 'Kaplan-Meier 생존 곡선',
        description: '비모수적 생존 함수를 추정하고 집단 간 비교를 수행합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(survival)
library(survminer)
df <- read.csv('mock_data.csv') |> na.omit()
km <- survfit(Surv(${outcome}, ${treatment}) ~ 1, data=df)
summary(km)
ggsurvplot(km, data=df, risk.table=TRUE)`
        }
      },
      {
        id: 'cox_regression',
        title: 'Cox 비례위험 모형',
        description: '공변량의 위험비(Hazard Ratio)를 추정합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(survival)
df <- read.csv('mock_data.csv') |> na.omit()
cox <- coxph(Surv(${outcome}, ${treatment}) ~ ., data=df)
summary(cox)`
        }
      },
      {
        id: 'visualization',
        title: '생존 분석 시각화',
        description: 'KM 곡선, 위험비 Forest Plot을 시각화합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
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
          r: `library(survminer); library(survival)
df <- read.csv('mock_data.csv') |> na.omit()
ggsurvplot(survfit(Surv(${outcome},${treatment})~1, data=df), risk.table=TRUE)`
        }
      }
    ],

    meta_analysis: [
      {
        id: 'preprocessing',
        title: '메타분석 데이터 준비',
        description: '개별 연구 효과크기(ES), 표준오차, 표본크기를 확인합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(metafor)
df <- read.csv('mock_data.csv') |> na.omit()
str(df)
summary(df)`
        }
      },
      {
        id: 'fixed_effects',
        title: '고정효과 메타분석',
        description: '역분산 가중 고정효과 모형으로 통합 효과크기를 추정합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(metafor)
df <- read.csv('mock_data.csv') |> na.omit()
rma(yi=${outcome}, sei=${treatment}, data=df, method="FE")`
        }
      },
      {
        id: 'random_effects',
        title: '랜덤효과 메타분석 + 이질성 검정',
        description: 'DerSimonian-Laird 랜덤효과 모형과 I², Q 검정을 수행합니다.',
        codeTemplate: {
          python: `import pandas as pd
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

# I² 통계량
I2 = max(0, (Q - Q_df) / Q) * 100

# DerSimonian-Laird τ²
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
print(f"I² = {I2:.1f}%")
print(f"τ² = {tau2:.4f}")

heterogeneity = '낮음' if I2 < 25 else '중간' if I2 < 75 else '높음'
print(f"이질성 수준: {heterogeneity}")`,
          r: `library(metafor)
df <- read.csv('mock_data.csv') |> na.omit()
re <- rma(yi=${outcome}, sei=${treatment}, data=df, method="DL")
summary(re)`
        }
      },
      {
        id: 'visualization',
        title: 'Forest Plot & Funnel Plot',
        description: '개별 연구 효과크기 Forest Plot과 출판 편향 Funnel Plot을 시각화합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
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
          r: `library(metafor)
df <- read.csv('mock_data.csv') |> na.omit()
re <- rma(yi=${outcome}, sei=${treatment}, data=df, method="DL")
par(mfrow=c(1,2))
forest(re, main="Forest Plot")
funnel(re, main="Funnel Plot")`
        }
      }
    ],

    unstructured_data: [
      {
        id: 'preprocessing',
        title: '비정형 데이터 전처리',
        description: '텍스트 정제, 토큰화, TF-IDF 벡터화 등을 수행합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `library(tm); library(tidytext)
df <- read.csv('mock_data.csv')
str(df)
summary(df)`
        }
      },
      {
        id: 'feature_extraction',
        title: '특성 추출 (TF-IDF / 임베딩)',
        description: '비정형 데이터에서 수치적 특성을 추출합니다.',
        codeTemplate: {
          python: `import pandas as pd
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
          r: `df <- read.csv('mock_data.csv') |> na.omit()
pca <- prcomp(df[sapply(df, is.numeric)], scale.=TRUE)
summary(pca)
biplot(pca)`
        }
      },
      {
        id: 'model',
        title: '모형 추정',
        description: '추출된 특성을 활용하여 분류/회귀 모형을 추정합니다.',
        codeTemplate: {
          python: `import pandas as pd
import numpy as np
import statsmodels.api as sm

df = pd.read_csv('mock_data.csv').dropna()
numeric_df = df.select_dtypes(include=[np.number])

# 회귀 모형
X = sm.add_constant(numeric_df.drop(columns=['${outcome}']))
model = sm.OLS(numeric_df['${outcome}'], X).fit(cov_type='HC1')
print("=== 모형 추정 결과 ===")
print(model.summary())`,
          r: `df <- read.csv('mock_data.csv') |> na.omit()
model <- lm(${outcome} ~ ., data=df[sapply(df, is.numeric)])
summary(model)`
        }
      },
      {
        id: 'visualization',
        title: '시각화',
        description: '주성분 산점도, 변수 관계 시각화를 생성합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
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
          r: `df <- read.csv('mock_data.csv') |> na.omit()
pairs(df[sapply(df, is.numeric)][,1:min(5, ncol(df))])`
        }
      }
    ],

    experimental: [
      {
        id: 'preprocessing',
        title: '실험 데이터 전처리',
        description: '실험 집단 확인, 요인 수준, 표본 크기 균형을 점검합니다.',
        codeTemplate: {
          python: `import pandas as pd
df = pd.read_csv('mock_data.csv')
print("=== 집단별 표본 크기 ===")
print(df.groupby('group').size())
print("\\n=== 집단별 기술통계 ===")
print(df.groupby('group')['${outcome}'].describe().round(3))`,
          r: `df <- read.csv('mock_data.csv')
table(df$group)
tapply(df$${outcome}, df$group, summary)`
        }
      },
      {
        id: 'anova',
        title: 'ANOVA / t-검정',
        description: '집단 간 차이를 검정합니다.',
        codeTemplate: {
          python: `import pandas as pd
from scipy import stats
import pingouin as pg

df = pd.read_csv('mock_data.csv')

# 일원 ANOVA
anova_result = pg.anova(data=df, dv='${outcome}', between='group')
print("=== ANOVA ===")
print(anova_result)

# 사후 검정 (Tukey HSD)
posthoc = pg.pairwise_tukey(data=df, dv='${outcome}', between='group')
print("\\n=== 사후 검정 (Tukey HSD) ===")
print(posthoc)`,
          r: `df <- read.csv('mock_data.csv')
model <- aov(${outcome} ~ group, data=df)
summary(model)
TukeyHSD(model)`
        }
      },
      {
        id: 'effect_size',
        title: '효과 크기 계산',
        description: "Cohen's d, η² 등 효과 크기를 계산합니다.",
        codeTemplate: {
          python: `import pingouin as pg
import pandas as pd

df = pd.read_csv('mock_data.csv')

# η² (이타-제곱)
anova = pg.anova(data=df, dv='${outcome}', between='group', effsize='np2')
print("=== 효과 크기 (partial η²) ===")
print(anova[['Source','np2']])`,
          r: `library(effectsize)
model <- aov(${outcome} ~ group, data=df)
eta_squared(model, partial=TRUE)`
        }
      },
      {
        id: 'visualization',
        title: '시각화',
        description: '집단별 비교 박스플롯, 바이올린 플롯을 생성합니다.',
        codeTemplate: {
          python: `import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd

df = pd.read_csv('mock_data.csv')

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# 박스플롯
sns.boxplot(data=df, x='group', y='${outcome}', ax=axes[0])
axes[0].set_title('집단별 ${outcome} 분포')

# 바이올린 플롯
sns.violinplot(data=df, x='group', y='${outcome}', ax=axes[1])
axes[1].set_title('집단별 ${outcome} 분포 (바이올린)')

plt.tight_layout()
plt.show()`,
          r: `library(ggplot2)
df <- read.csv('mock_data.csv')

ggplot(df, aes(x=group, y=${outcome}, fill=group)) +
  geom_boxplot(alpha=0.7) +
  geom_jitter(width=0.1, alpha=0.3) +
  labs(title="집단별 비교") +
  theme_minimal()`
        }
      }
    ]
  };

  // For categories not explicitly defined, provide generic steps
  const defaultSteps = [
    {
      id: 'preprocessing',
      title: '데이터 전처리',
      description: '분석에 필요한 데이터 변환 및 전처리를 수행합니다.',
      codeTemplate: {
        python: `import pandas as pd
import numpy as np

df = pd.read_csv('mock_data.csv')
df = df.dropna()
print(f"전처리 후: {df.shape}")
print(df.head())`,
        r: `df <- read.csv('mock_data.csv') |> na.omit()
str(df)
head(df)`
      }
    },
    {
      id: 'baseline',
      title: '기본 모형 추정',
      description: '핵심 독립변수만 포함한 기본 모형을 추정합니다.',
      codeTemplate: {
        python: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
X = sm.add_constant(df[['${treatment}']])
model = sm.OLS(df['${outcome}'], X).fit()
print(model.summary())`,
        r: `df <- read.csv('mock_data.csv') |> na.omit()
model <- lm(${outcome} ~ ${treatment}, data=df)
summary(model)`
      }
    },
    {
      id: 'full_model',
      title: '확장 모형 추정',
      description: '통제변수를 추가한 확장 모형을 추정합니다.',
      codeTemplate: {
        python: `import statsmodels.api as sm
import pandas as pd

df = pd.read_csv('mock_data.csv').dropna()
numeric_df = df.select_dtypes(include='number')
X = sm.add_constant(numeric_df.drop(columns=['${outcome}']))
model = sm.OLS(df['${outcome}'], X).fit(cov_type='HC1')
print(model.summary())`,
        r: `df <- read.csv('mock_data.csv') |> na.omit()
model <- lm(${outcome} ~ ., data=df)
summary(model)`
      }
    },
    {
      id: 'visualization',
      title: '시각화',
      description: '분석 결과를 시각화합니다.',
      codeTemplate: {
        python: `import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_csv('mock_data.csv')

# 핵심 변수 산점도
plt.figure(figsize=(8,5))
plt.scatter(df['${treatment}'], df['${outcome}'], alpha=0.5)
plt.xlabel('${treatment}')
plt.ylabel('${outcome}')
plt.title('핵심 변수 관계')
plt.show()`,
        r: `library(ggplot2)
df <- read.csv('mock_data.csv')

ggplot(df, aes(x=${treatment}, y=${outcome})) +
  geom_point(alpha=0.5) +
  geom_smooth(method="lm") +
  labs(title="핵심 변수 관계") +
  theme_minimal()`
      }
    }
  ];

  return stepsMap[category] || defaultSteps;
}
