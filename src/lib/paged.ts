/**
 * Reading more rows than PostgREST will hand back in one go.
 *
 * PostgREST returns at most `max_rows` rows a request - 1,000 on Supabase,
 * and in `supabase/config.toml` - whatever `.limit()` asks for. Nothing
 * errors when that happens: a request for 5,000 rows simply comes back with
 * 1,000, and a total added up from them is short with no sign anything is
 * missing. Reports asked for 5,000 ledger rows that way, and the Overview and
 * End of day for 2,000.
 *
 * So anything that may want more than one page reads through here, a page at
 * a time, until it has what it asked for or the table runs out.
 */

/** What PostgREST will return in one request. Asking for more gets this many. */
export const PAGE_SIZE = 1000;

/** One page of a query: rows `from` to `to`, inclusive, as `.range()` takes. */
export type PageReader<T> = (
  from: number,
  to: number,
) => PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Up to `limit` rows, read a page at a time.
 *
 * The query handed in MUST have a total order - order by a timestamp AND then
 * by id - or rows sharing a timestamp can land on both sides of a page break
 * and be counted twice or not at all.
 *
 * A failed page fails the whole read (`error` set, rows empty): half a total
 * is worse than none, because it looks like a total.
 */
export async function readPaged<T>(
  readPage: PageReader<T>,
  limit: number,
): Promise<{ rows: T[]; error: unknown }> {
  const rows: T[] = [];

  while (rows.length < limit) {
    const want = Math.min(PAGE_SIZE, limit - rows.length);
    const { data, error } = await readPage(rows.length, rows.length + want - 1);
    if (error || !data) return { rows: [], error: error ?? new Error("No data") };

    rows.push(...data);
    // A short page - shorter than asked for, or than the server's own cap -
    // means there is nothing more to read.
    if (data.length < Math.min(want, PAGE_SIZE)) break;
  }

  return { rows, error: null };
}
