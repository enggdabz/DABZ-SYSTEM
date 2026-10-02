"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Disclosure } from "@/components/ui";
import { formatPesos } from "@/lib/money";
import { formatAxisPesos, niceAxisRange, type TrendPoint } from "@/lib/sales-trend";

/*
  Money over time, drawn as plain SVG - a chart library would be the heaviest
  thing on the home screen for a line or two.

  Hover (or tap, on a phone) moves the readout above the chart to that point;
  it starts on the newest point, so the first thing read is today, this week,
  this month or this year. The newest point is still filling up, so the last
  stretch of each line is dashed and the readout says "so far" - a solid line
  falling to a half-day would read as a bad day.

  With more than one line, each is named twice: by the key in the readout
  and by a label at its right-hand end. Colour alone would not do it - the
  owner chose green for sales and red for expenses, and those are the two
  colours red-green colour blindness mixes up.

  The table under "Show as a table" is the same figures for anyone who cannot
  see the lines, and for anyone who wants the exact amounts.
*/

export interface TrendSeries {
  label: string;
  /** A CSS colour from the tokens, e.g. "var(--accent)". Never a hex value. */
  color: string;
  points: TrendPoint[];
}

const HEIGHT = 220;
const PAD = { top: 12, bottom: 28, left: 56 };
/** Below this many pixels between axis labels they start to collide. */
const LABEL_SPACING = 60;
/** Room at the right for a line's name, when there is more than one line. */
const END_LABEL_ROOM = 72;
/** Two end labels closer than this are pushed apart so they do not overlap. */
const END_LABEL_GAP = 14;

