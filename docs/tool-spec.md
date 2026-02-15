# 5/3/1 Agent - Tool Specifications

## Overview

These are the tools available to Claude via the Anthropic API's tool use feature. Claude calls these tools during Slack conversations to read and write workout data. Claude handles all conversational logic — interpreting natural language and deciding which tools to call.

All tools return JSON responses.

---

## Daily Workflow Tools

### get_todays_workout

Returns the full prescribed workout for a lift based on the active template, current week, and training max.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| lift | string | yes | 'squat', 'bench', 'deadlift', or 'ohp' |

**Returns:**
```json
{
  "lift": "squat",
  "template": "leviathan-leader",
  "week": 2,
  "phase": "leader",
  "training_max": 315,
  "main_work": [
    { "percentage": 70, "weight": 220, "reps": "1-3" },
    { "percentage": 80, "weight": 250, "reps": "1-3" },
    { "percentage": 90, "weight": 285, "reps": "1-3" },
    { "percentage": 100, "weight": 315, "reps": "1" }
  ],
  "supplemental": [
    { "sets": 5, "reps": 5, "percentage": 70, "weight": 220, "type": "FSL" }
  ]
}
```

---

### log_workout

Logs a completed workout. Updates PRs if AMRAP/PR set results are provided. After logging, checks if all four lifts for the current week are logged or skipped — if so, auto-advances the week.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| lift | string | yes | 'squat', 'bench', 'deadlift', or 'ohp' |
| actual_results | object[] | yes | Array of sets performed: `[{ "weight": 285, "reps": 5 }, ...]` |
| amrap_reps | integer | no | Reps achieved on AMRAP/PR set |
| amrap_weight | number | no | Weight used on AMRAP/PR set |
| notes | string | no | Any notes about the session |

**Returns:**
```json
{
  "logged": true,
  "date": "2026-02-14",
  "lift": "squat",
  "new_pr": true,
  "pr_details": {
    "weight": 285,
    "reps": 8,
    "estimated_1rm": 361,
    "previous_best_reps": 6
  },
  "week_complete": false,
  "lifts_remaining": ["bench", "ohp"]
}
```

**Side effects:**
- Updates `prs` table if AMRAP result is a new best for that weight
- Updates `estimated_1rm` on `lifts` table if new best e1RM
- If all 4 lifts are logged or skipped for the week, calls `advance_week` internally

---

### skip_lift

Marks a lift as skipped for the current week. Counts toward week completion — if all 4 lifts are logged or skipped, auto-advances.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| lift | string | yes | 'squat', 'bench', 'deadlift', or 'ohp' |
| reason | string | no | Why the lift was skipped |

**Returns:**
```json
{
  "skipped": true,
  "lift": "deadlift",
  "week": 2,
  "reason": "back tightness",
  "week_complete": false,
  "lifts_remaining": ["ohp"]
}
```

---

### skip_week

Skips the entire current week. All unlogged lifts are marked as skipped. Advances the week.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| reason | string | no | Why the week was skipped |

**Returns:**
```json
{
  "skipped": true,
  "week_skipped": 2,
  "advanced_to": 3,
  "reason": "travel"
}
```

---

### reschedule_lift

Moves a lift to a different day within the current week. Does not affect cycle progression.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| lift | string | yes | 'squat', 'bench', 'deadlift', or 'ohp' |
| new_day | string | yes | Day of the week to move it to |

**Returns:**
```json
{
  "rescheduled": true,
  "lift": "deadlift",
  "original_day": "wednesday",
  "new_day": "saturday"
}
```

---

## State Management Tools

### get_program_state

Returns the full current state of the program.

**Parameters:** None

**Returns:**
```json
{
  "current_week": 2,
  "current_phase": "leader",
  "leader_cycles_completed": 1,
  "phase_status": "active",
  "lifts": {
    "squat": {
      "tested_1rm": 350,
      "estimated_1rm": 365,
      "training_max": 315,
      "tm_increment": 10,
      "active_template": "leviathan-leader"
    },
    "bench": {
      "tested_1rm": 250,
      "estimated_1rm": 260,
      "training_max": 225,
      "tm_increment": 5,
      "active_template": "bbs-fsl-leader"
    },
    "deadlift": {
      "tested_1rm": 400,
      "estimated_1rm": 415,
      "training_max": 360,
      "tm_increment": 10,
      "active_template": "fsl-leader"
    },
    "ohp": {
      "tested_1rm": 170,
      "estimated_1rm": 175,
      "training_max": 155,
      "tm_increment": 5,
      "active_template": "leviathan-leader"
    }
  },
  "schedule": {
    "sunday": "squat",
    "monday": "bench",
    "wednesday": "deadlift",
    "thursday": "ohp"
  }
}
```

