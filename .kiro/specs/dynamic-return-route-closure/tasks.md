# Implementation Plan: Dynamic Return-Route Closure

## Overview

Mission 1 gets one scripted closure after the first survivor is boarded. All closure logic goes into DOM-free `.mjs` modules under `dist/` so it runs in Node. `game.js` only feeds inputs and applies effects. Tests live in `tests/` as `tests/*.test.mjs` and run with `npm test` from the project root (`node --test`). Property tests use fast-check as a dev dependency. `dist/` stays static. The 19 installed closure MP3s in `dist/assets/radio/` are used as they are.

Design decisions A to F use their defaults: smallest detour, `package.json` with fast-check, fixed 4 s `armDelay`, pause discards the clip, `minDeferredDwell` 2 s, and an unattached boat before the warning retries until `armDelay + deferralLimit`, then skips.

Language: JavaScript (ES modules, `.mjs`), matching the design.

## Tasks

- [x] 1. Baseline, tooling and regression snapshots
  - [x] 1.1 Add `package.json` and the `tests/` directory
    - `package.json` at the project root with `"scripts": { "test": "node --test" }` so `npm test` from the project root runs `node --test`
    - Test files must be discoverable by `node --test` from the project root, for example `tests/*.test.mjs`
    - `fast-check` stays under `devDependencies` only
    - Set `"type": "module"` only if it does not change how `dist/` is served
    - _Requirements: 8.18, 12.1_

  - [x] 1.2 Record the baseline commit and capture regression snapshots before any gameplay change
    - Record commit `3ab7049a1370b3579f124123f6a45d62f4b53360` in `docs/evidence.md`
    - Store fixtures in `tests/fixtures/`: `createState` outputs for all missions, `updateClosures` outputs for The Closing Cut (time 65) and The Last Crossing (`delivered` triggers), the list of existing radio line ids and their files, and `loadBestTimes` and `saveBestTimes` behavior including the legacy `echo` migration
    - Capture from unmodified code. Do not edit `game.js`, `missions.mjs`, `radio-lines.mjs` or `play-progress.mjs` in this task
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 11.8_

  - [x] 1.3 Write the regression suite (REQUIRED)
    - Compare current outputs to the fixtures from 1.2: `createState` for all missions, `updateClosures` for Closing Cut and Last Crossing, existing radio ids and files, `loadBestTimes` and `saveBestTimes`
    - Confirm existing `RadioVoice.say` three-argument behavior (queue, replace, preempt, `stop`) is unchanged
    - Confirm Training Patrol and the four other missions get an inactive closure once `createClosure` exists
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 2. Closure configuration and registry
  - [x] 2.1 Create `dist/closure-config.mjs`
    - `CLOSURE_TIMING = { warning: 12, forming: 8, deferralLimit: 15, armDelay: 4, minDeferredDwell: 2 }`
    - `CLOSURE_GEOMETRY = { traversalThreshold: .6, endZone: .2, zoneMargin: 20, minChannelRadius: 15, hullClearance: 8, sampleStep: 12, attachStep: 6, nodeProbe: 12 }`
    - These values appear as literals only here
    - _Requirements: 2.10, 14.1, 14.2, 14.3, 14.4_

  - [x] 2.2 Create `dist/closure-registry.mjs`
    - `closureRegistry`: 16 entries `{ id, name, line }` with `line = "closure-warning-" + id`, using the Appendix B ids and display names
    - `sharedLines = { closed, canceled, deferred }` with ids `closure-closed`, `closure-canceled`, `closure-deferred`
    - _Requirements: 1.5, 1.6, 1.10, 13.1, 13.2, 15.1_

