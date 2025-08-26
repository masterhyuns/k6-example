# 🚀 Quick Start Guide

## 1분만에 시작하기

### Step 1: 패키지 설치
```bash
npm install
```

### Step 2: k6 설치 확인
```bash
k6 version
```
k6가 없다면:
- macOS: `brew install k6`
- Windows: `choco install k6`

### Step 3: Next.js 서버 실행 (포트 4000)
```bash
npm run dev
```

### Step 4: 다른 터미널에서 테스트 실행
```bash
# 1분짜리 빠른 테스트
npm run test:smoke

# 또는 스크립트 사용
./run-tests.sh
```

## 🎯 테스트 결과 보기

테스트가 끝나면 콘솔에 결과가 표시됩니다:

```
✓ Checks........................: 100%
✓ Error Rate....................: 0.00%
✓ HTTP Request Duration.........: avg=45ms p(95)=120ms
✓ HTTP Request Failed...........: 0.00%

✅ TEST PASSED
```

## 💡 Tips

1. **서버가 켜져있는지 확인**: http://localhost:4000 접속 확인
2. **테스트 선택 실행**: `./run-tests.sh` 실행 후 메뉴 선택
3. **결과 파일 확인**: `test-results/` 폴더에 JSON 형식으로 저장됨

## 📊 주요 메트릭 의미

- **P95**: 95%의 요청이 이 시간 내에 완료됨
- **Error Rate**: 실패한 요청의 비율
- **VUs**: Virtual Users (동시 사용자 수)
- **Throughput**: 초당 처리 요청 수

## ⚠️ 문제 해결

### "k6: command not found"
→ k6 설치 필요 (`brew install k6`)

### "Connection refused"
→ Next.js 서버 실행 필요 (`npm run dev`)

### "npm: command not found"
→ Node.js 설치 필요 (https://nodejs.org)

## 🔥 성능 목표 예시

| 메트릭 | Good | Warning | Critical |
|--------|------|---------|----------|
| P95 응답시간 | < 200ms | < 1000ms | > 1000ms |
| 에러율 | < 0.1% | < 1% | > 1% |
| 처리량 | > 100 req/s | > 50 req/s | < 50 req/s |