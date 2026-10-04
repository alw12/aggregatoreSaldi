"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = { date: string; total: number };

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const eurFull = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });

const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 56 };

/** Andamento del patrimonio netto: linea + crosshair e tooltip al passaggio (mouse, tocco o tastiera). */
export function TrendChart({ points }: { points: Point[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const vals = points.map((p) => p.total);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi - lo < 1) {
      lo -= 50;
      hi += 50;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const iw = width - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * ih;
    const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
    const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join("");
    const area = `${path}L${x(points.length - 1).toFixed(1)},${PAD.top + ih}L${x(0).toFixed(1)},${PAD.top + ih}Z`;
    return { x, y, ticks, path, area, iw, ih };
  }, [points, width]);

  const pick = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return;
    const rel = (clientX - rect.left - PAD.left) / geo.iw;
    setHover(Math.min(points.length - 1, Math.max(0, Math.round(rel * (points.length - 1)))));
  };

  const h = hover !== null ? points[hover] : null;
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div
      ref={ref}
      className="trend"
      tabIndex={0}
      role="img"
      aria-label={`Patrimonio netto dal ${day(first.date)} al ${day(last.date)}: da ${eurFull(first.total)} a ${eurFull(last.total)}`}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => setHover(null)}
      onBlur={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? points.length) - 1));
        if (e.key === "ArrowRight") setHover((v) => Math.min(points.length - 1, (v ?? -1) + 1));
        if (e.key === "Escape") setHover(null);
      }}
    >
      <svg width={width} height={H} aria-hidden>
        {geo.ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} />
            <text className="tick" x={PAD.left - 8} y={geo.y(t)} dy="0.35em" textAnchor="end">{eur(t)}</text>
          </g>
        ))}
        <text className="tick" x={PAD.left} y={H - 6}>{day(first.date)}</text>
        {points.length > 1 && <text className="tick" x={width - PAD.right} y={H - 6} textAnchor="end">{day(last.date)}</text>}
        <path className="trend-area" d={geo.area} />
        <path className="trend-line" d={geo.path} />
        {h && (
          <>
            <line className="crosshair" x1={geo.x(hover!)} x2={geo.x(hover!)} y1={PAD.top} y2={PAD.top + geo.ih} />
            <circle className="trend-dot" cx={geo.x(hover!)} cy={geo.y(h.total)} r={4.5} />
          </>
        )}
        {!h && <circle className="trend-dot" cx={geo.x(points.length - 1)} cy={geo.y(last.total)} r={4} />}
      </svg>
      {h && (
        <div
          className="tooltip"
          style={{ left: Math.min(width - 150, Math.max(0, geo.x(hover!) - 70)), top: Math.max(0, geo.y(h.total) - 58) }}
        >
          <div className="tooltip-date">{day(h.date)}</div>
          <div className="tooltip-value">{eurFull(h.total)}</div>
        </div>
      )}
    </div>
  );
}
