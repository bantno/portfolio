/**
 * Finite-horizon MDP for a solar-powered seaplane deciding when to fly.
 *
 * Follows Epstein & Rogers, "Optimal flight planning for marine mammal
 * surveillance from a seaplane UAV" (AIAA J. Aircraft, 2026):
 *   state  s = [SoC, mode], mode ∈ {floating, flying}, terminal "failed"
 *   action a ∈ {takeoff, cruise, land, save-energy}
 *   reward +1 per whale sighting (only while airborne), −F once on failure
 *   solved by backward induction over a 15-minute stage grid.
 *
 * Weather statistics here are representative stand-ins for the paper's
 * ERA5-fitted distributions (clearness index ~ Kumaraswamy instead of Beta,
 * wind ~ Weibull as in the paper). The vehicle energy model is built from
 * the paper's aircraft parameters (Table 2).
 */
import model from "../../data/mdp-model.json";

export const TAKEOFF = 0;
export const CRUISE = 1;
export const LAND = 2;
export const SAVE = 3;
export type Action = 0 | 1 | 2 | 3;

export const FLOATING = 0;
export const FLYING = 1;

export interface Site {
  id: string;
  name: string;
  lat: number;
  clearA: number;
  clearB: number;
  windK: number;
  windLambda: number;
}

export const SITES: Site[] = model.sites;
export const K = model.missionStages;
export const STAGE_H = model.stageMinutes / 60;
export const BATTERY_WH = model.batteryWh;
export const BIN_WH = model.socBinWh;
export const NB = Math.round(BATTERY_WH / BIN_WH) + 1;

// ---------- Vehicle energy model (paper §II.B, Table 2) ----------

function computeEnergy() {
  const a = model.aircraft;
  const g = 9.81;
  const mass = a.dryMassKg + BATTERY_WH / a.batterySpecificWhPerKg;
  const W = mass * g;
  const AR = (a.wingSpanM * a.wingSpanM) / a.wingAreaM2;
  const Kd = 1 / (Math.PI * a.oswald * AR);
  const eta = a.motorEff * a.propEff;
  // Endurance-optimal flight: C_L = sqrt(3 C_D0 / K), C_D = 4 C_D0.
  const CL = Math.sqrt((3 * a.cd0) / Kd);
  const CD = 4 * a.cd0;
  const V = Math.sqrt((2 * W) / (a.airDensity * a.wingAreaM2 * CL));
  const drag = 0.5 * a.airDensity * V * V * a.wingAreaM2 * CD;
  const cruiseW = (drag * V) / eta;
  const stageS = model.stageMinutes * 60;

  const cruiseWh = (cruiseW * stageS) / 3600;
  const liftoffWh = (a.installedPowerW * a.liftoffSeconds) / 3600;
  const climbWh =
    (cruiseW * a.climbSeconds) / 3600 + (W * a.cruiseAltM) / 3600 / eta;
  const cruiseAfterClimbWh =
    (cruiseW * (stageS - a.liftoffSeconds - a.climbSeconds)) / 3600;
  const takeoffWh = liftoffWh + climbWh + cruiseAfterClimbWh;
  const landWh = (cruiseW * a.descentPowerFraction * a.descentSeconds) / 3600;

  return {
    massKg: mass,
    airspeedMs: V,
    cruiseW,
    perAction: [takeoffWh, cruiseWh, landWh, 0] as number[],
  };
}

export const ENERGY = computeEnergy();

// ---------- Environment ----------

function clearSkyWm2(lat: number, dayOfYear: number, hourLocal: number) {
  const rad = Math.PI / 180;
  const decl = 23.44 * rad * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const H = 15 * rad * (hourLocal - 12);
  const phi = lat * rad;
  const cosZ =
    Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  return model.solar.clearSkyWm2 * Math.max(0, cosZ);
}

