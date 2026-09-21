/**
 * The summary the cutting and sewing work from (Phase 13).
 *
 *   "After everything is encoded, show a summary: how many Jersey, T-Shirt,
 *    Polo Shirt, Longsleeve, Jacket and Custom there are per size, and the
 *    same for the shorts: the quantity of shorts per size."
 *
 * Two grids, both counted from the rows every time and neither stored - see
 * `summariseUniforms` in `src/lib/uniforms.ts` for why. This component is
 * shared by the project screen and the printed job order sheet on purpose: two
 * copies of a grid is two chances for the shop floor and the customer to be
 * cutting different amounts.
 *
 * It is a server component with no state of its own, so the sheet can render
 * it straight into a printed page.
 */
import type { UniformSummary } from "@/lib/uniforms";
import { APPAREL_SIZES } from "@/lib/uniforms";

/**
 * Only the sizes that are actually in use, plus a "not set" column when there
 * is something in it.
 *
 * Nine empty columns on a phone is a sideways scroll, and a sideways scroll is
 * how somebody reads a count off the wrong column. The "not set" column is
 * never hidden when it has anything in it - that is the column somebody has to
 * go and fix.
 */
function columnsFor(summary: UniformSummary) {
  const used = APPAREL_SIZES.filter((_, index) => summary.upperBySize[index] > 0);
  const shorts = APPAREL_SIZES.filter((_, index) => summary.shortsBySize[index] > 0);
  return { used, shorts };
}

export function UniformSummaryGrids({
  summary,
  unsaved = false,
  title = "Summary",
  print = false,
}: {
  summary: UniformSummary;
  /** True while the table above has changes nobody has saved. */
  unsaved?: boolean;
  title?: string;
  /** Black on white, for the printed sheet. */
  print?: boolean;
}) {
  const { used, shorts } = columnsFor(summary);

  const frame = print
    ? ""
    : "rounded-card bg-surface p-6 shadow-sm ring-1 ring-line/60";
  const rule = print ? "border-black/20" : "border-line/60";
  const head = print ? "text-black" : "text-muted";
  const quiet = print ? "text-black" : "text-muted";

  const nothing =
    summary.upperTotal === 0 &&
    summary.shortsTotal === 0 &&
    summary.unencodedTotal === 0;

  return (
    <section className={frame}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className={print ? "text-sm font-bold" : "text-lg font-semibold tracking-tight"}>
          {title}
        </h2>
        {unsaved ? (
          // Counted from what is on the table, not from what is saved. Said
          // out loud, because a grid somebody cuts from has to declare which.
          <span className="text-xs text-attention">
            <span aria-hidden="true">{"⚠"} </span>
            Counts what is on the table, including changes not saved yet
          </span>
        ) : null}
      </div>

      {nothing ? (
        <p className={`mt-3 text-sm ${quiet}`}>
          Nothing is encoded on this project yet, so there is nothing to count.
        </p>
      ) : null}

      {summary.uppers.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className={print ? "w-full text-xs" : "w-full text-sm"}>
            <caption className={`pb-2 text-left text-xs font-medium ${head}`}>
              Uppers, per size
            </caption>
            <thead>
              <tr className={`border-b text-left ${rule}`}>
                <th className={`pb-1 pr-3 text-xs font-medium ${head}`}>Uniform</th>
                {used.map((size) => (
                  <th key={size} className={`pb-1 px-2 text-center text-xs font-medium ${head}`}>
                    {size}
                  </th>
                ))}
                {summary.upperNoSize > 0 ? (
                  <th className={`pb-1 px-2 text-center text-xs font-medium ${head}`}>
                    <span aria-hidden="true">{"⚠"} </span>
                    Not set
                  </th>
                ) : null}
                <th className={`pb-1 pl-3 text-right text-xs font-medium ${head}`}>Total</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${print ? "divide-black/20" : "divide-line/60"}`}>
              {summary.uppers.map((line) => (
                <tr key={line.key}>
                  <td className="py-1.5 pr-3 font-medium">{line.label}</td>
                  {used.map((size) => {
                    const count = line.bySize[APPAREL_SIZES.indexOf(size)];
                    return (
                      <td key={size} className={`py-1.5 px-2 text-center ${count === 0 ? quiet : ""}`}>
                        {count === 0 ? "—" : count}
                      </td>
                    );
                  })}
                  {summary.upperNoSize > 0 ? (
                    <td
                      className={`py-1.5 px-2 text-center ${
                        line.noSize > 0 ? "text-attention" : quiet
                      }`}
                    >
                      {line.noSize === 0 ? "—" : line.noSize}
                    </td>
                  ) : null}
                  <td className="py-1.5 pl-3 text-right font-semibold">{line.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`border-t ${rule}`}>
                <td className={`pt-1.5 pr-3 text-xs font-medium ${head}`}>All uppers</td>
                {used.map((size) => (
                  <td key={size} className="pt-1.5 px-2 text-center font-semibold">
                    {summary.upperBySize[APPAREL_SIZES.indexOf(size)]}
                  </td>
                ))}
                {summary.upperNoSize > 0 ? (
                  <td className="pt-1.5 px-2 text-center font-semibold text-attention">
                    {summary.upperNoSize}
                  </td>
                ) : null}
                <td className="pt-1.5 pl-3 text-right font-bold">{summary.upperTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {summary.shortsTotal > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <table className={print ? "w-full text-xs" : "w-full text-sm"}>
            <caption className={`pb-2 text-left text-xs font-medium ${head}`}>
              Shorts, per size
            </caption>
            <thead>
              <tr className={`border-b text-left ${rule}`}>
                {shorts.map((size) => (
                  <th key={size} className={`pb-1 px-2 text-center text-xs font-medium ${head}`}>
                    {size}
                  </th>
                ))}
                <th className={`pb-1 pl-3 text-right text-xs font-medium ${head}`}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {shorts.map((size) => (
                  <td key={size} className="py-1.5 px-2 text-center font-semibold">
                    {summary.shortsBySize[APPAREL_SIZES.indexOf(size)]}
                  </td>
                ))}
                <td className="py-1.5 pl-3 text-right font-bold">{summary.shortsTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {summary.sizeMissing ? (
        <p className="mt-4 text-xs text-attention">
          <span aria-hidden="true">{"⚠"} </span>
          {summary.upperNoSize} piece{summary.upperNoSize === 1 ? "" : "s"} with
          no size yet. They are counted in their own column rather than guessed
          into one, so nothing is cut on a size nobody gave.
        </p>
      ) : null}

      {summary.shortNameWithoutSize > 0 ? (
        <p className="mt-2 text-xs text-attention">
          <span aria-hidden="true">{"⚠"} </span>
          {summary.shortNameWithoutSize} row
          {summary.shortNameWithoutSize === 1 ? " has" : "s have"} a short name
          with no short size, so no shorts are counted for
          {summary.shortNameWithoutSize === 1 ? " it" : " them"}.
        </p>
      ) : null}

      {summary.unencoded.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs text-attention">
            <span aria-hidden="true">{"⚠"} </span>
            {summary.unencodedTotal} piece
            {summary.unencodedTotal === 1 ? "" : "s"} with nobody encoded for
            them, so they are not in the grid above:
          </p>
          <ul className={`mt-1 text-xs ${quiet}`}>
            {summary.unencoded.map((item) => (
              <li key={item.lineId}>
                {item.name} &mdash; {item.quantity} piece
                {item.quantity === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
