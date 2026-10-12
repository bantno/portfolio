import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  BATTERY_WH,
  BIN_WH,
  K,
  NB,
  SITES,
  STAGE_H,
  flyAdvantage,
  monteCarlo,
  optimalAction,
  solve,
  thresholdAction,
  whaleProb,
  type MonteCarlo,
  type Thresholds,
} from "./mdpSolver";

const TRIALS = 400;
const SEED = 5000; // fixed, so every visitor sees the same weather draws
const MISSION_DAYS = (K * STAGE_H) / 24;

// ---------- styles ----------

const mono: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.7rem",
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const panel: CSSProperties = {
  padding: "1rem",
  background: "var(--color-bg-raised)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius)",
};

const slider: CSSProperties = { width: "100%", accentColor: "var(--color-accent)" };

function Control({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label style={{ ...mono, display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <span>{label}</span>
        <span style={{ color: "var(--color-text-bright)" }}>{value}</span>
      </label>
      {children}
    </div>
  );
}

// ---------- scoreboard ----------

function Score({
  title,
  color,
  r,
  winner,
}: {
  title: string;
  color: string;
  r: MonteCarlo;
  winner: boolean;
}) {
  const rows: [string, string][] = [
    ["Whale sightings", r.meanSightings.toFixed(1)],
    ["Missions ending in failure", `${r.failurePct.toFixed(0)}%`],
    ["Flight hours per day", r.flightHoursPerDay.toFixed(2)],
    [
      "Mean failure day",
      r.meanFailureDay === null ? "—" : `day ${r.meanFailureDay.toFixed(0)}`,
    ],
  ];
  return (
    <div style={{ ...panel, borderColor: winner ? color : "var(--color-border)" }}>
      <div style={{ ...mono, color, marginBottom: "0.5rem" }}>{title}</div>
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.6rem",
          fontWeight: 700,
          color: "var(--color-text-bright)",
          lineHeight: 1.1,
        }}
      >
        {r.meanReward >= 0 ? "+" : ""}
        {r.meanReward.toFixed(1)}
        <span style={{ ...mono, marginLeft: "0.5rem" }}>mean reward</span>
      </div>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "0.25rem 1rem",
          margin: "0.75rem 0 0",
          fontFamily: "var(--font-mono)",
          fontSize: "0.75rem",
        }}
      >
        {rows.map(([k, v]) => (
          <Fragment key={k}>
            <dt style={{ color: "var(--color-text-muted)" }}>{k}</dt>
            <dd style={{ margin: 0, color: "var(--color-text-bright)", textAlign: "right" }}>{v}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

// ---------- example-episode chart ----------

function EpisodeChart({ opt, thr }: { opt: MonteCarlo; thr: MonteCarlo }) {
  const W = 760;
  const H = 180;
  const padL = 34;
  const padB = 22;
  const plotW = W - padL - 6;
  const plotH = H - padB - 18;
  const x = (k: number) => padL + (k / (K - 1)) * plotW;
  const y = (wh: number) => 18 + plotH - (wh / BATTERY_WH) * plotH;

  const path = (soc: Float32Array) => {
    let d = "";
    let pen = false;
    for (let k = 0; k < K; k++) {
      const v = soc[k];
      if (Number.isNaN(v)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const flyBars = (air: Uint8Array, yTop: number, color: string) => {
    const rects: ReactNode[] = [];
    let start = -1;
    for (let k = 0; k <= K; k++) {
      const on = k < K && air[k] === 1;
      if (on && start < 0) start = k;
      if (!on && start >= 0) {
        rects.push(
          <rect
            key={`${yTop}-${start}`}
            x={x(start)}
            y={yTop}
            width={Math.max(1, x(k) - x(start))}
            height={5}
            fill={color}
            opacity={0.8}
          />
        );
        start = -1;
      }
    }
    return rects;
  };

  const failMark = (ep: MonteCarlo["example"], color: string) =>
    ep.failedAt >= 0 ? (
      <g stroke={color} strokeWidth={1.5}>
        <line x1={x(ep.failedAt) - 4} y1={y(ep.soc[ep.failedAt]) - 4} x2={x(ep.failedAt) + 4} y2={y(ep.soc[ep.failedAt]) + 4} />
        <line x1={x(ep.failedAt) - 4} y1={y(ep.soc[ep.failedAt]) + 4} x2={x(ep.failedAt) + 4} y2={y(ep.soc[ep.failedAt]) - 4} />
      </g>
    ) : null;

  const dayTicks = [0, 5, 10, 15, 20, 25, 30];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label="Battery state of charge over the mission for both policies, with flight periods and failure points"
    >
      {[0, 50, 100].map((p) => (
        <g key={p}>
          <line x1={padL} x2={W - 6} y1={y((p / 100) * BATTERY_WH)} y2={y((p / 100) * BATTERY_WH)} stroke="var(--color-border)" strokeWidth={0.5} />
          <text x={padL - 4} y={y((p / 100) * BATTERY_WH) + 3} textAnchor="end" fill="var(--color-text-muted)" fontSize={9} fontFamily="var(--font-mono)">
            {p}%
          </text>
        </g>
      ))}
      {dayTicks.map((d) => (
        <text key={d} x={x((d * 24) / STAGE_H)} y={H - 8} textAnchor="middle" fill="var(--color-text-muted)" fontSize={9} fontFamily="var(--font-mono)">
          day {d}
        </text>
      ))}
      {flyBars(thr.example.airborne, 4, "var(--color-user-policy)")}
      {flyBars(opt.example.airborne, 10, "var(--color-optimal-policy)")}
      <path d={path(thr.example.soc)} fill="none" stroke="var(--color-user-policy)" strokeWidth={1} opacity={0.9} />
      <path d={path(opt.example.soc)} fill="none" stroke="var(--color-optimal-policy)" strokeWidth={1} opacity={0.9} />
      {failMark(thr.example, "var(--color-user-policy)")}
      {failMark(opt.example, "var(--color-optimal-policy)")}
    </svg>
  );
}

// ---------- policy maps ----------

function cssColor(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const STAGES_PER_DAY = Math.round(24 / STAGE_H);

function DayMap({
  title,
  colorVar,
  fallback,
  day,
  flies,
}: {
  title: string;
  colorVar: string;
  fallback: string;
  day: number;
  flies: (k: number, socWh: number) => boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const [r, g, b] = hexToRgb(cssColor(colorVar, fallback));
    const [br, bg, bb] = hexToRgb(cssColor("--color-bg-raised", "#111627"));
    const img = ctx.createImageData(STAGES_PER_DAY, NB);
    const k0 = Math.min(K - STAGES_PER_DAY, day * STAGES_PER_DAY);
    for (let c = 0; c < STAGES_PER_DAY; c++) {
      for (let i = 0; i < NB; i++) {
        const on = flies(k0 + c, i * BIN_WH);
        const row = NB - 1 - i; // SoC increases upward
        const o = (row * STAGES_PER_DAY + c) * 4;
        img.data[o] = on ? r : br;
        img.data[o + 1] = on ? g : bg;
        img.data[o + 2] = on ? b : bb;
        img.data[o + 3] = on ? 170 : 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [flies, colorVar, fallback, day]);

  return (
    <div>
      <div style={{ ...mono, color: `var(${colorVar})`, marginBottom: "0.4rem" }}>{title}</div>
      <div style={{ position: "relative" }}>
        <canvas
          ref={ref}
          width={STAGES_PER_DAY}
          height={NB}
          style={{
            width: "100%",
            height: "110px",
            display: "block",
            imageRendering: "pixelated",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
          }}
          aria-label={`${title}: shaded where the policy prefers to be airborne, by hour of day (horizontal) and battery state of charge (vertical)`}
        />
        <span style={{ ...mono, position: "absolute", left: 6, top: 4, fontSize: "0.6rem" }}>100%</span>
        <span style={{ ...mono, position: "absolute", left: 6, bottom: 4, fontSize: "0.6rem" }}>0%</span>
      </div>
      <div style={{ ...mono, display: "flex", justifyContent: "space-between", fontSize: "0.6rem", marginTop: "0.25rem" }}>
        {["0h", "6h", "12h", "18h", "24h"].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}

// ---------- main ----------

export function MDPDemo() {
  const [siteId, setSiteId] = useState(SITES[0].id);
  const [penalty, setPenalty] = useState(5);
  const [takeoffWind, setTakeoffWind] = useState(5);
  const [landWind, setLandWind] = useState(4);
  const [obsThreshold, setObsThreshold] = useState(0.13);
  const [takeoffSocPct, setTakeoffSocPct] = useState(90);
  const [reservePct, setReservePct] = useState(45);

  const dPenalty = useDeferredValue(penalty);
  const dWind = useDeferredValue(takeoffWind);
  const dLand = useDeferredValue(landWind);
  const dObs = useDeferredValue(obsThreshold);
  const dSoc = useDeferredValue(takeoffSocPct);
  const dRes = useDeferredValue(reservePct);

  const site = SITES.find((s) => s.id === siteId) ?? SITES[0];

  const sol = useMemo(() => solve(site, dPenalty), [site, dPenalty]);

  const opt = useMemo(
    () => monteCarlo(site, (o) => optimalAction(sol, o), dPenalty, TRIALS, SEED),
    [site, sol, dPenalty]
  );

  const th: Thresholds = useMemo(
    () => ({
      takeoffWind: dWind,
      landWind: dLand,
      obsThreshold: dObs,
      takeoffSocWh: (dSoc / 100) * BATTERY_WH,
      reserveWh: (dRes / 100) * BATTERY_WH,
    }),
    [dWind, dLand, dObs, dSoc, dRes]
  );

  const thr = useMemo(
    () => monteCarlo(site, (o) => thresholdAction(th, o), dPenalty, TRIALS, SEED),
    [site, th, dPenalty]
  );

  const optFlies = useMemo(
    () => (k: number, socWh: number) => flyAdvantage(sol, k, Math.round(socWh / BIN_WH)) > 0,
    [sol]
  );
  const thrFlies = useMemo(
    () => (k: number, socWh: number) => whaleProb(k) > th.obsThreshold && socWh > th.reserveWh,
    [th]
  );

  // Solve time differs between server render and client, so only show it after mount.
  const [clientSolveMs, setClientSolveMs] = useState<number | null>(null);
  useEffect(() => setClientSolveMs(sol.solveMs), [sol]);

  const optWins = opt.meanReward >= thr.meanReward;
  const stale =
    penalty !== dPenalty ||
    takeoffWind !== dWind ||
    landWind !== dLand ||
    obsThreshold !== dObs ||
    takeoffSocPct !== dSoc ||
    reservePct !== dRes;

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
      <div style={{ ...mono, padding: "1rem 1.5rem", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <span>Optimal vs. threshold flight planning</span>
        <span style={{ textTransform: "none", letterSpacing: 0 }}>
          {`${MISSION_DAYS.toFixed(2)}-day mission · ${K.toLocaleString()} stages × ${NB} SoC bins${
            clientSolveMs === null ? "" : ` solved in ${clientSolveMs.toFixed(0)} ms`
          }${stale ? " · updating…" : ""}`}
        </span>
      </div>

      <div style={{ padding: "1.25rem 1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "1.25rem", borderBottom: "1px solid var(--color-border)" }}>
        <Control label="Deployment site" value="">
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.8rem", padding: "0.4rem 0.5rem", background: "var(--color-bg-raised)", color: "var(--color-text-bright)", border: "1px solid var(--color-border-bright)", borderRadius: "var(--radius)" }}
          >
            {SITES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.lat}°N)
              </option>
            ))}
          </select>
        </Control>
        <Control label="Failure penalty F" value={penalty.toFixed(0)}>
          <input type="range" min={0} max={40} step={1} value={penalty} onChange={(e) => setPenalty(Number(e.target.value))} style={slider} />
        </Control>
        <Control label="Threshold: take off below wind" value={`${takeoffWind.toFixed(1)} m/s`}>
          <input type="range" min={1} max={12} step={0.5} value={takeoffWind} onChange={(e) => setTakeoffWind(Number(e.target.value))} style={slider} />
        </Control>
        <Control label="Threshold: land below wind" value={`${landWind.toFixed(1)} m/s`}>
          <input type="range" min={1} max={12} step={0.5} value={landWind} onChange={(e) => setLandWind(Number(e.target.value))} style={slider} />
        </Control>
        <Control label="Threshold: fly when whale prob. >" value={obsThreshold.toFixed(2)}>
          <input type="range" min={0} max={0.3} step={0.01} value={obsThreshold} onChange={(e) => setObsThreshold(Number(e.target.value))} style={slider} />
        </Control>
        <Control label="Threshold: take off above SoC" value={`${takeoffSocPct}%`}>
          <input type="range" min={20} max={95} step={5} value={takeoffSocPct} onChange={(e) => setTakeoffSocPct(Number(e.target.value))} style={slider} />
        </Control>
        <Control label="Threshold: end flight at SoC" value={`${reservePct}%`}>
          <input type="range" min={15} max={80} step={5} value={reservePct} onChange={(e) => setReservePct(Number(e.target.value))} style={slider} />
        </Control>
      </div>

      <div style={{ padding: "1.25rem 1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", borderBottom: "1px solid var(--color-border)" }}>
        <Score title="Threshold policy" color="var(--color-user-policy)" r={thr} winner={!optWins} />
        <Score title="Optimal policy (dynamic programming)" color="var(--color-optimal-policy)" r={opt} winner={optWins} />
      </div>

      <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ ...mono, marginBottom: "0.5rem", display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
          <span>One mission, identical weather for both policies</span>
          <span style={{ color: "var(--color-user-policy)" }}>— threshold</span>
          <span style={{ color: "var(--color-optimal-policy)" }}>— optimal</span>
          <span>bars = airborne · × = failure</span>
        </div>
        <EpisodeChart opt={opt} thr={thr} />
      </div>

      <div style={{ padding: "1.25rem 1.5rem" }}>
        <div style={{ ...mono, marginBottom: "0.75rem" }}>When each policy wants to be airborne, by hour of day and state of charge</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem" }}>
          <DayMap title="Threshold · every day" colorVar="--color-user-policy" fallback="#ff6b6b" day={0} flies={thrFlies} />
          <DayMap title="Optimal · day 1" colorVar="--color-optimal-policy" fallback="#51cf66" day={0} flies={optFlies} />
          <DayMap title={`Optimal · day ${Math.round(MISSION_DAYS / 2)}`} colorVar="--color-optimal-policy" fallback="#51cf66" day={Math.round(MISSION_DAYS / 2) - 1} flies={optFlies} />
          <DayMap title={`Optimal · day ${Math.floor(MISSION_DAYS)}`} colorVar="--color-optimal-policy" fallback="#51cf66" day={Math.floor(MISSION_DAYS) - 1} flies={optFlies} />
        </div>
        <div style={{ ...mono, textTransform: "none", letterSpacing: 0, marginTop: "0.75rem", lineHeight: 1.5 }}>
          The threshold rule is a fixed box: whale probability above its threshold and charge above the reserve, wind permitting, the same every day. The optimal policy's region is read from the value function, shaded where the expected future reward of being airborne exceeds that of floating. Its boundary follows the solar day and the whale-sighting profile, and it changes over the mission: an early crash forfeits everything still to come, a late one forfeits little.
        </div>
      </div>

    </div>
  );
}
