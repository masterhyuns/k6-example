/**
 * k6 Load Test - SSO 인증을 포함한 정상 부하 테스트
 * 
 * @파일명: load.js
 * @테스트유형: Load Test (부하 테스트)
 * @작성일: 2024
 * 
 * 실행 방법:
 * ----------
 * 1. 기본 실행 (로컬, 인증 없음):
 *    k6 run tests/k6/load.js
 * 
 * 2. SSO 쿠키를 사용한 실행:
 *    k6 run -e SSO_COOKIE="sessionId=abc123; token=xyz789" tests/k6/load.js
 * 
 * 3. SSO 자동 로그인을 사용한 실행:
 *    k6 run -e SSO_LOGIN_URL="https://sso.company.com/login" \
 *           -e SSO_USER="testuser" \
 *           -e SSO_PASS="testpass" \
 *           tests/k6/load.js
 * 
 * 4. 스테이징 환경 + SSO:
 *    k6 run -e BASE_URL="https://staging.company.com" \
 *           -e SSO_COOKIE="..." \
 *           tests/k6/load.js
 * 
 * SSO 쿠키 획득 방법:
 * ------------------
 * 1. 브라우저에서 정상적으로 SSO 로그인
 * 2. F12 개발자 도구 오픈
 * 3. Application/Storage > Cookies 탭
 * 4. 필요한 쿠키 복사 (보통 sessionId, token, JSESSIONID 등)
 * 5. 환경변수로 전달: SSO_COOKIE="name1=value1; name2=value2"
 * 
 * 테스트 목적:
 * -----------
 * 1. 예상 트래픽 수준에서의 시스템 안정성 검증
 * 2. SSO 인증이 있는 실제 환경 성능 측정
 * 3. 동시 사용자 50-100명 처리 능력 평가
 * 4. 장시간 부하 상태에서의 응답시간 일관성 확인
 * 5. 메모리 누수 및 리소스 고갈 현상 조기 발견
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import encoding from 'k6/encoding';

/**
 * 환경 변수 설정
 * 
 * 모든 환경 변수는 k6 실행 시 -e 옵션으로 전달 가능
 * 예: k6 run -e VAR_NAME=value test.js
 */
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const SSO_COOKIE = __ENV.SSO_COOKIE || '';
const SSO_LOGIN_URL = __ENV.SSO_LOGIN_URL || '';
const SSO_USER = __ENV.SSO_USER || '';
const SSO_PASS = __ENV.SSO_PASS || '';

/**
 * 커스텀 메트릭 정의
 * 
 * @metric errorRate - 비즈니스 로직 에러율 (HTTP 에러와 별개)
 * @metric apiDuration - API 응답 시간 추적 (SSO 오버헤드 포함)
 * @metric ssoAuthTime - SSO 인증에 걸리는 시간 추적
 */
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');
const ssoAuthTime = new Trend('sso_auth_time');

/**
 * 테스트 설정
 * 
 * stages: 부하 패턴 정의 (램프업 → 유지 → 램프다운)
 * thresholds: 성공/실패 판단 기준
 */
