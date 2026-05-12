# Master Plan — Develop & Launch `attendance-engine`

The single execution plan. Reads alongside [`VISION.md`](VISION.md) (why), [`USE-CASES.md`](USE-CASES.md) (what it grows into), [`LAUNCH.md`](LAUNCH.md) (maintainer mechanics), [`README.md`](README.md) (the pitch). This file is the ordered checklist: what to build, in what sequence, what to test, what to publish, what to announce.

**Working model:** evenings/weekends. Estimates assume ~6–10 focused hours/week. Each Milestone ends at a publishable state — you ship `0.1.0` after M3 and keep shipping minor versions.

**Environment note:** this assistant edits files on disk only — it writes code, configs, docs, test fixtures. You run all `git` / `pnpm` / `npm` / `gh` commands yourself.

---

## Phase 0 — Setup (≈ half a day, do in one sitting)

- [ ] **Lock decisions** (see LAUNCH.md Stage 0): package name `@attendance-engine/core`; create npm **org** `attendance-engine` (free, public); GitHub repo `github.com/<you>/attendance-engine`; license **MIT**; **monorepo** from day one (pnpm + Turborepo + Changesets); public identity = your name + `arifur.rahman210@gmail.com`.
- [ ] **Accounts**: GitHub 2FA on; npm account + 2FA + create the org; install Node 20 LTS via `nvm`/`fnm`; `corepack enable && corepack prepare pnpm@latest --activate`; install `gh` CLI; set `git config --global user.name/email`.
- [ ] **Create repo**: `gh repo create attendance-engine --public --clone` (or via web, public, no auto-README). `git checkout -b main`. Add Node `.gitignore` (`node_modules dist coverage .turbo *.log .DS_Store`).
- [ ] **Ask the assistant to scaffold** (Phase 1 below). Don't push until M1 builds.

---

## Phase 1 — Scaffold the monorepo (assistant writes; you `pnpm install`)

Target tree:

```
attendance-engine/
  package.json                 # private:true, "packageManager":"pnpm@x.y.z", workspaces, root scripts
  pnpm-workspace.yaml          # packages: ['packages/*']
  turbo.json                   # pipeline: build → test → typecheck
  tsconfig.base.json           # strict, ES2022, moduleResolution: bundler, no implicit any
  .changeset/config.json       # access: public, baseBranch: main
  .editorconfig  .gitignore  .nvmrc
  LICENSE                      # MIT, your name + 2026
  README.md  VISION.md  USE-CASES.md  LAUNCH.md  PLAN.md   # (already written)
  CONTRIBUTING.md              # run tests; how to add a cases/ fixture; PR rules; rule-pack contribution rules
  CODE_OF_CONDUCT.md           # Contributor Covenant 2.1, your email
  SECURITY.md                  # report path (low surface — pure fn, no deps — but present)
  .github/
    workflows/ci.yml           # build + test:cov(100%) + typecheck on Node 20
    workflows/release.yml       # changesets/action: "Version Packages" PR → publish on merge
    ISSUE_TEMPLATE/bug_report.yml      # demands: input punches, shift config, policy, expected vs actual
    ISSUE_TEMPLATE/edge_case.yml       # "real-world scenario that should be a permanent test case"
    ISSUE_TEMPLATE/feature_request.yml
    ISSUE_TEMPLATE/rule_pack.yml       # propose a jurisdiction rule pack
    PULL_REQUEST_TEMPLATE.md           # checkbox: added/updated a cases/ fixture? changeset?
  packages/
    core/
      package.json             # @attendance-engine/core 0.1.0; exports map (esm+cjs+.d.ts); tsup build; publishConfig.access=public; files:["dist","README.md","LICENSE"]; sideEffects:false
      tsconfig.json            # extends ../../tsconfig.base.json
      tsup.config.ts
      vitest.config.ts         # coverage thresholds 100/100/100/100
      README.md                # short — points to root README
      src/
        index.ts               # public surface (export only what's stable)
        types.ts               # Punch, ShiftConfig, AttendancePolicy, DayResult, RosterPattern, RuleSet, BreakRuleSet, Flag, ...
        time.ts                # ISO-8601 + explicit-offset arithmetic. NEVER reads host TZ or `Date` local methods.
        segments.ts            # punches → in/out segments; pairing strategies; dedup; inversion handling
        breaks.ts              # break detection + paid/unpaid deduction
        overtime.ts            # OT threshold + rounding + mode (shift-based / fixed / daily-cap)
        midnight.ts            # shift-anchored vs calendar-day duty attribution
        flags.ts               # inverted-clock / duplicate / odd-count / out-of-window / round-number-bias
        resolve-day.ts         # orchestrator → DayResult
        resolve-range.ts       # map over a pay period
        roster.ts              # generateRoster: 2-2-3, 4-on-4-off, DuPont, Pitman, custom
        summarize.ts           # period aggregation: worked, OT, late count, absences, attendance rate
      cases/
        runner.test.ts         # loads every cases/*.json → asserts input→expected
        *.json                 # the fixture matrix (list below)
      bench/resolve-day.bench.ts
```

