/**
 * Build the puzzles the site serves: one file per date, seven days ahead.
 *
 * Everything about a date's puzzle comes from the date string, so any file in
 * `puzzles/` can be rebuilt from its own name — which is what `audit.mts`
 * does, and what makes a lost or corrupted file a non-event.
 *
 * Run: npm run generate [YYYY-MM-DD ...] [--force] [--days=N]
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import bandData from '../config/difficulty.json' with { type: 'json' };
import mixData from '../config/clue-mix.json' with { type: 'json' };
import type { Puzzle } from '../shared/puzzle.ts';
import type { Band, Bands, LabelBand } from '../shared/solver/difficulty.ts';
import { bandsFor, classify, loadBands } from '../shared/solver/difficulty.ts';
import { GenerationError, generatePuzzle } from '../shared/solver/generate.ts';
import { loadMix, withArithBudgets } from '../shared/solver/mix.ts';
import { regenerateManifest } from './manifest.mts';

/** Four wide, five high, every day. See the design's board section. */
export const SIZE = 20;

/**
 * How far ahead the archive runs. The nightly workflow tops it back up, so this
 * is the number of consecutive failed nights the site can absorb before a day
 * arrives with no puzzle on it.
 */
export const LOOKAHEAD_DAYS = 7;

/**
 * One day of slack behind today, because "today" is a different date either
 * side of UTC midnight. A player seven hours behind UTC spends every evening on
 * a date the generator already calls yesterday; on any night but the first that
 * date has a file from the previous run, and this is what covers the first.
 *
 * Not backfilling: the archive still begins on launch day and only grows
 * forward. This is one day of overlap at the leading edge, not history.
 */
export const TIMEZONE_SLACK_DAYS = 1;

/**
 * The band every puzzle is shaped by. Generation is unaimed — nothing is
 * rejected for its metrics and `classify` names what came out — so this is not
 * a target: it sets the reveal ceiling and the abstraction target that
 * `generatePuzzle` builds toward. Medium because a day's puzzle should start
 * from the middle of the range rather than from either end of it.
 */
export const SHAPING_LABEL = 'Medium';

/** FNV-1a over the date string: stable across runs and machines. */
export function seedFor(date: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The union of every calibrated label's `numberwangs` range.
 *
 * Measured across the puzzles the bands were fitted from, the count of hidden
 * cards carries no difficulty signal: Medium, Tricky and Hard cluster within
 * 0.23 of each other's mean, and the apparent Easy/Brutal split is an artifact
 * of Brutal having three samples. Sampling from one label's own narrow range
 * would therefore not make a puzzle any harder, it would only make every puzzle
 * the same density.
 */
export function unionNumberwangs(bands: Bands): Band {
  const labels = Object.values(bands);
  return {
    min: Math.min(...labels.map((b) => b.numberwangs.min)),
    max: Math.max(...labels.map((b) => b.numberwangs.max)),
  };
}

/**
 * The puzzle for a date, from the date and nothing else.
 *
 * Deterministic by construction: the seed is a hash of the date string and the
 * bands and mix are files in the repo, so the same date rebuilds byte for byte
 * until the generator itself changes. `audit.mts` leans on exactly that.
 */
export function buildPuzzle(date: string): Puzzle {
  const bands = loadBands(bandData);
  const shaping = bands[SHAPING_LABEL];
  if (!shaping) throw new Error(`no calibrated band named ${SHAPING_LABEL}`);
  const band: LabelBand = { ...shaping, numberwangs: unionNumberwangs(bands) };
  const boardBands = bandsFor(bands, SIZE);
  return generatePuzzle({
    date,
    difficulty: SHAPING_LABEL,
    band,
    seed: seedFor(date),
    // The budgets, not the bare archive shares: the archive wrote no
    // arithmetic clue, so without them the eight are generated never.
    mix: withArithBudgets(loadMix(mixData)),
    labelOf: (metrics) => classify(boardBands, metrics),
  }).puzzle;
}

/** `count` consecutive dates starting `offset` days from `from`, in UTC so a
 * date is a date and not a property of the machine's timezone. */
export function upcomingDates(from: Date, count: number, offset = 0): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + offset + i),
    );
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** The window a bare `npm run generate` fills: yesterday through today + 6. */
export function defaultDates(now: Date): string[] {
  return upcomingDates(now, TIMEZONE_SLACK_DAYS + LOOKAHEAD_DAYS, -TIMEZONE_SLACK_DAYS);
}

