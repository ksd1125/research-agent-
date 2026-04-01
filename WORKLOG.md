# ResearchMethodAgent v5.0 — 작업 로그 및 인수인계 문서

> **지침**: 이 파일은 세션 간 연속성을 위한 핵심 문서입니다.
> 각 작업 세션이 시작될 때 이 파일을 반드시 먼저 읽고, 작업이 끝나면 반드시 업데이트하세요.
> 토큰이 떨어져 멈출 수 있으므로, **큰 작업 단위가 끝날 때마다** 이 파일을 갱신하세요.

---

## 현재 상태 (2026-04-01 세션9 업데이트)

### 프로젝트 위치
- **작업 폴더**: `C:\Users\sudon\Desktop\cowork\work` (PC2)
- **작업 폴더 (PC1)**: `C:\Users\김수동\Desktop\cowork\PROJECTS\research-agent`
- **배포 URL**: https://ksd1125.github.io/research-agent-/
- **리뷰 문서**: `C:\Users\김수동\Desktop\cowork\OUTPUTS\ResearchMethodAgent_Review`

### 기술 스택
- Frontend: Vanilla JS (ES Modules), HTML5, CSS3
- LLM: Gemini 2.5 Flash API
- PDF: pdf.js v3.11.174 (CDN) + Gemini 멀티모달 (base64)
- Python 실행: Pyodide v0.26.4 (브라우저 내 WebAssembly)
- 배포: GitHub Pages

### v5.0 구조 (4탭)
1. **논문 개요 & 데이터** — Agent1(문서분석) → Agent4+(데이터구조) → 변수테이블 + Mock데이터
2. **분석 실습** — Agent2(통계해석) + steps.js → [Python 실행] / [AI 시뮬레이션]
3. **리뷰 & 대안** — Agent6+(동료리뷰/대안방법론/후속연구)
4. **Q&A** — Agent5(논문맥락 기반 질의응답)

---

## 해결된 이슈

### ✅ 이슈 1: 빈데이터 문제 (P1) — 해결됨 (세션2)
- `js/mockdata.js`에 `estimateVariableStats()` 추가 — 변수명/type/role 기반 합리적 통계 추정
- `generateMockData()` 기본 500행, enrichedVars로 빠진 통계 자동 보완
- 추정값은 변수 테이블에서 이탤릭 + "~" 표시로 구분

### ✅ 이슈 2: 분석실습 탭 CSV 연결 (P1) — 해결됨 (세션2)
- `renderInitialResult()` 후 자동으로 `generateMockData()` 호출 → mockDataCache 세팅
- 탭2 Python 실행 시 mockDataCache 없으면 자동 생성 시도 (이중 안전장치)

### ✅ 이슈 3: Pyodide 최적화 (P2) — 해결됨 (세션2)
- 기본 패키지 일괄 로드, statsmodels 기본 추가
- 싱글톤 + installedPackages Set 중복 방지

### ✅ 이슈 4: API 키 입력 UI — 해결됨 (세션1)

### ✅ 이슈 5: steps.js 전용 Step 확장 — 해결됨 (세션3)
- 기존: regression, causal_inference, experimental (3개만 전용)
- 추가: spatial, time_series, machine_learning, causal_ml, bayesian, sem, survival, meta_analysis, unstructured_data (9개 추가, 총 12개 완성)
- 각 카테고리 4단계 (전처리 → 기본모형 → 고급분석 → 시각화)

### ✅ 이슈 6: pipeline.js 리뷰 캐시 버그 — 해결됨 (세션3)
- `loadReview()`: 전역 `reviewResult` → `reviewResults[methodIndex]` (methodIndex별 캐시)

### ✅ 이슈 7: 코드 정리 — 해결됨 (세션4)
- `pipeline.js`: 미사용 import `getAnalysisProfile` 제거
- `pipeline.js`: `reviewResults: {}` 초기 state에 명시적 선언 추가 (기존 lazy init → 명시적)
- `js/index.html`: v4 레거시 파일 → `index.html.bak-v4`로 이름 변경

### ✅ 이슈 9: 리뷰 대안/후속연구 미생성 — 해결됨 (세션5)
- **원인**: review 토큰 한도 8000이 부족 → Gemini가 동료 리뷰만 생성 후 응답 잘림
- **수정 (config.js)**: `review` 토큰 8000 → 16000 증가
- **수정 (agents.js)**: 프롬프트에 3개 섹션 필수 포함 강조 + 간결성 지시

