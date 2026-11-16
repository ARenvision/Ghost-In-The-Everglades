import {
  WIDTH, HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, CAPACITY, landmarks, barriers, missions, trainingMission, createState, passengerTotal, resolveRouteSetup, chooseNewRouteSetup,
  board, unload, updateClosures, waterClearance,
} from "./missions.mjs";
import { drawTerrain, drawRipples, drawClosures, drawClosureCue } from "./map.mjs";
import { createClosure, stepClosure, closureCue } from "./closure.mjs";
import { closureRegistry, sharedLines } from "./closure-registry.mjs";
import { drawOperator } from "./operator.mjs";
import { RadioVoice, currentCaption } from "./radio.mjs";
import { lines } from "./radio-lines.mjs";
import { loadBestTimes, saveBestTimes, applyFinishTime, formatRunTime, wrongWayApproach, updateGhostWarning, warningPosition } from "./play-progress.mjs";
import {
  sceneFor, safeDock, groupOnDock, remainingPeople, apparitionOpacity,
  drawLandmark, drawStandingPerson, drawApparition, drawDeckCrew,
} from "./rescue-scenes.mjs";

const $ = id => document.getElementById(id);
const menu = $("menu"), game = $("game"), canvas = $("waterway");
const ctx = canvas.getContext("2d", { alpha: false });
const dialog = $("dialog");
const ghostImage = new Image();
ghostImage.src = "assets/lantern-keeper.png";
canvas.tabIndex = -1;

const pressed = new Set();
const pointers = new Map();
const keyActions = {
  ArrowUp: "throttle", w: "throttle", ArrowDown: "brake", " ": "brake",
  ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right",
};
let selection = 0, practice, selectedMission, state, boat, active = false, chart = false, operatorView = false, dialogMode;
const touchLayout = matchMedia("(pointer: coarse)");
let lastDraw = -Infinity;
const voice = new RadioVoice();
const clipsStarted = new Set();
voice.onStart = id => clipsStarted.add(id);
const warnings = new Set();
const storage = () => window.localStorage;
const bestTimes = loadBestTimes(storage);
let ghostWarning;
let closure, closureWarmed = null;
let lastTime = 0, nextCall = 3, currentCall, heldLine = null;
let message = "", messageUntil = 0, messagePriority = 0, messageCurrent = null;
let lastGhost = -Infinity, ghostExposure = 0;
let transfer = 0, lastTransfer, bumpAt = -Infinity;

const fmt = t => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
const mission = () => practice ? trainingMission : selectedMission;
const briefingId = () => practice ? "brief-training" : mission().setup?.briefing ?? "brief-" + (selection + 1);
const recordId = entry => entry.recordId ?? entry.id;
const runTime = () => Math.round((state.finalTime ?? state.elapsed) * 10);
const recordLabel = id => bestTimes[id] ? formatRunTime(bestTimes[id]) : "—";
const total = () => passengerTotal(mission());
const controlsOn = () => active && !dialog.open && !chart;
const at = location => Math.hypot(landmarks[location][0] - boat.x, landmarks[location][1] - boat.y);
const held = action => [...pressed].some(key => keyActions[key] === action) ||
  [...pointers.values()].some(button => button.dataset.hold === action);
const direction = ([x, y]) => ["E", "SE", "S", "SW", "W", "NW", "N", "NE"][
  (Math.round(Math.atan2(y - boat.y, x - boat.x) * 4 / Math.PI) + 8) % 8];

function setText(id, value) {
  const node = $(id);
  if (node.textContent !== value) node.textContent = value;
}

function clearInput() {
  pressed.clear();
  for (const button of pointers.values()) button.classList.remove("held");
  pointers.clear();
}

function select(index, setup) {
  if (index !== selection || !selectedMission || setup) {
    selectedMission = resolveRouteSetup(missions[index], setup);
  }
  selection = index;
  for (const [i, button] of [...$("missions").children].entries()) button.setAttribute("aria-pressed", i === index);
  const setupName = selectedMission.setup?.name;
  setText("brief-number", "MISSION " + String(index + 1).padStart(2, "0") + " / " + selectedMission.region);
  setText("brief-title", selectedMission.title);
  setText("brief-copy", setupName ? setupName + " · " + selectedMission.brief : selectedMission.brief);
  $("new-run-menu").hidden = !setupName;
  refreshRecords();
  voice.warm(briefingId()).catch(() => {});
}

function newRun() {
  const setup = chooseNewRouteSetup(missions[selection], selectedMission.setup);
  if (!setup) return;
  select(selection, setup);
  start();
}

function refreshRecords() {
  for (const [i, button] of [...$("missions").children].entries()) {
    const entry = i === selection ? selectedMission : resolveRouteSetup(missions[i]);
    const id = recordId(entry);
    button.lastChild.textContent = bestTimes[id] ? "Best " + recordLabel(id) : "No time set";
  }
}

