import { useState, useMemo } from "react";

interface Waypoint {
  x: number;
  y: number;
  altitude: number;
  airspeed: number;
  label?: string;
}

interface Props {
  waypoints: Waypoint[];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function altitudeColor(t: number): string {
  const r = Math.round(lerp(75, 232, t));
  const g = Math.round(lerp(143, 197, t));
  const b = Math.round(lerp(252, 71, t));
  return `rgb(${r},${g},${b})`;
}

function airspeedColor(t: number): string {
  const r = Math.round(lerp(71, 232, t));
  const g = Math.round(lerp(232, 72, t));
  const b = Math.round(lerp(120, 71, t));
  return `rgb(${r},${g},${b})`;
}

export function FlightTrajectory({ waypoints }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [colorMode, setColorMode] = useState<"altitude" | "airspeed">(
    "altitude"
  );

  const bounds = useMemo(() => {
    const xs = waypoints.map((w) => w.x);
    const ys = waypoints.map((w) => w.y);
    const pad = 40;
    return {
      minX: Math.min(...xs) - pad,
      maxX: Math.max(...xs) + pad,
      minY: Math.min(...ys) - pad,
      maxY: Math.max(...ys) + pad,
    };
  }, [waypoints]);

  const range = useMemo(() => {
    const alts = waypoints.map((w) => w.altitude);
    const spds = waypoints.map((w) => w.airspeed);
    return {
      maxAlt: Math.max(...alts) || 1,
      maxSpd: Math.max(...spds) || 1,
    };
  }, [waypoints]);

  const vw = bounds.maxX - bounds.minX;
  const vh = bounds.maxY - bounds.minY;

  function getColor(wp: Waypoint): string {
    if (colorMode === "altitude") {
      return altitudeColor(wp.altitude / range.maxAlt);
    }
    return airspeedColor(wp.airspeed / range.maxSpd);
  }

  return (
    <div
      style={{
        margin: "2rem 0",
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "1rem 1.5rem",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.7rem",
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Flight Trajectory
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {(["altitude", "airspeed"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setColorMode(mode)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                padding: "0.35rem 0.75rem",
                border: "1px solid var(--color-border-bright)",
                borderRadius: "var(--radius)",
                background:
                  colorMode === mode
                    ? "var(--color-bg-card-hover)"
                    : "transparent",
                color:
                  colorMode === mode
                    ? "var(--color-text-bright)"
                    : "var(--color-text-muted)",
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                transition: "all 0.2s",
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* SVG viewport */}
      <svg
        viewBox={`${bounds.minX} ${bounds.minY} ${vw} ${vh}`}
        style={{
          width: "100%",
          height: "auto",
          background: "var(--color-bg-raised)",
          display: "block",
        }}
      >
        {/* Grid lines */}
        {Array.from({ length: 5 }).map((_, i) => {
          const x = bounds.minX + (vw / 5) * (i + 1);
          return (
            <line
              key={`gx-${i}`}
              x1={x}
              y1={bounds.minY}
              x2={x}
              y2={bounds.maxY}
              stroke="var(--color-border)"
              strokeWidth={0.5}
            />
          );
        })}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = bounds.minY + (vh / 5) * (i + 1);
          return (
            <line
              key={`gy-${i}`}
              x1={bounds.minX}
              y1={y}
              x2={bounds.maxX}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Path segments */}
        {waypoints.slice(1).map((wp, i) => {
          const prev = waypoints[i];
          return (
            <line
              key={i}
              x1={prev.x}
              y1={prev.y}
              x2={wp.x}
              y2={wp.y}
              stroke={getColor(wp)}
              strokeWidth={3}
              strokeLinecap="round"
            />
          );
        })}

        {/* Waypoint dots */}
        {waypoints.map((wp, i) => (
          <g key={i}>
            <circle
              cx={wp.x}
              cy={wp.y}
              r={hovered === i ? 8 : wp.label ? 6 : 4}
              fill={getColor(wp)}
              stroke="var(--color-bg)"
              strokeWidth={2}
              style={{ cursor: "pointer", transition: "r 0.2s" }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
            {wp.label && hovered !== i && (
              <text
                x={wp.x + 10}
                y={wp.y - 10}
                fill="var(--color-text-muted)"
                fontSize={10}
                fontFamily="var(--font-mono)"
              >
                {wp.label}
              </text>
            )}
          </g>
        ))}

        {/* Tooltip */}
        {hovered !== null && (
          <g>
            <rect
              x={waypoints[hovered].x + 12}
              y={waypoints[hovered].y - 50}
              width={160}
              height={
                waypoints[hovered].label ? 60 : 44
              }
              rx={4}
              fill="rgba(10, 14, 26, 0.92)"
              stroke="var(--color-border-bright)"
              strokeWidth={1}
            />
            {waypoints[hovered].label && (
              <text
                x={waypoints[hovered].x + 20}
                y={waypoints[hovered].y - 33}
                fill="var(--color-accent)"
                fontSize={10}
                fontFamily="var(--font-mono)"
                fontWeight={600}
              >
                {waypoints[hovered].label}
              </text>
            )}
            <text
              x={waypoints[hovered].x + 20}
              y={
                waypoints[hovered].y -
                (waypoints[hovered].label ? 18 : 33)
              }
              fill="var(--color-text)"
              fontSize={10}
              fontFamily="var(--font-mono)"
            >
              Alt: {waypoints[hovered].altitude.toFixed(1)} m
            </text>
            <text
              x={waypoints[hovered].x + 20}
              y={
                waypoints[hovered].y -
                (waypoints[hovered].label ? 4 : 19)
              }
              fill="var(--color-text)"
              fontSize={10}
              fontFamily="var(--font-mono)"
            >
              Speed: {waypoints[hovered].airspeed.toFixed(1)} m/s
            </text>
          </g>
        )}

        {/* North arrow */}
        <g transform={`translate(${bounds.maxX - 25}, ${bounds.minY + 25})`}>
          <line
            x1={0}
            y1={15}
            x2={0}
            y2={-15}
            stroke="var(--color-text-muted)"
            strokeWidth={1.5}
            markerEnd="url(#arrowhead)"
          />
          <text
            x={0}
            y={-20}
            textAnchor="middle"
            fill="var(--color-text-muted)"
            fontSize={10}
            fontFamily="var(--font-mono)"
            fontWeight={600}
          >
            N
          </text>
        </g>
        <defs>
          <marker
            id="arrowhead"
            markerWidth={6}
            markerHeight={4}
            refX={3}
            refY={2}
            orient="auto"
          >
            <polygon
              points="0 0, 6 2, 0 4"
              fill="var(--color-text-muted)"
            />
          </marker>
        </defs>

        {/* Scale bar */}
        <g
          transform={`translate(${bounds.minX + 20}, ${bounds.maxY - 20})`}
        >
          <line
            x1={0}
            y1={0}
            x2={100}
            y2={0}
            stroke="var(--color-text-muted)"
            strokeWidth={2}
          />
          <line
            x1={0}
            y1={-4}
            x2={0}
            y2={4}
            stroke="var(--color-text-muted)"
            strokeWidth={1.5}
          />
          <line
            x1={100}
            y1={-4}
            x2={100}
            y2={4}
            stroke="var(--color-text-muted)"
            strokeWidth={1.5}
          />
          <text
            x={50}
            y={-8}
            textAnchor="middle"
            fill="var(--color-text-muted)"
            fontSize={9}
            fontFamily="var(--font-mono)"
          >
            100 m
          </text>
        </g>
      </svg>

      {/* Legend */}
      <div
        style={{
          padding: "0.75rem 1.5rem",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--color-text-muted)",
        }}
      >
        <span>
          Color:{" "}
          {colorMode === "altitude"
            ? "altitude (blue → gold)"
            : "airspeed (green → red)"}
        </span>
        <span>{waypoints.length} waypoints</span>
      </div>
    </div>
  );
}
