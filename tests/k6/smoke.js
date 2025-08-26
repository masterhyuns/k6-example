import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

/**
 * Smoke Test - 기본 동작 확인
 * 목적: 시스템이 최소한의 부하에서 정상 작동하는지 확인
 * 성공 기준: 에러율 < 1%, 응답시간 < 500ms
 */

// 커스텀 메트릭 정의
const errorRate = new Rate('errors');

// 테스트 설정
export const options = {
  vus: 1, // 가상 사용자 1명
  duration: '1m', // 1분 동안 실행
  
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% 요청이 500ms 이내
    http_req_failed: ['rate<0.01'], // 에러율 1% 미만
    errors: ['rate<0.01'], // 커스텀 에러율 1% 미만
  },
};

// 테스트 환경 설정
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

// 헬퍼 함수: API 요청과 검증
function makeRequest(url, name) {
  const res = http.get(url);
  
  const success = check(res, {
    [`${name}: status is 200`]: (r) => r.status === 200,
    [`${name}: response time < 500ms`]: (r) => r.timings.duration < 500,
    [`${name}: has success field`]: (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.hasOwnProperty('success');
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  return res;
}

export default function () {
  // 1. 헬스체크
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'Health check passed': (r) => r.status === 200,
    'Health check has status': (r) => {
      const body = JSON.parse(r.body);
      return body.status === 'healthy';
    },
  });
  
  sleep(1);
  
  // 2. 메인 페이지 로드
  const mainRes = http.get(BASE_URL);
  check(mainRes, {
    'Main page loads': (r) => r.status === 200,
    'Main page response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  sleep(2);
  
  // 3. Posts API 테스트
  makeRequest(`${BASE_URL}/api/posts`, 'Posts API');
  sleep(1);
  
  // 4. Users API 테스트
  makeRequest(`${BASE_URL}/api/users`, 'Users API');
  sleep(1);
  
  // 5. 특정 포스트 조회
  const postId = 'post-1';
  makeRequest(`${BASE_URL}/api/posts/${postId}`, 'Single Post');
  sleep(1);
  
  // 6. 조회수 증가 API
  const viewRes = http.post(`${BASE_URL}/api/posts/${postId}/view`);
  check(viewRes, {
    'View increment works': (r) => r.status === 200,
  });
  
  sleep(2);
}

// 테스트 종료 후 요약
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    './smoke-test-results.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const { metrics } = data;
  
  return `
=== SMOKE TEST RESULTS ===

✓ Checks........................: ${metrics.checks.values.passes}/${metrics.checks.values.passes + metrics.checks.values.fails}
✓ Error Rate....................: ${(metrics.errors?.values?.rate * 100 || 0).toFixed(2)}%
✓ HTTP Request Duration.........: avg=${metrics.http_req_duration.values.avg.toFixed(2)}ms p(95)=${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms
✓ HTTP Request Failed...........: ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%
✓ Virtual Users.................: ${options.vus || 1}
✓ Test Duration.................: ${options.duration || '1m'}

${metrics.http_req_failed.values.rate < 0.01 ? '✅ TEST PASSED' : '❌ TEST FAILED'}
`;
}