for (const [index, entry] of missions.entries()) {
  const button = document.createElement("button");
  button.className = "mission";
  button.innerHTML = '<span></span><b></b><span class="mission-record"></span>';
  button.firstChild.textContent = String(index + 1).padStart(2, "0");
  button.querySelector("b").textContent = entry.title;
  button.addEventListener("click", () => select(index));
  $("missions").append(button);
}
select(0);

function updateCameraControls() {
  $("view").setAttribute("aria-pressed", operatorView);
  setText("view", operatorView ? "View: Operator" : "View: Overhead");
  canvas.setAttribute("aria-label", chart ? "Navigation chart of the rescue area" :
    operatorView ? "Airboat operator view looking down the channel" : "Overhead view of your airboat and surrounding waterways");
  lastDraw = -Infinity;
}

function setChart(value) {
  chart = value;
  if (chart && practice?.stage === "chart") practice.stage = "close-chart";
  if (!chart && practice?.stage === "close-chart") practice.stage = boat.beam ? "light-off" : "light-on";
  $("map").setAttribute("aria-pressed", value);
  $("map-label").hidden = !value;
  updateCameraControls();
  clearInput();
}

function toggleView() {
  if (!active || dialog.open) return;
  operatorView = !operatorView;
  if (chart) setChart(false);
  else updateCameraControls();
  canvas.focus();
}

function start() {
  if (dialog.open) dialog.close();
  const training = Boolean(practice);
  if (training) {
    practice = { stage: "drive", steered: false };
    operatorView = false;
  }
  state = createState(mission());
  state.timeToBeat = bestTimes[recordId(mission())];
  ghostWarning = { approach: null, seconds: 0, until: 0, next: 0 };
  boat = { x: landmarks.station[0], y: landmarks.station[1], angle: -.20, speed: 0, beam: true };
  active = true;
  setChart(false);
  menu.hidden = true;
  game.hidden = false;
  currentCall = null;
  nextCall = 3;
  warnings.clear();
  clipsStarted.clear();
  heldLine = null;
  closure = createClosure(mission());
  closureWarmed = null;
  for (const id of Object.values(sharedLines)) voice.warm(id).catch(() => {});
  messageUntil = 0;
  messagePriority = 0;
  lastGhost = -Infinity;
  ghostExposure = 0;
  transfer = 0;
  lastTransfer = null;
  bumpAt = -Infinity;
  $("beam").setAttribute("aria-pressed", true);
  $("race-times").hidden = training;
  setText("mission-label", training ? "HOW TO PLAY / RANGER STATION" : "MISSION " + String(selection + 1).padStart(2, "0") + " / " + mission().region);
  setText("mission-title", mission().title);
  $("route-setup").hidden = !mission().setup;
  setText("route-setup", mission().setup?.name ?? "");
  voice.stop();
  voice.unlock();
  transmit(briefingId(), 3);
  updateHUD();
  window.scrollTo(0, 0);
  canvas.focus();
}

function mainMenu() {
  voice.stop();
  active = false;
  practice = null;
  clearInput();
  if (dialog.open) dialog.close();
  game.hidden = true;
  menu.hidden = false;
  $("launch").focus();
  window.scrollTo(0, 0);
}

function showDialog(mode, label, title, copy, primary) {
  dialogMode = mode;
  clearInput();
  setText("dialog-label", label);
  setText("dialog-title", title);
  setText("dialog-copy", copy);
  setText("dialog-primary", primary);
  $("dialog-primary").hidden = mode === "failed";
  $("menu-button").hidden = false;
  const hasSetups = Boolean(mission().setup);
  $("retry").textContent = hasSetups ? "Retry same route" : mode === "complete" ? "Replay mission" : "Restart mission";
  $("new-run").hidden = !hasSetups;
  dialog.showModal();
}

function pause() {
  if (!active || dialog.open) return;
  voice.stop();
  heldLine = null;
  showDialog("pause", "RESCUE ONE", "Rescue paused", "Your boat and mission clock are on hold.", "Resume");
}

function closePause() {
  voice.unlock();
  dialog.close();
  canvas.focus();
}

function finish() {
  if (practice) {
    showDialog("complete", "TRAINING COMPLETE", "Practice rescue complete.",
      "You brought the volunteer home. You can now try any of the five rescue missions.", "Main menu");
    $("retry").textContent = "Replay training";
    $("menu-button").hidden = true;
    transmit("complete", 6);
    return;
  }
  const end = selection === missions.length - 1;
  const record = state.newRecord
    ? (state.recordSaved ? "New personal best." : "New personal best for this session.")
    : "Time to beat · " + recordLabel(recordId(mission()));
  showDialog("complete", end ? "CAMPAIGN FINALE" : "MISSION COMPLETE", "Everyone’s home.",
    state.delivered + " safely ashore · " + state.trips + (state.trips === 1 ? " rescue trip · " : " rescue trips · ") +
      formatRunTime(runTime()) + ". " + record + (mission().setup ? " Route: " + mission().setup.name + "." : ""),
    end ? "Main menu" : "Next mission");
  $("menu-button").hidden = end;
  transmit(end ? "finale" : "complete", 6);
  tone(590, .28);
}