- [x] 3. Drivability, attachment and route check
  - [x] 3.1 Create `dist/closure.mjs` with the graph, drivability cache and Closure_Zone
    - Build nodes from `landmarks` and edges from `routes`, with polyline length and radius
    - Edge and node usability from sampled `waterClearance >= hullClearance`, cached by sorted closed-id key
    - `inClosureZone(point, channel)` using `|along| < 16 + zoneMargin` and `|across| < barrier.width + zoneMargin`
    - Dijkstra over usable edges and nodes only
    - _Requirements: 3.5, 3.6_

  - [x] 3.2 Implement `attachBoat` and `routeCheck` in `dist/closure.mjs`
    - `attachBoat`: clear sampled connection to the nearest centerline point, no sample in any closed barrier zone, side rule for closed channels, no nearest-channel fallback
    - `routeCheck({ closed, candidate, boat, remaining, sites })` returns `{ ok, reason, returnLength, detour }` with reasons `zone`, `unattached`, `return`, `pickup`
    - `classify(reason)` returns `defer` for `zone` and `unattached`, `lost` for `return` and `pickup`
    - Skip the Pickup_Route when `remaining` is 0. No `Math.random` and no clock
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.3 Write route-check tests (REQUIRED)
    - A boat with a clear connection to a channel attaches. A boat behind a closed barrier zone, on the wrong side, or in the shallows gives `unattached`
    - A boat in the candidate's zone gives `zone`
    - Return and pickup routes use only drivable sampled water. A synthetic barrier over an unrelated channel removes that edge, and one over a junction removes that node
    - A passing Return_Route with a failing Pickup_Route is rejected, and the reverse is also rejected
    - Failure messages name the setup, candidate and boat position
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 8.3, 8.4, 8.5, 8.6, 8.19_

  - [ ]* 3.4 Write property test for the route-check oracle
    - **Property 1: Route check agrees with a drivable-path oracle**
    - The oracle is an independent exhaustive search written in the test with its own sampling
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6, 8.3, 8.5, 8.6**

  - [ ]* 3.5 Write property test for returned routes
    - **Property 2: Returned routes are drivable and avoid closed channels and the zone**
    - **Validates: Requirements 3.4, 3.6, 8.4**

  - [ ]* 3.6 Write property test for the skipped pickup check
    - **Property 3: Pickup check is skipped when no survivors remain**
    - **Validates: Requirements 3.3, 8.7**

  - [x] 3.7 Run the PENDING Node route check on the closable-in table (REQUIRED)
    - For each of the three setups and each registry channel, run the production `routeCheck` with real boat positions: at the dock, on both sides of the barrier, at the zone edge, inside the zone, and in the shallows
    - Confirm the closable-in table from the design, including clearance on both sides of each barrier and every edge and node on the chosen detour
    - Record the results in `docs/evidence.md`. Remove any failing row from the registry for that setup and note which rows were removed
    - Add a test that asserts the confirmed table and the Impactful rule (detour above zero), for example `cypress-squeeze` in Reed Narrows and `north-passage` in South Crossover are not selectable
    - _Requirements: 3.1, 3.2, 8.1, 8.2, 8.3, 8.5, 11.8_

- [x] 4. Checkpoint - Run the full Node suite
  - Run `npm test` from the project root. Ensure all tests pass, ask the user if questions arise.

- [x] 5. Traversal tracking and target selection
  - [x] 5.1 Implement the traversal tracker in `dist/closure.mjs`
    - Per-channel state `{ entryEnd, entryPos, entered, leftEntryZone, maxProgress }` with the transition rules from the design (entry zone, leaving it, far end zone, net progress at least `traversalThreshold`)
    - Channels tracked independently. No speed or time limit
    - Skip starting roadblocks, `launch-channel` and channels not in the registry. Stop when `aboard` first exceeds 0
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 5.2 Write traversal tests (REQUIRED)
    - A slow full crossing with pauses and backward wiggles inside the channel is recorded once
    - A U-turn after leaving the entry zone is not recorded
    - Idling in the entry zone and then leaving back out through it is not recorded
    - Entering from the far end and crossing is recorded. A sideways exit clears the state. Two channels sharing an end node are tracked independently
    - _Requirements: 1.2, 1.3, 1.4, 1.7, 8.8_

  - [ ]* 5.3 Write property test for traversal records
    - **Property 5: Traversal record membership and set semantics**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 8.8**

  - [x] 5.4 Implement `selectTarget` in `dist/closure.mjs`
    - Candidates are registry channels in the record and not closed, with `routeCheck(...).ok` and `detour > 0`
    - Choose the smallest detour, ties by registry order. Return `{ target, deferOnly }`
    - No `Math.random` and no elapsed time
    - _Requirements: 2.1, 2.3, 3.18, 5.3, 5.4, 5.5_

  - [x] 5.5 Write property test for target selection (REQUIRED)
    - **Property 4: Target selection is deterministic and safe**
    - Include a unit check that two different traversal records on one setup select different targets
    - Include a unit check that a quick U-turn into an unused branch does not change the selected target
    - **Validates: Requirements 2.1, 2.3, 3.18, 5.3, 5.4, 8.9, 8.10**

