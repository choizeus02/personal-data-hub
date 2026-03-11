from typing import TypedDict


class AssetMeta(TypedDict):
    symbol: str
    asset_type: str
    exchange: str
    currency: str


KR_STOCKS: list[AssetMeta] = [
    {"symbol": "005930", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 삼성전자
    {"symbol": "000660", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # SK하이닉스
    {"symbol": "035420", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # NAVER
    {"symbol": "035720", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 카카오
    {"symbol": "051910", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # LG화학
    {"symbol": "006400", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 삼성SDI
    {"symbol": "028260", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 삼성물산
    {"symbol": "012330", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 현대모비스
    {"symbol": "005380", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 현대차
    {"symbol": "000270", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 기아
    {"symbol": "068270", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 셀트리온
    {"symbol": "207940", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 삼성바이오로직스
    {"symbol": "096770", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # SK이노베이션
    {"symbol": "003550", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # LG
    {"symbol": "034730", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # SK
    {"symbol": "015760", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 한국전력
    {"symbol": "032830", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 삼성생명
    {"symbol": "018260", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 삼성에스디에스
    {"symbol": "011200", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # HMM
    {"symbol": "066570", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # LG전자
    {"symbol": "055550", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 신한지주
    {"symbol": "105560", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # KB금융
    {"symbol": "086790", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 하나금융지주
    {"symbol": "316140", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 우리금융지주
    {"symbol": "138040", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 메리츠금융지주
    {"symbol": "000810", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 삼성화재
    {"symbol": "010130", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 고려아연
    {"symbol": "009150", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 삼성전기
    {"symbol": "001570", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 금양
    {"symbol": "011070", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # LG이노텍
    {"symbol": "017670", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # SK텔레콤
    {"symbol": "030200", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # KT
    {"symbol": "032640", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # LG유플러스
    {"symbol": "003490", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 대한항공
    {"symbol": "020150", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 롯데에너지머티리얼즈
    {"symbol": "042660", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 한화오션
    {"symbol": "047050", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 포스코인터내셔널
    {"symbol": "005490", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # POSCO홀딩스
    {"symbol": "000100", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 유한양행
    {"symbol": "326030", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # SK바이오팜
    {"symbol": "196170", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 알테오젠
    {"symbol": "091990", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 셀트리온헬스케어
    {"symbol": "263750", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 펄어비스
    {"symbol": "036570", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 엔씨소프트
    {"symbol": "251270", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 넷마블
    {"symbol": "112040", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 위메이드
    {"symbol": "293490", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 카카오게임즈
    {"symbol": "259960", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 크래프톤
    {"symbol": "352820", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # 하이브
    {"symbol": "041510", "asset_type": "STOCK", "exchange": "KRX", "currency": "KRW"},  # SM엔터테인먼트
]

# KIS API용 심볼 리스트 (하위 호환)
TICKERS = [a["symbol"] for a in KR_STOCKS]
