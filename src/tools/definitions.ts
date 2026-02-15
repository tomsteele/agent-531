import type Anthropic from '@anthropic-ai/sdk';

export const toolDefinitions: Anthropic.Tool[] = [
  // --- Workout Tools ---
  {
    name: 'get_todays_workout',
    description: "Returns the full prescribed workout for a lift based on the active template, current week, and training max.",
    input_schema: {
      type: 'object' as const,
      properties: {
        lift: { type: 'string', enum: ['squat', 'bench', 'deadlift', 'ohp'], description: 'The lift to get the workout for' },
      },
      required: ['lift'],
    },
  },
  {
    name: 'log_workout',
    description: "Logs a completed workout. Updates PRs if AMRAP/PR set results are provided. Auto-advances the week if all four lifts are logged or skipped.",
    input_schema: {
      type: 'object' as const,
      properties: {
        lift: { type: 'string', enum: ['squat', 'bench', 'deadlift', 'ohp'] },
        actual_results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              weight: { type: 'number' },
              reps: { type: 'number' },
            },
            required: ['weight', 'reps'],
          },
          description: 'Array of sets performed',
        },
        amrap_reps: { type: 'integer', description: 'Reps achieved on AMRAP/PR set' },
        amrap_weight: { type: 'number', description: 'Weight used on AMRAP/PR set' },
        notes: { type: 'string', description: 'Any notes about the session' },
      },
      required: ['lift', 'actual_results'],
    },
  },
  {
    name: 'skip_lift',
    description: "Marks a lift as skipped for the current week. Counts toward week completion.",
    input_schema: {
      type: 'object' as const,
      properties: {
        lift: { type: 'string', enum: ['squat', 'bench', 'deadlift', 'ohp'] },
        reason: { type: 'string', description: 'Why the lift was skipped' },
      },
      required: ['lift'],
    },
  },
  {
    name: 'skip_week',
    description: "Skips the entire current week. All unlogged lifts are marked as skipped. Advances the week.",
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string', description: 'Why the week was skipped' },
      },
      required: [],
    },
  },
  {
    name: 'reschedule_lift',
    description: "Moves a lift to a different day within the current week.",
    input_schema: {
      type: 'object' as const,
      properties: {
        lift: { type: 'string', enum: ['squat', 'bench', 'deadlift', 'ohp'] },
        new_day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] },
      },
      required: ['lift', 'new_day'],
    },
  },

  // --- State Tools ---
  {
    name: 'get_program_state',
    description: "Returns the full current state of the program including lifts, schedule, and cycle position.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'advance_week',
    description: "Advances the program by one week. If completing week 3, sets status to pending_tm_bump.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'bump_tm',
    description: "Bumps the training max for a specific lift by the given amount.",
    input_schema: {
      type: 'object' as const,
      properties: {
        lift: { type: 'string', enum: ['squat', 'bench', 'deadlift', 'ohp'] },
        amount: { type: 'number', description: 'Amount to add to TM (can be 0 to hold)' },
      },
      required: ['lift', 'amount'],
    },
  },
  {
    name: 'skip_tm_bump',
    description: "Holds the TM for a specific lift (equivalent to bumping by 0).",
    input_schema: {
      type: 'object' as const,
      properties: {
        lift: { type: 'string', enum: ['squat', 'bench', 'deadlift', 'ohp'] },
      },
      required: ['lift'],
    },
  },
  {
    name: 'finalize_tm_bumps',
    description: "Call after all TM bumps are resolved to advance the program state. Moves from pending_tm_bump to the next phase or cycle.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'set_phase',
    description: "Switches the program phase (leader/anchor). Resets week to 1.",
    input_schema: {
      type: 'object' as const,
      properties: {
        phase: { type: 'string', enum: ['leader', 'anchor'] },
      },
      required: ['phase'],
    },
  },
  {
    name: 'set_template',
    description: "Assigns a template to a specific lift.",
    input_schema: {
      type: 'object' as const,
      properties: {
        lift: { type: 'string', enum: ['squat', 'bench', 'deadlift', 'ohp'] },
        template_name: { type: 'string', description: 'Template identifier (filename without extension, e.g. "leviathan-leader"). Use get_available_templates to see available options with display names.' },
      },
      required: ['lift', 'template_name'],
    },
  },
  {
    name: 'set_week',
    description: "Manually sets the current week.",
    input_schema: {
      type: 'object' as const,
      properties: {
        week: { type: 'integer', enum: [1, 2, 3] },
      },
      required: ['week'],
    },
  },
  {
    name: 'set_leader_cycles_completed',
    description: "Manually sets the leader cycle count.",
    input_schema: {
      type: 'object' as const,
      properties: {
        count: { type: 'integer', description: 'Number of leader cycles to mark as completed' },
      },
      required: ['count'],
    },
  },

  // --- Query Tools ---
  {
    name: 'get_prs',
    description: "Returns PR history, optionally filtered by lift.",
    input_schema: {
      type: 'object' as const,
      properties: {
        lift: { type: 'string', enum: ['squat', 'bench', 'deadlift', 'ohp'], description: 'Filter by lift. Omit for all lifts.' },
      },
      required: [],
    },
  },
  {
    name: 'get_training_maxes',
    description: "Returns current training maxes for all lifts.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_workout_history',
    description: "Returns recent workout logs.",
    input_schema: {
      type: 'object' as const,
      properties: {
        lift: { type: 'string', enum: ['squat', 'bench', 'deadlift', 'ohp'], description: 'Filter by lift' },
        last_n: { type: 'integer', description: 'Number of recent workouts to return (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_available_templates',
    description: "Lists all templates in the templates folder.",
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['leader', 'anchor'], description: 'Filter by type' },
      },
      required: [],
    },
  },

  // --- Setup Tools ---
  {
    name: 'set_tested_1rm',
    description: "Sets the tested 1RM for a lift and recalculates the training max.",
    input_schema: {
      type: 'object' as const,
      properties: {
        lift: { type: 'string', enum: ['squat', 'bench', 'deadlift', 'ohp'] },
        weight: { type: 'number', description: 'Tested 1RM in lbs' },
      },
      required: ['lift', 'weight'],
    },
  },
  {
    name: 'set_schedule',
    description: "Maps a day of the week to a lift. Reports conflicts if another lift was on that day.",
    input_schema: {
      type: 'object' as const,
      properties: {
        day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] },
        lift: { type: 'string', enum: ['squat', 'bench', 'deadlift', 'ohp', 'none'] },
      },
      required: ['day', 'lift'],
    },
  },
  {
    name: 'reset_program',
    description: "Resets all cycle state. Keeps templates, 1RMs, and workout history.",
    input_schema: {
      type: 'object' as const,
      properties: {
        keep_tms: { type: 'boolean', description: 'If true, keep current TMs. If false, recalculate from tested 1RMs. Default true.' },
      },
      required: [],
    },
  },
];
