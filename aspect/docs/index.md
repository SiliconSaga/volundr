# Website hygiene

This aspect gives a static site the CI hygiene the org's other sites already have: every pull request gets its own preview URL and a screenshot diff against main, and production deploys run through one shared, reviewed pipeline rather than a copy of it per repo.

The work is done by the reusable workflows one level up in this repo. Adopting is mostly a matter of pointing at them — plus two prerequisites the workflows assume, which are the interesting part.

- [Adopting](adopting.md) — what lands in your repo and why.
- [Pages source](pages-source.md) — the one step no pull request can do for you.
- [Local preview](local-preview.md) — what changes once a Gemfile exists.

Both adoption doors read this same module: the Create-page template for anyone with a Backstage instance to hand, and `SKILL.md` for anyone working from a CLI with an agent.
