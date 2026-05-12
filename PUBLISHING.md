# Publishing & Release Process — attendance-engine

Target registry: **npm** (scoped: `@attendance-engine/*`). Monorepo tooling: **pnpm workspaces + Turborepo + Changesets**. CI/release: **GitHub Actions**.

---

## One-time setup

1. **npm scope** — the `@attendance-engine` scope must exist. Either:
   - publish under your user scope `@arifur/...`, **or**
   - create an npm **organisation** named `attendance-engine` (free for public packages) at npmjs.com → then `npm publish --access public`.
   Decide this before the first publish; renaming later is painful.

2. **Repo layout** (monorepo):
   ```
   attendance-engine/
     package.json            # private:true, workspaces, scripts
     pnpm-workspace.yaml      # packages: ['packages/*']
     turbo.json
     .changeset/config.json
     packages/
       core/                 # @attendance-engine/core   ← ship first
         package.json
         src/  cases/  docs/
       react/                # @attendance-engine/react  ← later
   ```

3. **Each publishable `package.json`**:
   ```json
   {
     "name": "@attendance-engine/core",
     "version": "0.1.0",
     "description": "Pure-function workforce attendance resolver — shifts, overtime, overnight, rosters.",
     "keywords": ["attendance", "timesheet", "shift", "roster", "overtime", "hr", "workforce", "payroll", "time-tracking"],
     "license": "MIT",
     "author": "Md. Arifur Rahman <arifur.rahman210@gmail.com>",
     "repository": { "type": "git", "url": "https://github.com/arifur9993/attendance-engine", "directory": "packages/core" },
     "type": "module",
     "main": "./dist/index.cjs",
     "module": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" }
     },
     "files": ["dist", "README.md", "LICENSE"],
     "sideEffects": false,
     "publishConfig": { "access": "public" },
     "scripts": {
       "build": "tsup src/index.ts --format esm,cjs --dts --clean",
       "test": "vitest run",
       "test:cov": "vitest run --coverage",
       "bench": "vitest bench"
     }
   }
   ```

4. **Changesets** — `pnpm add -Dw @changesets/cli && pnpm changeset init`. In `.changeset/config.json` set `"access": "public"` and `"baseBranch": "main"`.

5. **CI** — `.github/workflows/ci.yml`:
   ```yaml
   name: ci
   on: [push, pull_request]
   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: pnpm }
         - run: pnpm install --frozen-lockfile
         - run: pnpm -r build
         - run: pnpm -r test:cov
         - run: pnpm -r typecheck
   ```

6. **Release workflow** — `.github/workflows/release.yml` (the Changesets action opens/updates a "Version Packages" PR; merging it publishes):
   ```yaml
   name: release
   on:
     push: { branches: [main] }
   concurrency: ${{ github.workflow }}-${{ github.ref }}
   jobs:
     release:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: pnpm, registry-url: 'https://registry.npmjs.org' }
         - run: pnpm install --frozen-lockfile
         - run: pnpm -r build
         - uses: changesets/action@v1
           with:
             publish: pnpm changeset publish
           env:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
             NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
   ```

7. **Secrets** — add `NPM_TOKEN` (npm → Access Tokens → *Automation* token) to the repo's Actions secrets.

---

## Day-to-day release flow (Changesets)

1. Make changes in a feature branch.
2. **Add a changeset**: `pnpm changeset` → pick the affected package(s), pick bump type (patch/minor/major), write a one-line summary. This drops a markdown file in `.changeset/`. Commit it with your PR.
3. Merge the PR to `main`.
4. The **release** workflow opens (or updates) a PR titled **"Version Packages"** — it bumps versions, updates each package's `CHANGELOG.md`, and removes the consumed changeset files.
5. Review that PR. When you merge it, the workflow runs `changeset publish` → packages go live on npm, and matching git tags (`@attendance-engine/core@0.2.0`) are pushed.

No manual `npm publish`. No manual version edits. No manual tagging.

### Bump rules (pre-1.0 caveat)
- While `0.x`: treat **minor** as "may break" and **patch** as "safe". Be explicit in changeset summaries.
- After `1.0.0`:
  - **patch** — bug fix, doc fix, new test cases, perf.
  - **minor** — new policy option, new exported helper, new roster pattern; backward-compatible.
  - **major** — changed `DayResult` shape, renamed/removed exports, changed a default in `AttendancePolicy`.

### Pre-releases / canaries
`pnpm changeset pre enter next` → subsequent publishes are tagged `…@1.0.0-next.0` under the npm `next` dist-tag. `pnpm changeset pre exit` to leave pre-release mode. Useful before a breaking `2.0`.

---

## Adding the second package (`@attendance-engine/react`) later

- Scaffold `packages/react/` with the same `package.json` template; add `"peerDependencies": { "react": ">=18", "@attendance-engine/core": "workspace:*" }`.
- Reference core via `workspace:*` in deps; Changesets rewrites it to the real version range at publish time.
- First publish: include a changeset bumping it from nothing → `0.1.0`.

---

## Release checklist (auto-mostly, but verify)

- [ ] CI green: build + 100% coverage + typecheck on Node 20
- [ ] Every behaviour change has a `cases/*.json` fixture
- [ ] `docs/api.md` reflects any new/changed types or defaults
- [ ] Benchmarks didn't regress (`pnpm bench`)
- [ ] Changeset present and bump type is honest
- [ ] After publish: `npm view @attendance-engine/core version` shows the new version
- [ ] After publish: install it fresh in a scratch project and run the README example
