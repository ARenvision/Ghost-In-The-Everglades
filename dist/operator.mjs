import { WIDTH, HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, landmarks, barriers, waterClearance } from "./missions.mjs";
import { drawGround, drawRipples, drawClosures, posts } from "./map.mjs";
import {
  sceneFor, safeDock, groupOnDock, remainingPeople, apparitionOpacity,
  drawLandmark, drawStandingPerson, drawApparition, drawSeated,
} from "./rescue-scenes.mjs";

const HORIZON = 250;
const FOCAL = 545;
const CAMERA_HEIGHT = 38;
const FIELD = 1120;
const ORIGIN = FIELD / 2;
const RANGE = 540;
const ground = document.createElement("canvas");
ground.width = ground.height = FIELD;
const floor = ground.getContext("2d", { alpha: false });
const skyCanvas = document.createElement("canvas");
skyCanvas.width = WIDTH;
skyCanvas.height = HORIZON + 80;
const sky = skyCanvas.getContext("2d");
const grove = new Image();
grove.src = "assets/cypress-grove.webp";

let seed = 11897;
function noise() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function glow(c, x, y, radius, color) {
  const paint = c.createRadialGradient(x, y, 0, x, y, radius);
  paint.addColorStop(0, color);
  paint.addColorStop(1, "transparent");
  c.fillStyle = paint;
  c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function shape(c, points, fill, stroke) {
  c.beginPath();
  c.moveTo(...points[0]);
  for (const p of points.slice(1)) c.lineTo(...p);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1.2;
    c.stroke();
  }
}

function paintSky() {
  const color = sky.createLinearGradient(0, 0, 0, HORIZON + 80);
  color.addColorStop(0, "#071825");
  color.addColorStop(.56, "#183744");
  color.addColorStop(.86, "#577377");
  color.addColorStop(1, "#2b4d52");
  sky.fillStyle = color;
  sky.fillRect(0, 0, WIDTH, HORIZON + 80);
  glow(sky, WIDTH * .71, 109, 142, "#91bfc859");
  sky.fillStyle = "#d7e7dc";
  sky.beginPath();
  sky.arc(WIDTH * .71, 109, 18, 0, 2 * Math.PI);
  sky.fill();
  for (let i = 0; i < 84; i++) {
    sky.fillStyle = i % 6 ? "#d0eee74d" : "#e6efcc7a";
    const r = i % 6 ? 1 : 1.6;
    sky.fillRect(noise() * WIDTH, noise() * 179, r, r);
  }
  for (let i = 0; i < 260; i++) {
    const x = noise() * WIDTH, y = 127 + noise() * 108;
    sky.fillStyle = i % 3 ? "#b9d2cd0a" : "#102b3824";
    sky.beginPath();
    sky.ellipse(x, y, 40 + noise() * 175, 2 + noise() * 8, -.018, 0, Math.PI * 2);
    sky.fill();
  }
  for (let i = 0; i < 95; i++) {
    const x = i * 13, y = HORIZON - 9 - noise() * 22;
    sky.fillStyle = i % 4 ? "#1f3b41" : "#2a484a";
    sky.beginPath();
    sky.ellipse(x, y + 15, 12 + noise() * 25, 10 + noise() * 12, .05, 0, 2 * Math.PI);
    sky.fill();
    sky.fillRect(x - 14, y + 13, 30, 37);
  }
}
paintSky();

const trees = [];
const empty = new Set();
for (let i = 0; i < 4600 && trees.length < 335; i++) {
  const x = 20 + noise() * (WORLD_WIDTH - 40), y = 20 + noise() * (WORLD_HEIGHT - 40);
  const clearance = waterClearance(x, y, empty);
  if (clearance > -10 || clearance < -47 || trees.some(t => Math.hypot(t.x - x, t.y - y) < 25)) continue;
  if (Math.hypot(x - landmarks.station[0], y - landmarks.station[1]) < 57) continue;
  trees.push({ x, y, size: 36 + noise() * 48, flip: noise() > .5 });
}

function cameraFor(boat) {
  const cos = Math.cos(boat.angle), sin = Math.sin(boat.angle);
  const x = boat.x - cos * 32, y = boat.y - sin * 32;
  function project(wx, wy, allowNear = false) {
    const dx = wx - x, dy = wy - y, depth = dx * cos + dy * sin;
    if ((!allowNear && depth < 22) || depth > RANGE) return null;
    const scale = FOCAL / Math.max(22, depth);
    return { x: WIDTH / 2 + (-dx * sin + dy * cos) * scale, y: HORIZON + CAMERA_HEIGHT * scale, depth, scale };
  }
  return { cos, sin, x, y, project };
}

