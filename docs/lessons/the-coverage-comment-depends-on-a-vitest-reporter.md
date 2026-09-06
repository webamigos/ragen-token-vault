---
title: 'The coverage comment on a PR depends on a reporter in vitest.config.ts, not on anything visible in the workflow'
modules: ['ci']
areas: ['ci']
topics: ['vitest', 'coverage', 'github-actions', 'implicit-contracts']
---

# The coverage comment depends on a reporter in `vitest.config.ts`, not on anything visible in the workflow

**Context**: `ae155dd` published the coverage report by uploading `coverage/` to
GitHub Pages from `main`. `fa3232f` replaced that with two cheaper things: a PR
comment (`MishaKav/jest-coverage-comment`) and a `$GITHUB_STEP_SUMMARY` block
printed by an inline `node -e` script.

**Problem**: both of those read `coverage/coverage-summary.json`, and that file
exists only because `vitest.config.ts` lists `json-summary` among its coverage
reporters. Nothing in `ci.yml` says so. Trimming the reporter list to
`["text", "lcov"]` — an entirely reasonable-looking cleanup — leaves the CI
steps reading a file that is not there: the comment action degrades quietly and
the summary step throws inside a `node -e` one-liner whose stack trace mentions
`coverage-summary.json` and nothing about vitest. Both steps also carry
`if: always()`, so a failure there does not turn the job red in the way you would
expect.

**Rule**: when a CI step consumes a file, the config that produces it is part of
the CI contract. Either state the dependency where it can be seen — a comment in
`vitest.config.ts` next to the reporter list — or make the step fail loudly with
a message naming the producer. Deleting a "redundant-looking" reporter, output
directory or artifact path is the same class of change as deleting a CI step.

**Applies to**: `vitest.config.ts` coverage reporters and `reportsDirectory`,
the `Coverage report` and `Coverage summary` steps in `.github/workflows/ci.yml`.