- [x] 6. Closure state machine
  - [x] 6.1 Implement `createClosure` and `stepClosure` in `dist/closure.mjs`
    - Phases `idle`, `warning`, `forming`, `deferred`, `closed`, `canceled`, `skipped` with an incrementing `epoch`
    - The countdown keeps running while the boat is in the zone or unattached. Zone and attachment are tested only at the Countdown_End
    - Periodic check every 0.25 s: `return` or `pickup` cancels, `zone` or `unattached` never cancels
    - Deferral with `deferralLimit`, `minDeferredDwell` for the `closure-deferred` effect, silent cancel on unload, `closure-canceled` effect on lost route or limit
    - Idle retry for `deferOnly` until `armDelay + deferralLimit`, then `skipped`
    - Effects `transmit` (with `phase` and `epoch`), `close` and `cue`. At most one event per run. Other missions get an inactive event with no effects
    - _Requirements: 2.2, 2.4, 2.5, 2.7, 2.8, 2.9, 2.10, 3.7, 3.8, 3.9, 3.10, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17, 3.19, 3.20, 12.1_

  - [x] 6.2 Write zone and deferral tests (REQUIRED)
    - Enter the zone before zero and stay through zero: state `deferred`, no cancel, no reset. Then steer clear: both routes are rechecked and the channel closes
    - Clear the zone before zero: closes on time at `warning + forming`
    - Stay past `deferralLimit`: canceled with the `closure-canceled` effect
    - Unattached at the Countdown_End defers and does not cancel. Unload while active cancels with no `closure-canceled` effect
    - Leaving the zone before `minDeferredDwell` closes with no `closure-deferred` effect
    - _Requirements: 3.8, 3.9, 3.10, 3.12, 3.13, 3.14, 3.17, 8.11_

  - [ ]* 6.3 Write property test for state machine safety
    - **Property 6: Closure state machine safety**
    - **Validates: Requirements 2.2, 3.8, 3.9, 3.12, 3.13, 3.14, 3.15, 3.17, 3.19, 8.11**

  - [ ]* 6.4 Write property test for countdown duration
    - **Property 7: Countdown duration is independent of zone occupancy**
    - **Validates: Requirements 2.10, 3.9, 14.3, 14.4**

  - [ ]* 6.5 Write property test for other missions
    - **Property 10: Other missions never run a closure**
    - **Validates: Requirements 9.1, 9.2, 12.1**

- [x] 7. Checkpoint - Run the full Node suite
  - Run `npm test` from the project root. Ensure all tests pass, ask the user if questions arise.

- [x] 8. Radio staleness guard and line registration
  - [x] 8.1 Update `dist/radio.mjs`
    - Add optional fourth argument `isCurrent` to `say`, checked at entry, when a queued entry is taken in `ended`, and after the buffer loads just before `source.start()`
    - Add `dropStale()` that stops the current clip when its predicate returns false
    - Add a DOM-free caption currency helper that returns the message only while its predicate is absent or true, for `game.js` `announce` and `caption()`
    - Three-argument callers behave as before
    - _Requirements: 3.20, 13.8, 15.5_

  - [x] 8.2 Register the 19 lines in `dist/radio-lines.mjs`
    - 16 `closure-warning-<channel-id>` lines and the three shared lines as `dispatch(text)` with the Appendix A text. The text equals the spoken text and contains the Display_Name where the line names the channel
    - No existing line changes
    - _Requirements: 2.12, 13.1, 13.2, 13.3, 13.4, 13.5, 15.1, 15.2_

  - [x] 8.3 Write staleness tests (REQUIRED)
    - Use a stubbed `RadioVoice` and fake audio context (seed `voice.files`, no network or DOM)
    - A queued announcement matches the closure state when it plays
    - A stale `closure-deferred` clip is dropped when the event closed first
    - A stale warning is dropped when the event was canceled first
    - A clip that became stale while its buffer loaded does not start. `dropStale()` cuts a superseded clip
    - The caption shows the current state: after warning then cancel it is the canceled line, and a leftover caption of a superseded state is not returned
    - _Requirements: 3.10, 3.16, 3.20, 13.8, 15.5_

  - [ ]* 8.4 Write property test for played announcements
    - **Property 11: Played announcements match the closure state**
    - **Validates: Requirements 2.12, 3.10, 3.16, 3.20, 13.8, 15.5**

  - [x] 8.5 Write registry, line and constants unit tests (REQUIRED)
    - 16 registry entries each with a Display_Name, a registered line with non-empty text, and an existing non-empty `dist/assets/radio/<line>.mp3`. Shared lines registered and files non-empty
    - All 19 MP3s exist and are non-empty: 16 `closure-warning-<id>.mp3` plus `closure-closed.mp3`, `closure-canceled.mp3` and `closure-deferred.mp3`
    - `CLOSURE_TIMING` holds the five values, `hullClearance` equals the literal in `game.js` `move()`, and no other source file repeats the timing values as literals
    - Failure messages name the line id or file
    - _Requirements: 8.15, 8.16, 8.17, 8.19, 14.1_