const CUE_FRACTIONS = [-.85, .85, -.43, .43, 0];

// Posts for an in-progress closure. Closed stage is drawn through state.closed.
export function cuePosts(cue) {
  if (!cue || !cue.stage || cue.stage === "closed") return [];
  const b = barriers.get(cue.id);
  if (!b) return [];
  const progress = Math.min(1, Math.max(0, Number(cue.progress) || 0));
  const count = cue.stage === "warning" ? 1 :
    cue.stage === "deferred" ? CUE_FRACTIONS.length :
    cue.stage === "forming" ? Math.min(CUE_FRACTIONS.length, Math.max(1, Math.ceil(progress * CUE_FRACTIONS.length))) : 0;
  const fractions = cue.stage === "warning" ? [0] : CUE_FRACTIONS.slice(0, count);
  return fractions.map(fraction => {
    const offset = b.width * fraction;
    return { x: b.x - Math.sin(b.angle) * offset, y: b.y + Math.cos(b.angle) * offset, kind: "cue", stage: cue.stage };
  });
}

// Deferred: faint amber band across the barrier on the floor, pulsing slowly.
function drawFloorCue(f, cue, elapsed) {
  if (!cue || cue.stage !== "deferred") return;
  const b = barriers.get(cue.id);
  if (!b) return;
  const dx = -Math.sin(b.angle) * b.width, dy = Math.cos(b.angle) * b.width;
  f.save();
  f.globalAlpha = .35 + .2 * Math.sin(elapsed * 3);
  f.strokeStyle = "#f2b45a";
  f.lineWidth = 7;
  f.setLineDash([14, 10]);
  f.beginPath();
  f.moveTo(b.x - dx, b.y - dy);
  f.lineTo(b.x + dx, b.y + dy);
  f.stroke();
  f.restore();
}

function castGround(c, camera, boat, state, lowDetail, closureCue) {
  const { cos, sin, x, y } = camera;
  floor.setTransform(1, 0, 0, 1, 0, 0);
  floor.fillStyle = "#263d3d";
  floor.fillRect(0, 0, FIELD, FIELD);
  floor.setTransform(-sin, -cos, cos, -sin, ORIGIN + sin * x - cos * y, FIELD + cos * x + sin * y);
  drawGround(floor);
  drawRipples(floor, state.elapsed, { x: boat.x, y: boat.y, radius: 450 });
  if (boat.beam) {
    const beam = floor.createRadialGradient(boat.x, boat.y, 18, boat.x, boat.y, 185);
    beam.addColorStop(0, "#f4e8b67a");
    beam.addColorStop(.67, "#dfedc64d");
    beam.addColorStop(1, "#e8f7ce00");
    floor.fillStyle = beam;
    floor.beginPath();
    floor.moveTo(boat.x, boat.y);
    floor.arc(boat.x, boat.y, 185, boat.angle - .38, boat.angle + .38);
    floor.closePath();
    floor.fill();
  }
  drawClosures(floor, state.closed);
  drawFloorCue(floor, closureCue, state.elapsed);
  const horizon = HORIZON + 36;
  const step = lowDetail ? 5 : 3;
  for (let row = horizon; row < HEIGHT; row += step) {
    const near = FOCAL * CAMERA_HEIGHT / (row + step - HORIZON);
    const far = FOCAL * CAMERA_HEIGHT / (row - HORIZON);
    const slice = WIDTH * (near + far) / (2 * FOCAL);
    c.drawImage(ground, ORIGIN - slice / 2, FIELD - far, slice, far - near + .7, 0, row, WIDTH, step + .35);
  }
}

function drawTree(c, t, p, boat) {
  const height = t.size * p.scale;
  const width = height * 1.03;
  const facing = Math.atan2(t.y - boat.y, t.x - boat.x) - boat.angle;
  const inLight = boat.beam && p.depth < 185 && Math.cos(facing) > .91;
  c.globalAlpha = Math.max(.27, (inLight ? 1 : .85) - p.depth / 1150);
  if (grove.complete && grove.naturalWidth) {
    c.save();
    c.translate(p.x, p.y + height * .04);
    if (t.flip) c.scale(-1, 1);
    c.drawImage(grove, -width / 2, -height, width, height);
    c.restore();
  } else {
    shape(c, [[p.x - width / 3, p.y], [p.x - width / 4, p.y - height * .59],
      [p.x, p.y - height], [p.x + width / 3, p.y - height * .4], [p.x + width / 3, p.y]], "#182f2c");
  }
  c.globalAlpha = 1;
}

