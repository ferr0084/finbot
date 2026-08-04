#!/usr/bin/env python3
"""Check OpenBB configuration and report what's installed."""
import os, json

home = os.path.expanduser("~")
settings_path = os.path.join(home, ".openbb_platform", "user_settings.json")
config_path = os.path.join(home, ".openbb_platform", "config.json")
legacy_path = os.path.join(home, ".openbb_platform", "openbb.json")

print("=" * 60)
print("OpenBB Configuration Audit")
print("=" * 60)

for label, path in [("user_settings.json", settings_path), 
                     ("config.json", config_path),
                     ("openbb.json", legacy_path)]:
    if os.path.exists(path):
        with open(path) as f:
            try:
                data = json.load(f)
                print(f"\n✅ {label} found at: {path}")
                # Print keys at top level (hide actual key values for security)
                if "credentials" in data:
                    creds = data["credentials"]
                    print(f"  Credentials configured: {list(creds.keys())}")
                    for k, v in creds.items():
                        masked = v[:4] + "****" + v[-4:] if len(v) > 8 else "****"
                        print(f"    - {k}: {masked}")
                if "defaults" in data:
                    print(f"  Defaults: {json.dumps(data['defaults'], indent=4)[:200]}")
                # Print any other top-level keys
                for k in data:
                    if k not in ("credentials", "defaults"):
                        print(f"  {k}: {json.dumps(data[k], indent=2)[:200]}")
            except json.JSONDecodeError:
                print(f"\n⚠️  {label} found but is not valid JSON: {path}")
    else:
        print(f"\n❌ {label} not found at: {path}")

# Check installed openbb packages
print("\n" + "=" * 60)
print("Installed OpenBB Packages")
print("=" * 60)
try:
    import pkg_resources
    packages = [d for d in pkg_resources.working_set if d.key.startswith('openbb')]
    if packages:
        for pkg in sorted(packages, key=lambda x: x.key):
            print(f"  ✅ {pkg.key} == {pkg.version}")
    else:
        print("  No openbb packages found via pkg_resources")
except:
    print("  Could not check installed packages (pkg_resources not available)")

# Also try importlib
try:
    import importlib.metadata as ilm
    packages = [d for d in ilm.distributions() if d.metadata['Name'].startswith('openbb')]
    if packages:
        print("\n  (via importlib.metadata):")
        for pkg in sorted(packages, key=lambda x: x.metadata['Name']):
            print(f"  ✅ {pkg.metadata['Name']} == {pkg.version}")
    else:
        print("  No openbb packages found via importlib.metadata")
except:
    pass

print("\n" + "=" * 60)
print("Done.")