export const options = {
  /**
   * 부하 단계 (Stages)
   * 
   * 실제 사용 패턴을 모방한 단계적 부하 증가/감소
   * - 오전 업무 시작: 점진적 증가
   * - 오전 피크타임: 50명 유지
   * - 점심 시간 후: 100명까지 증가
   * - 오후 피크타임: 100명 유지
   * - 퇴근 시간: 점진적 감소
   */
  stages: [
    { duration: '2m', target: 50 },  // 워밍업: 2분간 0→50명
    { duration: '5m', target: 50 },  // 안정화: 5분간 50명 유지
    { duration: '2m', target: 100 }, // 증가: 2분간 50→100명
    { duration: '5m', target: 100 }, // 피크: 5분간 100명 유지
    { duration: '2m', target: 0 },   // 쿨다운: 2분간 100→0명
  ],
  
  /**
   * 성능 임계값 (Thresholds)
   * 
   * 하나라도 실패하면 테스트 실패로 간주
   * CI/CD 파이프라인에서 자동 롤백 트리거로 사용 가능
   */
  thresholds: {
    /**
     * HTTP 요청 응답시간
     * - p(95): 95 백분위수 < 1초
     * - p(99): 99 백분위수 < 2초
     * 즉, 전체 요청의 95%는 1초 이내, 99%는 2초 이내 응답
     */
    http_req_duration: [
      'p(95)<1000', // 95%가 1초 이내
      'p(99)<2000', // 99%가 2초 이내
    ],
    
    /**
     * HTTP 요청 실패율
     * - 5% 미만의 요청만 실패 허용
     * - 4xx, 5xx 상태 코드를 실패로 간주
     */
    http_req_failed: ['rate<0.05'],
    
    /**
     * 커스텀 에러율
     * - 비즈니스 로직 실패율 5% 미만
     */
    errors: ['rate<0.05'],
    
    /**
     * API 전용 응답시간
     * - 정적 리소스 제외, API만 측정
     * - 95%가 800ms 이내 응답
     */
    api_duration: ['p(95)<800'],
  },
};

/**
 * UserScenario 클래스
 * 
 * 실제 사용자의 행동 패턴을 시뮬레이션하는 시나리오 클래스
 * SSO 인증 헤더를 모든 요청에 자동 포함
 */
class UserScenario {
  constructor(authCookie) {
    /**
     * HTTP 요청 헤더 설정
     * 
     * Content-Type: API 요청용
     * Cookie: SSO 인증 정보 (있는 경우)
     * User-Agent: 실제 브라우저 시뮬레이션
     */
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'k6-load-test/1.0',
    };
    
