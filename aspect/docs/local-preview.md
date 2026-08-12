# Local preview after adopting

If your site had no Gemfile before, plain `jekyll serve` was the right command. Adoption adds one, so local preview now goes through Bundler and matches what CI builds:

```bash
bundle install
bundle exec jekyll serve
```

Avoid the `wdm` gem, or pin it above 0.1.1 — `wdm 0.1.1` fails to compile on Ruby 3.3 and later, and it is only a file-watching optimisation the preview works fine without.

Nothing about publishing depends on a working local preview; GitHub builds the site remotely on every push either way.
