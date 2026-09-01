#!/usr/bin/env bash
# Renders a flyer campaign's variants to <dir>/exports/ as print PDFs and
# email/social PNGs, per the campaign's flyers.conf manifest.
#
# Usage: bash export.sh <flyer-campaign-dir>
#   The directory must contain flyers.conf — whitespace-separated columns,
#   '#' comments allowed:
#     # html               widthxheight  scale  pdf|png|jpg  outbase
#     index.html           816x1056      2      pdf          my-flyer
#     instagram.html       1080x1350     1      jpg          my-flyer-instagram
#   pdf = emit print PDF alongside the PNG; png = PNG only;
#   jpg = JPEG only (the PNG is an intermediate and is removed).
#
#   Use jpg for anything destined for Instagram: its content-publishing API
#   accepts JPEG only and rejects PNG outright.
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

# JPEG converter, probed the same way as the browser and resolved LAZILY — a
# manifest with no `jpg` rows must not require a converter to be installed.
#
# Chromium's --screenshot always writes PNG regardless of the filename, so a
# JPEG deliverable is necessarily render-then-convert. Instagram's content
# publishing API accepts JPEG ONLY, which is the reason this exists.
#
# Order is deliberate: ImageMagick first because it is what CI installs (the
# reusable workflow apt-gets it — ubuntu-latest stopped shipping it with the
# 24.04 image — and CI is the authority that commits regenerated exports),
# then macOS's built-in sips, then Pillow. Set JPEG_CONVERTER to an explicit
# magick/convert/sips binary to override.
JPEG_CONVERTER="${JPEG_CONVERTER:-}"
JPEG_QUALITY="${JPEG_QUALITY:-92}"
resolve_jpeg_converter() {
  [ -n "$JPEG_CONVERTER" ] && return 0
  for cmd in magick convert sips; do
    if command -v "$cmd" >/dev/null 2>&1; then
      JPEG_CONVERTER="$(command -v "$cmd")"; return 0
    fi
  done
  if command -v python3 >/dev/null 2>&1 && python3 -c 'import PIL' 2>/dev/null; then
    JPEG_CONVERTER="python3"; return 0
  fi
  echo "ERROR: flyers.conf requests a jpg variant but no JPEG converter was found." >&2
  echo "  Install one of: ImageMagick (magick/convert), or Python Pillow." >&2
  echo "  macOS has sips built in. Or set JPEG_CONVERTER to an explicit binary." >&2
  exit 1
}

# Convert <png> -> <jpg>, flattening onto white and STRIPPING METADATA.
#
# Stripping is not cosmetic. flyer-export.yml commits regenerated exports back
# to the PR branch, so any per-run bytes — encoder timestamps in particular —
# would make every CI run produce a "change" for an unchanged flyer. This is
# the same class of problem pdf-same.py solves for Chromium's PDF metadata,
# handled here at write time rather than at compare time.
#
# The white flatten is DEFENSIVE, not currently load-bearing: Chromium's
# --screenshot renders on an opaque background, so the intermediate PNG carries
# no alpha (verified: `sips -g hasAlpha` reports no). It costs nothing on an
# opaque image and is what stops transparent pixels landing black if anyone
# ever passes --default-background-color=00000000.
to_jpeg() { # <src.png> <dst.jpg>
  case "$(basename "$JPEG_CONVERTER")" in
    magick|convert)
      "$JPEG_CONVERTER" "$1" -background white -flatten -strip \
        -quality "$JPEG_QUALITY" "$2" ;;
    sips)
      "$JPEG_CONVERTER" -s format jpeg -s formatOptions "$JPEG_QUALITY" \
        "$1" --out "$2" >/dev/null ;;
    python3)
      "$JPEG_CONVERTER" - "$1" "$2" "$JPEG_QUALITY" <<'PY'
import sys
from PIL import Image
src, dst, quality = sys.argv[1], sys.argv[2], int(sys.argv[3])
img = Image.open(src).convert("RGBA")
flat = Image.new("RGB", img.size, (255, 255, 255))
flat.paste(img, mask=img.split()[3])
# No exif= argument: Pillow writes none by default, which is the point.
flat.save(dst, "JPEG", quality=quality, optimize=True)
PY
      ;;
    *) echo "ERROR: unsupported JPEG_CONVERTER: $JPEG_CONVERTER" >&2; exit 1 ;;
  esac
}

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
  case "$kind" in pdf|png|jpg) ;; *) fail "kind must be pdf, png or jpg: $kind" ;; esac

  "$BROWSER" --headless=new --disable-gpu --hide-scrollbars \
    --window-size="$w,$h" --force-device-scale-factor="$scale" \
    --screenshot="$HERE/exports/$out.png" "file:///$HERE/$html"
  if [ "$kind" = "pdf" ]; then
    "$BROWSER" --headless=new --disable-gpu --no-pdf-header-footer \
      --print-to-pdf="$HERE/exports/$out.pdf" "file:///$HERE/$html"
  fi
  if [ "$kind" = "jpg" ]; then
    resolve_jpeg_converter
    to_jpeg "exports/$out.png" "exports/$out.jpg"
    # The PNG was only ever an intermediate here. Leaving it would put two
    # deliverables in exports/ for one manifest row, and exports/ is meant to
    # be exactly what the manifest declares — someone would eventually hand a
    # publisher the .png that Instagram rejects.
    rm -f "exports/$out.png"
  fi
  echo "exported $out"
done < flyers.conf
echo "done: $(ls exports)"