---

### advance_week

Advances the program by one week. If completing week 3, sets status to `pending_tm_bump`.

**Parameters:** None

**Returns:**
```json
{
  "previous_week": 3,
  "new_week": 1,
  "status": "pending_tm_bump",
  "message": "Cycle complete. Ready to discuss TM bumps."
}
```

**State transitions:**
- Week 1 → Week 2: status stays `active`
- Week 2 → Week 3: status stays `active`
- Week 3 → status becomes `pending_tm_bump`
  - After TM bump resolved → check leader_cycles_completed
    - If < 2: reset to week 1, stay in leader phase
    - If >= 2: status becomes `pending_deload_or_test`
      - After deload/test → switch to anchor phase, week 1

---

### bump_tm

Bumps the training max for a specific lift by the given amount. Called after user confirms.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| lift | string | yes | 'squat', 'bench', 'deadlift', or 'ohp' |
| amount | number | yes | Amount to add to TM (can be 0 to hold) |

**Returns:**
```json
{
  "lift": "squat",
  "previous_tm": 315,
  "new_tm": 325,
  "amount": 10
}
```

---

### skip_tm_bump

Holds the TM for a specific lift. Equivalent to `bump_tm(lift, 0)`.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| lift | string | yes | 'squat', 'bench', 'deadlift', or 'ohp' |

**Returns:**
```json
{
  "lift": "squat",
  "training_max": 315,
  "held": true
}
```

---

### set_phase

Switches the program phase after a deload or TM test.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| phase | string | yes | 'leader' or 'anchor' |

**Returns:**
```json
{
  "previous_phase": "leader",
  "new_phase": "anchor",
  "leader_cycles_completed_reset": true,
  "current_week": 1
}
```

**Side effects:**
- Resets current_week to 1
- If switching to leader, resets leader_cycles_completed to 0

---

### set_template

Assigns a template to a specific lift.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| lift | string | yes | 'squat', 'bench', 'deadlift', or 'ohp' |
| template_name | string | yes | Template filename without extension (e.g., 'leviathan-leader') |

**Returns:**
```json
{
  "lift": "squat",
  "previous_template": "bbs-fsl-leader",
  "new_template": "leviathan-leader"
}
```

---

### set_week

Manually sets the current week. Use when the user wants to jump to a different point in the cycle.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| week | integer | yes | 1, 2, or 3 |

**Returns:**
```json
{
  "previous_week": 2,
  "new_week": 1
}
```

---

### set_leader_cycles_completed

Manually sets the leader cycle count. Use when the user wants to extend or shorten the leader phase.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| count | integer | yes | Number of leader cycles to mark as completed |

**Returns:**
```json
{
  "previous_count": 2,
  "new_count": 1
}
```

---

## Query Tools

### get_prs

Returns PR history, optionally filtered by lift.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| lift | string | no | Filter by lift. Omit for all lifts. |

**Returns:**
```json
{
  "prs": [
    {
      "lift": "squat",
      "weight": 285,
      "best_reps": 8,
      "estimated_1rm": 361,
      "date": "2026-02-10"
    },
    {
      "lift": "squat",
      "weight": 300,
      "best_reps": 5,
      "estimated_1rm": 350,
      "date": "2026-01-28"
    }
  ]
}
```

---

### get_training_maxes

Returns current training maxes for all lifts.

**Parameters:** None

**Returns:**
```json
{
  "squat": { "training_max": 315, "tested_1rm": 350, "estimated_1rm": 365, "tm_percentage": 90 },
  "bench": { "training_max": 225, "tested_1rm": 250, "estimated_1rm": 260, "tm_percentage": 90 },
  "deadlift": { "training_max": 360, "tested_1rm": 400, "estimated_1rm": 415, "tm_percentage": 90 },
  "ohp": { "training_max": 155, "tested_1rm": 170, "estimated_1rm": 175, "tm_percentage": 90 }
}
```

---

### get_workout_history

Returns recent workout logs.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| lift | string | no | Filter by lift |
| last_n | integer | no | Number of recent workouts to return (default 10) |

