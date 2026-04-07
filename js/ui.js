/* ============================================================================
   ResearchMethodAgent v5.0 - UI Module
   ============================================================================
   역할: HTML 요소 관리, 사용자 상호작용 처리, 분석 결과 렌더링
   - 4개 탭 전환 (논문개요, 실습, 리뷰, Q&A)
   - 로딩 상태 업데이트
   - PDF 업로드 및 분석 파이프라인 UI
   ============================================================================ */

import { generateMockData, computeStats, downloadCSV } from './mockdata.js';
import {
  loadAnalysisSteps,
  executeStep,
  loadReview,
  sendQnA,
  getState,
  getMethods,
  getDataStructure,
  getPaperContext,
  getPaperText,
  resetState,
  requestCodeAssistant
} from './pipeline.js';
import { escapeHtml, escapeCode, copyToClipboard } from './utils.js';
import { initPyodide, runPython, isPyodideReady } from './pyodide-runner.js';
import {
  renderApaTable,
  renderApaFigures,
  renderApaText,
  generateApaReport,
} from './apa-renderer.js';

/* ============================================================================
   DOM 헬퍼 & 상태 관리
   ============================================================================ */

const $ = (id) => document.getElementById(id);
let currentMethodIndex = 0;
let currentLanguage = 'python';
let mockDataCache = null;
/** @type {boolean} Pyodide 초기화 중 여부 */
let pyodideInitializing = false;

/* ============================================================================
   뷰 전환 함수 (UI 표시/숨김)
   ============================================================================ */

export function showLoadingView() {
  // 설정 카드 숨김
  const configCard = $('config-card');
  if (configCard) configCard.style.display = 'none';

  // 입력 카드 숨김
  const inputCard = $('input-card');
  if (inputCard) inputCard.style.display = 'none';

  // 로딩 카드 표시
  const loadingCard = $('loading-card');
  if (loadingCard) loadingCard.style.display = 'block';

  // 결과 영역 숨김
  const resultWrap = $('result-wrap');
  if (resultWrap) resultWrap.style.display = 'none';
}

export function showInputView() {
  // 설정 카드 표시
  const configCard = $('config-card');
  if (configCard) configCard.style.display = 'block';

  // 입력 카드 표시
  const inputCard = $('input-card');
  if (inputCard) inputCard.style.display = 'block';

  // 로딩 카드 숨김
  const loadingCard = $('loading-card');
  if (loadingCard) loadingCard.style.display = 'none';

  // 결과 영역 숨김
  const resultWrap = $('result-wrap');
  if (resultWrap) resultWrap.style.display = 'none';
}

export function showResultView() {
  // 설정 카드 숨김
  const configCard = $('config-card');
  if (configCard) configCard.style.display = 'none';

  // 입력 카드 숨김
  const inputCard = $('input-card');
  if (inputCard) inputCard.style.display = 'none';

  // 로딩 카드 숨김
  const loadingCard = $('loading-card');
  if (loadingCard) loadingCard.style.display = 'none';

  // 결과 영역 표시
  const resultWrap = $('result-wrap');
  if (resultWrap) resultWrap.style.display = 'block';
}

/* ============================================================================
   로딩 상태 업데이트
   ============================================================================ */

export function updateLoadingStep(stepIndex, status) {
  // status: 'running' | 'done'
  const steps = document.querySelectorAll('.loading-step');
  if (steps.length > stepIndex) {
    const step = steps[stepIndex];
    const icon = step.querySelector('.loading-step-icon');
    if (status === 'running') {
      step.classList.add('running');
      step.classList.remove('done');
      if (icon) icon.textContent = '⏳';
    } else if (status === 'done') {
      step.classList.remove('running');
      step.classList.add('done');
      if (icon) icon.textContent = '✅';
    }
  }
}

export function setLoadingMessage(message) {
  const msgEl = $('loading-message');
  if (msgEl) msgEl.textContent = message;
}

export function showStatus(message) {
  // 간단한 상태 메시지 표시 (alert 또는 알림 div)
  alert(message);
}

/* ============================================================================
   PDF 업로드 관련 UI
   ============================================================================ */

export function showPdfFileName(name) {
  const fileNameEl = $('file-name');
  if (fileNameEl) fileNameEl.textContent = name;
}

export function showPdfProgress(message) {
  const fileNameEl = $('file-name');
  if (fileNameEl) fileNameEl.textContent = message;
}

export function showPdfSuccess(pages, sizeKB) {
  const fileNameEl = $('file-name');
  if (fileNameEl) {
    // sizeKB가 1024 이상이면 MB로 표시
    const sizeStr = sizeKB >= 1024
      ? `${(sizeKB / 1024).toFixed(1)}MB`
      : `${sizeKB}KB`;
    fileNameEl.textContent = `✅ 준비 완료: ${pages}페이지, ${sizeStr}`;
  }
}

export function showPdfError(message) {
  const fileNameEl = $('file-name');
  if (fileNameEl) {
    fileNameEl.textContent = `❌ 오류: ${message}`;
    fileNameEl.style.color = '#e74c3c';
  }
}

/* ============================================================================
   초기 결과 렌더링 (Tab 1: 논문 개요 & 데이터 구조)
   ============================================================================ */

export function renderInitialResult(docResult, dataStructure) {
  try {
    const meta = docResult.metadata || {};
    const ctx = docResult.paper_context || {};

    // 논문 정보 렌더링
    const titleEl = $('r-title');
    const metaEl = $('r-meta');
    const contextEl = $('r-context');

    if (titleEl) titleEl.textContent = meta.title || '논문 제목';
    if (metaEl) metaEl.textContent = meta.summary || '';

    // 컨텍스트 태그
    if (contextEl) {
      let ctxHtml = '';
      if (ctx.domain)               ctxHtml += `<span class="context-tag">📚 ${escapeHtml(ctx.domain)}</span>`;
      if (ctx.research_type)        ctxHtml += `<span class="context-tag">🔬 ${escapeHtml(ctx.research_type)}</span>`;
      if (ctx.data_characteristics) ctxHtml += `<span class="context-tag">📊 ${escapeHtml(ctx.data_characteristics)}</span>`;
      if (ctx.analysis_category)    ctxHtml += `<span class="context-tag">🏷️ ${escapeHtml(ctx.analysis_category)}</span>`;
      if (ctx.category_evidence)    ctxHtml += `<span class="context-tag context-tag-evidence" title="${escapeHtml(ctx.category_evidence)}">📌 ${escapeHtml(ctx.category_evidence)}</span>`;
      contextEl.innerHTML = ctxHtml;
    }

    // 섹션 인덱스 렌더링
    renderSectionIndex(docResult.section_index || []);

    // 데이터 구조 카드 렌더링
    renderDataStructureCard(dataStructure);

    // 메소드 네비게이션 렌더링
    renderMethodNav();

    // 메소드 선택 핸들러 설정
    setupMethodNavHandlers();

    // 탭 전환 핸들러 설정
    setupTabHandlers();

    // 언어 선택 핸들러 설정
    setupLanguageToggleHandlers();

    // Q&A 입력 핸들러 설정
    setupQnAHandlers();

    // 홈 링크 핸들러
    setupHomeLink();

    // 프린트 버튼 핸들러
    setupPrintButton();

    // Mock 데이터 생성 핸들러
    setupMockDataGeneration();

    // 리뷰 핸들러
    setupReviewHandlers();

    showResultView();

    // === 자동 데이터 생성: dataStructure가 있으면 바로 500행 생성 ===
    if (dataStructure && dataStructure.variables && dataStructure.variables.length > 0) {
      try {
        mockDataCache = generateMockData(dataStructure, 500, ctx.analysis_category || null);
        const statusEl = $('mockdata-status');
        if (statusEl) {
          statusEl.innerHTML = `<p style="color: #27ae60;">✅ 데이터 자동 생성 완료 (${mockDataCache.data.length}행 × ${mockDataCache.variables.length}변수)</p>`;
        }
        const downloadBtn = $('download-csv-btn');
        if (downloadBtn) downloadBtn.style.display = 'inline-block';
        renderDataPreview(mockDataCache.data, mockDataCache.variables);
        renderVariableTable(mockDataCache.variables);
      } catch (autoErr) {
        console.warn('자동 데이터 생성 실패 (수동 생성 가능):', autoErr.message);
      }
    }
  } catch (error) {
    console.error('초기 결과 렌더링 중 오류:', error);
    showStatus('결과 렌더링 중 오류가 발생했습니다.');
  }
}

/* ============================================================================
   섹션 인덱스 렌더링
   ============================================================================ */

function renderSectionIndex(sections) {
  const indexWrap = $('section-index');
  if (!indexWrap) return;

  if (!sections || sections.length === 0) {
    indexWrap.innerHTML = '<p>섹션 정보를 찾을 수 없습니다.</p>';
    return;
  }

  let html = '<div class="section-title">📑 논문 구조</div>';
  sections.forEach(sec => {
    const tables = (sec.key_tables || []).map(t => `<span class="pkg">${escapeHtml(t)}</span>`).join(' ');
    html += `
      <div class="index-item">
        <div class="index-section">${escapeHtml(sec.section || '')}</div>
        <div class="index-summary">${escapeHtml(sec.summary || '')}</div>
        ${tables ? `<div class="index-tables">${tables}</div>` : ''}
      </div>`;
  });

  indexWrap.innerHTML = html;
}

/* ============================================================================
   데이터 구조 카드 렌더링
   ============================================================================ */

function renderDataStructureCard(dataStructure) {
  if (!dataStructure) {
    const descEl = $('data-structure-desc');
    if (descEl) descEl.innerHTML = '<p class="text-muted">데이터 구조를 추출하지 못했습니다.</p>';
    return;
  }

  const descEl = $('data-structure-desc');
  if (descEl) {
    let descHtml = '';
    if (dataStructure.data_description) {
      descHtml += `<p>${escapeHtml(dataStructure.data_description)}</p>`;
    }
    if (dataStructure.structure_diagram) {
      descHtml += `<div class="structure-diagram"><code>${escapeCode(dataStructure.structure_diagram)}</code></div>`;
    }
    if (dataStructure.sample_info) {
      const si = dataStructure.sample_info;
      const infoParts = [];
      if (si.n_obs)      infoParts.push(`관측치: ${si.n_obs}`);
      if (si.n_entities) infoParts.push(`개체: ${si.n_entities}`);
      if (si.n_periods)  infoParts.push(`기간: ${si.n_periods}`);
      if (si.time_range) infoParts.push(`기간: ${si.time_range}`);
      if (infoParts.length > 0) {
        descHtml += `<div class="sample-info">${infoParts.map(p => `<span class="info-badge">${escapeHtml(p)}</span>`).join(' ')}</div>`;
      }
    }
    if (dataStructure.limitations) {
      descHtml += `<div class="data-limitations">⚠️ ${escapeHtml(dataStructure.limitations)}</div>`;
    }
    descEl.innerHTML = descHtml;
  }

  // 변수 테이블 (Agent 4+ 형식: name_kr, name_en, role, type, mean, sd, min, max)
  renderVariableTable(dataStructure.variables || []);
}

function renderVariableTable(variables) {
  const wrapEl = $('variable-table-wrap');
  if (!wrapEl) return;

  if (!variables || variables.length === 0) {
    wrapEl.innerHTML = '<p class="text-muted">변수 정보 없음</p>';
    return;
  }

  let html = '<table class="variable-table"><thead><tr>';
  html += '<th>변수명(한)</th><th>변수명(영)</th><th>역할</th><th>유형</th><th>평균</th><th>SD</th><th>Min</th><th>Max</th>';
  html += '</tr></thead><tbody>';

  variables.forEach(v => {
    const est = v._estimated ? ' title="추정값 (논문에서 추출 불가)"' : '';
    const estStyle = v._estimated ? ' style="color: #7f8c8d; font-style: italic;"' : '';
    const isCategorical = (v.type === '범주' || v.type === '이진') && v.categories;
    html += '<tr>';
    html += `<td>${escapeHtml(v.name_kr || '')}</td>`;
    html += `<td><code>${escapeHtml(v.name_en || '')}</code></td>`;
    html += `<td><span class="role-badge role-${(v.role || '').replace(/\s/g, '')}">${escapeHtml(v.role || '')}</span></td>`;
    html += `<td>${escapeHtml(v.type || '')}</td>`;
    if (isCategorical) {
      // 범주형: mean/sd 대신 카테고리 목록 표시 (4열 병합)
      html += `<td colspan="4" style="font-size:0.85em; color:#2c3e50;">${escapeHtml(String(v.categories))}</td>`;
    } else {
      html += `<td${est}${estStyle}>${v.mean != null ? escapeHtml(String(v.mean)) + (v._estimated ? '~' : '') : '—'}</td>`;
      html += `<td${est}${estStyle}>${v.sd != null ? escapeHtml(String(v.sd)) + (v._estimated ? '~' : '') : '—'}</td>`;
      html += `<td${est}${estStyle}>${v.min != null ? escapeHtml(String(v.min)) + (v._estimated ? '~' : '') : '—'}</td>`;
      html += `<td${est}${estStyle}>${v.max != null ? escapeHtml(String(v.max)) + (v._estimated ? '~' : '') : '—'}</td>`;
    }
    html += '</tr>';
  });

  html += '</tbody></table>';
  wrapEl.innerHTML = html;
}

