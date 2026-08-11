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
# exports/ is rebuilt from scratch on every run — the manifest is the source
# of truth, so a removed or renamed variant's old deliverables disappear
# instead of lingering.
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
rm -rf exports
mkdir -p exports

lineno=0
fail() { # message — reports the offending line number and raw source line
  echo "ERROR: flyers.conf line $lineno: $1" >&2
  echo "  $raw" >&2
  exit 1
}

# `|| [ -n "$raw" ]` keeps a final line that lacks a trailing newline.
while IFS= read -r raw || [ -n "$raw" ]; do
  lineno=$((lineno + 1))
  line="${raw%$'\r'}"   # tolerate CRLF manifests from Windows editors
  case "$line" in ''|'#'*) continue ;; esac
  read -r html size scale kind out extra <<EOF_LINE
$line
EOF_LINE
  if [ -z "${out:-}" ]; then fail "expected 5 columns: html widthxheight scale pdf|png outbase"; fi
  if [ -n "${extra:-}" ]; then fail "unexpected extra column(s): $extra"; fi
  # outbase is a filename stem, never a path — a separator or dot-segment
  # could write (and later stage) files outside exports/.
  case "$out" in
    .|..|*/*|*\\*) fail "outbase must be a plain filename, not a path: $out" ;;
  esac
  if [ ! -f "$html" ]; then fail "html file not found: $html"; fi
  w="${size%%x*}"; h="${size##*x}"
  case "$w" in ''|*[!0-9]*) fail "bad widthxheight: $size" ;; esac
  case "$h" in ''|*[!0-9]*) fail "bad widthxheight: $size" ;; esac
  if [ "${w}x${h}" != "$size" ]; then fail "bad widthxheight: $size"; fi
  case "$scale" in ''|*[!0-9]*) fail "scale must be a positive integer: $scale" ;; esac
  case "$kind" in pdf|png) ;; *) fail "kind must be pdf or png: $kind" ;; esac

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
