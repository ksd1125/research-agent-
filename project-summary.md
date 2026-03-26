# 연구자용 검색 및 구현 프로젝트 — 작업 요약

> **최종 업데이트**: 2026-03-26 (2차)
> **현재 버전**: ResearchMethodAgent v5.0
> **배포**: https://ksd1125.github.io/research-agent-/
> **레포**: github.com/ksd1125/research-agent-

---

## 프로젝트 개요
연구자를 위한 웹 서비스로, 논문 PDF를 입력하면 6개 AI 에이전트 파이프라인이 자동으로 방법론 감지 → 통계 해석 → 코드 생성 → 가상 데이터 → 해석 가이드 → Q&A를 제공하는 GitHub Pages 웹 앱.

### 핵심 기능
1. **Paper Deep Analysis (논문 심층 분석)** — 논문 PDF 업로드 → 방법론 자동 감지, 단계별 분석 실습, 대안 방법론 비교, Q&A
2. **Trend Exploration (트렌드 탐색)** — 키워드 검색 → 학문 분야별 학술 트렌드 분석 (향후 구현 예정)

---

## 기술 아키텍처

### 기술 스택
- Vanilla JavaScript (ES Modules, import/export) — 번들러 없음
- Google Gemini 2.5 Flash API (클라이언트 사이드, 무료 티어 15req/min)
- GitHub Pages 배포 (서버 없음)
- pdf.js (CDN)

### 멀티 에이전트 파이프라인 (v5.0)

```
[초기 파이프라인]
  PDF base64 변환 → Gemini 멀티모달 PDF→MD 변환 → Agent 1 (12카테고리 분류) → Agent 4+ (데이터 구조+변수)
  → 탭 1 렌더링

[온디맨드]
  탭 2 진입 → Agent 2 (통계해석) + Step 목록 → [실행] → Gemini 시뮬레이션
  탭 3 클릭 → Agent 6+ (동료리뷰+대안방법론+후속연구)
  탭 4 Q&A → Agent 5 (논문 맥락 기반 Q&A)
```

| Agent | 함수명 | 역할 | 호출 시점 |
|-------|--------|------|----------|
| Agent 1 | `runAgent1` | 문서분석 (12카테고리 분류) | 초기 |
| Agent 2 | `runAgent2` | 통계해석 | 탭2 진입 |
| Agent 3+ | `simulateExecution` | 코드 시뮬레이션 | [실행] 클릭 |
| Agent 4+ | `runAgent4Plus` | 데이터 구조+기술통계+변수 | 초기 |
| Agent 5 | `runQnA` | Q&A | Q&A 질문 시 |
| Agent 6+ | `runReviewGuide` | 동료리뷰+대안+후속연구 | 탭3 버튼 |

---

## 파일 구조

```
research-agent/
├── index.html            — 메인 HTML (4탭 구조)
├── css/
│   └── style.css         — v5 전용 스타일 (반응형 clamp 타이포그래피)
├── js/
│   ├── config.js         — API 설정, 토큰 한도
│   ├── main.js           — 앱 초기화, PDF업로드, API키 관리
│   ├── agents.js         — Agent 1~6 프롬프트 + Gemini API 호출
│   ├── pipeline.js       — 파이프라인 오케스트레이션 + 상태 관리
│   ├── ui.js             — UI 렌더링 (4탭 + StepExecutor + 리뷰 + Q&A)
│   ├── steps.js          — 카테고리별 분석 Step 정의
│   ├── simulator.js      — Gemini 결과 시뮬레이션
│   ├── mockdata.js       — 기술통계 추출 + 가상 데이터 생성
│   ├── pdf.js            — PDF 텍스트 추출
│   └── utils.js          — 유틸리티 (JSON 파싱, HTML 이스케이프)
├── project-summary.md    — 이 파일 (개발 진행 상황 기록)
└── ResearchMethodAgent_Review.docx — v4→v5 종합 검토 보고서
```

---

## 버전 히스토리

### v4.0 → v5.0 주요 변경 (2026-03-25)

| 항목 | v4.0 | v5.0 |
|------|------|------|
| 탭 구조 | 6탭 | **4탭** (논문개요&데이터 / 분석실습 / 리뷰&대안 / Q&A) |
| 파이프라인 | Agent 1→2→3→4 한번에 | Agent 1 → 4+ → 탭1 렌더링. **이후 온디맨드** |
| 코드 실행 | 전체 코드 한번에 | **Step별 분리 + [실행] → Gemini 시뮬레이션** |
| 해석 | 별도 탭 | **결과 바로 아래에 해석** |
| 대안 방법론 | 텍스트만 | **[이 방법으로 분석해보기] → simulator.js** |
| 카테고리 | 10개 | **12개** (causal_inference, causal_ml, unstructured_data 추가) |

### v4.0 주요 버그 → v5.0 해결

