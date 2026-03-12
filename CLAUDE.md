# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

개인 관심 종목(약 50개)의 1분봉 주가 데이터를 수집·저장하고 커스텀 대시보드로 모니터링하는 홈랩 기반 통합 시스템. **초단타 자동매매 봇이 아님.**

데이터 소스: 한국투자증권(KIS) REST API (KOSPI), yfinance + Massive.com (NASDAQ)

---

## 인프라 환경

| 역할 | 스펙 | 용도 |
|------|------|------|
| K3s Worker (×3) | Intel N100 미니PC | 마이크로서비스 Pod 배포, Prefect Worker |
| NAS (192.168.45.147) | AMD R7-5825U, 14TB HDD | TrueNAS, PostgreSQL (`trading_db`), Private Docker Registry |
| Compute | Mac Mini M4, 32GB | 무거운 연산, LLM 추론, 대시보드 UI 서빙 |

네트워크: 1Gbps 스위치 (대용량 전송 시 병목 가능)

---

## 아키텍처

### 데이터 파이프라인

```
KIS REST API (KOSPI micro-batch / backfill)
Massive.com REST API (NASDAQ backfill, 2년치)
yfinance (NASDAQ micro-batch / fallback)
    │
    ▼
Prefect Worker (K3s Pod, linux/amd64)
    │  Upsert / Bulk Insert
    ▼
PostgreSQL — trading_db (NAS 192.168.45.147)
    │
    ▼
대시보드 UI (Mac Mini M4)
```

- **오케스트레이션**: Prefect (Control Plane은 NAS의 Docker 컨테이너, Worker는 K3s Pod)

### CI/CD 파이프라인 (GitOps)

```
GitHub (Public repo)
    ↓ push
GitHub Actions (cloud runner)
    → linux/amd64 이미지 빌드
    → GHCR (ghcr.io) 푸시
    ↓
ArgoCD (K3s 내부)
    → GitHub repo K8s 매니페스트 변경 감지
    → GHCR에서 새 이미지 pull → K3s 자동 배포
```

- **이미지 레지스트리**: GHCR (`ghcr.io/<username>/personal-data-hub`)
- **배포 방식**: ArgoCD GitOps (pull-based, 내부망 보안 유지)

### 핵심 워크플로우

1. **Micro-batch** — 장 운영 시간 Prefect 스케줄러가 1분마다 트리거
   - 종목별 최신 1분봉 단건 동기 조회
   - API Rate Limit 회피를 위해 반복문 사이에 `sleep` 부여
   - PostgreSQL Upsert (중복 방지)

2. **Backfill** — 수동 실행, DB 누락 구간 자동 탐지 후 적재
   - `symbols` 파라미터: 콤마 구분 문자열 (`"AAPL"` 또는 `"AAPL,MSFT"`), 미입력 시 전체
   - UPSERT로 중복 무해하게 처리 (재실행 안전)

   **KOSPI** (`flows/kospi/ingestion.py`)
   - 수집 범위: 최대 365일 (KIS API 제약)
   - gap detection: `get_existing_days(conn, "KRX", start, end)`로 DB 보유 날짜 조회
   - 누락 날짜 = 전체 영업일 - DB 보유 날짜, ±1일 buffer 추가 수집
   - 날짜별 × 종목별 반복 (KIS rate limit: `sleep(0.07)`)

   **NASDAQ** (`flows/nasdaq/ingestion.py`)
   - `MASSIVE_API_KEY` 환경변수 유무에 따라 두 경로로 분기:
     - **Massive.com** (설정 시): 2년 전체 range를 종목별 1회 API 호출로 수집. 페이지네이션 `next_url` 자동 처리. `sleep(13.0)` per call (5 calls/min 무료 플랜)
     - **yfinance fallback** (미설정 시): 최대 7일, KOSPI와 동일한 gap detection 로직
   - Massive는 날짜 루프 없이 종목 루프만 돔 — API 호출 횟수 최소화

### 아키텍처 결정 근거

- **WebSocket 틱 데이터 수집 기각**: 초단타 매매 목적이 아니므로 오버엔지니어링. RDBMS 부하 및 구현 비용 대비 가치 없음.
- **Prefect 채택 (Airflow 대신)**: N100 노드 리소스 한계에서 Airflow는 과중. Prefect Cloud SaaS로 Control Plane 리소스 외부화.
- **REST API 마이크로배치 채택**: K3s 리소스 및 KIS API Rate Limit 내에서 가장 안정적.
- **Massive.com 무료 플랜 채택**: yfinance 7일 한계 극복. 유료($29/월) 불필요 — 무료(5 calls/min)로 2년치 1분봉 수집 가능. `MASSIVE_API_KEY` 미설정 시 yfinance로 graceful fallback.

---

## Commands

<!-- 개발 환경 및 명령어는 구현 진행에 따라 추가 -->

### Docker 이미지 빌드 (크로스 컴파일)
```bash
# Mac → linux/amd64 크로스 빌드 후 Private Registry 푸시
docker buildx build --platform linux/amd64 -t 192.168.45.147:<port>/<image>:<tag> --push .
```

---

## 개발 시 주의사항

- KIS API Rate Limit: 초당 최대 10~20건. 종목 루프마다 `sleep` 필수.
- Massive.com 무료 플랜: 5 calls/min → `sleep(13.0)` per call. 50종목 전체 backfill 약 11분 소요.
- PostgreSQL 접속 대상은 NAS(192.168.45.147)의 `trading_db`.
- Prefect Worker Pod은 K3s 클러스터 내 배포. 로컬에서 직접 실행 시 환경변수 확인 필요.
- `MASSIVE_API_KEY`는 K8s Secret (`personal-data-hub-secret`)에 추가해야 Worker Pod에서 사용 가능.
- 대시보드 UI 서빙은 Mac Mini M4 담당 (연산 집약 작업도 동일).
- `scripts/dashboard.py` 실행 시 `.env` 파일 필요 (`python scripts/dashboard.py` → `scripts/dashboard.html` 생성).