export function TrendChart({
  series,
  rangeWords,
  title,
}: {
  series: TrendSeries[];
  rangeWords: string;
  /** What the chart shows, for screen readers: "Sales and expenses". */
  title: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const points = series[0].points;
  const last = points.length - 1;
  const [selected, setSelected] = useState(last);
  const several = series.length > 1;

  // A new view (daily -> weekly) brings new points; start again at the newest.
  const [seen, setSeen] = useState(points);
  if (seen !== points) {
    setSeen(points);
    setSelected(points.length - 1);
  }

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(240, Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const padRight = several ? END_LABEL_ROOM : 12;
  const plotWidth = width - PAD.left - padRight;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const { min, max } = niceAxisRange(series.flatMap((s) => s.points.map((p) => p.centavos)));
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const x = (index: number) => PAD.left + index * step;
  const y = (centavos: number) => PAD.top + plotHeight * ((max - centavos) / (max - min));
  const zero = y(0);

  const path = (list: readonly (readonly [number, number])[]) =>
    list.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join("");

  const drawn = series.map((s) => {
    const coords = s.points.map((p, i) => [x(i), y(p.centavos)] as const);
    const lastIsCurrent = s.points[last]?.current ?? false;
    return {
      ...s,
      coords,
      solid: lastIsCurrent ? coords.slice(0, last) : coords,
      dashed: lastIsCurrent && last > 0 ? coords.slice(last - 1) : [],
    };
  });

  // End labels, nudged apart when the lines finish close together.
  const endLabels = drawn
    .map((s) => ({ label: s.label, color: s.color, y: s.coords[last][1] }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i += 1) {
    endLabels[i].y = Math.max(endLabels[i].y, endLabels[i - 1].y + END_LABEL_GAP);
  }

  // Label every nth point, counted back from the newest so it is always shown.
  const labelEvery = Math.max(1, Math.ceil(LABEL_SPACING / Math.max(step, 1)));
  const ticks = min < 0 ? (max > 0 ? [min, 0, max] : [min, min / 2, 0]) : [0, max / 2, max];

  const bucket = points[selected];

  function pick(event: PointerEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const offset = event.clientX - svg.getBoundingClientRect().left - PAD.left;
    const index = step > 0 ? Math.round(offset / step) : 0;
    setSelected(Math.min(last, Math.max(0, index)));
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowLeft") setSelected((i) => Math.max(0, i - 1));
    else if (event.key === "ArrowRight") setSelected((i) => Math.min(last, i + 1));
    else if (event.key === "Home") setSelected(0);
    else if (event.key === "End") setSelected(last);
    else return;
    event.preventDefault();
  }

  return (
    <div>
      <div aria-live="polite">
        <p className="text-sm text-muted">
          {bucket.label}
          {bucket.current ? " (so far)" : ""}
        </p>
        {several ? (
          <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
            {series.map((s) => (
              <li key={s.label} className="flex items-baseline gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-0.5 w-4 self-center rounded-full"
                  style={{ background: s.color }}
                />
                <span className="text-sm text-muted">{s.label}</span>
                <span className="text-xl font-semibold tracking-tight tabular-nums">
                  {formatPesos(s.points[selected].centavos)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatPesos(series[0].points[selected].centavos)}
          </p>
        )}
      </div>

      {/*
        The SVG is positioned absolutely so its own width never feeds back into
        the box being measured - otherwise the box grows to fit the SVG and a
        phone gets a chart wider than its screen.
      */}
      <div ref={box} className="relative mt-3 w-full" style={{ height: HEIGHT }}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="absolute inset-0 block touch-pan-y select-none rounded-control focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          role="img"
          aria-label={`${title} over ${rangeWords}. Use the left and right arrow keys to read each point.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--line)"
                strokeWidth={1}
                strokeDasharray={tick === 0 ? undefined : "2 4"}
              />
              <text
                x={PAD.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--muted)"
                fontSize={11}
              >
                {formatAxisPesos(tick)}
              </text>
            </g>
          ))}

          {points.map((p, index) =>
            (last - index) % labelEvery === 0 ? (
              <text
                key={index}
                x={x(index)}
                y={HEIGHT - 8}
                textAnchor={index === last ? "end" : index === 0 ? "start" : "middle"}
                fill="var(--muted)"
                fontSize={11}
              >
                {p.shortLabel}
              </text>
            ) : null,
          )}

          {/* A wash under a single line, down to zero; two washes would muddy. */}
          {several ? null : (
            <path
              d={`${path(drawn[0].coords)}L${x(last).toFixed(1)},${zero}L${PAD.left},${zero}Z`}
              fill={drawn[0].color}
              fillOpacity={0.1}
            />
          )}

          {drawn.map((s) => (
            <g key={s.label}>
              <path
                d={path(s.solid)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.dashed.length > 1 ? (
                <path
                  d={path(s.dashed)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                />
              ) : null}
            </g>
          ))}

          {several
            ? endLabels.map((l) => (
                <text
                  key={l.label}
                  x={PAD.left + plotWidth + 8}
                  y={l.y}
                  dominantBaseline="middle"
                  fill="var(--ink)"
                  fontSize={11}
                  fontWeight={600}
                >
                  {l.label}
                </text>
              ))
            : null}

          {/* Crosshair and a marker on each line at the point being read. */}
          <line
            x1={x(selected)}
            x2={x(selected)}
            y1={PAD.top}
            y2={PAD.top + plotHeight}
            stroke="var(--muted)"
            strokeWidth={1}
          />
          {drawn.map((s) => (
            <circle
              key={s.label}
              cx={s.coords[selected][0]}
              cy={s.coords[selected][1]}
              r={5}
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={2}
            />
          ))}

          {/* Wider than the lines, so a thumb does not have to land on one. */}
          <rect
            x={PAD.left - step / 2}
            y={0}
            width={plotWidth + step}
            height={HEIGHT}
            fill="transparent"
            onPointerMove={pick}
            onPointerDown={pick}
          />
        </svg>
      </div>

      <Disclosure label="Show as a table" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-4 font-medium">Period</th>
                {series.map((s) => (
                  <th key={s.label} className="py-2 pl-4 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points
                .map((p, index) => ({ p, index }))
                .reverse()
                .map(({ p, index }) => (
                  <tr key={p.label} className="border-b border-line/60">
                    <td className="py-2 pr-4">
                      {p.label}
                      {p.current ? <span className="text-muted"> (so far)</span> : null}
                    </td>
                    {series.map((s) => (
                      <td key={s.label} className="py-2 pl-4 text-right tabular-nums">
                        {formatPesos(s.points[index].centavos)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </div>
  );
}
