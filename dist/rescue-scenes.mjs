import { landmarks } from "./missions.mjs";

const locations = {
  "call-training": { kind: "dock", title: "Practice dock", direction: 1.24, width: 38, roof: "#71654f" },
  "call-marker": { kind: "cypress", title: "Broken cypress dock", direction: .97, width: 37, roof: "#574e39" },
  "call-outpost": { kind: "outpost", title: "Dark ranger outpost", direction: -.66, width: 42, roof: "#53706b" },
  "call-cut": { kind: "watch", title: "Raised watch platform", direction: 1.2, width: 39, roof: "#81664a" },
  "call-ridge": { kind: "camp", title: "North ridge camp", direction: -1.2, width: 39, roof: "#8c774e" },
  "call-platform": { kind: "flood", title: "Flooding boardwalk", direction: .18, width: 36, roof: "#786852" },
  "call-shelter": { kind: "shelter", title: "Storm shelter", direction: .08, width: 43, roof: "#516878" },
  "call-island": { kind: "dock", title: "Island ferry dock", direction: 1.18, width: 42, roof: "#71654f" },
};

const images = Object.fromEntries([
  ["survivor", "rescue-survivor.webp"],
  ["operator", "rescue-operator.webp"],
  ["passenger", "rescue-passenger.webp"],
  ["specter", "rescue-apparition.webp"],
].map(([key, filename]) => {
  const image = new Image();
  image.src = "assets/" + filename;
  return [key, image];
}));

const vests = ["#d6944f", "#a96a4f", "#e2b766", "#b96e45", "#e3a555"];
const tints = [0, 17, -15, 22, -9];
const tau = Math.PI * 2;

function sceneAt(at, details, distance = 22) {
  const [x, y] = landmarks[at];
  const nx = Math.cos(details.direction), ny = Math.sin(details.direction);
  return { ...details, x: x + nx * distance, y: y + ny * distance, nx, ny, rx: -ny, ry: nx };
}

export function sceneFor(site) {
  return sceneAt(site.at, locations[site.call]);
}

export const safeDock = sceneAt("station", { kind: "safe", title: "Ranger station", direction: 1.02, width: 48 }, 19);

function world(scene, side, back) {
  return [scene.x + scene.rx * side + scene.nx * back, scene.y + scene.ry * side + scene.ny * back];
}

export function groupOnDock(scene, people) {
  const row = Math.ceil(people.length / 2);
  return people.map((person, i) => {
    const frontRow = people.length < 5 || i < row;
    const rowSize = people.length < 5 ? people.length : frontRow ? row : people.length - row;
    const slot = frontRow ? i : i - row;
    const spacing = Math.min(11, (scene.width - 8) / Math.max(1, rowSize));
    const [x, y] = world(scene, (slot - (rowSize - 1) / 2) * spacing, frontRow ? -2 : 8);
    return { x, y, person, height: scene.kind === "watch" ? 7 : scene.kind === "flood" ? 2 : 4 };
  });
}

export function remainingPeople(site) {
  return site.people.slice(site.count - site.remaining);
}

export function apparitionOpacity(site, time) {
  const fade = site.remaining ? 1 : Math.max(0, 1 - (time - site.clearedAt) / 1.65);
  return Number.isFinite(fade) ? fade * (.67 + .10 * Math.sin(time * 1.7)) : 0;
}

function fill(c, points, color, edge) {
  if (points.some(p => !p)) return;
  c.beginPath();
  c.moveTo(...points[0]);
  for (const p of points.slice(1)) c.lineTo(...p);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  if (edge) {
    c.strokeStyle = edge;
    c.lineWidth = 1;
    c.stroke();
  }
}

function line(c, a, b, color, width = 1) {
  if (!a || !b) return;
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(...a);
  c.lineTo(...b);
  c.stroke();
}

