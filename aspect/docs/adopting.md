# Adopting

Adoption adds four files to your site repo. Three are the mechanism, and the fourth is what makes the adoption legible to the catalog.

## Gemfile

The workflows build with the `github-pages` gem, which is what supplies `jekyll-sitemap` — the visual diff's CI overlay enables it to enumerate pages. This is not a nicety: the deploy workflow runs `ruby/setup-ruby` with `bundler-cache: true` and then `bundle exec jekyll build`, both of which need a checked-in Gemfile to work at all.

```ruby
source "https://rubygems.org"
gem "github-pages", group: :jekyll_plugins
```

## The two caller stubs

Each is a thin file whose only real content is the `uses:` line. The workflows take no inputs — they derive the repository and its URL from `GITHUB_REPOSITORY` — so there is nothing to configure and nothing to keep in sync.

`.github/workflows/deploy.yml` calls `jekyll-deploy.yml`; `.github/workflows/pr-preview.yml` calls `pr-preview.yml`.

Two things about those stubs are worth understanding before you merge them, because both are choices rather than accidents.

**They follow `@main`, not a pinned SHA.** You are granting `contents: write` to a workflow that tracks a branch in another repository, which is a real trust relationship and not a small one. Pinning per caller would reinstate exactly the copy drift this shared repo exists to remove, so the trade is made the other way: volundr's `main` is branch-protected, and a human merge there is the gate. If your site cannot accept that, do not adopt — the [trust model](https://github.com/SiliconSaga/volundr#trust-model) is the place to argue with it, not your stub.

**The deploy stub triggers on `main`.** GitHub Actions does not allow expressions in an `on:` trigger, so the branch is named literally and cannot be derived. A repository whose default branch is something else must edit that line.

## catalog-info.yaml

Two annotations record the adoption:

```yaml
siliconsaga.org/aspects: website-hygiene
siliconsaga.org/aspect-versions: website-hygiene@1.0
```

The first enrolls the component; the second records which release of this module it adopted. When this module gains a trial and its release bumps, a component still recording the older value reads as *behind* — that is the drift signal, and it is why the version is worth recording even though nothing enforces it yet.

If your repo has no `catalog-info.yaml`, adoption creates one. If it already has one, add the two annotations to it by hand — the Create-page door creates files and cannot merge them, so it will not touch an existing descriptor.

## Then two steps adoption cannot do for you

**Switch the Pages source.** See [Pages source](pages-source.md). Until it is done the site still builds and previews, but the deploy has nowhere to publish.

**Register the repository with the catalog, once.** The descriptor being merged does not by itself put your site in Backstage: the instance reads an explicit list of locations and has no discovery provider watching the org. Use the **Register an existing component** flow on the Create page, pointing at your `catalog-info.yaml`. Skip it and everything is correct while nothing appears — the most confusing failure of the three.
