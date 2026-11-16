# Requirements Document

## Introduction

Dynamic Return-Route Closure adds one scripted hazard to Mission 1, "The Echo at Mile Marker 7". While the player carries survivors back from the Broken Cypress Dock, one channel that the player used on the way out forms a blockage and then closes. The player must notice the warning and take another way home. The Cypress Slip and longer open passages remain candidate detours.

Before the Game warns about a closure, and again before the closure completes, the Route_Check verifies two routes under the resulting closure state: a route from the boat's actual position to the ranger station (the Return_Route), and a route from the ranger station back to the Broken Cypress Dock for the survivors still waiting (the Pickup_Route). If the boat is sitting in the Closure_Zone when the countdown ends, the closure is deferred for a bounded time while the player steers clear, and both routes are checked again before the channel closes.

The warning is spoken and captioned. Each Eligible_Channel has its own pre-recorded warning clip (`assets/radio/closure-warning-<channel-id>.mp3`) so the spoken line names the channel. Three shared clips (closed, canceled, deferred) carry no channel name, because the caption, Chart cue, and on-screen cue carry the name. The notice durations are starting values held in one configurable constants location and are tuned by playtest.

The saved best time for a Route_Setup is replaced only when a completed run is strictly faster, or when no record exists for that setup.

The feature reuses the existing closure set (`state.closed`), barrier geometry (`barriers`, `waterClearance`), dispatch and caption system (`transmit`, `announce`), radio system (`RadioVoice.say`), chart renderer, and delayed Lantern Keeper warning (`wrongWayApproach`, `updateGhostWarning`). The first milestone covers Mission 1 only. The Last Crossing is a later milestone.

Baseline: commit `3ab7049a1370b3579f124123f6a45d62f4b53360`. Source of truth: `dist/game.js`, `dist/missions.mjs`, `dist/play-progress.mjs`, `dist/map.mjs`, `dist/operator.mjs`, `dist/radio.mjs`, `dist/radio-lines.mjs`.

### Assumptions for user review

1. **Eligible channels.** A Channel is eligible when it is listed in the Closure_Registry (Appendix B). The registry holds 16 channels between the ranger station and the Broken Cypress Dock (`island`). Appendix B lists the Route_Setups where each channel can be closed while a Return_Route and a Pickup_Route remain, found by hand-tracing the `routes` graph. The Route_Check_Suite must confirm this table, and the design may correct it. `launch-channel` is excluded because every path home uses it. Channels that are the only link in a given setup (for example `reed-bend` in Reed Narrows) stay in the registry but fail the Route_Check in that setup, so the Game never closes them there. Appendix C lists the 13 excluded channels and the reason for each.
2. **Traversal.** A channel counts as traversed when the boat enters it from one end node and leaves it near the other end node, with a net advance and not on a U-turn. The design will set the numeric threshold. This document assumes about 60 percent of the channel length progressed along the channel axis.
3. **"First loaded return leg"** begins when the first survivor is boarded at the Broken Cypress Dock (`state.aboard` goes from 0 to 1 or more). The event does not wait for a full boat of two, so a player who leaves with one survivor still sees the event. It never starts after the first unload.
4. **Cypress Slip.** `cypress-slip` is closed at the start of Reed Narrows and open in North Approach and South Crossover. Its drawn points (x 1575 to 1753) are already in world coordinates and agree with the `low` and `island` landmarks (`rescueSector` offset +1010, +100). The design should still confirm that the drawn water and the graph agree before the slip counts as a detour.
5. **Existing closure retry.** `update()` in `game.js` currently removes a new closure while the boat is inside the barrier area (`waterClearance < 8`) and retries on the next frame. The new event has its own deferral logic. The Closure_Zone is defined to cover that area, so the Game adds the Target_Channel to `state.closed` only when the existing removal cannot trigger.
6. **Notice timing (starting values).** Total notice 20 seconds, of which the last 8 seconds are the Forming_Phase and the first 12 seconds are the Warning_Phase. These are starting values. Playtesting decides the final values (Requirement 14). The earlier 5-second grace period is replaced by the Deferral_Limit.
7. **Deferral limit (proposal).** A deferred closure is canceled when the boat has not cleared the Closure_Zone with both routes passing within 15 seconds, or when the boat unloads at the ranger station. The value is configurable and tuned by playtest.
8. **Remaining survivors.** The Pickup_Route check applies only while at least one survivor is still waiting ashore. With the three-survivor Mission 1 and a boat capacity of two, this count is at least 1 on the first loaded return leg. The zero case is defined for safety and for testing.
9. **Clip length.** Each warning clip is at most 5 seconds long, so the spoken warning ends well inside the 12-second Warning_Phase. The Manual_Checklist verifies this because the suite does not decode audio.
10. **Voices.** The existing dispatch voice stays the voice for the new clips. Final voices will replace the test clips later by overwriting the MP3 files under the same names. The requirements do not specify how test audio is produced. The design phase decides that.
11. **Audio format.** New clips should match the format of the existing clips in `dist/assets/radio/` (all `.mp3`). The format was inferred from file names only. No clip was decoded.
12. **Second trip.** After the closure, the route from the ranger station to the Broken Cypress Dock must still exist for the next pickup trip, with the closed channel treated as closed in both directions. The Pickup_Route check enforces this.
13. **Other missions.** Training Patrol and the other four missions keep their current closure behavior.
14. **Closure announcements** use radio priority 5, like the other closure announcements. This was inferred from the request and not checked against `game.js`. The design should confirm the existing priority scale.
15. **Time units.** Saved times are positive integers in tenths of a second, as in `loadBestTimes`. "Strictly lower" compares those integers.