function disk(c, x, y, radius, paint) {
  c.fillStyle = paint;
  c.beginPath();
  c.arc(x, y, radius, 0, tau);
  c.fill();
}

function glow(c, x, y, size, center) {
  const light = c.createRadialGradient(x, y, 1, x, y, size);
  light.addColorStop(0, center);
  light.addColorStop(1, "transparent");
  c.fillStyle = light;
  c.fillRect(x - size, y - size, size * 2, size * 2);
}

function drawDeck(c, scene, project, perspective) {
  const h = scene.kind === "watch" ? 7 : scene.kind === "flood" ? 2 : 4;
  const left = -scene.width / 2, right = -left;
  const point = (x, y, z = h) => project(...world(scene, x, y), z);
  const front = -13, back = scene.kind === "flood" ? 35 : 22;
  const gangway = scene.kind === "cypress" ? 42 : 35;
  fill(c, [point(-6, back - 1), point(6, back - 1), point(6, gangway), point(-6, gangway)], "#5c5143", "#8c795e");
  if (perspective) {
    fill(c, [point(left, front), point(right, front), point(right, front, 0), point(left, front, 0)], "#4c3d30");
  }
  fill(c, [point(left, front), point(right, front), point(right, back), point(left, back)],
    scene.kind === "flood" ? "#5d6153" : "#877354", "#b09a74");
  for (let b = front + 3; b < back; b += 3.5) {
    line(c, point(left + 1, b), point(right - 1, b), b % 2 ? "#5b4d3f" : "#6e5d46", .85);
  }
  for (const x of [left + 2, right - 2]) {
    line(c, point(x, front - 2, 0), point(x, front - 2, h + 7), "#655a46", perspective ? 2.6 : 2);
    line(c, point(x, back - 2, 0), point(x, back - 2, h + 8), "#776b50", perspective ? 2.6 : 2);
    if (scene.kind === "watch" || scene.kind === "flood") {
      line(c, point(x, 7, h + 8), point(x, back, h + 8), "#a99872", 2);
    }
  }
  const lamp = point(left + 2, 3, h + 9);
  if (lamp && scene.kind !== "outpost") {
    glow(c, ...lamp, perspective ? 28 : 16, scene.kind === "flood" ? "#ef915486" : "#ffd38e87");
    disk(c, ...lamp, perspective ? 2.9 : 1.9, "#f2d9a4");
  }
}

function drawBuilding(c, scene, project, perspective) {
  const left = -scene.width * .45, right = -left, front = 13, back = scene.kind === "shelter" ? 42 : 35;
  const wall = scene.kind === "camp" ? 13 : scene.kind === "watch" ? 24 : 19;
  const point = (x, y, z = 0) => project(...world(scene, x, y), z);
  if (perspective) {
    fill(c, [point(right, front), point(right, back), point(right, back, wall), point(right, front, wall)], "#364642");
    fill(c, [point(left, front), point(right, front), point(right, front, wall), point(left, front, wall)], "#555949", "#8d8b6b");
    if (scene.kind !== "camp") {
      for (const center of [left * .52, right * .52]) {
        fill(c, [point(center - 3, front, wall * .41), point(center + 3, front, wall * .41),
          point(center + 3, front, wall * .72), point(center - 3, front, wall * .72)],
        scene.kind === "outpost" ? "#213233" : "#e5bd77");
      }
    }
  }
  const eaves = scene.kind === "camp" ? wall * .72 : wall;
  const ridge = wall + 7;
  fill(c, [point(left - 3, front - 2, eaves), point(left - 3, back + 2, eaves),
    point(0, back + 2, ridge), point(0, front - 2, ridge)], scene.roof, "#9b9476");
  fill(c, [point(0, front - 2, ridge), point(0, back + 2, ridge),
    point(right + 3, back + 2, eaves), point(right + 3, front - 2, eaves)], "#394c49", "#7c8470");
  if (perspective) {
    fill(c, [point(left - 3, front - 2, eaves), point(right + 3, front - 2, eaves),
      point(0, front - 2, ridge)], "#6e6a51", "#9b9476");
  }
}

