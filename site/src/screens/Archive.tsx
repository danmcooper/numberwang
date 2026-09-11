import { useMemo, useState } from 'react';
import type { ManifestEntry } from '../../../scripts/manifest.mts';
import { useFetch } from '../useFetch';
import { filterEntries, groupByMonth, groupByYear, sortDifficulties, statusFor, type PuzzleStatus } from './archiveData';

export default function Archive() {
  const { data, error, retry } = useFetch<ManifestEntry[]>('puzzles/index.json');
  const [difficulty, setDifficulty] = useState('');
  const [status, setStatus] = useState<PuzzleStatus | ''>('');

  const difficulties = useMemo(
    () => sortDifficulties([...new Set((data ?? []).map((e) => e.difficulty))]),
    [data],
  );
  const filtered = useMemo(
    () =>
      filterEntries(data ?? [], {
        difficulty: difficulty || undefined,
        status: status || undefined,
      }),
    [data, difficulty, status],
  );

  if (error) {
    return (
      <main>
        <p>Failed to load the archive: {error}</p>
        <button onClick={retry}>Retry</button>
      </main>
    );
  }
  if (!data) return <p>Loading…</p>;
  return (
    <main className="archive">
      <h1>Puzzle Archive</h1>
      <p className="arch-note">
        Difficulty is measured, not aimed at. The bands come from Clues by Sam's own
        puzzles, so treat the label as a rough guide to a board nobody has played yet
        rather than a promise.
      </p>
      {data.length === 0 && <p>No puzzles yet — the generator runs nightly.</p>}
      {data.length > 0 && (
        <div className="archive-filters">
          <label>
            Difficulty
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">All</option>
              {difficulties.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as PuzzleStatus | '')}>
              <option value="">All</option>
              <option value="unplayed">Unplayed</option>
              <option value="in progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </label>
        </div>
      )}
      {data.length > 0 && filtered.length === 0 && <p>No puzzles match those filters.</p>}
      {groupByYear(filtered).map((yearGroup) => (
        <details key={yearGroup.year} open={yearGroup.open}>
          <summary>{yearGroup.year}</summary>
          {groupByMonth(yearGroup.entries).map((group) => (
            <section key={group.month}>
              <h2>{group.month}</h2>
              <ul>
                {group.entries.map((entry) => (
                  <li key={entry.date}>
                    <a href={`#/play/${entry.date}`}>
                      <span className="arch-date">{entry.date}</span>
                      <span className="arch-title">{entry.title}</span>
                      <span className="arch-billing">{entry.difficulty}</span>
                      <span className={`arch-status status-${statusFor(entry.id).replace(' ', '-')}`}>
                        {statusFor(entry.id)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </details>
      ))}
    </main>
  );
}
