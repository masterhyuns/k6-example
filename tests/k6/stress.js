import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/**
 * Stress Test - 한계점 찾기
 * 목적: 시스템이 처리할 수 있는 최대 부하 확인
 * 시나리오: 점진적으로 부하 증가시켜 breaking point 찾기
 * 관찰 포인트: 응답시간 급증, 에러율 증가, 시스템 다운
 */

// 커스텀 메트릭
const errorRate = new Rate('errors');
const apiErrors = new Counter('api_errors');
const slowRequests = new Counter('slow_requests');
const responseTime = new Trend('response_time');

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // 워밍업
    { duration: '3m', target: 200 },   // 정상 부하
    { duration: '3m', target: 300 },   // 증가된 부하
    { duration: '3m', target: 400 },   // 높은 부하
    { duration: '3m', target: 500 },   // 매우 높은 부하
    { duration: '3m', target: 600 },   // 극한 부하
    { duration: '5m', target: 600 },   // 극한 부하 유지
    { duration: '3m', target: 0 },     // 쿨다운
  ],
  
  thresholds: {
    http_req_duration: [
      'p(90)<3000',  // 90%가 3초 이내 (느슨한 기준)
      'p(95)<5000',  // 95%가 5초 이내
    ],
    http_req_failed: ['rate<0.20'], // 20% 미만 실패율
    errors: ['rate<0.30'],           // 30% 미만 에러율
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

// 부하 생성 패턴
const loadPatterns = {
  // 읽기 집약적 패턴
  readHeavy: () => {
    const endpoints = [
      '/api/posts',
      '/api/posts?page=2&pageSize=20',
      '/api/users',
      '/api/posts/post-1',
      '/api/posts/post-2',
      '/api/posts/post-3',
    ];
    
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const start = Date.now();
    const res = http.get(`${BASE_URL}${endpoint}`, {
      timeout: '10s',
    });
    const duration = Date.now() - start;
    
    responseTime.add(duration);
    
    if (duration > 3000) {
      slowRequests.add(1);
    }
    
    const success = check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 3s': (r) => r.timings.duration < 3000,
    });
    
    if (!success || res.status !== 200) {
      apiErrors.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
    
    return res;
  },
  
  // 쓰기 집약적 패턴
  writeHeavy: () => {
    const payload = {
      title: `Stress Test Post ${Date.now()}`,
      content: `Heavy load testing at ${new Date().toISOString()}. `.repeat(50),
      authorId: `user-${Math.floor(Math.random() * 10) + 1}`,
    };
    
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/posts`,
      JSON.stringify(payload),
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: '10s',
      }
    );
    const duration = Date.now() - start;
    
    responseTime.add(duration);
    
    if (duration > 3000) {
      slowRequests.add(1);
    }
    
    const success = check(res, {
      'post created': (r) => r.status === 201,
      'response time < 3s': (r) => r.timings.duration < 3000,
    });
    
    if (!success) {
      apiErrors.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
    
    return res;
  },
  
  // 혼합 패턴
  mixed: () => {
    if (Math.random() < 0.8) {
      return loadPatterns.readHeavy();
    } else {
      return loadPatterns.writeHeavy();
    }
  },
  
  // 버스트 패턴 (동시 요청)
  burst: async () => {
    const requests = [];
    const batchSize = 5;
    
    for (let i = 0; i < batchSize; i++) {
      requests.push(
        http.get(`${BASE_URL}/api/posts?page=${i + 1}`, {
          timeout: '10s',
        })
      );
    }
    
    const responses = await Promise.all(requests);
    
    responses.forEach(res => {
      const success = res.status === 200;
      if (!success) {
        apiErrors.add(1);
        errorRate.add(1);
      } else {
        errorRate.add(0);
      }
    });
    
    return responses;
  },
};

export default function () {
  // VU 수에 따른 패턴 선택
  const vuCount = __VU;
  const iterCount = __ITER;
  
  // 다양한 부하 패턴 적용
  if (vuCount % 4 === 0) {
    loadPatterns.writeHeavy();
  } else if (vuCount % 4 === 1) {
    loadPatterns.readHeavy();
  } else if (vuCount % 4 === 2) {
    loadPatterns.mixed();
  } else {
    if (iterCount % 10 === 0) {
      loadPatterns.burst();
    } else {
      loadPatterns.readHeavy();
    }
  }
  
  // 부하 단계에 따른 대기 시간 조정
  const currentVUs = __ENV.K6_VUS || 1;
  let sleepTime = 1;
  
  if (currentVUs > 400) {
    sleepTime = Math.random() * 0.5; // 극한 부하: 짧은 대기
  } else if (currentVUs > 200) {
    sleepTime = Math.random() * 1 + 0.5; // 높은 부하: 중간 대기
  } else {
    sleepTime = Math.random() * 2 + 1; // 정상 부하: 긴 대기
  }
  
  sleep(sleepTime);
}

// 실시간 모니터링을 위한 핸들러
export function handleSummary(data) {
  const { metrics } = data;
  
  // 시스템 상태 판단
  const errorRate = metrics.http_req_failed.values.rate;
  const p95Response = metrics.http_req_duration.values['p(95)'];
  const p99Response = metrics.http_req_duration.values['p(99)'];
  
  let systemStatus = 'HEALTHY';
  let breakingPoint = null;
  
  if (errorRate > 0.5) {
    systemStatus = 'CRITICAL';
    breakingPoint = 'System failure - Error rate > 50%';
  } else if (errorRate > 0.3) {
    systemStatus = 'DEGRADED';
    breakingPoint = 'Performance degraded - Error rate > 30%';
  } else if (p95Response > 5000) {
    systemStatus = 'SLOW';
    breakingPoint = 'Response time degraded - P95 > 5s';
  } else if (p99Response > 10000) {
    systemStatus = 'WARNING';
    breakingPoint = 'Some requests very slow - P99 > 10s';
  }
  
  const report = `
=== STRESS TEST RESULTS ===

System Status: ${systemStatus}
${breakingPoint ? `Breaking Point: ${breakingPoint}` : ''}

Performance Metrics:
--------------------
Total Requests: ${metrics.http_reqs.values.count}
Request Rate: ${metrics.http_reqs.values.rate.toFixed(2)} req/s
Error Rate: ${(errorRate * 100).toFixed(2)}%
API Errors: ${metrics.api_errors?.values.count || 0}
Slow Requests (>3s): ${metrics.slow_requests?.values.count || 0}

Response Times:
--------------
Min: ${metrics.http_req_duration.values.min.toFixed(0)}ms
Avg: ${metrics.http_req_duration.values.avg.toFixed(0)}ms
Med: ${metrics.http_req_duration.values.med.toFixed(0)}ms
P90: ${metrics.http_req_duration.values['p(90)'].toFixed(0)}ms
P95: ${p95Response.toFixed(0)}ms
P99: ${p99Response.toFixed(0)}ms
Max: ${metrics.http_req_duration.values.max.toFixed(0)}ms

Load Capacity Analysis:
----------------------
✓ Handled up to ${metrics.vus_max?.values.value || 600} concurrent users
✓ Peak throughput: ${metrics.http_reqs.values.rate.toFixed(2)} req/s
✓ Data transferred: ${(metrics.data_received.values.count / 1024 / 1024).toFixed(2)} MB received
✓ ${systemStatus === 'HEALTHY' ? 'System remained stable under stress' : breakingPoint}

Recommendations:
---------------
${generateRecommendations(metrics, systemStatus)}
`;
  
  return {
    'stdout': report,
    './stress-test-results.json': JSON.stringify(data, null, 2),
  };
}

function generateRecommendations(metrics, status) {
  const recommendations = [];
  
  const errorRate = metrics.http_req_failed.values.rate;
  const p95 = metrics.http_req_duration.values['p(95)'];
  
  if (errorRate > 0.1) {
    recommendations.push('• Implement circuit breakers to handle failures gracefully');
    recommendations.push('• Add retry logic with exponential backoff');
    recommendations.push('• Scale horizontally to distribute load');
  }
  
  if (p95 > 3000) {
    recommendations.push('• Optimize database queries and add indexes');
    recommendations.push('• Implement caching layer (Redis/Memcached)');
    recommendations.push('• Consider database read replicas');
  }
  
  if (status === 'CRITICAL' || status === 'DEGRADED') {
    recommendations.push('• Implement rate limiting to prevent overload');
    recommendations.push('• Add autoscaling based on CPU/memory metrics');
    recommendations.push('• Review and optimize resource-intensive operations');
  }
  
  if (metrics.slow_requests?.values.count > 100) {
    recommendations.push('• Analyze slow query logs');
    recommendations.push('• Implement request timeout handling');
    recommendations.push('• Consider async processing for heavy operations');
  }
  
  return recommendations.length > 0 
    ? recommendations.join('\n')
    : '• System performed well under stress\n• Consider current configuration adequate';
}