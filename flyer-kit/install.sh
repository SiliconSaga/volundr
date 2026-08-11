#!/usr/bin/env bash
# Seeds a site's flyers/ tree with the shared fonts and licenses so flyer HTML
# served by the site (GitHub Pages previews) can load them locally.
# Usage: bash install.sh <site-flyers-dir>   e.g. bash install.sh ../my-site/flyers
set -euo pipefail
KIT="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:?usage: install.sh <site flyers dir>}"
mkdir -p "$DEST/assets/fonts"
cp "$KIT"/fonts/* "$DEST/assets/fonts/"
echo "fonts + licenses installed to $DEST/assets/fonts"
echo "next steps (see $KIT/README.md): create <campaign>/flyers.conf, flyer HTML/CSS referencing ../assets/, then run export.sh <campaign-dir>"