function drawStation(c, p) {
  const w = 25 * p.scale, h = 16 * p.scale;
  c.fillStyle = "#4f5545";
  c.fillRect(p.x - w, p.y - h, w * 2, h);
  shape(c, [[p.x - w * 1.16, p.y - h], [p.x, p.y - h * 1.58], [p.x + w * 1.16, p.y - h]], "#293f41", "#78817a");
  for (const side of [-1, 1]) {
    glow(c, p.x + side * w * .54, p.y - h * .5, Math.max(3, h * 1.2), "#eaba6470");
    c.fillStyle = "#e7c88c";
    c.fillRect(p.x + side * w * .54 - w * .1, p.y - h * .6, w * .2, h * .3);
  }
}

function drawPost(c, p, closed, amber) {
  const length = p.scale * (closed || amber ? 13 : 6);
  c.strokeStyle = amber ? "#e0a54f" : closed ? "#c8876b" : "#b1b390";
  c.lineWidth = Math.min(5, Math.max(1, p.scale));
  c.beginPath();
  c.moveTo(p.x, p.y);
  c.lineTo(p.x, p.y - length);
  c.stroke();
  glow(c, p.x, p.y - length, Math.min(20, 5 + p.scale * 3), amber ? "#f2b45aaf" : closed ? "#f29057af" : "#e4e0ac89");
}

function label(c, x, y, text, color) {
  c.font = "600 16px system-ui";
  const width = c.measureText(text).width + 16;
  c.fillStyle = "#0c1d22de";
  c.fillRect(x - width / 2, y - 20, width, 26);
  c.fillStyle = color;
  c.textAlign = "center";
  c.fillText(text, x, y - 2);
}

function drawSignalGhost(c, p, object, state, ghostImage) {
  const pulse = .23 + .58 * Math.max(0, Math.cos(state.elapsed * 2.7)) ** 2;
  c.globalAlpha = pulse;
  glow(c, p.x, p.y - p.scale * 12, Math.min(52, 7 + p.scale * 8), "#a2e2ff");
  c.globalAlpha = 1;
  if (object.visibility && ghostImage.complete && ghostImage.naturalWidth) {
    const size = Math.min(330, p.scale * 46);
    c.globalAlpha = object.visibility * .87;
    c.drawImage(ghostImage, p.x - size / 2, p.y - size, size, size);
    c.globalAlpha = 1;
  }
}

function drawRescueObject(c, o, p, state, project) {
  if (o.kind === "landmark") {
    drawLandmark(c, o.landmark, (x, y, z) => {
      const point = project(x, y, true);
      return point && [point.x, point.y - z * point.scale];
    }, true);
  } else if (o.kind === "person") {
    drawStandingPerson(c, p.x, p.y - o.height * p.scale, Math.min(156, 16 * p.scale), o.person);
  } else if (o.kind === "specter") {
    drawApparition(c, p.x, p.y - 23 * p.scale, Math.min(270, 36 * p.scale), o.opacity, state.elapsed);
  }
}

function drawBow(c, boat, state) {
  const x = WIDTH / 2, y = HEIGHT + Math.sin(state.elapsed * 4.5) * Math.min(5, boat.speed / 25);
  const steel = c.createLinearGradient(0, y - 127, 0, y);
  steel.addColorStop(0, "#56645f");
  steel.addColorStop(.59, "#273c3e");
  steel.addColorStop(1, "#102328");
  shape(c, [[x - 238, y + 15], [x - 148, y - 69], [x - 55, y - 103], [x, y - 113],
    [x + 55, y - 103], [x + 148, y - 69], [x + 238, y + 15]], steel, "#8d9d8d");
  shape(c, [[x - 177, y], [x - 108, y - 64], [x - 33, y - 90], [x + 33, y - 90],
    [x + 108, y - 64], [x + 177, y]], "#1c3032", "#4c5e59");
  state.passengers.forEach((person, i) => {
    drawSeated(c, x + (i ? 92 : -92), y - 18, 100, person);
  });
  drawSeated(c, x, y + 14, 142, 0, true);

  c.fillStyle = "#0c1d20";
  c.fillRect(x - 55, y - 46, 110, 41);
  c.fillStyle = "#7cb2a5";
  c.font = "600 11px system-ui";
  c.textAlign = "center";
  c.fillText("RESCUE ONE", x, y - 29);
  c.fillStyle = "#9fdacc";
  c.fillText(Math.round(boat.speed / 5) + " KN  ·  " + (boat.beam ? "LIGHT ON" : "LIGHT OFF"), x, y - 14);
}

