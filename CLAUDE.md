# 5/3/1 Slack Training Agent

## Project Overview

A Discord-based training agent built around Jim Wendler's 5/3/1 program. The agent messages the user their prescribed workout each morning, accepts natural language results, tracks workouts, PRs, training maxes, and manages program progression automatically.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Bun
- **Messaging:** Discord.js (`discord.js`)
- **AI:** Anthropic API with tool use (`@anthropic-ai/sdk`)
- **Database:** SQLite via `bun:sqlite` (built-in)
- **Scheduler:** Internal timer for daily morning message
- **Process management:** systemd

## Project Structure

```
/
├── CLAUDE.md                  # This file
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # Entry point — starts Discord bot and scheduler
│   ├── discord.ts              # Discord.js client setup, message handlers
│   ├── agent.ts                # Anthropic API integration, tool dispatch
│   ├── scheduler.ts            # Morning message timer, checks time and fires daily
│   ├── db/
│   │   ├── schema.ts           # SQLite schema setup and migrations
│   │   ├── queries.ts          # All database read/write functions
│   │   └── connection.ts       # SQLite connection singleton (bun:sqlite)
│   ├── engine/
│   │   ├── calculator.ts       # Weight calculations, e1RM, rounding
│   │   ├── templates.ts        # Template parser (reads markdown files)
│   │   └── progression.ts      # Cycle state machine, auto-advance logic
│   ├── tools/
│   │   ├── definitions.ts      # Tool definitions for Anthropic API
│   │   ├── handlers.ts         # Tool call implementations (maps tool names to functions)
│   │   ├── workout.ts          # get_todays_workout, log_workout, skip_lift, skip_week, reschedule_lift
│   │   ├── state.ts            # get_program_state, advance_week, bump_tm, skip_tm_bump, set_phase, set_template, set_week, set_leader_cycles_completed
│   │   ├── query.ts            # get_prs, get_training_maxes, get_workout_history, get_available_templates
│   │   └── setup.ts            # set_tested_1rm, set_schedule, reset_program
│   └── types.ts                # Shared TypeScript types and interfaces
├── templates/                  # 5/3/1 program templates (markdown)
│   ├── leviathan-leader.md
│   ├── leviathan-anchor.md
│   ├── bbs-fsl-leader.md
│   ├── fsl-leader.md
│   ├── fsl-pr-set-anchor.md
│   └── original-531.md
├── data/                       # SQLite database file lives here
│   └── training.db
├── deploy/
│   └── 531-agent.service       # systemd unit file
└── docs/
    ├── data-model.md           # Database schema reference
    ├── tool-spec.md            # Tool definitions and behaviors
    └── system-prompt.md        # Agent system prompt
```

## Tool Definitions

See `docs/tool-spec.md` for full tool specifications. Tools are defined in Anthropic API tool_use format in `src/tools/definitions.ts`.

## Agent Integration (src/agent.ts)

The agent function:
1. Takes a user message (string)
2. Sends it to the Anthropic API with the system prompt and tool definitions
3. Handles tool_use responses by dispatching to the appropriate handler
4. Loops until Claude returns a final text response (multi-turn tool use)
5. Returns the text response to Slack

```typescript
async function runAgent(userMessage: string, conversationHistory: Message[]): Promise<string> {
  // 1. Build messages array with conversation history
  // 2. Call Anthropic API with system prompt, tools, messages
  // 3. While response contains tool_use blocks:
  //    a. Execute each tool call
  //    b. Append tool results to messages
  //    c. Call API again
  // 4. Return final text response
}
```

## Discord Integration (src/discord.ts)

Using discord.js with Gateway (websocket, no public URL needed):

- Bot connects via Gateway websocket
- Listen for DMs only — ignore guild messages
- Filter by allowed user ID — ignore messages from anyone else
- Pass message text to `runAgent()`
- Post response back to the DM channel
- Maintain conversation history in memory (resets on restart, that's fine)

```typescript
if (message.author.id !== process.env.ALLOWED_USER_ID) return;
if (!message.channel.isDMBased()) return;
```

## Scheduler (src/scheduler.ts)

Internal timer that runs inside the long-running process. Checks every minute, fires the morning message once at the configured time (default 5:00 AM local).

1. On trigger: call `runAgent("It's a new day. Check the program state and let me know if there's a workout today or anything pending.")`
2. Post the response to the Discord DM channel
3. If the agent has nothing to say (rest day, no pending status), don't send a message
4. Track last fire date to prevent duplicate messages on restart


## Key Behavioral Rules

These are implemented in the system prompt, not in code. The system prompt is in `docs/system-prompt.md` and loaded at runtime.

- Always check program status before presenting a workout
- Never present a workout if there's a pending TM bump or phase transition
- Auto-advance week when all 4 lifts are logged or skipped
- Ask before bumping TMs — present suggestions, wait for confirmation
- Ask "deload or TM test?" at phase transitions
- Ask for anchor/leader template selection at phase changes
- Round all weights to nearest 5 lbs
- Keep messages brief and direct
- Don't message on rest days unless there's pending business

## Cycle State Machine

```
active (week 1) → active (week 2) → active (week 3)
  → pending_tm_bump
    → [user confirms bumps]
    → if leader_cycles_completed < 2: active (week 1), same phase
    → if leader_cycles_completed >= 2: pending_deload_or_test
      → [user chooses deload or TM test]
      → [user picks anchor templates]
      → active (week 1), anchor phase
        → week 2 → week 3 → pending_tm_bump
          → [user confirms bumps]
          → pending_deload_or_test
            → [user chooses deload or TM test]
            → [user picks leader templates]
            → active (week 1), leader phase (new cycle)
```

## TM Progression

- Squat: +10 lbs per cycle
- Deadlift: +10 lbs per cycle
- Bench: +5 lbs per cycle
- OHP: +5 lbs per cycle
- Always requires user confirmation
- User can hold, adjust, or skip any lift's bump

## e1RM Formula

Wendler: `weight * reps * 0.0333 + weight`

Configurable: if changing later, update `calculateE1RM` in `src/engine/calculator.ts`.