## Glossary

- **Game**: The Ghost in the Everglades browser game served from `dist/`.
- **Mission_1**: The mission with id `echo`, "The Echo at Mile Marker 7".
- **Route_Setup**: One of the three Mission_1 starting configurations: Reed_Narrows_Setup, North_Approach_Setup, South_Crossover_Setup.
- **Reed_Narrows_Setup**: Route_Setup with id `reed-narrows`.
- **North_Approach_Setup**: Route_Setup with id `north-approach`.
- **South_Crossover_Setup**: Route_Setup with id `south-crossover`.
- **Channel**: A named edge in the `routes` array of `dist/missions.mjs`, with a centerline, a radius, and a barrier.
- **Closure_Registry**: The single table in the source that lists each Eligible_Channel with its display name and its Warning_Line id. Appendix B holds the initial content.
- **Eligible_Channel**: A Channel that is listed in the Closure_Registry with a display name and a registered Warning_Line, and is not a starting roadblock of the active Route_Setup.
- **Display_Name**: The player-facing name of an Eligible_Channel, as listed in Appendix B.
- **Outbound_Leg**: The portion of a run from the ranger station until the first survivor is boarded at the Broken_Cypress_Dock.
- **Return_Leg**: The portion of a run while at least one survivor is aboard and the boat has not yet unloaded at the ranger station.
- **First_Loaded_Return_Leg**: The first Return_Leg of a run.
- **Traversal**: The boat's passage through an Eligible_Channel along its axis as defined by the Traversal_Threshold. A brief entry followed by a U-turn is not a Traversal.
- **Traversal_Threshold**: The minimum fraction of a Channel's length that the boat must advance along its axis, and exit through the far end, to count as a Traversal.
- **Traversal_Record**: The ordered set of Channels traversed during the Outbound_Leg.
- **Closure_Event**: The one-time event that warns about, forms, and closes one Channel during the First_Loaded_Return_Leg.
- **Target_Channel**: The Channel selected for the Closure_Event.
- **Closure_Timing_Constants**: The one source location that holds the Warning_Phase duration, Forming_Phase duration, and Deferral_Limit.
- **Warning_Phase**: The interval from the Dispatch warning until the blockage begins to form. Starting value 12 seconds.
- **Forming_Phase**: The interval during which the blockage is shown forming and the Channel is still open. Starting value 8 seconds.
- **Countdown_End**: The moment the Forming_Phase ends and the Game first attempts to close the Target_Channel.
- **Deferred_State**: The state of a Closure_Event whose Countdown_End passed while the boat was in the Closure_Zone, or while a Route_Check failed to pass for a reason expected to clear, and which waits to close.
- **Deferral_Limit**: The maximum time a Closure_Event may stay in the Deferred_State. Starting value 15 seconds.
- **Closed_State**: The state in which the Target_Channel is in `state.closed` and its barrier blocks the boat physically.
- **Closure_Zone**: The region of the Target_Channel where the barrier and the boat's width overlap, including a margin equal to the boat radius and at least the area where `waterClearance` is below 8 with the barrier active.
- **Return_Route**: A path in the Channel graph from the boat's actual position to the ranger station, under the proposed closure set, that avoids the Closure_Zone and every Channel narrower than the boat.
- **Pickup_Route**: A path in the Channel graph from the ranger station to the Broken_Cypress_Dock, under the proposed closure set, that avoids every Channel narrower than the boat.
- **Remaining_Survivors**: The number of survivors still waiting ashore at a pickup site, not counting survivors aboard or delivered.
- **Route_Check**: The function that decides whether a Return_Route exists and, when Remaining_Survivors is greater than zero, whether a Pickup_Route exists, given a boat position, boat width, and a proposed closure set.
- **Safe_Closure_Candidate**: An Eligible_Channel in the Traversal_Record for which the Route_Check passes with that Channel added to the closed set.
- **Boat_Side**: The side of the Target_Channel's barrier on which the boat lies, determined from the boat's position relative to the barrier.
- **Dispatch**: The existing radio line and voice system (`transmit`, `radio-lines.mjs`, `RadioVoice.say`).
- **Caption**: The existing on-screen caption line.
- **Warning_Line**: The radio line with id `closure-warning-<channel-id>`, registered in `radio-lines.mjs`, with a Caption and a Warning_Clip.
- **Warning_Clip**: The MP3 file `dist/assets/radio/closure-warning-<channel-id>.mp3` that speaks the Warning_Line and names the channel.
- **Shared_Clip**: One of three MP3 files with no channel name: `closure-closed.mp3`, `closure-canceled.mp3`, `closure-deferred.mp3`.
- **Chart**: The navigation chart drawn by `dist/map.mjs`.
- **Operator_View**: The operator camera rendered by `dist/operator.mjs`.
- **Overhead_View**: The overhead camera.
- **Lantern_Keeper**: The ghost warning figure driven by `wrongWayApproach` and `updateGhostWarning`.
- **Keeper_Delay**: The existing delay of 2.5 seconds of continued advance toward a closed channel before the Lantern_Keeper appears.
- **Detour**: A Return_Route that does not use the Target_Channel.
- **Record_Store**: The browser storage that holds best times under the key `ghost-in-the-everglades.best-times`.
- **Record_Id**: The key of the form `echo:<setup id>` used for setup-specific best times.
- **Time_To_Beat**: The saved best time for a Record_Id, in tenths of a second.
- **Retry**: The existing action that restarts the current mission with the same Route_Setup.
- **New_Run**: The existing action that restarts Mission_1 with a different Route_Setup chosen by `chooseNewRouteSetup`.
- **Route_Check_Suite**: The automated tests that run the Route_Check, the registry checks, and the record checks over Mission_1 setups, candidate closures, and boat positions.
- **Route_Check_Hook**: The Kiro hook in `.kiro/hooks/` that reruns the Route_Check_Suite.
- **Regression_Suite**: The automated tests covering Training Patrol and the four other missions.
- **Manual_Checklist**: The written list of manual tests for desktop and iPhone Safari.
- **Project**: The submission repository, including source, tests, `.kiro/` files, and documentation.