- [x] 9. Best-time logic
  - [x] 9.1 Add `applyFinishTime(times, id, time)` to `dist/play-progress.mjs`
    - Pure function that returns a map with the time saved only when the id is absent or the time is strictly lower. No other id changes
    - Existing `loadBestTimes`, `saveBestTimes` and `formatRunTime` stay unchanged
    - _Requirements: 5.8, 5.9, 5.10_

  - [x] 9.2 Write property test for best-time saving (REQUIRED)
    - **Property 8: Best time is saved only when first or strictly faster**
    - Include unit cases for first record, faster, slower and equal
    - Include unit cases that the saved best time is unchanged after a failed or abandoned run
    - **Validates: Requirements 5.8, 5.9, 5.10**

  - [ ]* 9.3 Write property test for record storage round trip
    - **Property 9: Record storage round trip**
    - **Validates: Requirements 5.7, 9.6**

- [x] 10. Integrate the closure into `game.js`
  - [x] 10.1 Wire the closure event into `start()` and `update()`
    - `start()` calls `createClosure(mission())` and warms the shared clips, and the target's warning clip once known, with `voice.warm(id).catch(() => {})`
    - `update()` feeds the traversal tracker during the Outbound_Leg, then calls `stepClosure` after `move(dt)` and applies effects. `close` adds the id to `state.closed` directly
    - Retry and New_Run reset the record and event
    - Rescue state (`aboard`, `delivered`, `trips`) is left unchanged by the closure
    - _Requirements: 1.1, 1.9, 2.1, 2.9, 3.19, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 6.1, 6.2, 6.4_

  - [x] 10.2 Update `transmit`, `announce`, `caption()` and `recordFinish`
    - `transmit` and `announce` gain an optional `isCurrent`. Closure effects call `voice.dropStale()` and then `transmit(id, 5, name, isCurrent)` with the predicate `closure === event && event.epoch === epoch`
    - `caption()` uses the currency helper from 8.1
    - `recordFinish` calls `applyFinishTime` and stays guarded by `practice`
    - A clip that fails to load leaves the caption, Chart cue and on-screen cue in place and the event continues
    - Pause calls `voice.stop()` and the discarded clip does not replay
    - _Requirements: 2.4, 2.5, 2.13, 3.10, 3.16, 3.20, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 13.8_

- [x] 11. Checkpoint - Run the full Node suite
  - Run `npm test` from the project root. Ensure all tests pass, ask the user if questions arise.

- [x] 12. Chart, operator and HUD cues
  - [x] 12.1 Add `drawClosureCue(c, cue)` to `dist/map.mjs`
    - Draw the warning, forming, deferred and closed stages from a cue `{ id, name, stage, progress }`, with the Display_Name
    - _Requirements: 2.6, 2.8, 2.11, 7.4, 7.5_

  - [x] 12.2 Add forming and deferred posts to `dist/operator.mjs`
    - Accept a `closureCue` argument. Amber posts grow with forming progress, with a floor cue for deferred
    - _Requirements: 2.8, 2.11, 7.3_

  - [x] 12.3 Wire the cues and the HUD line in `game.js`
    - Call `drawClosureCue` next to `drawClosures` and pass `closureCue` to the operator
    - `updateHUD` `conditions` shows `<Name> closing in m:ss`, `forming`, `deferred` or `<Name> closed`, and the closed names list includes the target
    - `drawChartLabels` adds `<Name> · closing`, `forming` and `deferred` labels
    - Switching between Overhead, Operator and Chart leaves rescue state and the closure phase unchanged
    - _Requirements: 2.6, 2.8, 2.11, 3.20, 6.3, 7.1, 7.3, 7.4, 7.5_