function drawCypress(c, scene, project, perspective) {
  const anchor = project(...world(scene, 11, 21), 2);
  if (!anchor) return;
  const top = perspective ? project(...world(scene, 11, 21), 35) : [anchor[0] - 4, anchor[1] - 12];
  if (!top) return;
  line(c, anchor, top, "#89755a", perspective ? 7 : 5);
  line(c, [top[0], top[1] + 4], [top[0] + (perspective ? 18 : 8), top[1] - (perspective ? 15 : 7)], "#a38c67", 3);
  line(c, [top[0], top[1] + 9], [top[0] - (perspective ? 19 : 9), top[1] - (perspective ? 8 : 5)], "#746852", 3);
}

export function drawLandmark(c, scene, project, perspective = false) {
  drawDeck(c, scene, project, perspective);
  if (scene.kind === "cypress") drawCypress(c, scene, project, perspective);
  if (["camp", "outpost", "watch", "shelter"].includes(scene.kind)) drawBuilding(c, scene, project, perspective);
}

function sprite(c, image, x, bottom, height, flip = false, tint = 0) {
  if (!image.complete || !image.naturalWidth) return false;
  const width = height * image.naturalWidth / image.naturalHeight;
  c.save();
  c.translate(x, bottom);
  if (flip) c.scale(-1, 1);
  if (tint) c.filter = "hue-rotate(" + tint + "deg)";
  c.drawImage(image, -width / 2, -height, width, height);
  c.restore();
  return true;
}

export function drawStandingPerson(c, x, y, height, person) {
  c.save();
  c.globalAlpha *= .92;
  c.fillStyle = "#091615b5";
  c.beginPath();
  c.ellipse(x, y, height * .24, height * .075, 0, 0, tau);
  c.fill();
  const flip = person % 2 === 1;
  if (!sprite(c, images.survivor, x, y, height, flip, tints[person % tints.length])) {
    line(c, [x - height * .12, y], [x, y - height * .54], "#544c3c", height * .12);
    line(c, [x + height * .13, y], [x, y - height * .54], "#544c3c", height * .12);
    line(c, [x, y - height * .42], [x, y - height * .74], vests[person % vests.length], height * .22);
    disk(c, x, y - height * .86, height * .115, "#dfbf9c");
  }
  c.restore();
}

export function drawApparition(c, x, bottom, height, opacity, time) {
  if (!opacity) return;
  c.save();
  c.globalAlpha = opacity;
  const y = bottom + Math.sin(time * 1.6) * height * .048;
  if (!sprite(c, images.specter, x, y, height)) glow(c, x, y - height * .42, height * .48, "#a8d7e9b5");
  c.restore();
}

export function drawDeckCrew(c, x, y, size, person, isOperator = false) {
  const vest = isOperator ? "#748d78" : vests[person % vests.length];
  c.fillStyle = "#102023";
  c.fillRect(x - size * .7, y - size * .69, size * 1.23, size * 1.38);
  c.fillStyle = vest;
  c.fillRect(x - size * .59, y - size * .59, size * .98, size * 1.18);
  disk(c, x + size * .44, y, size * .43, isOperator ? "#c6ae90" : "#d6b69a");
}

export function drawSeated(c, x, bottom, height, person, isOperator = false) {
  const image = isOperator ? images.operator : images.passenger;
  if (!sprite(c, image, x, bottom, height, !isOperator && person % 2 === 1, isOperator ? 0 : tints[person % tints.length])) {
    c.fillStyle = isOperator ? "#4e6b60" : vests[person % vests.length];
    c.beginPath();
    c.ellipse(x, bottom - height * .26, height * .34, height * .28, 0, 0, tau);
    c.fill();
    disk(c, x, bottom - height * .68, height * .16, "#b4997e");
  }
}
