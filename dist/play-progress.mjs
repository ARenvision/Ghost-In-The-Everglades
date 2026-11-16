import { barriers, routes } from "./missions.mjs";

const recordKey = "ghost-in-the-everglades.best-times";
const legacyRecordKey = "everglades-after-dark.best-times";

export function loadBestTimes(storage) {
  try {
    const records = storage();
    const value = JSON.parse(records.getItem(recordKey) ?? records.getItem(legacyRecordKey)) ?? {};
    const times = Object.fromEntries(Object.entries(value).filter(([, time]) => Number.isSafeInteger(time) && time > 0));
    if (times.echo && !times["echo:reed-narrows"]) times["echo:reed-narrows"] = times.echo;
    return times;
  } catch {
    return {};
  }
}

export function saveBestTimes(storage, times) {
  try {
    storage().setItem(recordKey, JSON.stringify(times));
    return true;
  } catch {
    return false;
  }
}

export function formatRunTime(tenths) {
  const seconds = Math.floor(tenths / 10);
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0") + "." + tenths % 10;
}

/**
 * Pure best-time rule. Returns { times, saved }.
 * saved is true only when `id` has no record or `time` is strictly lower.
 * times is a new map in that case; otherwise it is a copy equal to the input.
 * The input map is never mutated and no other id changes.
 */
export function applyFinishTime(times, id, time) {
  const next = { ...times };
  if (times[id] && time >= times[id]) return { times: next, saved: false };
  next[id] = time;
  return { times: next, saved: true };
}

const warningDelay = 2.5;
const warningDuration = 5;
const cooldown = 22;

function nearestChannel(x, y) {
  let closest, best = Infinity;
  for (const route of routes) {
    for (let i = 1; i < route.points.length; i++) {
      const [ax, ay] = route.points[i - 1];
      const [bx, by] = route.points[i];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      const distance = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      if (distance < best && distance < route.radius) {
        best = distance;
        closest = route.id;
      }
    }
  }
  return closest;
}

export function wrongWayApproach(boat, closed) {
  const id = nearestChannel(boat.x, boat.y);
  if (!closed.has(id)) return null;
  const approach = barriers.get(id);
  const distance = Math.hypot(boat.x - approach.x, boat.y - approach.y);
  if (distance > 160) return null;
  const dot = (approach.x - boat.x) * Math.cos(boat.angle) + (approach.y - boat.y) * Math.sin(boat.angle);
  return dot > distance * .25 ? id : null;
}

export function updateGhostWarning(warning, approach, elapsed, dt, advancing, boat) {
  if (warning.approach !== approach) {
    warning.approach = approach;
    warning.seconds = 0;
    warning.until = 0;
  }
  if (!approach || !advancing || elapsed < warning.next) return false;
  warning.seconds += dt;
  if (warning.seconds < warningDelay) return false;
  const barrier = barriers.get(approach);
  const dx = barrier.x - boat.x, dy = barrier.y - boat.y;
  const distance = Math.hypot(dx, dy);
  const reach = Math.min(1, 92 / Math.max(1, distance));
  warning.x = boat.x + dx * reach;
  warning.y = boat.y + dy * reach;
  warning.until = elapsed + warningDuration;
  warning.next = elapsed + cooldown;
  warning.seconds = 0;
  return true;
}

export function warningPosition(warning, time) {
  if (!warning.approach || time >= warning.until) return null;
  return { x: warning.x, y: warning.y, opacity: Math.min(1, (warning.until - time) * 1.4) };
}
