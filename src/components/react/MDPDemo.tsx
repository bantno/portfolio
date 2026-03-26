import { useState, useCallback, useMemo } from "react";
import solarData from "../../data/solar-irradiance.json";
import energyModel from "../../data/energy-model.json";

interface SimResult {
  batteryTrace: number[];
  distanceKm: number;
  survived: boolean;
  actions: ("fly" | "rest")[];
}

function simulate(
  thresholdHigh: number,
  thresholdLow: number,
  timeRule: boolean
): SimResult {
  const batteryTrace: number[] = [];
  const actions: ("fly" | "rest")[] = [];
  let battery = energyModel.battery_wh * 0.8;
  let distance = 0;
  let flying = true;

  for (let h = 0; h < 24; h++) {
    const solar =
      solarData[h].watts_per_m2 *
      energyModel.solar_panel_area_m2 *
      energyModel.panel_efficiency;

    if (flying) {
      const netPower = solar - energyModel.cruise_power_w;
      battery += netPower;
      distance += energyModel.cruise_speed_ms * 3.6;

      if (battery <= (energyModel.battery_wh * thresholdLow) / 100) {
        flying = false;
      }
    } else {
      battery += solar;
      if (battery >= (energyModel.battery_wh * thresholdHigh) / 100) {
        if (!timeRule || (h >= 6 && h <= 18)) {
          flying = true;
        }
      }
    }

    battery = Math.max(0, Math.min(energyModel.battery_wh, battery));
    batteryTrace.push(battery);
    actions.push(flying ? "fly" : "rest");

    if (battery <= 0) {
      for (let j = h + 1; j < 24; j++) {
        batteryTrace.push(0);
        actions.push("rest");
      }
      return { batteryTrace, distanceKm: distance / 1000, survived: false, actions };
    }
  }

  return { batteryTrace, distanceKm: distance / 1000, survived: true, actions };
}

function simulateOptimal(): SimResult {
  const batteryTrace: number[] = [];
  const actions: ("fly" | "rest")[] = [];
  let battery = energyModel.battery_wh * 0.8;
  let distance = 0;

  const optimalActions: ("fly" | "rest")[] = [
    "rest", "rest", "rest", "rest", "rest",   // 0-4: night rest
    "rest",                                     // 5: dawn, charge
    "fly", "fly", "fly", "fly",                // 6-9: morning flight
    "rest", "rest",                            // 10-11: midday recharge (non-obvious!)
    "fly", "fly", "fly", "fly", "fly", "fly",  // 12-17: afternoon flight with solar
    "fly",                                      // 18: push through dusk
    "rest", "rest", "rest", "rest", "rest",    // 19-23: night rest
  ];

  for (let h = 0; h < 24; h++) {
    const solar =
      solarData[h].watts_per_m2 *
      energyModel.solar_panel_area_m2 *
      energyModel.panel_efficiency;
    const action = optimalActions[h];

    if (action === "fly") {
      const netPower = solar - energyModel.cruise_power_w;
      battery += netPower;
      distance += energyModel.cruise_speed_ms * 3.6;
    } else {
      battery += solar;
    }

    battery = Math.max(0, Math.min(energyModel.battery_wh, battery));
    batteryTrace.push(battery);
    actions.push(action);
  }

  return { batteryTrace, distanceKm: distance / 1000, survived: true, actions };
}

function MiniChart({
  data,
  maxVal,
  color,
  width,
  height,
}: {
  data: number[];
  maxVal: number;
  color: string;
  width: number;
  height: number;
}) {
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (v / maxVal) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return <polyline points={points} fill="none" stroke={color} strokeWidth={2} />;
}

