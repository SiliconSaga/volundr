# Pages source

The deploy workflow publishes the built site to a `gh-pages` branch. A repository serving Pages from `main` will therefore keep serving whatever is on `main` and quietly ignore everything the workflow produces.

Switch it once, in the repository's own settings:

1. **Settings → Pages** in the repo on GitHub.
2. Under **Source**, choose **Deploy from a branch**.
3. Set the branch to `gh-pages` and the folder to `/ (root)`. **Save**.

Or in one call — note the path has no leading slash, which Windows Git Bash would otherwise rewrite as a filesystem path:

```bash
gh api -X PUT repos/<owner>/<repo>/pages --raw-field 'source[branch]=gh-pages' --raw-field 'source[path]=/'
```

This is a repository *setting*, not a file, which is why no pull request can do it for you and why the `pages-source-is-gh-pages` trial exists. It is also why a freshly adopted site sits at silver until someone acts: the ladder is doing its job.

The first deploy creates the `gh-pages` branch. If you flip the setting before that branch exists, GitHub will accept it and show nothing until the first run finishes.
