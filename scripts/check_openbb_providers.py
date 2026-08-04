#!/usr/bin/env python3
"""Check which OpenBB providers have real API keys vs empty placeholders."""
import os, json

home = os.path.expanduser("~")
settings_path = os.path.join(home, ".openbb_platform", "user_settings.json")

with open(settings_path) as f:
    data = json.load(f)

creds = data.get("credentials", {})

print("=" * 70)
print("Provider API Key Status")
print("=" * 70)

# Known free/no-key providers (don't even need creds)
free_providers = {
    "yfinance": "Completely free, no key needed",
    "sec": "Free (SEC EDGAR), no key needed", 
    "finviz": "Free, no key needed",
    "cboe": "Free, no key needed",
    "federal_reserve": "Free, no key needed",
    "multpl": "Free, no key needed",
    "oecd": "Free, no key needed",
    "imf": "Free, no key needed",
    "tmx": "Free (TSX), no key needed",
    "bls": "Free with BLS key (free to register)",
    "fred": "Free FRED key (free to register)",
}

# API key providers
providers_to_check = {
    "alpha_vantage_api_key": ("Alpha Vantage", "https://www.alphavantage.co/support/#api-key"),
    "benzinga_api_key": ("Benzinga", "https://www.benzinga.com/apis/"),
    "biztoc_api_key": ("BizToc", "https://biztoc.com/"),
    "bls_api_key": ("BLS (Bureau of Labor Stats)", "https://data.bls.gov/registration/"),
    "cftc_app_token": ("CFTC", "https://publicreporting.cftc.gov/signup"),
    "congress_gov_api_key": ("Congress.gov", "https://api.congress.gov/sign-up/"),
    "econdb_api_key": ("EconDB", "https://www.econdb.com/"),
    "eia_api_key": ("EIA (Energy Info Admin)", "https://www.eia.gov/opendata/register.php"),
    "fmp_api_key": ("FMP (Financial Modeling Prep)", "https://financialmodelingprep.com/developer/docs/"),
    "fred_api_key": ("FRED (St. Louis Fed)", "https://fred.stlouisfed.org/docs/api/api_key.html"),
    "intrinio_api_key": ("Intrinio", "https://intrinio.com/"),
    "nasdaq_api_key": ("Nasdaq Data Link", "https://data.nasdaq.com/"),
    "polygon_api_key": ("Polygon.io", "https://polygon.io/"),
    "tiingo_token": ("Tiingo", "https://www.tiingo.com/"),
    "tradier_account_type": ("Tradier", "https://tradier.com/"),
    "tradier_api_key": ("Tradier API", "https://documentation.tradier.com/"),
    "tradingeconomics_api_key": ("Trading Economics", "https://tradingeconomics.com/"),
}

# Check each configured key
for key, value in creds.items():
    name = key
    url = ""
    for k, v in providers_to_check.items():
        if k == key:
            name = v[0]
            url = v[1]
            break
    
    is_real = bool(value) and value != "****" and len(str(value)) > 4
    status = "✅ CONFIGURED" if is_real else "❌ EMPTY / PLACEHOLDER"
    masked = str(value)[:4] + "****" if is_real else str(value)
    url_str = f" → {url}" if (not is_real and url) else ""
    print(f"  {status} | {name:30s} | {masked}{url_str}")

# List free providers
print("\n" + "=" * 70)
print("FREE Providers (no API key required - all available now)")
print("=" * 70)
for name, desc in free_providers.items():
    print(f"  ✅ {name:20s} — {desc}")
