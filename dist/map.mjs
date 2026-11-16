import { WORLD_WIDTH, WORLD_HEIGHT, routes, landmarks, barriers, waterClearance } from "./missions.mjs";

function surface() {
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_WIDTH;
  canvas.height = WORLD_HEIGHT;
  return canvas;
}

const terrain = surface();
const water = surface();
const ctx = terrain.getContext("2d");
const wet = water.getContext("2d");
const marsh = new Image();
const noClosures = new Set();
let seed;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

export const posts = [];
for (const route of routes) {
  for (let i = 1; i < route.points.length; i++) {
    const [x, y] = route.points[i - 1];
    const [ex, ey] = route.points[i];
    const dx = ex - x, dy = ey - y, length = Math.hypot(dx, dy);
    const normal = (i % 2 ? -1 : 1) * (route.radius - 5) / length;
    const step = Math.ceil(length / 71);
    for (let k = 0; k < step; k++) {
      const t = (k + .52) / step;
      const px = x + dx * t - dy * normal;
      const py = y + dy * t + dx * normal;
      if (waterClearance(px, py, noClosures) < 13) posts.push([px, py]);
    }
  }
}

const ripples = [];
seed = 19709;
for (let i = 0; i < 1180; i++) {
  const x = random() * WORLD_WIDTH, y = random() * WORLD_HEIGHT;
  const width = 6 + random() * 21;
  if (waterClearance(x, y, noClosures) > width / 2 + 2) ripples.push({ x, y, width, phase: random() * 6.28 });
}

export function drawRipples(c, time, bounds) {
  for (const ripple of ripples) {
    const { x, y, width, phase } = ripple;
    if (bounds && (Math.abs(x - bounds.x) > bounds.radius || Math.abs(y - bounds.y) > bounds.radius)) continue;
    const pulse = Math.max(0, Math.sin(time * 1.6 + phase));
    if (pulse < .3) continue;
    c.globalAlpha = pulse * .21;
    c.fillStyle = "#a8d5c6";
    c.fillRect(x - width / 2, y + Math.sin(time + phase) * 1.6, width, .8);
  }
  c.globalAlpha = 1;
}

function trace(c, points) {
  c.beginPath();
  c.moveTo(...points[0]);
  for (const p of points.slice(1)) c.lineTo(...p);
}

function ribbon(c, paint, border) {
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = paint;
  for (const route of routes) {
    c.lineWidth = route.radius * 2 + border;
    trace(c, route.points);
    c.stroke();
  }
}

function line(c, points, color, width = 1) {
  c.strokeStyle = color;
  c.lineWidth = width;
  trace(c, points);
  c.stroke();
}

function paintWater() {
  wet.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ribbon(wet, "#fff", 0);
  wet.globalCompositeOperation = "source-in";
  const color = wet.createLinearGradient(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  color.addColorStop(0, "#21464c");
  color.addColorStop(.44, "#31585a");
  color.addColorStop(1, "#1d3c44");
  wet.fillStyle = color;
  wet.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  wet.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 5400; i++) {
    const x = random() * WORLD_WIDTH, y = random() * WORLD_HEIGHT;
    const reach = 3 + random() * 32;
    const alpha = .045 + random() * .17;
    wet.fillStyle = i % 5 === 0 ? "rgba(174,212,198," + alpha + ")" : "rgba(6,27,39," + alpha + ")";
    wet.fillRect(x, y, reach, random() > .93 ? 1.45 : .75);
  }
  wet.globalCompositeOperation = "source-over";
}

function paintShore() {
  ribbon(ctx, "#0a201d99", 18);
  ribbon(ctx, "#878267", 6);
  ribbon(ctx, "#53675a", 2.5);
  ctx.drawImage(water, 0, 0);

  for (let i = 0; i < 5400; i++) {
    const x = random() * WORLD_WIDTH, y = random() * WORLD_HEIGHT;
    const clearance = waterClearance(x, y, noClosures);
    if (clearance < -10 || clearance > 6) continue;
    const length = 2 + random() * 6;
    line(ctx, [[x, y], [x - length * .35, y - length]], i % 3 ? "#62705899" : "#a09a6faa", .75);
  }
  for (const [x, y] of posts) {
    ctx.fillStyle = "#132c29";
    ctx.fillRect(x - 2, y - 2, 4, 7);
    ctx.fillStyle = "#d4cda0";
    ctx.fillRect(x - 1, y - 4, 2, 4);
  }
}

function paintStation() {
  const [x, y] = landmarks.station;
  ctx.fillStyle = "#9f9474";
  ctx.fillRect(x - 10, y - 3, 32, 12);
  for (let i = -9; i <= 20; i += 3) line(ctx, [[x + i, y - 2], [x + i, y + 8]], "#4e5143");
  ctx.fillStyle = "#142c29";
  ctx.fillRect(x - 50, y + 12, 59, 34);
  ctx.fillStyle = "#43534d";
  ctx.fillRect(x - 54, y + 12, 56, 30);
  ctx.fillStyle = "#657367";
  ctx.fillRect(x - 54, y + 12, 56, 13);
  line(ctx, [[x - 54, y + 25], [x + 2, y + 25]], "#b0a789");
  for (let i = -51; i <= 0; i += 5) line(ctx, [[x + i, y + 13], [x + i, y + 41]], "#283b3766");
  const light = ctx.createRadialGradient(x - 1, y + 15, 2, x - 1, y + 15, 31);
  light.addColorStop(0, "#ffd68b85");
  light.addColorStop(1, "#f6c77300");
  ctx.fillStyle = light;
  ctx.fillRect(x - 33, y - 17, 64, 64);
  ctx.fillStyle = "#efcf94";
  ctx.fillRect(x - 2, y + 12, 4, 5);
}

