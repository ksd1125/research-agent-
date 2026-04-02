/**
 * pyodide-runner.js — Pyodide(WebAssembly Python) 런타임 관리
 * ResearchMethodAgent v5.0
 *
 * 브라우저에서 Python 코드를 실행하고 stdout/matplotlib 결과를 캡처합니다.
 * Pyodide CDN에서 로드되며, 패키지는 필요 시 동적 설치됩니다.
 */

/** @type {any} Pyodide 인스턴스 */
let pyodide = null;

/** @type {boolean} 초기화 진행 중 여부 */
let isLoading = false;

/** @type {Promise|null} 초기화 Promise (중복 방지) */
let loadPromise = null;

/** @type {Set<string>} 이미 설치된 패키지 목록 */
const installedPackages = new Set();

/**
 * Pyodide가 초기화되었는지 확인
 * @returns {boolean}
 */
export function isPyodideReady() {
  return pyodide !== null;
}

/**
 * Pyodide 초기화 (최초 1회만 실행)
 * @param {function} [onProgress] — (message: string) => void 진행 상태 콜백
 * @returns {Promise<void>}
 */
export async function initPyodide(onProgress) {
  if (pyodide) return;
  if (loadPromise) return loadPromise;

  isLoading = true;
  loadPromise = _doInit(onProgress);

  try {
    await loadPromise;
  } finally {
    isLoading = false;
    loadPromise = null;
  }
}

async function _doInit(onProgress) {
  const report = onProgress || (() => {});

  report('🐍 Python 환경 로딩 중... (최초 1회, 약 5~10초)');

  // Pyodide 로드 (전역 loadPyodide 함수 사용)
  if (typeof loadPyodide === 'undefined') {
    throw new Error('Pyodide 스크립트가 로드되지 않았습니다. index.html에 Pyodide CDN을 추가해주세요.');
  }

  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
  });

  report('📦 기본 패키지 설치 중... (pandas, numpy, scipy, statsmodels)');

  // 기본 패키지 일괄 설치 (병렬 로드)
  const builtinPackages = ['micropip', 'pandas', 'numpy', 'scipy', 'matplotlib'];
  try {
    await pyodide.loadPackage(builtinPackages);
    builtinPackages.forEach(p => installedPackages.add(p));
  } catch (bulkErr) {
    console.warn('일괄 패키지 로드 실패, 개별 설치 시도:', bulkErr.message);
    for (const pkg of builtinPackages) {
      try { await pyodide.loadPackage(pkg); installedPackages.add(pkg); }
      catch { console.warn(`패키지 ${pkg} 개별 설치 실패`); }
    }
  }

  // statsmodels 사전 설치 (통계분석 핵심)
  report('📦 statsmodels 설치 중...');
  try {
    await pyodide.loadPackage('statsmodels');
    installedPackages.add('statsmodels');
  } catch {
    try {
      const micropip = pyodide.pyimport('micropip');
      await micropip.install('statsmodels');
      installedPackages.add('statsmodels');
    } catch (e2) {
      console.warn('statsmodels 설치 실패 (필요 시 재시도됨):', e2.message);
    }
  }

  // matplotlib 백엔드 설정 (Agg — 비대화형, PNG 출력) + 한글 폰트
  report('🔤 한글 폰트 설정 중...');

  // JavaScript에서 폰트 다운로드 → Pyodide 파일시스템에 직접 기록 (pyfetch보다 안정적)
  try {
    const fontUrl = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf';
    const fontResp = await fetch(fontUrl);
    if (fontResp.ok) {
      const fontData = new Uint8Array(await fontResp.arrayBuffer());
      pyodide.FS.writeFile('/tmp/NanumGothic.ttf', fontData);
    }
  } catch (e) {
    console.warn('한글 폰트 다운로드 실패:', e);
  }

  await pyodide.runPythonAsync(`
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import io, base64, os

_font_path = "/tmp/NanumGothic.ttf"
if os.path.exists(_font_path):
    fm.fontManager.addfont(_font_path)
    plt.rcParams['font.family'] = 'NanumGothic'
    plt.rcParams['axes.unicode_minus'] = False
else:
    plt.rcParams['axes.unicode_minus'] = False
`);

  report('✅ Python 환경 준비 완료');
}

