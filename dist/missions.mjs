export const WIDTH = 1120;
export const HEIGHT = 680;
export const WORLD_WIDTH = 2240;
export const WORLD_HEIGHT = 930;
export const CAPACITY = 2;

function rescueSector(x, y) { return [x + 1010, y + 100]; }

export const landmarks = {
  station: [122, 670], launchFork: [300, 620], cypressMouth: [369, 435],
  cypressBend: [535, 335], highMarsh: [718, 396], cypressExit: [917, 473],
  northLanding: [1044, 533], reedTurn: [447, 700], mudBend: [638, 766],
  reedNarrows: [839, 698], willowBend: [1010, 723], sectorGate: rescueSector(168, 544),
  west: rescueSector(262, 273), northWest: rescueSector(346, 151),
  junction: rescueSector(364, 447), central: rescueSector(530, 337), north: rescueSector(534, 160),
  island: rescueSector(710, 229), east: rescueSector(944, 188), far: rescueSector(964, 386),
  south: rescueSector(798, 526), low: rescueSector(559, 532),
};

function route(id, from, to, radius, ...bends) {
  return { id, from, to, radius, points: [landmarks[from], ...bends, landmarks[to]] };
}

function sectorRoute(id, from, to, radius, ...bends) {
  return route(id, from, to, radius, ...bends.map(point => rescueSector(...point)));
}

export const routes = [
  route("launch-channel", "station", "launchFork", 46, [193, 655], [249, 629]),
  route("cypress-creek", "launchFork", "cypressMouth", 30, [315, 532], [336, 490]),
  route("cypress-squeeze", "cypressMouth", "cypressBend", 23, [419, 421], [464, 378], [496, 361]),
  route("high-marsh", "cypressBend", "highMarsh", 32, [595, 331], [659, 365]),
  route("fallen-cypress", "highMarsh", "cypressExit", 29, [781, 403], [847, 431]),
  route("north-passage", "cypressExit", "northLanding", 27, [966, 475], [1001, 504]),
  route("north-inlet", "northLanding", "sectorGate", 32, [1090, 554], [1135, 606]),
  route("reed-bend", "launchFork", "reedTurn", 33, [340, 674], [403, 676]),
  route("mud-bend", "reedTurn", "mudBend", 27, [502, 746], [558, 748], [604, 767]),
  route("reed-squeeze", "mudBend", "reedNarrows", 23, [690, 761], [743, 711], [788, 694]),
  route("willow-reach", "reedNarrows", "willowBend", 30, [892, 715], [952, 728]),
  route("south-inlet", "willowBend", "sectorGate", 32, [1067, 710], [1129, 675]),
  route("cross-marsh", "cypressBend", "mudBend", 24, [549, 425], [602, 528], [601, 618], [638, 689]),
  route("east-crossover", "cypressExit", "reedNarrows", 24, [930, 548], [873, 605], [824, 647]),
  sectorRoute("station-run", "sectorGate", "junction", 43, [222, 535], [287, 480]),
  sectorRoute("west-bay", "sectorGate", "west", 35, [176, 456], [222, 394], [246, 335]),
  sectorRoute("loop", "west", "junction", 36, [309, 306], [344, 365]),
  sectorRoute("west-spur", "west", "northWest", 38, [281, 219], [316, 191]),
  sectorRoute("north-ridge", "northWest", "north", 38, [399, 152], [453, 174]),
  sectorRoute("marker-run", "junction", "central", 44, [429, 438], [474, 395]),
  sectorRoute("cut", "central", "island", 34, [594, 330], [648, 282]),
  sectorRoute("reed-neck", "central", "north", 29, [512, 271], [550, 215]),
  sectorRoute("high-water", "north", "island", 35, [605, 171], [656, 195]),
  sectorRoute("outpost-run", "island", "east", 35, [781, 209], [859, 216]),
  sectorRoute("east-bank", "east", "far", 33, [929, 249], [949, 310]),
  sectorRoute("old-landing-run", "junction", "low", 36, [434, 480], [484, 522]),
  sectorRoute("south-run", "low", "south", 32, [646, 548], [718, 522]),
  sectorRoute("far-bend", "south", "far", 34, [861, 511], [920, 459]),
  route("cypress-slip", "low", "island", 25, [1575, 600], [1585, 568], [1612, 520], [1666, 481],
    [1723, 450], [1753, 404], [1751, 363]),
];

