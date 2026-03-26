import { useState, useCallback, useRef, useEffect } from "react";
import obstacleData from "../../data/obstacle-field.json";

interface Point {
  x: number;
  y: number;
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TreeNode {
  x: number;
  y: number;
  parentIdx: number | null;
  cost: number;
}

const STEP_SIZE = 25;
const GOAL_RADIUS = 20;
const REWIRE_RADIUS = 50;
const NODES_PER_FRAME = 3;

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function segmentIntersectsRect(
  p1: Point,
  p2: Point,
  obs: Obstacle
): boolean {
  const steps = Math.ceil(distance(p1, p2) / 3);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = p1.x + (p2.x - p1.x) * t;
    const y = p1.y + (p2.y - p1.y) * t;
    if (
      x >= obs.x &&
      x <= obs.x + obs.width &&
      y >= obs.y &&
      y <= obs.y + obs.height
    ) {
      return true;
    }
  }
  return false;
}

function isCollisionFree(
  p1: Point,
  p2: Point,
  obstacles: Obstacle[]
): boolean {
  return !obstacles.some((obs) => segmentIntersectsRect(p1, p2, obs));
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

export function RRTVisualizer() {
  const { bounds, start, goal: defaultGoal } = obstacleData;
  const [obstacles, setObstacles] = useState<Obstacle[]>([
    ...obstacleData.obstacles,
  ]);
  const [tree, setTree] = useState<TreeNode[]>([
    { x: start.x, y: start.y, parentIdx: null, cost: 0 },
  ]);
  const [goalPath, setGoalPath] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [iterations, setIterations] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [goalPos] = useState<Point>(defaultGoal);

  const treeRef = useRef(tree);
  const runningRef = useRef(running);
  const iterRef = useRef(iterations);

  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    iterRef.current = iterations;
  }, [iterations]);

  const step = useCallback(() => {
    if (!runningRef.current) return;

    const currentTree = [...treeRef.current];
    let foundGoal = false;

    for (let n = 0; n < NODES_PER_FRAME; n++) {
      // Bias toward goal 10% of the time
      const sample: Point =
        Math.random() < 0.1
          ? goalPos
          : {
              x: Math.random() * bounds.width,
              y: Math.random() * bounds.height,
            };

      const nearIdx = nearestIdx(currentTree, sample);
      const nearest = currentTree[nearIdx];
      const newPoint = steer(nearest, sample, STEP_SIZE);

      if (!isCollisionFree(nearest, newPoint, obstacles)) continue;

      // Find nearby nodes for rewiring
      let bestParent = nearIdx;
      let bestCost = nearest.cost + distance(nearest, newPoint);

      for (let i = 0; i < currentTree.length; i++) {
        if (i === nearIdx) continue;
        const d = distance(currentTree[i], newPoint);
        if (d < REWIRE_RADIUS) {
          const potentialCost = currentTree[i].cost + d;
          if (
            potentialCost < bestCost &&
            isCollisionFree(currentTree[i], newPoint, obstacles)
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

      // Rewire existing nodes
      for (let i = 0; i < currentTree.length - 1; i++) {
        const d = distance(currentTree[i], newPoint);
        if (d < REWIRE_RADIUS) {
          const potentialCost = bestCost + d;
          if (
            potentialCost < currentTree[i].cost &&
            isCollisionFree(newPoint, currentTree[i], obstacles)
          ) {
            currentTree[i] = { ...currentTree[i], parentIdx: newIdx, cost: potentialCost };
          }
        }
      }

      if (distance(newPoint, goalPos) < GOAL_RADIUS) {
        foundGoal = true;
      }
    }

    treeRef.current = currentTree;
    setTree([...currentTree]);
    setIterations((prev) => prev + NODES_PER_FRAME);

    if (foundGoal) {
      // Find the node closest to goal
      let bestGoalIdx = 0;
      let bestGoalDist = Infinity;
      for (let i = 0; i < currentTree.length; i++) {
        const d = distance(currentTree[i], goalPos);
        if (d < GOAL_RADIUS && d < bestGoalDist) {
          bestGoalDist = d;
          bestGoalIdx = i;
        }
      }
      setGoalPath(tracePath(currentTree, bestGoalIdx));
    }

    if (currentTree.length < 1200) {
      requestAnimationFrame(step);
    } else {
      setRunning(false);
    }
  }, [obstacles, goalPos, bounds]);

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
    setIterations(0);
  }, [start]);

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!placing || running) return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const scaleX = bounds.width / rect.width;
      const scaleY = bounds.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX - 25;
      const y = (e.clientY - rect.top) * scaleY - 25;
      setObstacles((prev) => [...prev, { x, y, width: 50, height: 50 }]);
      handleReset();
    },
    [placing, running, bounds, handleReset]
  );

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
          RRT* Path Planning
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
        {/* Obstacles */}
        {obstacles.map((obs, i) => (
          <rect
            key={i}
            x={obs.x}
            y={obs.y}
            width={obs.width}
            height={obs.height}
            fill="var(--color-border-bright)"
            stroke="var(--color-border)"
            strokeWidth={1}
            rx={3}
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

        {/* Goal path */}
        {goalPath.length > 1 &&
          goalPath.slice(1).map((idx, i) => (
            <line
              key={`p-${i}`}
              x1={tree[goalPath[i]].x}
              y1={tree[goalPath[i]].y}
              x2={tree[idx].x}
              y2={tree[idx].y}
              stroke="var(--color-accent)"
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}

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

        {/* Goal */}
        <circle
          cx={goalPos.x}
          cy={goalPos.y}
          r={GOAL_RADIUS}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeDasharray="4,4"
        />
        <circle
          cx={goalPos.x}
          cy={goalPos.y}
          r={6}
          fill="var(--color-accent)"
        />
        <text
          x={goalPos.x}
          y={goalPos.y - GOAL_RADIUS - 6}
          textAnchor="middle"
          fill="var(--color-accent)"
          fontSize={11}
          fontFamily="var(--font-mono)"
          fontWeight={600}
        >
          GOAL
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
        {goalPath.length > 1 && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              color: "var(--color-status-active)",
              marginLeft: "auto",
            }}
          >
            ✓ Path found ({goalPath.length} nodes)
          </span>
        )}
      </div>
    </div>
  );
}
