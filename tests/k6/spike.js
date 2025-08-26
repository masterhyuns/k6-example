import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/**
 * Spike Test - 급격한 트래픽 증가 테스트
 * 목적: 갑작스런 트래픽 급증 시 시스템 복원력 확인
 * 시나리오: 평상시 → 급격한 증가 → 평상시 복귀
 * 성공 기준: 스파이크 후 정상 복구, 데이터 무결성 유지
 */

// 커스텀 메트릭
const errorRate = new Rate('errors');
const spikeErrors = new Counter('spike_errors');
const recoveryTime = new Trend('recovery_time');
const dataIntegrity = new Rate('data_integrity');

export const options = {
  stages: [
    { duration: '1m', target: 10 },    // 평상시 트래픽
    { duration: '30s', target: 300 },  // 급격한 증가 (스파이크)
    { duration: '2m', target: 300 },   // 스파이크 유지
    { duration: '30s', target: 10 },   // 급격한 감소
    { duration: '2m', target: 10 },    // 평상시 복귀
    { duration: '30s', target: 500 },  // 더 큰 스파이크
    { duration: '1m', target: 500 },   // 극한 스파이크 유지
    { duration: '30s', target: 10 },   // 평상시 복귀
    { duration: '2m', target: 10 },    // 안정화 확인
  ],
  
  thresholds: {
    http_req_duration: ['p(95)<5000'],   // 스파이크 중에도 5초 이내
    http_req_failed: ['rate<0.30'],      // 30% 미만 실패
    errors: ['rate<0.40'],                // 40% 미만 에러
    data_integrity: ['rate>0.95'],       // 95% 이상 데이터 무결성
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

// 테스트 데이터 저장소
const testData = {
  createdPosts: new Map(),
  verifiedPosts: new Set(),
  startMetrics: null,
  spikeStartTime: null,
  recoveryStartTime: null,
};

// 스파이크 시나리오
const spikeScenarios = {
  // 읽기 스파이크
  readSpike: () => {
    const requests = [];
    const endpoints = [
      '/api/posts',
      '/api/users',
      '/api/health',
    ];
    
    // 동시에 여러 요청 발생
    endpoints.forEach(endpoint => {
      const res = http.get(`${BASE_URL}${endpoint}`, {
        timeout: '15s',
        tags: { scenario: 'read_spike' },
      });
      
      const success = check(res, {
        [`${endpoint} responded`]: (r) => r.status === 200,
      });
      
      if (!success) {
        spikeErrors.add(1);
        errorRate.add(1);
      } else {
        errorRate.add(0);
      }
      
      requests.push(res);
    });
    
    return requests;
  },
  
  // 쓰기 스파이크 (데이터 무결성 체크 포함)
  writeSpike: () => {
    const postId = `spike-test-${Date.now()}-${Math.random()}`;
    const postData = {
      title: `Spike Test Post ${postId}`,
      content: `Content for spike test - ${new Date().toISOString()}`,
      authorId: `user-${Math.floor(Math.random() * 5) + 1}`,
    };
    
    // 포스트 생성
    const createRes = http.post(
      `${BASE_URL}/api/posts`,
      JSON.stringify(postData),
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: '15s',
        tags: { scenario: 'write_spike' },
      }
    );
    
    const created = check(createRes, {
      'post created during spike': (r) => r.status === 201,
    });
    
    if (created) {
      try {
        const responseData = JSON.parse(createRes.body);
        if (responseData.success && responseData.data) {
          testData.createdPosts.set(responseData.data.id, postData);
        }
      } catch (e) {
        console.error('Failed to parse response:', e);
      }
    } else {
      spikeErrors.add(1);
      errorRate.add(1);
    }
    
    return createRes;
  },
  
  // 데이터 무결성 검증
  verifyDataIntegrity: () => {
    if (testData.createdPosts.size === 0) return;
    
    // 랜덤하게 생성된 포스트 검증
    const postIds = Array.from(testData.createdPosts.keys());
    const randomId = postIds[Math.floor(Math.random() * postIds.length)];
    const originalData = testData.createdPosts.get(randomId);
    
    if (!originalData || testData.verifiedPosts.has(randomId)) return;
    
    const res = http.get(`${BASE_URL}/api/posts/${randomId}`, {
      timeout: '10s',
      tags: { scenario: 'integrity_check' },
    });
    
    if (res.status === 200) {
      try {
        const body = JSON.parse(res.body);
        if (body.success && body.data) {
          const isValid = 
            body.data.title === originalData.title &&
            body.data.content === originalData.content;
          
          dataIntegrity.add(isValid ? 1 : 0);
          
          if (isValid) {
            testData.verifiedPosts.add(randomId);
          } else {
            console.error(`Data integrity failed for ${randomId}`);
          }
        }
      } catch (e) {
        dataIntegrity.add(0);
      }
    } else {
      dataIntegrity.add(0);
    }
  },
  
  // 복구 시간 측정
  measureRecovery: () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/health`, {
      timeout: '5s',
      tags: { scenario: 'recovery_check' },
    });
    
    if (res.status === 200 && res.timings.duration < 500) {
      recoveryTime.add(Date.now() - start);
      return true;
    }
    
    return false;
  },
};

export default function () {
  const currentVUs = __ENV.K6_VUS || __VU;
  const currentStage = getCurrentStage();
  
  // 스파이크 감지 및 처리
  if (currentVUs > 100) {
    // 스파이크 중
    if (!testData.spikeStartTime) {
      testData.spikeStartTime = Date.now();
      console.log(`Spike started at ${new Date().toISOString()}`);
    }
    
    // 70% 읽기, 20% 쓰기, 10% 무결성 체크
    const random = Math.random();
    if (random < 0.7) {
      spikeScenarios.readSpike();
    } else if (random < 0.9) {
      spikeScenarios.writeSpike();
    } else {
      spikeScenarios.verifyDataIntegrity();
    }
    
    sleep(Math.random() * 0.5); // 짧은 대기
  } else {
    // 평상시 또는 복구 중
    if (testData.spikeStartTime && !testData.recoveryStartTime) {
      testData.recoveryStartTime = Date.now();
      console.log(`Recovery started at ${new Date().toISOString()}`);
    }
    
    // 복구 확인
    if (testData.recoveryStartTime) {
      const recovered = spikeScenarios.measureRecovery();
      if (recovered && Date.now() - testData.recoveryStartTime > 5000) {
        const recoveryDuration = Date.now() - testData.recoveryStartTime;
        console.log(`System recovered in ${recoveryDuration}ms`);
        testData.recoveryStartTime = null;
        testData.spikeStartTime = null;
      }
    }
    
    // 일반 트래픽 패턴
    const res = http.get(`${BASE_URL}/api/posts`, {
      tags: { scenario: 'normal_traffic' },
    });
    
    check(res, {
      'normal traffic OK': (r) => r.status === 200,
    });
    
    // 데이터 무결성 계속 체크
    if (Math.random() < 0.2) {
      spikeScenarios.verifyDataIntegrity();
    }
    
    sleep(Math.random() * 2 + 1); // 정상 대기
  }
}

// 현재 스테이지 판단
function getCurrentStage() {
  const elapsed = Date.now() - testData.startTime;
  const minutes = elapsed / 60000;
  
  if (minutes < 1) return 'warmup';
  if (minutes < 1.5) return 'spike1_ramp';
  if (minutes < 3.5) return 'spike1_peak';
  if (minutes < 4) return 'spike1_recovery';
  if (minutes < 6) return 'normal1';
  if (minutes < 6.5) return 'spike2_ramp';
  if (minutes < 7.5) return 'spike2_peak';
  if (minutes < 8) return 'spike2_recovery';
  return 'stabilization';
}

export function setup() {
  testData.startTime = Date.now();
  
  // 초기 시스템 상태 확인
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    throw new Error('System is not healthy before test');
  }
  
  return { startTime: Date.now() };
}

export function teardown(data) {
  // 최종 데이터 무결성 확인
  console.log(`Created posts: ${testData.createdPosts.size}`);
  console.log(`Verified posts: ${testData.verifiedPosts.size}`);
}

export function handleSummary(data) {
  const { metrics } = data;
  
  // 스파이크 테스트 분석
  const totalErrors = metrics.spike_errors?.values.count || 0;
  const avgRecoveryTime = metrics.recovery_time?.values.avg || 0;
  const integrityRate = metrics.data_integrity?.values.rate || 1;
  const errorRate = metrics.errors?.values.rate || 0;
  
  const report = `
=== SPIKE TEST RESULTS ===

Test Performance:
----------------
Total Requests: ${metrics.http_reqs.values.count}
Total Errors During Spikes: ${totalErrors}
Overall Error Rate: ${(errorRate * 100).toFixed(2)}%
Data Integrity Rate: ${(integrityRate * 100).toFixed(2)}%

Response Times:
--------------
Average: ${metrics.http_req_duration.values.avg.toFixed(0)}ms
P95: ${metrics.http_req_duration.values['p(95)'].toFixed(0)}ms
P99: ${metrics.http_req_duration.values['p(99)'].toFixed(0)}ms
Max: ${metrics.http_req_duration.values.max.toFixed(0)}ms

Spike Resilience:
----------------
Average Recovery Time: ${avgRecoveryTime.toFixed(0)}ms
Spike Error Count: ${totalErrors}
Created Posts: ${testData.createdPosts.size}
Verified Posts: ${testData.verifiedPosts.size}

System Behavior Analysis:
------------------------
${analyzeSystemBehavior(metrics, totalErrors, integrityRate)}

Recommendations:
---------------
${generateSpikeRecommendations(metrics, totalErrors, avgRecoveryTime, integrityRate)}
`;
  
  return {
    'stdout': report,
    './spike-test-results.json': JSON.stringify(data, null, 2),
  };
}

function analyzeSystemBehavior(metrics, spikeErrors, integrityRate) {
  const analysis = [];
  
  const errorRate = metrics.http_req_failed.values.rate;
  const p95 = metrics.http_req_duration.values['p(95)'];
  
  if (errorRate < 0.1 && spikeErrors < 50) {
    analysis.push('✅ System handled spikes excellently');
    analysis.push('✅ Minimal errors during traffic surges');
  } else if (errorRate < 0.3) {
    analysis.push('⚠️ System showed some degradation during spikes');
    analysis.push('⚠️ Moderate error rate increase observed');
  } else {
    analysis.push('❌ System struggled significantly during spikes');
    analysis.push('❌ High error rate indicates capacity issues');
  }
  
  if (integrityRate > 0.99) {
    analysis.push('✅ Perfect data integrity maintained');
  } else if (integrityRate > 0.95) {
    analysis.push('✅ Good data integrity (>95%)');
  } else {
    analysis.push('⚠️ Data integrity concerns detected');
  }
  
  if (p95 < 2000) {
    analysis.push('✅ Response times remained acceptable');
  } else if (p95 < 5000) {
    analysis.push('⚠️ Response times degraded but recoverable');
  } else {
    analysis.push('❌ Severe response time degradation');
  }
  
  return analysis.join('\n');
}

function generateSpikeRecommendations(metrics, spikeErrors, avgRecovery, integrityRate) {
  const recommendations = [];
  
  if (spikeErrors > 100) {
    recommendations.push('• Implement request queuing to handle bursts');
    recommendations.push('• Add connection pooling and rate limiting');
    recommendations.push('• Configure auto-scaling with aggressive policies');
  }
  
  if (avgRecovery > 5000) {
    recommendations.push('• Optimize recovery mechanisms');
    recommendations.push('• Implement health check based routing');
    recommendations.push('• Add circuit breakers for faster recovery');
  }
  
  if (integrityRate < 0.99) {
    recommendations.push('• Review transaction handling during high load');
    recommendations.push('• Implement database connection retry logic');
    recommendations.push('• Add data validation layers');
  }
  
  if (metrics.http_req_duration.values['p(99)'] > 10000) {
    recommendations.push('• Implement request timeout handling');
    recommendations.push('• Add caching layers to reduce load');
    recommendations.push('• Optimize database queries and indexes');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('• System performs well under spike conditions');
    recommendations.push('• Consider current configuration adequate');
    recommendations.push('• Monitor for edge cases in production');
  }
  
  return recommendations.join('\n');
}