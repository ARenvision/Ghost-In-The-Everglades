// Closure logic: route graph, drivability cache, Closure_Zone and Dijkstra. DOM-free.
import { routes, landmarks, barriers, waterClearance, resolveRouteSetup } from "./missions.mjs";
import { CLOSURE_GEOMETRY, CLOSURE_TIMING } from "./closure-config.mjs";
import { closureRegistry, sharedLines, registryEntry } from "./closure-registry.mjs";

const G = CLOSURE_GEOMETRY;
// Half-length of a barrier rectangle along the channel (see waterClearance in missions.mjs).
export const BARRIER_HALF_LENGTH = 16;

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

export const edges = routes.map(r => ({
  id: r.id, from: r.from, to: r.to, radius: r.radius, points: r.points, length: polylineLength(r.points)
}));
export const edgeById = new Map(edges.map(e => [e.id, e]));
export const nodes = Object.fromEntries(Object.entries(landmarks).map(([id, p]) => [id, { id, x: p[0], y: p[1] }]));

const adjacency = new Map();
for (const e of edges) {
  for (const [a, b] of [[e.from, e.to], [e.to, e.from]]) {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a).push({ edge: e, next: b });
  }
}

export function closedKey(closed) {
  return [...closed].sort().join("|");
}

export function isDrivable(x, y, closed) {
  return waterClearance(x, y, closed) >= G.hullClearance;
}

// Sample points along a polyline: every vertex, plus points at most `step` apart.
export function samplePolyline(points, step = G.sampleStep) {
  const out = [{ x: points[0][0], y: points[0][1] }];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push({ x: ax + (bx - ax) * k / n, y: ay + (by - ay) * k / n });
  }
  return out;
}

const edgeCache = new Map();
const nodeCache = new Map();

export function clearDrivabilityCache() { edgeCache.clear(); nodeCache.clear(); }

function cacheFor(cache, closed) {
  const key = closedKey(closed);
  let hit = cache.get(key);
  if (!hit) { hit = new Map(); cache.set(key, hit); }
  return hit;
}

export function edgeUsable(edgeId, closed) {
  const memo = cacheFor(edgeCache, closed);
  if (memo.has(edgeId)) return memo.get(edgeId);
  const e = edgeById.get(edgeId);
  const ok = !!e && !closed.has(edgeId) && e.radius >= G.minChannelRadius &&
    samplePolyline(e.points).every(p => isDrivable(p.x, p.y, closed));
  memo.set(edgeId, ok);
  return ok;
}

export function nodeUsable(nodeId, closed) {
  const memo = cacheFor(nodeCache, closed);
  if (memo.has(nodeId)) return memo.get(nodeId);
  const n = nodes[nodeId];
  let ok = !!n && isDrivable(n.x, n.y, closed);
  for (let k = 0; ok && k < 8; k++) {
    const a = k * Math.PI / 4;
    ok = isDrivable(n.x + Math.cos(a) * G.nodeProbe, n.y + Math.sin(a) * G.nodeProbe, closed);
  }
  memo.set(nodeId, ok);
  return ok;
}

// Barrier frame, same formulas as waterClearance.
export function barrierFrame(point, channelId) {
  const b = barriers.get(channelId);
  if (!b) return null;
  const dx = point.x - b.x, dy = point.y - b.y;
  return {
    along: dx * Math.cos(b.angle) + dy * Math.sin(b.angle),
    across: -dx * Math.sin(b.angle) + dy * Math.cos(b.angle),
    barrier: b
  };
}

export function inClosureZone(point, channelId) {
  const f = barrierFrame(point, channelId);
  if (!f) return false;
  return Math.abs(f.along) < BARRIER_HALF_LENGTH + G.zoneMargin &&
    Math.abs(f.across) < f.barrier.width + G.zoneMargin;
}

