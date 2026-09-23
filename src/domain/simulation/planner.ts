import type {
  EvaluationInput,
  IntelligenceAdapter,
} from "../../state/intelligenceAdapter";
import { simulateStep, type SimulationStep } from "./simulator";

export type PathStrategy = "fastest" | "balanced" | "stretch";
export type CareerPath = Readonly<{
  strategy: PathStrategy;
  steps: readonly SimulationStep[];
  startReadiness: number | null;
  projectedReadiness: number | null;
  reachedTarget: boolean;
  explored: number;
  reason: "planned" | "no-target" | "already-ready" | "no-candidates";
}>;
type Node = {
  steps: SimulationStep[];
  readiness: number;
  score: number;
  hours: number;
  key: string;
};
const bounded = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(n)));

export function planCareerPath(
  adapter: IntelligenceAdapter,
  input: EvaluationInput,
  strategy: PathStrategy = "balanced",
  options: {
    depth?: number;
    beamWidth?: number;
    readinessThreshold?: number;
  } = {},
): CareerPath {
  const depth = bounded(
    Number.isFinite(options.depth) ? options.depth! : 4,
    1,
    4,
  );
  const width = bounded(
    Number.isFinite(options.beamWidth) ? options.beamWidth! : 10,
    1,
    10,
  );
  const threshold = Math.max(
    0,
    Math.min(
      1,
      Number.isFinite(options.readinessThreshold)
        ? options.readinessThreshold!
        : 1,
    ),
  );
  const initial = adapter.evaluate(input);
  const base = {
    strategy,
    startReadiness: initial.readiness,
    projectedReadiness: initial.readiness,
    steps: [],
    explored: 0,
    reachedTarget: false,
  };
  if (!initial.target || initial.readiness === null)
    return { ...base, reason: "no-target" };
  if (initial.readiness >= threshold)
    return { ...base, reachedTarget: true, reason: "already-ready" };
  const compare = (a: Node, b: Node) => {
    if (strategy === "fastest") {
      const aReady = a.readiness >= threshold,
        bReady = b.readiness >= threshold;
      if (aReady !== bReady) return aReady ? -1 : 1;
      if (aReady && a.steps.length !== b.steps.length)
        return a.steps.length - b.steps.length;
      return (
        b.readiness - a.readiness ||
        a.steps.length - b.steps.length ||
        a.hours - b.hours ||
        a.key.localeCompare(b.key)
      );
    }
    const utility = (n: Node) =>
      strategy === "stretch"
        ? n.readiness
        : 0.7 * n.readiness +
          0.3 * (n.score / ((1 - 0.85 ** Math.max(1, n.steps.length)) / 0.15));
    return (
      utility(b) - utility(a) ||
      a.steps.length - b.steps.length ||
      a.hours - b.hours ||
      a.key.localeCompare(b.key)
    );
  };
  let frontier: Node[] = [
    { steps: [], readiness: initial.readiness, score: 0, hours: 0, key: "" },
  ];
  const all: Node[] = [];
  let explored = 0;
  for (let level = 0; level < depth; level++) {
    const next: Node[] = [];
    for (const node of frontier) {
      if (node.readiness >= threshold) continue;
      const nodeInput = {
        ...input,
        overlay: node.steps.at(-1)?.overlay ?? input.overlay,
      };
      const view = adapter.evaluate(nodeInput);
      const candidates = [...view.candidates].sort(
        (a, b) =>
          b.totalScore - a.totalScore ||
          a.activityId.localeCompare(b.activityId),
      );
      const seen = new Set<string>();
      for (const candidate of candidates) {
        if (seen.has(candidate.activityId)) continue;
        seen.add(candidate.activityId);
        const activity = input.dataset.activities.find(
          (item) => item.id === candidate.activityId,
        );
        if (
          !activity ||
          activity.mandatory ||
          view.activeActivityIds.includes(activity.id) ||
          (!activity.recurring &&
            (view.completedActivityIds.includes(activity.id) ||
              node.steps.some((s) => s.activityId === activity.id)))
        )
          continue;
        const step = simulateStep(adapter, nodeInput, activity.id);
        explored++;
        if (step.afterView.readiness === null)
          throw new Error("Engine returned no readiness for a planned target");
        next.push({
          steps: [...node.steps, step],
          readiness: step.afterView.readiness,
          score: node.score + candidate.totalScore * 0.85 ** node.steps.length,
          hours: node.hours + activity.durationHours,
          key: `${node.key}/${activity.id}`,
        });
      }
    }
    if (!next.length) break;
    next.sort(compare);
    frontier = next.slice(0, width);
    all.push(...frontier);
    if (
      strategy === "fastest" &&
      frontier.some((n) => n.readiness >= threshold)
    )
      break;
  }
  const best = all.sort(compare)[0];
  if (!best) return { ...base, explored, reason: "no-candidates" };
  return {
    strategy,
    steps: best.steps,
    startReadiness: initial.readiness,
    projectedReadiness: best.readiness,
    reachedTarget: best.readiness >= threshold,
    explored,
    reason: "planned",
  };
}
