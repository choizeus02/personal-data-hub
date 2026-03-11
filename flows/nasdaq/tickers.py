from typing import TypedDict


class AssetMeta(TypedDict):
    symbol: str
    asset_type: str
    exchange: str
    currency: str


# 나스닥 주요 종목 (yfinance 심볼 기준)
US_STOCKS: list[AssetMeta] = [
    {"symbol": "AAPL",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Apple
    {"symbol": "MSFT",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Microsoft
    {"symbol": "NVDA",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # NVIDIA
    {"symbol": "AMZN",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Amazon
    {"symbol": "META",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Meta
    {"symbol": "GOOGL", "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Alphabet A
    {"symbol": "TSLA",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Tesla
    {"symbol": "AVGO",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Broadcom
    {"symbol": "COST",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Costco
    {"symbol": "NFLX",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Netflix
    {"symbol": "AMD",   "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # AMD
    {"symbol": "ADBE",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Adobe
    {"symbol": "CSCO",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Cisco
    {"symbol": "QCOM",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Qualcomm
    {"symbol": "PEP",   "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # PepsiCo
    {"symbol": "TMUS",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # T-Mobile
    {"symbol": "INTU",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Intuit
    {"symbol": "TXN",   "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Texas Instruments
    {"symbol": "AMGN",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Amgen
    {"symbol": "AMAT",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Applied Materials
    {"symbol": "ISRG",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Intuitive Surgical
    {"symbol": "MU",    "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Micron
    {"symbol": "LRCX",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Lam Research
    {"symbol": "KLAC",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # KLA Corp
    {"symbol": "PANW",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Palo Alto Networks
    {"symbol": "GILD",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Gilead Sciences
    {"symbol": "ADI",   "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Analog Devices
    {"symbol": "SNPS",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Synopsys
    {"symbol": "CDNS",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Cadence Design
    {"symbol": "MELI",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # MercadoLibre
    {"symbol": "ADP",   "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # ADP
    {"symbol": "SBUX",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Starbucks
    {"symbol": "ORLY",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # O'Reilly Auto
    {"symbol": "PYPL",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # PayPal
    {"symbol": "MRVL",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Marvell Technology
    {"symbol": "CRWD",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # CrowdStrike
    {"symbol": "DDOG",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Datadog
    {"symbol": "ZS",    "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Zscaler
    {"symbol": "ABNB",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Airbnb
    {"symbol": "TEAM",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Atlassian
    {"symbol": "MRNA",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Moderna
    {"symbol": "IDXX",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # IDEXX Laboratories
    {"symbol": "FAST",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Fastenal
    {"symbol": "VRSK",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Verisk Analytics
    {"symbol": "REGN",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Regeneron
    {"symbol": "VRTX",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Vertex Pharmaceuticals
    {"symbol": "CPRT",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Copart
    {"symbol": "FTNT",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Fortinet
    {"symbol": "ON",    "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # ON Semiconductor
    {"symbol": "ODFL",  "asset_type": "STOCK", "exchange": "NASDAQ", "currency": "USD"},  # Old Dominion Freight
]

# yfinance용 심볼 리스트
TICKERS = [a["symbol"] for a in US_STOCKS]
