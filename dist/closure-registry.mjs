// Closure registry: the 16 closable routes and their warning radio lines (Appendix B order).
const entries = [
  ["cypress-creek", "Cypress Creek"],
  ["cypress-squeeze", "Cypress Squeeze"],
  ["high-marsh", "High Marsh"],
  ["fallen-cypress", "Fallen Cypress"],
  ["north-passage", "North Passage"],
  ["north-inlet", "North Inlet"],
  ["reed-bend", "Reed Bend"],
  ["mud-bend", "Mud Bend"],
  ["reed-squeeze", "Reed Narrows"],
  ["cross-marsh", "Cross Marsh"],
  ["east-crossover", "East Crossover"],
  ["willow-reach", "Willow Reach"],
  ["south-inlet", "South Inlet"],
  ["cut", "Central Cut"],
  ["high-water", "High Water"],
  ["cypress-slip", "Cypress Slip"]
];

export const closureRegistry = Object.freeze(
  entries.map(([id, name]) => Object.freeze({ id, name, line: "closure-warning-" + id }))
);

export const sharedLines = Object.freeze({
  closed: "closure-closed",
  canceled: "closure-canceled",
  deferred: "closure-deferred"
});

export function registryEntry(id) {
  return closureRegistry.find(entry => entry.id === id) ?? null;
}