/* ============================================================================
   메소드 네비게이션 렌더링
   ============================================================================ */

function renderMethodNav() {
  const navEl = $('method-nav');
  if (!navEl) return;

  const methods = getMethods();
  if (!methods || methods.length === 0) {
    navEl.innerHTML = '';
    return;
  }

  let html = '<div class="method-nav-container">';
  methods.forEach((method, idx) => {
    const activeClass = idx === 0 ? 'active' : '';
    html += `<button class="method-nav-btn ${activeClass}" data-method-idx="${idx}">`;
    html += escapeHtml(method.raw_name || `방법 ${idx + 1}`);
    html += '</button>';
  });
  html += '</div>';

  navEl.innerHTML = html;
}

/* ============================================================================
   탭 전환 핸들러 설정
   ============================================================================ */

function setupTabHandlers() {
  // 결과 탭 전환
  const tabBtns = document.querySelectorAll('.result-tab');
  const panels = document.querySelectorAll('.result-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.getAttribute('data-panel');

      // 기존 활성 탭 비활성화
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      // 선택된 탭 활성화
      btn.classList.add('active');
      const targetPanel = $(`panel-${panelId}`);
      if (targetPanel) {
        targetPanel.classList.add('active');

        // Tab 2 (practice) 클릭 시 분석 스텝 로드
        if (panelId === 'practice') {
          loadAndRenderAnalysisSteps(currentMethodIndex);
        }

        // Tab 3 (review) 클릭 시 리뷰 & 대안 버튼 표시
        if (panelId === 'review') {
          // 버튼은 이미 HTML에 있음
        }
      }
    });
  });
}

/* ============================================================================
   메소드 네비게이션 핸들러
   ============================================================================ */

function setupMethodNavHandlers() {
  const methodBtns = document.querySelectorAll('.method-nav-btn');
  methodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const methodIdx = parseInt(btn.getAttribute('data-method-idx'), 10);
      currentMethodIndex = methodIdx;

      // 활성 버튼 업데이트
      methodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 현재 탭이 practice 또는 review라면 리로드
      const currentPanel = document.querySelector('.result-panel.active');
      if (currentPanel) {
        const panelId = currentPanel.getAttribute('id');
        if (panelId === 'panel-practice') {
          loadAndRenderAnalysisSteps(methodIdx);
        } else if (panelId === 'panel-review') {
          // 리뷰도 메소드에 따라 바뀌므로 리로드 필요
          clearReviewSections();
        }
      }
    });
  });
}

/* ============================================================================
   (언어 토글 제거됨 — Python 전용, Phase 7)
   ============================================================================ */

function setupLanguageToggleHandlers() {
  // R 제거 후 Python 전용 — 더 이상 토글 불필요
}

/* ============================================================================
   분석 스텝 로드 및 렌더링 (Tab 2)
   ============================================================================ */

/** 현재 분석 메뉴 캐시 (리본 UI에서 사용) */
let currentAnalysisMenu = null;

/** Quick Analysis 도구 — 범용 + 연구유형별 분석 메뉴 */
function getQuickAnalysisTools(category) {
  const base = getBaseQuickTools();
  const extra = getCategoryQuickTools(category || 'regression');
  // 병합: 기본 + 카테고리별 추가
  return {
    descriptive: [...base.descriptive, ...(extra.descriptive || [])],
    inferential: [...base.inferential, ...(extra.inferential || [])],
    visualization: [...base.visualization, ...(extra.visualization || [])],
  };
}

/** 연구 유형별 추가 도구 */
function getCategoryQuickTools(category) {
  switch (category) {
    case 'unstructured_data':
      return {
        descriptive: [
          { id: 'qt_wordfreq', label: '단어 빈도 분석', code: `import pandas as pd
from collections import Counter
import re
df = pd.read_csv('mock_data.csv')
text_cols = df.select_dtypes(include='object').columns.tolist()
if not text_cols:
    print("텍스트 변수가 없습니다.")
else:
    col = text_cols[0]
    all_text = ' '.join(df[col].dropna().astype(str))
    words = re.findall(r'\\w+', all_text.lower())
    freq = Counter(words).most_common(30)
    print(f"=== {col} 상위 30개 단어 빈도 ===")
    for w, c in freq:
        print(f"  {w}: {c}")` },
          { id: 'qt_textlen', label: '텍스트 길이 분포', code: `import pandas as pd
df = pd.read_csv('mock_data.csv')
text_cols = df.select_dtypes(include='object').columns.tolist()
for col in text_cols[:3]:
    lengths = df[col].dropna().astype(str).str.len()
    print(f"=== {col} 텍스트 길이 ===")
    print(f"  평균: {lengths.mean():.1f}, 중앙값: {lengths.median():.0f}, 최대: {lengths.max()}")` },
        ],
        visualization: [
          { id: 'qt_wordcloud', label: '워드클라우드', code: `import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.family'] = 'NanumGothic'
from collections import Counter
import re
df = pd.read_csv('mock_data.csv')
text_cols = df.select_dtypes(include='object').columns.tolist()
if not text_cols:
    print("텍스트 변수가 없습니다.")
else:
    col = text_cols[0]
    all_text = ' '.join(df[col].dropna().astype(str))
    words = re.findall(r'\\w+', all_text.lower())
    freq = Counter(words).most_common(50)
    # 빈도 기반 바 차트 (워드클라우드 대체)
    top20 = freq[:20]
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.barh([w for w,c in reversed(top20)], [c for w,c in reversed(top20)], color='#3498db')
    ax.set_xlabel('빈도')
    ax.set_title(f'{col} - 상위 20 단어')
    plt.tight_layout()
    plt.savefig('wordfreq.png', dpi=100, bbox_inches='tight')
    plt.show()` },
        ],
      };

    case 'time_series':
      return {
        inferential: [
          { id: 'qt_adf', label: '정상성 검정 (ADF)', code: `import pandas as pd
from scipy import stats
df = pd.read_csv('mock_data.csv')
num_cols = df.select_dtypes(include='number').columns.tolist()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_cols = [c for c in num_cols if c not in id_cols]
print("=== ADF 단위근 검정 (Augmented Dickey-Fuller) ===")
try:
    from statsmodels.tsa.stattools import adfuller
    for col in num_cols[:5]:
        series = df[col].dropna()
        result = adfuller(series, autolag='AIC')
        sig = "정상" if result[1] < 0.05 else "비정상"
        print(f"{col}: ADF={result[0]:.3f}, p={result[1]:.4f} → {sig}")
except ImportError:
    print("statsmodels 패키지가 필요합니다.")` },
          { id: 'qt_acf', label: '자기상관 분석 (ACF)', code: `import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.family'] = 'NanumGothic'
df = pd.read_csv('mock_data.csv')
num_cols = df.select_dtypes(include='number').columns.tolist()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_cols = [c for c in num_cols if c not in id_cols]
try:
    from statsmodels.graphics.tsaplots import plot_acf
    n = min(len(num_cols), 4)
    fig, axes = plt.subplots(1, n, figsize=(5*n, 3))
    if n == 1: axes = [axes]
    for i in range(n):
        plot_acf(df[num_cols[i]].dropna(), ax=axes[i], lags=20)
        axes[i].set_title(num_cols[i])
    plt.tight_layout()
    plt.savefig('acf.png', dpi=100, bbox_inches='tight')
    plt.show()
except ImportError:
    print("statsmodels 패키지가 필요합니다.")` },
        ],
        visualization: [
          { id: 'qt_lineplot', label: '시계열 선 그래프', code: `import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.family'] = 'NanumGothic'
matplotlib.rcParams['axes.unicode_minus'] = False
df = pd.read_csv('mock_data.csv')
num_cols = df.select_dtypes(include='number').columns.tolist()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
time_col = next((c for c in ['year','time','date','quarter'] if c in df.columns), None)
plot_cols = [c for c in num_cols if c not in id_cols][:4]
if time_col:
    grouped = df.groupby(time_col)[plot_cols].mean()
    fig, ax = plt.subplots(figsize=(10, 5))
    for col in plot_cols:
        ax.plot(grouped.index, grouped[col], marker='o', label=col)
    ax.set_xlabel(time_col)
    ax.legend()
    ax.set_title('시계열 추이')
    plt.tight_layout()
    plt.savefig('timeseries.png', dpi=100, bbox_inches='tight')
    plt.show()
else:
    print("시간 변수(year/time/date)를 찾을 수 없습니다.")` },
        ],
      };

    case 'causal_inference':
      return {
        inferential: [
          { id: 'qt_fe', label: '고정효과 모형 (Fixed Effects)', code: `import pandas as pd
import statsmodels.api as sm
df = pd.read_csv('mock_data.csv')
num_cols = df.select_dtypes(include='number').columns.tolist()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
y_col = [c for c in num_cols if c not in id_cols][0]
x_cols = [c for c in num_cols if c not in id_cols and c != y_col][:3]
if 'entity_id' in df.columns:
    dummies = pd.get_dummies(df['entity_id'], prefix='fe', drop_first=True, dtype=float)
    X = pd.concat([df[x_cols].astype(float), dummies], axis=1)
    X = sm.add_constant(X)
    model = sm.OLS(df[y_col].astype(float), X).fit()
    print(f"=== 고정효과 모형: {y_col} ~ {' + '.join(x_cols)} + entity FE ===")
    print(model.summary().tables[1])
else:
    print("패널 데이터(entity_id)가 없어 고정효과 모형을 적용할 수 없습니다.")` },
          { id: 'qt_did', label: 'DID (이중차분법)', code: `import pandas as pd
import statsmodels.api as sm
df = pd.read_csv('mock_data.csv')
num_cols = df.select_dtypes(include='number').columns.tolist()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
y_col = [c for c in num_cols if c not in id_cols][0]
cat_cols = df.select_dtypes(include=['object','category']).columns.tolist()
if cat_cols and 'year' in df.columns:
    treat_col = cat_cols[0]
    groups = df[treat_col].unique()[:2]
    mid_year = df['year'].median()
    df['_treat'] = (df[treat_col] == groups[0]).astype(int)
    df['_post'] = (df['year'] >= mid_year).astype(int)
    df['_did'] = df['_treat'] * df['_post']
    X = sm.add_constant(df[['_treat','_post','_did']].astype(float))
    model = sm.OLS(df[y_col].astype(float), X).fit()
    print(f"=== DID: {y_col} ~ treat + post + treat×post ===")
    print(model.summary().tables[1])
else:
    print("DID 분석을 위한 그룹/시간 변수가 부족합니다.")` },
        ],
      };

    case 'machine_learning':
    case 'causal_ml':
      return {
        inferential: [
          { id: 'qt_rf_importance', label: '변수 중요도 (Random Forest)', code: `import pandas as pd
from sklearn.ensemble import RandomForestRegressor
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore').dropna()
if num_df.shape[1] < 2:
    print("수치형 변수가 2개 이상 필요합니다.")
else:
    y = num_df.iloc[:, 0]
    X = num_df.iloc[:, 1:]
    rf = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    rf.fit(X, y)
    imp = pd.Series(rf.feature_importances_, index=X.columns).sort_values(ascending=False)
    print(f"=== 변수 중요도 (종속: {num_df.columns[0]}) ===")
    for name, val in imp.items():
        bar = '█' * int(val * 50)
        print(f"  {name:<20} {val:.4f} {bar}")` },
        ],
        visualization: [
          { id: 'qt_importance_plot', label: '변수 중요도 시각화', code: `import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.family'] = 'NanumGothic'
from sklearn.ensemble import RandomForestRegressor
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore').dropna()
y = num_df.iloc[:, 0]; X = num_df.iloc[:, 1:]
rf = RandomForestRegressor(n_estimators=100, random_state=42)
rf.fit(X, y)
imp = pd.Series(rf.feature_importances_, index=X.columns).sort_values()
fig, ax = plt.subplots(figsize=(8, 5))
ax.barh(imp.index, imp.values, color='#2ecc71')
ax.set_xlabel('Feature Importance')
ax.set_title(f'Random Forest — {num_df.columns[0]} 예측')
plt.tight_layout()
plt.savefig('importance.png', dpi=100, bbox_inches='tight')
plt.show()` },
        ],
      };

    case 'sem':
      return {
        inferential: [
          { id: 'qt_cfa', label: '확인적 요인분석 (CFA)', code: `import pandas as pd
import numpy as np
from numpy.linalg import eig
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore').dropna()
corr = num_df.corr()
eigenvalues, eigenvectors = eig(corr.values)
eigenvalues = np.sort(eigenvalues)[::-1]
cumvar = np.cumsum(eigenvalues / eigenvalues.sum() * 100)
print("=== 주성분 분석 (고유값 기반) ===")
print(f"{'성분':>6} {'고유값':>10} {'분산비율(%)':>12} {'누적(%)':>10}")
for i, (ev, cv) in enumerate(zip(eigenvalues, cumvar)):
    marker = " ◀" if ev >= 1 else ""
    print(f"{i+1:>6} {ev:>10.3f} {ev/eigenvalues.sum()*100:>12.2f} {cv:>10.2f}{marker}")` },
        ],
      };

    case 'survey':
    case 'experimental':
      return {
        inferential: [
          { id: 'qt_reliability', label: '신뢰도 분석 (Cronbach α)', code: `import pandas as pd
import numpy as np
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore')
k = num_df.shape[1]
if k < 2:
    print("Cronbach α 계산에 수치 변수 2개 이상 필요합니다.")
else:
    item_vars = num_df.var(axis=0, ddof=1)
    total_var = num_df.sum(axis=1).var(ddof=1)
    alpha = (k / (k - 1)) * (1 - item_vars.sum() / total_var)
    print(f"=== 신뢰도 분석 ===")
    print(f"항목 수: {k}")
    print(f"Cronbach's α: {alpha:.4f}")
    verdict = "우수" if alpha >= 0.9 else "양호" if alpha >= 0.8 else "수용가능" if alpha >= 0.7 else "낮음"
    print(f"판정: {verdict}")` },
        ],
      };

    case 'spatial':
      return {
        descriptive: [
          { id: 'qt_spatial_desc', label: '공간 변수 기술통계', code: `import pandas as pd
df = pd.read_csv('mock_data.csv')
geo_cols = [c for c in df.columns if any(k in c.lower() for k in ['lat','lon','lng','x','y','region','city','state'])]
if not geo_cols:
    print("공간 관련 변수를 찾을 수 없습니다.")
    print("전체 변수:", list(df.columns))
else:
    print("=== 공간 관련 변수 ===")
    for col in geo_cols:
        if df[col].dtype in ['float64','int64']:
            print(f"\\n{col}: 평균={df[col].mean():.4f}, 범위=[{df[col].min():.4f}, {df[col].max():.4f}]")
        else:
            print(f"\\n{col}: {df[col].nunique()}개 고유값")
            print(df[col].value_counts().head(10))` },
        ],
      };

    default:
      return { descriptive: [], inferential: [], visualization: [] };
  }
}

