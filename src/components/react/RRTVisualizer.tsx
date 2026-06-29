import { useState, useCallback, useRef, useEffect } from "react";
import obstacleData from "../../data/obstacle-field.json";

interface Point {
  x: number;
  y: number;
}

// Spherical obstacle (rendered as a circle in this 2D vertical slice), matching
// the OMPL planner's distance-to-center collision model.
interface Obstacle {
  x: number;
  y: number;
  r: number;
}

interface TreeNode {
  x: number;
  y: number;
  parentIdx: number | null;
  cost: number;
}

// Mirrors path_planner_base.py: RRTstar(setRange=1.0, setGoalBias=0.1),
// path-length optimization with rewiring, then cubic-Bézier smoothing.
const STEP_SIZE = 25; // planner extension range
const GOAL_BIAS = 0.1;
const GOAL_RADIUS = 18; // acceptance ball around the approach point
const REWIRE_RADIUS = 50;
const NODES_PER_FRAME = 3;
const MAX_NODES = 1400;
const BEZIER_SAMPLES = 24; // samples per cubic-Bézier segment

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Distance from circle center to segment p1->p2; collision if <= radius.
function segmentIntersectsCircle(p1: Point, p2: Point, obs: Obstacle): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((obs.x - p1.x) * dx + (obs.y - p1.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + t * dx;
  const py = p1.y + t * dy;
  return distance({ x: px, y: py }, obs) <= obs.r;
}

function isCollisionFree(
  p1: Point,
  p2: Point,
  obstacles: Obstacle[]
): boolean {
  return !obstacles.some((obs) => segmentIntersectsCircle(p1, p2, obs));
}

function steer(from: Point, to: Point, stepSize: number): Point {
  const d = distance(from, to);
  if (d <= stepSize) return to;
  const t = stepSize / d;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function nearestIdx(tree: TreeNode[], point: Point): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < tree.length; i++) {
    const d = distance(tree[i], point);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function tracePath(tree: TreeNode[], goalIdx: number): number[] {
  const path: number[] = [];
  let idx: number | null = goalIdx;
  while (idx !== null) {
    path.unshift(idx);
    idx = tree[idx].parentIdx;
  }
  return path;
}

// Port of compute_bezier_points: one cubic Bézier segment.
function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < BEZIER_SAMPLES; i++) {
    const t = i / (BEZIER_SAMPLES - 1);
    const mt = 1 - t;
    pts.push({
      x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
      y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
    });
  }
  return pts;
}

// Port of smooth_with_bezier: walk the path in groups of four control points,
// fitting a cubic Bézier to each (indices clamped to the last point).
function smoothWithBezier(points: Point[]): Point[] {
  const N = points.length;
  if (N < 4) return points;
  const out: Point[] = [];
  for (let i = 0; i < N - 1; i += 3) {
    const p0 = points[i];
    const p1 = points[Math.min(i + 1, N - 1)];
    const p2 = points[Math.min(i + 2, N - 1)];
    const p3 = points[Math.min(i + 3, N - 1)];
    out.push(...cubicBezier(p0, p1, p2, p3));
  }
  return out;
}

