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