- [x] 13. Kiro hook
  - [x] 13.1 Create `.kiro/hooks/route-check-suite.json`
    - `PostFileSave` trigger with a matcher for `dist/game.js`, `dist/missions.mjs`, `dist/play-progress.mjs`, `dist/radio-lines.mjs`, `dist/radio.mjs` and `dist/closure*.mjs`
    - The command runs `npm test` from the project root, reports failing output on a non-zero exit, and runs once per save
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 14. Manual checklist
  - [x] 14.1 Write the manual checklist document at `docs/manual-checklist.md`
    - Rows from the design for desktop and iPhone Safari, each with fields for device, browser, date and pass or fail
    - Include the required full rescue playtest (see task 17) and the timing playtest with fields for the final warning, forming, deferral and dwell values
    - Automated results (Node suite, hook output) in one section and device playtests in a separate section
    - _Requirements: 6.5, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 14.5_

- [x] 15. Checkpoint - Run the full Node suite
  - Run `npm test` from the project root. Ensure all tests pass, ask the user if questions arise.

- [x] 16. Evidence notes
  - [x] 16.1 Complete `docs/evidence.md`
    - Baseline commit, the changes Kiro made, one successful `npm test` run (from the project root) with output, the 3.7 route check results, and any failure the tests caught
    - _Requirements: 11.8, 12.3_

- [ ] 17. Full rescue playtest (REQUIRED, manual)
  - [ ] 17.1 Play each of the three setups end to end and record results in `docs/manual-checklist.md`
    - On Reed Narrows, North Approach and South Crossover: drive out, board survivors, and confirm the closure targets a channel used outbound and changes the return route, so the player takes the detour home
    - Confirm the warning, deferred (if triggered), closed and canceled lines play at the right moments, match the current closure state, and match the captions
    - Confirm the Lantern Keeper appears only after advancing toward the closed channel and clears on turning away, and all three survivors get home including the second trip
    - Confirm the saved record updates only when the run is the first or faster
    - Run on desktop with audio on and muted, and on iPhone Safari
    - Record results in the checklist, separate from the automated results
    - Note: this playtest is done by the user. The agent does not perform it and must leave it for the user. It will be reported back with the local playtest link
    - _Requirements: 2.4, 2.9, 3.10, 3.16, 4.3, 4.4, 4.5, 5.8, 5.9, 5.10, 6.1, 6.5, 7.1, 7.2, 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 18. Final checkpoint - Run the full Node suite
  - Run `npm test` from the project root. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Required tests (no `*`): 1.3 regression suite, 3.3 route-check tests, 3.7 closable-in route check, 5.2 traversal tests, 5.5 target selection tests, 6.2 zone and deferral tests, 8.3 staleness tests, 8.5 registry, line and constants unit tests, 9.2 best-time tests, and the manual playtest 17.1
- Optional tests: property tests 3.4, 3.5, 3.6, 5.3, 6.3, 6.4, 6.5, 8.4 and 9.3
- Task 17.1 is manual and needs a person with a desktop browser and an iPhone. It is listed because it is a required deliverable. The agent does not perform it and leaves it for the user, and it is reported back with the local playtest link
- Run the suite with `npm test` from the project root
- Each task references requirements for traceability. Property tests use the tag `Feature: dynamic-return-route-closure, Property N: <title>`
- Do not edit `requirements.md` or `design.md` from these tasks. The design's "Requirement updates needed" list is handled separately

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1"] },
    { "id": 2, "tasks": ["1.3", "3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.5", "3.6", "3.7"] },
    { "id": 4, "tasks": ["5.1", "8.1", "8.2", "9.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "8.3", "8.4", "9.2", "9.3"] },
    { "id": 6, "tasks": ["5.5", "6.1", "8.5"] },
    { "id": 7, "tasks": ["6.2", "6.3", "6.4", "6.5", "12.1", "12.2", "13.1"] },
    { "id": 8, "tasks": ["10.1", "14.1"] },
    { "id": 9, "tasks": ["10.2"] },
    { "id": 10, "tasks": ["12.3"] },
    { "id": 11, "tasks": ["16.1"] },
    { "id": 12, "tasks": ["17.1"] }
  ]
}
```
