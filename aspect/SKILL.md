---
name: apply-website-hygiene-aspect
description: Agent-side adoption for the Website hygiene aspect — add the Gemfile and both volundr caller stubs to a static site, record the enrollment, pre-flight the trials, and hand back the steps a pull request cannot perform. The Create-page door is this module's template.yaml; both read the same standard.
---

# Apply the Website hygiene aspect (agent door)

You are adopting this aspect for a target site repository. This is the other front door — same module, same end state as the scaffolder template, no Backstage required.

1. **Check the target is actually a Jekyll site.** Look for `_config.yml` at the repo root; if there is none, stop and say so, because these workflows build Jekyll and pointing them at anything else produces a confusing CI failure rather than a useful one.
2. **Check the default branch is `main`, and stop if it is not.** Read it with `gh repo view <owner>/<repo> --json defaultBranchRef`. Do not "fix" this by editing the stub's trigger: the reusable preview workflow separately checks out `main` for its visual-diff baseline, so a site on `master` would deploy correctly and diff against nothing. Half-working is worse than refused, and supporting other default branches means changing the reusable workflows, which is not built. Say that plainly rather than adapting around it. The Create-page door cannot make either of these checks, which is one reason to prefer this door for unfamiliar repos.
3. **Read the standard.** `standard.yaml` in this module is the source of truth for what adoption means. Its trials are what you are working toward, and each names the artifact it inspects.
4. **Add the Gemfile** if absent, declaring `gem "github-pages", group: :jekyll_plugins`. If one exists without that gem, add the gem rather than replacing the file — the site may pin other things deliberately. This is the case the Create-page door has to refuse and you do not.
5. **Add both caller stubs**, copying them verbatim from `skeleton-deploy/` and `skeleton-preview/`. Add whichever is missing rather than treating them as a pair — a site can already have one. Do not pin a SHA in place of `@main`: per-caller pinning reinstates the copy drift this shared repo exists to remove, and volundr's `main` is branch-protected in exchange. Say plainly that this is a trust relationship the site is accepting.
6. **Record the enrollment.** In the target's `catalog-info.yaml`, add `website-hygiene` to `siliconsaga.org/aspects` and `website-hygiene@<module-release>` to `siliconsaga.org/aspect-versions`, reading the release from this module's `catalog-info.yaml`. Create the descriptor if there is none. Unlike the Create-page door, you can edit an existing one safely — do that rather than replacing it, and never leave this step out, because a site with green checks and no annotations is not enrolled.
7. **Pre-flight the trials.** Three of the four are checkable from the working tree: is the Gemfile there with the right gem, does each stub's `uses:` resolve to the volundr workflow at `@main`. Check them before opening anything. The fourth reads a repository setting you cannot see from a checkout.
8. **Open the pull request**, and say plainly in the body what still has to happen, in order: merge and let the deploy create `gh-pages`; then switch the Pages source to it (link `docs/pages-source.md`), which GitHub refuses until that branch exists; then register the repo if it is not already in the catalog, since this instance reads an explicit location list and has no discovery provider. A site that merges and stops will keep serving its old content and look like the workflows did nothing.

Tell the human which medal the site should reach once the Pages source is flipped, and which trial is holding it short if one is. Medals are derived rather than assigned: gold means every applicable trial passes, so a site that has done everything except the Pages flip sits at silver by design.

Never weaken a trial to make it pass — if a trial is wrong for this target, that is a conversation with the steward, recorded in this module, not a silent skip.
