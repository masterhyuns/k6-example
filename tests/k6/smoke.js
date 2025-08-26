/**
 * k6 Smoke Test - 시스템 기본 동작 확인 테스트
 * 
 * @파일명: smoke.js
 * @테스트유형: Smoke Test (연기 테스트)
 * @실행방법: k6 run tests/k6/smoke.js
 * 
 * 테스트 개요:
 * -----------
 * Smoke Test는 가장 기본적인 성능 테스트로, 최소한의 부하에서 시스템이
 * 정상적으로 작동하는지 확인합니다. CI/CD 파이프라인에서 빠른 피드백을
 * 제공하며, 배포 직후 시스템 정상 동작을 검증하는 용도로 사용됩니다.
 * 
 * 테스트 목적:
 * -----------
 * 1. 핵심 기능의 정상 작동 확인
 * 2. API 엔드포인트 접근성 검증
 * 3. 기본적인 응답시간 측정
 * 4. 크리티컬한 버그 조기 발견
 * 5. 배포 후 시스템 헬스체크
 * 
 * 성공 기준 (Thresholds):
 * ----------------------
 * - HTTP 요청 실패율: < 1% (http_req_failed)
 * - 95% 응답시간: < 500ms (p95)
 * - 커스텀 에러율: < 1% (errors metric)
 * 
 * 테스트 구성:
 * -----------
 * - 가상 사용자(VU): 1명
 * - 테스트 시간: 1분
 * - 요청 간격: 1-2초
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

/**
 * 커스텀 메트릭 정의
 * 
 * @metric errorRate - 커스텀 에러율 추적 메트릭
 * Rate 타입: 성공/실패 비율을 백분율로 계산
 * 용도: check() 함수 실패 시 에러율을 추적하여 전체 테스트 성공률 파악
 * 계산 방법: (실패 횟수 / 전체 시도 횟수) * 100
 */
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