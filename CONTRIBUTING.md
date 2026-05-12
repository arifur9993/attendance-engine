# Contributing to attendance-engine

Thanks for helping. This project lives or dies by the **`cases/` fixture matrix** — almost every contribution either adds a case or is gated by one.

## Setup

```bash
git clone https://github.com/arifur9993/attendance-engine.git
cd attendance-engine
corepack enable
pnpm install
pnpm -r build
pnpm -r test:cov     # must stay at 100% lines + branches + functions + statements
pnpm -r typecheck
```

Node 20 LTS (`.nvmrc`). Use `nvm use` / `fnm use`.

## The golden rule: behaviour change ⇒ fixture

If your PR changes what `resolveDay` (or any exported function) returns for *any* input — even a bug fix — it **must** include a matching fixture in `packages/core/cases/`:

```jsonc
// packages/core/cases/your-scenario-name.json
{
  "name": "human-readable description of the scenario",
  "input":    { /* ResolveDayInput (or whatever the function takes) */ },
  "expected": { /* the exact expected output */ }
}
```

`cases/runner.test.ts` picks it up automatically — no test wiring needed. If you found a real-world edge case in production, open an issue with the **Edge case** template *or* go straight to a PR adding the fixture; the latter is the most valuable kind of contribution here.

## Pull request checklist

- [ ] `pnpm -r build` clean
- [ ] `pnpm -r typecheck` clean (strict, no `any`)
- [ ] `pnpm -r test:cov` — coverage still 100% on all four metrics
- [ ] Behaviour change ⇒ a `cases/*.json` fixture added/updated
- [ ] New/changed public API ⇒ `packages/core/docs/api.md` updated
- [ ] A **changeset** added: `pnpm changeset` → pick package(s) → pick bump → one-line summary → commit it
- [ ] Pre-1.0: if a `minor` bump might break callers, say so explicitly in the changeset summary

## Contributing a jurisdiction rule pack

Rule packs (FLSA, CA, NYC Fair Workweek, EU Working Time Directive, …) are declarative data, not code. To add one:

1. Add the pack under `packages/core/src/rule-packs/` following the existing shape.
2. Add `cases/` fixtures covering each rule the pack introduces — at minimum one passing and one violating example per distinct rule.
3. Cite the authority in a comment (statute / regulation / agency fact sheet URL). Unsourced rules won't be merged.
4. Add a changeset (`minor`).

See `packages/core/docs/rule-packs.md` (once it exists) for the schema and `packages/core/docs/contributing-rule-packs.md` for the review bar.

## Scope

This is a **calculator**, not a platform. It deals in time — minutes, hours, classifications, violations, flags. It will not gain: leave-balance accounting, money/payroll pricing, biometric device protocols, or UI beyond the headless `@attendance-engine/react` layer. See `VISION.md` → Non-goals. PRs that broaden the scope will be politely declined; PRs that add tested edge cases or jurisdiction packs are exactly what we want.

## Code style

- TypeScript strict. No `any`. No `// @ts-ignore` without a comment explaining why.
- Pure functions. No I/O, no clock reads (`Date.now()`), no environment reads in `src/`. Inputs in, outputs out.
- Small modules, single responsibility. New module ⇒ wire it through `src/index.ts` only if it's part of the public surface.
- Run formatting/linting before pushing (`pnpm -r lint`).

## Reporting bugs & security

- Bugs: use the **Bug report** issue template — it asks for the punches, shift config, policy, and expected-vs-actual. A bug without a reproducible input is hard to act on.
- Security: see `SECURITY.md`.

## License

By contributing you agree your contributions are licensed under the MIT License (`LICENSE`).