## Requirements

### Requirement 1: Record the outbound passage

**User Story:** As a player, I want the game to remember which channels I used to reach the dock, so that the return hazard responds to my own route.

#### Acceptance Criteria

1. WHEN Mission_1 starts, THE Game SHALL create an empty Traversal_Record.
2. WHILE the Outbound_Leg is in progress in Mission_1, THE Game SHALL track the boat's progress along each Eligible_Channel it enters.
3. WHEN the boat advances at least the Traversal_Threshold along an Eligible_Channel and leaves that Channel through its far end, THE Game SHALL add that Channel to the Traversal_Record.
4. WHEN the boat enters an Eligible_Channel and leaves through the end where it entered, THE Game SHALL leave the Traversal_Record unchanged for that Channel.
5. THE Game SHALL treat a Channel as ineligible when the Channel is a starting roadblock of the active Route_Setup.
6. THE Game SHALL treat `launch-channel` as ineligible.
7. WHEN the boat traverses the same Channel more than once, THE Game SHALL store that Channel once in the Traversal_Record.
8. WHEN the first survivor is boarded at the Broken_Cypress_Dock, THE Game SHALL stop adding Channels to the Traversal_Record for the Outbound_Leg.
9. WHEN Retry or New_Run starts, THE Game SHALL reset the Traversal_Record.
10. THE Game SHALL treat a Channel as ineligible when the Closure_Registry has no Display_Name or no registered Warning_Line for that Channel.

### Requirement 2: Start one closure event on the first loaded return

**User Story:** As a player, I want one return passage to close after I pick up survivors, so that the trip home needs a decision.

#### Acceptance Criteria

1. WHEN the first survivor is boarded in Mission_1 and no Closure_Event has started in the current run, THE Game SHALL begin selecting a Target_Channel from the Safe_Closure_Candidates in the Traversal_Record.
2. THE Game SHALL start at most one Closure_Event per run.
3. THE Game SHALL select the Target_Channel only from the Traversal_Record.
4. WHEN the Closure_Event starts, THE Game SHALL announce the Target_Channel's name through the Warning_Line, spoken by the Warning_Clip.
5. WHEN the Closure_Event starts, THE Game SHALL display the Target_Channel's Display_Name in the Caption.
6. WHEN the Closure_Event starts, THE Game SHALL mark the Target_Channel on the Chart with a warning cue that includes its Display_Name.
7. WHILE the Warning_Phase is in progress, THE Game SHALL keep the Target_Channel open.
8. WHEN the Warning_Phase ends, THE Game SHALL begin the Forming_Phase and show on the Chart and in the Overhead_View and Operator_View where the blockage is forming.
9. WHEN the Countdown_End is reached and the closure checks pass, THE Game SHALL add the Target_Channel to `state.closed`, switch the Chart cue to closed, and activate the physical barrier.
10. THE Game SHALL set the duration from the Dispatch warning to the closed barrier equal to the sum of the Warning_Phase and Forming_Phase values in the Closure_Timing_Constants, with starting values of 12 seconds and 8 seconds (20 seconds in total).
11. THE Game SHALL present the warning with a Caption, a Chart cue, and a visible blockage cue that each carry the channel name or position, so that the player can understand the warning with sound muted.
12. THE Game SHALL use the existing Dispatch and Caption systems, with the lines in Appendix A added to `radio-lines.mjs` for the warning, closed, canceled, and deferred outcomes.
13. WHEN the Target_Channel is closed, THE Game SHALL announce the closed outcome through the `closure-closed` Shared_Clip and show a Caption that includes the Display_Name.