/** Clear-sky PV energy (Wh) available in stage k at this site. */
export function clearSkyWh(site: Site, k: number) {
  const tMid = (k + 0.5) * STAGE_H;
  const day = model.startDayOfYear + Math.floor(tMid / 24);
  const hour = tMid % 24;
  const g = clearSkyWm2(site.lat, day, hour);
  return g * model.solar.pvAreaM2 * model.solar.pvEff * STAGE_H;
}

/** Kumaraswamy inverse CDF — closed-form stand-in for a Beta clearness index. */
export function clearnessQuantile(site: Site, u: number) {
  return Math.pow(1 - Math.pow(1 - u, 1 / site.clearB), 1 / site.clearA);
}

/** Weibull inverse CDF for wind speed (m/s). */
export function windQuantile(site: Site, u: number) {
  return site.windLambda * Math.pow(-Math.log(1 - Math.min(u, 0.999999)), 1 / site.windK);
}

export function hourOfStage(k: number) {
  return ((k + 0.5) * STAGE_H) % 24;
}

/** Whale observation probability, 12 two-hour strata repeating daily (paper §IV.C). */
export function whaleProb(k: number) {
  return model.whaleProfile2h[Math.floor(hourOfStage(k) / 2)];
}

const sig = (x: number) => 1 / (1 + Math.exp(x));

/** Crash probability for (mode, action) at wind w (paper Eq. 33). */
export function crashProb(mode: number, action: Action, w: number) {
  if (mode === FLOATING) {
    return action === TAKEOFF
      ? sig(model.crash.takeoff.a - model.crash.takeoff.b * w)
      : model.crash.floatP;
  }
  return action === LAND
    ? sig(model.crash.landing.a - model.crash.landing.b * w)
    : model.crash.cruiseP;
}

const QUAD_U = [0.1, 0.3, 0.5, 0.7, 0.9];

// ---------- Backward induction (paper §III.A) ----------

export interface Solution {
  site: Site;
  penalty: number;
  /** V[(k*2+m)*NB + i] for k in 0..K */
  V: Float32Array;
  solveMs: number;
}

const vIdx = (k: number, m: number, i: number) => (k * 2 + m) * NB + i;

/** Value of being airborne minus value of floating, for stage k and SoC bin i (paper Fig. 10). */
export function flyAdvantage(sol: Solution, k: number, i: number) {
  return sol.V[vIdx(k, FLYING, i)] - sol.V[vIdx(k, FLOATING, i)];
}

/**
 * Backward induction. The controller measures the stage's wind and solar
 * income before it acts (paper Eq. 21), so the expectation is taken over the
 * weather *outside* the maximization: V_k(s) = E_w[ max_a Q_k(s, a, w) ].
 * This makes the stored value function exactly consistent with the runtime
 * rule, and the resulting policy optimal among all policies that use the
 * same measurements, the threshold controller included.
 */
