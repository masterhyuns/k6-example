import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * Load Test - 정상 부하 테스트
 * 목적: 예상 트래픽 수준에서 시스템 성능 확인
 * 시나리오: 점진적으로 사용자 증가 후 유지, 감소
 * 성공 기준: 에러율 < 5%, p(95) < 1000ms
 */

// 커스텀 메트릭
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');

export const options = {
  stages: [
    { duration: '2m', target: 50 },  // 2분간 50명까지 증가
    { duration: '5m', target: 50 },  // 5분간 50명 유지
    { duration: '2m', target: 100 }, // 2분간 100명까지 증가
    { duration: '5m', target: 100 }, // 5분간 100명 유지
    { duration: '2m', target: 0 },   // 2분간 0명으로 감소
  ],
  
  thresholds: {
    http_req_duration: [
      'p(95)<1000', // 95%가 1초 이내
      'p(99)<2000', // 99%가 2초 이내
    ],
    http_req_failed: ['rate<0.05'], // 5% 미만 실패
    errors: ['rate<0.05'],
    api_duration: ['p(95)<800'], // API 응답 95%가 800ms 이내
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

// 사용자 시나리오 시뮬레이션
class UserScenario {
  constructor() {
    this.headers = {
      'Content-Type': 'application/json',
    };
  }
  
  // 페이지 방문 플로우
  browseWebsite() {
    // 메인 페이지 방문
    const mainRes = http.get(BASE_URL);
    check(mainRes, {
      'Main page status 200': (r) => r.status === 200,
    });
    sleep(Math.random() * 3 + 1); // 1-4초 대기
    
    // Posts 목록 조회
    const postsRes = http.get(`${BASE_URL}/api/posts?page=1&pageSize=10`);
    check(postsRes, {
      'Posts list loaded': (r) => r.status === 200,
      'Posts has data': (r) => {
        const body = JSON.parse(r.body);
        return body.success && Array.isArray(body.data);
      },
    });
    apiDuration.add(postsRes.timings.duration);
    
    return postsRes;
  }
  
  // 포스트 상세 조회 및 상호작용
  interactWithPost(postId) {
    // 포스트 상세 조회
    const postRes = http.get(`${BASE_URL}/api/posts/${postId}`);
    check(postRes, {
      'Post detail loaded': (r) => r.status === 200,
    });
    apiDuration.add(postRes.timings.duration);
    sleep(Math.random() * 2 + 1);
    
    // 조회수 증가
    http.post(`${BASE_URL}/api/posts/${postId}/view`);
    
    // 30% 확률로 좋아요
    if (Math.random() < 0.3) {
      const likeRes = http.post(`${BASE_URL}/api/posts/${postId}/like`);
      check(likeRes, {
        'Like action succeeded': (r) => r.status === 200,
      });
    }
    
    return postRes;
  }
  
  // 사용자 목록 조회
  browseUsers() {
    const usersRes = http.get(`${BASE_URL}/api/users`);
    check(usersRes, {
      'Users loaded': (r) => r.status === 200,
      'Users has data': (r) => {
        const body = JSON.parse(r.body);
        return body.success && Array.isArray(body.data);
      },
    });
    apiDuration.add(usersRes.timings.duration);
    return usersRes;
  }
  
  // 새 포스트 작성 (10% 확률)
  createPost() {
    if (Math.random() < 0.1) {
      const payload = {
        title: `Load Test Post ${Date.now()}`,
        content: `This is a post created during load testing at ${new Date().toISOString()}`,
        authorId: `user-${Math.floor(Math.random() * 10) + 1}`,
      };
      
      const res = http.post(
        `${BASE_URL}/api/posts`,
        JSON.stringify(payload),
        { headers: this.headers }
      );
      
      check(res, {
        'Post created': (r) => r.status === 201,
      });
      apiDuration.add(res.timings.duration);
    }
  }
}

export default function () {
  const scenario = new UserScenario();
  
  group('User Browse Flow', () => {
    // 웹사이트 브라우징
    const postsRes = scenario.browseWebsite();
    
    if (postsRes.status === 200) {
      try {
        const posts = JSON.parse(postsRes.body).data;
        
        // 랜덤 포스트 선택하여 상세 조회
        if (posts && posts.length > 0) {
          const randomPost = posts[Math.floor(Math.random() * posts.length)];
          scenario.interactWithPost(randomPost.id);
        }
      } catch (e) {
        errorRate.add(1);
      }
    }
    
    sleep(Math.random() * 3 + 2);
  });
  
  group('User Activity', () => {
    // 사용자 목록 조회
    scenario.browseUsers();
    sleep(Math.random() * 2 + 1);
    
    // 새 포스트 작성 시도
    scenario.createPost();
  });
  
  // 세션 간 대기 시간
  sleep(Math.random() * 5 + 3);
}

// 테스트 수명주기 훅
export function setup() {
  // 테스트 시작 전 헬스체크
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    throw new Error('Target system is not healthy');
  }
  
  return { startTime: Date.now() };
}

export function teardown(data) {
  // 테스트 종료 후 정리 작업
  console.log(`Test completed. Duration: ${Date.now() - data.startTime}ms`);
}

export function handleSummary(data) {
  return {
    './load-test-results.html': htmlReport(data),
    './load-test-results.json': JSON.stringify(data, null, 2),
  };
}

function htmlReport(data) {
  const { metrics } = data;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Load Test Results</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .metric { margin: 20px 0; padding: 15px; border-left: 4px solid #007acc; background: #f5f5f5; }
    .pass { border-color: #28a745; }
    .fail { border-color: #dc3545; }
    h1 { color: #333; }
    .summary { background: #e9ecef; padding: 20px; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>Load Test Report</h1>
  <div class="summary">
    <h2>Test Summary</h2>
    <p>Duration: 16 minutes</p>
    <p>Max VUs: 100</p>
    <p>Total Requests: ${metrics.http_reqs.values.count}</p>
  </div>
  
  <div class="metric ${metrics.http_req_failed.values.rate < 0.05 ? 'pass' : 'fail'}">
    <h3>HTTP Success Rate</h3>
    <p>Success: ${((1 - metrics.http_req_failed.values.rate) * 100).toFixed(2)}%</p>
    <p>Failed: ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%</p>
  </div>
  
  <div class="metric">
    <h3>Response Times</h3>
    <p>Average: ${metrics.http_req_duration.values.avg.toFixed(2)}ms</p>
    <p>P95: ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms</p>
    <p>P99: ${metrics.http_req_duration.values['p(99)'].toFixed(2)}ms</p>
  </div>
  
  <div class="metric">
    <h3>API Performance</h3>
    <p>Average: ${metrics.api_duration?.values.avg.toFixed(2)}ms</p>
    <p>P95: ${metrics.api_duration?.values['p(95)'].toFixed(2)}ms</p>
  </div>
  
  <div class="metric">
    <h3>Throughput</h3>
    <p>Requests/sec: ${(metrics.http_reqs.values.rate).toFixed(2)}</p>
    <p>Data Received: ${(metrics.data_received.values.count / 1024 / 1024).toFixed(2)} MB</p>
    <p>Data Sent: ${(metrics.data_sent.values.count / 1024 / 1024).toFixed(2)} MB</p>
  </div>
</body>
</html>
`;
}