/** 범용 기본 도구 */
function getBaseQuickTools() {
  return {
    descriptive: [
      { id: 'qt_describe', label: '기본 기술통계 (describe)', code: `import pandas as pd
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore')
print(num_df.describe().round(3))` },
      { id: 'qt_mean_median', label: '평균 & 중앙값', code: `import pandas as pd
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore')
print("=== 평균 (Mean) ===")
print(num_df.mean().round(3))
print("\\n=== 중앙값 (Median) ===")
print(num_df.median().round(3))` },
      { id: 'qt_std_var', label: '표준편차 & 분산', code: `import pandas as pd
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore')
print("=== 표준편차 (Std) ===")
print(num_df.std().round(3))
print("\\n=== 분산 (Variance) ===")
print(num_df.var().round(3))` },
      { id: 'qt_skew_kurt', label: '왜도 & 첨도', code: `import pandas as pd
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore')
print("=== 왜도 (Skewness) ===")
print(num_df.skew().round(3))
print("\\n=== 첨도 (Kurtosis) ===")
print(num_df.kurtosis().round(3))` },
      { id: 'qt_missing', label: '결측치 분석', code: `import pandas as pd
df = pd.read_csv('mock_data.csv')
total = len(df)
missing = df.isnull().sum()
pct = (missing / total * 100).round(2)
result = pd.DataFrame({'결측수': missing, '결측률(%)': pct})
result = result[result['결측수'] > 0].sort_values('결측수', ascending=False)
if len(result) == 0:
    print("결측치가 없습니다. (완전 데이터)")
else:
    print(f"=== 결측치 현황 (총 {total}행) ===")
    print(result)` },
      { id: 'qt_freq', label: '빈도 분석 (범주형)', code: `import pandas as pd
df = pd.read_csv('mock_data.csv')
cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
if not cat_cols:
    print("범주형 변수가 없습니다.")
else:
    for col in cat_cols:
        print(f"\\n=== {col} 빈도표 ===")
        vc = df[col].value_counts()
        pct = (vc / len(df) * 100).round(1)
        freq_df = pd.DataFrame({'빈도': vc, '비율(%)': pct})
        print(freq_df)` },
    ],
    inferential: [
      { id: 'qt_corr_pearson', label: '피어슨 상관분석', code: `import pandas as pd
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore')
corr = num_df.corr(method='pearson').round(3)
print("=== 피어슨 상관계수 행렬 ===")
print(corr)` },
      { id: 'qt_corr_spearman', label: '스피어만 상관분석', code: `import pandas as pd
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore')
corr = num_df.corr(method='spearman').round(3)
print("=== 스피어만 상관계수 행렬 ===")
print(corr)` },
      { id: 'qt_ttest', label: '독립표본 t-검정', code: `import pandas as pd
from scipy import stats
df = pd.read_csv('mock_data.csv')
# 범주형 변수로 그룹 분리
cat_cols = df.select_dtypes(include=['object','category']).columns.tolist()
num_cols = df.select_dtypes(include='number').columns.tolist()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_cols = [c for c in num_cols if c not in id_cols]
if not cat_cols or not num_cols:
    print("t-검정을 위한 범주형/수치형 변수 조합이 없습니다.")
else:
    group_col = cat_cols[0]
    groups = df[group_col].unique()[:2]
    print(f"=== 독립표본 t-검정 (그룹: {group_col}) ===")
    print(f"비교 그룹: {groups[0]} vs {groups[1]}\\n")
    g1 = df[df[group_col] == groups[0]]
    g2 = df[df[group_col] == groups[1]]
    for col in num_cols[:5]:
        t_stat, p_val = stats.ttest_ind(g1[col].dropna(), g2[col].dropna())
        sig = "***" if p_val < 0.001 else "**" if p_val < 0.01 else "*" if p_val < 0.05 else "n.s."
        print(f"{col}: t={t_stat:.3f}, p={p_val:.4f} {sig}")` },
      { id: 'qt_anova', label: '일원분산분석 (ANOVA)', code: `import pandas as pd
from scipy import stats
df = pd.read_csv('mock_data.csv')
cat_cols = df.select_dtypes(include=['object','category']).columns.tolist()
num_cols = df.select_dtypes(include='number').columns.tolist()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_cols = [c for c in num_cols if c not in id_cols]
if not cat_cols or not num_cols:
    print("ANOVA를 위한 변수 조합이 없습니다.")
else:
    group_col = cat_cols[0]
    print(f"=== 일원분산분석 (ANOVA, 그룹: {group_col}) ===\\n")
    groups = [g[1][num_cols[0]].dropna().values for g in df.groupby(group_col)]
    for col in num_cols[:5]:
        grp_data = [g[1][col].dropna().values for g in df.groupby(group_col)]
        f_stat, p_val = stats.f_oneway(*grp_data)
        sig = "***" if p_val < 0.001 else "**" if p_val < 0.01 else "*" if p_val < 0.05 else "n.s."
        print(f"{col}: F={f_stat:.3f}, p={p_val:.4f} {sig}")` },
      { id: 'qt_normality', label: '정규성 검정 (Shapiro-Wilk)', code: `import pandas as pd
from scipy import stats
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore')
print("=== 정규성 검정 (Shapiro-Wilk) ===")
print(f"{'변수':<25} {'W통계량':>10} {'p-value':>10} {'판정':>6}")
print("-" * 55)
for col in num_df.columns:
    sample = num_df[col].dropna()
    if len(sample) > 5000: sample = sample.sample(5000, random_state=42)
    w, p = stats.shapiro(sample)
    verdict = "정규" if p >= 0.05 else "비정규"
    print(f"{col:<25} {w:>10.4f} {p:>10.4f} {verdict:>6}")` },
      { id: 'qt_chi2', label: '카이제곱 검정', code: `import pandas as pd
from scipy import stats
df = pd.read_csv('mock_data.csv')
cat_cols = df.select_dtypes(include=['object','category']).columns.tolist()
if len(cat_cols) < 2:
    print("카이제곱 검정을 위해 범주형 변수가 2개 이상 필요합니다.")
else:
    for i in range(len(cat_cols)):
        for j in range(i+1, min(len(cat_cols), i+4)):
            ct = pd.crosstab(df[cat_cols[i]], df[cat_cols[j]])
            chi2, p, dof, expected = stats.chi2_contingency(ct)
            sig = "***" if p < 0.001 else "**" if p < 0.01 else "*" if p < 0.05 else "n.s."
            print(f"=== {cat_cols[i]} × {cat_cols[j]} ===")
            print(f"χ²={chi2:.3f}, df={dof}, p={p:.4f} {sig}")
            print(ct)
            print()` },
    ],
    visualization: [
      { id: 'qt_hist', label: '히스토그램', code: `import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.family'] = 'NanumGothic'
matplotlib.rcParams['axes.unicode_minus'] = False
df = pd.read_csv('mock_data.csv')
num_cols = df.select_dtypes(include='number').columns.tolist()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_cols = [c for c in num_cols if c not in id_cols]
n = min(len(num_cols), 6)
fig, axes = plt.subplots(2, 3, figsize=(12, 7))
axes = axes.flatten()
for i in range(n):
    axes[i].hist(df[num_cols[i]].dropna(), bins=20, edgecolor='black', alpha=0.7)
    axes[i].set_title(num_cols[i], fontsize=11)
    axes[i].set_ylabel('빈도')
for i in range(n, 6): axes[i].set_visible(False)
plt.tight_layout()
plt.savefig('hist.png', dpi=100, bbox_inches='tight')
plt.show()` },
      { id: 'qt_boxplot', label: '상자 그림 (Box Plot)', code: `import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.family'] = 'NanumGothic'
matplotlib.rcParams['axes.unicode_minus'] = False
df = pd.read_csv('mock_data.csv')
num_cols = df.select_dtypes(include='number').columns.tolist()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_cols = [c for c in num_cols if c not in id_cols]
n = min(len(num_cols), 6)
fig, axes = plt.subplots(2, 3, figsize=(12, 7))
axes = axes.flatten()
for i in range(n):
    axes[i].boxplot(df[num_cols[i]].dropna(), patch_artist=True,
                    boxprops=dict(facecolor='#3498db', alpha=0.6))
    axes[i].set_title(num_cols[i], fontsize=11)
for i in range(n, 6): axes[i].set_visible(False)
plt.tight_layout()
plt.savefig('boxplot.png', dpi=100, bbox_inches='tight')
plt.show()` },
      { id: 'qt_scatter', label: '산점도 (주요 변수)', code: `import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.family'] = 'NanumGothic'
matplotlib.rcParams['axes.unicode_minus'] = False
df = pd.read_csv('mock_data.csv')
num_cols = df.select_dtypes(include='number').columns.tolist()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_cols = [c for c in num_cols if c not in id_cols]
if len(num_cols) < 2:
    print("산점도를 그리려면 수치형 변수가 2개 이상 필요합니다.")
else:
    y_col = num_cols[0]
    x_cols = num_cols[1:min(4, len(num_cols))]
    fig, axes = plt.subplots(1, len(x_cols), figsize=(5*len(x_cols), 4))
    if len(x_cols) == 1: axes = [axes]
    for i, x in enumerate(x_cols):
        axes[i].scatter(df[x], df[y_col], alpha=0.4, s=15)
        axes[i].set_xlabel(x)
        axes[i].set_ylabel(y_col)
        axes[i].set_title(f'{x} vs {y_col}')
    plt.tight_layout()
    plt.savefig('scatter.png', dpi=100, bbox_inches='tight')
    plt.show()` },
      { id: 'qt_heatmap', label: '상관 히트맵', code: `import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
import matplotlib
matplotlib.rcParams['font.family'] = 'NanumGothic'
matplotlib.rcParams['axes.unicode_minus'] = False
df = pd.read_csv('mock_data.csv')
num_df = df.select_dtypes(include='number')
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_df = num_df.drop(columns=[c for c in id_cols if c in num_df.columns], errors='ignore')
corr = num_df.corr()
fig, ax = plt.subplots(figsize=(10, 8))
im = ax.imshow(corr, cmap='RdBu_r', vmin=-1, vmax=1, aspect='auto')
ax.set_xticks(range(len(corr.columns)))
ax.set_yticks(range(len(corr.columns)))
ax.set_xticklabels(corr.columns, rotation=45, ha='right', fontsize=9)
ax.set_yticklabels(corr.columns, fontsize=9)
for i in range(len(corr)):
    for j in range(len(corr)):
        ax.text(j, i, f'{corr.iloc[i,j]:.2f}', ha='center', va='center', fontsize=8)
plt.colorbar(im, ax=ax, label='Correlation')
plt.title('상관계수 히트맵')
plt.tight_layout()
plt.savefig('heatmap.png', dpi=100, bbox_inches='tight')
plt.show()` },
      { id: 'qt_bar', label: '막대 그래프 (범주형)', code: `import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.family'] = 'NanumGothic'
matplotlib.rcParams['axes.unicode_minus'] = False
df = pd.read_csv('mock_data.csv')
cat_cols = df.select_dtypes(include=['object','category']).columns.tolist()
if not cat_cols:
    print("범주형 변수가 없습니다.")
else:
    n = min(len(cat_cols), 4)
    fig, axes = plt.subplots(1, n, figsize=(5*n, 4))
    if n == 1: axes = [axes]
    for i in range(n):
        vc = df[cat_cols[i]].value_counts()
        axes[i].bar(vc.index.astype(str), vc.values, color='#3498db', alpha=0.7, edgecolor='black')
        axes[i].set_title(cat_cols[i])
        axes[i].set_ylabel('빈도')
        axes[i].tick_params(axis='x', rotation=45)
    plt.tight_layout()
    plt.savefig('bar.png', dpi=100, bbox_inches='tight')
    plt.show()` },
      { id: 'qt_violin', label: '바이올린 플롯', code: `import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.rcParams['font.family'] = 'NanumGothic'
matplotlib.rcParams['axes.unicode_minus'] = False
df = pd.read_csv('mock_data.csv')
num_cols = df.select_dtypes(include='number').columns.tolist()
id_cols = ['entity_id', 'year', 'time', 'id', 'ID', 'Unnamed: 0']
num_cols = [c for c in num_cols if c not in id_cols]
n = min(len(num_cols), 6)
fig, axes = plt.subplots(2, 3, figsize=(12, 7))
axes = axes.flatten()
for i in range(n):
    data = df[num_cols[i]].dropna().values
    vp = axes[i].violinplot(data, showmeans=True, showmedians=True)
    vp['bodies'][0].set_facecolor('#3498db')
    vp['bodies'][0].set_alpha(0.6)
    axes[i].set_title(num_cols[i], fontsize=11)
for i in range(n, 6): axes[i].set_visible(False)
plt.tight_layout()
plt.savefig('violin.png', dpi=100, bbox_inches='tight')
plt.show()` },
    ],
  };
}

