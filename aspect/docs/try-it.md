# Trying it on a throwaway site

Adoption opens a real pull request against a real repository, so the first time you run it you probably want a target you do not mind breaking. This is how to make one and drive the whole loop end to end.

Everything below has been run; the notes about what goes wrong are from doing it rather than imagining it.

## 1. Make a target

Any public Jekyll repo with `_config.yml` at the root works. The quickest is the GDD `gh-pages` component template, which produces exactly that:

```bash
ws component init gh-pages hygiene-testsite
gh repo create <owner>/hygiene-testsite --public \
  --source=components/hygiene-testsite --remote=<owner> --push
```

Then turn Pages on, serving from `main` — the pre-adoption state this aspect exists to change:

```bash
gh api -X POST repos/<owner>/hygiene-testsite/pages \
  --raw-field 'source[branch]=main' --raw-field 'source[path]=/'
```

Two things to know about the owner. Free Pages needs a **public** repo. And if your token belongs to an agent or bot account rather than to you, it cannot create repos under your personal username — put the test repo in an org that account can write to, or run the create command under your own token in a fresh shell.

Leave it here. No Gemfile, no workflows, Pages on `main`: all four trials failing, which is the honest starting point.

## 2. Run the adoption

In Backstage: **Create → Apply the Website hygiene aspect**. Pick the repository and a catalog owner, and leave all three "this repo has no X yet" boxes ticked — for a fresh scaffold none of those files exist.

The form has two fields that both sound like owners, so they are labelled to keep them apart. The **Site repository** picker wants the GitHub org and repo; its owner box is a dropdown restricted to orgs this aspect targets. The **Catalog owner** field is a Backstage group and has nothing to do with GitHub. If your target lives somewhere the dropdown does not offer — a personal account, say — use the agent door instead, which works on any repository and needs no Backstage.

The scaffolder needs a GitHub credential to open the pull request. Signing in as guest is fine; the write goes through the instance's GitHub integration, not through your session. If the run dies at the last step with *"No token available for host: github.com"*, that credential is missing or misnamed — every render step will have gone green first, because reading needs no token and writing does.

You should get a pull request with four files: the `Gemfile`, both caller stubs, and a `catalog-info.yaml` carrying the enrollment annotations.

**Its own CI should pass.** That is worth watching rather than assuming: the pull request adds the preview workflow, so the preview runs against a repository that has no `gh-pages` branch yet. It is meant to create the branch rather than fail on it.

## 3. Merge, then do the one thing a pull request cannot

1. **Merge**, and let the deploy finish. It creates `gh-pages`.
2. **Switch the Pages source** to `gh-pages` — see [Pages source](pages-source.md). GitHub will not accept that branch before it exists, which is why this is not step 1.

Registration is not on that list any more. The adoption run registers the location before the descriptor exists, and the catalog retries until the merge makes it readable — so the entity turns up by itself. Between the run and the merge you will see a read error against that location, which is the retry doing its job rather than a fault.

## 4. Check it worked

The component page should show the aspect enrolled at the module's current release. Open a second pull request against the site — any edit to `index.md` — and it should get a preview comment with a link and a visual diff against `main`.

At that point three of the four trials pass and the site sits at silver, held short by the Pages source until you switch it. Do that too and it is gold.

If the component never appears at all, look at the registered location rather than at the files. That is the failure that looks like nothing happening: the descriptor can be perfectly correct and still invisible, because the catalog was never told the repository exists or is still retrying a location it cannot yet read.

## Cleaning up

Delete the repository. Nothing here writes outside it, and the module keeps no record of who adopted — that lives in the adopter's own `catalog-info.yaml`.
