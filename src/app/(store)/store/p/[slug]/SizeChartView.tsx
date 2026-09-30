import Image from "next/image";

import { Disclosure } from "@/components/ui";
import { storeImageUrl } from "@/lib/store/storage";
import type { SizeChart } from "@/lib/store/types";

/**
 * The size chart, folded away until asked for. A `<details>` element rather
 * than a dialog: it needs no script, and it cannot cover the page.
 */
export function SizeChartView({ chart }: { chart: SizeChart }) {
  const imageUrl = storeImageUrl(chart.imagePath);
  const hasTable = chart.columns.length > 0 && chart.rows.length > 0;
  if (!imageUrl && !hasTable) return null;

  return (
    <Disclosure label="Size chart">
      <div className="space-y-3">
        {hasTable ? (
          <div className="overflow-x-auto rounded-control ring-1 ring-line">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="bg-tile">
                <tr>
                  {chart.columns.map((column) => (
                    <th key={column} scope="col" className="px-4 py-2 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((row, i) => (
                  <tr key={i} className="border-t border-line">
                    {row.map((cell, j) =>
                      j === 0 ? (
                        <th key={j} scope="row" className="px-4 py-2 font-medium">
                          {cell}
                        </th>
                      ) : (
                        <td key={j} className="px-4 py-2">
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {imageUrl ? (
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-control bg-tile">
            <Image src={imageUrl} alt={`${chart.name} size chart`} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-contain" />
          </div>
        ) : null}

        {chart.note ? <p className="text-xs text-muted">{chart.note}</p> : null}
      </div>
    </Disclosure>
  );
}