async function loadAndRenderAnalysisSteps(methodIndex) {
  try {
    const stepsContainer = $('practice-steps');
    if (!stepsContainer) return;

    stepsContainer.innerHTML = '<div class="loading-text">분석 메뉴 구성 중...</div>';

    const result = await loadAnalysisSteps(methodIndex);
    if (!result || !result.steps) {
      stepsContainer.innerHTML = '<p>분석 메뉴를 구성할 수 없습니다.</p>';
      return;
    }

    const menu = result.steps;
    currentAnalysisMenu = menu;
    const groups = ['descriptive', 'inferential', 'visualization'];
    // 연구 카테고리 기반 Quick Tools
    const paperContext = getPaperContext();
    const analysisCategory = paperContext?.analysis_category || 'regression';
    const quickTools = getQuickAnalysisTools(analysisCategory);

    // ── 2-Panel 레이아웃 ──
    let html = '<div class="analysis-split-layout">';

    // ══════════ 왼쪽 패널: 메뉴 + 코드 편집기 ══════════
    html += '<div class="analysis-menu-pane">';

    // 리본 탭
    html += '<div class="ribbon-tabs">';
    groups.forEach((g, i) => {
      if (!menu[g]) return;
      const active = i === 0 ? ' active' : '';
      html += `<button class="ribbon-tab${active}" data-group="${g}">${escapeHtml(menu[g].label)}</button>`;
    });
    html += '</div>';

    // 체크박스 패널
    groups.forEach((g, i) => {
      if (!menu[g]) return;
      const active = i === 0 ? ' active' : '';
      html += `<div class="ribbon-panel${active}" data-group="${g}">`;

      // 논문 기반 분석 항목
      html += '<div class="menu-section-label">📄 논문 분석</div>';
      html += '<div class="checkbox-grid">';
      (menu[g].items || []).forEach(item => {
        const checked = item.checked ? ' checked' : '';
        const refs = (item.refLinks || []).map(r =>
          `<a class="ref-link" href="${r.url}" target="_blank" rel="noopener" title="${escapeHtml(r.label)}">📖</a>`
        ).join('');
        html += `<label class="analysis-item">
          <input type="checkbox" data-item-id="${item.id}" data-group="${g}"${checked}>
          <span class="item-label">${escapeHtml(item.label)}</span>${refs}
        </label>`;
      });
      html += '</div>';

      // Quick Analysis 도구
      if (quickTools[g] && quickTools[g].length > 0) {
        html += '<div class="menu-section-label">🧰 분석 도구</div>';
        html += '<div class="checkbox-grid">';
        quickTools[g].forEach(item => {
          html += `<label class="analysis-item quick-tool">
            <input type="checkbox" data-item-id="${item.id}" data-group="${g}">
            <span class="item-label">${escapeHtml(item.label)}</span>
          </label>`;
        });
        html += '</div>';
      }

      html += '</div>';
    });

    // 액션 바
    html += `<div class="analysis-action-bar">
      <button class="btn-run-checked" id="btn-run-checked">▶ 선택 항목 실행</button>
      <button class="btn-export-notebook" id="btn-export-notebook">📥 Notebook 내보내기</button>
    </div>`;

    // ── 코드 편집 영역 (선택한 항목의 코드) ──
    html += `<div class="code-editor-section" id="code-editor-section">
      <div class="code-editor-header">
        <span class="code-editor-title" id="code-editor-title">💻 코드 편집기</span>
      </div>
      <textarea class="code-textarea code-editor-main" id="code-editor-textarea" spellcheck="false" placeholder="왼쪽 항목을 클릭하거나 실행하면 코드가 여기에 표시됩니다."></textarea>
      <div class="ai-assistant-wrap">
        <div class="ai-assistant-input-row">
          <input type="text" class="ai-assistant-input" id="code-editor-ai-input" placeholder="💬 코드 수정 요청 (예: 통제변수에서 firm_age 빼줘)">
          <button class="btn-ai-assist" id="code-editor-ai-btn">✨ AI 수정</button>
        </div>
        <div class="ai-assistant-msg" id="code-editor-ai-msg"></div>
      </div>
      <div class="code-editor-actions">
        <button class="btn-rerun-editor" id="btn-rerun-editor">🔄 재실행</button>
      </div>
    </div>`;

    // Pyodide 상태 표시
    html += '<div class="pyodide-status" id="pyodide-status-global" style="display:none;"></div>';

    html += '</div>'; // .analysis-menu-pane 끝

    // ══════════ 리사이즈 핸들 ══════════
    html += '<div class="resize-handle" id="resize-handle" title="드래그하여 패널 크기 조절">⋮</div>';

    // ══════════ 오른쪽 패널: 체크박스 토글(Python / APA) ══════════
    html += `<div class="analysis-results-pane" id="analysis-results-pane">
      <div class="results-pane-header">
        <div class="results-toggle-bar">
          <label class="results-toggle"><input type="checkbox" id="toggle-python" checked><span>🐍 Python 결과</span></label>
          <label class="results-toggle"><input type="checkbox" id="toggle-apa"><span>📝 APA Style</span></label>
        </div>
        <button class="btn-clear-results" id="btn-clear-results" title="결과 닫기">✕ 닫기</button>
      </div>
      <div class="results-section" id="results-section-python">
        <div id="analysis-results"></div>
      </div>
      <div class="results-section" id="results-section-apa" style="display:none;">
        <div id="apa-results">
          <div class="apa-empty-state">실행 결과가 없습니다. 항목을 선택하고 실행하면 APA 보고서가 여기에 표시됩니다.</div>
        </div>
      </div>
    </div>`;

    html += '</div>'; // .analysis-split-layout 끝

    stepsContainer.innerHTML = html;
    setupRibbonHandlers(methodIndex, menu);
  } catch (error) {
    console.error('분석 메뉴 로드 오류:', error);
    const stepsContainer = $('practice-steps');
    if (stepsContainer) {
      stepsContainer.innerHTML = '<p>오류: 분석 메뉴를 로드할 수 없습니다.</p>';
    }
  }
}

/** 현재 코드 편집기에 로드된 항목 ID */
let currentEditorItemId = null;

function setupRibbonHandlers(methodIndex, menu) {
  // 리본 탭 전환
  document.querySelectorAll('.ribbon-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ribbon-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ribbon-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.querySelector(`.ribbon-panel[data-group="${btn.dataset.group}"]`);
      if (panel) panel.classList.add('active');
    });
  });

  // 체크박스 항목 라벨 클릭 → 코드 편집기에 로드
  document.querySelectorAll('.analysis-item .item-label').forEach(label => {
    label.style.cursor = 'pointer';
    label.addEventListener('click', (e) => {
      // 체크박스 토글은 유지, 라벨 클릭 시 편집기 로드
      const cb = label.parentElement.querySelector('input[type="checkbox"]');
      if (!cb) return;
      const itemId = cb.dataset.itemId;
      const group = cb.dataset.group;
      loadItemToEditor(itemId, group, menu);
    });
  });

  // 선택 항목 실행
  const runBtn = document.getElementById('btn-run-checked');
  if (runBtn) {
    runBtn.addEventListener('click', () => runCheckedItems(methodIndex, menu));
  }

  // Notebook 내보내기
  const exportBtn = document.getElementById('btn-export-notebook');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (typeof window.exportAnalysisNotebook === 'function') {
        window.exportAnalysisNotebook(menu, mockDataCache);
      } else {
        alert('Notebook 내보내기 모듈을 로드하지 못했습니다.');
      }
    });
  }

  // 결과 닫기 버튼
  const clearBtn = document.getElementById('btn-clear-results');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const resultsPane = document.getElementById('analysis-results-pane');
      const resultsDiv = document.getElementById('analysis-results');
      const apaDiv = document.getElementById('apa-results');
      if (resultsDiv) resultsDiv.innerHTML = '';
      if (apaDiv) apaDiv.innerHTML = '<div class="apa-empty-state">실행 결과가 없습니다.</div>';
      if (resultsPane) resultsPane.classList.remove('has-results');
    });
  }

  // 오른쪽 패널 체크박스 토글 (Python / APA — 동시 표시 가능)
  const togglePython = document.getElementById('toggle-python');
  const toggleApa = document.getElementById('toggle-apa');
  if (togglePython) {
    togglePython.addEventListener('change', () => {
      const section = document.getElementById('results-section-python');
      if (section) section.style.display = togglePython.checked ? 'block' : 'none';
    });
  }
  if (toggleApa) {
    toggleApa.addEventListener('change', () => {
      const section = document.getElementById('results-section-apa');
      if (section) section.style.display = toggleApa.checked ? 'block' : 'none';
    });
  }

  // 리사이즈 핸들
  setupResizeHandle();

  // 코드 편집기 — 재실행 버튼
  const rerunBtn = document.getElementById('btn-rerun-editor');
  if (rerunBtn) {
    rerunBtn.addEventListener('click', () => rerunFromEditor(menu));
  }

  // 코드 편집기 — AI 수정 버튼
  const aiBtn = document.getElementById('code-editor-ai-btn');
  const aiInput = document.getElementById('code-editor-ai-input');
  if (aiBtn && aiInput) {
    const handleAi = async () => {
      const request = aiInput.value.trim();
      if (!request) { aiInput.focus(); return; }
      const textarea = document.getElementById('code-editor-textarea');
      const currentCode = textarea ? textarea.value : '';
      const aiMsg = document.getElementById('code-editor-ai-msg');
      aiBtn.disabled = true;
      aiBtn.textContent = '⏳ 수정 중...';
      if (aiMsg) aiMsg.innerHTML = '<span class="ai-loading">🤖 AI가 코드를 수정하고 있습니다...</span>';
      try {
        const result = await requestCodeAssistant(currentCode, request);
        if (result.modifiedCode && textarea) textarea.value = result.modifiedCode;
        if (aiMsg) aiMsg.innerHTML = `<span class="ai-success">✅ ${escapeHtml(result.explanation)}</span>`;
        aiInput.value = '';
      } catch (e) {
        if (aiMsg) aiMsg.innerHTML = `<span class="ai-error">❌ ${escapeHtml(e.message)}</span>`;
      } finally {
        aiBtn.disabled = false;
        aiBtn.textContent = '✨ AI 수정';
      }
    };
    aiBtn.addEventListener('click', handleAi);
    aiInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAi(); });
  }
}

