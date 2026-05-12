# @attendance-engine/core

Pure-function workforce attendance resolver — shifts, breaks, overtime, overnight handling, rosters. Zero dependencies, framework-agnostic.

> This is the core package. See the [project README](https://github.com/arifur9993/attendance-engine#readme), [`VISION.md`](https://github.com/arifur9993/attendance-engine/blob/main/VISION.md), and [`USE-CASES.md`](https://github.com/arifur9993/attendance-engine/blob/main/USE-CASES.md) for the full story.

```bash
npm i @attendance-engine/core
```

```ts
import { resolveDay } from '@attendance-engine/core';

const result = resolveDay({
  date: '2026-06-01',
  punches: [
    { at: '2026-06-01T08:57:00+06:00' },
    { at: '2026-06-01T18:04:00+06:00' },
  ],
  shift: { start: '09:00', end: '18:00', graceIn: 10 },
  policy: { pairing: 'first-last' },
});
// → { status: 'present', workedMinutes: 547, lateByMinutes: 0, otMinutes: 4, ... }
// (this exact case lives in cases/present-simple.json)
```

Full API: [`docs/api.md`](./docs/api.md). Time-zone rules: [`docs/timezones.md`](./docs/timezones.md).

MIT © Md. Arifur Rahman
