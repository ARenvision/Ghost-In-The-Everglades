// Closure tuning constants. The only place these values appear as literals.
// Timing values are in seconds; geometry values are in map pixels unless noted.

export const CLOSURE_TIMING = Object.freeze({
  warning: 12,
  forming: 8,
  deferralLimit: 15,
  armDelay: 4,
  minDeferredDwell: 2
});

export const CLOSURE_GEOMETRY = Object.freeze({
  traversalThreshold: .6,
  endZone: .2,
  zoneMargin: 20,
  minChannelRadius: 15,
  hullClearance: 8,
  sampleStep: 12,
  attachStep: 6,
  nodeProbe: 12
});