### Requirement 3: Always leave a way home and a way back

**User Story:** As a player, I want a guaranteed route home and a guaranteed route back to the dock, so that the closure never traps my boat or strands the remaining survivors.

#### Acceptance Criteria

1. WHEN the Game evaluates a Safe_Closure_Candidate, THE Route_Check SHALL decide whether a Return_Route exists from the boat's actual position to the ranger station with that Channel added to the closed set.
2. WHEN the Game evaluates a Safe_Closure_Candidate and Remaining_Survivors is greater than zero, THE Route_Check SHALL also decide whether a Pickup_Route exists from the ranger station to the Broken_Cypress_Dock with that Channel added to the closed set.
3. WHEN Remaining_Survivors is zero, THE Route_Check SHALL skip the Pickup_Route check and pass or fail on the Return_Route alone.
4. THE Route_Check SHALL use the boat's actual position and Boat_Side relative to the candidate barrier, not only the Channel graph nodes.
5. THE Route_Check SHALL treat any Channel whose passage is narrower than the boat's width as unusable.
6. THE Route_Check SHALL treat the Closure_Zone as unusable.
7. WHEN the Game is about to announce the Warning_Phase, THE Game SHALL run the Route_Check and announce only if both required routes pass.
8. WHEN the Countdown_End is reached, THE Game SHALL run the Route_Check again before closing the Target_Channel.
9. IF the boat is inside the Closure_Zone at the Countdown_End, THEN THE Game SHALL keep the Target_Channel open, enter the Deferred_State, and not close the channel.
10. WHEN the Game enters the Deferred_State, THE Game SHALL play the `closure-deferred` Shared_Clip once, show a Caption that includes the Display_Name, and show the Chart cue and blockage cue as deferred.
11. WHILE the Closure_Event is in the Deferred_State, THE Game SHALL leave the boat's position and controls unchanged and keep the deferred cues visible on the Chart and in the Overhead_View and Operator_View.
12. WHEN the boat has left the Closure_Zone during the Deferred_State, THE Game SHALL run the Route_Check again, covering the Return_Route and, when Remaining_Survivors is greater than zero, the Pickup_Route, and SHALL close the Target_Channel only if both pass.
13. IF the Closure_Event has been in the Deferred_State for the Deferral_Limit without closing, THEN THE Game SHALL cancel the Closure_Event.
14. IF the Route_Check fails at the Countdown_End or during the Deferred_State for a reason that does not involve the Closure_Zone, THEN THE Game SHALL cancel the Closure_Event.
15. IF the Route_Check fails during the Warning_Phase or Forming_Phase because a required route became unusable, THEN THE Game SHALL cancel the Closure_Event.
16. WHEN the Game cancels a Closure_Event after the warning has been announced, THE Game SHALL remove the Chart cue and blockage cue, play the `closure-canceled` Shared_Clip, and show a Caption that includes the Display_Name and states that the channel stays open.
17. IF the boat unloads at the ranger station before the Target_Channel closes, THEN THE Game SHALL cancel the Closure_Event and remove the Chart cue and blockage cue without playing the `closure-canceled` Shared_Clip.
18. IF no Channel in the Traversal_Record is a Safe_Closure_Candidate, THEN THE Game SHALL skip the Closure_Event for that run without warning the player.
19. THE Closure_Event SHALL use its own Closure_Zone and deferral logic and SHALL add the Target_Channel to `state.closed` only when the boat is outside the Closure_Zone, so that the existing removal in `update()` while `waterClearance` is below 8 does not act on the new closure.
20. WHILE a Closure_Event is deferred, THE Game SHALL keep the Chart and Caption consistent with the Deferred_State until the closure completes or is canceled.

### Requirement 4: Make the detour legible

**User Story:** As a player, I want a clear alternate route, so that I can choose a detour with confidence.

#### Acceptance Criteria

1. WHERE the Cypress Slip is open in the active Route_Setup and a Route_Check passes through it, THE Game SHALL treat the Cypress Slip as a valid Detour.
2. WHERE a longer open passage reaches the ranger station from the boat's position, THE Game SHALL treat that passage as a valid Detour.
3. WHILE the Target_Channel is in the Closed_State and the boat advances toward its barrier for the Keeper_Delay, THE Lantern_Keeper SHALL appear using the existing warning logic.
4. WHEN the boat turns away from the closed Target_Channel, THE Lantern_Keeper SHALL clear.
5. WHILE the boat travels on an open Detour, THE Game SHALL keep the Lantern_Keeper hidden.
6. WHILE the Target_Channel is in the Warning_Phase, Forming_Phase, or Deferred_State and still open, THE Game SHALL keep the Lantern_Keeper hidden for that Channel.
7. WHEN the Closure_Event closes the Target_Channel, THE Game SHALL show the closed Target_Channel on the Chart with the same closed marking as other closed channels.
8. THE Game SHALL apply the existing Lantern_Keeper cooldown of 22 seconds to the closed Target_Channel.