/** 좌우 패널 리사이즈 핸들 */
function setupResizeHandle() {
  const handle = document.getElementById('resize-handle');
  const layout = document.querySelector('.analysis-split-layout');
  const menuPane = document.querySelector('.analysis-menu-pane');
  if (!handle || !layout || !menuPane) return;

  // 모바일에서는 리사이즈 비활성화
  if (window.innerWidth < 900) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = menuPane.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const newWidth = Math.max(250, Math.min(startWidth + dx, layout.offsetWidth - 300));
    menuPane.style.flex = `0 0 ${newWidth}px`;
    menuPane.style.maxWidth = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  // 터치 지원
  handle.addEventListener('touchstart', (e) => {
    isResizing = true;
    startX = e.touches[0].clientX;
    startWidth = menuPane.offsetWidth;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!isResizing) return;
    const dx = e.touches[0].clientX - startX;
    const newWidth = Math.max(250, Math.min(startWidth + dx, layout.offsetWidth - 300));
    menuPane.style.flex = `0 0 ${newWidth}px`;
    menuPane.style.maxWidth = `${newWidth}px`;
  });

  document.addEventListener('touchend', () => {
    if (!isResizing) return;
    isResizing = false;
  });
}

/** 편집기에서 수정된 코드 캐시 (itemId → code) */
const editorCodeCache = {};

/** 항목 코드를 왼쪽 편집기에 로드 */
function loadItemToEditor(itemId, group, menu) {
  // 현재 편집기에 수정된 코드가 있으면 캐시에 저장
  if (currentEditorItemId) {
    const textarea = document.getElementById('code-editor-textarea');
    if (textarea) editorCodeCache[currentEditorItemId] = textarea.value;
  }

  // 아이템 정보 찾기 (menu 또는 quickTools)
  let item = null;
  if (menu[group]) {
    item = (menu[group].items || []).find(it => it.id === itemId);
  }
  // Quick Tools에서 찾기
  if (!item) {
    const qt = getQuickAnalysisTools(getPaperContext()?.analysis_category);
    if (qt[group]) {
      item = qt[group].find(it => it.id === itemId);
    }
  }
  if (!item) return;

  currentEditorItemId = itemId;
  const titleEl = document.getElementById('code-editor-title');
  const textarea = document.getElementById('code-editor-textarea');
  if (titleEl) titleEl.textContent = `💻 ${item.label}`;
  // 캐시된 수정 코드가 있으면 그것을 사용, 없으면 원본
  if (textarea) textarea.value = editorCodeCache[itemId] || item.code || '';

  // 편집기 섹션 활성화
  const section = document.getElementById('code-editor-section');
  if (section) section.classList.add('has-code');

  // 현재 선택 항목 하이라이트
  document.querySelectorAll('.analysis-item').forEach(el => el.classList.remove('selected'));
  const cb = document.querySelector(`input[data-item-id="${itemId}"]`);
  if (cb && cb.parentElement) cb.parentElement.classList.add('selected');
}

/** 편집기에서 재실행 → 해당 항목 결과 갱신 */
async function rerunFromEditor(menu) {
  if (!currentEditorItemId) {
    alert('먼저 항목을 선택해주세요.');
    return;
  }
  const textarea = document.getElementById('code-editor-textarea');
  if (!textarea) return;
  const editedCode = textarea.value;
  // 수정된 코드를 캐시에 저장
  editorCodeCache[currentEditorItemId] = editedCode;

  // 결과 패널 활성화
  const resultsPane = document.getElementById('analysis-results-pane');
  if (resultsPane) resultsPane.classList.add('has-results');

  // Python 결과 섹션 표시
  const pyToggle = document.getElementById('toggle-python');
  if (pyToggle) pyToggle.checked = true;
  const pySection = document.getElementById('results-section-python');
  if (pySection) pySection.style.display = 'block';

  // 해당 아코디언 찾기 또는 새로 생성
  let accDiv = document.querySelector(`.result-accordion[data-item-id="${currentEditorItemId}"]`);
  if (!accDiv) {
    // 아코디언이 없으면 새로 생성
    const resultsDiv = document.getElementById('analysis-results');
    if (!resultsDiv) return;
    // 메뉴 또는 Quick Tools에서 항목 정보 찾기
    let itemLabel = currentEditorItemId;
    const qt = getQuickAnalysisTools(getPaperContext()?.analysis_category);
    for (const g of ['descriptive', 'inferential', 'visualization']) {
      let found = menu[g] && (menu[g].items || []).find(it => it.id === currentEditorItemId);
      if (!found && qt[g]) found = qt[g].find(it => it.id === currentEditorItemId);
      if (found) { itemLabel = found.label; break; }
    }
    accDiv = document.createElement('div');
    accDiv.className = 'result-accordion';
    accDiv.dataset.itemId = currentEditorItemId;
    accDiv.innerHTML = `
      <button class="accordion-header" data-item-id="${currentEditorItemId}">
        <span class="acc-title">${escapeHtml(itemLabel)}</span>
        <span class="acc-status">⏳ 실행 중...</span>
      </button>
      <div class="accordion-body open">
        <div class="item-result"><div class="loading-text">🐍 Python 실행 중...</div></div>
      </div>`;
    resultsDiv.appendChild(accDiv);
    // 헤더 토글
    accDiv.querySelector('.accordion-header').addEventListener('click', () => {
      accDiv.querySelector('.accordion-body').classList.toggle('open');
    });
  }

  const resultEl = accDiv.querySelector('.item-result');
  const statusEl = accDiv.querySelector('.acc-status');
  if (statusEl) statusEl.textContent = '⏳ 재실행 중...';
  if (resultEl) resultEl.innerHTML = '<div class="loading-text">🐍 Python 재실행 중...</div>';

  try {
    await executePythonForItem(editedCode, resultEl);
    if (statusEl) statusEl.textContent = '✅';
  } catch (e) {
    if (statusEl) statusEl.textContent = '❌';
  }
}

/** 실행된 결과를 저장 (APA 탭에서 통합 표시용) */
let executionResults = [];

async function runCheckedItems(methodIndex, menu) {
  const checked = document.querySelectorAll('input[data-item-id]:checked');
  if (checked.length === 0) {
    alert('실행할 항목을 하나 이상 선택해주세요.');
    return;
  }

  const resultsDiv = document.getElementById('analysis-results');
  if (!resultsDiv) return;
  resultsDiv.innerHTML = '';
  executionResults = [];

  // 결과 패널 활성화 + Python 섹션 표시
  const resultsPane = document.getElementById('analysis-results-pane');
  if (resultsPane) resultsPane.classList.add('has-results');
  const pyToggle = document.getElementById('toggle-python');
  if (pyToggle) pyToggle.checked = true;
  const pySection = document.getElementById('results-section-python');
  if (pySection) pySection.style.display = 'block';

  const groups = ['descriptive', 'inferential', 'visualization'];

  // 체크된 아이템을 그룹 순서대로 정렬 (논문 분석 + Quick Tools)
  const quickTools = getQuickAnalysisTools(getPaperContext()?.analysis_category);
  const itemsToRun = [];
  for (const g of groups) {
    // 논문 분석 항목
    if (menu[g]) {
      for (const item of menu[g].items) {
        const cb = document.querySelector(`input[data-item-id="${item.id}"]:checked`);
        if (cb) itemsToRun.push({ ...item, group: g });
      }
    }
    // Quick Tools 항목
    if (quickTools[g]) {
      for (const item of quickTools[g]) {
        const cb = document.querySelector(`input[data-item-id="${item.id}"]:checked`);
        if (cb) itemsToRun.push({ ...item, group: g });
      }
    }
  }

  for (const item of itemsToRun) {
    // 아코디언 생성 (코드 편집기 제거 — 왼쪽 패널로 이동됨)
    const accDiv = document.createElement('div');
    accDiv.className = 'result-accordion';
    accDiv.dataset.itemId = item.id;
    accDiv.dataset.group = item.group;
    accDiv.innerHTML = `
      <button class="accordion-header" data-item-id="${item.id}">
        <span class="acc-title">${escapeHtml(item.label)}</span>
        <span class="acc-status">⏳ 실행 중...</span>
      </button>
      <div class="accordion-body open">
        <div class="item-result"><div class="loading-text">🐍 Python 실행 중...</div></div>
      </div>`;
    resultsDiv.appendChild(accDiv);

    // 아코디언 헤더 클릭 → 토글 + 왼쪽 편집기에 코드 로드
    const header = accDiv.querySelector('.accordion-header');
    header.addEventListener('click', () => {
      accDiv.querySelector('.accordion-body').classList.toggle('open');
      // 편집기에 해당 항목 코드 로드
      loadItemToEditor(item.id, item.group, menu);
    });

    // Python 실행 — 편집기에 수정된 코드가 있으면 그것을 사용
    const codeToRun = editorCodeCache[item.id] || item.code;
    const resultEl = accDiv.querySelector('.item-result');
    const statusEl = accDiv.querySelector('.acc-status');
    try {
      await executePythonForItem(codeToRun, resultEl);
      statusEl.textContent = '✅';
      // 결과 저장 (APA 탭용)
      executionResults.push({
        id: item.id,
        label: item.label,
        group: item.group,
        html: resultEl.innerHTML,
        success: true
      });
    } catch (e) {
      statusEl.textContent = '❌';
      resultEl.innerHTML = `<div class="pyodide-error">❌ 오류: ${escapeHtml(e.message || String(e))}</div>`;
      executionResults.push({
        id: item.id,
        label: item.label,
        group: item.group,
        html: resultEl.innerHTML,
        success: false
      });
    }

    // 첫 번째 항목 코드를 자동으로 편집기에 로드
    if (itemsToRun.indexOf(item) === 0) {
      loadItemToEditor(item.id, item.group, menu);
    }
  }

  // APA 탭 업데이트
  updateApaTab(executionResults);
}

/** APA 탭에 통합 결과 렌더링 */
function updateApaTab(results) {
  const apaDiv = document.getElementById('apa-results');
  if (!apaDiv) return;

  const successResults = results.filter(r => r.success);
  if (successResults.length === 0) {
    apaDiv.innerHTML = '<div class="apa-empty-state">실행된 결과가 없습니다.</div>';
    return;
  }

  let html = '<div class="apa-integrated-report">';
  html += '<div class="apa-report-header">📝 APA 7th Edition — 통합 결과 보고서</div>';

  // 각 결과에서 APA 관련 요소만 추출
  for (const r of successResults) {
    html += `<div class="apa-result-section">`;
    html += `<h4 class="apa-section-title">${escapeHtml(r.label)}</h4>`;

    // 임시 DOM에서 APA 테이블/피규어 추출
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = r.html;

    // APA Table 추출
    const apaTables = tempDiv.querySelectorAll('.apa-table-wrap, .apa-styled-table');
    apaTables.forEach(t => { html += t.outerHTML; });

    // APA Figure 추출
    const apaFigs = tempDiv.querySelectorAll('.apa-figure');
    apaFigs.forEach(f => { html += f.outerHTML; });

    // stdout (테이블/피규어 없으면 raw 출력 표시)
    if (apaTables.length === 0 && apaFigs.length === 0) {
      const stdout = tempDiv.querySelector('.python-stdout');
      if (stdout) {
        html += `<pre class="python-stdout">${stdout.innerHTML}</pre>`;
      }
    }

    html += '</div>';
  }

  // APA 보고서 생성 버튼
  html += `<div class="apa-report-action" style="margin-top:16px;">
    <button class="btn-apa-report" id="btn-apa-generate-all">📝 AI APA 해석 보고서 생성</button>
  </div>`;
  html += '<div id="apa-ai-report" style="display:none;"></div>';

  html += '</div>';
  apaDiv.innerHTML = html;

  // APA AI 보고서 생성 버튼 이벤트
  const apaGenBtn = document.getElementById('btn-apa-generate-all');
  if (apaGenBtn) {
    apaGenBtn.addEventListener('click', () => generateIntegratedApaReport(successResults));
  }
}