function recordFinish() {
  if (practice) return;
  const id = recordId(mission());
  const time = runTime();
  const result = applyFinishTime(bestTimes, id, time);
  if (!result.saved) return;
  bestTimes[id] = result.times[id];
  state.newRecord = true;
  state.recordSaved = saveBestTimes(storage, bestTimes);
  refreshRecords();
}

function fail() {
  showDialog("failed", "MISSION ENDED", "The platform went under.",
    state.delivered + " safely ashore. Head to the flooding platform first on the next run.", "");
  transmit("failed", 6);
}

function announce(text, seconds = 3.1, priority = 0, isCurrent = null) {
  if (state.elapsed < messageUntil && messagePriority > priority) return;
  message = text;
  messageCurrent = isCurrent;
  messageUntil = state.elapsed + seconds;
  messagePriority = priority;
}

function transmit(id, priority, place, isCurrent = null, voicePriority = priority) {
  const line = lines[id];
  const where = place ? " (" + place + ")" : "";
  announce(line.speaker + where + " · " + line.text, Math.max(3.1, line.text.length / 15), priority, isCurrent);
  voice.say(id, voicePriority, 0, isCurrent);
}

function tone(hz, length = .18) {
  const audio = voice.context;
  if (!voice.enabled || !audio || audio.state !== "running") return;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = hz;
  gain.gain.setValueAtTime(.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(voice.current ? .03 : .075, audio.currentTime + .04);
  gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + length);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + length + .01);
}

function toggleBeam() {
  if (!controlsOn()) return;
  boat.beam = !boat.beam;
  $("beam").setAttribute("aria-pressed", boat.beam);
  if (practice?.stage === "light-off" && !boat.beam) practice.stage = "light-on";
  else if (practice?.stage === "light-on" && boat.beam) practice.stage = "find";
  announce(boat.beam ? "Searchlight on." : "Searchlight off.", 1.3);
}

function move(dt) {
  const turn = Number(held("right")) - Number(held("left"));
  const braking = held("brake");
  if (practice?.stage === "drive" && turn && boat.speed > 12) practice.steered = true;
  boat.angle += turn * (boat.speed > 92 ? 1.82 : 2.26) * dt;
  boat.speed = Math.max(0, Math.min(140, boat.speed + dt * (braking ? -280 : held("throttle") ? 129 : -51)));
  const x = boat.x + Math.cos(boat.angle) * boat.speed * dt;
  const y = boat.y + Math.sin(boat.angle) * boat.speed * dt;
  const current = waterClearance(boat.x, boat.y, state.closed);
  const proposed = waterClearance(x, y, state.closed);
  if (proposed >= 8 || (current < 8 && proposed >= current && boat.speed > 0)) {
    boat.x = x; boat.y = y;
    return;
  }
  boat.speed = 0;
  if (state.elapsed - bumpAt > 2.1) {
    announce("Shallow water or a closed channel · turn back toward the channel.", 2);
    bumpAt = state.elapsed;
    tone(110);
  }
}

function inBeam(x, y, range = 185) {
  if (!boat.beam) return false;
  const dx = x - boat.x, dy = y - boat.y;
  const distance = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) - boat.angle;
  return distance < range && (distance < 26 || Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < .38);
}

function scan(dt) {
  if (practice && practice.stage !== "find") return;
  const ghost = mission().ghost;
  const beamOnGhost = ghost && inBeam(...landmarks[ghost]);
  ghostExposure = beamOnGhost ? ghostExposure + dt : 0;
  if (ghostExposure > .35) {
    lastGhost = state.elapsed;
    if (!state.ghostSeen) {
      state.ghostSeen = true;
      transmit("keeper-reveal", 3);
    }
  }
  for (const site of state.sites) {
    if (site.confirmed) continue;
    const scene = sceneFor(site);
    site.exposure = inBeam(scene.x, scene.y, 150) ? site.exposure + dt : 0;
    if (site.exposure > .68) {
      site.confirmed = true;
      if (clipsStarted.has(site.call)) transmit("confirmed", 4, site.name);
      else {
        // The approach call never started: play it once now, then queue the confirmation behind it.
        // Both at voice priority 5 so the confirmation waits in the pending slot instead of preempting the call.
        voice.say(site.call, 5);
        transmit("confirmed", 4, site.name, null, 5);
      }
      tone(480, .31);
    }
  }
}

