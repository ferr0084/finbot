import json, urllib.request

BASE = "http://127.0.0.1:8001"

def probe(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=10) as r:
            body = r.read().decode()[:500]
            print(f"== {path} -> {r.status} :: {body[:200]}")
    except Exception as e:
        print(f"== {path} -> ERR {e}")

probe("/")
probe("/openapi.json")
probe("/api/v1")
probe("/api/v1/equity/price/historical?provider=yfinance&symbol=SOFI&start_date=2025-08-09&end_date=2026-08-09&interval=1d")