function paintTerrain() {
  seed = 23917;
  const base = ctx.createLinearGradient(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  base.addColorStop(0, "#314636");
  base.addColorStop(.56, "#4b573d");
  base.addColorStop(1, "#263d33");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  if (marsh.complete && marsh.naturalWidth) {
    ctx.globalAlpha = .86;
    const tile = WORLD_WIDTH / 3;
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate((i + (i % 2)) * tile, 0);
      ctx.scale(i % 2 ? -1 : 1, 1);
      ctx.drawImage(marsh, 0, 0, tile + 1, WORLD_HEIGHT);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#102f3b36";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }
  for (let i = 0; i < 3200; i++) {
    const x = random() * WORLD_WIDTH, y = random() * WORLD_HEIGHT, r = 1 + random() * 9;
    ctx.fillStyle = i % 3 ? "#1e302b29" : "#9a9b6321";
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.3, r * .62, .4, 0, 2 * Math.PI);
    ctx.fill();
  }
  paintWater();
  paintShore();
  paintStation();
}
paintTerrain();
marsh.addEventListener("load", paintTerrain);
marsh.src = "assets/marsh-ground.webp";

export function drawGround(c) {
  c.drawImage(terrain, 0, 0);
}

export function drawTerrain(c, chart) {
  drawGround(c);
  if (!chart) return;
  c.fillStyle = "#0b161be0";
  c.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  for (let x = 0; x < WORLD_WIDTH; x += 40) line(c, [[x, 0], [x, WORLD_HEIGHT]], "#54827924");
  for (let y = 0; y < WORLD_HEIGHT; y += 40) line(c, [[0, y], [WORLD_WIDTH, y]], "#54827924");
  for (const route of routes) line(c, route.points, "#477670", 6);
}

export function drawClosures(c, closed) {
  for (const id of closed) {
    const b = barriers.get(id);
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.angle);
    c.fillStyle = "#241c18";
    c.fillRect(-8, -b.width, 16, b.width * 2);
    c.fillStyle = "#725444";
    c.fillRect(-3, -b.width, 6, b.width * 2);
    c.fillStyle = "#f4a570";
    for (let y = -b.width + 3; y < b.width - 2; y += 12) c.fillRect(-4, y, 8, 5);
    c.restore();
  }
}

function cueLabel(c, text, y) {
  c.font = "700 15px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.lineWidth = 4;
  c.strokeStyle = "#241c18";
  c.strokeText(text, 0, y);
  c.fillStyle = "#f4a570";
  c.fillText(text, 0, y);
}

export function drawClosureCue(c, cue) {
  if (!cue || cue.stage === "closed") return;
  const b = barriers.get(cue.id);
  if (!b) return;
  const pulse = .5 + .5 * Math.sin(Date.now() / 220);
  const progress = Math.max(0, Math.min(1, Number(cue.progress) || 0));
  const name = cue.name || "Route";
  c.save();
  c.translate(b.x, b.y);
  c.rotate(b.angle);
  if (cue.stage === "warning") {
    c.strokeStyle = "#f4a570";
    c.globalAlpha = .5 + pulse * .5;
    c.lineWidth = 3;
    c.setLineDash([8, 6]);
    c.strokeRect(-12, -b.width - 4, 24, b.width * 2 + 8);
    c.setLineDash([]);
    c.globalAlpha = 1;
    c.rotate(-b.angle);
    cueLabel(c, name + " closing", -b.width - 22);
  } else if (cue.stage === "forming") {
    const half = b.width * progress;
    c.fillStyle = "#241c18";
    c.fillRect(-8, -half, 16, half * 2);
    c.fillStyle = "#f4a570";
    c.globalAlpha = .6 + pulse * .4;
    for (let y = -b.width + 3; y < b.width - 2; y += 12) {
      if (Math.abs(y + 2.5) <= half) c.fillRect(-4, y, 8, 5);
    }
    c.globalAlpha = 1;
    c.strokeStyle = "#f4a57099";
    c.lineWidth = 2;
    c.strokeRect(-9, -b.width, 18, b.width * 2);
    c.rotate(-b.angle);
    cueLabel(c, name + " closing", -b.width - 22);
  } else if (cue.stage === "deferred") {
    c.fillStyle = "#241c18";
    c.globalAlpha = .6;
    c.fillRect(-8, -b.width, 16, b.width * 2);
    c.globalAlpha = 1;
    c.strokeStyle = "#f4a570";
    c.lineWidth = 3;
    for (let y = -b.width; y < b.width; y += 10) {
      c.beginPath();
      c.moveTo(-8, y + 10);
      c.lineTo(8, y);
      c.stroke();
    }
    c.rotate(-b.angle);
    cueLabel(c, "Clear the channel: " + name, -b.width - 22);
  }
  c.restore();
}
