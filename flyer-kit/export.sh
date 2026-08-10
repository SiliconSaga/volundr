#!/usr/bin/env bash
# Renders a flyer campaign's variants to <dir>/exports/ as print PDFs and
# email/social PNGs, per the campaign's flyers.conf manifest.
#
# Usage: bash export.sh <flyer-campaign-dir>
#   The directory must contain flyers.conf — whitespace-separated columns,
#   '#' comments allowed:
#     # html               widthxheight  scale  pdf|png  outbase
#     index.html           816x1056      2      pdf      my-flyer
#     instagram.html       1080x1350     1      png      my-flyer-instagram
#   pdf = emit print PDF alongside the PNG; png = PNG only.
#
# Requires a Chromium-based browser. Set BROWSER to an executable to override
# discovery (Windows/macOS app paths and PATH lookups are probed by default).
set -euo pipefail
TARGET="${1:?usage: export.sh <flyer-campaign-dir containing flyers.conf>}"
cd "$TARGET"
if [ ! -f flyers.conf ]; then echo "ERROR: no flyers.conf in $(pwd)" >&2; exit 1; fi

BROWSER="${BROWSER:-}"
if [ -z "$BROWSER" ]; then
  for c in "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
           "/c/Program Files/Microsoft/Edge/Application/msedge.exe" \
           "/c/Program Files/Google/Chrome/Application/chrome.exe" \
           "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
           "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
           "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    if [ -x "$c" ]; then BROWSER="$c"; break; fi
  done
fi
if [ -z "$BROWSER" ]; then
  for cmd in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge msedge; do
    if command -v "$cmd" >/dev/null 2>&1; then BROWSER="$(command -v "$cmd")"; break; fi
  done
fi
if [ -z "$BROWSER" ]; then echo "ERROR: no Edge/Chrome found (set BROWSER to your browser executable)" >&2; exit 1; fi

HERE="$(cygpath -m "$(pwd)" 2>/dev/null || pwd)"
mkdir -p exports

while read -r html size scale kind out _extra; do
  case "$html" in ''|'#'*) continue ;; esac
  if [ -z "${out:-}" ]; then echo "ERROR: malformed flyers.conf line: $html $size $scale ${kind:-}" >&2; exit 1; fi
  w="${size%x*}"; h="${size#*x}"
  "$BROWSER" --headless=new --disable-gpu --hide-scrollbars \
    --window-size="$w,$h" --force-device-scale-factor="$scale" \
    --screenshot="$HERE/exports/$out.png" "file:///$HERE/$html"
  if [ "$kind" = "pdf" ]; then
    "$BROWSER" --headless=new --disable-gpu --no-pdf-header-footer \
      --print-to-pdf="$HERE/exports/$out.pdf" "file:///$HERE/$html"
  fi
  echo "exported $out"
done < flyers.conf
echo "done: $(ls exports)"