export function solve(site: Site, penalty: number): Solution {
  const t0 = performance.now();
  const V = new Float32Array((K + 1) * 2 * NB);
  const nq = QUAD_U.length;
  const wq = 1 / (nq * nq);

  const windSamples = QUAD_U.map((u) => windQuantile(site, u));
  const clearSamples = QUAD_U.map((u) => clearnessQuantile(site, u));

  // Crash probability per (mode, action, wind sample).
  const pc: number[][][] = [0, 1].map((m) =>
    [TAKEOFF, CRUISE, LAND, SAVE].map((a) => windSamples.map((w) => crashProb(m, a as Action, w)))
  );

  const solarE = new Array<number>(nq);

  for (let k = K - 1; k >= 0; k--) {
    const cs = clearSkyWh(site, k);
    for (let j = 0; j < nq; j++) solarE[j] = cs * clearSamples[j];
    const O = whaleProb(k);
    const vNextFly = (k + 1) * 2 * NB + FLYING * NB;
    const vNextFloat = (k + 1) * 2 * NB + FLOATING * NB;

    for (let m = 0; m < 2; m++) {
      const aAir: Action = m === FLOATING ? TAKEOFF : CRUISE; // airborne next
      const aDown: Action = m === FLOATING ? SAVE : LAND; // floating next
      const eAir = ENERGY.perAction[aAir];
      const eDown = ENERGY.perAction[aDown];
      for (let i = 0; i < NB; i++) {
        const soc = i * BIN_WH;
        let acc = 0;
        for (let j = 0; j < nq; j++) {
          const sE = solarE[j];
          // Energy outcomes are deterministic given the measured solar income.
          const eA = soc - eAir + sE;
          const eD = soc - eDown + sE;
          const iA = eA < 0 ? -1 : Math.round(Math.min(eA, BATTERY_WH) / BIN_WH);
          const iD = eD < 0 ? -1 : Math.round(Math.min(eD, BATTERY_WH) / BIN_WH);
          for (let l = 0; l < nq; l++) {
            const pA = pc[m][aAir][l];
            const pD = pc[m][aDown][l];
            const qAir =
              iA < 0 ? O - penalty : O - pA * penalty + (1 - pA) * V[vNextFly + iA];
            const qDown =
              iD < 0 ? -penalty : -pD * penalty + (1 - pD) * V[vNextFloat + iD];
            acc += qAir > qDown ? qAir : qDown;
          }
        }
        V[vIdx(k, m, i)] = acc * wq;
      }
    }
  }

  return { site, penalty, V, solveMs: performance.now() - t0 };
}

// ---------- Policies ----------

export interface Obs {
  k: number;
  mode: number;
  socWh: number;
  wind: number;
  solarWh: number;
}

/** Optimal action from the stored value function with measured weather (paper Eq. 21–22). */
export function optimalAction(sol: Solution, o: Obs): Action {
  const actions: Action[] = o.mode === FLOATING ? [TAKEOFF, SAVE] : [CRUISE, LAND];
  const O = whaleProb(o.k);
  let best: Action = actions[0];
  let bestVal = -Infinity;
  for (const a of actions) {
    const airborne = a === TAKEOFF || a === CRUISE;
    let e = o.socWh - ENERGY.perAction[a] + o.solarWh;
    let val: number;
    if (e < 0) {
      val = (airborne ? O : 0) - sol.penalty;
    } else {
      if (e > BATTERY_WH) e = BATTERY_WH;
      const pc = crashProb(o.mode, a, o.wind);
      const mNext = airborne ? FLYING : FLOATING;
      val =
        (airborne ? O : 0) -
        pc * sol.penalty +
        (1 - pc) * sol.V[vIdx(o.k + 1, mNext, Math.round(e / BIN_WH))];
    }
    if (val > bestVal) {
      bestVal = val;
      best = a;
    }
  }
  return best;
}

export interface Thresholds {
  takeoffWind: number; // m/s: take off only below this
  landWind: number; // m/s: end a flight only below this (a low battery overrides)
  obsThreshold: number; // whale probability needed to fly
  takeoffSocWh: number; // Wh needed to take off
  reserveWh: number; // Wh at which a flight is ended
}

/**
 * Threshold controller, a generalization of the paper's (§III.B, Eqs. 23–25).
 * Floating: take off when wind < w_T, whale probability > O_T and SoC > SoC_T.
 * Flying: keep cruising while whale probability > O_T, wind < w_T and SoC is
 * above the reserve; otherwise the flight is over and the vehicle lands at the
 * first stage with wind < w_L. At SoC_low — one more cruise stage plus a
 * landing — it lands whatever the wind. The paper's rule is the special case
 * w_L = w_T − 3 m/s with the reserve equal to SoC_low.
 */
export const SOC_LOW_WH = ENERGY.perAction[CRUISE] + ENERGY.perAction[LAND];

