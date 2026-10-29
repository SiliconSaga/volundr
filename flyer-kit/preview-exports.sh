#!/usr/bin/env bash
# Renders a PR's flyer exports into the working tree for a preview or
# visual-diff build, WITHOUT committing them.
#
# Usage (from the caller repo's root, in CI):
#   PR=<number> GH_TOKEN=<token> bash .volundr/flyer-kit/preview-exports.sh
#
# Why: flyer-export.yml commits regenerated exports back to the PR branch with
# the workflow's GITHUB_TOKEN, and the pull_request runs that push creates are
# held as action_required — so the PR's preview was built from the head BEFORE
# regeneration. Pages that embed an export (a news post's flyer image) showed
# a broken or stale image until someone approved the held run. Rendering the
# exports here makes the preview and the diff show exactly what the merge
# will deploy, from the first run, with no extra secret.
#
# Only runs when the PR touches flyers/** (read from the PR's file list via
# the API, so a shallow checkout is fine); otherwise the committed exports are
# already current and this exits quietly.
set -euo pipefail
: "${PR:?PR number required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
HERE="$(cd "$(dirname "$0")" && pwd)"

# Fork PRs are skipped, exactly as flyer-export.yml skips them: rendering runs
# the PR's own HTML in a browser on a runner whose checkout holds a token, and
# flyer HTML can embed any local file. Same-repo PRs come from people who can
# push anyway. A fork PR's preview shows the committed exports instead.
head_repo="$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR}" --jq '.head.repo.full_name')"
if [ "$head_repo" != "$GITHUB_REPOSITORY" ]; then
  echo "PR #${PR} comes from a fork (${head_repo}) — not rendering its flyer HTML; committed exports stay."
  exit 0
fi

# Capture the whole file list first: piping straight into `grep -q` lets grep
# exit on the first match while gh is still paging, and under pipefail that
# broken pipe — or a plain API failure — would read as "no flyer changes" and
# publish stale exports. An API failure fails the step instead.
files="$(gh api --paginate "repos/${GITHUB_REPOSITORY}/pulls/${PR}/files" --jq '.[].filename')"
if ! grep -q '^flyers/' <<<"$files"; then
  echo "PR #${PR} touches no flyers/ files — committed exports are current."
  exit 0
fi

mapfile -t confs < <(find flyers -name flyers.conf 2>/dev/null || true)
if [ "${#confs[@]}" -eq 0 ]; then
  echo "No flyers.conf found — nothing to render."
  exit 0
fi

# Same converter setup as flyer-export.yml: the 24.04 runner ships neither
# ImageMagick nor Pillow, and jpg manifest rows need one.
if ! command -v magick >/dev/null 2>&1 && ! command -v convert >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends imagemagick
fi

for conf in "${confs[@]}"; do
  dir="$(dirname "$conf")"
  echo "== rendering $dir for the preview"
  bash "$HERE/export.sh" "$dir"
done
