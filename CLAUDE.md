# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

개인 관심 종목(약 50개)의 1분봉 주가 데이터를 수집·저장하고 커스텀 대시보드로 모니터링하는 홈랩 기반 통합 시스템. **초단타 자동매매 봇이 아님.**

데이터 소스: 한국투자증권(KIS) REST API

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
KIS REST API
    │  (1분 주기 폴링 또는 Backfill)
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

1. **Backfill ETL** — 타겟 종목 리스트를 읽어 과거 1분봉 일괄 수집 → PostgreSQL Bulk Insert
2. **Micro-batch** — 장 운영 시간(09:00~15:30) Prefect 스케줄러가 1분마다 트리거
   - 종목별 최신 1분봉 단건 동기 조회
   - API Rate Limit(초당 10~20건) 회피를 위해 반복문 사이에 `sleep` 부여
   - PostgreSQL Upsert (중복 방지)

### 아키텍처 결정 근거

- **WebSocket 틱 데이터 수집 기각**: 초단타 매매 목적이 아니므로 오버엔지니어링. RDBMS 부하 및 구현 비용 대비 가치 없음.
- **Prefect 채택 (Airflow 대신)**: N100 노드 리소스 한계에서 Airflow는 과중. Prefect Cloud SaaS로 Control Plane 리소스 외부화.
- **REST API 마이크로배치 채택**: K3s 리소스 및 KIS API Rate Limit 내에서 가장 안정적.

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
- PostgreSQL 접속 대상은 NAS(192.168.45.147)의 `trading_db`.
- Prefect Worker Pod은 K3s 클러스터 내 배포. 로컬에서 직접 실행 시 환경변수 확인 필요.
- 대시보드 UI 서빙은 Mac Mini M4 담당 (연산 집약 작업도 동일).