export function thresholdAction(th: Thresholds, o: Obs): Action {
  const O = whaleProb(o.k);
  if (o.mode === FLOATING) {
    return o.wind < th.takeoffWind && O > th.obsThreshold && o.socWh > th.takeoffSocWh
      ? TAKEOFF
      : SAVE;
  }
  if (o.socWh <= SOC_LOW_WH) return LAND;
  if (O > th.obsThreshold && o.wind < th.takeoffWind && o.socWh > th.reserveWh) return CRUISE;
  return o.wind < th.landWind ? LAND : CRUISE;
}

// ---------- Monte Carlo ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Episode {
  soc: Float32Array; // Wh per stage (NaN after failure)
  airborne: Uint8Array;
  sightings: number;
  failedAt: number; // -1 if survived
  flightStages: number;
  totalReward: number;
}

export type PolicyFn = (o: Obs) => Action;

export function runEpisode(
  site: Site,
  policy: PolicyFn,
  penalty: number,
  seed: number,
  record = false
): Episode {
  const rnd = mulberry32(seed);
  const soc = record ? new Float32Array(K) : new Float32Array(0);
  const airborne = record ? new Uint8Array(K) : new Uint8Array(0);
  let socWh = BATTERY_WH;
  let mode = FLOATING;
  let sightings = 0;
  let flightStages = 0;
  let failedAt = -1;

  for (let k = 0; k < K; k++) {
    const uClear = rnd();
    const uWind = rnd();
    const uWhale = rnd();
    const uCrash = rnd();
    if (failedAt >= 0) {
      if (record) soc[k] = NaN;
      continue;
    }
    const wind = windQuantile(site, uWind);
    const solarWh = clearSkyWh(site, k) * clearnessQuantile(site, uClear);
    const a = policy({ k, mode, socWh, wind, solarWh });
    const isAir = a === TAKEOFF || a === CRUISE;
    if (isAir) {
      flightStages++;
      if (uWhale < whaleProb(k)) sightings++;
    }
    let e = socWh - ENERGY.perAction[a] + solarWh;
    if (e < 0 || uCrash < crashProb(mode, a, wind)) {
      failedAt = k;
      if (record) {
        soc[k] = Math.max(0, e);
        airborne[k] = isAir ? 1 : 0;
      }
      continue;
    }
    socWh = Math.min(BATTERY_WH, e);
    mode = isAir ? FLYING : FLOATING;
    if (record) {
      soc[k] = socWh;
      airborne[k] = isAir ? 1 : 0;
    }
  }
  return {
    soc,
    airborne,
    sightings,
    failedAt,
    flightStages,
    totalReward: sightings - (failedAt >= 0 ? penalty : 0),
  };
}

export interface MonteCarlo {
  trials: number;
  meanSightings: number;
  failurePct: number;
  meanFailureDay: number | null;
  flightHoursPerDay: number;
  meanReward: number;
  example: Episode;
}

export function monteCarlo(
  site: Site,
  policy: PolicyFn,
  penalty: number,
  trials: number,
  baseSeed = 1
): MonteCarlo {
  let sumS = 0;
  let fails = 0;
  let sumFailStage = 0;
  let sumFlight = 0;
  let sumR = 0;
  let example: Episode | null = null;
  for (let t = 0; t < trials; t++) {
    const ep = runEpisode(site, policy, penalty, baseSeed + t, t === 0);
    if (t === 0) example = ep;
    sumS += ep.sightings;
    sumR += ep.totalReward;
    sumFlight += ep.flightStages;
    if (ep.failedAt >= 0) {
      fails++;
      sumFailStage += ep.failedAt;
    }
  }
  const days = (K * STAGE_H) / 24;
  return {
    trials,
    meanSightings: sumS / trials,
    failurePct: (100 * fails) / trials,
    meanFailureDay: fails ? (sumFailStage / fails) * STAGE_H / 24 : null,
    flightHoursPerDay: (sumFlight / trials) * STAGE_H / days,
    meanReward: sumR / trials,
    example: example!,
  };
}