function radio() {
  if (state.elapsed < nextCall) return;
  nextCall = state.elapsed + 5.5;
  if (state.elapsed < messageUntil && messagePriority > 1) return;
  const nearby = state.sites.filter(site => !site.confirmed && at(site.at) < 285)
    .map(site => {
      const { x, y } = sceneFor(site);
      return { position: [x, y], id: site.call };
    });
  const ghost = mission().ghost;
  if (ghost && !state.ghostSeen && at(ghost) < 340) nearby.push({ position: landmarks[ghost], id: "keeper" });
  if (!nearby.length) { currentCall = null; return; }
  const prior = nearby.findIndex(call => call.id === currentCall?.id);
  currentCall = { ...nearby[(prior + 1) % nearby.length], until: state.elapsed + 4.2 };
  const [x, y] = currentCall.position;
  const bearing = Math.atan2(y - boat.y, x - boat.x);
  voice.say(currentCall.id, 1, .68 * Math.sin(bearing - boat.angle));
}

function boardOrDeliver(dt) {
  const home = boat.speed < 15 && at("station") < 36 && state.aboard > 0;
  const site = boat.speed < 16 && state.aboard < CAPACITY ?
    state.sites.find(site => {
      if (!site.confirmed || !site.remaining) return false;
      const scene = sceneFor(site);
      return Math.hypot(scene.x - scene.nx * 12 - boat.x, scene.y - scene.ny * 12 - boat.y) < 32;
    }) : null;
  const location = home ? "station" : site?.at;
  if (location !== lastTransfer) transfer = 0;
  lastTransfer = location;
  if (!location) return;
  transfer += dt;
  if (transfer < .63) return;
  transfer = 0;
  if (home && unload(state)) {
    if (state.delivered === total()) {
      state.finalTime = state.elapsed;
      recordFinish();
      announce("Ranger station · everyone is safely ashore.", 2, 6);
    } else {
      transmit("return-more", 4, "Ranger station");
      tone(560, .25);
    }
  } else if (site && board(state, site)) {
    const remaining = state.sites.some(pickup => pickup.remaining);
    if (!remaining) boardingLine("return-last", 4);
    else if (state.aboard === CAPACITY) boardingLine("return-full", 4);
    else if (!site.remaining) boardingLine("one-aboard", 2);
    else announce("One person aboard.");
    tone(430);
  }
}

// While a missed survivor call and its confirmation hold the radio (confirmed pending at voice priority 5),
// the radio would drop a boarding line. Hold it and say it once the radio has room, if the load is unchanged.
function boardingLine(id, priority) {
  const replaying = voice.pending?.id === "confirmed" && voice.pending.priority === 5;
  transmit(id, priority);
  if (replaying) heldLine = { id, priority, aboard: state.aboard };
}

function releaseHeldLine() {
  if (!heldLine || voice.pending || voice.current?.priority >= heldLine.priority) return;
  if (heldLine.aboard === state.aboard) voice.say(heldLine.id, heldLine.priority);
  heldLine = null;
}

function update(dt) {
  state.elapsed += dt;
  if (state.finalTime !== null) {
    if (state.elapsed - state.finalTime >= 1.5) finish();
    return;
  }
  const newClosures = updateClosures(state, mission());
  if (newClosures.length) {
    const closedHere = waterClearance(boat.x, boat.y, state.closed) < 8;
    if (closedHere) {
      for (const closure of newClosures) state.closed.delete(closure.id);
    } else {
      transmit(newClosures.length > 1 ? "storm-closed" : "cut-closed", 5);
      tone(152, .45);
    }
  }
  if (state.sites.some(site => site.remaining && state.elapsed >= site.deadline)) { fail(); return; }
  warnOnce("cut-warning", mission().closures?.some(closure =>
    closure.time > state.elapsed && closure.time - state.elapsed <= 10));
  warnOnce("flood-warning", state.sites.some(site =>
    site.remaining && site.deadline && site.deadline - state.elapsed <= 23));
  move(dt);
  updateClosure();
  if (practice) updatePractice();
  else if (state.closed.size) {
    const wrongWay = wrongWayApproach(boat, state.closed);
    if (updateGhostWarning(ghostWarning, wrongWay, state.elapsed, dt, held("throttle") || boat.speed > 8, boat)) {
      voice.say("wrong-way", 5);
    }
  }
  scan(dt);
  radio();
  boardOrDeliver(dt);
  releaseHeldLine();
}

