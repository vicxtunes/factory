// Reads rows for a long list of ids, a batch at a time.
//
// One `.in("id", ids)` with hundreds of ids broke the staff inbox on
// 2026-11-11: PostgREST echoes the whole query back in a Content-Location
// header, and past ~410 ids it went over Node fetch's 16 KB header limit
// ("fetch failed"). The API also returns at most 1000 rows a request, so a
// long list silently lost rows. 100 ids keep the request small, and each
// batch is read page by page, so nothing is cut off.
const IDS_PER_REQUEST = 100;
const ROWS_PER_PAGE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;
type Ranged<T> = { range(from: number, to: number): Page<T> };

/**
 * `query(batch)` builds the request for one batch of ids (with its own
 * `.in(...)` and, for long results, an `.order(...)` so pages don't overlap).
 * Returns every row, or the first error.
 */
export async function selectByIds<T>(
  ids: readonly string[],
  query: (batch: string[]) => Ranged<T>,
): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const unique = [...new Set(ids)];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += IDS_PER_REQUEST) batches.push(unique.slice(i, i + IDS_PER_REQUEST));

  const results = await Promise.all(
    batches.map(async (batch) => {
      const rows: T[] = [];
      for (let from = 0; ; from += ROWS_PER_PAGE) {
        const { data, error } = await query(batch).range(from, from + ROWS_PER_PAGE - 1);
        if (error) return { rows, error };
        rows.push(...(data ?? []));
        if ((data ?? []).length < ROWS_PER_PAGE) return { rows, error: null };
      }
    }),
  );
  const failed = results.find((r) => r.error);
  return { data: results.flatMap((r) => r.rows), error: failed?.error ?? null };
}
