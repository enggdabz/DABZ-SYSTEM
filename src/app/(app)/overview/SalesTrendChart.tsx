"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Disclosure } from "@/components/ui";
import { formatPesos } from "@/lib/money";
import { formatAxisPesos, niceAxisMax, type TrendPoint } from "@/lib/sales-trend";

/*
  One red line, drawn as plain SVG - a chart library would be the heaviest
  thing on the home screen for one series.

  Hover (or tap, on a phone) moves the readout above the line to that point;
  it starts on the newest point, so the first thing read is today, this week,
  this month or this year. The newest point is still filling up, so the last
  stretch of line is dashed and the readout says "so far" - a solid line
  falling to a half-day would read as a bad day.

  The table under "Show as a table" is the same figures for anyone who cannot
  see the line, and for anyone who wants the exact amounts.
*/

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 52 };
/** Below this many pixels between axis labels they start to collide. */
const LABEL_SPACING = 60;

export function SalesTrendChart({
  points,
  rangeWords,
}: {
  points: TrendPoint[];
  rangeWords: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [selected, setSelected] = useState(points.length - 1);

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

  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const max = niceAxisMax(Math.max(...points.map((point) => point.centavos)));
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const x = (index: number) => PAD.left + index * step;
  const y = (centavos: number) => PAD.top + plotHeight * (1 - centavos / max);

  const coords = points.map((point, index) => [x(index), y(point.centavos)] as const);
  const path = (list: readonly (readonly [number, number])[]) =>
    list.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join("");

  const last = points.length - 1;
  const lastIsCurrent = points[last]?.current ?? false;
  const solid = lastIsCurrent ? coords.slice(0, last) : coords;
  const dashed = lastIsCurrent && last > 0 ? coords.slice(last - 1) : [];
  const baseline = PAD.top + plotHeight;
  const area = `${path(coords)}L${x(last).toFixed(1)},${baseline}L${PAD.left},${baseline}Z`;

  // Label every nth point, counted back from the newest so it is always shown.
  const labelEvery = Math.max(1, Math.ceil(LABEL_SPACING / Math.max(step, 1)));
  const ticks = [0, max / 2, max];

  const point = points[selected];

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
      <p className="text-sm text-muted" aria-live="polite">
        {point.label}
        {point.current ? " (so far)" : ""}
      </p>
      <p className="text-2xl font-semibold tracking-tight">{formatPesos(point.centavos)}</p>

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
          aria-label={`Sales over ${rangeWords}. Use the left and right arrow keys to read each point.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
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

          <path d={area} fill="var(--accent)" fillOpacity={0.1} />
          <path
            d={path(solid)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {dashed.length > 1 ? (
            <path
              d={path(dashed)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
          ) : null}

          {/* Crosshair and marker on the point being read. */}
          <line
            x1={x(selected)}
            x2={x(selected)}
            y1={PAD.top}
            y2={baseline}
            stroke="var(--muted)"
            strokeWidth={1}
          />
          <circle
            cx={coords[selected][0]}
            cy={coords[selected][1]}
            r={5}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />

          {/* Wider than the line, so a thumb does not have to land on it. */}
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
                <th className="py-2 text-right font-medium">Sales</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.label} className="border-b border-line/60">
                  <td className="py-2 pr-4">
                    {p.label}
                    {p.current ? <span className="text-muted"> (so far)</span> : null}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatPesos(p.centavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </div>
  );
}