function updateClosure() {
  if (!closure.active) return;
  const remaining = state.sites.reduce((sum, site) => sum + site.remaining, 0);
  const sites = state.sites.map(site => ({ at: site.at, remaining: site.remaining }));
  const { effects } = stepClosure(closure, {
    elapsed: state.elapsed, boat: { x: boat.x, y: boat.y }, aboard: state.aboard, remaining, sites, closed: state.closed,
  });
  if (closure.target && closureWarmed !== closure.target) {
    closureWarmed = closure.target;
    const entry = closureRegistry.find(item => item.id === closure.target);
    if (entry) voice.warm(entry.line).catch(() => {});
  }
  for (const effect of effects) applyClosureEffect(effect);
}

function applyClosureEffect(effect) {
  if (effect.type === "close") {
    state.closed.add(effect.id);
    tone(152, .45);
  } else if (effect.type === "transmit") {
    const ev = closure, epoch = effect.epoch;
    const isCurrent = () => closure === ev && ev.epoch === epoch;
    voice.dropStale();
    transmit(effect.id, effect.priority, effect.place, isCurrent);
  }
}

function warnOnce(id, condition) {
  if (!condition || warnings.has(id)) return;
  warnings.add(id);
  transmit(id, 5);
}

function caption() {
  if (warningPosition(ghostWarning, state.elapsed)) {
    return lines["wrong-way"].speaker + " · " + lines["wrong-way"].text;
  }
  if (state.elapsed < messageUntil) return currentCaption(message, messageCurrent);
  if (!currentCall || state.elapsed >= currentCall.until) return "";
  return direction(currentCall.position) + " · “" + lines[currentCall.id].text + "”";
}

function updateHUD() {
  const unconfirmed = state.sites.some(s => !s.confirmed);
  const pickup = state.sites.some(s => s.confirmed && s.remaining);
  const home = state.aboard === CAPACITY || (state.aboard > 0 && !unconfirmed && !pickup);
  setText("objective", practiceObjective() ?? (home ? "Return to the ranger station and brake to unload." : pickup ?
    "Reach a verified pickup point. Brake alongside to bring survivors aboard." :
    boat.x < landmarks.sectorGate[0] ?
      "Find an open channel into the rescue sector. Check the chart for roadblocks." :
      "Look for the rescue landmark. Sweep the banks for people signaling back."));
  setText("aboard", state.aboard + " / " + CAPACITY);
  setText("saved", state.delivered + " / " + total());
  setText("elapsed", formatRunTime(runTime()));
  setText("best-time", state.timeToBeat ? formatRunTime(state.timeToBeat) : "—");
  $("caption").classList.toggle("ghost-warning", !chart && Boolean(warningPosition(ghostWarning, state.elapsed)));
  const urgent = state.sites.find(s => s.deadline && s.remaining);
  const upcoming = (mission().closures ?? []).find(c => c.time && !state.closed.has(c.id));
  const names = [...mission().roadblocks, ...(mission().closures ?? [])]
    .filter(c => state.closed.has(c.id)).map(c => c.name);
  const cue = closureCue(closure, state.elapsed);
  if (cue && !names.includes(cue.name) && state.closed.has(cue.id)) names.push(cue.name);
  const cueText = !cue ? "" : cue.stage === "deferred" ? cue.name + " deferred, clear the channel" :
    cue.stage === "closed" ? "" : cue.name + " closing in " + fmt(Math.ceil(cue.remaining));
  setText("conditions", practice ? "Practice patrol · untimed" : urgent ? "Flooding platform · " + fmt(Math.max(0, urgent.deadline - state.elapsed)) + " left" :
    cueText ? cueText :
    upcoming ? upcoming.name + " closes in " + fmt(Math.max(0, upcoming.time - state.elapsed)) :
    names.length ? names.join(" and ") + " closed" : "Slow to board and unload.");
  setText("caption", chart ? "" : caption());
}

function updatePractice() {
  if (practice.stage === "drive" && at("station") > 28 && practice.steered) practice.stage = "brake";
  if (practice.stage === "brake" && held("brake") && boat.speed < 8) practice.stage = "chart";
}

function practiceObjective() {
  if (!practice) return null;
  if (state.finalTime !== null) return "The volunteer is safely ashore.";
  if (state.aboard) return "Steer back to the ranger station. Brake beside the dock to unload.";
  if (state.sites[0].confirmed) return "Slow down beside the practice dock. The volunteer will board automatically.";
  switch (practice.stage) {
    case "drive": return touchLayout.matches ? "Hold Throttle and tap a steering arrow while moving." :
      "Hold W or ↑ to move. Use A and D or the arrow keys to steer while underway.";
    case "brake": return touchLayout.matches ? "Hold Brake until the boat stops." : "Hold Space or ↓ to bring the boat to a stop.";
    case "chart": return "Open the Map to see the ranger station and practice dock.";
    case "close-chart": return "Close the Map to return to piloting.";
    case "light-off": return touchLayout.matches ? "Tap Light to switch the searchlight off." : "Press L to switch the searchlight off.";
    case "light-on": return touchLayout.matches ? "Tap Light again to switch it back on." : "Press L again to switch it back on.";
    default: return "Head east along the launch channel. Sweep your searchlight across the practice dock.";
  }
}

