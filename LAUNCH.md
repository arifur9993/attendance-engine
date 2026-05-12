# Launch Playbook — attendance-engine (first-time open-source maintainer)

This is the start-to-finish checklist for shipping `attendance-engine` properly, written assuming you've never run a public OSS project before. Do the stages in order. Each stage is a stopping point — you can publish after Stage 6 and keep going.

> **Note on this environment:** the assistant here can only edit files on disk — it can't run `git`, `npm`, or `gh` for you. Every command below you run yourself in your terminal. The assistant can write the code, configs, READMEs, and test fixtures.

---

## Stage 0 — Decisions to lock first (15 minutes)

Make these now; changing them later is annoying:

1. **Package name & npm scope.** `@attendance-engine/core` requires creating an npm *organisation* named `attendance-engine` (free, public packages). Alternative: publish under your user scope, e.g. `@arifur/attendance-engine` — simpler, less "official"-looking. **Recommendation: create the org.**
2. **GitHub repo name & owner.** `github.com/<you>/attendance-engine`. Use your real account, not a throwaway — your contribution graph and profile are part of the resume value.
3. **License.** MIT. (It's the default for libraries you want widely adopted. Don't overthink it.)
4. **Monorepo or single package?** Start as a monorepo (`packages/core`) even though there's one package today — `@attendance-engine/react` and others are coming, and converting later is churn. Tooling: **pnpm workspaces + Turborepo + Changesets**.
5. **Your public identity on the project.** Name + email in `package.json` and `LICENSE`. Use an address you're fine being public (`arifur.rahman210@gmail.com` is already on your résumé, so that's consistent).

---

## Stage 1 — Accounts & local setup (30 minutes)

1. **GitHub account** — you have one. Make sure 2FA is on (required to publish to npm via tokens safely anyway).
2. **npm account** — sign up at npmjs.com if you haven't. Turn on 2FA (`Account → Two-Factor Authentication → Authorization and writes`).
3. **Create the npm org** — npmjs.com → your avatar → `Add Organization` → name it `attendance-engine` → free plan. (Skip if you chose user-scope.)
4. **Local tooling** — install Node 20 LTS (use `nvm`/`fnm` so you can match CI), then `corepack enable` and `corepack prepare pnpm@latest --activate`. Install the GitHub CLI (`gh`) — optional but makes repo creation and releases easier.
5. **Git identity** — `git config --global user.name "Md. Arifur Rahman"` and `git config --global user.email "arifur.rahman210@gmail.com"`. Set up SSH keys for GitHub if you haven't.

---

## Stage 2 — Create the repo (15 minutes)

1. On GitHub: **New repository** → `attendance-engine`, public, **don't** initialise with README/license (you'll add tailored ones). Or: `gh repo create attendance-engine --public --clone`.
2. Locally:
   ```bash
   git clone git@github.com:<you>/attendance-engine.git
   cd attendance-engine
   git checkout -b main   # if not already
   ```
3. Add a `.gitignore` for Node (`node_modules`, `dist`, `coverage`, `.turbo`, `*.log`, `.DS_Store`).
4. First commit can be empty scaffolding — that's fine. Don't push yet; build it out first (Stage 3).

---

## Stage 3 — Scaffold the project (the assistant can do all of this)

Ask the assistant to create, on disk, in this repo folder:

```
attendance-engine/
  package.json                 # private:true, "packageManager":"pnpm@x", workspaces, root scripts (build/test/lint)
  pnpm-workspace.yaml           # packages: ['packages/*']
  turbo.json                    # pipeline: build, test, typecheck
  tsconfig.base.json            # strict:true, no implicit any, ES2022, moduleResolution bundler
  .changeset/config.json        # access: public, baseBranch: main
  .editorconfig
  .gitignore
  LICENSE                       # MIT, your name + year
  README.md                     # already written — keep it
  VISION.md                     # already written
  CONTRIBUTING.md               # how to run tests, how to add a cases/ fixture, PR expectations
  CODE_OF_CONDUCT.md            # Contributor Covenant v2.1, your email as contact
  SECURITY.md                   # how to report (it's a pure-function lib, low surface, but still)
  .github/
    workflows/
      ci.yml                    # build + test:cov + typecheck on Node 20
      release.yml               # changesets/action — opens "Version Packages" PR, publishes on merge
    ISSUE_TEMPLATE/
      bug_report.yml            # asks for: input punches, shift config, policy, expected vs actual
      feature_request.yml
      edge_case.yml             # "I have a real-world scenario that should be a test case"
    PULL_REQUEST_TEMPLATE.md
  packages/
    core/
      package.json              # @attendance-engine/core, version 0.1.0, exports map, tsup build, publishConfig.access=public
      tsconfig.json             # extends ../../tsconfig.base.json
      src/
        index.ts                # public exports
        types.ts                # Punch, ShiftConfig, AttendancePolicy, DayResult, RosterPattern, ...
        resolve-day.ts          # the core function
        segments.ts             # punch-pairing → segments
        breaks.ts               # break deduction logic
        overtime.ts             # OT threshold + rounding + mode
        midnight.ts             # shift-anchored vs calendar-day cutover
        flags.ts                # inverted-clock / duplicate / odd-count / out-of-window detection
        roster.ts               # generateRoster patterns
        summarize.ts            # period aggregation
        time.ts                 # ISO-8601 + offset arithmetic helpers (no Date timezone reliance)
      cases/
        runner.test.ts          # loads every cases/*.json, asserts input→expected
        present-simple.json
        late-after-grace.json
        overnight-shift-anchored.json
        overnight-calendar-day.json
        missing-clock-out-shift-end.json
        missing-clock-out-flag-only.json
        inverted-clock.json
        duplicate-punches.json
        multiple-in-out-pairs.json
        unpaid-break-deducted.json
        worked-through-unpaid-break.json
        flexible-shift-window.json
        grace-exact-boundary.json
        half-day-threshold-edge.json
        holiday-work-all-ot.json
        on-leave-but-punched.json
        dst-transition-day.json
      bench/
        resolve-day.bench.ts
      README.md                 # package-level (can be a short pointer to root README)
```