### Requirement 5: Preserve the time to beat

**User Story:** As a player, I want my best time kept unless I beat it, so that a worse run never erases my record.

#### Acceptance Criteria

1. WHEN Retry is selected in Mission_1, THE Game SHALL keep the same Route_Setup.
2. WHEN New_Run is selected in Mission_1, THE Game SHALL choose a different Route_Setup through `chooseNewRouteSetup`.
3. WHEN the Traversal_Record and the boat's position are equal across two runs on the same Route_Setup, THE Game SHALL select the same Target_Channel and make the same closure decision.
4. THE Game SHALL make the Target_Channel selection a deterministic function of the Route_Setup, the Traversal_Record, and the boat's position at the time of boarding, with no use of `Math.random` or elapsed time.
5. WHEN two runs on the same Route_Setup have different Traversal_Records, THE Game SHALL be able to select different Target_Channels.
6. THE Game SHALL keep a separate Time_To_Beat for each Route_Setup under its Record_Id.
7. THE Game SHALL keep the saved best time for Reed_Narrows_Setup, including the legacy `echo` migration in `loadBestTimes`.
8. WHEN every survivor is delivered to the ranger station and the Record_Store holds no Time_To_Beat for the active Record_Id, THE Game SHALL save the finish time as the first record for that Record_Id.
9. WHEN every survivor is delivered to the ranger station and the finish time is strictly lower than the Time_To_Beat for the active Record_Id, THE Game SHALL replace the Time_To_Beat with the finish time.
10. IF every survivor is delivered and the finish time is equal to or greater than the Time_To_Beat for the active Record_Id, THEN THE Game SHALL leave the Time_To_Beat unchanged.
11. WHILE any survivor remains ashore at a pickup site or aboard the boat, THE Game SHALL leave the Record_Store unchanged.
12. IF a run fails or is abandoned, THEN THE Game SHALL leave the Record_Store unchanged.
13. WHEN Retry or New_Run starts, THE Game SHALL leave the Record_Store unchanged.

### Requirement 6: Rescue flow is preserved

**User Story:** As a player, I want the rescue to work as before, so that the new hazard does not break the game.

#### Acceptance Criteria

1. WHEN Reed_Narrows_Setup, North_Approach_Setup, or South_Crossover_Setup is played to completion, THE Game SHALL let the player board, deliver, and return for all three survivors.
2. WHEN the Closure_Event closes the Target_Channel, THE Game SHALL leave the boat's `aboard`, `delivered`, and `trips` values unchanged.
3. WHEN the player switches between the Overhead_View, Operator_View, and Chart during a Closure_Event, THE Game SHALL keep the rescue state and Closure_Event phase unchanged.
4. WHEN the boat is at the ranger station and brakes with survivors aboard, THE Game SHALL unload them as before.
5. THE Game SHALL remain playable on desktop browsers and on iPhone Safari with the existing touch layout.

### Requirement 7: Audio and view coverage

**User Story:** As a player, I want to understand the hazard on any camera and with sound off.

#### Acceptance Criteria

1. WHILE audio is muted, THE Game SHALL present every Closure_Event stage, including warning, forming, deferred, closed, and canceled, through Caption, Chart, or on-screen cue.
2. WHILE audio is enabled, THE Game SHALL play the Warning_Clip for the warning and the Shared_Clips for the deferred, closed, and canceled outcomes.
3. WHILE the Operator_View is active, THE Game SHALL show the forming blockage and the closed barrier in the view.
4. WHILE the Overhead_View is active, THE Game SHALL show the forming blockage and the closed barrier in the view.
5. WHILE the Chart is open, THE Game SHALL show the warning cue, the forming cue, the deferred cue, and the closed marking for the Target_Channel.

### Requirement 8: Automated route and data checks

**User Story:** As a developer, I want automated checks of the route logic, the line registry, and the records, so that regressions are caught early.

#### Acceptance Criteria