function halo(x, y, color, radius) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
}

function marker(x, y, label, color) {
  ctx.font = "600 14px system-ui";
  const w = ctx.measureText(label).width + 13;
  ctx.fillStyle = "#091a1be8";
  ctx.fillRect(x - w / 2, y - 37, w, 23);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(label, x, y - 21);
  ctx.fillRect(x - 3, y - 3, 6, 6);
}

function lightCone() {
  if (!boat.beam || chart) return;
  const radius = 185;
  const light = ctx.createRadialGradient(boat.x, boat.y, 9, boat.x, boat.y, radius);
  light.addColorStop(0, "#e1efd958");
  light.addColorStop(.52, "#e0f1ce37");
  light.addColorStop(1, "#ccf5d000");
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(boat.x, boat.y);
  ctx.arc(boat.x, boat.y, radius, boat.angle - .38, boat.angle + .38);
  ctx.closePath();
  ctx.fill();
}

function drawSignals() {
  if (!mission().ghost) return;
  const [gx, gy] = landmarks[mission().ghost];
  const ghostNearby = Math.hypot(gx - boat.x, gy - boat.y) < 340;
  if (!chart && ghostNearby) {
    const pulse = .18 + .55 * Math.max(0, Math.cos(state.elapsed * 2.7)) ** 2;
    ctx.globalAlpha = pulse;
    halo(gx, gy, "#a0ddfe", 27);
    ctx.globalAlpha = 1;
  }
  const visibility = Math.max(0, 1 - (state.elapsed - lastGhost) / 2.4);
  if (!chart && visibility && ghostImage.complete && ghostImage.naturalWidth) {
    ctx.globalAlpha = visibility * (.72 + .14 * Math.sin(state.elapsed * 3.2));
    ctx.drawImage(ghostImage, gx - 45, gy - 78, 90, 90);
    ctx.globalAlpha = 1;
  }

}

function drawRescueScenes() {
  const overhead = (x, y) => [x, y];
  drawLandmark(ctx, safeDock, overhead);
  for (const person of groupOnDock(safeDock, state.safePeople)) {
    drawStandingPerson(ctx, person.x, person.y, 16, person.person);
  }
  for (const site of state.sites) {
    const scene = sceneFor(site);
    drawLandmark(ctx, scene, overhead);
    if (!site.confirmed && Math.hypot(scene.x - boat.x, scene.y - boat.y) > 270) continue;
    for (const person of groupOnDock(scene, remainingPeople(site))) {
      drawStandingPerson(ctx, person.x, person.y, 17, person.person);
    }
    if (!practice) drawApparition(ctx, scene.x, scene.y - 10, 41, apparitionOpacity(site, state.elapsed), state.elapsed);
  }
}

function drawBoat() {
  ctx.save();
  ctx.translate(boat.x, boat.y);
  ctx.rotate(boat.angle);
  if (!chart && boat.speed > 16) {
    ctx.strokeStyle = "#8ebeb18c";
    ctx.lineWidth = 1.5;
    const trail = 9 + boat.speed / 5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-10, side * 5);
      ctx.quadraticCurveTo(-trail * .65, side * 8, -trail, side * 12);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#e1e6ce";
  ctx.strokeStyle = "#a9fff1";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(7, 7);
  ctx.lineTo(-12, 7);
  ctx.lineTo(-13, -7);
  ctx.lineTo(7, -7);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#235254";
  ctx.fillRect(-9, -5, 5, 10);
  ctx.fillRect(0, -4, 5, 8);
  if (!chart) {
    drawDeckCrew(ctx, -5, 0, 4.5, 0, true);
    state.passengers.forEach((person, i) => drawDeckCrew(ctx, 5, i ? 3.6 : -3.6, 3.6, person));
  }
  ctx.restore();
}

function overheadCamera() {
  if (chart) {
    const scale = Math.min((WIDTH - 64) / WORLD_WIDTH, (HEIGHT - 66) / WORLD_HEIGHT);
    return { scale, x: (WIDTH - WORLD_WIDTH * scale) / 2, y: (HEIGHT - WORLD_HEIGHT * scale) / 2 };
  }
  const scale = 1.08;
  const lookX = boat.x + Math.cos(boat.angle) * 65;
  const lookY = boat.y + Math.sin(boat.angle) * 50;
  const offset = (center, window, world) => -Math.min(world * scale - window, Math.max(0, center * scale - window / 2));
  return { scale, x: offset(lookX, WIDTH, WORLD_WIDTH), y: offset(lookY, HEIGHT, WORLD_HEIGHT) };
}