export interface GenerateRunOptions {
  dir?: string;
  /** Which dates to build; default is `defaultDates(new Date())`. */
  dates?: string[];
  /** Rebuild dates that already have a file. Deterministic, so it rewrites the
   * same bytes unless the generator itself has changed. */
  force?: boolean;
  /** Called as each date settles. A week of puzzles is minutes of work, and a
   * caller that only learns the outcome at the end cannot tell slow from stuck. */
  onProgress?: (event: GenerateProgress) => void;
}

export type GenerateProgress = { date: string } & (
  | { outcome: 'written'; label: string; seconds: number }
  | { outcome: 'skipped' }
  | { outcome: 'failed'; reason: string }
);

export interface GenerateRunResult {
  /** Filenames written, in date order. */
  written: string[];
  skipped: string[];
  failed: { date: string; reason: string }[];
}

export async function runGenerate(opts: GenerateRunOptions = {}): Promise<GenerateRunResult> {
  const dir = opts.dir ?? path.join(process.cwd(), 'puzzles');
  const dates = (opts.dates ?? defaultDates(new Date())).slice().sort();
  // A fresh clone has no `puzzles/` until the first night writes one.
  await mkdir(dir, { recursive: true });
  const existing = new Set(await readdir(dir));
  const result: GenerateRunResult = { written: [], skipped: [], failed: [] };
  const report = (event: GenerateProgress) => opts.onProgress?.(event);

  for (const date of dates) {
    const file = `${date}.json`;
    if (!opts.force && existing.has(file)) {
      result.skipped.push(file);
      report({ date, outcome: 'skipped' });
      continue;
    }
    const startedAt = Date.now();
    try {
      const puzzle = buildPuzzle(date);
      await writeFile(path.join(dir, file), `${JSON.stringify(puzzle, null, 2)}\n`);
      result.written.push(file);
      report({
        date,
        outcome: 'written',
        label: puzzle.difficulty,
        seconds: (Date.now() - startedAt) / 1000,
      });
    } catch (e) {
      if (!(e instanceof GenerationError)) throw e;
      const reason = e.message.split('\n')[0];
      result.failed.push({ date, reason });
      report({ date, outcome: 'failed', reason });
    }
  }

  await regenerateManifest(dir);
  return result;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const dates = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const days = Number(args.find((a) => a.startsWith('--days='))?.slice('--days='.length));
  const unknown = args.filter(
    (a) => !/^\d{4}-\d{2}-\d{2}$/.test(a) && a !== '--force' && !a.startsWith('--days='),
  );
  if (unknown.length || (args.some((a) => a.startsWith('--days=')) && !Number.isInteger(days))) {
    console.error(`usage: npm run generate [YYYY-MM-DD ...] [--force] [--days=N]`);
    process.exit(2);
  }
  runGenerate({
    force: args.includes('--force'),
    dates: dates.length
      ? dates
      : Number.isInteger(days)
        ? upcomingDates(new Date(), days + TIMEZONE_SLACK_DAYS, -TIMEZONE_SLACK_DAYS)
        : defaultDates(new Date()),
    onProgress: (e) => {
      if (e.outcome === 'skipped') return;
      if (e.outcome === 'failed') console.error(`FAILED ${e.date}: ${e.reason}`);
      else console.log(`generated ${e.date}.json  ${e.label}  ${e.seconds.toFixed(1)}s`);
    },
  }).then(
    (r) => {
      console.log(
        `\n${r.written.length} generated, ${r.skipped.length} skipped, ${r.failed.length} failed`,
      );
      if (r.failed.length) process.exit(1);
    },
    (e) => {
      console.error(String(e));
      process.exit(1);
    },
  );
}
