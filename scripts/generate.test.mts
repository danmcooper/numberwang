import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import bandsData from '../config/difficulty.json' with { type: 'json' };
import { validatePuzzle } from '../shared/puzzle.ts';
import { loadBands } from '../shared/solver/difficulty.ts';
import { auditAll } from './audit.mts';
import {
  LOOKAHEAD_DAYS,
  SIZE,
  TIMEZONE_SLACK_DAYS,
  defaultDates,
  runGenerate,
  seedFor,
  unionCriminals,
  upcomingDates,
} from './generate.mts';

/**
 * Generating a 4x5 puzzle is tens of seconds of SAT solving, so this file
 * builds one date and hangs everything that needs a real puzzle off it.
 */
const DATE = '2026-01-01';
const FILE = `${DATE}.json`;

describe('seedFor', () => {
  it('seeds from the date string alone', () => {
    expect(seedFor(DATE)).toBe(seedFor(DATE));
    expect(seedFor(DATE)).not.toBe(seedFor('2026-01-02'));
  });

  it('stays inside the 32-bit range makeRng expects', () => {
    for (const d of upcomingDates(new Date('2026-01-01T00:00:00Z'), 400)) {
      expect(Number.isInteger(seedFor(d))).toBe(true);
      expect(seedFor(d)).toBeGreaterThanOrEqual(0);
      expect(seedFor(d)).toBeLessThan(2 ** 32);
    }
  });
});

describe('upcomingDates', () => {
  it('runs a week forward from today', () => {
    expect(upcomingDates(new Date('2026-09-04T00:00:00Z'), LOOKAHEAD_DAYS)).toEqual([
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
  });

  it('takes an offset, so a window can start before today', () => {
    expect(upcomingDates(new Date('2026-09-04T00:00:00Z'), 2, -1)).toEqual([
      '2026-09-03',
      '2026-09-04',
    ]);
  });

  it('crosses month and year boundaries', () => {
    expect(upcomingDates(new Date('2026-12-30T00:00:00Z'), 4)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('is a property of the date, not of the machine clock', () => {
    // Late in the day in a timezone ahead of UTC, a local-time reading would
    // hand out tomorrow's date and leave today's puzzle unbuilt.
    expect(upcomingDates(new Date('2026-09-04T23:30:00Z'), 1)).toEqual(['2026-09-04']);
    expect(upcomingDates(new Date('2026-09-04T00:30:00Z'), 1)).toEqual(['2026-09-04']);
  });
});

describe('defaultDates', () => {
  it('opens a day behind today, so no timezone is ever without a puzzle', () => {
    // "Today" is a different date either side of UTC midnight. A player seven
    // hours behind UTC spends every evening on the date the generator already
    // calls yesterday; every night but the first has a file for it from the
    // previous run, and this day of slack covers the first.
    const dates = defaultDates(new Date('2026-09-04T00:00:00Z'));
    expect(dates[0]).toBe('2026-09-03');
    expect(dates.at(-1)).toBe('2026-09-10');
    expect(dates.length).toBe(TIMEZONE_SLACK_DAYS + LOOKAHEAD_DAYS);
  });

  it('is decided by the UTC date, not the machine clock', () => {
    // 23:30 UTC is already tomorrow in Auckland and still yesterday afternoon
    // in Portland; the window has to be the same either way.
    expect(defaultDates(new Date('2026-09-04T23:30:00Z'))).toEqual(
      defaultDates(new Date('2026-09-04T00:30:00Z')),
    );
  });
});

describe('unionCriminals', () => {
  it('spans every calibrated label rather than one', () => {
    // The count of hidden cards carries no difficulty signal across the puzzles
    // the bands were fitted from, so narrowing it to the shaping band's own
    // range would only make every puzzle the same density.
    const bands = loadBands(bandsData);
    const union = unionCriminals(bands);
    for (const band of Object.values(bands)) {
      expect(union.min).toBeLessThanOrEqual(band.criminals.min);
      expect(union.max).toBeGreaterThanOrEqual(band.criminals.max);
    }
    expect(union.max).toBeGreaterThan(union.min);
  });
});

describe('runGenerate', () => {
  let dir: string;
  let first: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'numberwang-generate-'));
    const run = await runGenerate({ dir, dates: [DATE] });
    expect(run.written).toEqual([FILE]);
    expect(run.failed).toEqual([]);
    first = await readFile(path.join(dir, FILE), 'utf8');
  }, 300_000);

  it('writes one file per missing date and skips existing ones', async () => {
    const again = await runGenerate({ dir, dates: [DATE] });
    expect(again.written).toEqual([]);
    expect(again.skipped).toEqual([FILE]);
    expect(await readFile(path.join(dir, FILE), 'utf8')).toBe(first);
  });

  it('writes a valid puzzle under its own date', () => {
    const puzzle = validatePuzzle(JSON.parse(first));
    expect(puzzle.date).toBe(DATE);
    expect(puzzle.source).toBe('generated');
    expect(puzzle.people.length).toBe(SIZE);
  });

  it('regenerates the manifest alongside the puzzles', async () => {
    expect(await readdir(dir)).toContain('index.json');
    const manifest = JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8'));
    expect(manifest.map((p: { date: string }) => p.date)).toEqual([DATE]);
    expect(manifest[0].id).toBe(validatePuzzle(JSON.parse(first)).id);
  });

  it(
    'rebuilds an existing date byte for byte under --force',
    async () => {
      // Everything a date's puzzle is comes from the date string, so a forced
      // rebuild is a no-op on disk. That is the promise `audit.mts` leans on
      // and the reason a lost file is a non-event.
      await writeFile(path.join(dir, FILE), '{"formatVersion":1}');
      const run = await runGenerate({ dir, dates: [DATE], force: true });
      expect(run.written).toEqual([FILE]);
      expect(await readFile(path.join(dir, FILE), 'utf8')).toBe(first);
    },
    300_000,
  );

  it(
    're-derives a committed puzzle from its filename',
    async () => {
      const { checked, failures } = await auditAll(dir);
      expect(failures).toEqual([]);
      expect(checked).toBe(1);
    },
    300_000,
  );

  it('audits only the newest dates when asked', async () => {
    // The archive only grows, and a puzzle is audited on the night it is
    // written and never edited after, so the nightly run checks the live window
    // rather than spending longer every day re-proving the same files.
    const scratch = await mkdtemp(path.join(tmpdir(), 'numberwang-audit-'));
    await writeFile(path.join(scratch, '2020-01-01.json'), '{"formatVersion":1}');
    await writeFile(path.join(scratch, '2020-01-02.json'), '{"formatVersion":1}');
    expect((await auditAll(scratch, { rederive: false })).checked).toBe(2);
    const recent = await auditAll(scratch, { rederive: false, recent: 1 });
    expect(recent.checked).toBe(1);
    expect(recent.failures.join('\n')).toMatch(/2020-01-02/);
  });

  it('reports a file that is not the puzzle its name claims', async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), 'numberwang-audit-'));
    // The same sound puzzle under the wrong date: everything internal checks
    // out, and only re-derivation can tell that it is the wrong puzzle.
    await writeFile(path.join(scratch, '2026-01-02.json'), first);
    const { failures } = await auditAll(scratch, { rederive: false });
    expect(failures.join('\n')).toMatch(/does not match filename/);
  });
});