function drawChartLabels(camera) {
  const label = ([x, y], text, color) => marker(camera.x + x * camera.scale, camera.y + y * camera.scale, text, color);
  label(landmarks.station, "Ranger station", "#afe3c7");
  if (!practice) label(landmarks.sectorGate, "Rescue sector entrance", "#b1d0c8");
  if (practice) label(landmarks.launchFork, "Practice dock", "#f3dfa1");
  if (!practice && !state.closed.has("reed-squeeze")) label(landmarks.reedNarrows, "Reed Narrows", "#b1d0c8");
  if (!practice && !state.closed.has("north-passage")) label(landmarks.cypressExit, "North Passage", "#b1d0c8");
  if (mission().setup && !state.closed.has("cypress-slip")) {
    const slip = barriers.get("cypress-slip");
    label([slip.x, slip.y], "Cypress Slip", "#b1d0c8");
  }
  if (state.ghostSeen) label(landmarks[mission().ghost], "Repeating signal", "#8dcced");
  for (const site of state.sites) {
    if (practice || !site.confirmed) continue;
    const scene = sceneFor(site);
    label([scene.x, scene.y], scene.title + (site.remaining ? " · " + site.remaining : " · Clear"), "#f3dfa1");
  }
  for (const block of [...mission().roadblocks, ...(mission().closures ?? [])]) {
    if (!state.closed.has(block.id)) continue;
    const barrier = barriers.get(block.id);
    label([barrier.x, barrier.y], block.name + " · blocked", "#ffba88");
  }
  const cue = closureCue(closure, state.elapsed);
  if (cue && cue.stage === "closed" && state.closed.has(cue.id)) {
    const barrier = barriers.get(cue.id);
    label([barrier.x, barrier.y], cue.name + " · blocked", "#ffba88");
  } else if (cue && cue.stage !== "closed") {
    const barrier = barriers.get(cue.id);
    const word = cue.stage === "warning" ? "closing" : cue.stage;
    label([barrier.x, barrier.y], cue.name + " · " + word, "#ffd27a");
  }
}

function draw() {
  if (operatorView && !chart) {
    drawOperator(ctx, {
      boat, state, mission: mission(), ghostImage,
      wrongWayGhost: warningPosition(ghostWarning, state.elapsed),
      ghostVisibility: Math.max(0, 1 - (state.elapsed - lastGhost) / 2.4),
      lowDetail: touchLayout.matches,
      closureCue: closureCue(closure, state.elapsed),
    });
    if (transfer > 0 && lastTransfer) {
      ctx.fillStyle = "#0a191b";
      ctx.fillRect(WIDTH / 2 - 45, HEIGHT - 133, 90, 6);
      ctx.fillStyle = "#b9e7d6";
      ctx.fillRect(WIDTH / 2 - 45, HEIGHT - 133, 90 * transfer / .63, 6);
    }
    return;
  }
  const camera = overheadCamera();
  ctx.fillStyle = "#0a171a";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);
  drawTerrain(ctx, chart);
  if (!chart) {
    drawRipples(ctx, state.elapsed, { x: boat.x, y: boat.y, radius: 660 });
    const shade = ctx.createRadialGradient(boat.x, boat.y, 65, boat.x, boat.y, 585);
    shade.addColorStop(0, "#080f1508");
    shade.addColorStop(1, "rgba(4, 11, 17," + mission().fog * .82 + ")");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    lightCone();
  }
  drawClosures(ctx, state.closed);
  drawClosureCue(ctx, closureCue(closure, state.elapsed));
  const [sx, sy] = landmarks.station;
  if (!chart) {
    halo(sx, sy, "#9cdeba5e", 42);
    marker(sx, sy, "Ranger station", "#afe3c7");
    drawSignals();
    drawRescueScenes();
    const ghost = warningPosition(ghostWarning, state.elapsed);
    if (ghost) drawApparition(ctx, ghost.x, ghost.y + 8, 75, ghost.opacity, state.elapsed);
  }
  drawBoat();
  if (transfer > 0 && lastTransfer) {
    ctx.fillStyle = "#0a191b";
    ctx.fillRect(boat.x - 22, boat.y + 17, 44, 5);
    ctx.fillStyle = "#b9e7d6";
    ctx.fillRect(boat.x - 22, boat.y + 17, 44 * transfer / .63, 5);
  }
  ctx.restore();
  if (chart) drawChartLabels(camera);
}

