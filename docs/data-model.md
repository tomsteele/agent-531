# 5/3/1 Agent - Data Model

## Overview

SQLite database with the following tables. All weights in lbs.

## Tables

### program_state

Single row table tracking global program position.

| Column | Type | Description |
|---|---|---|
| id | INTEGER PRIMARY KEY | Always 1 |
| current_week | INTEGER | 1, 2, or 3 |
| current_phase | TEXT | 'leader' or 'anchor' |
| leader_cycles_completed | INTEGER | 0, 1, 2, or 3 |
| phase_status | TEXT | 'active', 'pending_tm_bump', 'pending_deload_or_test' |

### schedule

Maps days of the week to lifts.

| Column | Type | Description |
|---|---|---|
| id | INTEGER PRIMARY KEY | |
| day_of_week | TEXT | 'monday', 'tuesday', etc. |
| lift | TEXT | 'squat', 'bench', 'deadlift', 'ohp' |
| order | INTEGER | Lift order for that day (if multiple) |

### lifts

Per-lift configuration and current state.

| Column | Type | Description |
|---|---|---|
| id | INTEGER PRIMARY KEY | |
| name | TEXT UNIQUE | 'squat', 'bench', 'deadlift', 'ohp' |
| tested_1rm | REAL | Manually set from actual testing |
| estimated_1rm | REAL | Best calculated from PR sets |
| training_max | REAL | Current TM, starts at 90% of tested_1rm |
| tm_increment | REAL | 10 for squat/deadlift, 5 for bench/ohp |
| active_template | TEXT | Filename of current template (e.g., 'leviathan-leader') |

### workout_log

Every completed workout.

| Column | Type | Description |
|---|---|---|
| id | INTEGER PRIMARY KEY | |
| date | TEXT | ISO date (YYYY-MM-DD) |
| lift | TEXT | 'squat', 'bench', 'deadlift', 'ohp' |
| template | TEXT | Template used |
| week | INTEGER | Which week of the cycle (1, 2, 3) |
| phase | TEXT | 'leader' or 'anchor' |
| prescribed | TEXT | JSON of prescribed sets/reps/weight |
| actual | TEXT | JSON of what was actually performed |
| amrap_reps | INTEGER | Reps on AMRAP/PR set (NULL if none) |
| amrap_weight | REAL | Weight on AMRAP/PR set (NULL if none) |
| calculated_1rm | REAL | e1RM from AMRAP set (NULL if none) |
| notes | TEXT | Any notes |

### prs

Best performance at each weight for each lift.

| Column | Type | Description |
|---|---|---|
| id | INTEGER PRIMARY KEY | |
| lift | TEXT | 'squat', 'bench', 'deadlift', 'ohp' |
| weight | REAL | Weight lifted |
| best_reps | INTEGER | Most reps at this weight |
| estimated_1rm | REAL | e1RM from this performance |
| date | TEXT | When this PR was set |

## Derived Values

- **Training Max**: Stored directly, initialized as `tested_1rm * tm_percentage` where tm_percentage comes from the active template (default 90%). Bumped manually per user approval.
- **Working weights**: Calculated at runtime from TM and template percentages
- **e1RM formula**: Wendler formula `weight * reps * 0.0333 + weight` (configurable)

## State Machine

```
leader_week_1 → leader_week_2 → leader_week_3
    → pending_tm_bump (agent asks, user confirms)
    → leader_cycles_completed += 1
    → if leader_cycles_completed >= 2:
        → pending_deload_or_test (agent asks: deload or TM test?)
        → deload/test week
        → anchor_week_1 → anchor_week_2 → anchor_week_3
        → pending_tm_bump
        → pending_deload_or_test
        → new program (pick leader templates)
    → else:
        → leader_week_1 (next leader cycle)
```

## Notes

- Templates are read from markdown files in /templates folder
- All four lifts progress through weeks together
- Templates are assigned per lift independently
- Phase transitions (leader → anchor) apply globally
- TM bumps require user confirmation per lift
- Deload vs TM test is user's choice