**Returns:**
```json
{
  "workouts": [
    {
      "date": "2026-02-14",
      "lift": "squat",
      "template": "leviathan-leader",
      "week": 2,
      "phase": "leader",
      "prescribed": { "main": [...], "supplemental": [...] },
      "actual": [...],
      "amrap_reps": null,
      "notes": null
    }
  ]
}
```

---

### get_available_templates

Lists all templates in the templates folder.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| type | string | no | Filter by 'leader', 'anchor', or omit for all |

**Returns:**
```json
{
  "templates": [
    { "name": "leviathan-leader", "type": "leader", "tm_percentage": 90 },
    { "name": "leviathan-anchor", "type": "anchor", "tm_percentage": 90 },
    { "name": "bbs-fsl-leader", "type": "leader", "tm_percentage": 90 },
    { "name": "fsl-leader", "type": "leader", "tm_percentage": 90 },
    { "name": "fsl-pr-set-anchor", "type": "anchor", "tm_percentage": 90 },
    { "name": "original-531", "type": "leader/anchor", "tm_percentage": 90 }
  ]
}
```

---

## Setup Tools

### set_tested_1rm

Sets the tested 1RM for a lift and recalculates the training max based on the active template's TM percentage.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| lift | string | yes | 'squat', 'bench', 'deadlift', or 'ohp' |
| weight | number | yes | Tested 1RM in lbs |

**Returns:**
```json
{
  "lift": "squat",
  "tested_1rm": 350,
  "tm_percentage": 90,
  "new_training_max": 315
}
```

---

### set_schedule

Maps a day of the week to a lift. If the lift was previously on another day, that day is cleared. If another lift was on the target day, the user is warned and asked how to handle it.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| day | string | yes | Day of the week (e.g., 'monday') |
| lift | string | yes | 'squat', 'bench', 'deadlift', 'ohp', or 'none' to clear a day |

**Returns:**
```json
{
  "day": "thursday",
  "lift": "bench",
  "previous_lift_on_day": "ohp",
  "previous_day_for_lift": "tuesday",
  "conflict": true
}
```

If `conflict` is true, Claude should ask the user what to do with the displaced lift (e.g., "OHP was on Thursday — where do you want it?").

---

### reset_program

Resets all cycle state. Keeps templates, 1RMs, and workout history. Resets week to 1, phase to leader, leader cycles to 0.

**Parameters:**
| Name | Type | Required | Description |
|---|---|---|---|
| keep_tms | boolean | no | If true, keep current TMs. If false, recalculate from tested 1RMs. Default true. |

**Returns:**
```json
{
  "reset": true,
  "current_week": 1,
  "current_phase": "leader",
  "leader_cycles_completed": 0,
  "tms_kept": true
}
```

---

## Conversational Logic (handled by Claude, not tools)

Claude uses these tools in combination to handle natural language. Examples:

| User says | Claude does |
|---|---|
| "What's my workout today?" | Checks schedule for today's day → `get_todays_workout(lift)` |
| "Done. Got 8 on the top set at 285" | `log_workout(lift, results, amrap_reps=8, amrap_weight=285)` |
| "Skipping deadlifts this week" | `skip_lift('deadlift')` |
| "Can't train this week" | `skip_week()` |
| "Move OHP to Saturday" | `reschedule_lift('ohp', 'saturday')` |
| "What's my squat PR?" | `get_prs('squat')` |
| "Switch squat to BBS" | `set_template('squat', 'bbs-fsl-leader')` |
| "Restart this cycle from week 1" | `set_week(1)` |
| "I want to do 3 leader cycles instead of 2" | `set_leader_cycles_completed` to adjust count |
| "Move bench to Thursday" | `set_schedule('thursday', 'bench')`, handle conflicts |
| "Swap bench and OHP days" | `set_schedule` for both lifts |
| "I want to train Mon/Tue/Thu/Fri" | Multiple `set_schedule` calls |
| "Switch to the anchor now" | `set_phase('anchor')`, ask for anchor templates |
| "Go back to leaders" | `set_phase('leader')`, ask for leader templates |
| "Bump everything except bench" | `bump_tm` for squat/deadlift/ohp, `skip_tm_bump` for bench |
| "I tested my squat at 365" | `set_tested_1rm('squat', 365)` |
| "What templates do I have?" | `get_available_templates()` |
| "Start over" | `reset_program()` |