### ✅ 이슈 8: markdownToHtml() 렌더링 버그 — 해결됨 (세션4, 세션5 검증)
- **근본 원인**: `escapeHtml()`이 `\n`을 `<br>`로 먼저 변환 → 이후 `^### ` 같은 줄 시작 패턴이 매칭 불가
- **수정 (ui.js)**: `markdownToHtml()` 완전 재작성
  - HTML 이스케이프 시 줄바꿈 보존
  - `===SECTION===` 구분자 자동 제거
  - 헤더(h2~h5), 볼드, 이탤릭, 수평선 변환
  - 연속 리스트 항목을 `<ul>`/`<ol>`로 자동 묶기
  - 코드 블록(```` ``` ````) 지원 + 내부 줄바꿈 보존
  - 블록 요소 주변 불필요한 `<p>`/`<br>` 자동 정리
- **수정 (agents.js)**: `runReviewGuide()` 파싱 견고화
  - end marker 누락 시 다음 섹션 시작을 경계로 사용
  - 완전 파싱 실패 시 구분자 제거 후 반환

### ✅ 이슈 10: 데이터 구조 추출 실패 (Agent4+) — 해결됨 (세션7)
- **원인**: agent4Plus 토큰 한도 4000이 변수 10~15개 JSON에 부족 → JSON 중간 절삭으로 파싱 실패
- **수정 (config.js)**: `agent4Plus: 4000` → `8000`
- **수정 (agents.js)**: `callGemini()`에 `{ jsonMode }` 옵션 추가, Agent1/Agent4+에서 `responseMimeType: 'application/json'` 활성화

### ✅ 이슈 11: 분석실습 Python 코드 SyntaxError — 해결됨 (세션7)
- **원인**: `escapeHtml()`이 `<pre><code>` 블록 내에서도 `\n`→`<br>` 변환 → `textContent` 읽기 시 줄바꿈 소실
- **수정 (utils.js)**: `escapeCode()` 함수 신규 — HTML 특수문자만 이스케이프, `\n` 보존
- **수정 (ui.js)**: 코드 블록 렌더링에서 `escapeHtml(code)` → `escapeCode(code)` 교체

### ✅ 이슈 12: Agent2 jsonMode 누락 — 해결됨 (세션7)
- **원인**: `runAgent2()`의 `callGemini()` 호출에 `{ jsonMode: true }` 미적용 → Gemini가 JSON을 마크다운 코드블록으로 감쌀 가능성
- **수정 (agents.js)**: `callGemini(apiKey, prompt, API.tokens.agent2, { jsonMode: true })` 추가

### ✅ 이슈 13: Agent3 Meta jsonMode 누락 — 해결됨 (세션7)
- **원인**: `buildAgent3MetaPrompt()` 호출 시 `{ jsonMode: true }` 미적용 → 패키지 목록 JSON 파싱 실패 가능
- **수정 (agents.js)**: `callGemini()` 호출에 `{ jsonMode: true }` 추가

### ✅ 이슈 14: structure_diagram escapeHtml 오용 — 해결됨 (세션7)
- **원인**: `ui.js`에서 structure_diagram을 `<code>` 태그 내에 렌더링할 때 `escapeHtml()` 사용 → `\n`→`<br>` 변환으로 다이어그램 깨짐
- **수정 (ui.js)**: `escapeHtml(dataStructure.structure_diagram)` → `escapeCode(dataStructure.structure_diagram)`

### ✅ 이슈 15: Step3 기본 고정효과 모형 AI 시뮬레이션 결과 빈 박스 — 해결됨 (세션8)
- **증상**: AI 시뮬레이션 버튼 클릭 후 결과 영역이 빈 상태
- **원인**: `ui.js`에서 모든 subsection이 비어있을 때 빈 div만 표시, fallback 메시지 없음
- **수정 (ui.js)**: `hasContent` 플래그 추가, 모든 섹션 비어있으면 경고 메시지(노란색 박스) 표시

### ✅ 이슈 16: Step4 확장 모형 — \`\`\`markdown 코드펜스 표시 — 해결됨 (세션8)
- **증상**: AI 시뮬레이션 결과 테이블 상단에 \`\`\`markdown이 그대로 표시됨
- **원인**: Gemini가 마크다운 코드블록으로 응답을 감싸서 반환 → delimiter 파싱 실패
- **수정 (simulator.js)**: `parseSimulationResult()`에 코드펜스 스트리핑(`raw.replace(/```[\w]*\n?...```/g, '$1')`) 추가. stripped 우선 매칭, raw 폴백

### ✅ 이슈 17: AI 시뮬레이션 변수명 탭1과 불일치 — 해결됨 (세션8)
- **증상**: 탭1 변수 테이블(net_job_creation, firm_size)과 AI 시뮬레이션(net_employment_creation, log_firm_size) 변수명이 다름
- **원인**: simulator.js 프롬프트에 Agent4+ 변수 정보가 주입되지 않음
- **수정 (pipeline.js)**: context에 `variableNames` 배열 추가 (Agent4+ 변수 목록)
- **수정 (simulator.js)**: 프롬프트에 변수 목록 명시 + "반드시 이 변수명을 사용하세요" 강제 지시

### ✅ 이슈 18: Python 실행 `linearmodels` 패키지 없음 — 해결됨 (세션8)
- **증상**: causal_inference Python 실행 시 `ModuleNotFoundError: No module named 'linearmodels'`
- **원인**: Pyodide(WASM)에 linearmodels C 확장 패키지 미포함
- **수정**: steps.js 3곳 PanelOLS→sm.OLS+더미변수, RandomEffects→MixedLM / agents.js 2곳 라이브러리 목록에서 제거

### ✅ 이슈 19: mock 데이터에 패널 식별자(entity_id, year) 누락 — 해결됨 (세션8)
- **증상**: causal_inference 전 Step에서 `KeyError: 'entity_id'`
- **원인**: Agent4+가 추출한 변수에 entity_id/year가 없고, mockdata.js가 이를 자동 추가하지 않음
- **수정 (mockdata.js)**: `generateMockData(stats, n, category)` — category가 causal_inference/panel일 때 entity_id(250개체)×year(2015-2019) 패널 구조 자동 생성
- **수정 (ui.js)**: `generateMockData` 호출 3곳에 `ctx.analysis_category` 전달

### ✅ 이슈 20: steps.js에서 `treatment` 하드코딩 — 해결됨 (세션8)
- **증상**: `KeyError: 'treatment'` — mock 데이터에 treatment 컬럼 없음
- **원인**: 전처리/시각화 Step 코드에서 `df['treatment']` 하드코딩 (${treatment} 미사용)
- **수정 (steps.js)**: 전처리 코드에서 `treatment` → `${treatment}`, 시각화 코드에서 컬럼 존재 여부 확인 후 분기 처리

### ✅ 이슈 21: 범주형 컬럼에 수치 연산 시도 — 해결됨 (세션8)
- **증상**: `ValueError: could not convert string to float: '50-299인'`
- **원인**: firm_size, firm_age, employee_age 등 범주형 컬럼이 df.describe()/df.corr()/OLS에 포함
- **수정 (steps.js)**: 기술통계에서 `df.select_dtypes(include='number')` 사용, 통제변수 선택에서 수치형만 필터, 시각화 OLS에서 numeric_df 사용 (총 5곳)
- **증상**: 분석실습 탭에서 causal_inference 코드 Python 실행 시 `ModuleNotFoundError: No module named 'linearmodels'` (오류 폴더 스크린샷)
- **원인 분석**:
  - `steps.js`의 causal_inference 카테고리 3개 Step(baseline_fe, full_model_fe, robustness)에서 `from linearmodels.panel import PanelOLS, RandomEffects` 사용
  - `agents.js`의 `getAnalysisProfile()`에서도 causal_inference/panel Python 라이브러리에 `linearmodels` 포함
  - `pyodide-runner.js` 사전설치 패키지: micropip, pandas, numpy, scipy, matplotlib, statsmodels — **linearmodels 미포함**
  - `linearmodels`는 C 확장 의존성이 많아 Pyodide(WASM) 환경에서 micropip 동적 설치 실패 가능성 높음
- **수정 방향**: Option B 채택 — `linearmodels` 대신 `statsmodels` 더미변수 방식으로 대체 (안정성 우선)
  - `steps.js`: PanelOLS → `statsmodels` OLS + entity/time 더미변수, RandomEffects → `statsmodels` GLS
  - `agents.js`: `getAnalysisProfile()` python 라이브러리 목록에서 linearmodels 제거

### ✅ 이슈 22: 기술통계에 entity_id/year 패널 식별자 포함 — 해결됨 (세션8)
- **증상**: 기술통계 테이블에 entity_id(mean 125.5), year(mean 2017) 등 의미 없는 통계값 표시
- **원인**: `select_dtypes(include='number')`가 패널 식별자도 수치형으로 포함
- **수정 (steps.js)**: 기술통계/상관행렬/통제변수 선택/시각화 OLS 총 6곳에서 `id_cols = ['entity_id', 'year', 'time', 'id', 'ID']` 제외 처리

### ✅ 개선: Pyodide 사전 로딩 — 적용됨 (세션8)
- **증상**: 분석실습 탭에서 "Python 실행" 클릭 시 매번 5~10초 대기
- **원인**: initPyodide()가 버튼 클릭 시점에 호출됨 (lazy loading)
- **수정**:
  - `index.html`: `<link rel="preload">` 추가 (pyodide.js + pyodide.asm.wasm 리소스 사전 다운로드)
  - `main.js`: 페이지 로드 5초 후 백그라운드에서 `initPyodide()` 자동 호출 → 분석실습 탭 진입 시 이미 준비 완료

---

## 파일별 현재 상태

| 파일 | 최종 수정 | 상태 | 비고 |
|------|-----------|------|------|
| index.html | 03-30 세션9 | ✅ | 프린트 버튼 + result-actions 래퍼 추가 |
| css/style.css | 03-30 세션9 | ✅ | result-actions + btn-print 스타일 + @media print 블록 추가 |
| js/config.js | 03-29 세션7 | ✅ | agent4Plus 토큰 4000→8000 증가. 다음: maxMethods 2→3 (Sprint2) |
| js/agents.js | 04-01 세션9 | ✅ | Agent4+ correlation_matrix 추출 필드 추가 (Phase 6-A) |
| js/pdf.js | 03-26 | 🔧 | 텍스트추출 + base64. **다음: Sprint2 폰트 기반 헤딩 감지 추가** |
| js/pipeline.js | 04-01 세션9 | ✅ | analysis_design mediator/moderator 영문 매핑 추가 (Phase 6-B) |
| js/ui.js | 03-30 세션9 | ✅ | 프린트 핸들러 + 홈 복귀에 resetState() 연동 |
| js/main.js | 03-30 세션9 | ✅ | 중복 홈 핸들러(location.reload) 제거 |
| js/simulator.js | 03-29 세션8 | ✅ | 코드펜스 스트리핑 + 변수명 주입 (이슈 16, 17) |
| js/steps.js | 04-01 세션9 | ✅ | 매개/조절/조절된 매개/위계적 회귀 전용 Step 추가 (Phase 6-B) |
| js/mockdata.js | 04-01 세션9 | ✅ | Cholesky 상관 데이터 생성 + generateIndependentData 헬퍼 추출 (Phase 6-A) |
| ResearchMethodAgent_QualityScore.xlsx | 03-28 세션6 | ✅ | 품질 평가 엑셀 (61/100점) |
| js/pyodide-runner.js | 03-27 세션3 | ✅ | 일괄 패키지 로드 + statsmodels |
| js/apa-renderer.js | 03-26 | ✅ | APA 스타일 렌더링 |
| js/utils.js | 03-29 세션7 | ✅ | escapeCode() 함수 추가 (코드 블록 전용 이스케이프) |

---

## 수정 이력

### 세션9 (2026-03-30) — 홈 화면 개선 + 프린트 기능 추가 (Superpowers 활용)

- **Superpowers 실제 활용**:
  - `writing-plans` 스킬로 구현 계획 작성 (`docs/superpowers/plans/2026-03-30-home-and-print.md`)
  - `subagent-driven-development` 스킬로 태스크별 서브에이전트 디스패치 + 2단계 리뷰(spec compliance + code quality) 실행

- **홈 복귀 로직 통일 (Task 1)**:
  - **문제**: main.js의 document-level click 이벤트(`location.reload()`)와 ui.js의 `setupHomeLink()`가 중복 → main.js가 먼저 캡처되어 항상 페이지 새로고침
  - **수정 (main.js)**: 중복 홈 핸들러 블록 삭제 + `resetState` import 제거
  - **수정 (ui.js)**: `resetState` import 추가, `setupHomeLink()`에서 `resetState()` 호출 후 UI 초기화 → 페이지 새로고침 없이 입력 화면 복귀

- **프린트 기능 추가 (Task 2~4)**:
  - **index.html**: `<button class="home-link">` → `<div class="result-actions">` 래퍼 + `<button class="btn-print" id="print-btn">🖨️ 결과 인쇄</button>` 추가
  - **ui.js**: `setupPrintButton()` 함수 — 클릭 시 모든 `.result-panel`에 `print-visible` 클래스 추가 → `window.print()` → 클래스 제거. `renderInitialResult()`에서 호출
  - **css/style.css**: `.result-actions` (flex, space-between) + `.btn-print` 스타일 추가
  - **css/style.css**: `@media print` 블록 (151행) — 헤더/설정/입력/로딩/버튼 숨김, 4탭 전체 표시, 패널 높이 제한 해제, 코드 wrap, 테이블 포맷, 페이지 나눔

- **수정 파일**: `index.html`, `css/style.css`, `js/main.js`, `js/ui.js`
- **배포 대기**: 4개 파일 GitHub 업로드 필요 → 아래 Phase 6-A 수정과 함께 일괄 업로드

- **Phase 6-A 실행 완료 (이슈 24 해결)** — Cholesky 기반 상관 데이터 생성:
  - **agents.js**: Agent4+ 프롬프트에 `correlation_matrix` 필드 추가 (variables 배열 + 대칭행렬). 지시사항에 "상관분석 표가 있으면 반드시 추출" 규칙 추가
  - **mockdata.js**: 3개 함수 신규 + 1개 함수 수정
    - `choleskyDecompose(matrix)` — 양정치 행렬 → 하삼각행렬 L (A = L·L^T)
    - `generateCorrelatedData(vars, corrMatrix, n)` — 독립 Z → L·Z 변환 → mean/sd 스케일링
    - `generateIndependentData(vars, n)` — 기존 독립 생성 로직 헬퍼 추출
    - `generateMockData(stats, n, category, correlationMatrix)` — corrInfo 분기: 상관행렬 있으면 Cholesky 경로, 없으면 기존 독립 경로 (하위 호환)
  - **효과**: 논문의 상관행렬(예: r=.77)이 mock 데이터에 반영 → 회귀 R² 정상 범위로 개선
  - **배포 대기**: `agents.js`, `mockdata.js` GitHub 업로드 필요

- **Phase 6-B 실행 완료 (이슈 23 해결)** — 분석 설계 동적 감지:
  - **agents.js**: Agent1 프롬프트 + responseSchema에 `analysis_design` 필드 추가
    - `framework`: PROCESS / mediation / moderation / moderated_mediation / hierarchical_regression / path_analysis / none
    - `model_number`, `paths`, `mediator`, `moderator`, `covariates` 서브필드
    - METHODOLOGY_TAXONOMY regression 카테고리에 매개/조절/PROCESS 키워드 추가
  - **steps.js**: `getDesignSpecificSteps()` + 4개 분석 설계별 Step 함수 신규
    - `getMediationSteps()` — 경로a, 경로b+c', 간접효과 부트스트래핑, 경로 다이어그램
    - `getModerationSteps()` — 평균중심화, 상호작용 모형, 단순기울기, 상호작용 플롯
    - `getModeratedMediationSteps()` — 경로a, 조절된 경로b, 조건부 간접효과, 시각화
    - `getHierarchicalRegressionSteps()` — 단계별 모형, ΔR² F검정, R² 변화 시각화
  - **pipeline.js**: `resolveVariableNames()`에서 `analysis_design.mediator/moderator/covariates` 한→영 매핑 추가
  - **효과**: 매개/조절/조절된 매개/위계적 회귀 논문에서 전용 분석 Step 자동 생성
  - **배포 대기**: `agents.js`, `steps.js`, `pipeline.js` GitHub 업로드 필요

- **품질 진단 — KCI 논문(조건부 자아존중감과 SNS 중독경향성) 실제 테스트**:
  - 논문: 정하은·양수진 (2025), PROCESS Macro Model 14 (조절된 매개모형), N=400
  - 검증 파일: `C:\Users\sudon\Downloads\KCI_FI003235104.md` (원본 마크다운)

  - **이슈 23 (P0): 분석 모형 불일치** — 논문은 PROCESS Macro Model 14 (조절된 매개) 사용, 시스템은 `regression`으로 분류 → 단순 OLS만 실행. 매개효과, 상호작용항, 부트스트래핑 CI가 전부 없음
    - 원본: R²=.53/.83, B(상향비교→중독)=.18***, 상호작용 B=.08***
    - 시스템: R²=.000, B=.002(p=.959) — 완전히 다른 결과
    - **근본 원인**: 12개 카테고리에 매개/조절/조절된 매개 모형 전용 분석이 없음

  - **이슈 24 (P0): Mock 데이터 상관구조 미보존** — mockdata.js가 변수를 독립적으로 난수 생성 → 논문에서 r=.63인 변수들이 생성 데이터에서 r≈0 → 모든 회귀계수가 비유의
    - 원본 상관: r(중독,부적강화)=.77, r(중독,상향비교)=.63, r(자아존중감,상향비교)=.36
    - 시스템 상관: r=-0.250~0.550 (부호/크기 불일치)

  - **이슈 25 (P1): 분석 네비게이션 부재** — 분석실습 탭에 Step 1~4가 순차 나열, 원하는 분석(기술통계/기본모형/확장모형 등)을 직접 선택하여 볼 수 없음. 코드 수정 후 재실행도 불가

- **커버리지 분석 — 현재 12개 카테고리의 사각지대**:

  | 빈도 | 분석 방법 | 현재 처리 | 문제 |
  |------|----------|----------|------|
  | 매우 높음 | 매개분석 (PROCESS Model 4) | regression → 단순 OLS | 간접효과/부트스트래핑 없음 |
  | 매우 높음 | 조절분석 (PROCESS Model 1) | regression → 단순 OLS | 상호작용항/단순기울기 없음 |
  | 매우 높음 | 조절된 매개 (Model 7,8,14 등) | regression → 단순 OLS | 조건부 간접효과 없음 |
  | 높음 | 위계적 회귀분석 | regression → 기본 OLS | 모형비교(ΔR²) 없음 |
  | 중간 | 다층모형 (HLM/MLM) | 카테고리 없음 | 미지원 |
  | 중간 | 잠재프로파일 (LPA/LCA) | sem 하위 | Step 없음 |

- **Phase 6 개선 전략 수립 (하이브리드 접근)**:
  - **Phase 6-A**: Cholesky 분해 기반 상관구조 보존 Mock 데이터 생성 (mockdata.js)
    - Agent4+ 프롬프트에 상관행렬 추출 필드 추가
    - `generateCorrelatedData(means, sds, corrMatrix, n)` 구현
    - 효과: 모든 분석의 R²/계수 품질 즉시 향상
  - **Phase 6-B**: 분석 설계 동적 감지 (agents.js Agent1)
    - `analysis_design` 필드 추가: framework, model_type, paths, moderator, covariates
    - steps.js에서 분석 설계 기반 동적 Step 생성
    - 효과: 매개/조절/조절된 매개 등 커버리지 확대
  - **Phase 6-C**: 보고된 결과값 기반 역추정 데이터 생성
    - 논문의 B, SE, R², 상관행렬로부터 `np.random.multivariate_normal()` + 최적화
    - 효과: 생성 데이터로 분석 시 원본 결과와 근접한 재현
  - **Phase 6-D**: 분석 네비게이션 + 코드 수정 재실행 UX
    - Step 앵커 네비게이션, 코드 편집 textarea, 비교 뷰

### 세션8 (2026-03-29) — 전체 파일 검토 + 오류 분석 + Superpowers 연결 + 이슈 15~18 수정

- **Superpowers 프레임워크 연결**:
  - `superpowers/` 폴더에 [obra/superpowers](https://github.com/obra/superpowers) git clone 완료
  - `.claude/commands/`에 brainstorm.md, write-plan.md, execute-plan.md 복사
  - `CLAUDE.md` 업데이트: superpowers skills 경로 + 사용법 기술

- **전체 파일 검토 (14개 파일)**:
  - agents.js (72KB), ui.js (48KB), steps.js (66KB) 등 전 파일 정밀 분석
  - 파일 간 import/export 연결, 함수 호출 흐름, 에러 핸들링 점검

- **오류 폴더 분석 (이슈 18 발견)**:
  - `오류/오류.JPG` 스크린샷: `ModuleNotFoundError: No module named 'linearmodels'`
  - **원인**: steps.js causal_inference 3개 Step이 `linearmodels.panel.PanelOLS` 의존 → Pyodide에 미설치
  - **영향 범위**: agents.js `getAnalysisProfile()` 2곳 + steps.js 3곳 = 총 5곳
  - **결정**: Option B (statsmodels 대체) 채택

- **이슈 15~18 일괄 수정 완료**:
  - **이슈 15 (빈 박스)**: `ui.js` — `executeAnalysisStep()`에 `hasContent` 플래그 + fallback 경고 메시지 추가. 모든 섹션 비어있으면 "결과를 생성하지 못했습니다" 안내
  - **이슈 16 (코드펜스)**: `simulator.js` — `parseSimulationResult()`에 코드펜스 스트리핑 추가. ````markdown/```python` 등 제거 후 delimiter 파싱. stripped 우선, raw 폴백
  - **이슈 17 (변수명 불일치)**: `pipeline.js` — context에 `variableNames` 배열 추가 (Agent4+ 변수 목록). `simulator.js` — 프롬프트에 변수 목록 명시 + "반드시 이 변수명을 사용하세요" 지시
  - **이슈 18 (linearmodels)**: `steps.js` 3곳 + `agents.js` 2곳 수정
    - baseline_fe: `PanelOLS` → `sm.OLS` + entity/time 더미변수 + 클러스터 SE
    - full_model_fe: 동일 방식 + 통제변수 concat
    - robustness: `RandomEffects` → `MixedLM` (statsmodels 내장), Pooled OLS 유지
    - agents.js `getAnalysisProfile()`: causal_inference/panel python 목록에서 linearmodels 제거
  - **검증**: `linearmodels` 전체 코드베이스 검색 결과 0건 확인

- **오류 폴더 2차 분석 (이슈 19~21 발견)**:
  - Python 실행 오류 스크린샷 + AI 시뮬레이션 오류 스크린샷 분석
  - **이슈 19 (패널 식별자 누락)**: `mockdata.js` — `generateMockData()`에 `category` 파라미터 추가. causal_inference/panel이면 entity_id(250개)×year(2015~2019) = 1250행 자동 생성. `ui.js` 3곳에서 category 전달 추가
  - **이슈 20 (treatment 하드코딩)**: `steps.js` — `df['treatment']` → `df['${treatment}']` 템플릿 변수화. 컬럼 존재 확인 로직 추가 (preprocessing + visualization)
  - **이슈 21 (범주형 컬럼 수치 연산)**: `steps.js` 5곳 — `df.describe()` → `df.select_dtypes(include='number').describe()`, `df.corr()` → `numeric_df.corr()`, 통제변수 선택/시각화 OLS에서 `select_dtypes(include='number')` 적용

- **이슈 22 (패널 식별자 기술통계 포함)**: `steps.js` 6곳 — `select_dtypes(include='number')` 후 `id_cols` 제외 처리
- **Pyodide 사전 로딩**: `index.html` preload 힌트 + `main.js` 페이지 로드 5초 후 백그라운드 initPyodide()

- **수정 파일**: `steps.js`, `agents.js`, `ui.js`, `simulator.js`, `pipeline.js`, `mockdata.js`, `main.js`, `index.html`, `WORKLOG.md`, `CLAUDE.md`
- **배포 대기**: `steps.js`, `agents.js`, `ui.js`, `simulator.js`, `pipeline.js`, `mockdata.js`, `main.js`, `index.html` GitHub 업로드 필요 (8개 파일)

### 세션7 (2026-03-29) — Sprint 1 배포 + 데이터구조 추출 수정 + Python 코드 줄바꿈 수정 + 저자톤 프롬프트

- **Sprint 1 프롬프트 개선 배포**:
  - `agents.js`: 통제변수 식별 강화(4-B), 방법론명 구체화(4-C), 리뷰 특정성 향상(4-H), 대안 실현성 보강(4-I) 프롬프트 수정 완료
  - GitHub 업로드 완료 (사용자가 웹 UI로 직접 업로드)
  - `ui.js`, `mockdata.js`도 함께 업로드

- **데이터 구조 추출 실패 수정 (이슈 10)**:
  - **증상**: Agent4+가 KCI 논문에서 변수 추출 실패 — "데이터 구조를 추출하지 못했습니다" + 빈 variables
  - **원인**: `agent4Plus` 토큰 한도 4000이 변수 10~15개의 JSON 출력에 부족 → JSON 중간 절삭
  - **수정 (config.js)**: `agent4Plus: 4000` → `8000`으로 증가
  - **수정 (agents.js)**: `callGemini()`에 `{ jsonMode }` 옵션 추가 — `responseMimeType: 'application/json'` 설정으로 유효 JSON 강제
  - Agent1, Agent4+에서 `{ jsonMode: true }` 적용
  - **결과**: KCI 논문 변수 정상 추출 확인 (종속·독립·통제·층화·고정효과 변수 + 데이터구조 다이어그램)

- **Python SyntaxError 수정 (이슈 11)**:
  - **증상**: 분석실습 탭 Python 코드가 한 줄로 출력되어 SyntaxError 발생
  - **원인**: `escapeHtml()`이 `\n`을 `<br>`로 변환 → `<pre><code>` 블록에서 `textContent`로 읽을 때 `<br>` 무시 → 줄바꿈 소실
  - **수정 (utils.js)**: `escapeCode()` 함수 신규 추가 — HTML 특수문자만 이스케이프하고 `\n`은 그대로 보존
  - **수정 (ui.js)**: 코드 블록 렌더링에서 `escapeHtml(code)` → `escapeCode(code)` 변경
  - **상태**: 수정 완료, 배포 후 재테스트 필요

- **저자 톤 프롬프트 추가**:
  - **배경**: 해석 작성 시 원 저자의 용어·워딩을 유지할지 일반 학술 톤으로 할지 논의 → 혼합 방식 채택
  - **수정 (agents.js)** — 4곳에 문체 원칙 추가:
    - `buildAgent2Prompt()`: 저자 용어·워딩 유지 원칙
    - Agent6 Part I (해석 가이드): 저자 톤 — 저자가 직접 쓴 것처럼 읽히는 해석
    - Agent6 Part II (AI 평가): 비판적 학술 심사 톤 — 심사위원 관점
    - `runReviewGuide()`: 혼합 톤 — 기술 시 저자 워딩 + 비판 시 심사위원 톤

- **Gemini 2.5 Flash 무료 API 한도 확인**:
  - 10 RPM (분당 요청), 250 RPD (일당 요청), 250,000 TPM (분당 토큰)

- **코드 리뷰 — 3개 버그 발견 & 수정 (이슈 12, 13, 14)**:
  - **이슈 12 (HIGH)**: Agent2 `callGemini()`에 `{ jsonMode: true }` 누락 → JSON 파싱 실패 가능 → 수정 완료
  - **이슈 13 (HIGH)**: Agent3 Meta `callGemini()`에 `{ jsonMode: true }` 누락 → 패키지 목록 파싱 실패 가능 → 수정 완료
  - **이슈 14 (MEDIUM)**: `ui.js` structure_diagram 렌더링에서 `escapeHtml()` → `escapeCode()` 변경 필요 → 수정 완료

- **배포 사이트 캡처 분석 — 3개 이슈 발견 (이슈 15, 16, 17)**:
  - **이슈 15**: Step3 기본 고정효과 모형 — AI 시뮬레이션 결과가 빈 박스 (렌더링 또는 API 호출 실패)
  - **이슈 16**: Step4 확장 모형 — \`\`\`markdown 코드펜스가 결과 테이블에 그대로 표시됨 (markdownToHtml 미처리)
  - **이슈 17**: AI 시뮬레이션 변수명(net_employment_creation, log_firm_size 등)이 탭1 변수 테이블(net_job_creation, firm_size 등)과 불일치
  - **확인**: Python 실행 줄바꿈 정상 작동 ✅ (이슈 11 수정 효과 확인)

- **수정 파일**: `agents.js`, `config.js`, `ui.js`, `utils.js`
- **배포 대기**: 수정된 `agents.js`, `ui.js` GitHub 업로드 필요

### 세션6 (2026-03-28) — 품질 평가 & Phase 4 로드맵 수립

- **품질 평가 수행**: KCI 논문(기업 규모와 청년 고용, 신동한·진현배) 기준으로 에이전트 산출물 평가
  - Claude 산출물을 100점 기준으로 6개 영역 24개 세부항목 채점
  - **총점: 61/100점** — 메타정보 9/15, 방법론식별 5/20, 변수식별 13/20, 동료리뷰 15/20, 대안방법론 11/15, 후속연구 8/10
  - 엑셀 평가표 생성: `ResearchMethodAgent_QualityScore.xlsx` (평가 총괄 + 개선 우선순위 2시트)
- **핵심 감점 요인 분석**:
  - 논문 섹션 미감지 (sections: 0) → -4점
  - 통제변수 미식별 (controls: "미언급") → -5점
  - 모형 수식 미추출 → -4점
  - 하위 분석 미감지 (기술통계 분해) → -4점
  - 방법론명 과도하게 일반적 ("회귀 분석") → -2점
- **기술 리서치 (개발 커뮤니티/문서 조사)**:
  - Gemini Structured Output (responseSchema): JSON Schema + required 필드로 누락 방지 → [공식 문서](https://ai.google.dev/gemini-api/docs/structured-output)
  - pdf.js 폰트 크기 기반 헤딩 감지: `transform[0]` 값 활용 → [mozilla/pdf.js#7372](https://github.com/mozilla/pdf.js/issues/7372)
  - Decomposition Prompting: 복합 추출을 하위 작업으로 분해 시 정확도 +11.7pp → [LearnPrompting](https://learnprompting.org/docs/advanced/decomposition/introduction)
  - LLM 필드별 프롬프트 설계: 필드별 sub-prompt가 복합 prompt 대비 높은 recall → [PMC 논문](https://pmc.ncbi.nlm.nih.gov/articles/PMC12559671/)
  - Gemini 2.5 Flash PDF 구조 인식: multi-column, section headers, charts, tables 직접 인식 → [DataStudios](https://www.datastudios.org/post/google-gemini-2-5-flash-file-upload-and-reading-document-processing-extraction-quality-multimodal)
- **Phase 4 로드맵 작성**: 9개 개선 항목(4-A~4-I), 3스프린트 구현 계획
  - Sprint 1 (프롬프트만 수정): +11점 → 72점 예상
  - Sprint 2 (구조 변경): +10점 → 82점 예상
  - Sprint 3 (고급 기능): +6점 → 88점 예상
- **수정 파일**: WORKLOG.md (Phase 4 로드맵 추가)
- **생성 파일**: `ResearchMethodAgent_QualityScore.xlsx`

### 세션5 (2026-03-28) — 배포 검증 & 토큰 한도 수정
- **배포 사이트 markdownToHtml 렌더링 최종 검증**:
  - GitHub API로 전 파일 정상 배포 확인 (ui.js 48,228B, agents.js 65,957B 등)
  - 브라우저 캐시가 구버전 모듈을 사용하던 문제 발견 → 하드 리프레시로 해결
  - DOM 검증: `rawHashCount: 0` (미변환 ### 없음), `<h3>` 1개, `<h4>` 4개, `<strong>` 61개, `<ul>` 13개 — **마크다운 렌더링 완전 정상**
- **발견된 이슈: 대안 방법론/후속 연구 섹션 미생성**
  - 원인: `review` 토큰 한도 8000이 부족 → 동료 리뷰(7,890자)만 생성되고 나머지 2섹션 잘림
  - **config.js**: `review` 토큰 8000 → 16000 증가
  - **agents.js**: `runReviewGuide()` 프롬프트에 "3개 섹션 모두 포함" 강조 + 간결성 지시 추가
- 커밋 & 푸시 대기 중: `config.js`, `agents.js`

### 세션4 (2026-03-28) — 코드 검토 & 배포 테스트
- **전체 코드 무결성 검토**: import/export 일관성, 함수 호출 연결, Node.js 구문 검증 — 전 파일 통과
- **pipeline.js**: 미사용 `getAnalysisProfile` import 제거, `state.reviewResults: {}` 명시적 초기화 추가
- **js/index.html**: v4 레거시 파일 → `.bak-v4`로 이름 변경 (배포에 혼선 방지)
- **배포 사이트 4탭 전체 플로우 테스트 완료**:
  - ✅ 탭1 (논문 개요 & 데이터): 논문 구조 + 변수 테이블 + 추정값(~) 정상 표시
  - ✅ 탭2 (분석 실습): causal_inference 전용 Step 로드 + AI 시뮬레이션 → 기술통계 결과 테이블 정상
  - ✅ 탭3 (리뷰 & 대안): Agent 6+ 동료리뷰 생성 정상 동작
  - ✅ 탭4 (Q&A): 논문 맥락 기반 질의응답 정상 동작
- **발견된 이슈**: 탭3 리뷰 결과의 마크다운이 raw 텍스트로 표시됨 → 아래에서 해결
- **ui.js**: `markdownToHtml()` 완전 재작성 — escapeHtml()의 조기 \n→<br> 변환 문제 해결, 섹션 구분자 제거, 헤더/볼드/이탤릭/리스트/코드블록 변환, 블록 요소 주변 <p>/<br> 정리
- **agents.js**: `runReviewGuide()` 파싱 견고화 — end marker 누락 시 다음 섹션 경계 사용, 완전 실패 시 구분자 제거 후 반환
- **Node.js 자동 테스트**: 11개 항목 전 통과 (구분자 제거, h3/h4, strong, em, ol, ul, pre, 내부 br 정리 등)

### 세션3 (2026-03-27)
- **steps.js**: 9개 카테고리 전용 Step 추가 (spatial, time_series, ML, causal_ml, bayesian, sem, survival, meta_analysis, unstructured_data)
- **pipeline.js**: `loadReview()` 캐시를 `reviewResults[methodIndex]`로 변경, `resetState()`에 `reviewResults` 추가
- **파일 복구**: GitHub repo에서 0바이트 된 ui.js/mockdata.js/pyodide-runner.js 복원 후 수정사항 재적용

### 세션2 (2026-03-26)
- **mockdata.js**: `estimateVariableStats()` 신규, `generateMockData()` 리팩터링
- **ui.js**: 자동 데이터 생성, 탭2 자동 생성 폴백, 추정값 표시
- **pyodide-runner.js**: 일괄 패키지 로드, statsmodels 기본 추가

---

## 다음 세션 작업 순서

### Phase 1: GitHub Pages 배포 & 실제 테스트 (P1) — ✅ 완료
1. ✅ 코드 무결성 검토 + 소규모 수정 (pipeline.js, 레거시 파일 정리)
2. ✅ 배포 사이트 4탭 전체 플로우 테스트 통과 (에러 0건)
3. ⏳ 세션4 수정 파일 커밋 & 푸시 (pipeline.js 변경분) — 다음 세션에서 수행

### Phase 2: markdownToHtml() 개선 (P2) — ✅ 완료
- ✅ 근본 원인 해결: escapeHtml()의 \n→<br> 조기 변환 문제
- ✅ markdownToHtml() 완전 재작성 + Node.js 자동 테스트 전 항목 통과
- ✅ agents.js 리뷰 파싱 견고화 (end marker 누락 대응)
- ⏳ 수정 파일 커밋 & 푸시 후 배포 사이트에서 최종 확인 — 다음 세션

### Phase 3: 세션5 수정 커밋 & 푸시 (P1) — ✅ 배포완료, 커밋 대기
1. ⏳ 커밋 & 푸시: `config.js` (review 토큰 16000), `agents.js` (프롬프트 강화)
2. ✅ 배포 사이트에서 3섹션(동료 리뷰 + 대안 방법론 + 후속 연구) 모두 정상 생성 확인
3. ✅ 하드 리프레시(Ctrl+Shift+R) 후 테스트 완료

### Phase 4-Sprint1: 프롬프트 개선 + 버그 수정 (P1) — ✅ 코드 수정 완료, ⏳ 배포 대기

1. ✅ Sprint 1 프롬프트 개선 (4-B 통제변수, 4-C 방법론명, 4-H 리뷰 특정성, 4-I 대안 실현성)
2. ✅ Agent4+ 데이터 구조 추출 수정 (토큰 8000 + jsonMode)
3. ✅ Python SyntaxError 수정 (escapeCode 함수) — **배포 테스트 통과 확인 ✅**
4. ✅ 저자 톤 프롬프트 4곳 추가
5. ✅ Agent2/Agent3 Meta jsonMode 누락 수정 (이슈 12, 13)
6. ✅ structure_diagram escapeCode 수정 (이슈 14)
7. ⏳ **GitHub 업로드 필요**: `agents.js`, `ui.js` → 사용자가 웹 UI로 업로드

### Phase 4-Sprint1.5: 캡처 분석 이슈 수정 (P1) — ✅ 코드 수정 완료, ⏳ 배포 대기

1. ✅ **이슈 15**: ui.js — 빈 결과 fallback 메시지 추가
2. ✅ **이슈 16**: simulator.js — 코드펜스 스트리핑 추가
3. ✅ **이슈 17**: pipeline.js + simulator.js — Agent4+ 변수 목록 주입
4. ✅ **이슈 18**: steps.js + agents.js — linearmodels → statsmodels 대체
5. ⏳ **GitHub 업로드 필요**: `steps.js`, `agents.js`, `ui.js`, `simulator.js`, `pipeline.js`

### Phase 5: 홈 화면 개선 + 프린트 기능 (P1) — ✅ 코드 수정 완료, ⏳ 배포 대기

1. ✅ 홈 복귀 로직 통일 (main.js 중복 제거 + ui.js resetState 연동)
2. ✅ 프린트 버튼 추가 (index.html + ui.js)
3. ✅ @media print CSS 블록 추가 (style.css)
4. ✅ result-actions 스타일링 (style.css)
5. ⏳ **GitHub 업로드 필요**: `index.html`, `css/style.css`, `js/main.js`, `js/ui.js`

### Phase 6-A: 상관구조 보존 Mock 데이터 생성 (P0) — ❌ 미시작

> **최우선**: 모든 분석 결과의 기반. R²=0.000 문제 즉시 해결

1. ❌ Agent4+ 프롬프트에 `correlation_matrix` 추출 필드 추가 (agents.js)
2. ❌ mockdata.js에 `generateCorrelatedData(means, sds, corrMatrix, n)` 구현 (Cholesky 분해)
3. ❌ 기존 `generateMockData()` → 상관행렬 존재 시 `generateCorrelatedData()` 분기
4. ❌ KCI 논문으로 검증: 생성 데이터의 상관행렬 ≈ 원본 표2

### Phase 6-B: 분석 설계 동적 감지 + 매개/조절 Step (P0) — ❌ 미시작

> **커버리지 확장**: 사회과학 논문의 50%+ 차지하는 매개/조절 모형 지원

1. ❌ Agent1 `analysis_design` 필드 추가 (framework, model_type, paths, moderator, covariates)
2. ❌ METHODOLOGY_TAXONOMY에 매개/조절 분류 가이드 추가 (regression 하위 세분화)
3. ❌ steps.js에 mediation/moderation/moderated_mediation 전용 Step 추가
4. ❌ 부트스트래핑 간접효과 CI 코드 (Pyodide statsmodels 기반)

### Phase 6-C: 역추정 데이터 생성 (P1) — ❌ 미시작

1. ❌ 보고된 회귀계수(B, SE, R²) 기반 최적화 루프
2. ❌ `np.random.multivariate_normal()` + 반복 조정

### Phase 6-D: 분석 네비게이션 + 재실행 UX (P1) — ❌ 미시작

1. ❌ Step 앵커 네비게이션 바
2. ❌ 코드 편집 textarea + 재실행 버튼
3. ❌ 결과 비교 뷰

### Phase 4-Sprint2: 구조 변경 (P2) — 우선순위 하향

- 4-A: pdf.js 폰트 기반 헤딩 감지 추가 [+4점]
- 4-F: 변수 역할/유형 분류 강화 [+5점]
- 4-G: callGemini()에 responseSchema 옵션 추가 [+2~3점]
- maxMethods 2→3 확장

### Phase 4-Sprint3: 고급 기능 (P2) — 우선순위 하향

- 4-D: 멀티모달 2패스 수식 추출 [+3점]
- 4-E: Agent1 Decomposition Prompting + 하위 분석 감지 [+3점]

### Phase 4: 품질 61→85점 개선 로드맵 (참고용 상세)

> **품질 평가 결과 (세션6)**: KCI 논문(기업 규모와 청년 고용) 기준 **61/100점**
> 평가 엑셀: `ResearchMethodAgent_QualityScore.xlsx`
> 목표: **85점 이상** (24점 이상 회복)

#### 4-A. 섹션 구조 감지 복원 [+4점] — 난이도: 중 / 우선순위 P1

**현황**: `section_index` 배열이 항상 빈 배열([])로 반환됨 → `paperContext.sections: 0`
**근본 원인**: Agent1 프롬프트에 `section_index` 스키마가 있지만, 15000자 텍스트 제한(Agent4+)과 전문 텍스트의 헤딩 구분 부족으로 Gemini가 섹션을 식별 못함

**해결 방안** (2단계):

**(1) pdf.js 폰트 기반 헤딩 감지 (클라이언트 사이드 전처리)**
- pdf.js `getTextContent()`가 반환하는 각 텍스트 아이템에는 `transform[0]` (폰트 크기 스케일링)과 `fontName`이 포함됨
- 참고: [mozilla/pdf.js#7372](https://github.com/mozilla/pdf.js/issues/7372), [mozilla/pdf.js#8096](https://github.com/mozilla/pdf.js/issues/8096)
- **구현**: `js/pdf.js`의 텍스트 추출 로직에 폰트 크기 분석 추가
  ```
  // pdf.js getTextContent() 아이템 구조:
  // { str, dir, width, height, transform: [fontSize, 0, 0, fontSize, x, y], fontName, hasEOL }
  // transform[0] 또는 sqrt(b²+d²) 로 폰트 크기 추출
  // 본문 평균 대비 1.2배 이상 → 헤딩 후보
  // 한국어 논문 패턴: "Ⅰ.", "1.", "제1장", "제1절" 등 → 정규식 매칭
  ```
- **출력**: `extractedSections` 배열을 `paperText`와 함께 Agent1에 전달
- 참고 라이브러리: [PDFDataExtractor (PMC)](https://ncbi.nlm.nih.gov/pmc/articles/PMC9049592) — 학술 논문의 13가지 논리 구조 식별

**(2) Agent1 프롬프트에 섹션 힌트 주입**
- 클라이언트에서 감지한 헤딩 후보를 `[감지된 헤딩 목록]` 형태로 프롬프트에 삽입
- Gemini가 이를 검증/보완하여 `section_index`를 정확히 채움

#### 4-B. 통제변수 식별 강화 [+5점] — 난이도: 하 / 우선순위 P1

**현황**: `key_variables.controls: "미언급"` → 논문에 명시된 산업코드 고정효과(μ_j), 연도 고정효과(ν_t) 놓침
**근본 원인**: Agent1 프롬프트의 controls 필드 설명이 "통제변수/공변량/블록변수 설명 (30자 이내)"로 너무 간략

**해결 방안**:

**(1) Agent1 `buildAgent1Prompt()` key_variables 스키마 강화** (`agents.js` L324-328)
```javascript
// 현재:
"controls": "통제변수/공변량/블록변수 설명 (30자 이내)"
// 변경:
"controls": "통제변수/공변량 설명. 반드시 포함: 고정효과(fixed effects), 더미변수(dummy), 클러스터링 변수. 논문에서 μ, ν, δ, γ 등 그리스 문자로 표기된 항목, '통제', 'control', 'fixed effect' 키워드가 있는 변수를 모두 나열. 없으면 '없음'이 아니라 논문 수식에서 추론하여 기술"
```

**(2) Agent4+ 변수 role에 '고정효과' 역할 활용 강화** (`agents.js` L1044)
- 현재 role에 "고정효과"가 이미 있으나 Gemini가 거의 사용하지 않음
- 프롬프트에 예시 추가: `"role이 '고정효과'인 변수 예: 산업코드 더미(industry_fe), 연도 더미(year_fe), 지역 더미(region_fe)"`

**(3) Cascade 검증: Agent2에서 controls 재확인**
- Agent2 `buildAgent2Prompt()`에 controls 정보를 전달하여 "이 논문의 통제변수가 정확한지 검증하고, 누락된 통제변수가 있으면 추가" 지시

#### 4-C. 방법론명 구체화 [+2점] — 난이도: 하 / 우선순위 P1

**현황**: `raw_name: "회귀 분석"` → 과도하게 일반적. "패널 고정효과 회귀분석"이어야 함
**근본 원인**: Agent1 프롬프트의 `raw_name` 필드가 "논문에서 사용한 이름 그대로"만 지시

**해결 방안**:
- `buildAgent1Prompt()` L319 수정:
```javascript
// 현재:
"raw_name": "방법론 명칭 (논문에서 사용한 이름 그대로)"
// 변경:
"raw_name": "방법론의 구체적 명칭. 단순히 '회귀 분석'이 아니라, 데이터 구조와 추정 방법을 반영한 구체적 이름을 사용 (예: '패널 고정효과 회귀분석', '이원 고정효과 모형', '도구변수 2SLS 추정', 'Staggered DID' 등). 논문에서 사용한 용어를 기반으로 하되, 분석 유형을 구체적으로 반영"
```
- 이 변경은 Agent2의 `standard_name`에도 연쇄적으로 품질 향상 효과

#### 4-D. 모형 수식 추출 [+4점] — 난이도: 상 / 우선순위 P2

**현황**: 논문의 핵심 회귀식(`NJC = α + Σβ·SIZE + Σγ·AGE + μ + ν + ε`) 미추출
**근본 원인**: Agent1에 수식 추출 필드 자체가 없음

**해결 방안** (Gemini 멀티모달 활용):

**(1) Agent1 스키마에 `model_equations` 필드 추가**
```json
"model_equations": [
  {
    "equation": "LaTeX 또는 텍스트로 표현한 핵심 수식",
    "description": "수식 설명 (1문장)",
    "location": "수식이 나오는 섹션/페이지"
  }
]
```

**(2) 멀티모달 2패스 전략** (참고: [Unstract 블로그](https://unstract.com/blog/comparing-approaches-for-using-llms-for-structured-data-extraction-from-pdfs/))
- 1차: `callGeminiWithPdf()`로 PDF 이미지에서 수식 영역 감지 (Gemini Flash가 수식/표/그림을 직접 인식)
- 2차: 감지된 수식 정보를 Agent1 프롬프트에 추가하여 텍스트로 변환
- 참고: Gemini 2.5 Flash는 "multi-column layouts, section headers, embedded charts, hierarchical bullet lists, footnotes" 인식 지원 ([DataStudios](https://www.datastudios.org/post/google-gemini-2-5-flash-file-upload-and-reading-document-processing-extraction-quality-multimodal))

**(3) 대안: 텍스트 기반 수식 패턴 감지**
- 논문 텍스트에서 `=`, `+`, `β`, `α`, `ε`, `Σ` 등 수학 기호가 밀집된 줄을 pre-filter
- 이 줄들을 `[감지된 수식 후보]`로 Agent1에 전달

#### 4-E. 하위 분석/분해 방법 감지 [+4점] — 난이도: 상 / 우선순위 P2

**현황**: 이 논문은 기술적 분석(NJC 분해)과 회귀분석 2단계인데, 회귀분석만 감지됨
**근본 원인**: `API.maxMethods`가 2로 제한되어 있고, 기술통계/분해 분석은 "방법론"으로 인식되지 않음

**해결 방안**:

**(1) 프롬프트 분해 (Decomposition Prompting)**
- 참고: [LearnPrompting Decomposition](https://learnprompting.org/docs/advanced/decomposition/introduction), [DecomP 논문](https://arxiv.org/abs/2201.11903)
- 복합 추출을 하위 작업으로 분해하면 정확도 +11.7pp 향상 (DaSLaM 벤치마크)
- **Agent1을 2단계로 분리**:
  - Agent1-A: 논문의 분석 구조 파악 (어떤 분석이 어디서 수행되는지 목록화)
  - Agent1-B: 각 분석별 상세 정보 추출 (방법론명, 변수, 수식 등)
- 이렇게 하면 "기술통계 분해 → 회귀분석 → 강건성 검정"의 3단계 구조를 모두 포착

**(2) `detected_methods` 확장**
- `maxMethods` 2→3 으로 증가 (config.js)
- 방법론 유형에 "descriptive_decomposition" (기술통계 분해), "robustness_check" (강건성 검정) 추가
- 프롬프트에 "기술통계 분석(기술통계표 기반 분해 분석)도 하나의 독립적 방법론으로 포함하세요" 지시

#### 4-F. 변수 역할/유형 정확도 [+4점] — 난이도: 중 / 우선순위 P2

**현황**: job_creation/destruction이 "종속"(분해변수가 맞음), employee_age_group이 "기타"(층화변수가 맞음)

**해결 방안**:

**(1) Agent4+ 프롬프트에 역할 분류 가이드 추가** (`agents.js` L1044)
```
role 분류 가이드:
- "종속": 회귀식의 좌변 변수 (Y)
- "독립": 회귀식의 우변 핵심 설명변수 (X)
- "통제": 회귀식에 포함되나 관심 대상이 아닌 변수
- "고정효과": 개체/시간/지역 더미 (μ, ν, δ 등)
- "분해": 종속변수를 구성하는 하위 요소 (예: NJC = 진입 + 확장 - 퇴출 - 축소)
- "층화/그룹": 분석을 하위 그룹별로 나누는 기준 변수 (예: 연령 그룹별 분석)
- "도구": IV/2SLS의 도구변수
- "매개/조절": 매개효과/조절효과 분석의 변수
```

**(2) 범주형 변수의 기술통계 처리**
- 현재: `firm_size`(범주)에 `mean: 25~` 표시 → 비현실적
- 수정: 프롬프트에 "범주형(범주) 변수는 mean/sd 대신 각 카테고리의 빈도(frequency)나 비율을 description에 기술" 지시
- UI(변수 테이블)에서 범주형은 mean/sd 열을 "카테고리" 텍스트로 대체

#### 4-G. Gemini responseSchema 활용 [구조적 품질 향상] — 난이도: 중 / 우선순위 P2

**현황**: 모든 Agent가 "순수 JSON만 출력하세요"라는 텍스트 지시에 의존 → 파싱 실패/필드 누락 빈번
**해결 방안**: Gemini API의 `responseSchema` (Structured Output) 기능 활용

참고: [Google AI Structured Output 공식 문서](https://ai.google.dev/gemini-api/docs/structured-output), [Google Cloud Blog](https://medium.com/google-cloud/structured-output-with-gemini-models-begging-borrowing-and-json-ing-f70ffd60eae6)

**(1) `callGemini()` 함수에 responseSchema 옵션 추가** (`agents.js` L42-80)
```javascript
export async function callGemini(apiKey, prompt, maxTokens = 4000, responseSchema = null) {
  const generationConfig = {
    temperature: API.defaultTemp,
    maxOutputTokens: maxTokens,
  };
  if (responseSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = responseSchema;
  }
  // ... fetch 호출
}
```

**(2) Agent1/Agent4+에 JSON Schema 정의**
- `required` 필드로 `section_index`, `controls`, `model_equations` 등 필수 필드 보장
- `description` 필드로 각 속성의 의미를 Gemini에게 명확히 전달
- 참고: "required fields가 누락되면 모델이 에러를 반환하거나 누락 정보를 적절히 표시" ([Structured Output 문서](https://ai.google.dev/gemini-api/docs/structured-output))

**(3) 주의사항**
- Gemini 2.5에서 tool calls 이력이 있으면 structured output 실패하는 [알려진 이슈](https://github.com/googleapis/python-genai/issues/706) → 각 Agent 호출은 독립 세션이므로 영향 없음
- `callGeminiWithPdf()` (멀티모달)에서도 동일하게 적용 가능

#### 4-H. 동료 리뷰 논문 특정성 강화 [+3점] — 난이도: 하 / 우선순위 P3

**현황**: 동료 리뷰가 "패널 회귀 일반론"에 치우치고, 이 논문만의 고유 이슈(분해 방법론, 행정 데이터 특성) 부족
**해결 방안**:
- `runReviewGuide()` 프롬프트에 추가 지시:
  ```
  중요: 일반적인 방법론 비판이 아니라, 이 특정 논문의 데이터와 연구 설계에서만 발생하는 고유한 문제점을 중심으로 리뷰하세요.
  예시: "이 논문이 사용하는 [구체적 데이터셋명]의 특수한 한계", "이 논문의 [구체적 변수명/분해 방식]에서 발생하는 측정 문제" 등
  ```
- Agent1의 `section_index`가 채워지면, 리뷰에 각 섹션별 구체적 코멘트 가능

#### 4-I. 대안 방법론 실현 가능성 검증 [+1점] — 난이도: 하 / 우선순위 P3

**현황**: RDD를 대안으로 제시했으나 이 논문 데이터에는 명확한 cutoff가 없어 부적합
**해결 방안**:
- 프롬프트에 "각 대안이 이 논문의 기존 데이터로 실현 가능한지 반드시 평가하고, 불가능하면 '추가 데이터 필요' 명시" 추가
- 실현 가능성 점수(상/중/하)를 대안 평가에 포함

---

#### 예상 점수 변화

| 개선 항목 | 현재 | 개선 후 | 회복 점수 | 난이도 |
|-----------|------|---------|-----------|--------|
| 4-A. 섹션 구조 감지 | 0/4 | 3/4 | +3 | 중 |
| 4-B. 통제변수 식별 | 0/5 | 4/5 | +4 | **하** |
| 4-C. 방법론명 구체화 | 3/5 | 5/5 | +2 | **하** |
| 4-D. 모형 수식 추출 | 1/5 | 4/5 | +3 | 상 |
| 4-E. 하위 분석 감지 | 1/5 | 4/5 | +3 | 상 |
| 4-F. 변수 역할/유형 | 5/12 | 10/12 | +5 | 중 |
| 4-G. responseSchema | (구조적) | (구조적) | +2~3 | 중 |
| 4-H. 리뷰 특정성 | 15/20 | 18/20 | +3 | **하** |
| 4-I. 대안 실현성 | 11/15 | 13/15 | +2 | **하** |
| **합계** | **61** | **~88** | **+27** | |

#### 구현 우선순위 (3스프린트)

**Sprint 1 (즉시, 프롬프트만 수정)**: 4-B + 4-C + 4-H + 4-I → **+11점 → 72점**
- `agents.js`의 프롬프트 텍스트만 수정, 코드 로직 변경 없음
- 테스트: 동일 논문으로 재실행하여 점수 비교

**Sprint 2 (구조 변경)**: 4-A + 4-F + 4-G → **+10점 → 82점**
- `js/pdf.js`에 폰트 기반 헤딩 감지 추가
- `callGemini()`에 responseSchema 옵션 추가
- Agent4+ 프롬프트에 역할 분류 가이드/범주형 기술통계 처리 추가

**Sprint 3 (고급 기능)**: 4-D + 4-E → **+6점 → 88점**
- 멀티모달 2패스 수식 추출
- Agent1 프롬프트 분해 (Decomposition Prompting)
- `maxMethods` 확장 및 분석 유형 추가

### Phase 5: 기타 개선 (P3)
- simulateModifiedAnalysis() UI 연결 (Q&A 탭에서 코드 수정 실행)
- 에러 핸들링 강화 (네트워크 오류, API 한도 초과 등)
- 탭2 시뮬레이션 결과 해석/비교 텍스트 렌더링 확인

---

## 지침 (모든 세션에서 준수)

1. **작업 시작 시**: 이 파일(`WORKLOG.md`)을 먼저 읽고 현재 상태 파악
2. **큰 작업 단위 완료 시**: 이 파일의 상태를 즉시 업데이트
3. **세션 종료 시**: "다음 세션 작업 순서"를 업데이트
4. **리뷰 문서 갱신**: 주요 변경이 있을 때 `OUTPUTS/ResearchMethodAgent_Review/`에도 반영
5. **코드 수정 후**: 어떤 파일의 어떤 함수를 왜 수정했는지 간략 기록
6. **파일 0바이트 주의**: 마운트 동기화 문제로 파일이 소실될 수 있음 → GitHub repo에서 복원 가능
