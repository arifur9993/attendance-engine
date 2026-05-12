<!-- Thanks for contributing. Keep PRs focused — one concern per PR. -->

## What & why

<!-- What does this change, and what problem does it solve? Link any issue. -->

## Checklist

- [ ] `pnpm -r build` clean
- [ ] `pnpm -r typecheck` clean (strict, no `any`)
- [ ] `pnpm -r test:cov` — coverage still 100% (lines / branches / functions / statements)
- [ ] Behaviour change ⇒ a `cases/*.json` fixture added or updated
- [ ] New/changed public API ⇒ `packages/core/docs/api.md` updated
- [ ] A changeset added (`pnpm changeset`) with an honest bump type and a clear summary
- [ ] (Rule pack) every rule has a source citation; fixtures cover passing + violating examples
- [ ] Pre-1.0: if a `minor` bump might break callers, the changeset summary says so

## Notes for the reviewer

<!-- Anything non-obvious: a design tradeoff, a follow-up you're deferring, a domain detail. -->