function frame(now) {
  let remaining = Math.min(.25, (now - lastTime) / 1000);
  lastTime = now;
  if (active) {
    while (remaining > 0 && controlsOn()) {
      const step = Math.min(.03, remaining);
      update(step);
      remaining -= step;
    }
    updateHUD();
    if (!operatorView || chart || now - lastDraw >= (touchLayout.matches ? 32 : 15)) {
      draw();
      lastDraw = now;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

$("launch").addEventListener("click", () => { practice = null; start(); });
$("new-run-menu").addEventListener("click", newRun);
$("new-run").addEventListener("click", newRun);
$("training").addEventListener("click", () => { practice = {}; start(); });
$("home").addEventListener("click", mainMenu);
$("menu-button").addEventListener("click", mainMenu);
$("retry").addEventListener("click", () => { $("menu-button").hidden = false; start(); });
$("pause").addEventListener("click", pause);
$("view").addEventListener("click", toggleView);
$("map").addEventListener("click", () => { if (!dialog.open) { setChart(!chart); canvas.focus(); } });
$("beam").addEventListener("click", toggleBeam);
$("sound").addEventListener("click", () => {
  voice.setEnabled(!voice.enabled);
  $("sound").setAttribute("aria-pressed", voice.enabled);
  setText("sound", voice.enabled ? "Sound on" : "Sound off");
  if (voice.enabled && active && !dialog.open && state.elapsed < 5) {
    transmit(briefingId(), 3);
  } else if (voice.enabled) tone(390);
});
$("dialog-primary").addEventListener("click", () => {
  if (dialogMode === "pause") closePause();
  else if (practice || selection === missions.length - 1) { $("menu-button").hidden = false; mainMenu(); }
  else { select(selection + 1); start(); }
});
dialog.addEventListener("cancel", event => {
  event.preventDefault();
  if (dialogMode === "pause") closePause();
});

const normalized = event => event.key.length === 1 ? event.key.toLowerCase() : event.key;
window.addEventListener("keydown", event => {
  if (!active || dialog.open || event.altKey || event.ctrlKey || event.metaKey) return;
  const key = normalized(event);
  if (keyActions[key] && !(key === " " && event.target instanceof HTMLButtonElement)) {
    event.preventDefault();
    if (!chart) pressed.add(key);
    return;
  }
  if (event.repeat) return;
  if (key === "Escape") { event.preventDefault(); if (chart) setChart(false); else pause(); }
  if (key === "m") { event.preventDefault(); setChart(!chart); }
  if (key === "v") toggleView();
  if (key === "l") toggleBeam();
});
window.addEventListener("keyup", event => pressed.delete(normalized(event)));
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  clearInput();
  if (document.hidden && active && !dialog.open) pause();
});

for (const button of document.querySelectorAll("[data-hold]")) {
  button.addEventListener("pointerdown", event => {
    if (!controlsOn()) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, button);
    button.classList.add("held");
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (![...pointers.values()].includes(button)) button.classList.remove("held");
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, release);
}

// QA hook, enabled only by the URL query ?qa=1. Absent otherwise. Used by scripts/browser-check.mjs.
if (new URLSearchParams(location.search).get("qa") === "1") {
  window.__qa = {
    snapshot: () => ({
      active, dialogOpen: dialog.open, dialogMode, selection, practice: Boolean(practice),
      setup: state?.setup?.id ?? mission()?.setup?.id ?? null, recordId: mission() && recordId(mission()),
      boat: boat && { x: boat.x, y: boat.y, angle: boat.angle, speed: boat.speed },
      elapsed: state?.elapsed, finalTime: state?.finalTime, aboard: state?.aboard, delivered: state?.delivered,
      sites: state?.sites.map(s => ({ at: s.at, remaining: s.remaining, confirmed: s.confirmed, call: s.call })),
      closed: state && [...state.closed], timeToBeat: state?.timeToBeat,
      closure: closure && { phase: closure.phase, target: closure.target, epoch: closure.epoch, armedAt: closure.armedAt },
      voice: { enabled: voice.enabled, ctx: voice.context?.state, current: voice.current && { id: voice.current.id, priority: voice.current.priority, started: Boolean(voice.current.source) },
        pending: voice.pending?.id ?? null },
      message, messageUntil, messageCurrent: Boolean(messageCurrent), lastTime,
      captionText: $("caption").textContent, bestTimeText: $("best-time").textContent,
      bestTimes: { ...bestTimes },
    }),
    landmark: id => landmarks[id],
    siteScene: index => { const { x, y, nx, ny } = sceneFor(state.sites[index]); return { x, y, nx, ny }; },
    place: (x, y, angle = boat.angle, speed = 0) => { Object.assign(boat, { x, y, angle, speed }); },
    step: (seconds, dt = .03) => { for (let t = 0; t < seconds && state.finalTime === null; t += dt) update(dt); updateHUD(); },
    pickSetup: (mission, setup) => select(mission, missions[mission].routeSetups?.[setup]),
    fail: () => fail(),
  };
}
