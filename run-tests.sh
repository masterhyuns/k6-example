#!/bin/bash

# k6 Performance Test Runner Script
# 성능 테스트 실행 및 결과 수집 자동화 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 테스트 설정
BASE_URL=${BASE_URL:-"http://localhost:4000"}
RESULTS_DIR="test-results/$(date +%Y%m%d_%H%M%S)"

# 결과 디렉토리 생성
mkdir -p $RESULTS_DIR

echo -e "${GREEN}=== k6 Performance Test Suite ===${NC}"
echo "Base URL: $BASE_URL"
echo "Results Directory: $RESULTS_DIR"
echo ""

# Next.js 서버 상태 확인
check_server() {
    echo -n "Checking server status... "
    if curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/health | grep -q "200"; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        echo "Please start the Next.js server first: npm run dev"
        exit 1
    fi
}

# 테스트 실행 함수
run_test() {
    local test_name=$1
    local test_file=$2
    
    echo -e "\n${YELLOW}Running $test_name...${NC}"
    
    k6 run \
        -e BASE_URL=$BASE_URL \
        --summary-export=$RESULTS_DIR/${test_name}-summary.json \
        $test_file
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $test_name completed successfully${NC}"
    else
        echo -e "${RED}✗ $test_name failed${NC}"
    fi
}


# 메인 실행
main() {
    # 서버 체크
    check_server
    
    # 테스트 선택
    if [ $# -eq 0 ]; then
        echo "Select test to run:"
        echo "1) Smoke Test (1 min)"
        echo "2) Load Test (16 min)"
        echo "3) Stress Test (25 min)"
        echo "4) Spike Test (10 min)"
        echo "5) Soak Test (2+ hours)"
        echo "6) All Tests (sequential)"
        echo "7) Quick Suite (smoke + load)"
        read -p "Enter choice [1-7]: " choice
    else
        choice=$1
    fi
    
    
    # 테스트 실행
    case $choice in
        1)
            run_test "smoke" "tests/k6/smoke.js"
            ;;
        2)
            run_test "load" "tests/k6/load.js"
            ;;
        3)
            run_test "stress" "tests/k6/stress.js"
            ;;
        4)
            run_test "spike" "tests/k6/spike.js"
            ;;
        5)
            echo -e "${YELLOW}Warning: Soak test runs for 2+ hours${NC}"
            read -p "Continue? (y/n): " confirm
            if [ "$confirm" = "y" ]; then
                run_test "soak" "tests/k6/soak.js"
            fi
            ;;
        6)
            echo -e "${YELLOW}Running all tests sequentially...${NC}"
            run_test "smoke" "tests/k6/smoke.js"
            sleep 10
            run_test "load" "tests/k6/load.js"
            sleep 10
            run_test "stress" "tests/k6/stress.js"
            sleep 10
            run_test "spike" "tests/k6/spike.js"
            ;;
        7)
            echo -e "${YELLOW}Running quick test suite...${NC}"
            run_test "smoke" "tests/k6/smoke.js"
            sleep 5
            run_test "load" "tests/k6/load.js"
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            exit 1
            ;;
    esac
    
    # 결과 요약
    echo -e "\n${GREEN}=== Test Results Summary ===${NC}"
    echo "Results saved to: $RESULTS_DIR"
    
    # JSON 결과 파싱 (jq가 설치되어 있는 경우)
    if command -v jq &> /dev/null; then
        for summary in $RESULTS_DIR/*-summary.json; do
            if [ -f "$summary" ]; then
                test_name=$(basename $summary -summary.json)
                echo -e "\n${YELLOW}$test_name:${NC}"
                
                # 주요 메트릭 추출
                requests=$(jq '.metrics.http_reqs.values.count' $summary)
                errors=$(jq '.metrics.http_req_failed.values.rate' $summary)
                p95=$(jq '.metrics.http_req_duration.values["p(95)"]' $summary)
                
                echo "  Total Requests: $requests"
                echo "  Error Rate: $(echo "scale=2; $errors * 100" | bc)%"
                echo "  P95 Response Time: ${p95}ms"
            fi
        done
    fi
}

# 스크립트 실행
main "$@"