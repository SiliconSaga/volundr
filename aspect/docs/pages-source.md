# Pages source

The deploy workflow publishes the built site to a `gh-pages` branch. A repository serving Pages from `main` will therefore keep serving whatever is on `main` and quietly ignore everything the workflow produces.

**Merge the adoption pull request first, and let the deploy finish.** It is what creates the `gh-pages` branch, and GitHub will not let you select a branch that does not exist — the settings dropdown will not list it and the API call fails validation. This ordering is the whole reason the step cannot be folded into adoption.

Then switch it once, in the repository's own settings:

1. **Settings → Pages** in the repo on GitHub.
2. Under **Source**, choose **Deploy from a branch**.
3. Set the branch to `gh-pages` and the folder to `/ (root)`. **Save**.

Or in one call — note the path has no leading slash, which Windows Git Bash would otherwise rewrite as a filesystem path:

```bash
gh api -X PUT repos/<owner>/<repo>/pages --raw-field 'source[branch]=gh-pages' --raw-field 'source[path]=/'
```

This is a repository *setting*, not a file, which is why no pull request can do it for you and why the `pages-source-is-gh-pages` trial exists. It is also why a freshly adopted site sits at silver until someone acts: the ladder is doing its job.