/** AI를 사용하여 통합 APA 보고서 생성 */
async function generateIntegratedApaReport(results) {
  const reportDiv = document.getElementById('apa-ai-report');
  if (!reportDiv) return;

  reportDiv.style.display = 'block';
  reportDiv.innerHTML = '<div class="loading-text">📝 APA 스타일 통합 보고서 생성 중...</div>';

  try {
    // 모든 결과의 stdout를 합침
    let combinedStdout = '';
    let allImages = [];
    for (const r of results) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = r.html;
      const stdout = tempDiv.querySelector('.python-stdout');
      if (stdout) combinedStdout += `\n=== ${r.label} ===\n${stdout.textContent}\n`;
      tempDiv.querySelectorAll('.apa-figure img').forEach(img => {
        if (img.src) allImages.push(img.src);
      });
    }

    const state = getState();
    const apiKey = state.apiKey;
    const methods = getMethods();
    const paperContext = getPaperContext();
    const currentMethod = methods[currentMethodIndex] || {};
    const design = currentMethod.analysis_design || {};
    const context = {
      stepTitle: 'Integrated Analysis',
      stepDescription: results.map(r => r.label).join(', '),
      analysisType: currentMethod.analysis_type || '',
      domain: paperContext?.domain || '',
      outcome: currentMethod.key_variables?.outcome || '',
      treatment: currentMethod.key_variables?.treatment || '',
      framework: design.framework || 'none',
      mediator: design.mediator || '',
      moderator: design.moderator || '',
    };

    const apa = await generateApaReport(apiKey, combinedStdout, context);

    let html = '<div class="apa-report-content">';
    html += '<div class="result-badge apa-badge">📝 APA 7th Edition 결과 보고서</div>';

    if (apa.text) {
      html += '<div class="apa-text-section"><h4>결과 보고 (Results)</h4>';
      html += `<div class="apa-report-text">${renderApaText(apa.text)}</div>`;
      html += '</div>';
    }
    if (apa.figureCaption && allImages.length > 0) {
      html += '<div class="apa-text-section"><h4>Figure Caption</h4>';
      html += renderApaFigures(allImages, 1, apa.figureCaption);
      html += '</div>';
    }
    if (apa.tableCaption) {
      html += '<div class="apa-text-section">';
      html += `<p class="apa-table-caption-text"><em>Table caption:</em> ${escapeHtml(apa.tableCaption)}</p>`;
      html += '</div>';
    }
    if (!apa.text && !apa.tableCaption && !apa.figureCaption) {
      html += '<div class="apa-text-section"><p style="color:#7f8c8d;">APA 보고서 생성에 실패했습니다.</p></div>';
    }
    html += '</div>';
    reportDiv.innerHTML = html;
  } catch (error) {
    console.error('APA 통합 보고서 생성 오류:', error);
    reportDiv.innerHTML = `<div class="pyodide-error">APA 보고서 생성 실패: ${escapeHtml(error.message)}</div>`;
  }
}

/**
 * 개별 분석 항목 Python 실행 (결과를 targetEl에 렌더링)
 */
async function executePythonForItem(code, targetEl) {
  // Pyodide 초기화
  if (!isPyodideReady() && !pyodideInitializing) {
    pyodideInitializing = true;
    const statusDiv = document.getElementById('pyodide-status-global');
    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = '<div class="pyodide-loading">🐍 Python 환경 로딩 중... (최초 1회, 약 5~10초)</div>';
    }
    try {
      await initPyodide((msg) => {
        if (statusDiv) statusDiv.innerHTML = `<div class="pyodide-loading">${escapeHtml(msg)}</div>`;
      });
    } catch (err) {
      pyodideInitializing = false;
      if (statusDiv) statusDiv.style.display = 'none';
      throw err;
    }
    pyodideInitializing = false;
    if (statusDiv) statusDiv.style.display = 'none';
  } else if (pyodideInitializing) {
    // 초기화 진행 중 → 잠시 대기 후 재시도
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!isPyodideReady()) {
      targetEl.innerHTML = '<div class="loading-text">Python 환경 로딩 대기 중...</div>';
      return;
    }
  }

  // CSV 데이터 준비
  let csvData = mockDataCache ? mockDataCache.csv : null;
  if (!csvData) {
    const ds = getDataStructure();
    if (ds && ds.variables && ds.variables.length > 0) {
      try {
        const pc = getPaperContext();
        mockDataCache = generateMockData(ds, 500, pc?.analysis_category || null);
        csvData = mockDataCache.csv;
      } catch (autoErr) {
        console.warn('자동 데이터 생성 실패:', autoErr.message);
      }
    }
  }
  if (!csvData) {
    targetEl.innerHTML = '<div class="pyodide-error">⚠️ 먼저 "논문 개요 & 데이터" 탭에서 🧪 실습 데이터 생성 버튼을 눌러주세요.</div>';
    return;
  }

  // 변수 자동감지 코드 주입
  const autoDetectPrefix = `
# === [AUTO] 변수 자동감지 ===
import pandas as pd
try:
    outcome
except NameError:
    _df_check = pd.read_csv('mock_data.csv')
    _num_df = _df_check.select_dtypes(include='number')
    _skip_cols = ['id', 'ID', 'entity_id', 'Unnamed: 0', 'year', 'time']
    _num_cols = [c for c in _num_df.columns if c not in _skip_cols]
    outcome = _num_cols[0] if len(_num_cols) > 0 else None
    treatment = _num_cols[1] if len(_num_cols) > 1 else None
    _remaining = [c for c in _num_cols if c != outcome and c != treatment]
    mediator = _remaining[0] if len(_remaining) > 0 else None
    moderator = _remaining[1] if len(_remaining) > 1 else None
    del _df_check, _num_df, _skip_cols, _num_cols, _remaining
`;
  const finalCode = autoDetectPrefix + '\n' + code;
  const result = await runPython(finalCode, csvData);

  // 결과 렌더링
  let html = '<div class="python-execution-result">';

  if (result.stdout && result.stdout.trim()) {
    html += '<div class="result-subsection">';
    html += `<pre class="python-stdout">${escapeHtml(result.stdout)}</pre>`;
    html += '</div>';
    const apaTableHtml = renderApaTable(result.stdout, 1);
    if (apaTableHtml) {
      html += '<div class="result-subsection">';
      html += '<h4>📑 APA Style Table</h4>';
      html += apaTableHtml;
      html += '</div>';
    }
  }

  if (result.images && result.images.length > 0) {
    html += '<div class="result-subsection">';
    html += `<h4>📊 Figure (${result.images.length}개)</h4>`;
    html += renderApaFigures(result.images, 1);
    html += '</div>';
  }

  if (result.error) {
    html += '<div class="result-subsection">';
    html += `<pre class="python-error">${escapeHtml(result.error)}</pre>`;
    html += '</div>';
  }

  if ((!result.stdout || !result.stdout.trim()) && (!result.images || result.images.length === 0) && !result.error) {
    html += '<div class="result-subsection"><p>코드가 실행되었으나 출력이 없습니다.</p></div>';
  }

  html += '</div>';
  targetEl.innerHTML = html;
}

async function executeAnalysisStep(methodIndex, stepId, code, lang, stepIdx) {
  try {
    const resultDiv = document.querySelector(`.step-result[data-step-idx="${stepIdx}"]`);
    if (!resultDiv) return;

    resultDiv.innerHTML = '<div class="loading-text">실행 중...</div>';
    resultDiv.style.display = 'block';

    const result = await executeStep(methodIndex, stepId, code, lang);

    // 결과 렌더링
    let resultHtml = '<div class="step-execution-result">';
    let hasContent = false;

    if (result.table) {
      resultHtml += '<div class="result-subsection"><h4>📊 결과 테이블</h4>';
      resultHtml += renderResultTable(result.table);
      resultHtml += '</div>';
      hasContent = true;
    }

    if (result.chartDesc) {
      resultHtml += '<div class="result-subsection"><h4>📈 차트 설명</h4>';
      resultHtml += `<p>${escapeHtml(result.chartDesc)}</p>`;
      resultHtml += '</div>';
      hasContent = true;
    }

    if (result.interpretation) {
      resultHtml += '<div class="result-subsection"><h4>🔍 해석</h4>';
      resultHtml += markdownToHtml(result.interpretation);
      resultHtml += '</div>';
      hasContent = true;
    }

    if (result.paperComparison) {
      resultHtml += '<div class="result-subsection"><h4>📄 논문 비교</h4>';
      resultHtml += markdownToHtml(result.paperComparison);
      resultHtml += '</div>';
      hasContent = true;
    }

    // 이슈 15: 모든 섹션이 비어있을 때 fallback 메시지
    if (!hasContent) {
      resultHtml += '<div class="result-subsection" style="color: #856404; background: #fff3cd; padding: 12px; border-radius: 6px;">';
      resultHtml += '<p>AI 시뮬레이션 결과를 생성하지 못했습니다. 다시 시도해주세요.</p>';
      resultHtml += '<p style="font-size: 0.85em; margin-top: 4px;">원인: API 응답 파싱 실패 또는 빈 응답</p>';
      resultHtml += '</div>';
    }

    resultHtml += '</div>';
    resultDiv.innerHTML = resultHtml;
  } catch (error) {
    console.error('스텝 실행 오류:', error);
    const resultDiv = document.querySelector(`.step-result[data-step-idx="${stepIdx}"]`);
    if (resultDiv) {
      resultDiv.innerHTML = `<p style="color: #e74c3c;">오류: ${escapeHtml(error.message)}</p>`;
      resultDiv.style.display = 'block';
    }
  }
}

/**
 * Python 코드를 Pyodide로 실제 실행
 * @param {string} code — Python 코드
 * @param {number} stepIdx — Step 인덱스 (결과 렌더링 위치)
 */