export const missions = [
  {
    id: "echo", title: "The Echo at Mile Marker 7", region: "SAWGRASS CHANNEL", fog: .3,
    routeSetups: [
      {
        id: "reed-narrows", name: "Reed Narrows", briefing: "brief-1",
        brief: "A tree blocks Cypress Creek and the Cypress Slip is closed. Take Reed Narrows and search for the broken cypress dock.",
        roadblocks: [{ id: "cypress-creek", name: "Cypress Creek" }, { id: "cypress-slip", name: "Cypress Slip" }],
      },
      {
        id: "north-approach", name: "North Approach", briefing: "brief-1-north",
        brief: "Reed Narrows and the Central Cut are blocked. Come in from the north, then choose High Water or the tight Cypress Slip.",
        roadblocks: [{ id: "reed-squeeze", name: "Reed Narrows" }, { id: "cut", name: "Central Cut" }],
      },
      {
        id: "south-crossover", name: "South Crossover", briefing: "brief-1-crossover",
        brief: "The North Inlet and both northern routes to the dock are blocked. Cross south and use the tight Cypress Slip, or take the long way around the east bank.",
        roadblocks: [{ id: "north-inlet", name: "North Inlet" }, { id: "high-water", name: "High Water" },
          { id: "cut", name: "Central Cut" }],
      },
    ],
    ghost: "south", sites: [{ at: "island", count: 3, name: "Broken cypress dock", call: "call-marker" }],
  },
  {
    id: "blackout", title: "The Blackout", region: "EASTERN OUTPOST", fog: .57,
    brief: "Debris blocks Reed Bend. Take the north approach and search for two people near the dark ranger outpost.",
    roadblocks: [{ id: "reed-bend", name: "Reed Bend" }],
    ghost: "island", sites: [{ at: "east", count: 2, name: "East outpost", call: "call-outpost" }],
  },
  {
    id: "closing-cut", title: "The Closing Cut", region: "NORTHERN WATERWAYS", fog: .44,
    brief: "The north inlet is blocked. Four people are waiting beyond the cut, which will close as the water rises.",
    roadblocks: [{ id: "north-inlet", name: "North Inlet" }],
    ghost: "north", sites: [{ at: "island", count: 4, name: "North cut platform", call: "call-cut" }],
    closures: [{ id: "cut", time: 65, name: "Central cut" }],
  },
  {
    id: "two-calls", title: "Two Calls, Two Seats", region: "REED ISLANDS", fog: .42,
    brief: "Mud Bend is blocked. The eastern platform is taking water. Find those people first, then head for the north ridge.",
    roadblocks: [{ id: "mud-bend", name: "Mud Bend" }],
    ghost: "island", sites: [{ at: "northWest", count: 2, name: "North ridge", call: "call-ridge" },
      { at: "far", count: 2, name: "Flooding platform", call: "call-platform", deadline: 150 }],
  },
  {
    id: "last-crossing", title: "The Last Crossing", region: "STORM CHANNEL", fog: .61,
    brief: "Storm debris has cut both approaches. Find an open crossover, then search the shelter and island dock for five people.",
    roadblocks: [{ id: "reed-squeeze", name: "Reed Narrows" }, { id: "north-passage", name: "North Passage" }],
    ghost: "east", sites: [{ at: "far", count: 3, name: "Storm shelter", call: "call-shelter" },
      { at: "island", count: 2, name: "Island dock", call: "call-island" }],
    closures: [{ id: "cut", delivered: 1, name: "Central cut" },
      { id: "east-bank", delivered: 1, name: "East bank" }],
  },
];

export const trainingMission = {
  title: "Training Patrol", region: "RANGER STATION", fog: .23,
  brief: "Practice steering, braking, the chart and searchlight on a short rescue with one volunteer.",
  roadblocks: [], sites: [{ at: "launchFork", count: 1, name: "Practice dock", call: "call-training" }],
};

