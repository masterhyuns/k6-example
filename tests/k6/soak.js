import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

/**
 * Soak Test (Endurance Test) - 장시간 부하 테스트
 * 목적: 장시간 운영 시 메모리 누수, 리소스 고갈 등 확인
 * 시나리오: 일정한 부하를 장시간 유지
 * 관찰 포인트: 메모리 증가, 응답시간 저하, 에러율 변화
 */

// 커스텀 메트릭
const memoryTrend = new Trend('memory_usage');
const errorTrend = new Trend('error_trend');
const degradationRate = new Rate('performance_degradation');
const resourceLeaks = new Counter('potential_leaks');
const currentMemory = new Gauge('current_memory');

export const options = {
  stages: [
    { duration: '5m', target: 50 },    // 5분간 50명까지 증가
    { duration: '2h', target: 50 },    // 2시간 동안 50명 유지 (핵심 soak 구간)
    { duration: '5m', target: 0 },     // 5분간 감소
  ],
  
  thresholds: {
    http_req_duration: [
      'p(95)<2000',  // 초기 기준
      'p(95)<3000',  // 장시간 운영 후 허용 기준
    ],
    http_req_failed: ['rate<0.05'],
    performance_degradation: ['rate<0.10'], // 10% 미만 성능 저하
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

// 테스트 상태 추적
const testState = {
  startTime: Date.now(),
  initialMetrics: {
    responseTime: null,
    errorRate: null,
    memoryUsage: null,
  },
  checkpoints: [],
  resourceMonitor: {
    openConnections: new Set(),
    activeRequests: new Map(),
    dataCache: new Map(),
  },
};

// 장시간 테스트 시나리오
const soakScenarios = {
  // 일반 사용 패턴 시뮬레이션
  normalUserBehavior: () => {
    // 세션 시작
    const sessionId = `session-${__VU}-${__ITER}`;
    testState.resourceMonitor.openConnections.add(sessionId);
    
    // 1. 메인 페이지 접속
    const mainRes = http.get(BASE_URL, {
      tags: { scenario: 'main_page' },
    });
    
    check(mainRes, {
      'main page loads': (r) => r.status === 200,
    });
    
    sleep(2 + Math.random() * 3);
    
    // 2. 포스트 목록 조회
    const page = Math.floor(Math.random() * 3) + 1;
    const postsRes = http.get(`${BASE_URL}/api/posts?page=${page}&pageSize=10`, {
      tags: { scenario: 'posts_list' },
    });
    
    const postsLoaded = check(postsRes, {
      'posts loaded': (r) => r.status === 200,
    });
    
    if (!postsLoaded) {
      resourceLeaks.add(1);
    }
    
    sleep(1 + Math.random() * 2);
    
    // 3. 특정 포스트 상세 조회
    if (postsLoaded && postsRes.body) {
      try {
        const posts = JSON.parse(postsRes.body).data;
        if (posts && posts.length > 0) {
          const randomPost = posts[Math.floor(Math.random() * posts.length)];
          
          const detailRes = http.get(`${BASE_URL}/api/posts/${randomPost.id}`, {
            tags: { scenario: 'post_detail' },
          });
          
          check(detailRes, {
            'post detail loads': (r) => r.status === 200,
          });
          
          // 조회수 증가
          http.post(`${BASE_URL}/api/posts/${randomPost.id}/view`);
          
          // 20% 확률로 좋아요
          if (Math.random() < 0.2) {
            http.post(`${BASE_URL}/api/posts/${randomPost.id}/like`);
          }
        }
      } catch (e) {
        console.error('Failed to parse posts:', e);
      }
    }
    
    // 4. 사용자 목록 조회 (30% 확률)
    if (Math.random() < 0.3) {
      const usersRes = http.get(`${BASE_URL}/api/users`, {
        tags: { scenario: 'users_list' },
      });
      
      check(usersRes, {
        'users loaded': (r) => r.status === 200,
      });
    }
    
    // 세션 종료 시뮬레이션
    testState.resourceMonitor.openConnections.delete(sessionId);
    
    sleep(3 + Math.random() * 5);
  },
  
  // 리소스 집약적 작업
  resourceIntensiveTask: () => {
    const taskId = `task-${Date.now()}`;
    testState.resourceMonitor.activeRequests.set(taskId, Date.now());
    
    // 대용량 데이터 요청
    const res = http.get(`${BASE_URL}/api/posts?pageSize=50`, {
      tags: { scenario: 'heavy_load' },
    });
    
    const success = check(res, {
      'heavy request succeeded': (r) => r.status === 200,
    });
    
    if (!success) {
      resourceLeaks.add(1);
    }
    
    // 데이터 캐싱 시뮬레이션 (메모리 사용)
    if (success && res.body) {
      testState.resourceMonitor.dataCache.set(taskId, res.body);
      
      // 오래된 캐시 정리 (메모리 관리)
      if (testState.resourceMonitor.dataCache.size > 100) {
        const oldestKey = testState.resourceMonitor.dataCache.keys().next().value;
        testState.resourceMonitor.dataCache.delete(oldestKey);
      }
    }
    
    testState.resourceMonitor.activeRequests.delete(taskId);
  },
  
  // 시스템 상태 모니터링
  monitorSystemHealth: () => {
    const healthRes = http.get(`${BASE_URL}/api/health`, {
      tags: { scenario: 'health_check' },
    });
    
    if (healthRes.status === 200) {
      try {
        const health = JSON.parse(healthRes.body);
        
        // 메모리 사용량 추적
        if (health.memory && health.memory.heapUsed) {
          const memoryMB = health.memory.heapUsed / 1024 / 1024;
          memoryTrend.add(memoryMB);
          currentMemory.add(memoryMB);
          
          // 초기 메모리 저장
          if (!testState.initialMetrics.memoryUsage) {
            testState.initialMetrics.memoryUsage = memoryMB;
          }
          
          // 메모리 증가율 체크 (메모리 누수 감지)
          const memoryIncrease = memoryMB - testState.initialMetrics.memoryUsage;
          const runTime = (Date.now() - testState.startTime) / 1000 / 60; // 분
          const increasePerMinute = memoryIncrease / runTime;
          
          if (increasePerMinute > 1) { // 분당 1MB 이상 증가
            console.warn(`Potential memory leak: ${increasePerMinute.toFixed(2)}MB/min`);
            resourceLeaks.add(1);
          }
        }
      } catch (e) {
        console.error('Failed to parse health response:', e);
      }
    }
  },
  
  // 성능 저하 추적
  trackPerformanceDegradation: () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/posts`, {
      tags: { scenario: 'performance_check' },
    });
    const responseTime = Date.now() - start;
    
    // 초기 응답시간 저장
    if (!testState.initialMetrics.responseTime) {
      testState.initialMetrics.responseTime = responseTime;
    }
    
    // 성능 저하 계산
    const degradation = (responseTime - testState.initialMetrics.responseTime) / testState.initialMetrics.responseTime;
    degradationRate.add(degradation > 0.2 ? 1 : 0); // 20% 이상 저하 시
    
    // 체크포인트 저장 (매 10분)
    const elapsed = Date.now() - testState.startTime;
    const minutes = Math.floor(elapsed / 60000);
    if (minutes % 10 === 0 && !testState.checkpoints[minutes]) {
      testState.checkpoints[minutes] = {
        time: new Date().toISOString(),
        responseTime,
        memoryUsage: currentMemory.name,
        openConnections: testState.resourceMonitor.openConnections.size,
        errorRate: errorTrend.name,
      };
      console.log(`Checkpoint at ${minutes} minutes:`, testState.checkpoints[minutes]);
    }
  },
};

export default function () {
  const elapsed = Date.now() - testState.startTime;
  const minutes = elapsed / 60000;
  
  // 다양한 시나리오 실행
  soakScenarios.normalUserBehavior();
  
  // 10% 확률로 리소스 집약적 작업
  if (Math.random() < 0.1) {
    soakScenarios.resourceIntensiveTask();
  }
  
  // 매 분마다 시스템 모니터링
  if (__ITER % 10 === 0) {
    soakScenarios.monitorSystemHealth();
    soakScenarios.trackPerformanceDegradation();
  }
  
  // 시간대별 부하 패턴 변경 (실제 사용 패턴 시뮬레이션)
  let sleepTime = 5;
  if (minutes < 30) {
    sleepTime = 3 + Math.random() * 2; // 초반: 활발한 활동
  } else if (minutes < 90) {
    sleepTime = 5 + Math.random() * 5; // 중반: 보통 활동
  } else {
    sleepTime = 7 + Math.random() * 8; // 후반: 느린 활동
  }
  
  sleep(sleepTime);
}

export function setup() {
  testState.startTime = Date.now();
  
  // 초기 시스템 상태 기록
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    throw new Error('System is not healthy before soak test');
  }
  
  console.log('Soak test started. This will run for approximately 2 hours.');
  
  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000 / 60; // 분
  console.log(`Soak test completed after ${duration.toFixed(2)} minutes`);
}

export function handleSummary(data) {
  const { metrics } = data;
  
  // 장시간 테스트 분석
  const testDuration = (Date.now() - testState.startTime) / 1000 / 60; // 분
  const avgMemory = metrics.memory_usage?.values.avg || 0;
  const maxMemory = metrics.memory_usage?.values.max || 0;
  const minMemory = metrics.memory_usage?.values.min || 0;
  const memoryGrowth = maxMemory - minMemory;
  
  const performanceDegradationRate = metrics.performance_degradation?.values.rate || 0;
  const potentialLeaks = metrics.potential_leaks?.values.count || 0;
  
  const report = `
=== SOAK TEST (ENDURANCE) RESULTS ===

Test Duration: ${testDuration.toFixed(2)} minutes

Overall Performance:
-------------------
Total Requests: ${metrics.http_reqs.values.count}
Average RPS: ${metrics.http_reqs.values.rate.toFixed(2)}
Error Rate: ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%

Response Times Over Time:
------------------------
Initial P95: ~${testState.initialMetrics.responseTime || 'N/A'}ms
Final P95: ${metrics.http_req_duration.values['p(95)'].toFixed(0)}ms
Average: ${metrics.http_req_duration.values.avg.toFixed(0)}ms
Max: ${metrics.http_req_duration.values.max.toFixed(0)}ms

Memory Analysis:
---------------
Initial Memory: ${minMemory.toFixed(2)}MB
Peak Memory: ${maxMemory.toFixed(2)}MB
Average Memory: ${avgMemory.toFixed(2)}MB
Memory Growth: ${memoryGrowth.toFixed(2)}MB
Growth Rate: ${(memoryGrowth / testDuration).toFixed(3)}MB/min

Resource Leak Indicators:
------------------------
Potential Leak Events: ${potentialLeaks}
Performance Degradation Rate: ${(performanceDegradationRate * 100).toFixed(2)}%
Open Connections: ${testState.resourceMonitor.openConnections.size}
Active Requests: ${testState.resourceMonitor.activeRequests.size}

Stability Assessment:
--------------------
${assessStability(metrics, memoryGrowth, performanceDegradationRate, testDuration)}

Long-term Operation Recommendations:
-----------------------------------
${generateSoakRecommendations(metrics, memoryGrowth, performanceDegradationRate, potentialLeaks, testDuration)}

Checkpoints Summary:
-------------------
${formatCheckpoints(testState.checkpoints)}
`;
  
  return {
    'stdout': report,
    './soak-test-results.json': JSON.stringify({
      ...data,
      customAnalysis: {
        memoryGrowth,
        performanceDegradationRate,
        potentialLeaks,
        checkpoints: testState.checkpoints,
      }
    }, null, 2),
  };
}

function assessStability(metrics, memoryGrowth, degradationRate, duration) {
  const assessment = [];
  const errorRate = metrics.http_req_failed.values.rate;
  
  // 메모리 안정성
  const memoryGrowthPerHour = (memoryGrowth / duration) * 60;
  if (memoryGrowthPerHour < 10) {
    assessment.push('✅ Memory usage stable (< 10MB/hour growth)');
  } else if (memoryGrowthPerHour < 50) {
    assessment.push('⚠️ Moderate memory growth detected (10-50MB/hour)');
  } else {
    assessment.push('❌ Significant memory growth (> 50MB/hour) - possible leak');
  }
  
  // 성능 안정성
  if (degradationRate < 0.05) {
    assessment.push('✅ Performance remained consistent');
  } else if (degradationRate < 0.15) {
    assessment.push('⚠️ Some performance degradation observed');
  } else {
    assessment.push('❌ Significant performance degradation over time');
  }
  
  // 에러율 안정성
  if (errorRate < 0.01) {
    assessment.push('✅ Very low error rate maintained');
  } else if (errorRate < 0.05) {
    assessment.push('✅ Acceptable error rate');
  } else {
    assessment.push('⚠️ Higher than expected error rate');
  }
  
  // 전체 평가
  if (memoryGrowthPerHour < 10 && degradationRate < 0.05 && errorRate < 0.01) {
    assessment.push('\n🎯 EXCELLENT: System is production-ready for long-term operation');
  } else if (memoryGrowthPerHour < 50 && degradationRate < 0.15 && errorRate < 0.05) {
    assessment.push('\n✅ GOOD: System is stable but needs monitoring');
  } else {
    assessment.push('\n⚠️ ATTENTION NEEDED: System shows signs of instability');
  }
  
  return assessment.join('\n');
}

function generateSoakRecommendations(metrics, memoryGrowth, degradationRate, leaks, duration) {
  const recommendations = [];
  const memoryGrowthPerHour = (memoryGrowth / duration) * 60;
  
  if (memoryGrowthPerHour > 10) {
    recommendations.push('• Investigate memory leaks in application code');
    recommendations.push('• Review database connection pooling');
    recommendations.push('• Check for unreleased resources or event listeners');
    recommendations.push('• Implement periodic garbage collection');
  }
  
  if (degradationRate > 0.10) {
    recommendations.push('• Review database query performance over time');
    recommendations.push('• Check for index fragmentation');
    recommendations.push('• Monitor cache effectiveness');
    recommendations.push('• Consider implementing connection pooling limits');
  }
  
  if (leaks > 10) {
    recommendations.push('• Add resource cleanup in error handlers');
    recommendations.push('• Implement request timeout handling');
    recommendations.push('• Review third-party library usage');
    recommendations.push('• Add monitoring for resource usage patterns');
  }
  
  if (metrics.http_req_duration.values['p(99)'] > 5000) {
    recommendations.push('• Identify and optimize slow endpoints');
    recommendations.push('• Consider implementing request queuing');
    recommendations.push('• Add response caching for frequently accessed data');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('• System shows excellent long-term stability');
    recommendations.push('• Continue monitoring in production');
    recommendations.push('• Consider increasing load for next test iteration');
  }
  
  return recommendations.join('\n');
}

function formatCheckpoints(checkpoints) {
  const formatted = [];
  
  Object.keys(checkpoints).forEach(minute => {
    const cp = checkpoints[minute];
    formatted.push(`${minute}min: Response=${cp.responseTime}ms, Connections=${cp.openConnections}`);
  });
  
  return formatted.join('\n') || 'No checkpoints recorded';
}