1. THE Route_Check_Suite SHALL run on every Mission_1 Route_Setup.
2. THE Route_Check_Suite SHALL cover every Eligible_Channel as a candidate closure in each Route_Setup.
3. THE Route_Check_Suite SHALL test boat positions on both sides of each candidate barrier, inside the Closure_Zone, and at the Closure_Zone edge.
4. FOR ALL boat positions and candidate closures in the Route_Check_Suite, THE Route_Check SHALL never report a Return_Route that passes through the Closure_Zone.
5. FOR ALL Safe_Closure_Candidates, THE Route_Check SHALL also confirm a Pickup_Route from the ranger station to the Broken_Cypress_Dock while Remaining_Survivors is greater than zero.
6. THE Route_Check_Suite SHALL test that a candidate with a passing Return_Route and a failing Pickup_Route is rejected, and that a candidate with a failing Return_Route and a passing Pickup_Route is rejected.
7. THE Route_Check_Suite SHALL test that the Pickup_Route check is skipped when Remaining_Survivors is zero.
8. THE Route_Check_Suite SHALL test that a U-turn into an eligible branch does not add that branch to the Traversal_Record.
9. THE Route_Check_Suite SHALL test that the same inputs produce the same Target_Channel across repeated evaluations.
10. THE Route_Check_Suite SHALL test that two different Traversal_Records on the same Route_Setup can produce different Target_Channels.
11. THE Route_Check_Suite SHALL test that a closure with the boat inside the Closure_Zone at the Countdown_End enters the Deferred_State, closes after the boat leaves and both routes pass, and cancels when the Deferral_Limit passes or the boat unloads.
12. THE Route_Check_Suite SHALL test that the Lantern_Keeper appears only after the Keeper_Delay, clears on turning away, and does not appear on an open Detour.
13. THE Route_Check_Suite SHALL test the saved record for these cases: first record for a Record_Id is saved; a strictly faster finish replaces the record; a slower finish leaves the record unchanged; an equal finish leaves the record unchanged; a failed or abandoned run leaves the record unchanged.
14. THE Route_Check_Suite SHALL test that Reed_Narrows_Setup's saved record, including the legacy `echo` migration, is kept.
15. THE Route_Check_Suite SHALL test that every Eligible_Channel in the Closure_Registry has a Display_Name, a Warning_Line registered in `radio-lines.mjs` with a non-empty Caption, and an existing `dist/assets/radio/closure-warning-<channel-id>.mp3` file.
16. THE Route_Check_Suite SHALL test that the three Shared_Clip lines are registered in `radio-lines.mjs` and that their MP3 files exist.
17. THE Route_Check_Suite SHALL test that the Closure_Timing_Constants hold the Warning_Phase, Forming_Phase, and Deferral_Limit values and that no other source file repeats those values as literals.
18. THE Route_Check_Suite SHALL run without a browser, using Node.js against the `.mjs` modules.
19. WHEN the Route_Check_Suite fails, THE Route_Check_Suite SHALL report the Route_Setup, candidate Channel, and boat position that failed, or the line id or file name that failed.

### Requirement 9: Regression checks

**User Story:** As a developer, I want other missions to keep working, so that this feature does not break them.

#### Acceptance Criteria

1. THE Regression_Suite SHALL confirm that Training Patrol creates no Closure_Event and no Traversal_Record entries.
2. THE Regression_Suite SHALL confirm that Blackout, The Closing Cut, Two Calls Two Seats, and The Last Crossing produce no Closure_Event.
3. THE Regression_Suite SHALL confirm that scheduled closures (`time` and `delivered` triggers) in The Closing Cut and The Last Crossing behave as in the baseline commit.
4. THE Regression_Suite SHALL confirm that fixed roadblocks and `createState` outputs for all missions match the baseline.
5. THE Regression_Suite SHALL confirm that the existing radio lines and their MP3 files are unchanged from the baseline.
6. THE Regression_Suite SHALL confirm that `loadBestTimes` behaves as in the baseline and that `saveBestTimes` writes the same storage format.

### Requirement 10: Kiro hook

**User Story:** As a developer, I want the route checks to rerun when I change route code, so that I do not ship a trapped boat.

#### Acceptance Criteria

1. THE Route_Check_Hook SHALL be stored under `.kiro/hooks/` in the project.
2. WHEN a file is saved that holds route data, closure logic, closure timing, or radio lines (`dist/missions.mjs`, `dist/play-progress.mjs`, `dist/radio-lines.mjs`, the Closure_Registry, the Closure_Timing_Constants, and the new closure module), THE Route_Check_Hook SHALL run the Route_Check_Suite.
3. IF the Route_Check_Suite fails, THEN THE Route_Check_Hook SHALL report the failing output to the developer.
4. THE Route_Check_Hook SHALL run the suite once per save event.

### Requirement 11: Manual test checklist and reporting

**User Story:** As a developer, I want a manual checklist and honest reporting, so that device results are not confused with simulated results.

#### Acceptance Criteria

1. THE Manual_Checklist SHALL list tests for desktop browsers and for iPhone Safari.
2. THE Manual_Checklist SHALL include these playtests: complete all three Route_Setups; drive two different outbound routes; wait in the passage as the countdown ends on both sides of the barrier; stay in the Closure_Zone past the Deferral_Limit; drive toward the blocked route then take a detour; Retry and New_Run; use Overhead_View and Operator_View with audio on and muted.
3. THE Manual_Checklist SHALL include a timing playtest that judges whether the notice gives the player time to react while still making the closure matter on the return trip, and records the final Warning_Phase, Forming_Phase, and Deferral_Limit values chosen.
4. THE Manual_Checklist SHALL include a clip check that each Warning_Clip is at most 5 seconds long, ends inside the Warning_Phase, and names the same channel as its Caption.
5. THE Manual_Checklist SHALL include a check that the game still runs with caption only when one Warning_Clip file is removed.
6. THE Manual_Checklist SHALL provide a result field for each test with the device, browser, date, and pass or fail.
7. THE Project SHALL report simulated or automated results separately from actual device playtests.
8. THE Project SHALL record the baseline commit, the changes Kiro made, one successful test run, and any failure the tests caught.

