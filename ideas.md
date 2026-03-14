# Ideas & Improvements

## Bugs / Critical Fixes

- [x] PR update logic conflates "new PR weight" with "improved reps at existing weight" — should distinguish between the two
- [ ] `advance_week` can be called while in `pending_tm_bump` state — should block or warn
- [ ] No validation on negative TM bumps — `bump_tm(lift, -50)` could zero out a training max
- [ ] Silent error suppression in template parsing (state.ts, setup.ts) — should log warnings instead of swallowing
- [ ] Phase transition via `set_phase` doesn't enforce state machine rules — can skip pending states

## Missing Core Features

- [x] Deload week vs TM test week — system prompt references this choice but no tools or state tracking exist to differentiate them
- [ ] Workout log editing — no way to correct a logged workout after the fact
- [x] Multi-lift days — schedule only supports one lift per day, can't do "Squat + OHP on Monday"
- [ ] Template pairing enforcement — `pairedLeader`/`pairedAnchor` fields are parsed but never used to suggest or enforce pairings
- [ ] Schedule conflict resolution — `set_schedule` returns `conflict: true` but provides no resolution path
- [ ] Workout history filtering by cycle — can't ask "show me leader cycle 1 results"

## New Templates

- [ ] SSL (Second Set Last)
- [ ] Pervertor (leader)
- [ ] Beefcake (leader)
- [ ] Coffinworm (leader)
- [ ] God Is a Beast

## Technical Improvements

- [ ] Persistent session storage — sessions lost on restart, could use SQLite
- [ ] Structured logging — replace console.log with a proper logger, persist agent cost data
- [ ] Database migrations — no migration system if schema needs to change
- [ ] Automated SQLite backups on a schedule
- [ ] Extract magic numbers to constants (0.0333 e1RM multiplier, default 90% TM, 2 leader cycles)
- [ ] Unified error response schema across all tools
- [ ] Input validation at tool boundaries — type-safe parsing instead of `as Lift` casts
- [ ] Rate limiting / cost caps on agent API calls
- [ ] Test suite — only 1 test exists (gif.test.ts), need coverage for calculator, progression, and tools
- [ ] Multi-user support — currently hardcoded to single `ALLOWED_USER_ID`