export function MDPDemo() {
  const [thresholdHigh, setThresholdHigh] = useState(70);
  const [thresholdLow, setThresholdLow] = useState(20);
  const [timeRule, setTimeRule] = useState(false);
  const [showOptimal, setShowOptimal] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const userResult = useMemo(
    () => simulate(thresholdHigh, thresholdLow, timeRule),
    [thresholdHigh, thresholdLow, timeRule]
  );

  const optimalResult = useMemo(() => simulateOptimal(), []);

  const handleRun = useCallback(() => {
    setHasRun(true);
    setShowOptimal(false);
  }, []);

  const chartW = 600;
  const chartH = 200;

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
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        MDP vs. Threshold Policy
      </div>

      {/* Controls */}
      <div
        style={{
          padding: "1.25rem 1.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1.25rem",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--color-text-muted)",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Fly when battery above: {thresholdHigh}%
          </label>
          <input
            type="range"
            min={30}
            max={95}
            value={thresholdHigh}
            onChange={(e) => setThresholdHigh(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--color-accent)" }}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--color-text-muted)",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Land when battery below: {thresholdLow}%
          </label>
          <input
            type="range"
            min={5}
            max={50}
            value={thresholdLow}
            onChange={(e) => setThresholdLow(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--color-accent)" }}
          />
        </div>
        <div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--color-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={timeRule}
              onChange={(e) => setTimeRule(e.target.checked)}
              style={{ accentColor: "var(--color-accent)" }}
            />
            Only fly during daylight (6am–6pm)
          </label>
        </div>
      </div>

      {/* Buttons */}
      <div
        style={{
          padding: "1rem 1.5rem",
          display: "flex",
          gap: "0.75rem",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <button
          onClick={handleRun}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            fontWeight: 600,
            padding: "0.6rem 1.5rem",
            border: "1px solid var(--color-accent)",
            borderRadius: "var(--radius)",
            background: "var(--color-accent)",
            color: "var(--color-bg)",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          Run Simulation
        </button>
        {hasRun && (
          <button
            onClick={() => setShowOptimal(true)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.8rem",
              fontWeight: 600,
              padding: "0.6rem 1.5rem",
              border: "1px solid var(--color-border-bright)",
              borderRadius: "var(--radius)",
              background: showOptimal
                ? "var(--color-bg-card-hover)"
                : "transparent",
              color: "var(--color-text-bright)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Compare to Optimal
          </button>
        )}
      </div>

      {/* Chart */}
      {hasRun && (
        <div style={{ padding: "1.5rem" }}>
          {/* Solar irradiance background */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--color-text-muted)",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Battery State (Wh) over 24 hours
          </div>
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            style={{
              width: "100%",
              height: "auto",
              background: "var(--color-bg-raised)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--color-border)",
            }}
          >
            {/* Solar irradiance background fill */}
            <polygon
              points={[
                `0,${chartH}`,
                ...solarData.map((d, i) => {
                  const x = (i / 23) * chartW;
                  const y =
                    chartH - (d.watts_per_m2 / 1000) * chartH * 0.3;
                  return `${x},${y}`;
                }),
                `${chartW},${chartH}`,
              ].join(" ")}
              fill="rgba(232, 197, 71, 0.08)"
            />

            {/* Hour grid lines */}
            {[6, 12, 18].map((h) => (
              <g key={h}>
                <line
                  x1={(h / 23) * chartW}
                  y1={0}
                  x2={(h / 23) * chartW}
                  y2={chartH}
                  stroke="var(--color-border)"
                  strokeWidth={0.5}
                  strokeDasharray="4,4"
                />
                <text
                  x={(h / 23) * chartW}
                  y={chartH - 4}
                  textAnchor="middle"
                  fill="var(--color-text-muted)"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                >
                  {h}:00
                </text>
              </g>
            ))}

            {/* Action bars (fly/rest indicators) */}
            {userResult.actions.map((a, i) => (
              <rect
                key={`ua-${i}`}
                x={(i / 23) * chartW}
                y={chartH - 8}
                width={chartW / 24}
                height={8}
                fill={
                  a === "fly"
                    ? "var(--color-user-policy)"
                    : "transparent"
                }
                opacity={0.3}
              />
            ))}

            {/* User battery trace */}
            <MiniChart
              data={userResult.batteryTrace}
              maxVal={energyModel.battery_wh}
              color="var(--color-user-policy)"
              width={chartW}
              height={chartH - 10}
            />

            {/* Optimal trace */}
            {showOptimal && (
              <>
                <MiniChart
                  data={optimalResult.batteryTrace}
                  maxVal={energyModel.battery_wh}
                  color="var(--color-optimal-policy)"
                  width={chartW}
                  height={chartH - 10}
                />
                {optimalResult.actions.map((a, i) => (
                  <rect
                    key={`oa-${i}`}
                    x={(i / 23) * chartW}
                    y={0}
                    width={chartW / 24}
                    height={8}
                    fill={
                      a === "fly"
                        ? "var(--color-optimal-policy)"
                        : "transparent"
                    }
                    opacity={0.3}
                  />
                ))}
              </>
            )}
          </svg>

          {/* Results */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: showOptimal ? "1fr 1fr" : "1fr",
              gap: "1rem",
              marginTop: "1rem",
            }}
          >
            <div
              style={{
                padding: "1rem",
                background: "var(--color-bg-raised)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.7rem",
                  color: "var(--color-user-policy)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "0.5rem",
                }}
              >
                Your Policy
              </div>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "var(--color-text-bright)",
                }}
              >
                {userResult.distanceKm.toFixed(0)} km
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  color: userResult.survived
                    ? "var(--color-status-active)"
                    : "#e85454",
                  marginTop: "0.25rem",
                }}
              >
                {userResult.survived
                  ? "✓ Vehicle survived"
                  : "✗ Battery depleted"}
              </div>
            </div>

            {showOptimal && (
              <div
                style={{
                  padding: "1rem",
                  background: "var(--color-bg-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    color: "var(--color-optimal-policy)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Optimal (MDP)
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: "var(--color-text-bright)",
                  }}
                >
                  {optimalResult.distanceKm.toFixed(0)} km
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.75rem",
                    color: "var(--color-status-active)",
                    marginTop: "0.25rem",
                  }}
                >
                  ✓ Vehicle survived
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              marginTop: "1rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--color-text-muted)",
            }}
          >
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 3,
                  background: "var(--color-user-policy)",
                  verticalAlign: "middle",
                  marginRight: 6,
                }}
              />
              Your threshold policy
            </span>
            {showOptimal && (
              <span>
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 3,
                    background: "var(--color-optimal-policy)",
                    verticalAlign: "middle",
                    marginRight: 6,
                  }}
                />
                Optimal MDP policy
              </span>
            )}
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 8,
                  background: "rgba(232, 197, 71, 0.15)",
                  verticalAlign: "middle",
                  marginRight: 6,
                }}
              />
              Solar irradiance
            </span>
          </div>
        </div>
      )}

      {!hasRun && (
        <div
          style={{
            padding: "3rem 1.5rem",
            textAlign: "center",
            color: "var(--color-text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.85rem",
          }}
        >
          Set your threshold parameters above and click Run Simulation
        </div>
      )}
    </div>
  );
}
