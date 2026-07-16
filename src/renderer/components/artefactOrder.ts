/*
 * artefactOrder
 * -------------
 * Shared ordering for the artefact lists in the selection screen
 * (CommitTaskDialog) and the task view (TaskEditView).
 *
 *  - 'grouped' (Relevance & Applications, default): applications are NOT mixed.
 *    Each application (a browser, an IDE, an app) is a block; blocks are ordered
 *    by their highest-ranked artefact, and the artefacts inside a block are
 *    ordered by their own relevance.
 *  - 'flat' (Relevance): every artefact is ordered by relevance alone, mixing
 *    applications — each row still shows which application it belongs to.
 */

export type OrderMode = 'grouped' | 'flat';

export const ORDER_MODES: { value: OrderMode; label: string }[] = [
  { value: 'grouped', label: 'Relevance & Applications' },
  { value: 'flat', label: 'Relevance' },
];

/** A score, defaulting to 0 for null/undefined/NaN. */
export function num(v?: number | null): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** The maximum of several (possibly missing) scores; 0 when none. */
export function maxOf(...vals: (number | undefined | null)[]): number {
  let m = 0;
  for (const v of vals) {
    const n = num(v);
    if (n > m) m = n;
  }
  return m;
}

/** Descending-by-score comparator over a `relevance` accessor. */
export function byRelevanceDesc<T>(score: (t: T) => number) {
  return (a: T, b: T) => score(b) - score(a);
}
