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

# 기술통계
print("=== 기술통계 ===")
print(df.describe().round(3))

# 변수별 결측치 확인
print("\\n=== 결측치 ===")
print(df.isnull().sum())

# 상관행렬 (주요 변수)
print("\\n=== 상관행렬 ===")
print(df.corr().round(3))`,
        r: `library(dplyr)

# 데이터 로드
df <- read.csv('mock_data.csv')

# 기술통계
summary(df)

# 결측치 확인
sapply(df, function(x) sum(is.na(x)))

# 상관행렬
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
control_cols = [c for c in df.columns if c not in ['${outcome}', '${treatment}']]
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
X = sm.add_constant(df.drop(columns=['${outcome}']))
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
print(f"개체 수: {df['entity_id'].nunique()}")
print(f"시간 범위: {df['year'].min()} ~ {df['year'].max()}")
print(f"총 관측치: {len(df)}")

# 처리군/통제군 분포
print(f"\\n처리군 비율: {df['treatment'].mean():.2%}")

# 시간별 처리율 변화
print("\\n=== 연도별 처리율 ===")
print(df.groupby('year')['treatment'].mean().round(3))`,
          r: `library(dplyr)
df <- read.csv('mock_data.csv')

# 패널 구조 확인
cat("개체 수:", n_distinct(df$entity_id), "\\n")
cat("시간 범위:", min(df$year), "~", max(df$year), "\\n")
cat("총 관측치:", nrow(df), "\\n")

# 처리군 비율
cat("처리군 비율:", mean(df$treatment), "\\n")

# 연도별 처리율
df |> group_by(year) |> summarise(treatment_rate = mean(treatment))`
        }
      },
      {
        id: 'baseline_fe',
        title: '기본 고정효과 모형 (Baseline FE)',
        description: '개체 고정효과와 시간 고정효과를 포함한 기본 모형을 추정합니다.',
        codeTemplate: {
          python: `import pandas as pd
from linearmodels.panel import PanelOLS

df = pd.read_csv('mock_data.csv')
df = df.set_index(['entity_id', 'year'])

# 모형 1: Entity FE + Time FE
model1 = PanelOLS(df['${outcome}'], df[['${treatment}']],
                   entity_effects=True, time_effects=True)
result1 = model1.fit(cov_type='clustered', cluster_entity=True)
print("=== Model 1: 기본 고정효과 모형 ===")
print(result1)`,
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
from linearmodels.panel import PanelOLS

df = pd.read_csv('mock_data.csv')
df = df.set_index(['entity_id', 'year'])

control_cols = [c for c in df.columns if c not in ['${outcome}', '${treatment}']]

# 모형 2: FE + 통제변수
exog = df[['${treatment}'] + control_cols[:4]]
model2 = PanelOLS(df['${outcome}'], exog,
                   entity_effects=True, time_effects=True)
result2 = model2.fit(cov_type='clustered', cluster_entity=True)
print("=== Model 2: 통제변수 포함 ===")
print(result2)`,
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
from linearmodels.panel import PanelOLS, RandomEffects

df = pd.read_csv('mock_data.csv')
df_panel = df.set_index(['entity_id', 'year'])

# 강건성 1: Pooled OLS vs FE 비교
X_pooled = sm.add_constant(df[['${treatment}']])
pooled = sm.OLS(df['${outcome}'], X_pooled).fit(cov_type='HC1')
print("=== Pooled OLS ===")
print(f"계수: {pooled.params['${treatment}']:.4f}, p-value: {pooled.pvalues['${treatment}']:.4f}")

# 강건성 2: Random Effects
re_model = RandomEffects(df_panel['${outcome}'], df_panel[['${treatment}']])
re_result = re_model.fit()
print(f"\\n=== Random Effects ===")
print(re_result)`,
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

# Event-study style plot
# 처리 전후 시점별 처리효과 시각화
df = pd.read_csv('mock_data.csv')

# 시간별 평균 비교 (처리군 vs 통제군)
treated = df[df['treatment']==1].groupby('year')['${outcome}'].mean()
control = df[df['treatment']==0].groupby('year')['${outcome}'].mean()

fig, ax = plt.subplots(figsize=(8, 5))
ax.plot(treated.index, treated.values, 'o-', label='처리군', color='#D32F2F')
ax.plot(control.index, control.values, 's--', label='통제군', color='#185FA5')
ax.set_xlabel('연도')
ax.set_ylabel('${outcome} 평균')
ax.set_title('처리군 vs 통제군 추이 비교')
ax.legend()
plt.tight_layout()
plt.show()`,
          r: `library(ggplot2)
library(dplyr)
df <- read.csv('mock_data.csv')

# 처리군/통제군 연도별 평균 비교
trends <- df |>
  group_by(year, treatment) |>
  summarise(mean_y = mean(${outcome}), .groups="drop") |>
  mutate(group = ifelse(treatment==1, "처리군", "통제군"))

ggplot(trends, aes(x=year, y=mean_y, color=group, linetype=group)) +
  geom_line(size=1) + geom_point(size=2) +
  labs(title="처리군 vs 통제군 추이 비교", x="연도", y="${outcome} 평균") +
  theme_minimal() + scale_color_manual(values=c("통제군"="#185FA5","처리군"="#D32F2F"))`
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
X = sm.add_constant(df.drop(columns=['${outcome}']))
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
