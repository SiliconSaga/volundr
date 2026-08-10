# Völundr

SiliconSaga's CI forge: reusable GitHub Actions workflows (and, eventually, composite actions) shared by the org's static sites, so each site repo carries only a thin caller stub instead of its own copy of the CI logic.

Ported from the battle-tested workflows in [ken-site](https://github.com/SiliconSaga/ken-site); first consumers are the Mountain Top League per-sport sites ([mtl-hockey](https://github.com/SiliconSaga/mtl-hockey), [mtl-site](https://github.com/SiliconSaga/mtl-site)).

## What's here

| Path | What |
|---|---|
| `.github/workflows/jekyll-deploy.yml` | Reusable: builds the caller's Jekyll site, publishes to its `gh-pages` branch, preserves `pr-preview/` |
| `.github/workflows/pr-preview.yml` | Reusable: per-PR preview site + sticky comment + Playwright visual diff vs main + cleanup on close |
| `.github/workflows/flyer-export.yml` | Reusable: regenerates a PR's committed flyer exports and pushes them back to the PR branch |
| `visual-diff/` | The screenshot/diff tooling the pr-preview workflow checks out and runs |
| `flyer-kit/` | Flyer machinery for sites: manifest-driven export script, QR generator, shared fonts, site seeder — see [flyer-kit/README](flyer-kit/README.md) |

## Using it from a site repo

`.github/workflows/deploy.yml`:

```yaml
name: Deploy site

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: gh-pages-write
  cancel-in-progress: false

jobs:
  deploy:
    uses: SiliconSaga/volundr/.github/workflows/jekyll-deploy.yml@main
```

`.github/workflows/pr-preview.yml`:

```yaml
name: PR preview

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: gh-pages-write
  cancel-in-progress: false

jobs:
  preview:
    uses: SiliconSaga/volundr/.github/workflows/pr-preview.yml@main
```

Caller assumptions: a Jekyll site with a checked-in `Gemfile` (the `github-pages` gem provides `jekyll-sitemap`, which the visual diff's CI overlay enables), Pages served from the `gh-pages` branch, and repo URLs derived from `owner.github.io/repo` (the workflows derive both from `GITHUB_REPOSITORY` — no inputs needed).

## Trust model

- Callers live in this org and reference `@main`; this repo's `main` is branch-protected, which is the deliberate trade-off in place of per-caller SHA pinning (pinning would reinstate the copy drift this repo exists to remove). Revisit if an out-of-org caller ever appears.
- No custom secrets anywhere — jobs use only the ephemeral `GITHUB_TOKEN`, scoped by each caller's `permissions:` block.
- The pr-preview diff job checks out this repo with the caller's `GITHUB_TOKEN`, which cannot read a different private repository — **volundr must remain public**, or every caller's visual diff breaks. (Supporting a private volundr would mean plumbing a dedicated token through a `workflow_call` secret; deliberately not built.)
- Preview jobs write only to `gh-pages/pr-preview/<pr>/` and PR comments; production deploys run only from push-to-main on branch-protected callers, so a human merge is always the publish gate.

## Follow-ups

- Migrate ken-site from its in-repo workflow copies to the caller stubs above.
- Jules-review composite action (trigger a Jules-based review from PRs) lands here — tracked separately by the owner.
