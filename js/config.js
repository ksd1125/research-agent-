/**
 * config.js — 전역 설정 및 상수
 * ResearchMethodAgent v4.0
 */

export const APP = {
  name: 'ResearchMethodAgent',
  version: '4.0',
  model: 'gemini-2.5-flash',
};
/**
 * config.js — 전역 설정 및 상수
 * ResearchMethodAgent v4.0
 */

export const APP = {
  name: 'ResearchMethodAgent',
  version: '4.0',
  model: 'gemini-2.5-flash',
};

export const API = {
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  defaultModel: 'gemini-2.5-flash',
  defaultTemp: 0.1,
  /** 에이전트별 최대 토큰 설정 */
  tokens: {
    agent1: 4000,
    agent2: 2000,
    agent3Meta: 500,
    agent3Code: 8000,
  },
  /** 감지할 최대 방법론 수 */
  maxMethods: 2,
};

export const MESSAGES = {
  errors: {
    noApiKey:     '환경 설정에서 API 키를 입력해주세요.',
    noPdfText:    'PDF 파일을 선택하고 텍스트 추출이 완료될 때까지 기다려주세요.',
    noTextInput:  '논문 텍스트를 입력해주세요.',
    emptyResponse:'Gemini 응답이 비어있습니다.',
    jsonParse:    'JSON 파싱 실패. 원본 응답:\n',
    agent1Parse:  'Agent 1 파싱 실패. 응답이 잘렸을 수 있습니다.\n원본:\n',
    agent1NoJson: 'Agent 1 파싱 실패. JSON을 찾을 수 없습니다.\n원본:\n',
    noMethods:    'Agent 1이 방법론을 감지하지 못했습니다. 논문에 방법론 관련 텍스트가 충분히 포함되어 있는지 확인하세요.',
  },
  loading: {
    init:    '파이프라인 준비 중...',
    agent1:  '<b>[Agent 1: 문서 분석기]</b><br>논문의 학문 분야와 데이터 구조를 파악 중입니다...',
    agent2:  (i, total, domain, method) =>
      `<b>[Agent 2: 통계 분석기]</b> (${i}/${total})<br>'${domain}' 관점에서 '${method}' 방법론을 해석 중입니다...`,
    agent3:  (i, total) =>
      `<b>[Agent 3: 코드 생성기]</b> (${i}/${total})<br>Python/R 코드 작성 중...`,
    agent4:  '<b>[Agent 4: 데이터 생성기]</b><br>논문의 기술통계를 역산하여 가상 데이터를 준비 중입니다...',
  },
};

export const API = {
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  defaultModel: 'gemini-2.5-flash',
  defaultTemp: 0.1,
  /** 에이전트별 최대 토큰 설정 */
  tokens: {
    agent1: 4000,
    agent2: 2000,
    agent3Meta: 500,
    agent3Code: 8000,
  },
  /** 감지할 최대 방법론 수 */
  maxMethods: 2,
};

export const MESSAGES = {
  errors: {
    noApiKey:     '환경 설정에서 API 키를 입력해주세요.',
    noPdfText:    'PDF 파일을 선택하고 텍스트 추출이 완료될 때까지 기다려주세요.',
    noTextInput:  '논문 텍스트를 입력해주세요.',
    emptyResponse:'Gemini 응답이 비어있습니다.',
    jsonParse:    'JSON 파싱 실패. 원본 응답:\n',
    agent1Parse:  'Agent 1 파싱 실패. 응답이 잘렸을 수 있습니다.\n원본:\n',
    agent1NoJson: 'Agent 1 파싱 실패. JSON을 찾을 수 없습니다.\n원본:\n',
    noMethods:    'Agent 1이 방법론을 감지하지 못했습니다. 논문에 방법론 관련 텍스트가 충분히 포함되어 있는지 확인하세요.',
  },
  loading: {
    init:    '파이프라인 준비 중...',
    agent1:  '<b>[Agent 1: 문서 분석기]</b><br>논문의 학문 분야와 데이터 구조를 파악 중입니다...',
    agent2:  (i, total, domain, method) =>
      `<b>[Agent 2: 통계 분석기]</b> (${i}/${total})<br>'${domain}' 관점에서 '${method}' 방법론을 해석 중입니다...`,
    agent3:  (i, total) =>
      `<b>[Agent 3: 코드 생성기]</b> (${i}/${total})<br>Python/R 코드 작성 중...`,
  },
};