export function drawOperator(c, { boat, state, mission, ghostImage, ghostVisibility, wrongWayGhost, lowDetail, closureCue = null }) {
  const camera = cameraFor(boat);
  c.fillStyle = "#24454b";
  c.fillRect(0, 0, WIDTH, HEIGHT);
  const skyOffset = ((boat.angle * WIDTH / (2 * Math.PI)) % WIDTH + WIDTH) % WIDTH;
  c.drawImage(skyCanvas, -skyOffset, 0);
  c.drawImage(skyCanvas, WIDTH - skyOffset, 0);
  castGround(c, camera, boat, state, lowDetail, closureCue);

  const sites = state.sites.map(site => ({ site, scene: sceneFor(site) }));
  const sceneLocations = [safeDock, ...sites.map(entry => entry.scene)];
  const objects = trees.filter(tree =>
    Math.abs(tree.x - boat.x) < 620 && Math.abs(tree.y - boat.y) < 620 &&
    sceneLocations.every(scene => Math.hypot(scene.x - tree.x, scene.y - tree.y) > 42)
  ).map(tree => ({ ...tree, kind: "tree" }));
  for (const [x, y] of posts) objects.push({ x, y, kind: "post" });
  const [sx, sy] = landmarks.station;
  objects.push({ x: sx - 21, y: sy + 23, kind: "station" });
  for (const id of state.closed) {
    const b = barriers.get(id);
    for (const fraction of [-.85, -.43, 0, .43, .85]) {
      const offset = b.width * fraction;
      objects.push({ x: b.x - Math.sin(b.angle) * offset, y: b.y + Math.cos(b.angle) * offset, kind: "closed" });
    }
  }
  objects.push(...cuePosts(closureCue));
  if (mission.ghost) {
    const [gx, gy] = landmarks[mission.ghost];
    if (Math.hypot(gx - boat.x, gy - boat.y) < 340) {
      objects.push({ x: gx, y: gy, kind: "ghost", visibility: ghostVisibility });
    }
  }
  if (wrongWayGhost) objects.push({ ...wrongWayGhost, kind: "specter" });
  objects.push({ ...safeDock, kind: "landmark", landmark: safeDock });
  for (const person of groupOnDock(safeDock, state.safePeople)) objects.push({ ...person, kind: "person" });
  for (const { site, scene } of sites) {
    objects.push({ ...scene, kind: "landmark", landmark: scene });
    if (!site.confirmed && Math.hypot(scene.x - boat.x, scene.y - boat.y) > 270) continue;
    for (const person of groupOnDock(scene, remainingPeople(site))) objects.push({ ...person, kind: "person" });
    const opacity = mission.ghost ? apparitionOpacity(site, state.elapsed) : 0;
    if (opacity) objects.push({ x: scene.x, y: scene.y, kind: "specter", opacity });
  }
  const visible = objects.map(o => ({ o, p: camera.project(o.x, o.y) }))
    .filter(({ o, p }) => {
      const margin = p && o.kind === "tree" ? o.size * p.scale * .51 :
        p && o.kind === "landmark" ? o.width * p.scale : 140;
      return p && p.x > -margin && p.x < WIDTH + margin;
    })
    .sort((a, b) => b.p.depth - a.p.depth);
  for (const { o, p } of visible) {
    if (o.kind === "tree") drawTree(c, o, p, boat);
    else if (o.kind === "post" || o.kind === "closed") drawPost(c, p, o.kind === "closed");
    else if (o.kind === "cue") drawPost(c, p, false, true);
    else if (o.kind === "station") {
      drawStation(c, p);
      label(c, p.x, p.y - Math.min(74, p.scale * 26) - 10, "Ranger station", "#bfe5c9");
    } else if (o.kind === "ghost") drawSignalGhost(c, p, o, state, ghostImage);
    else drawRescueObject(c, o, p, state, camera.project);
  }
  const fog = c.createLinearGradient(0, HORIZON - 41, 0, HORIZON + 120);
  fog.addColorStop(0, "#8aaeb600");
  fog.addColorStop(.48, "rgba(136,172,171," + (.13 + mission.fog * .26) + ")");
  fog.addColorStop(1, "#8aaeb600");
  c.fillStyle = fog;
  c.fillRect(0, HORIZON - 41, WIDTH, 161);
  drawBow(c, boat, state);
}