**Starter `cases/*.json` (write these in Phase 1, expand forever):**
`present-simple` · `late-after-grace` · `early-out` · `overnight-shift-anchored` · `overnight-calendar-day` · `missing-clock-out-shift-end` · `missing-clock-out-flag-only` · `inverted-clock` · `duplicate-punches` · `multiple-in-out-pairs` · `unpaid-break-deducted` · `worked-through-unpaid-break` · `paid-break-not-deducted` · `flexible-shift-window` · `grace-exact-boundary` · `half-day-threshold-edge` · `holiday-work-all-ot` · `on-leave-but-punched` · `dst-spring-forward` · `dst-fall-back` · `punch-before-shift-start`.

Each fixture = `{ "name": "...", "input": { date, punches, shift, policy, ... }, "expected": { ...DayResult } }`.

**`pnpm install` and confirm**: `pnpm -r build` produces empty `dist/`, `pnpm -r typecheck` clean. Stop here; implementation is Phase 2+.

---

## Phase 2 — M1: the calculator core (≈ 2–3 weeks → publish `0.1.0`)

Build order *inside* `core` (always keep it runnable):

1. **`types.ts` + `time.ts`** — vocabulary + timezone-safe arithmetic. Helpers: parse ISO+offset → absolute instant; minutes-between; clamp; "minute of shift" given a shift start. Unit-test `time.ts` to death first — everything rests on it.
2. **`segments.ts`** — turn the punch array into ordered in/out segments. Handle: `pairing: 'first-last' | 'in-out-pairs'`; dedup within N seconds; detect & flag inverted pairs (clamp to 0); odd count → policy hook (don't decide here, surface it).
3. **`breaks.ts`** — given segments + shift `breaks[]`, compute deducted minutes (unpaid breaks the employee was on-clock across; paid breaks never deducted; "worked through unpaid break" case).
4. **`overtime.ts`** — given worked minutes + shift end + `policy`, compute `otMinutes` (apply `otThresholdMinutes`, then `otRoundingUnit`, per `otMode`).
5. **`midnight.ts`** — `midnightCutover: 'shift-anchored' | 'calendar-day'`; for overnight shifts attribute the post-midnight segment to the right duty date; set `spansMidnight`.
6. **`flags.ts`** — wire detections from 2–5 plus: punch outside shift window; all-punches-on-round-minutes bias.
7. **`resolve-day.ts`** — orchestrate → `DayResult { status, firstIn, lastOut, workedMinutes, lateByMinutes, earlyOutMinutes, otMinutes, spansMidnight, breaksDeducted, flags, segments }`. `status` derivation: leave > holiday > weekend > absent > half-day > late > present > incomplete.
8. **`resolve-range.ts` + `summarize.ts`** — `resolveRange(inputs[])` + `summarize(results[])` → `PeriodSummary`.
9. **`roster.ts`** — `generateRoster(pattern, startDate, days)` → `ShiftAssignment[]`. Patterns: `2-2-3`, `4-on-4-off`, `dupont`, `pitman`, `{ custom: [...] }`. Add `roster-*.json` cases.
10. **`index.ts`** — export `resolveDay, resolveRange, summarize, generateRoster` + all public types. Nothing internal.
11. **`bench/`** — microbench `resolveDay`; record baseline µs in the README.

**Quality gates for M1 (all enforced in `ci.yml`):**
- [ ] `pnpm -r build` clean (tsup → esm + cjs + `.d.ts`)
- [ ] `pnpm -r typecheck` clean (strict, no `any`)
- [ ] `pnpm -r test:cov` — 100% lines + branches + functions + statements
- [ ] Every behaviour has a `cases/*.json` fixture
- [ ] README's 60-second example runs verbatim in a scratch project
- [ ] `docs/api.md` lists every `ShiftConfig` / `AttendancePolicy` / `DayResult` field + its default
- [ ] `docs/timezones.md` written (feed ISO+offset or UTC; engine never reads host TZ; DST handled because offsets explicit)

**Publish `0.1.0`** (see LAUNCH.md Stage 5–6):
- [ ] push `main`; CI green
- [ ] add `NPM_TOKEN` (npm Automation token) to repo Actions secrets
- [ ] `pnpm changeset` → `@attendance-engine/core` → **minor** → summary "Initial release: resolveDay, resolveRange, generateRoster, summarize." → commit → push
- [ ] release workflow opens "Version Packages" PR → review → **merge** → `changeset publish` runs → live on npm + tag pushed
- [ ] verify: `npm view @attendance-engine/core version`; fresh-install in a throwaway folder; run README example
- [ ] create GitHub Release from the tag (changelog body)
- [ ] add npm-version + CI badges to README

🎉 **You are now a published OSS maintainer.** Everything below is growth.

---

## Phase 3 — M2: rosters + schedule evaluation + first rule packs (≈ 2 weeks → `0.2.0`)

- [ ] `evaluateSchedule(assignments, postedSchedule, opts)` skeleton → returns `{ clopenings, restViolations, predictabilityPay, advanceNoticeOk }` (see USE-CASES §3). Start with detection only; premiums as boolean/units, not money.
- [ ] **Rule-pack architecture**: `ruleSets.FLSA`, `ruleSets.CA` as declarative data; `defineRuleSet({ extends, overrides })`; document the shape in `docs/rule-packs.md`.
- [ ] `cases/` additions: `schedule-clopening-nyc`, `schedule-rest-violation`, `schedule-shift-shortened-predictability`, `roster-dupont-28day`, `roster-pitman`.
- [ ] changeset (minor) → publish `0.2.0`.

## Phase 4 — M3: overtime classification + regular-rate basis (≈ 2 weeks → `0.3.0`)

- [ ] `classifyHours(periodResults, { ruleSet, workweekStart, consecutiveDayRule })` → `{ regular, dailyOvertime, doubleTime, weeklyOvertime, seventhDayPremium, total }` — no double-counting; CA daily↔weekly interaction correct; `healthcare-8-80` variant. (USE-CASES §4.)
- [ ] `regularRateInputs(periodResults, { differentials, includeBonuses })` → per-workweek hour buckets + weighted-average *basis* (labels + hours only, never amounts; 29 CFR 778.115 shape).
- [ ] Rule packs: add `healthcare-8-80`.
- [ ] `cases/`: `ot-ca-daily-and-weekly`, `ot-ca-double-time-over-12`, `ot-ca-seventh-consecutive-day`, `ot-flsa-40-only`, `ot-healthcare-8-80`, `regular-rate-weighted-average`, `regular-rate-with-night-differential`.
- [ ] `docs/overtime.md` (the buckets, the law, the boundary "we give hours not dollars").
- [ ] changeset (minor) → publish `0.3.0`.

## Phase 5 — M4: meal/rest break compliance (≈ 1.5 weeks → `0.4.0`)

- [ ] `evaluateBreakCompliance(dayResult, { jurisdiction|BreakRuleSet, waivers })` → meal periods (late/short/on-duty/missing + premiumOwed), rest periods (expected vs taken + premiumOwed), `premiumsOwed: {meal, rest}` (≤1 each/day), waiver validation, `presumptionRisk`. (USE-CASES §2.)
- [ ] `cases/`: `meal-on-time-compliant`, `meal-late-after-5th-hour`, `meal-short-22min`, `meal-missing`, `second-meal-required-over-10h`, `meal-waiver-valid-under-6h`, `meal-waiver-invalid`, `rest-missing-one-of-two`.
- [ ] `docs/breaks.md`.
- [ ] changeset (minor) → publish `0.4.0`.

## Phase 6 — M5: Fair Workweek full + more packs (≈ 1.5 weeks → `0.5.0`)

- [ ] Flesh out `evaluateSchedule`: clopening consent handling, predictability-pay triggers (shift added/shortened/cancelled with notice-hours threshold), right-to-rest premiums.
- [ ] Rule packs: `NYC_FairWorkweek`, `Oregon_PredictiveScheduling`.
- [ ] `cases/` for each pack's distinctive rules.
- [ ] changeset (minor) → publish `0.5.0`.

## Phase 7 — M6: rounding compliance + anomaly detection (≈ 1.5 weeks → `0.6.0`)

- [ ] `applyRounding(dayResult, { unit, mode, breakRounding })` + `roundingNeutralityReport(exactResults, roundedResults)` → delta minutes, `favorsEmployer`, per-employee, `conclusion`. (USE-CASES §1.)
- [ ] `detectAnomalies(punchStream, { locations, minTravelMinutes, maxPlausibleShiftHours })` → `simultaneous-presence` / `impossible-travel` / `implausible-shift-length` / `device-clock-drift-suspected` / `round-number-bias`. (USE-CASES §5.)
- [ ] `cases/`: `rounding-neutral`, `rounding-favors-employer`, `anomaly-impossible-travel`, `anomaly-buddy-punch-simultaneous`.
- [ ] changeset (minor) → publish `0.6.0`.

## Phase 8 — M7: headless React package (≈ 2 weeks → `@attendance-engine/react@0.1.0`)

- [ ] `packages/react/` — `package.json` with `peerDependencies: { react: ">=18", "@attendance-engine/core": "workspace:*" }`.
- [ ] Hooks: `useTimesheet(results)`, `useExceptionQueue(flags)`, `useComplianceSummary(...)` — headless, no styling.
- [ ] Storybook + (optional) Chromatic on push.
- [ ] changeset (the package's first — bump nothing → `0.1.0`) → publish.

## Phase 9 — M8: EU pack + rule-pack contribution pipeline (≈ 1 week → `0.7.0`)

- [ ] `ruleSets.EU_WorkingTimeDirective` (11h daily rest, 48h weekly avg over reference period, 20-min break > 6h).
- [ ] `docs/contributing-rule-packs.md` — required `cases/` fixtures per pack, citation requirements, review bar.
- [ ] Mark good first issues for community packs (UK, Australia, Ontario, ...).
- [ ] changeset (minor) → publish `0.7.0`.

## Phase 10 — PHP port (when there's demand signal)

- [ ] `arits/attendance-engine` (separate repo, Packagist). Mirror the API shape exactly. Follow `php-beftn`-style `PUBLISHING.md`: composer `type: library`, submit to Packagist + install Packagist GitHub App, **release = `git tag vX.Y.Z` + push**.
- [ ] Port the `cases/*.json` fixtures verbatim — same fixtures must pass in both languages. That's the parity guarantee.

## Phase 11 — `1.0.0`

- [ ] Freeze the schema/contract (`ShiftConfig`, `AttendancePolicy`, `DayResult`, rule-pack shape).
- [ ] PHP port at parity.
- [ ] Docs site live (Nextra/Astro Starlight on Vercel/Pages) — concepts, API, rule packs, cookbook, vs-others comparison, playground link.
- [ ] A handful of community-contributed jurisdiction packs with tests.
- [ ] changeset (major: `0.x` → `1.0.0`) → publish. GitHub Release with a real "1.0" writeup.

---

## Launch & growth track (runs in parallel from M1 onward)

Do these *after* `0.1.0` is live, then keep going:

- [ ] **LinkedIn post** — problem-first ("every HR system reimplements 'was this person late' and gets the night-shift case wrong..."), then "so I open-sourced the engine." Link repo. Add to profile **Featured**.
- [ ] **dev.to / Hashnode article** — "The deceptively hard problem of attendance calculation" — walk 3–4 VISION scenarios + the API. Cross-post to blog.
- [ ] **Awesome-list PRs** — `awesome-nodejs`, `awesome-typescript`, any `awesome-hr-tech`. Durable discoverability, free.
- [ ] **Reddit** — `r/javascript` (Showoff Saturday), `r/typescript`, `r/webdev`; domain angle in `r/hr` / `r/sysadmin`. Read each sub's self-promo rules; lead with value.
- [ ] **Show HN** — `Show HN: attendance-engine – a pure-function workforce time & compliance calculator`. One shot — do it after docs site + a couple of compliance features (M3/M4) land, so the "compliance engine" pitch is real. Be present for comments.
- [ ] **X/Mastodon/Bluesky thread** — same problem-first framing, `#typescript #opensource`.
- [ ] **Playground** — Stackblitz/CodeSandbox link in README so people poke it without installing.
- [ ] **Re-announce on milestones** — "attendance-engine now does California meal/rest compliance" is its own post when M4 ships. Each compliance pack = a fresh reason to talk about it.

---

## Maintainer discipline (forever — see LAUNCH.md Stage 8)

- Respond to issues in a few days, even just to ask for repro (`bug_report.yml` demands punches/shift/policy).
- Label: `bug` `enhancement` `edge-case` `rule-pack` `good first issue` `help wanted` `docs`.
- **Every bug fix and every rule pack ships with `cases/*.json` fixtures.** Non-negotiable — the fixture matrix only grows. It's the whole promise.
- PRs require: CI green, 100% coverage held, a changeset, fixtures for any behaviour change.
- Semver honesty (post-1.0): patch = fix; minor = new policy option / helper / rule pack, backward-compatible; major = changed `DayResult` shape / renamed-removed exports / changed a default. Pre-1.0, say in the changeset whether a minor might break.
- **Don't break the schema casually** — users persist `ShiftConfig`/`AttendancePolicy`/rule packs in their DBs. Field rename = major even if TS still compiles.
- Guard the scope (VISION.md non-goals): no leave-balance accounting, no money math, no device protocols, no UI beyond the headless React layer. "Can it also do X?" is often "no — that's a different package."
- Security: tiny surface (pure fn, no deps) but keep `SECURITY.md` pointed at your email; Dependabot on devDeps.

---

## Critical path (if you only do the essentials)

1. Phase 0–1: org + repo + scaffold. *(half a day + assistant)*
2. Phase 2 (M1): implement the calculator core to green gates; publish `0.1.0`. *(2–3 weeks)*
3. Launch-track lite: one LinkedIn post + one dev.to article + one awesome-list PR.
4. Phase 4 (M3) + Phase 5 (M4): overtime buckets + CA meal/rest — the features payroll/WFM vendors actually need. *(~4 weeks)*
5. `Show HN` once those land + a basic docs site exists.
6. Watch the issues tab; every fix gets a fixture; ship minor versions as packs land.

That's a real, properly-launched, *consequential* open-source library — and a profile line that means something: *"Author of `attendance-engine` — an open-source workforce time & wage-hour-compliance calculation library."*
