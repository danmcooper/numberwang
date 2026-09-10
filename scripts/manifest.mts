import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePuzzle } from '../shared/puzzle.ts';

export interface ManifestEntry {
  /** `YYYY-MM-DD`. Also the filename stem, and how the site addresses the puzzle
   * — there are no variants here, so a date names exactly one puzzle. */
  date: string;
  id: string;
  difficulty: string;
  title: string;
  width: number;
  height: number;
}

const PUZZLE_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

export async function regenerateManifest(puzzlesDir: string): Promise<ManifestEntry[]> {
  const files = (await readdir(puzzlesDir)).filter((f) => PUZZLE_FILE.test(f)).sort();
  const entries: ManifestEntry[] = [];
  for (const file of files) {
    let puzzle;
    try {
      puzzle = validatePuzzle(JSON.parse(await readFile(path.join(puzzlesDir, file), 'utf8')));
    } catch (e) {
      throw new Error(`${file}: ${String(e)}`);
    }
    const stem = file.slice(0, -'.json'.length);
    if (puzzle.date !== stem) {
      throw new Error(`${file}: filename and puzzle date disagree — puzzle says ${puzzle.date}`);
    }
    entries.push({
      date: puzzle.date,
      id: puzzle.id,
      difficulty: puzzle.difficulty,
      title: puzzle.title,
      width: puzzle.width,
      height: puzzle.height,
    });
  }
  // Newest first.
  entries.sort((a, b) => b.date.localeCompare(a.date));
  await writeFile(path.join(puzzlesDir, 'index.json'), JSON.stringify(entries, null, 2) + '\n');
  return entries;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  regenerateManifest(path.join(process.cwd(), 'puzzles')).then(
    (entries) => console.log(`index.json: ${entries.length} puzzles`),
    (e) => {
      console.error(String(e));
      process.exit(1);
    },
  );
}
