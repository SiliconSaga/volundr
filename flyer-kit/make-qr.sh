#!/usr/bin/env bash
# Generates a QR code PNG, offline. Usage:
#   bash make-qr.sh <url> <output.png> [dark] [light] [scale] [border]
# Defaults: dark #000000, light #FFFFFF, scale 12, border 2.
# Requires: python -m pip install --user segno
set -euo pipefail
URL="${1:?usage: make-qr.sh <url> <output.png> [dark] [light] [scale] [border]}"
OUT="${2:?usage: make-qr.sh <url> <output.png> [dark] [light] [scale] [border]}"
DARK="${3:-#000000}"
LIGHT="${4:-#FFFFFF}"
SCALE="${5:-12}"
BORDER="${6:-2}"

# Prefer python3, fall back to python — but verify it actually runs
# (on Windows a "python3" Microsoft Store stub can shadow the real install).
PY=""
for cand in python3 python; do
  if "$cand" --version >/dev/null 2>&1; then PY="$cand"; break; fi
done
if [ -z "$PY" ]; then echo "ERROR: no working python3/python found" >&2; exit 1; fi

# Values travel as argv, never interpolated into Python source — a quote or
# backslash in a URL is data, not code, and numerics are parsed as numerics.
"$PY" - "$URL" "$OUT" "$DARK" "$LIGHT" "$SCALE" "$BORDER" <<'PYEOF'
import sys
import segno
url, out, dark, light, scale, border = sys.argv[1:7]
segno.make(url, error='m').save(out, scale=int(scale), border=int(border), dark=dark, light=light)
PYEOF
echo "wrote $OUT"
