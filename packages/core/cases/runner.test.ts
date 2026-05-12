/**
 * Fixture matrix runner.
 *
 * Every `*.json` in this directory is a `{ name, input, expected }` triple:
 *   - `input`    — a `ResolveDayInput`
 *   - `expected` — the exact `DayResult` it must produce
 *
 * Add a scenario? Drop a JSON file here — no test wiring needed. New behaviour or bug fix
 * MUST come with a fixture (see CONTRIBUTING.md).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveDay } from '../src/index.js';
import type { DayResult, ResolveDayInput } from '../src/index.js';

interface Fixture {
  name: string;
  input: ResolveDayInput;
  expected: DayResult;
}

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith('.json'));

describe('cases/ fixture matrix', () => {
  it('has at least one fixture', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const fixture = JSON.parse(readFileSync(join(here, file), 'utf8')) as Fixture;
    it(`${file} — ${fixture.name}`, () => {
      expect(resolveDay(fixture.input)).toEqual(fixture.expected);
    });
  }
});