    // SSO 쿠키가 있으면 헤더에 추가
    if (authCookie) {
      this.headers['Cookie'] = authCookie;
      console.log('SSO 쿠키 설정됨');
    }
  }
  
  /**
   * 웹사이트 브라우징 시나리오
   * 
   * 일반적인 사용자의 웹사이트 탐색 패턴 재현
   * @returns {Object} Posts API 응답 객체
   */
  browseWebsite() {
    /**
     * 1. 메인 페이지 방문
     * 
     * 사용자가 처음 사이트에 접속하는 시나리오
     * SSO 인증이 필요한 경우 리다이렉트 처리됨
     */
    const mainRes = http.get(BASE_URL, { 
      headers: this.headers,
      // 리다이렉트 자동 추적 (SSO 로그인 페이지로 이동 가능)
      redirects: 10,
    });
    
    // 인증 실패 체크 (401, 403)
    if (mainRes.status === 401 || mainRes.status === 403) {
      console.error('인증 실패: SSO 쿠키를 확인하세요');
      errorRate.add(1);
      return mainRes;
    }
    
    check(mainRes, {
      'Main page status 200': (r) => r.status === 200,
      'Main page not redirect': (r) => r.status !== 302, // SSO 리다이렉트 체크
    });
    
    // 사용자가 페이지를 읽는 시간 시뮬레이션 (1-4초)
    sleep(Math.random() * 3 + 1);
    
    /**
     * 2. Posts 목록 API 호출
     * 
     * AJAX 요청으로 게시물 목록 로드
     * 페이지네이션 파라미터 포함
     */
    const postsRes = http.get(`${BASE_URL}/api/posts?page=1&pageSize=10`, {
      headers: this.headers,
      tags: { name: 'PostsList' }, // 메트릭 그룹화용 태그
    });
    
    // API 응답 검증
    const postsCheck = check(postsRes, {
      'Posts list loaded': (r) => r.status === 200,
      'Posts has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success && Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });
    
    if (!postsCheck) {
      errorRate.add(1);
    }
    
    // API 응답시간 메트릭 기록
    apiDuration.add(postsRes.timings.duration);
    
    return postsRes;
  }
  
  /**
   * 포스트 상세 조회 및 상호작용
   * 
   * @param {string} postId - 조회할 포스트 ID
   * @returns {Object} HTTP 응답 객체
   */
  interactWithPost(postId) {
    /**
     * 1. 포스트 상세 정보 조회
     */
    const postRes = http.get(`${BASE_URL}/api/posts/${postId}`, {
      headers: this.headers,
      tags: { name: 'PostDetail' },
    });
    
    check(postRes, {
      'Post detail loaded': (r) => r.status === 200,
      'Post has content': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success && body.data && body.data.content;
        } catch {
          return false;
        }
      },
    });
    
    apiDuration.add(postRes.timings.duration);
    
    // 사용자가 포스트를 읽는 시간 (1-3초)
    sleep(Math.random() * 2 + 1);
    
    /**
     * 2. 조회수 증가
     * 
     * 자동으로 조회수를 증가시키는 API 호출
     * 중복 조회 방지 로직이 서버에 있을 수 있음
     */
    const viewRes = http.post(`${BASE_URL}/api/posts/${postId}/view`, null, {
      headers: this.headers,
      tags: { name: 'IncrementView' },
    });
    
    check(viewRes, {
      'View increment succeeded': (r) => r.status === 200 || r.status === 204,
    });
    
    /**
     * 3. 좋아요 액션 (30% 확률)
     * 
     * 실제 사용자 행동 패턴 반영
     * 모든 사용자가 좋아요를 누르지는 않음
     */
    if (Math.random() < 0.3) {
      const likeRes = http.post(`${BASE_URL}/api/posts/${postId}/like`, null, {
        headers: this.headers,
        tags: { name: 'LikePost' },
      });
      
      check(likeRes, {
        'Like action succeeded': (r) => r.status === 200 || r.status === 204,
      });
      
      apiDuration.add(likeRes.timings.duration);
    }
    
    return postRes;
  }
  
  /**
   * 사용자 목록 조회
   * 
   * @returns {Object} HTTP 응답 객체
   */
  browseUsers() {
    const usersRes = http.get(`${BASE_URL}/api/users`, {
      headers: this.headers,
      tags: { name: 'UsersList' },
    });
    
    const usersCheck = check(usersRes, {
      'Users loaded': (r) => r.status === 200,
      'Users has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success && Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });
    
    if (!usersCheck) {
      errorRate.add(1);
    }
    
    apiDuration.add(usersRes.timings.duration);
    return usersRes;
  }
  
  /**
   * 새 포스트 작성 (10% 확률)
   * 
   * 쓰기 작업 부하 테스트
   * 실제로는 모든 사용자가 글을 작성하지 않으므로 확률적으로 실행
   */
  createPost() {
    if (Math.random() < 0.1) {
      const payload = {
        title: `Load Test Post ${Date.now()}`,
        content: `This is a post created during load testing at ${new Date().toISOString()}. ` +
                 `Test environment: ${BASE_URL}. ` +
                 `Virtual User: ${__VU}, Iteration: ${__ITER}`,
        authorId: `user-${Math.floor(Math.random() * 10) + 1}`,
        tags: ['load-test', 'automated'],
      };
      
      const res = http.post(
        `${BASE_URL}/api/posts`,
        JSON.stringify(payload),
        { 
          headers: this.headers,
          tags: { name: 'CreatePost' },
        }
      );
      
      const createCheck = check(res, {
        'Post created': (r) => r.status === 201,
        'Post has ID': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.success && body.data && body.data.id;
          } catch {
            return false;
          }
        },
      });
      
      if (!createCheck) {
        errorRate.add(1);
        console.error(`포스트 생성 실패: ${res.status} - ${res.body}`);
      }
      
      apiDuration.add(res.timings.duration);
    }
  }
}

/**
 * SSO 로그인 함수
 * 
 * SSO 시스템에 자동 로그인하여 인증 쿠키 획득
 * @returns {string} 인증 쿠키 문자열
 */
