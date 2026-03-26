import { createDagJobGraph } from "../dist/index.js";
import { mountGpuShowcase } from "@plasius/gpu-shared";

const root = globalThis.document?.getElementById("app");
if (!root) {
  throw new Error("Lock-free queue demo root element was not found.");
}

function createGraph(stress) {
  return createDagJobGraph([
    { id: "chunk-visibility", jobType: "world.visibility", queueClass: "render", priority: 920 },
    { id: "chunk-lod", jobType: "world.lod", queueClass: "render", priority: 860 },
    {
      id: "scene-cull",
      jobType: "scene.cull",
      queueClass: "render",
      priority: 940,
      dependencies: ["chunk-visibility", "chunk-lod"],
    },
    {
      id: "lighting-assign",
      jobType: "lighting.assign",
      queueClass: "lighting",
      priority: 960,
      dependencies: ["scene-cull"],
    },
    {
      id: "rt-instances",
      jobType: "rt.instances",
      queueClass: "render",
      priority: 980,
      dependencies: ["scene-cull"],
    },
    {
      id: "harbor-compose",
      jobType: "renderer.compose",
      queueClass: "render",
      priority: 990,
      dependencies: stress ? ["lighting-assign", "rt-instances", "post-denoise"] : ["lighting-assign", "rt-instances"],
    },
    ...(stress
      ? [
          {
            id: "post-denoise",
            jobType: "rt.denoise",
            queueClass: "render",
            priority: 970,
            dependencies: ["rt-instances"],
          },
        ]
      : []),
  ]);
}

function createState() {
  return {
    graph: createGraph(false),
  };
}

function updateState(state, scene) {
  state.graph = createGraph(scene.stress);
  return state;
}

function describeState(state, scene) {
  const topLane = state.graph.priorityLanes[0];
  return {
    status: `Queue live · ${state.graph.roots.length} roots · ${state.graph.priorityLanes.length} lanes`,
    details:
      "The demo now validates the DAG-ready lock-free queue contract against a mounted 3D scene instead of falling back to a spectrogram-only page.",
    sceneMetrics: [
      `job count: ${state.graph.jobCount}`,
      `root jobs: ${state.graph.roots.join(", ")}`,
      `max priority: ${state.graph.maxPriority}`,
      `topological length: ${state.graph.topologicalOrder.length}`,
    ],
    qualityMetrics: [
      `priority lanes: ${state.graph.priorityLanes.length}`,
      `top lane priority: ${topLane?.priority ?? 0}`,
      `top lane jobs: ${topLane?.jobCount ?? 0}`,
      `top lane roots: ${topLane?.rootCount ?? 0}`,
    ],
    debugMetrics: [
      `scene collisions: ${scene.collisions}`,
      `stress expansion: ${scene.stress ? "post-denoise inserted" : "base graph"}`,
      `ready roots: ${state.graph.roots.length}`,
      `scheduler mode: dag`,
    ],
    notes: [
      "The 3D harbor is shared, but the queue package still owns the DAG graph and priority-lane contract shown here.",
      "Stress mode inserts an extra denoise dependency so the lane and join behavior changes visibly.",
      "This keeps the demo aligned with the real multi-root, priority-aware queue direction.",
    ],
    textState: {
      jobIds: state.graph.jobIds,
      roots: state.graph.roots,
      priorityLanes: state.graph.priorityLanes,
    },
    visuals: {
      reflectionStrength: scene.stress ? 0.22 : 0.14,
      shadowAccent: topLane?.priority >= 970 ? 0.09 : 0.05,
      waveAmplitude: scene.stress ? 0.84 : 0.66,
      flagMotion: scene.stress ? 0.6 : 0.5,
    },
  };
}

await mountGpuShowcase({
  root,
  focus: "debug",
  packageName: "@plasius/gpu-lock-free-queue",
  title: "Priority DAG Queue Harbor Validation",
  subtitle:
    "A shared 3D harbor scene driven by gpu-lock-free-queue DAG roots, dependency joins, and priority lanes.",
  createState,
  updateState,
  describeState,
});
