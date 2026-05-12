# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). It records intent-to-release.

When you make a change that should be published:

```bash
pnpm changeset
```

Pick the affected package(s), pick the bump type (`patch` / `minor` / `major`), and write a one-line summary. Commit the generated markdown file with your PR.

On merge to `main`, the release workflow opens (or updates) a **"version packages"** PR that consumes the changesets, bumps versions, and updates each package's `CHANGELOG.md`. Merging that PR publishes to npm.

Bump-type rules (post-1.0): **patch** = bug fix / docs / perf; **minor** = new backward-compatible capability (policy option, helper, rule pack); **major** = changed `DayResult` shape, renamed/removed exports, or a changed default. Pre-1.0: say in the summary whether a `minor` might break callers.

See [`@changesets/cli` docs](https://github.com/changesets/changesets/blob/main/packages/cli/README.md) for more.
