import { initSchema } from './db/schema';
import { getProgramState, getSchedule, getAllLifts, getPRs, getWorkoutHistory } from './db/queries';

initSchema();

const state = getProgramState();
const lifts = getAllLifts();
const schedule = getSchedule();
const prs = getPRs();
const recentWorkouts = getWorkoutHistory(undefined, 10);

console.log('=== Program State ===');
console.log(`  Week:     ${state.current_week}`);
console.log(`  Phase:    ${state.current_phase}`);
console.log(`  Status:   ${state.phase_status}`);
console.log(`  Cycle ID: ${state.cycle_id}`);
console.log(`  Leader cycles completed: ${state.leader_cycles_completed}`);

console.log('\n=== Schedule ===');
const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const scheduleMap = new Map(schedule.map(s => [s.day_of_week, s.lift]));
for (const day of dayOrder) {
  const lift = scheduleMap.get(day);
  if (lift) console.log(`  ${day.padEnd(10)} ${lift}`);
}
if (schedule.length === 0) console.log('  (no schedule set)');

console.log('\n=== Lifts ===');
for (const lift of lifts) {
  console.log(`  ${lift.name.toUpperCase()}`);
  console.log(`    Tested 1RM:   ${lift.tested_1rm ?? '—'}`);
  console.log(`    Estimated 1RM:${lift.estimated_1rm ? ` ${lift.estimated_1rm}` : ' —'}`);
  console.log(`    Training Max: ${lift.training_max ?? '—'}`);
  console.log(`    TM Increment: ${lift.tm_increment}`);
  console.log(`    Template:     ${lift.active_template ?? '—'}`);
}

if (prs.length > 0) {
  console.log('\n=== PRs ===');
  for (const pr of prs) {
    console.log(`  ${pr.lift.padEnd(9)} ${pr.weight} x ${pr.best_reps} (e1RM ${pr.estimated_1rm}) — ${pr.date}`);
  }
}

if (recentWorkouts.length > 0) {
  console.log('\n=== Recent Workouts ===');
  for (const w of recentWorkouts) {
    const skipped = w.skipped ? ' [SKIPPED]' : '';
    const amrap = w.amrap_reps ? ` | AMRAP: ${w.amrap_weight} x ${w.amrap_reps}` : '';
    console.log(`  ${w.date}  ${w.lift.padEnd(9)} wk${w.week} ${w.phase} (${w.template})${amrap}${skipped}`);
  }
}