### Requirement 12: Milestone scope

**User Story:** As a project owner, I want a focused first milestone, so that Mission 1 is tested before further work.

#### Acceptance Criteria

1. THE Game SHALL start a Closure_Event only in Mission_1.
2. THE Game SHALL leave The Last Crossing's behavior unchanged in the first milestone.
3. THE Project SHALL keep the `.kiro/` directory, including this spec and the Route_Check_Hook, in the submission repository.

### Requirement 13: Spoken warning names the channel

**User Story:** As a player, I want to hear which channel is closing, so that I can react without reading the screen.

#### Acceptance Criteria

1. THE Closure_Registry SHALL list, for each Eligible_Channel, one Display_Name and one Warning_Line id of the form `closure-warning-<channel-id>`.
2. THE Game SHALL provide one Warning_Clip per Eligible_Channel at `dist/assets/radio/closure-warning-<channel-id>.mp3`, whose spoken text names that channel.
3. THE Game SHALL register each Warning_Line in `radio-lines.mjs` with a Caption that carries the same Display_Name as the Warning_Clip.
4. WHEN the Closure_Event starts, THE Game SHALL play the Warning_Clip for the Target_Channel at radio priority 5.
5. WHEN the Closure_Event closes, is deferred, or is canceled, THE Game SHALL play the matching Shared_Clip at radio priority 5.
6. THE Game SHALL carry the channel name for the Shared_Clip outcomes in the Caption, on the Chart, and in the on-screen cue, because the Shared_Clips contain no channel name.
7. THE Game SHALL size each Warning_Clip to at most 5 seconds, so that the spoken warning ends inside the Warning_Phase.
8. IF a Warning_Clip or Shared_Clip file cannot be loaded, THEN THE Game SHALL present the stage through Caption, Chart, and on-screen cue only, and continue the Closure_Event.

### Requirement 14: Configurable notice timing

**User Story:** As a designer, I want the notice durations in one place and tuned by playtest, so that the closure is fair and still matters.

#### Acceptance Criteria

1. THE Closure_Timing_Constants SHALL hold the Warning_Phase, the Forming_Phase, and the Deferral_Limit in one source location.
2. THE Closure_Timing_Constants SHALL start with a Warning_Phase of 12 seconds, a Forming_Phase of 8 seconds, and a Deferral_Limit of 15 seconds.
3. THE Game SHALL read all Closure_Event durations from the Closure_Timing_Constants, with no other source file holding those durations.
4. WHEN a value in the Closure_Timing_Constants changes, THE Game SHALL apply the new value without any other code change.
5. WHEN the playtest in Requirement 11 completes, THE Project SHALL record the final values in the Closure_Timing_Constants and in the Manual_Checklist.

### Requirement 15: Replaceable voice lines

**User Story:** As a developer, I want a fixed list of lines to record and replace later, so that I can test with the current voices now and swap voices without code changes.

#### Acceptance Criteria

1. THE Project SHALL list in Appendix A, for every new closure announcement, the line id, the MP3 file name under `dist/assets/radio/`, the exact spoken text, and the Caption text.
2. THE Game SHALL use the existing dispatch voice for the new clips until final recordings replace them.
3. WHEN an MP3 file in `dist/assets/radio/` is overwritten with a file of the same name, THE Game SHALL play the new clip with no code change.
4. THE Project SHALL record the new clips in the same format as the existing clips in `dist/assets/radio/`.
5. IF a clip file is missing at runtime, THEN THE Game SHALL continue with the Caption only.

## Appendix A: Radio lines to record

All lines use the existing dispatch voice and radio priority 5. Each file goes in `dist/assets/radio/`. The spoken text and the Caption are the same for the 16 Warning_Lines. The three Shared_Clips contain no channel name. Their Caption starts with the Display_Name, supplied through the existing `place` argument of `transmit`. Warning_Clips are at most 5 seconds long.

### A.1 Per-channel warning clips