async function executePythonStep(code, stepIdx) {
  const resultDiv = document.querySelector(`.step-result[data-step-idx="${stepIdx}"]`);
  const statusDiv = document.querySelector(`.pyodide-status[data-step-idx="${stepIdx}"]`);
  if (!resultDiv) return;

  // Pyodide 초기화 (최초 1회)
  if (!isPyodideReady() && !pyodideInitializing) {
    pyodideInitializing = true;
    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = '<div class="pyodide-loading">🐍 Python 환경 로딩 중... (최초 1회, 약 5~10초)</div>';
    }
    try {
      await initPyodide((msg) => {
        if (statusDiv) statusDiv.innerHTML = `<div class="pyodide-loading">${escapeHtml(msg)}</div>`;
      });
    } catch (err) {
      if (statusDiv) {
        statusDiv.innerHTML = `<div class="pyodide-error">❌ Python 환경 로드 실패: ${escapeHtml(err.message)}</div>`;
      }
      pyodideInitializing = false;
      return;
    }
    pyodideInitializing = false;
    if (statusDiv) statusDiv.style.display = 'none';
  } else if (pyodideInitializing) {
    // 이미 초기화 중이면 대기
    resultDiv.innerHTML = '<div class="loading-text">Python 환경 로딩 대기 중...</div>';
    resultDiv.style.display = 'block';
    return;
  }

  // 실행 중 UI
  resultDiv.innerHTML = '<div class="loading-text">🐍 Python 코드 실행 중...</div>';
  resultDiv.style.display = 'block';

  try {
    // CSV 데이터 준비 — 없으면 자동 생성 시도
    let csvData = mockDataCache ? mockDataCache.csv : null;
    if (!csvData) {
      const ds = getDataStructure();
      if (ds && ds.variables && ds.variables.length > 0) {
        try {
          const pc = getPaperContext();
          mockDataCache = generateMockData(ds, 500, pc?.analysis_category || null);
          csvData = mockDataCache.csv;
          const statusEl = $('mockdata-status');
          if (statusEl) statusEl.innerHTML = `<p style="color: #27ae60;">✅ 실습용 데이터 자동 생성 (${mockDataCache.data.length}행 × ${mockDataCache.variables.length}변수)</p>`;
        } catch (autoErr) {
          console.warn('자동 데이터 생성 실패:', autoErr.message);
        }
      }
    }
    if (!csvData) {
      resultDiv.innerHTML = '<div class="pyodide-error">⚠️ 먼저 "논문 개요 & 데이터" 탭에서 🧪 실습 데이터 생성 버튼을 눌러주세요.<br><small>또는 내 CSV 파일을 업로드할 수 있습니다.</small></div>';
      return;
    }

    // 변수 자동감지 코드 주입 (모든 Python 실행 시 공통)
    // 이미 outcome/treatment/mediator 등이 정의되어 있으면 스킵
    const autoDetectPrefix = `
# === [AUTO] 변수 자동감지 ===
import pandas as pd
try:
    outcome
except NameError:
    _df_check = pd.read_csv('mock_data.csv')
    _num_df = _df_check.select_dtypes(include='number')
    _skip_cols = ['id', 'ID', 'entity_id', 'Unnamed: 0', 'year', 'time']
    _num_cols = [c for c in _num_df.columns if c not in _skip_cols]
    outcome = _num_cols[0] if len(_num_cols) > 0 else None
    treatment = _num_cols[1] if len(_num_cols) > 1 else None
    _remaining = [c for c in _num_cols if c != outcome and c != treatment]
    mediator = _remaining[0] if len(_remaining) > 0 else None
    moderator = _remaining[1] if len(_remaining) > 1 else None
    del _df_check, _num_df, _skip_cols, _num_cols, _remaining
`;
    const finalCode = autoDetectPrefix + '\n' + code;

    // 실행
    const result = await runPython(finalCode, csvData);

    // 결과 렌더링
    let html = '<div class="python-execution-result">';
    html += '<div class="result-badge python-badge">🐍 Python 실행 결과</div>';

    // stdout 출력
    if (result.stdout && result.stdout.trim()) {
      html += '<div class="result-subsection">';
      html += '<h4>📋 출력 (stdout)</h4>';
      html += `<pre class="python-stdout">${escapeHtml(result.stdout)}</pre>`;
      html += '</div>';

      // APA 테이블 자동 변환
      const apaTableHtml = renderApaTable(result.stdout, 1);
      if (apaTableHtml) {
        html += '<div class="result-subsection">';
        html += '<h4>📑 APA Style Table</h4>';
        html += apaTableHtml;
        html += '</div>';
      }
    }

    // 그래프 이미지 (APA Figure 스타일)
    if (result.images && result.images.length > 0) {
      html += '<div class="result-subsection">';
      html += `<h4>📊 APA Figure (${result.images.length}개)</h4>`;
      html += renderApaFigures(result.images, 1);
      html += '</div>';
    }

    // 에러 (부분 실행 성공 + 에러)
    if (result.error) {
      html += '<div class="result-subsection">';
      html += '<h4>⚠️ 오류</h4>';
      html += `<pre class="python-error">${escapeHtml(result.error)}</pre>`;
      html += '</div>';
    }

    // 출력이 전혀 없을 때
    if ((!result.stdout || !result.stdout.trim()) && (!result.images || result.images.length === 0) && !result.error) {
      html += '<div class="result-subsection"><p>코드가 실행되었으나 출력이 없습니다.</p></div>';
    }

    // APA 보고서 생성 버튼 (stdout이 있을 때만)
    if (result.stdout && result.stdout.trim() && !result.error) {
      html += `<div class="apa-report-action">`;
      html += `<button class="btn-apa-report" data-step-idx="${stepIdx}">📝 APA 스타일 해석 보고서 생성</button>`;
      html += `</div>`;
      html += `<div class="apa-report-result" data-step-idx="${stepIdx}" style="display:none;"></div>`;
    }

    html += '</div>';
    resultDiv.innerHTML = html;

    // APA 보고서 생성 버튼 이벤트 바인딩
    const apaBtn = resultDiv.querySelector(`.btn-apa-report[data-step-idx="${stepIdx}"]`);
    if (apaBtn) {
      apaBtn.addEventListener('click', async () => {
        await generateAndRenderApaReport(stepIdx, result.stdout, result.images);
      });
    }
  } catch (error) {
    console.error('Python 실행 오류:', error);
    resultDiv.innerHTML = `<div class="pyodide-error">❌ 실행 오류: ${escapeHtml(error.message)}</div>`;
  }
}

/**
 * APA 스타일 해석 보고서 생성 (Gemini 호출)
 * @param {number} stepIdx
 * @param {string} stdout — Python 실행 결과
 * @param {string[]} images — 그래프 이미지 (base64)
 */
async function generateAndRenderApaReport(stepIdx, stdout, images) {
  const reportDiv = document.querySelector(`.apa-report-result[data-step-idx="${stepIdx}"]`);
  if (!reportDiv) return;

  reportDiv.style.display = 'block';
  reportDiv.innerHTML = '<div class="loading-text">📝 APA 스타일 보고서 생성 중...</div>';

  try {
    const state = getState();
    const apiKey = state.apiKey;
    const methods = getMethods();
    const paperContext = getPaperContext();
    const currentMethod = methods[currentMethodIndex] || {};

    const design = currentMethod.analysis_design || {};
    const context = {
      stepTitle: document.querySelector(`.step-card[data-step-idx="${stepIdx}"] .step-title`)?.textContent || '',
      stepDescription: document.querySelector(`.step-card[data-step-idx="${stepIdx}"] .step-description`)?.textContent || '',
      analysisType: currentMethod.analysis_type || '',
      domain: paperContext?.domain || '',
      outcome: currentMethod.key_variables?.outcome || '',
      treatment: currentMethod.key_variables?.treatment || '',
      framework: design.framework || 'none',
      mediator: design.mediator || '',
      moderator: design.moderator || '',
    };

    const apa = await generateApaReport(apiKey, stdout, context);

    let html = '<div class="apa-report-content">';
    html += '<div class="result-badge apa-badge">📝 APA 7th Edition 결과 보고서</div>';

    // APA 텍스트 보고
    if (apa.text) {
      html += '<div class="apa-text-section">';
      html += '<h4>결과 보고 (Results)</h4>';
      html += `<div class="apa-report-text">${renderApaText(apa.text)}</div>`;
      html += '</div>';
    }

    // APA Figure caption 업데이트
    if (apa.figureCaption && images && images.length > 0) {
      html += '<div class="apa-text-section">';
      html += '<h4>Figure Caption</h4>';
      html += renderApaFigures(images, 1, apa.figureCaption);
      html += '</div>';
    }

    // Table caption
    if (apa.tableCaption) {
      html += '<div class="apa-text-section">';
      html += `<p class="apa-table-caption-text"><em>Table caption:</em> ${escapeHtml(apa.tableCaption)}</p>`;
      html += '</div>';
    }

    // 모든 섹션이 비어있으면 안내 메시지
    if (!apa.text && !apa.tableCaption && !apa.figureCaption) {
      html += '<div class="apa-text-section"><p style="color:#7f8c8d;">APA 보고서 생성에 실패했습니다. 분석 결과가 충분하지 않거나 API 응답이 비어있을 수 있습니다.</p></div>';
    }

    html += '</div>';
    reportDiv.innerHTML = html;
  } catch (error) {
    console.error('APA 보고서 생성 오류:', error);
    reportDiv.innerHTML = `<div class="pyodide-error">APA 보고서 생성 실패: ${escapeHtml(error.message)}</div>`;
  }
}

function updatePracticeStepsForLanguage() {
  // Phase 7: Python 전용 — 리본 UI 다시 렌더링
  loadAndRenderAnalysisSteps(currentMethodIndex);
}

/**
 * 결과 테이블 렌더링 — 마크다운 테이블 문자열을 HTML로 변환
 * simulator.js가 마크다운 테이블 형식으로 반환하므로 문자열을 파싱
 * @param {string|Array} tableData — 마크다운 테이블 문자열 또는 객체 배열
 * @returns {string} HTML
 */