export function RRTVisualizer() {
  const { bounds, start, target, approachOffset, targetRadius } = obstacleData;

  // The planner aims at a point ABOVE the target (goal_above in the source),
  // never the target itself; the target body is an obstacle to keep clear of.
  const approachPoint: Point = { x: target.x, y: target.y - approachOffset };
  const targetBody: Obstacle = { x: target.x, y: target.y, r: targetRadius };

  const [obstacles, setObstacles] = useState<Obstacle[]>([
    ...obstacleData.obstacles,
  ]);
  const [tree, setTree] = useState<TreeNode[]>([
    { x: start.x, y: start.y, parentIdx: null, cost: 0 },
  ]);
  const [goalPath, setGoalPath] = useState<number[]>([]);
  const [smoothPath, setSmoothPath] = useState<Point[]>([]);
  const [running, setRunning] = useState(false);
  const [iterations, setIterations] = useState(0);
  const [placing, setPlacing] = useState(false);

  const treeRef = useRef(tree);
  const runningRef = useRef(running);

  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const step = useCallback(() => {
    if (!runningRef.current) return;

    // Collision set: world obstacles plus the target body (so the tree avoids
    // the drone itself and is forced to come in from above it).
    const collisionObs = [...obstacles, targetBody];
    const currentTree = [...treeRef.current];
    let foundGoal = false;

    for (let n = 0; n < NODES_PER_FRAME; n++) {
      // Sample, biased toward the approach point above the target.
      const sample: Point =
        Math.random() < GOAL_BIAS
          ? approachPoint
          : {
              x: Math.random() * bounds.width,
              y: Math.random() * bounds.height,
            };

      const nearIdx = nearestIdx(currentTree, sample);
      const nearest = currentTree[nearIdx];
      const newPoint = steer(nearest, sample, STEP_SIZE);

      if (!isCollisionFree(nearest, newPoint, collisionObs)) continue;

      // Choose-parent: lowest-cost collision-free connection within radius.
      let bestParent = nearIdx;
      let bestCost = nearest.cost + distance(nearest, newPoint);

      for (let i = 0; i < currentTree.length; i++) {
        if (i === nearIdx) continue;
        const d = distance(currentTree[i], newPoint);
        if (d < REWIRE_RADIUS) {
          const potentialCost = currentTree[i].cost + d;
          if (
            potentialCost < bestCost &&
            isCollisionFree(currentTree[i], newPoint, collisionObs)
          ) {
            bestParent = i;
            bestCost = potentialCost;
          }
        }
      }

      const newIdx = currentTree.length;
      currentTree.push({
        x: newPoint.x,
        y: newPoint.y,
        parentIdx: bestParent,
        cost: bestCost,
      });

      // Rewire neighbors through the new node where it lowers their cost.
      for (let i = 0; i < currentTree.length - 1; i++) {
        const d = distance(currentTree[i], newPoint);
        if (d < REWIRE_RADIUS) {
          const potentialCost = bestCost + d;
          if (
            potentialCost < currentTree[i].cost &&
            isCollisionFree(newPoint, currentTree[i], collisionObs)
          ) {
            currentTree[i] = { ...currentTree[i], parentIdx: newIdx, cost: potentialCost };
          }
        }
      }

      if (distance(newPoint, approachPoint) < GOAL_RADIUS) {
        foundGoal = true;
      }
    }

    treeRef.current = currentTree;
    setTree([...currentTree]);
    setIterations((prev) => prev + NODES_PER_FRAME);

    if (foundGoal) {
      // Lowest-cost node inside the approach ball.
      let bestGoalIdx = 0;
      let bestGoalCost = Infinity;
      for (let i = 0; i < currentTree.length; i++) {
        const d = distance(currentTree[i], approachPoint);
        if (d < GOAL_RADIUS && currentTree[i].cost < bestGoalCost) {
          bestGoalCost = currentTree[i].cost;
          bestGoalIdx = i;
        }
      }
      const idxPath = tracePath(currentTree, bestGoalIdx);

      // isPathValid: accept only if the final state is above the target.
      const lastNode = currentTree[bestGoalIdx];
      if (lastNode.y < target.y) {
        setGoalPath(idxPath);
        // Append the actual target, then cubic-Bézier smooth the result —
        // the smoothed curve dives onto the target from the approach point.
        const pathPts: Point[] = idxPath.map((i) => ({
          x: currentTree[i].x,
          y: currentTree[i].y,
        }));
        pathPts.push({ x: target.x, y: target.y });
        setSmoothPath(smoothWithBezier(pathPts));
      }
    }

    if (currentTree.length < MAX_NODES) {
      requestAnimationFrame(step);
    } else {
      setRunning(false);
    }
  }, [obstacles, approachPoint, targetBody, target, bounds]);

  const handleRun = useCallback(() => {
    setRunning(true);
    runningRef.current = true;
    requestAnimationFrame(step);
  }, [step]);

  const handleReset = useCallback(() => {
    setRunning(false);
    runningRef.current = false;
    setTree([{ x: start.x, y: start.y, parentIdx: null, cost: 0 }]);
    setGoalPath([]);
    setSmoothPath([]);
    setIterations(0);
  }, [start]);

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!placing || running) return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const scaleX = bounds.width / rect.width;
      const scaleY = bounds.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      setObstacles((prev) => [...prev, { x, y, r: 45 }]);
      handleReset();
    },
    [placing, running, bounds, handleReset]
  );

  const smoothD =
    smoothPath.length > 1
      ? "M " + smoothPath.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")
      : "";

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
          RRT* + Bézier · capture from above
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
          }}
        >
          {tree.length} nodes | {iterations} samples
        </div>
      </div>

      {/* SVG */}
      <svg
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        style={{
          width: "100%",
          height: "auto",
          background: "var(--color-bg-raised)",
          display: "block",
          cursor: placing && !running ? "crosshair" : "default",
        }}
        onClick={handleSvgClick}
      >
        {/* Spherical obstacles */}
        {obstacles.map((obs, i) => (
          <circle
            key={i}
            cx={obs.x}
            cy={obs.y}
            r={obs.r}
            fill="var(--color-border-bright)"
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        ))}

        {/* Tree edges */}
        {tree.map(
          (node, i) =>
            node.parentIdx !== null && (
              <line
                key={i}
                x1={tree[node.parentIdx].x}
                y1={tree[node.parentIdx].y}
                x2={node.x}
                y2={node.y}
                stroke="var(--color-text-muted)"
                strokeWidth={0.5}
                opacity={0.3}
              />
            )
        )}

        {/* Raw RRT* solution (pre-smoothing) */}
        {goalPath.length > 1 &&
          goalPath.slice(1).map((idx, i) => (
            <line
              key={`p-${i}`}
              x1={tree[goalPath[i]].x}
              y1={tree[goalPath[i]].y}
              x2={tree[idx].x}
              y2={tree[idx].y}
              stroke="var(--color-text-muted)"
              strokeWidth={1.5}
              strokeDasharray="5,5"
              opacity={0.7}
            />
          ))}

        {/* Smoothed (executed) Bézier trajectory */}
        {smoothD && (
          <path
            d={smoothD}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Start */}
        <circle
          cx={start.x}
          cy={start.y}
          r={10}
          fill="var(--color-status-active)"
          stroke="var(--color-bg)"
          strokeWidth={2}
        />
        <text
          x={start.x}
          y={start.y - 16}
          textAnchor="middle"
          fill="var(--color-status-active)"
          fontSize={11}
          fontFamily="var(--font-mono)"
          fontWeight={600}
        >
          START
        </text>

        {/* Approach point above the target (the planner's actual goal) */}
        <circle
          cx={approachPoint.x}
          cy={approachPoint.y}
          r={GOAL_RADIUS}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeDasharray="4,4"
        />
        <text
          x={approachPoint.x}
          y={approachPoint.y - GOAL_RADIUS - 6}
          textAnchor="middle"
          fill="var(--color-accent)"
          fontSize={11}
          fontFamily="var(--font-mono)"
          fontWeight={600}
        >
          APPROACH
        </text>

        {/* Vertical guide from approach point down onto the target */}
        <line
          x1={approachPoint.x}
          y1={approachPoint.y}
          x2={target.x}
          y2={target.y}
          stroke="var(--color-accent)"
          strokeWidth={1}
          strokeDasharray="2,4"
          opacity={0.5}
        />

        {/* Target drone (obstacle body — approached from above) */}
        <circle
          cx={target.x}
          cy={target.y}
          r={targetRadius}
          fill="var(--color-accent)"
          opacity={0.25}
          stroke="var(--color-accent)"
          strokeWidth={1.5}
        />
        <circle cx={target.x} cy={target.y} r={5} fill="var(--color-accent)" />
        <text
          x={target.x}
          y={target.y + targetRadius + 16}
          textAnchor="middle"
          fill="var(--color-accent)"
          fontSize={11}
          fontFamily="var(--font-mono)"
          fontWeight={600}
        >
          TARGET
        </text>
      </svg>

      {/* Controls */}
      <div
        style={{
          padding: "1rem 1.5rem",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={handleRun}
          disabled={running}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            fontWeight: 600,
            padding: "0.5rem 1.25rem",
            border: "1px solid var(--color-accent)",
            borderRadius: "var(--radius)",
            background: running ? "transparent" : "var(--color-accent)",
            color: running ? "var(--color-text-muted)" : "var(--color-bg)",
            cursor: running ? "default" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {running ? "Running..." : "Run"}
        </button>
        <button
          onClick={handleReset}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            padding: "0.5rem 1.25rem",
            border: "1px solid var(--color-border-bright)",
            borderRadius: "var(--radius)",
            background: "transparent",
            color: "var(--color-text-bright)",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          Reset
        </button>
        <button
          onClick={() => setPlacing(!placing)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            padding: "0.5rem 1.25rem",
            border: `1px solid ${placing ? "var(--color-accent)" : "var(--color-border-bright)"}`,
            borderRadius: "var(--radius)",
            background: placing ? "var(--color-bg-card-hover)" : "transparent",
            color: placing
              ? "var(--color-accent)"
              : "var(--color-text-bright)",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {placing ? "Done placing" : "Add obstacles"}
        </button>
        {smoothPath.length > 1 && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              color: "var(--color-status-active)",
              marginLeft: "auto",
            }}
          >
            ✓ Path found · Bézier-smoothed, approaching from above
          </span>
        )}
      </div>
    </div>
  );
}