function performSSOLogin() {
  if (!SSO_LOGIN_URL || !SSO_USER || !SSO_PASS) {
    console.log('SSO 자동 로그인 정보가 없습니다. 환경변수 쿠키를 사용합니다.');
    return SSO_COOKIE;
  }
  
  console.log(`SSO 로그인 시도: ${SSO_LOGIN_URL}`);
  const startTime = Date.now();
  
  /**
   * SSO 로그인 요청
   * 
   * 실제 SSO 시스템에 따라 수정 필요:
   * - Form 데이터 형식
   * - JSON 형식
   * - OAuth 플로우 등
   */
  const loginRes = http.post(
    SSO_LOGIN_URL,
    JSON.stringify({
      username: SSO_USER,
      password: SSO_PASS,
      // SSO 시스템에 따라 추가 필드 필요할 수 있음
      // rememberMe: true,
      // clientId: 'load-test-client',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      // 쿠키 자동 저장
      jar: http.cookieJar(),
      // 리다이렉트 추적
      redirects: 10,
    }
  );
  
  ssoAuthTime.add(Date.now() - startTime);
  
  if (loginRes.status !== 200 && loginRes.status !== 302) {
    console.error(`SSO 로그인 실패: ${loginRes.status}`);
    return '';
  }
  
  /**
   * 응답 헤더에서 Set-Cookie 추출
   * 
   * 여러 개의 쿠키가 설정될 수 있음:
   * - sessionId
   * - token
   * - JSESSIONID
   * - refreshToken 등
   */
  const cookies = loginRes.headers['Set-Cookie'];
  if (cookies) {
    // 배열인 경우 처리
    if (Array.isArray(cookies)) {
      return cookies.join('; ');
    }
    return cookies;
  }
  
  // 쿠키 jar에서 직접 추출
  const jar = http.cookieJar();
  const jarCookies = jar.cookiesForURL(SSO_LOGIN_URL);
  if (jarCookies) {
    return Object.entries(jarCookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }
  
  console.error('SSO 로그인 성공했지만 쿠키를 찾을 수 없습니다');
  return '';
}

/**
 * Setup 함수: 테스트 시작 전 실행
 * 
 * - 시스템 헬스체크
 * - SSO 로그인 (필요시)
 * - 초기 데이터 준비
 * 
 * @returns {Object} 모든 VU가 공유할 데이터
 */
export function setup() {
  console.log('=== Load Test Setup 시작 ===');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`SSO Cookie 제공: ${SSO_COOKIE ? 'Yes' : 'No'}`);
  console.log(`SSO Auto Login: ${SSO_LOGIN_URL ? 'Yes' : 'No'}`);
  
  /**
   * 1. 시스템 헬스체크
   */
  const healthRes = http.get(`${BASE_URL}/api/health`);
  if (healthRes.status !== 200) {
    throw new Error(`Target system is not healthy: ${healthRes.status}`);
  }
  
  /**
   * 2. SSO 인증 처리
   */
  let authCookie = SSO_COOKIE;
  
  // 환경변수에 쿠키가 없으면 자동 로그인 시도
  if (!authCookie && SSO_LOGIN_URL) {
    authCookie = performSSOLogin();
    if (!authCookie) {
      console.warn('SSO 로그인 실패. 인증 없이 테스트를 진행합니다.');
    }
  }
  
  /**
   * 3. 인증 테스트
   */
  if (authCookie) {
    const testRes = http.get(`${BASE_URL}/api/posts`, {
      headers: { 'Cookie': authCookie },
    });
    
    if (testRes.status === 401 || testRes.status === 403) {
      console.error('SSO 쿠키가 유효하지 않습니다!');
      // throw new Error('Invalid SSO cookie');
    } else {
      console.log('SSO 인증 성공!');
    }
  }
  
  console.log('=== Load Test Setup 완료 ===\n');
  
  // 모든 VU가 공유할 데이터 반환
  return { 
    startTime: Date.now(),
    authCookie: authCookie,
  };
}

/**
 * 메인 테스트 시나리오
 * 
 * 각 VU(Virtual User)가 반복 실행하는 함수
 * setup()에서 반환한 data를 매개변수로 받음
 */
export default function (data) {
  // setup()에서 획득한 인증 쿠키 사용
  const scenario = new UserScenario(data.authCookie);
  
  /**
   * Group 1: 웹사이트 브라우징 플로우
   * 
   * group()으로 관련 요청들을 묶어서 메트릭 분석 용이
   */
  group('User Browse Flow', () => {
    // 웹사이트 브라우징
    const postsRes = scenario.browseWebsite();
    
    // 응답 성공시 상세 페이지 조회
    if (postsRes.status === 200) {
      try {
        const body = JSON.parse(postsRes.body);
        const posts = body.data;
        
        // 랜덤 포스트 선택하여 상세 조회
        if (posts && posts.length > 0) {
          const randomPost = posts[Math.floor(Math.random() * posts.length)];
          scenario.interactWithPost(randomPost.id);
        }
      } catch (e) {
        console.error('Posts 파싱 실패:', e);
        errorRate.add(1);
      }
    } else if (postsRes.status === 401) {
      console.error('인증 실패 - SSO 쿠키를 확인하세요');
      errorRate.add(1);
      // 인증 실패시 테스트 중단
      return;
    }
    
    // 페이지 간 이동 시뮬레이션
    sleep(Math.random() * 3 + 2);
  });
  
  /**
   * Group 2: 추가 사용자 활동
   */
  group('User Activity', () => {
    // 사용자 목록 조회
    scenario.browseUsers();
    sleep(Math.random() * 2 + 1);
    
    // 새 포스트 작성 시도 (확률적)
    scenario.createPost();
  });
  
  /**
   * 세션 간 대기 시간
   * 
   * 실제 사용자는 계속 클릭하지 않고 휴식을 가짐
   * Think Time 시뮬레이션
   */
  sleep(Math.random() * 5 + 3);
}

/**
 * Teardown 함수: 테스트 종료 후 실행
 * 
 * @param {Object} data - setup()에서 반환한 데이터
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('\n=== Load Test 완료 ===');
  console.log(`총 실행 시간: ${duration.toFixed(2)}초`);
  console.log(`인증 방식: ${data.authCookie ? 'SSO 쿠키 사용' : '인증 없음'}`);
}

/**
 * 테스트 결과 요약 리포트 생성
 * 
 * @param {Object} data - k6가 수집한 모든 메트릭 데이터
 * @returns {Object} 출력 파일 맵
 */
export function handleSummary(data) {
  return {
    // HTML 리포트
    './load-test-results.html': htmlReport(data),
    // JSON 원본 데이터
    './load-test-results.json': JSON.stringify(data, null, 2),
    // 콘솔 출력
    stdout: textSummary(data),
  };
}

/**
 * 텍스트 형식 요약 생성
 */
function textSummary(data) {
  const { metrics } = data;
  
  return `
=== LOAD TEST RESULTS ===

Test Configuration:
------------------
Target URL: ${BASE_URL}
SSO Authentication: ${SSO_COOKIE || SSO_LOGIN_URL ? 'Enabled' : 'Disabled'}
Max VUs: 100
Test Duration: 16 minutes

Performance Metrics:
-------------------
✓ Total Requests: ${metrics.http_reqs.values.count}
✓ Request Rate: ${metrics.http_reqs.values.rate.toFixed(2)} req/s
✓ Success Rate: ${((1 - metrics.http_req_failed.values.rate) * 100).toFixed(2)}%
✓ Error Rate: ${(metrics.errors?.values.rate * 100 || 0).toFixed(2)}%

Response Times:
--------------
✓ Average: ${metrics.http_req_duration.values.avg.toFixed(0)}ms
✓ Median: ${metrics.http_req_duration.values.med.toFixed(0)}ms
✓ P95: ${metrics.http_req_duration.values['p(95)'].toFixed(0)}ms
✓ P99: ${metrics.http_req_duration.values['p(99)'].toFixed(0)}ms

API Performance:
---------------
✓ API Avg Response: ${metrics.api_duration?.values.avg.toFixed(0)}ms
✓ API P95 Response: ${metrics.api_duration?.values['p(95)'].toFixed(0)}ms

SSO Performance:
---------------
✓ Auth Time Avg: ${metrics.sso_auth_time?.values.avg?.toFixed(0) || 'N/A'}ms

Throughput:
----------
✓ Data Received: ${(metrics.data_received.values.count / 1024 / 1024).toFixed(2)} MB
✓ Data Sent: ${(metrics.data_sent.values.count / 1024 / 1024).toFixed(2)} MB

Test Result: ${metrics.http_req_failed.values.rate < 0.05 ? '✅ PASSED' : '❌ FAILED'}
`;
}

/**
 * HTML 리포트 생성
 */
function htmlReport(data) {
  const { metrics } = data;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Load Test Results - ${new Date().toISOString()}</title>
  <style>
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      margin: 0;
      padding: 0;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    .metric {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metric h3 {
      margin-top: 0;
      color: #333;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .metric p {
      margin: 10px 0;
      display: flex;
      justify-content: space-between;
    }
    .metric .value {
      font-weight: bold;
      color: #667eea;
    }
    .pass {
      background: #d4edda;
      border-left: 4px solid #28a745;
    }
    .fail {
      background: #f8d7da;
      border-left: 4px solid #dc3545;
    }
    .warning {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
    }
    .summary {
      background: white;
      border-radius: 8px;
      padding: 30px;
      margin: 20px 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .chart {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚀 Load Test Report</h1>
    <p>Generated at: ${new Date().toISOString()}</p>
    <p>Target: ${BASE_URL}</p>
  </div>
  
  <div class="container">
    <div class="summary ${metrics.http_req_failed.values.rate < 0.05 ? 'pass' : 'fail'}">
      <h2>📊 Test Summary</h2>
      <div class="metric-grid">
        <div>
          <p>Test Duration: <span class="value">16 minutes</span></p>
          <p>Max Virtual Users: <span class="value">100</span></p>
          <p>Total Requests: <span class="value">${metrics.http_reqs.values.count.toLocaleString()}</span></p>
        </div>
        <div>
          <p>Success Rate: <span class="value">${((1 - metrics.http_req_failed.values.rate) * 100).toFixed(2)}%</span></p>
          <p>Error Rate: <span class="value">${(metrics.errors?.values.rate * 100 || 0).toFixed(2)}%</span></p>
          <p>Avg Request/sec: <span class="value">${metrics.http_reqs.values.rate.toFixed(2)}</span></p>
        </div>
        <div>
          <p>SSO Auth: <span class="value">${SSO_COOKIE || SSO_LOGIN_URL ? 'Enabled' : 'Disabled'}</span></p>
          <p>Test Result: <span class="value">${metrics.http_req_failed.values.rate < 0.05 ? '✅ PASSED' : '❌ FAILED'}</span></p>
        </div>
      </div>
    </div>
    
    <div class="metric-grid">
      <div class="metric">
        <h3>⏱️ Response Times</h3>
        <p>Average: <span class="value">${metrics.http_req_duration.values.avg.toFixed(0)}ms</span></p>
        <p>Median: <span class="value">${metrics.http_req_duration.values.med.toFixed(0)}ms</span></p>
        <p>P90: <span class="value">${metrics.http_req_duration.values['p(90)'].toFixed(0)}ms</span></p>
        <p>P95: <span class="value">${metrics.http_req_duration.values['p(95)'].toFixed(0)}ms</span></p>
        <p>P99: <span class="value">${metrics.http_req_duration.values['p(99)'].toFixed(0)}ms</span></p>
        <p>Max: <span class="value">${metrics.http_req_duration.values.max.toFixed(0)}ms</span></p>
      </div>
      
      <div class="metric">
        <h3>🚀 API Performance</h3>
        <p>API Avg Response: <span class="value">${metrics.api_duration?.values.avg.toFixed(0)}ms</span></p>
        <p>API P95 Response: <span class="value">${metrics.api_duration?.values['p(95)'].toFixed(0)}ms</span></p>
        <p>API Request Count: <span class="value">${metrics.api_duration?.values.count || 0}</span></p>
      </div>
      
      <div class="metric">
        <h3>📊 Throughput</h3>
        <p>Requests/sec: <span class="value">${metrics.http_reqs.values.rate.toFixed(2)}</span></p>
        <p>Data Received: <span class="value">${(metrics.data_received.values.count / 1024 / 1024).toFixed(2)} MB</span></p>
        <p>Data Sent: <span class="value">${(metrics.data_sent.values.count / 1024 / 1024).toFixed(2)} MB</span></p>
        <p>Avg Recv Rate: <span class="value">${(metrics.data_received.values.rate / 1024).toFixed(2)} KB/s</span></p>
      </div>
      
      <div class="metric">
        <h3>🔐 SSO Metrics</h3>
        <p>Auth Method: <span class="value">${SSO_COOKIE ? 'Cookie' : SSO_LOGIN_URL ? 'Auto Login' : 'None'}</span></p>
        <p>Auth Time: <span class="value">${metrics.sso_auth_time?.values.avg?.toFixed(0) || 'N/A'}ms</span></p>
        <p>401/403 Errors: <span class="value">${metrics.http_req_failed?.values.count || 0}</span></p>
      </div>
      
      <div class="metric">
        <h3>✅ Checks</h3>
        <p>Total Checks: <span class="value">${(metrics.checks?.values.passes || 0) + (metrics.checks?.values.fails || 0)}</span></p>
        <p>Passed: <span class="value">${metrics.checks?.values.passes || 0}</span></p>
        <p>Failed: <span class="value">${metrics.checks?.values.fails || 0}</span></p>
        <p>Pass Rate: <span class="value">${((metrics.checks?.values.passes || 0) / ((metrics.checks?.values.passes || 0) + (metrics.checks?.values.fails || 1)) * 100).toFixed(2)}%</span></p>
      </div>
      
      <div class="metric">
        <h3>📈 Load Pattern</h3>
        <p>Stage 1: <span class="value">0→50 VUs (2m)</span></p>
        <p>Stage 2: <span class="value">50 VUs (5m)</span></p>
        <p>Stage 3: <span class="value">50→100 VUs (2m)</span></p>
        <p>Stage 4: <span class="value">100 VUs (5m)</span></p>
        <p>Stage 5: <span class="value">100→0 VUs (2m)</span></p>
      </div>
    </div>
    
    <div class="chart">
      <h3>📈 Performance Thresholds</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Metric</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Threshold</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Actual</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px;">P95 Response Time</td>
            <td style="padding: 10px;">&lt; 1000ms</td>
            <td style="padding: 10px;">${metrics.http_req_duration.values['p(95)'].toFixed(0)}ms</td>
            <td style="padding: 10px;">${metrics.http_req_duration.values['p(95)'] < 1000 ? '✅' : '❌'}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="padding: 10px;">P99 Response Time</td>
            <td style="padding: 10px;">&lt; 2000ms</td>
            <td style="padding: 10px;">${metrics.http_req_duration.values['p(99)'].toFixed(0)}ms</td>
            <td style="padding: 10px;">${metrics.http_req_duration.values['p(99)'] < 2000 ? '✅' : '❌'}</td>
          </tr>
          <tr>
            <td style="padding: 10px;">Error Rate</td>
            <td style="padding: 10px;">&lt; 5%</td>
            <td style="padding: 10px;">${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%</td>
            <td style="padding: 10px;">${metrics.http_req_failed.values.rate < 0.05 ? '✅' : '❌'}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="padding: 10px;">API P95 Response</td>
            <td style="padding: 10px;">&lt; 800ms</td>
            <td style="padding: 10px;">${metrics.api_duration?.values['p(95)'].toFixed(0) || 'N/A'}ms</td>
            <td style="padding: 10px;">${(metrics.api_duration?.values['p(95)'] || 0) < 800 ? '✅' : '❌'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  
  <div class="footer">
    <p>Generated by k6 Load Test Framework | ${new Date().toFullYear()}</p>
    <p>Test Environment: ${BASE_URL}</p>
  </div>
</body>
</html>
`;
}