**Build order inside `core` (so you always have something runnable):**
1. `types.ts` + `time.ts` — the vocabulary and the timezone-safe arithmetic.
2. `segments.ts` — turn punches into in/out segments (handle pairing strategies, dedup, inversion).
3. `breaks.ts` + `overtime.ts` + `midnight.ts` — the deductions and attributions.
4. `flags.ts` — wire detection into the above.
5. `resolve-day.ts` — orchestrate everything into `DayResult`.
6. `cases/` — write the fixture matrix *as you go*; each new behaviour gets a JSON case immediately.
7. `roster.ts` + `summarize.ts` — composition helpers on top.
8. `bench/` — once it works, prove it's fast.

Aim for **100% line + branch coverage**, enforced in `ci.yml`. For a pure-function library this is realistic and it's the credibility signal.

---

## Stage 4 — Make it real locally (1–2 weeks of evenings)

```bash
pnpm install
pnpm -r build        # tsup → dist/ (esm + cjs + .d.ts)
pnpm -r test:cov     # vitest + coverage gate
pnpm -r typecheck    # tsc --noEmit, strict
pnpm -r bench        # microbenchmarks
```

Iterate until: build clean, types strict-clean, every `cases/*.json` green, coverage 100%, README example actually runs (copy it into a scratch file and execute it). **Don't publish until the README's own example works verbatim.**

Tip: write the `cases/` fixtures from the VISION.md scenarios first — night-shift nurse, forgotten clock-out, unsynced turnstiles, rotating roster, DST day. If the engine handles those, you have something worth shipping.

---

## Stage 5 — Push & wire CI (1 hour)

1. `git add -A && git commit -m "feat: initial implementation of @attendance-engine/core"`
2. `git push -u origin main`
3. Watch the **CI** workflow run on GitHub. Fix until green.
4. Add the `NPM_TOKEN` secret: npm → `Access Tokens` → `Generate New Token` → **Automation** type → copy → GitHub repo → `Settings → Secrets and variables → Actions → New repository secret` → name `NPM_TOKEN`.
5. Confirm the **release** workflow file is present and references that secret.
6. Add badges to the README (CI status, npm version — npm one goes live after first publish).
7. Set the repo's **About** sidebar: short description, topics (`attendance`, `timesheet`, `shift-scheduling`, `overtime`, `hr`, `typescript`, `payroll`), and once docs/demo exist, a homepage URL.

---

## Stage 6 — First publish (30 minutes)

You're using **Changesets**, so there's no manual `npm publish`:

1. `pnpm changeset` → select `@attendance-engine/core` → choose **minor** (it's `0.1.0` → first real release; while `0.x`, minor = "may still break", which is honest) → write a one-line summary like `Initial release: resolveDay, resolveRange, generateRoster, summarize.` → commit the generated file.
2. `git push` to `main`.
3. The **release** workflow opens a PR titled **"Version Packages"** — it sets the version and writes `CHANGELOG.md`.
4. Review and **merge** that PR. The workflow runs `changeset publish` → `@attendance-engine/core` goes live on npm and a git tag (`@attendance-engine/core@0.1.0`) is pushed.
5. Verify: `npm view @attendance-engine/core version`. Then, in a throwaway folder: `npm init -y && npm i @attendance-engine/core` and run the README example. If it works, you've shipped.
6. Create a **GitHub Release** from the tag with the changelog section as the body (nice for humans + populates the releases feed).

**You are now an open-source maintainer with a published package. Everything below is growth, not gate.**

---

## Stage 7 — Make it discoverable (a few hours, spread out)

A package nobody knows about helps nobody. Announce it where the relevant people are:

- **Your LinkedIn** — a real post, not a link drop. Lead with the *problem* ("Every HR system reimplements 'was this person late' and gets the night-shift case wrong..."), then "so I open-sourced the engine I'd built for it." Link the repo. Add it to your profile's **Featured** section. (This is the direct résumé payoff.)
- **dev.to / Hashnode article** — "The deceptively hard problem of attendance calculation" — walk through 3–4 of the VISION scenarios, show the API, link the repo. Cross-post to your blog if you have one.
- **Reddit** — `r/javascript` (Showoff Saturday thread), `r/typescript`, `r/webdev`, maybe `r/hr` or `r/sysadmin` for the domain angle. Read each sub's self-promo rules first; lead with value, not "please star my repo".
- **Hacker News** — `Show HN: attendance-engine – a pure-function workforce time calculator`. One shot, so do it when the README and docs are solid. Be around to answer comments.
- **X/Twitter, Mastodon, Bluesky** — short thread, same problem-first framing, tag relevant communities (`#typescript`, `#opensource`).
- **Awesome lists** — submit a PR to `awesome-nodejs`, `awesome-typescript`, any `awesome-hr-tech` list. Free, durable discoverability.
- **The README itself is marketing** — the `Show HN`-able version has: a one-line "what", a 60-second runnable example near the top, a "why this exists / the edge cases" section (you have it), a comparison-to-alternatives table, badges, and a clear license. Yours is already most of the way there.
- **Optional but high-leverage**: a tiny docs site (Nextra/Astro Starlight on Vercel/Pages) or even just a Stackblitz/CodeSandbox playground link. People trust a library more when they can poke it without installing.

---

## Stage 8 — Run it like a maintainer (ongoing)

Now the part most first-timers skip — being a *good* steward turns "a repo I made" into "a project people rely on", and that's the difference on a résumé:

- **Respond to issues within a few days**, even if it's just "thanks, I'll look — can you give me the punches/shift/policy that reproduce it?" Your `bug_report.yml` template should already ask for those.
- **Triage with labels** — `bug`, `enhancement`, `edge-case`, `good first issue`, `help wanted`, `docs`. Mark genuinely-easy ones `good first issue` — that's how you get your first outside contributors.
- **Every bug fix gets a `cases/` fixture.** Non-negotiable. The fixture matrix only grows. This is the project's whole promise.
- **PRs**: require CI green + 100% coverage maintained + a changeset. Be kind and concrete in review. Thank people. Add contributors to a `Contributors` section or use the all-contributors bot.
- **Semantic versioning, honestly** (post-1.0): patch = bug fix; minor = new policy option / helper / roster pattern, backward-compatible; major = changed `DayResult` shape, renamed/removed exports, changed a default. Pre-1.0, say in the changeset whether a minor might break.
- **Don't break the schema casually.** People persist `ShiftConfig`/`AttendancePolicy` in their databases. A field rename is a major even if TS still compiles.
- **CHANGELOG is generated by Changesets** — just keep writing clear changeset summaries; they become the release notes.
- **Security**: it's a pure-function lib with no I/O and no deps — surface is tiny — but keep `SECURITY.md` pointing at your email, and enable Dependabot for the devDeps.
- **Know when to say no.** "Can it also track leave balances?" — no, that's a different package. Protecting the scope (see VISION.md non-goals) is part of the job. A small sharp tool beats a bloated one.
- **Cut the PHP port (`arits/attendance-engine`) when there's signal** that people want it — follow the `php-beftn` `PUBLISHING.md` process (Packagist + tag-to-release). Keep the API shape identical so the two stay conceptually one library.

---

## The minimal critical path (if you only do the essentials)

1. Create npm org + GitHub repo, MIT license. *(Stage 0–2)*
2. Have the assistant scaffold the monorepo + `packages/core` skeleton + `cases/` fixtures + CI/release workflows. *(Stage 3)*
3. Implement `core` until build + types + tests + 100% coverage are green and the README example runs. *(Stage 4)*
4. Push, get CI green, add `NPM_TOKEN`. *(Stage 5)*
5. `pnpm changeset` → merge the "Version Packages" PR → published. *(Stage 6)*
6. One good LinkedIn post + one dev.to article + submit to an awesome-list. *(Stage 7, lite)*
7. Watch the issues tab; every fix gets a fixture. *(Stage 8, forever)*

That's a real, properly-launched open-source library — and a genuine line on your profile: *"Author of `attendance-engine`, an open-source workforce time-calculation library."*