// Dijkstra over usable edges and nodes. `starts` is [{ node, cost }], `goals` an iterable of node ids.
// Returns { cost, nodes: [...], edges: [...] } or null.
export function shortestPath(starts, goals, closed) {
  const goalSet = new Set(goals);
  const dist = new Map(), prev = new Map(), done = new Set();
  for (const s of starts) {
    if (!nodeUsable(s.node, closed)) continue;
    if (s.cost < (dist.get(s.node) ?? Infinity)) { dist.set(s.node, s.cost); prev.set(s.node, null); }
  }
  for (;;) {
    let at = null, best = Infinity;
    for (const [id, d] of dist) if (!done.has(id) && d < best) { at = id; best = d; }
    if (at === null) return null;
    if (goalSet.has(at)) {
      const pathNodes = [], pathEdges = [];
      for (let cur = at; cur; ) {
        pathNodes.unshift(cur);
        const p = prev.get(cur);
        if (!p) break;
        pathEdges.unshift(p.edge);
        cur = p.from;
      }
      return { cost: best, nodes: pathNodes, edges: pathEdges };
    }
    done.add(at);
    for (const { edge, next } of adjacency.get(at) ?? []) {
      if (done.has(next) || !edgeUsable(edge.id, closed) || !nodeUsable(next, closed)) continue;
      const d = best + edge.length;
      if (d < (dist.get(next) ?? Infinity)) { dist.set(next, d); prev.set(next, { from: at, edge: edge.id }); }
    }
  }
}

// ---------------------------------------------------------------------------
// Boat attachment and route check
// ---------------------------------------------------------------------------

// Nearest point on a polyline: { s (arc position), d (distance), x, y }.
function project(points, x, y) {
  let best = { s: 0, d: Infinity, x: points[0][0], y: points[0][1] };
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(x - qx, y - qy);
    if (d < best.d) best = { s: acc + t * len, d, x: qx, y: qy };
    acc += len;
  }
  return best;
}

// Polyline from arc position s to the "from" end (toEnd=false) or the "to" end (toEnd=true).
function portion(points, s, toEnd) {
  const q = pointAt(points, s);
  const out = [[q.x, q.y]];
  let acc = 0;
  const verts = [[points[0][0], points[0][1], 0]];
  for (let i = 1; i < points.length; i++) {
    acc += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    verts.push([points[i][0], points[i][1], acc]);
  }
  if (toEnd) { for (const v of verts) if (v[2] > s) out.push([v[0], v[1]]); }
  else { for (let i = verts.length - 1; i >= 0; i--) if (verts[i][2] < s) out.push([verts[i][0], verts[i][1]]); }
  if (out.length === 1) out.push(out[0]);
  return out;
}

function pointAt(points, s) {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (acc + len >= s || i === points.length - 1) {
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, (s - acc) / len));
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    }
    acc += len;
  }
  return { x: points[0][0], y: points[0][1] };
}

function anyZone(p, closed) {
  for (const id of closed) if (inClosureZone(p, id)) return true;
  return false;
}

// Attach the boat to the graph. Returns [{ node, cost }] (cheapest entry per node), or [] when no channel attaches.
// No nearest-channel fallback. Closed channels offer only the end on the boat's side of the barrier.
export function attachBoat(boat, closed) {
  const best = new Map();
  for (const e of edges) {
    const q = project(e.points, boat.x, boat.y);
    const n = Math.max(1, Math.ceil(q.d / G.attachStep));
    let clear = true;
    for (let k = 0; clear && k <= n; k++) {
      const p = { x: boat.x + (q.x - boat.x) * k / n, y: boat.y + (q.y - boat.y) * k / n };
      clear = isDrivable(p.x, p.y, closed) && !anyZone(p, closed);
    }
    if (!clear) continue;
    let ends = ["from", "to"];
    if (closed.has(e.id)) {
      const b = barriers.get(e.id);
      const sb = b ? project(e.points, b.x, b.y).s : e.length / 2;
      ends = [q.s < sb ? "from" : "to"];
    }
    for (const end of ends) {
      const toEnd = end === "to";
      const node = toEnd ? e.to : e.from;
      if (!nodeUsable(node, closed)) continue;
      const part = portion(e.points, q.s, toEnd);
      if (!samplePolyline(part).every(p => isDrivable(p.x, p.y, closed))) continue;
      const cost = q.d + (toEnd ? e.length - q.s : q.s);
      if (cost < (best.get(node) ?? Infinity)) best.set(node, cost);
    }
  }
  return [...best].map(([node, cost]) => ({ node, cost }));
}

