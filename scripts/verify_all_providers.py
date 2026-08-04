#!/usr/bin/env python3
"""Comprehensive verification of all OpenBB data providers."""
import os, json, sys

# Add the openbb path if needed
home = os.path.expanduser("~")
settings_path = os.path.join(home, ".openbb_platform", "user_settings.json")

print("=" * 70)
print("FULL PROVIDER VERIFICATION")
print("=" * 70)
print(f"Date: 2026-07-30")
print(f"Config: {settings_path}")
print()

# Read current config
with open(settings_path) as f:
    config = json.load(f)

creds = config.get("credentials", {})
configured = {k: bool(v) for k, v in creds.items()}

results = {"passed": 0, "failed": 0, "skipped": 0}

def test(name, category, tool, params, check_key=None):
    """We'll just print the test case - actual execution done via OpenBB MCP."""
    key_status = ""
    if check_key:
        has = configured.get(check_key, False)
        key_status = " [KEY CONFIGURED]" if has else " [NO KEY - SKIPPING]"
    print(f"  🔷 {name:35s} | {tool:40s}{key_status}")

print("\n" + "=" * 70)
print("TEST PLAN")
print("=" * 70)

# Group by data type
print("\n📈 EQUITY FUNDAMENTALS")
print("-" * 60)
test("FMP", "equity", "equity_fundamental_metrics", {"symbol": "AAPL", "provider": "fmp"}, "fmp_api_key")
test("Yahoo Finance", "equity", "equity_fundamental_metrics", {"symbol": "MSFT", "provider": "yfinance"})
test("Alpha Vantage", "equity", "equity_fundamental_historical_eps", {"symbol": "AAPL", "provider": "alpha_vantage"}, "alpha_vantage_api_key")
test("Tiingo", "equity", "equity_fundamental_trailing_dividend_yield", {"symbol": "AAPL", "provider": "tiingo"}, "tiingo_token")
test("SEC EDGAR", "equity", "equity_fundamental_filings", {"symbol": "AAPL", "provider": "sec", "form_type": "10-K", "limit": 1})

print("\n📊 EQUITY PRICES")
print("-" * 60)
test("FMP Quote", "equity", "equity_price_quote", {"symbol": "SPY", "provider": "fmp"}, "fmp_api_key")
test("Yahoo Prices", "equity", "equity_price_historical", {"symbol": "SPY", "provider": "yfinance"})
test("Polygon Prices", "equity", "equity_price_historical", {"symbol": "AAPL", "provider": "polygon"}, "polygon_api_key")
test("Tiingo Prices", "equity", "equity_price_historical", {"symbol": "SPY", "provider": "tiingo"}, "tiingo_token")

print("\n🏢 EQUITY PROFILES & SCREENING")
print("-" * 60)
test("Yahoo Profile", "equity", "equity_profile", {"symbol": "SPY", "provider": "yfinance"})
test("Finviz Screener", "equity", "equity_screener", {"provider": "finviz", "limit": 5})
test("Nasdaq Screener", "equity", "equity_screener", {"provider": "nasdaq", "sector": "technology", "limit": 5}, "nasdaq_api_key")
test("SEC Search", "equity", "equity_search", {"provider": "sec", "query": "AAPL"})
test("CBOE Search", "equity", "equity_search", {"provider": "cboe", "query": "AAPL"})

print("\n💰 ECONOMIC DATA")
print("-" * 60)
test("FRED", "economy", "economy_fred_series", {"provider": "fred", "symbol": "GDP"}, "fred_api_key")
test("BLS", "economy", "economy_survey_bls_series", {"provider": "bls", "symbol": "CES0000000001"}, "bls_api_key")
test("OECD CPI", "economy", "economy_cpi", {"provider": "oecd", "country": "united_states"})
test("IMF Indicators", "economy", "economy_indicators", {"provider": "imf", "symbol": "WEO::NGDP_RPCH", "country": "USA"})

print("\n🏛️ FIXED INCOME")
print("-" * 60)
test("Treasury Rates", "fixedincome", "fixedincome_government_treasury_rates", {"provider": "federal_reserve"})
test("TIPS Yields", "fixedincome", "fixedincome_government_tips_yields", {"provider": "fred"})

print("\n📰 NEWS")
print("-" * 60)
test("FMP News", "news", "news_company", {"provider": "fmp", "symbol": "AAPL", "limit": 2}, "fmp_api_key")

print("\n📊 INDEX DATA")
print("-" * 60)
test("S&P 500 Multiples", "index", "index_sp500_multiples", {"provider": "multpl", "series_name": "pe_month", "limit": 1})

print("\n" + "=" * 70)
print("To run the actual tests, request each tool call through the MCP interface.")
print("=" * 70)