/**
 * 분석에 필요한 추가 패키지 설치
 * @param {string[]} packages — 패키지 이름 배열
 * @param {function} [onProgress]
 */
export async function ensurePackages(packages, onProgress) {
  if (!pyodide) throw new Error('Pyodide가 초기화되지 않았습니다.');

  const report = onProgress || (() => {});
  const micropip = pyodide.pyimport('micropip');

  for (const pkg of packages) {
    if (installedPackages.has(pkg)) continue;

    report(`📦 ${pkg} 설치 중...`);
    try {
      await pyodide.loadPackage(pkg);
      installedPackages.add(pkg);
    } catch {
      try {
        await micropip.install(pkg);
        installedPackages.add(pkg);
      } catch (e2) {
        console.warn(`패키지 ${pkg} 설치 실패 (건너뜀):`, e2.message);
      }
    }
  }
}

/**
 * CSV 데이터를 Pyodide 파일시스템에 로드
 * @param {string} csvText — CSV 문자열
 * @param {string} [filename='mock_data.csv']
 */
export function loadCsvData(csvText, filename = 'mock_data.csv') {
  if (!pyodide) throw new Error('Pyodide가 초기화되지 않았습니다.');
  pyodide.FS.writeFile(filename, csvText);
}

/**
 * Python 코드 실행 + stdout/그래프 캡처
 * @param {string} code — Python 코드
 * @param {string} [csvData] — CSV 데이터 (자동 로드)
 * @returns {Promise<{ stdout: string, images: string[], error: string|null }>}
 */
export async function runPython(code, csvData) {
  if (!pyodide) throw new Error('Pyodide가 초기화되지 않았습니다.');

  // CSV 데이터를 Pyodide 파일시스템에 저장
  if (csvData) {
    loadCsvData(csvData, 'mock_data.csv');
  }

  // stdout 캡처 설정
  await pyodide.runPythonAsync(`
import sys, io
_captured_stdout = io.StringIO()
sys.stdout = _captured_stdout
_captured_images = []

# matplotlib 그래프 캡처 함수 오버라이드
import matplotlib.pyplot as plt
_original_show = plt.show
def _capture_show(*args, **kwargs):
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight', facecolor='white')
    buf.seek(0)
    _captured_images.append(base64.b64encode(buf.read()).decode('utf-8'))
    plt.close('all')
plt.show = _capture_show
`);

  let error = null;

  try {
    // 코드에서 필요한 패키지 감지 및 자동 설치
    const neededPackages = detectRequiredPackages(code);
    if (neededPackages.length > 0) {
      await ensurePackages(neededPackages);
    }

    // 사용자 코드 실행
    await pyodide.runPythonAsync(code);
  } catch (err) {
    error = err.message || String(err);
  }

  // 결과 수집
  const stdout = pyodide.runPython(`
sys.stdout = sys.__stdout__
_captured_stdout.getvalue()
`);

  const imagesProxy = pyodide.runPython('_captured_images');
  const images = imagesProxy.toJs ? Array.from(imagesProxy.toJs()) : [];

  // 정리
  pyodide.runPython(`
plt.show = _original_show
del _captured_stdout, _captured_images, _original_show
plt.close('all')
`);

  return { stdout, images, error };
}

/**
 * 코드에서 필요한 추가 패키지를 감지
 * @param {string} code
 * @returns {string[]}
 */
function detectRequiredPackages(code) {
  const packageMap = {
    'statsmodels': /import\s+statsmodels|from\s+statsmodels/,
    'scikit-learn': /import\s+sklearn|from\s+sklearn/,
    'seaborn': /import\s+seaborn/,
    'pingouin': /import\s+pingouin|from\s+pingouin/,
  };

  const needed = [];
  for (const [pkg, pattern] of Object.entries(packageMap)) {
    if (pattern.test(code) && !installedPackages.has(pkg)) {
      needed.push(pkg);
    }
  }
  return needed;
}

/**
 * Pyodide 리소스 해제 (필요 시)
 */
export function destroyPyodide() {
  if (pyodide) {
    pyodide = null;
    installedPackages.clear();
  }
}