| v4 증상 | v5 해결 |
|---------|---------|
| "기술통계를 추출하지 못했습니다" | Agent 4+ 통합 — 1회 API 호출로 데이터구조+통계+변수 추출 |
| "후속 연구 아이디어가 없습니다" | `runReviewGuide` 3파트 구분자 파싱 |
| Q&A 질문 전송 안 됨 | main.js 이벤트 바인딩 재작성 |

---

## 작업 로그

### 2026-03-26 (2차) — Gemini 멀티모달 PDF 처리 통합
- **문제**: 기존 pdf.js 텍스트 추출 → Gemini 마크다운 변환 방식은 표/그림/수식 인식 불가, API 호출 2~4회 소모
- **해결**: Gemini File API(멀티모달) 통합 — PDF 바이너리를 base64로 직접 전송
  - `pdf.js`: PDF ArrayBuffer → base64 변환 + 페이지 수 확인. 텍스트 추출은 폴백으로만 유지
  - `agents.js`: `callGeminiWithPdf()` 신규 — inline_data로 PDF + 텍스트 프롬프트 전송
  - `mockdata.js`: `convertPdfToMarkdown()` 리팩토링 — 멀티모달 우선, 텍스트 기반 폴백
  - `pipeline.js`: `getPdfBase64()` import, 초기 파이프라인에서 PDF base64 전달
  - `main.js`: `handlePdfFile()` → `processPdfFile()` 사용, 텍스트 추출은 백그라운드 폴백
  - `ui.js`: `showPdfSuccess()` 파일 크기(KB/MB) 표시로 변경
  - `config.js`: 로딩 메시지 변경
- **효과**: 표/그림/OCR 직접 인식, API 호출 1회로 감소, 스캔 PDF도 처리 가능
- **수정 파일**: js/pdf.js, js/agents.js, js/mockdata.js, js/pipeline.js, js/main.js, js/ui.js, js/config.js

### 2026-03-26 — CSS 전면 재작성 + API 키 UI 추가
- **문제**: CSS가 v4 클래스명을 사용 → v5 HTML과 불일치하여 스타일 미적용
- **해결**: style.css 전면 재작성 (v5 HTML 클래스에 맞춤)
  - `.header`, `.config-card`, `.input-card`, `.loading-card` 등 초기 화면 스타일
  - `.loading-step.running/.done` 상태 전환 스타일
  - 동적 생성 요소: `.step-card`, `.qna-message`, `.result-table` 등
- **문제**: API 키 입력 UI 없음 → URL 파라미터로만 입력 가능
- **해결**: config-card에 API 키 입력 섹션 추가
  - 접기/펴기 토글, 저장 상태 표시, localStorage 연동
  - 키 미입력 시 자동 펼침 + 포커스
- **수정 파일**: css/style.css, index.html, js/main.js, js/ui.js

### 2026-03-25 — v5.0 코드 전면 개편 (항목 1~9)
- index.html: 4탭 구조 재작성
- agents.js: 12카테고리 METHODOLOGY_TAXONOMY, runAgent4Plus, runReviewGuide 신규
- pipeline.js: 상태관리 + 온디맨드 파이프라인 완전 재작성
- ui.js: 4탭 + StepExecutor + 리뷰 서브탭 + Q&A 채팅 완전 재작성
- steps.js: 카테고리별 Step 정의 (신규)
- simulator.js: Gemini 결과 시뮬레이션 (신규)
- config.js: v5 토큰 설정 추가
- main.js: v5 재작성

### 2026-03-21 — v4.0 구조 검토
- ResearchMethodAgent_Review.docx 작성
- 구조적 문제 5건, UI/UX 문제 7건 진단
- v5 설계안 도출

---

## 남은 작업

| # | 작업 | 상태 | 설명 |
|---|------|------|------|
| A | steps.js 나머지 카테고리 | ⚠️ 부분완료 | spatial, time_series, ML 등 각 카테고리별 전문 Step 추가 필요 |
| B | [이 방법으로 분석해보기] UI 연결 | ⚠️ 부분완료 | pipeline.js 구현됨, ui.js 클릭→실행→비교 렌더링 연결 필요 |
| C | Q&A 코드 수정 실행 | ⚠️ 부분완료 | simulator.js 구현됨, 자동 실행 UI 필요 |
| D | 에러 핸들링 강화 | ❌ 미시작 | API 429 재시도, 네트워크 에러 복구 |
| E | 실제 배포 테스트 | ❌ 미시작 | GitHub Pages 전체 플로우 테스트 |

---

## 관련 문서
- `project-summary.md` — 이 파일. 개발 과정을 기록. 코드 수정 시마다 업데이트.
- `ResearchMethodAgent_Review.docx` — v4→v5 종합 검토 보고서. 버전 완료 시 업데이트.
- `ResearchMethodAgent_v5_설계안.md` — v5 설계 문서 (삭제됨, 내용은 이 파일에 통합)

*정리 일시: 2026-03-26*