export function resolveRouteSetup(mission, setup = mission.routeSetups?.[0]) {
  if (!setup) return mission;
  return {
    ...mission,
    setup,
    recordId: mission.id + ":" + setup.id,
    brief: setup.brief,
    roadblocks: setup.roadblocks,
  };
}

export function chooseNewRouteSetup(mission, current, random = Math.random) {
  const choices = mission.routeSetups?.filter(setup => setup !== current);
  return choices?.[Math.floor(random() * choices.length)];
}

export function createState(mission) {
  mission = resolveRouteSetup(mission, mission.setup);
  let nextPerson = 0;
  const sites = mission.sites.map(site => ({
    ...site,
    people: Array.from({ length: site.count }, () => nextPerson++),
    remaining: site.count, confirmed: false, exposure: 0,
  }));
  const closed = new Set(mission.roadblocks.map(block => block.id));
  if (!mission.setup) closed.add("cypress-slip");
  return {
    elapsed: 0, aboard: 0, delivered: 0, trips: 0, closed, ghostSeen: false,
    sites, passengers: [], safePeople: [], finalTime: null,
  };
}

export function passengerTotal(mission) {
  return mission.sites.reduce((sum, site) => sum + site.count, 0);
}

export function board(state, site) {
  if (!site.confirmed || site.remaining === 0 || state.aboard === CAPACITY) return false;
  state.passengers.push(site.people[site.count - site.remaining]);
  site.remaining--;
  if (!site.remaining) site.clearedAt = state.elapsed;
  state.aboard++;
  return true;
}

export function unload(state) {
  if (!state.aboard) return false;
  state.delivered += state.aboard;
  state.safePeople.push(...state.passengers);
  state.passengers.length = 0;
  state.aboard = 0;
  state.trips++;
  return true;
}

export function updateClosures(state, mission) {
  const added = [];
  for (const closure of mission.closures ?? []) {
    const triggered = state.elapsed >= (closure.time ?? Infinity) ||
      state.delivered >= (closure.delivered ?? Infinity);
    if (triggered && !state.closed.has(closure.id)) {
      state.closed.add(closure.id);
      added.push(closure);
    }
  }
  return added;
}

export function reachable(from, to, closed) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    if (at === to) return true;
    for (const edge of routes) {
      if (closed.has(edge.id)) continue;
      const next = edge.from === at ? edge.to : edge.to === at ? edge.from : null;
      if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return false;
}

function segment(a, b, radius) {
  return { ax: a[0], ay: a[1], dx: b[0] - a[0], dy: b[1] - a[1], radius };
}

export const barriers = new Map();
const routeSegments = routes.map(edge => {
  const result = edge.points.slice(1).map((p, i) => segment(edge.points[i], p, edge.radius));
  const index = Math.floor(result.length / 2);
  const original = result[index];
  const a = [original.ax + original.dx * .15, original.ay + original.dy * .15];
  const b = [original.ax + original.dx * .85, original.ay + original.dy * .85];
  const angle = Math.atan2(original.dy, original.dx);
  barriers.set(edge.id, {
    angle, width: edge.radius + 3,
    x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2,
  });
  return { id: edge.id, segments: result };
});

export function waterClearance(x, y, closed) {
  let best = -Infinity;
  for (const { id, segments } of routeSegments) {
    for (const s of segments) {
      const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / (s.dx ** 2 + s.dy ** 2)));
      best = Math.max(best, s.radius - Math.hypot(x - s.ax - t * s.dx, y - s.ay - t * s.dy));
    }
    if (!closed.has(id)) continue;
    const b = barriers.get(id);
    const dx = x - b.x, dy = y - b.y;
    const along = dx * Math.cos(b.angle) + dy * Math.sin(b.angle);
    const across = -dx * Math.sin(b.angle) + dy * Math.cos(b.angle);
    if (Math.abs(along) < 16 && Math.abs(across) < b.width) return -Infinity;
  }
  return best;
}