// sites: array of node ids, or { at, remaining? } objects (Mission 1: [{ at: "island", remaining: n }] or ["island"]).
// A site counts as needing pickup unless it is an object with remaining <= 0.
function pickupTargets(sites) {
  return (sites ?? [])
    .filter(s => typeof s === "string" || s.remaining === undefined || s.remaining > 0)
    .map(s => (typeof s === "string" ? s : s.at));
}

function returnRoute(boat, closed) {
  const starts = attachBoat(boat, closed);
  return starts.length ? { starts, route: shortestPath(starts, ["station"], closed) } : { starts, route: null };
}

// Pure route check. candidate may be null. boat is { x, y }. closed is a Set of channel ids.
// Result: { ok, reason: "zone"|"unattached"|"return"|"pickup"|null, returnLength, detour, returnRoute?, pickupRoute? }
// returnLength: cost of the Return_Route with the candidate closed (Infinity when the check fails before one exists).
// detour: returnLength(with candidate) - returnLength(closed only). 0 when there is no candidate; null when the
// check failed or there is no baseline route. pickupRoute is an array of routes, one per site needing pickup.
export function routeCheck({ closed, candidate = null, boat, remaining = 0, sites = [] }) {
  const closedNext = new Set(closed);
  if (candidate) closedNext.add(candidate);
  const fail = reason => ({ ok: false, reason, returnLength: Infinity, detour: null });
  if (candidate && inClosureZone(boat, candidate)) return fail("zone");
  const next = returnRoute(boat, closedNext);
  if (!next.starts.length) return fail("unattached");
  if (!next.route) return fail("return");
  const result = { ok: true, reason: null, returnLength: next.route.cost, detour: 0, returnRoute: next.route };
  if (remaining > 0) {
    let pickup = null;
    for (const at of pickupTargets(sites)) {
      const r = shortestPath([{ node: "station", cost: 0 }], [at], closedNext);
      if (!r) { const f = fail("pickup"); f.returnRoute = next.route; f.returnLength = next.route.cost; return f; }
      pickup = pickup ?? [];
      pickup.push(r);
    }
    if (pickup) result.pickupRoute = pickup;
  }
  if (candidate) {
    const base = returnRoute(boat, closed).route;
    result.detour = base ? next.route.cost - base.cost : null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Traversal tracker (Outbound_Leg). Position-only rules, no clock, no randomness.
// ---------------------------------------------------------------------------

const TRACK_EPS = 1e-9;

function freshChannelState() {
  return { entryEnd: null, entryPos: null, entered: false, leftEntryZone: false, maxProgress: 0 };
}

// roadblocks: iterable of channel ids closed at setup (skipped). Returns the tracker object.
export function createTracker({ roadblocks = [] } = {}) {
  const skip = new Set(roadblocks);
  skip.add("launch-channel");
  const channels = {};
  for (const entry of closureRegistry) {
    if (skip.has(entry.id) || !edgeById.has(entry.id)) continue;
    channels[entry.id] = freshChannelState();
  }
  return { channels, record: [], outboundDone: false };
}

// Mutates and returns the tracker. boat is { x, y }. Once aboard > 0 the tracker is frozen (outboundDone).
export function updateTracker(tracker, boat, { aboard = 0 } = {}) {
  if (tracker.outboundDone) return tracker;
  if (aboard > 0) { tracker.outboundDone = true; return tracker; }
  for (const id of Object.keys(tracker.channels)) {
    const e = edgeById.get(id), st = tracker.channels[id];
    const q = project(e.points, boat.x, boat.y);
    const inside = q.d < e.radius;
    if (!inside) {
      if (st.entered) Object.assign(st, freshChannelState());
      continue;
    }
    const u = q.s / e.length;
    const inFrom = u <= G.endZone, inTo = u >= 1 - G.endZone;
    if (!st.entered) {
      if (inFrom || inTo) {
        Object.assign(st, {
          entered: true, entryEnd: inFrom ? "from" : "to",
          entryPos: { s: q.s, x: q.x, y: q.y }, leftEntryZone: false, maxProgress: 0
        });
      }
      continue;
    }
    const fromEntry = st.entryEnd === "from";
    const inEntryZone = fromEntry ? inFrom : inTo;
    const inFarZone = fromEntry ? inTo : inFrom;
    if (inEntryZone) {
      if (st.leftEntryZone) Object.assign(st, freshChannelState()); // U-turn
      continue;
    }
    st.leftEntryZone = true;
    const p = (fromEntry ? q.s - st.entryPos.s : st.entryPos.s - q.s) / e.length;
    st.maxProgress = Math.max(st.maxProgress, p);
    if (inFarZone && st.maxProgress >= G.traversalThreshold - TRACK_EPS) {
      if (!tracker.record.includes(id)) tracker.record.push(id);
      Object.assign(st, freshChannelState());
    }
  }
  return tracker;
}

export function classify(reason) {
  if (reason === "zone" || reason === "unattached") return "defer";
  if (reason === "return" || reason === "pickup") return "lost";
  return null;
}

// ---------------------------------------------------------------------------
// Candidate selection. Pure: depends only on record, closed set, boat, remaining and sites.
// ---------------------------------------------------------------------------

// selectTarget({ record, closed, boat, remaining, sites }) -> { target, deferOnly, detour?, candidates }
// Candidates are registry channels that are in `record` and not in `closed`. Eligible = routeCheck ok and
// detour > 0 (Impactful rule). Smallest detour wins; ties go to registry order.
// With no eligible candidate: target null, deferOnly true only if there was a candidate and every
// failure was a "defer" reason (zone/unattached). candidates: [{ id, ok, reason, detour }] for diagnostics.
export function selectTarget({ record = [], closed = new Set(), boat, remaining = 0, sites = [] }) {
  const recorded = new Set(record);
  const candidates = [];
  let best = null;
  for (const entry of closureRegistry) {
    if (!recorded.has(entry.id) || closed.has(entry.id)) continue;
    const r = routeCheck({ closed, candidate: entry.id, boat, remaining, sites });
    candidates.push({ id: entry.id, ok: r.ok, reason: r.reason, detour: r.detour });
    if (r.ok && r.detour > 0 && (!best || r.detour < best.detour)) best = { id: entry.id, detour: r.detour };
  }
  if (best) return { target: best.id, deferOnly: false, detour: best.detour, candidates };
  const deferOnly = candidates.length > 0 &&
    candidates.every(c => !c.ok ? classify(c.reason) === "defer" : false);
  return { target: null, deferOnly, candidates };
}

// ---------------------------------------------------------------------------
// Closure state machine (one event per run, Mission 1 "echo" only)
// ---------------------------------------------------------------------------

const T = CLOSURE_TIMING;
const CHECK_PERIOD = 0.25;
const ACTIVE_PHASES = new Set(["warning", "forming", "deferred"]);

// createClosure(mission) -> event. Active only for the echo mission with a route setup (raw or resolved).
// Inactive events have the same shape, and stepClosure returns no effects for them.
export function createClosure(mission) {
  const active = !!mission && mission.id === "echo" && !!(mission.setup || mission.routeSetups?.length);
  let roadblocks = [];
  if (active) {
    const resolved = resolveRouteSetup(mission, mission.setup);
    roadblocks = (resolved.roadblocks ?? []).map(b => (typeof b === "string" ? b : b.id));
  }
  return {
    active, phase: "idle", epoch: 0,
    armedAt: null, target: null, countdownStart: null,
    phaseStart: 0, deferredAt: null, deferredAnnounced: false,
    nextCheck: 0, now: 0,
    tracker: active ? createTracker({ roadblocks }) : null
  };
}

function setPhase(event, phase, elapsed) {
  event.phase = phase;
  event.epoch += 1;
  event.phaseStart = elapsed;
}

function cueEffect(event, stage, progress = 0) {
  const entry = event.target ? registryEntry(event.target) : null;
  return { type: "cue", stage, id: event.target, name: entry?.name ?? null, progress };
}

function transmitEffect(event, id, phase) {
  const entry = registryEntry(event.target);
  return { type: "transmit", id, place: entry?.name ?? null, priority: 5, phase, epoch: event.epoch };
}

// stepClosure(event, { elapsed, boat, aboard, remaining, sites, closed }) -> { event, effects }.
// Mutates `event` and returns the same object. Time comes only from inputs.elapsed.
export function stepClosure(event, inputs) {
  const effects = [];
  if (!event.active || !["idle", ...ACTIVE_PHASES].includes(event.phase)) return { event, effects };
  const { elapsed, boat, aboard = 0, remaining = 0, sites = [], closed = new Set() } = inputs;
  event.now = elapsed;

  if (event.phase === "idle") {
    if (!event.tracker.outboundDone) updateTracker(event.tracker, boat, { aboard });
    if (event.armedAt === null && aboard > 0) event.armedAt = elapsed;
    if (event.armedAt === null) return { event, effects };
    const armTime = event.armedAt + T.armDelay;
    if (elapsed < armTime || elapsed < event.nextCheck) return { event, effects };
    const pick = selectTarget({ record: event.tracker.record, closed, boat, remaining, sites });
    if (pick.target) {
      event.target = pick.target;
      event.countdownStart = elapsed;
      setPhase(event, "warning", elapsed);
      event.nextCheck = elapsed + CHECK_PERIOD;
      effects.push(transmitEffect(event, registryEntry(pick.target).line, "warning"));
      effects.push(cueEffect(event, "warning"));
    } else if (pick.deferOnly && elapsed < armTime + T.deferralLimit) {
      event.nextCheck = elapsed + CHECK_PERIOD;
    } else {
      setPhase(event, "skipped", elapsed);
    }
    return { event, effects };
  }

  const cancel = (withClip) => {
    setPhase(event, "canceled", elapsed);
    if (withClip) effects.push(transmitEffect(event, sharedLines.canceled, "canceled"));
    effects.push(cueEffect(event, null));
  };
  const close = () => {
    setPhase(event, "closed", elapsed);
    effects.push({ type: "close", id: event.target });
    effects.push(transmitEffect(event, sharedLines.closed, "closed"));
    effects.push(cueEffect(event, "closed", 1));
  };

  if (aboard <= 0) { cancel(false); return { event, effects }; }

  const formingStart = event.countdownStart + T.warning;
  const countdownEnd = formingStart + T.forming;
  if (event.phase === "warning" && elapsed >= formingStart) {
    setPhase(event, "forming", elapsed);
    effects.push(cueEffect(event, "forming", 0));
  }
  const atEnd = event.phase === "forming" && elapsed >= countdownEnd;
  if (atEnd || elapsed >= event.nextCheck) {
    event.nextCheck = elapsed + CHECK_PERIOD;
    const res = routeCheck({ closed, candidate: event.target, boat, remaining, sites });
    const kind = res.ok ? "ok" : classify(res.reason);
    if (kind === "lost") { cancel(true); return { event, effects }; }
    if (event.phase === "deferred" && kind === "ok") { close(); return { event, effects }; }
    if (atEnd) {
      if (kind === "ok") { close(); return { event, effects }; }
      setPhase(event, "deferred", elapsed);
      event.deferredAt = elapsed;
      effects.push(cueEffect(event, "deferred"));
    }
  }
  if (event.phase === "deferred") {
    if (elapsed - event.deferredAt >= T.deferralLimit) { cancel(true); return { event, effects }; }
    if (!event.deferredAnnounced && elapsed >= event.deferredAt + T.minDeferredDwell) {
      event.deferredAnnounced = true;
      effects.push(transmitEffect(event, sharedLines.deferred, "deferred"));
    }
  }
  return { event, effects };
}

// closureCue(event, elapsed = event.now) -> null | { id, name, stage, progress, remaining }.
// stage: "warning" | "forming" | "deferred" | "closed". progress: 0..1 (forming time; 1 once deferred or closed).
// remaining: seconds left on the countdown (warning and forming), else 0.
export function closureCue(event, elapsed = event.now) {
  if (!event?.active || !event.target) return null;
  const entry = registryEntry(event.target);
  const end = event.countdownStart === null ? 0 : event.countdownStart + T.warning + T.forming;
  const base = { id: event.target, name: entry?.name ?? null };
  switch (event.phase) {
    case "warning": return { ...base, stage: "warning", progress: 0, remaining: Math.max(0, end - elapsed) };
    case "forming": {
      const p = (elapsed - (event.countdownStart + T.warning)) / T.forming;
      return { ...base, stage: "forming", progress: Math.min(1, Math.max(0, p)), remaining: Math.max(0, end - elapsed) };
    }
    case "deferred": return { ...base, stage: "deferred", progress: 1, remaining: 0 };
    case "closed": return { ...base, stage: "closed", progress: 1, remaining: 0 };
    default: return null;
  }
}