| Line id | MP3 file | Spoken text | Caption text |
| --- | --- | --- | --- |
| closure-warning-cypress-creek | closure-warning-cypress-creek.mp3 | Cypress Creek is closing. Find another way back. | Cypress Creek is closing. Find another way back. |
| closure-warning-cypress-squeeze | closure-warning-cypress-squeeze.mp3 | Cypress Squeeze is closing. Find another way back. | Cypress Squeeze is closing. Find another way back. |
| closure-warning-high-marsh | closure-warning-high-marsh.mp3 | High Marsh is closing. Find another way back. | High Marsh is closing. Find another way back. |
| closure-warning-fallen-cypress | closure-warning-fallen-cypress.mp3 | Fallen Cypress is closing. Find another way back. | Fallen Cypress is closing. Find another way back. |
| closure-warning-north-passage | closure-warning-north-passage.mp3 | North Passage is closing. Find another way back. | North Passage is closing. Find another way back. |
| closure-warning-north-inlet | closure-warning-north-inlet.mp3 | North Inlet is closing. Find another way back. | North Inlet is closing. Find another way back. |
| closure-warning-reed-bend | closure-warning-reed-bend.mp3 | Reed Bend is closing. Find another way back. | Reed Bend is closing. Find another way back. |
| closure-warning-mud-bend | closure-warning-mud-bend.mp3 | Mud Bend is closing. Find another way back. | Mud Bend is closing. Find another way back. |
| closure-warning-reed-squeeze | closure-warning-reed-squeeze.mp3 | Reed Narrows is closing. Find another way back. | Reed Narrows is closing. Find another way back. |
| closure-warning-cross-marsh | closure-warning-cross-marsh.mp3 | Cross Marsh is closing. Find another way back. | Cross Marsh is closing. Find another way back. |
| closure-warning-east-crossover | closure-warning-east-crossover.mp3 | East Crossover is closing. Find another way back. | East Crossover is closing. Find another way back. |
| closure-warning-willow-reach | closure-warning-willow-reach.mp3 | Willow Reach is closing. Find another way back. | Willow Reach is closing. Find another way back. |
| closure-warning-south-inlet | closure-warning-south-inlet.mp3 | South Inlet is closing. Find another way back. | South Inlet is closing. Find another way back. |
| closure-warning-cut | closure-warning-cut.mp3 | Central Cut is closing. Find another way back. | Central Cut is closing. Find another way back. |
| closure-warning-high-water | closure-warning-high-water.mp3 | High Water is closing. Find another way back. | High Water is closing. Find another way back. |
| closure-warning-cypress-slip | closure-warning-cypress-slip.mp3 | Cypress Slip is closing. Find another way back. | Cypress Slip is closing. Find another way back. |

### A.2 Shared clips

`<Channel_Name>` stands for the Target_Channel's Display_Name, supplied by the Game in the Caption only.

| Line id | MP3 file | Spoken text | Caption text |
| --- | --- | --- | --- |
| closure-closed | closure-closed.mp3 | The channel is closed. Check the map for another way back. | `<Channel_Name>` is closed. Check the map for another way back. |
| closure-canceled | closure-canceled.mp3 | The channel is staying open. Carry on. | `<Channel_Name>` is staying open. Carry on. |
| closure-deferred | closure-deferred.mp3 | Clear the channel. Closing when you're through. | `<Channel_Name>`: Clear the channel. Closing when you're through. |

## Appendix B: Closure_Registry (candidate channels)

The "Closable in" column lists the Route_Setups where the channel is not a starting roadblock and closing it leaves both a Return_Route and a Pickup_Route, found by hand-tracing `routes`. RN is Reed_Narrows_Setup, NA is North_Approach_Setup, SC is South_Crossover_Setup. The Route_Check_Suite confirms or corrects this column.

| Channel id | Display_Name | Closable in | Note |
| --- | --- | --- | --- |
| cypress-creek | Cypress Creek | NA, SC | Roadblock in RN. |
| cypress-squeeze | Cypress Squeeze | NA, SC | Dead end in RN because Cypress Creek is blocked. |
| high-marsh | High Marsh | RN, SC | Only link from Cypress Bend to Cypress Exit in NA. |
| fallen-cypress | Fallen Cypress | RN, SC | Only link from High Marsh to Cypress Exit in NA. |
| north-passage | North Passage | RN, NA | Dead end in SC because North Inlet is blocked. |
| north-inlet | North Inlet | RN, NA | Roadblock in SC. |
| reed-bend | Reed Bend | NA, SC | Only link to Reed Turn in RN. |
| mud-bend | Mud Bend | NA, SC | Only link from Reed Turn in RN. |
| reed-squeeze | Reed Narrows | RN, SC | Roadblock in NA. |
| cross-marsh | Cross Marsh | RN, NA, SC | Link between Cypress Bend and Mud Bend. |
| east-crossover | East Crossover | RN, NA, SC | Link between Cypress Exit and Reed Narrows. |
| willow-reach | Willow Reach | RN, NA | Only link to the south inlet in SC. |
| south-inlet | South Inlet | RN, NA | Only entry to the sector in SC. |
| cut | Central Cut | RN | Roadblock in NA and SC. |
| high-water | High Water | RN, NA | Roadblock in SC. |
| cypress-slip | Cypress Slip | NA, SC | Roadblock in RN. In SC the detour is the long east loop. |

## Appendix C: Excluded channels

| Channel id | Reason |
| --- | --- |
| launch-channel | Every path home uses it. |
| station-run, marker-run, old-landing-run | Trunk channels from the sector gate and junction. Closing one leaves only long, multi-channel detours that are hard to show on the Chart, and old-landing-run is the only link to the Cypress Slip side in SC. |
| west-bay, loop, west-spur, north-ridge | West-side channels that the player rarely uses on the way to the dock. Each would need a clip for little gameplay value. |
| reed-neck | Short connector between the Central Cut and High Water. Closing it duplicates those two channels. |
| outpost-run, east-bank, south-run, far-bend | East loop channels used only on a long outbound route. A closure there gives a long, confusing detour. They can be added to the registry later with a name and a clip. |
