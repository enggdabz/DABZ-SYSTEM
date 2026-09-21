/**
 * The report as a spreadsheet file (spec 15.3).
 *
 * A route handler rather than a screen, because a download has to come back
 * with its own headers. It re-checks who is asking, exactly as a screen does:
 * a URL is a public endpoint whether or not anyone linked to it.
 */
import { getSettings, requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getCollectionsReport, getReport } from "@/lib/data/reports";
import { civilDateToISO, manilaToday } from "@/lib/period";
import {
  RANGE_PRESETS,
  rangeForPreset,
  toCsv,
  type RangePreset,
} from "@/lib/reports";

export async function GET(request: Request) {
  // Full reports are Owner/Admin only (spec 4.3). requireOwnerOrAdmin
  // redirects, which is the right answer for a link somebody was sent.
  await requireOwnerOrAdmin();

  const settings = await getSettings();
  const period = new URL(request.url).searchParams.get("period");

  const preset: RangePreset = RANGE_PRESETS.includes(period as RangePreset)
    ? (period as RangePreset)
    : "this_month";

  const range = rangeForPreset(
    preset,
    civilDateToISO(manilaToday()),
    settings.weekStartsOn,
  );

  const [report, collections] = await Promise.all([
    getReport(range),
    getCollectionsReport(range),
  ]);

  const csv = toCsv(report, collections);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // Named by the range, so a folder of these sorts itself by date.
      "Content-Disposition": `attachment; filename="dabz-report-${range.fromISO}-to-${range.toISO}.csv"`,
      // A report is a snapshot of live figures; a cached one would be a lie.
      "Cache-Control": "no-store",
    },
  });
}