function renderResultTable(tableData) {
  if (!tableData) return '';

  // 문자열(마크다운 테이블)인 경우 — simulator.js 기본 반환 형식
  if (typeof tableData === 'string') {
    return markdownTableToHtml(tableData);
  }

  // 배열인 경우 — 직접 테이블 생성
  if (Array.isArray(tableData) && tableData.length > 0) {
    const headers = Object.keys(tableData[0]);
    let html = '<table class="result-table"><thead><tr>';
    headers.forEach(h => { html += `<th>${escapeHtml(h)}</th>`; });
    html += '</tr></thead><tbody>';
    tableData.forEach(row => {
      html += '<tr>';
      headers.forEach(h => {
        let value = row[h];
        if (typeof value === 'number') value = value.toFixed(4);
        html += `<td>${escapeHtml(String(value ?? ''))}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  return '<p>데이터 없음</p>';
}

/**
 * 마크다운 테이블 문자열 → HTML 테이블 변환
 * @param {string} md — | col1 | col2 | 형식의 마크다운
 * @returns {string} HTML
 */
function markdownTableToHtml(md) {
  if (!md || !md.includes('|')) return `<div class="result-text">${markdownToHtml(md)}</div>`;

  const lines = md.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return `<div class="result-text">${markdownToHtml(md)}</div>`;

  let html = '<table class="result-table">';

  lines.forEach((line, idx) => {
    // 구분선(---) 건너뛰기
    if (/^\|[\s\-:]+\|$/.test(line.trim()) || /^[\s\-:|]+$/.test(line.trim())) return;

    const cells = line.split('|').filter(c => c.trim() !== '');
    if (cells.length === 0) return;

    if (idx === 0) {
      html += '<thead><tr>';
      cells.forEach(c => { html += `<th>${escapeHtml(c.trim())}</th>`; });
      html += '</tr></thead><tbody>';
    } else {
      html += '<tr>';
      cells.forEach(c => { html += `<td>${escapeHtml(c.trim())}</td>`; });
      html += '</tr>';
    }
  });

  html += '</tbody></table>';
  return html;
}

/* ============================================================================
   리뷰 & 대안 (Tab 3)
   ============================================================================ */

function setupReviewHandlers() {
  const subTabBtns = document.querySelectorAll('.interpret-sub-tab');
  const reviewSections = document.querySelectorAll('.review-section');

  subTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const subTab = btn.getAttribute('data-sub');

      subTabBtns.forEach(b => b.classList.remove('active'));
      reviewSections.forEach(s => s.classList.remove('active'));

      btn.classList.add('active');
      const targetSection = $(`review-${subTab}`);
      if (targetSection) {
        targetSection.classList.add('active');
      }
    });
  });

  // 리뷰 & 대안 생성 버튼
  const reviewBtn = $('review-generate-btn');
  if (reviewBtn) {
    reviewBtn.addEventListener('click', async () => {
      await generateReviewAndAlternatives(currentMethodIndex);
    });
  }
}

async function generateReviewAndAlternatives(methodIndex) {
  try {
    const peerSection = $('review-peer');
    const altSection = $('review-alt');
    const futureSection = $('review-future');

    if (peerSection) peerSection.innerHTML = '<div class="loading-text">로드 중...</div>';
    if (altSection) altSection.innerHTML = '<div class="loading-text">로드 중...</div>';
    if (futureSection) futureSection.innerHTML = '<div class="loading-text">로드 중...</div>';

    const result = await loadReview(methodIndex);

    if (peerSection && result.peer) {
      peerSection.innerHTML = markdownToHtml(result.peer);
    }
    if (altSection && result.alternatives) {
      altSection.innerHTML = markdownToHtml(result.alternatives);
    }
    if (futureSection && result.future) {
      futureSection.innerHTML = markdownToHtml(result.future);
    }
  } catch (error) {
    console.error('리뷰 로드 오류:', error);
    showStatus('리뷰를 로드할 수 없습니다.');
  }
}

function clearReviewSections() {
  const sections = document.querySelectorAll('.review-section');
  sections.forEach(s => {
    s.innerHTML = '';
  });
}

/* ============================================================================
   Q&A 채팅 (Tab 4)
   ============================================================================ */

function setupQnAHandlers() {
  const qnaInput = $('qna-input');
  const qnaSendBtn = $('qna-send');

  if (qnaSendBtn) {
    qnaSendBtn.addEventListener('click', async () => {
      const question = qnaInput ? qnaInput.value.trim() : '';
      if (!question) return;

      await sendQnAMessage(question);
      if (qnaInput) qnaInput.value = '';
    });
  }

  // 엔터 키 전송
  if (qnaInput) {
    qnaInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        qnaSendBtn.click();
      }
    });
  }
}

async function sendQnAMessage(question) {
  try {
    const chatDiv = $('qna-chat');
    if (!chatDiv) return;

    // 사용자 메시지 추가
    const userMsg = document.createElement('div');
    userMsg.className = 'qna-message user-message';
    userMsg.textContent = question;
    chatDiv.appendChild(userMsg);

    // 로딩 메시지
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'qna-message loading-message';
    loadingMsg.textContent = 'AI 응답 생성 중...';
    chatDiv.appendChild(loadingMsg);

    // 스크롤 하단으로
    chatDiv.scrollTop = chatDiv.scrollHeight;

    // AI 응답 가져오기
    const answer = await sendQnA(question);

    // 로딩 메시지 제거
    loadingMsg.remove();

    // AI 응답 추가
    const aiMsg = document.createElement('div');
    aiMsg.className = 'qna-message ai-message';
    aiMsg.innerHTML = markdownToHtml(answer);
    chatDiv.appendChild(aiMsg);

    chatDiv.scrollTop = chatDiv.scrollHeight;
  } catch (error) {
    console.error('Q&A 오류:', error);
    const chatDiv = $('qna-chat');
    if (chatDiv) {
      const errMsg = document.createElement('div');
      errMsg.className = 'qna-message error-message';
      errMsg.textContent = `오류: ${error.message}`;
      chatDiv.appendChild(errMsg);
    }
  }
}

/* ============================================================================
   홈 링크 핸들러 (새 논문 분석)
   ============================================================================ */

function setupHomeLink() {
  const homeLink = document.querySelector('.home-link');
  if (homeLink) {
    homeLink.addEventListener('click', () => {
      // pipeline 상태 초기화
      resetState();

      // UI 상태 초기화
      mockDataCache = null;
      currentMethodIndex = 0;
      currentLanguage = 'python';

      // 입력 뷰로 돌아가기
      showInputView();

      // PDF 파일 입력 초기화
      const pdfInput = $('pdf-file');
      if (pdfInput) pdfInput.value = '';

      showPdfFileName('파일을 선택해주세요');
    });
  }
}

/* ============================================================================
   프린트 핸들러
   ============================================================================ */

function setupPrintButton() {
  const printBtn = $('print-btn');
  if (!printBtn) return;

  printBtn.addEventListener('click', () => {
    // 프린트 전: 모든 탭 패널을 보이게 하여 전체 내용 인쇄
    const panels = document.querySelectorAll('.result-panel');
    panels.forEach(p => p.classList.add('print-visible'));

    window.print();

    // 프린트 후: 원래 상태 복원
    panels.forEach(p => p.classList.remove('print-visible'));
  });
}

/* ============================================================================
   실습 데이터 생성 (Mock Data)
   ============================================================================ */

function setupMockDataGeneration() {
  const mockDataBtn = $('gen-mockdata-btn');
  const downloadCsvBtn = $('download-csv-btn');
  const uploadCsvBtn = $('upload-csv-btn');
  const csvFileInput = $('csv-file-input');
  const mockDataStatus = $('mockdata-status');
  const dataPreview = $('data-preview');

  // ===== 가상 데이터 생성 =====
  if (mockDataBtn) {
    mockDataBtn.addEventListener('click', async () => {
      try {
        mockDataBtn.disabled = true;
        if (mockDataStatus) mockDataStatus.innerHTML = '<div class="loading-text">데이터 생성 중...</div>';

        const dataStructure = getDataStructure();
        const pc = getPaperContext();
        mockDataCache = generateMockData(dataStructure, 500, pc?.analysis_category || null);
        // mockDataCache = { csv, data, variables }

        if (mockDataStatus) {
          mockDataStatus.innerHTML = `<p style="color: #27ae60;">✅ 데이터 생성 완료 (${mockDataCache.data.length}행 × ${mockDataCache.variables.length}변수)</p>`;
        }

        if (downloadCsvBtn) downloadCsvBtn.style.display = 'inline-block';

        // 데이터 프리뷰 렌더링
        renderDataPreview(mockDataCache.data, mockDataCache.variables);
      } catch (error) {
        console.error('Mock 데이터 생성 오류:', error);
        if (mockDataStatus) {
          mockDataStatus.innerHTML = `<p style="color: #e74c3c;">❌ 오류: ${escapeHtml(error.message)}</p>`;
        }
      } finally {
        mockDataBtn.disabled = false;
      }
    });
  }

  // ===== CSV 다운로드 =====
  if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener('click', () => {
      try {
        if (!mockDataCache || !mockDataCache.csv) {
          showStatus('먼저 실습 데이터를 생성해주세요.');
          return;
        }
        downloadCSV(mockDataCache.csv, 'mock_data.csv');
        showStatus('CSV 파일이 다운로드되었습니다.');
      } catch (error) {
        console.error('CSV 다운로드 오류:', error);
        showStatus('CSV 다운로드 중 오류가 발생했습니다.');
      }
    });
  }

  // ===== CSV 업로드 =====
  if (uploadCsvBtn && csvFileInput) {
    uploadCsvBtn.addEventListener('click', () => csvFileInput.click());
    csvFileInput.addEventListener('change', () => {
      const file = csvFileInput.files[0];
      if (!file) return;
      handleCsvUpload(file);
    });
  }
}

/**
 * CSV 파일 업로드 처리
 * @param {File} file
 */
function handleCsvUpload(file) {
  const mockDataStatus = $('mockdata-status');
  const downloadCsvBtn = $('download-csv-btn');

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const { data, variables, csv } = parseCsvText(text);

      if (data.length === 0) {
        if (mockDataStatus) mockDataStatus.innerHTML = '<p style="color: #e74c3c;">❌ CSV 파일에 데이터가 없습니다.</p>';
        return;
      }

      mockDataCache = { csv: text, data, variables };

      if (mockDataStatus) {
        mockDataStatus.innerHTML = `<p style="color: #27ae60;">✅ 데이터 업로드 완료: ${file.name} (${data.length}행 × ${variables.length}변수)</p>`;
      }
      if (downloadCsvBtn) downloadCsvBtn.style.display = 'inline-block';

      renderDataPreview(data, variables);
    } catch (err) {
      console.error('CSV 파싱 오류:', err);
      if (mockDataStatus) {
        mockDataStatus.innerHTML = `<p style="color: #e74c3c;">❌ CSV 파싱 오류: ${escapeHtml(err.message)}</p>`;
      }
    }
  };
  reader.readAsText(file, 'UTF-8');
}

/**
 * CSV 텍스트를 파싱하여 data 배열 + variables 배열로 변환
 * @param {string} text — CSV 텍스트
 * @returns {{ data: Array<Object>, variables: Array, csv: string }}
 */
function parseCsvText(text) {
  // BOM 제거
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter(line => line.trim());

  if (lines.length < 2) throw new Error('헤더와 데이터가 최소 1행 필요합니다.');

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const variables = headers.map(name => ({
    name_en: name,
    name_kr: name,
    type: 'continuous',
    role: 'unknown',
  }));

  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const val = values[j];
      // 숫자 여부 판별
      const num = Number(val);
      row[headers[j]] = (val !== '' && !isNaN(num)) ? num : val;
    }
    data.push(row);
  }

  // 변수 타입 추론
  for (const v of variables) {
    const vals = data.map(r => r[v.name_en]).filter(x => x !== '' && x !== undefined);
    const numericCount = vals.filter(x => typeof x === 'number').length;
    if (numericCount < vals.length * 0.5) {
      v.type = 'categorical';
    } else {
      const uniq = new Set(vals);
      if (uniq.size <= 2 && vals.every(x => x === 0 || x === 1)) {
        v.type = 'binary';
      }
    }
  }

  return { data, variables, csv: cleaned };
}

/**
 * 데이터 프리뷰 테이블 렌더링 (최대 20행)
 * @param {Array<Object>} data
 * @param {Array} variables
 */
function renderDataPreview(data, variables) {
  const container = $('data-preview');
  if (!container) return;

  const maxRows = 20;
  const displayData = data.slice(0, maxRows);
  const headers = variables.map(v => v.name_en);

  let html = `<div class="data-preview-header">
    <span class="info-badge">📊 데이터 프리뷰 (${data.length}행 중 상위 ${Math.min(maxRows, data.length)}행)</span>
  </div>`;

  html += '<div class="data-table-scroll"><table class="data-preview-table"><thead><tr>';
  html += '<th>#</th>';
  for (const h of headers) {
    html += `<th>${escapeHtml(h)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let i = 0; i < displayData.length; i++) {
    html += `<tr><td class="row-num">${i + 1}</td>`;
    for (const h of headers) {
      const val = displayData[i][h];
      const display = val !== undefined && val !== null ? String(val) : '';
      html += `<td>${escapeHtml(display)}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';

  if (data.length > maxRows) {
    html += `<div class="data-preview-footer">... ${data.length - maxRows}행 더 있음</div>`;
  }

  container.innerHTML = html;
  container.style.display = 'block';
}

/* ============================================================================
   Markdown to HTML 변환
   ============================================================================ */

function markdownToHtml(markdown) {
  if (!markdown) return '';

  // HTML 특수문자 이스케이프 (줄바꿈은 보존 — 마크다운 패턴 매칭에 필수)
  let html = String(markdown)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // 섹션 구분자 제거 (===PEER_REVIEW===, ===END_PEER_REVIEW=== 등)
  html = html.replace(/^===\w+===\s*$/gm, '');

  // 코드 블록 (```lang ... ``` → <pre><code>...</code></pre>)
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    return '\n<pre><code>' + code.trim() + '</code></pre>\n';
  });

  // 인라인 코드 (`code` → <code>code</code>)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 헤더 (#### → h5, ### → h4, ## → h3, # → h2)
  html = html.replace(/^####\s+(.*?)$/gm, '<h5>$1</h5>');
  html = html.replace(/^###\s+(.*?)$/gm, '<h4>$1</h4>');
  html = html.replace(/^##\s+(.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#\s+(.*?)$/gm, '<h2>$1</h2>');

  // 굵은 글씨 (**text** → <strong>)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 기울임 (*text* → <em>, ** 내부가 아닌 경우만)
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

  // 수평선 (---, ***)
  html = html.replace(/^[-*]{3,}\s*$/gm, '<hr>');

  // 비순서 리스트 (연속된 - 또는 * 항목을 <ul>로 묶기)
  html = html.replace(/(^[-*]\s+.+(\n|$))+/gm, (block) => {
    const items = block.trim().split('\n').map(line => {
      const content = line.replace(/^[-*]\s+/, '');
      return '<li>' + content + '</li>';
    }).join('\n');
    return '<ul>\n' + items + '\n</ul>\n';
  });

  // 순서 리스트 (연속된 1. 2. 항목을 <ol>로 묶기)
  html = html.replace(/(^\d+\.\s+.+(\n|$))+/gm, (block) => {
    const items = block.trim().split('\n').map(line => {
      const content = line.replace(/^\d+\.\s+/, '');
      return '<li>' + content + '</li>';
    }).join('\n');
    return '<ol>\n' + items + '\n</ol>\n';
  });

  // 빈 줄 → 문단 구분, 나머지 줄바꿈 → <br>
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';

  // 블록 요소 주변의 불필요한 <p>, <br> 정리
  const blocks = 'h[2-5]|ul|ol|pre|hr';
  html = html.replace(new RegExp(`<p>(<br>)*\\s*(<(?:${blocks})[>\\s])`, 'g'), '$2');
  html = html.replace(new RegExp(`(</(?:${blocks})>)(<br>)*\\s*</p>`, 'g'), '$1');
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<br>)+/g, '<p>');
  html = html.replace(/(<br>)+<\/p>/g, '</p>');

  // <ul>, <ol>, <pre> 내부 불필요한 <br> 제거
  html = html.replace(/<ul>(<br>)*/g, '<ul>');
  html = html.replace(/(<br>)*<\/ul>/g, '</ul>');
  html = html.replace(/<ol>(<br>)*/g, '<ol>');
  html = html.replace(/(<br>)*<\/ol>/g, '</ol>');
  html = html.replace(/<\/li>(<br>)*<li>/g, '</li><li>');
  html = html.replace(/<\/h([2-5])>(<br>)*/g, '</h$1>');
  html = html.replace(/(<br>)*<h([2-5])/g, '<h$2');

  // <pre> 내부 <br> → 실제 줄바꿈으로 복원
  html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (_, code) => {
    return '<pre><code>' + code.replace(/<br>/g, '\n') + '</code></pre>';
  });

  // 연속 <br> 정리
  html = html.replace(/(<br>\s*){3,}/g, '<br><br>');

  return html;
}
