# Next.js k6 Performance Test Example

Next.js 애플리케이션을 위한 포괄적인 k6 성능 부하테스트 예제입니다.
DB나 Docker 없이 메모리 목데이터를 사용하여 바로 테스트 가능합니다.

## 🚀 빠른 시작

### 1. 의존성 설치
```bash
# Node.js 패키지 설치
npm install

# k6 설치 (macOS)
brew install k6

# k6 설치 (Windows)
choco install k6

# k6 설치 (Linux)
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### 2. Next.js 애플리케이션 실행 (포트 4000)
```bash
# 개발 서버 실행 (포트 4000)
npm run dev

# 또는 프로덕션 모드 (포트 4000)
npm run build
npm run start
```

### 3. 성능 테스트 실행
```bash
# Smoke Test (1분) - 기본 동작 확인
npm run test:smoke

# Load Test (16분) - 정상 부하 테스트
npm run test:load

# Stress Test (25분) - 한계점 찾기
npm run test:stress

# Spike Test (10분) - 급격한 트래픽 증가
npm run test:spike

# Soak Test (2시간+) - 장시간 안정성
npm run test:soak

# 모든 테스트 순차 실행
npm run test:all
```

## 📝 테스트 시나리오 상세

### Smoke Test
- **목적**: 최소 부하에서 시스템 정상 동작 확인
- **VUs**: 1명
- **Duration**: 1분
- **성공 기준**: 에러율 < 1%, P95 < 500ms

### Load Test
- **목적**: 예상 트래픽에서 성능 확인
- **VUs**: 50-100명 점진적 증가
- **Duration**: 16분
- **성공 기준**: 에러율 < 5%, P95 < 1000ms

### Stress Test
- **목적**: 시스템 한계점 찾기
- **VUs**: 100-600명 점진적 증가
- **Duration**: 25분
- **관찰**: Breaking point, 성능 저하 시점

### Spike Test
- **목적**: 급격한 트래픽 증가 대응력
- **VUs**: 10 → 300 → 10 → 500 → 10
- **Duration**: 10분
- **관찰**: 복구 시간, 데이터 무결성

### Soak Test
- **목적**: 장시간 운영 안정성
- **VUs**: 50명 유지
- **Duration**: 2시간+
- **관찰**: 메모리 누수, 성능 저하

## 🏗️ 프로젝트 구조

```
k6-example/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes (목데이터 포함)
│   │   ├── posts/        # 게시물 API
│   │   ├── users/        # 사용자 API
│   │   └── health/       # 헬스체크 API
│   └── page.tsx          # 메인 페이지
├── tests/
│   └── k6/               # k6 테스트 스크립트
│       ├── smoke.js      # 기본 동작 테스트
│       ├── load.js       # 부하 테스트
│       ├── stress.js     # 스트레스 테스트
│       ├── spike.js      # 스파이크 테스트
│       └── soak.js       # 장시간 테스트
├── types.ts              # TypeScript 타입 정의
└── run-tests.sh         # 테스트 실행 스크립트
```

## 📈 성능 메트릭

### 핵심 지표
- **Response Time**: P50, P95, P99
- **Throughput**: Requests/sec
- **Error Rate**: Failed requests %
- **Concurrency**: Virtual Users
- **Resource Usage**: Memory, CPU

### 커스텀 메트릭
- `api_duration`: API 응답 시간
- `spike_errors`: 스파이크 중 에러
- `memory_usage`: 메모리 사용량
- `data_integrity`: 데이터 무결성
- `recovery_time`: 복구 시간

## 🔧 환경 변수

```bash
# 테스트 대상 URL (기본값: 포트 4000)
export BASE_URL=http://localhost:4000
```

## 💡 성능 최적화 권장사항

### 즉시 적용 가능
1. Response 캐싱 헤더 추가
2. API 응답 압축 (gzip)
3. 데이터베이스 인덱스 최적화

### 단기 개선
1. Redis 캐싱 레이어 구현
2. CDN 적용 (정적 자원)
3. API Rate Limiting

### 장기 아키텍처
1. 마이크로서비스 분리
2. 읽기 전용 복제본
3. 오토스케일링 구성

## 📚 참고 문서
- [k6 Documentation](https://k6.io/docs/)
- [Next.js Performance](https://nextjs.org/docs/advanced-features/measuring-performance)
- [Grafana k6 Dashboard](https://grafana.com/grafana/dashboards/2587)

## 🎯 테스트 체크리스트

- [ ] 개발 환경 테스트 완료
- [ ] 스테이징 환경 테스트
- [ ] 프로덕션 유사 환경 테스트
- [ ] 모니터링 대시보드 구성
- [ ] 성능 기준선(baseline) 설정
- [ ] CI/CD 파이프라인 통합


🎯 SMOKE TEST 결과 분석

✓ Checks: 112/112

- 의미: 테스트 중 수행한 모든 검증이 성공했습니다
- 설명: 112개의 체크 포인트(응답 상태, 응답 시간, 데이터 구조 등) 모두 통과
- 판단: ✅ 완벽 - 시스템이 기대한 대로 동작

✓ Error Rate: 0.00%

- 의미: 에러가 전혀 발생하지 않음
- 설명: 모든 HTTP 요청이 성공적으로 완료됨
- 판단: ✅ 매우 좋음 - 안정적인 시스템

✓ HTTP Request Duration

- avg=32.40ms: 평균 응답 시간이 32밀리초
    - 사용자 체감: 즉각적인 반응
- p(95)=78.76ms: 95%의 요청이 79밀리초 이내 완료
    - 대부분의 사용자가 빠른 응답 경험
- 판단: ✅ 우수 - 일반적으로 200ms 이하면 좋은 성능

✓ HTTP Request Failed: 0.00%

- 의미: 실패한 HTTP 요청이 없음
- 설명: 4xx, 5xx 에러나 타임아웃이 발생하지 않음
- 판단: ✅ 완벽 - 100% 가용성

✓ Virtual Users: 1

- 의미: 1명의 가상 사용자로 테스트
- 설명: Smoke Test는 최소 부하로 기본 동작만 확인
- 목적: 시스템의 기본 기능이 정상 작동하는지 검증

✓ Test Duration: 1m

- 의미: 테스트를 1분간 실행
- 설명: 짧은 시간 동안 핵심 시나리오 반복 테스트

📊 종합 평가

🏆 테스트 결과: EXCELLENT (완벽)

성능 등급: A+
- 응답 속도: ⭐⭐⭐⭐⭐ (32ms 평균)
- 안정성: ⭐⭐⭐⭐⭐ (0% 에러)
- 일관성: ⭐⭐⭐⭐⭐ (P95가 평균의 2.4배로 안정적)

결론: 시스템이 기본 부하에서 완벽하게 작동합니다.
다음 단계: Load Test로 더 높은 부하 테스트 권장

💡 참고 기준

| 응답시간       | 사용자 체감 |
  |------------|--------|
| < 100ms    | 즉각적    |
| 100-300ms  | 빠름     |
| 300-1000ms | 보통     |
| > 1000ms   | 느림     |

현재 32ms는 "즉각적" 수준으로 매우 우수한 성능입니다!