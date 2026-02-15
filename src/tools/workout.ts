import * as queries from '../db/queries';
import { calculateWeight, calculateE1RM } from '../engine/calculator';
import { parseTemplate, getWeekSets } from '../engine/templates';
import { checkWeekComplete, advanceWeek } from '../engine/progression';
import type { Lift, DayOfWeek, ActualSet, PrescribedSet } from '../types';

export function getTodaysWorkout(lift: Lift) {
  const state = queries.getProgramState();
  const liftData = queries.getLift(lift);

  if (!liftData.active_template) {
    return { error: `No template assigned to ${lift}. Set one with set_template.` };
  }
  if (!liftData.training_max) {
    return { error: `No training max set for ${lift}. Set a tested 1RM first.` };
  }

  const template = parseTemplate(liftData.active_template);
  const mainSets = getWeekSets(template, state.current_week, 'main');
  const suppSets = getWeekSets(template, state.current_week, 'supplemental');

  // Resolve FSL percentage from first main work set
  const fslPercentage = mainSets.length > 0 ? mainSets[0].percentage : 0;

  const mainWork: PrescribedSet[] = mainSets.map(s => ({
    percentage: s.percentage,
    weight: calculateWeight(liftData.training_max!, s.percentage),
    reps: s.reps,
  }));

  const supplemental: PrescribedSet[] = suppSets.map(s => {
    const pct = s.type === 'FSL' ? fslPercentage : s.percentage;
    return {
      percentage: pct,
      weight: calculateWeight(liftData.training_max!, pct),
      reps: s.reps,
      sets: s.sets,
      type: s.type,
    };
  });

  return {
    lift,
    template: liftData.active_template,
    week: state.current_week,
    phase: state.current_phase,
    training_max: liftData.training_max,
    main_work: mainWork,
    supplemental: supplemental.length > 0 ? supplemental : undefined,
  };
}

export function logWorkout(
  lift: Lift,
  actualResults: ActualSet[],
  amrapReps?: number,
  amrapWeight?: number,
  notes?: string,
) {
  const state = queries.getProgramState();
  const liftData = queries.getLift(lift);

  if (!liftData.active_template) {
    return { error: `No template assigned to ${lift}.` };
  }

  if (queries.isLiftLoggedThisCycle(lift, state.current_week, state.current_phase, state.cycle_id)) {
    return { error: `${lift} is already logged for week ${state.current_week}. Use skip_lift or reschedule if needed.` };
  }

  const today = new Date().toISOString().split('T')[0];

  // Build prescribed data
  const workout = getTodaysWorkout(lift);
  if ('error' in workout) return workout;

  const prescribed = JSON.stringify({
    main: workout.main_work,
    supplemental: workout.supplemental,
  });

  // Calculate e1RM if AMRAP data provided
  let calculated1rm: number | null = null;
  let prResult: { isNew: boolean; previousBestReps: number | null } | null = null;

  if (amrapReps && amrapWeight) {
    calculated1rm = calculateE1RM(amrapWeight, amrapReps);

    // Update PR table
    prResult = queries.upsertPR(lift, amrapWeight, amrapReps, calculated1rm, today);

    // Update estimated_1rm on lift if this is a new best
    const bestE1rm = queries.getBestE1RM(lift);
    if (bestE1rm) {
      queries.updateLift(lift, { estimated_1rm: bestE1rm });
    }
  }

  // Log the workout
  queries.logWorkout({
    date: today,
    lift,
    template: liftData.active_template,
    week: state.current_week,
    phase: state.current_phase,
    cycle_id: state.cycle_id,
    prescribed,
    actual: JSON.stringify(actualResults),
    amrap_reps: amrapReps ?? null,
    amrap_weight: amrapWeight ?? null,
    calculated_1rm: calculated1rm,
    skipped: 0,
    notes: notes ?? null,
  });

  // Check if week is complete
  const { complete, remaining } = checkWeekComplete(state.current_week, state.current_phase, state.cycle_id);

  let weekAdvanceResult;
  if (complete) {
    weekAdvanceResult = advanceWeek();
  }

  const result: Record<string, unknown> = {
    logged: true,
    date: today,
    lift,
    new_pr: prResult?.isNew ?? false,
  };

  if (prResult?.isNew) {
    result.pr_details = {
      weight: amrapWeight,
      reps: amrapReps,
      estimated_1rm: calculated1rm,
      previous_best_reps: prResult.previousBestReps,
    };
  }

  result.week_complete = complete;
  if (!complete) {
    result.lifts_remaining = remaining;
  }
  if (weekAdvanceResult) {
    result.week_advanced = weekAdvanceResult;
  }

  return result;
}

export function skipLift(lift: Lift, reason?: string) {
  const state = queries.getProgramState();
  const liftData = queries.getLift(lift);

  if (queries.isLiftLoggedThisCycle(lift, state.current_week, state.current_phase, state.cycle_id)) {
    return { error: `${lift} is already logged for week ${state.current_week}.` };
  }

  const today = new Date().toISOString().split('T')[0];

  queries.logWorkout({
    date: today,
    lift,
    template: liftData.active_template ?? 'none',
    week: state.current_week,
    phase: state.current_phase,
    cycle_id: state.cycle_id,
    prescribed: '[]',
    actual: '[]',
    amrap_reps: null,
    amrap_weight: null,
    calculated_1rm: null,
    skipped: 1,
    notes: reason ?? null,
  });

  const { complete, remaining } = checkWeekComplete(state.current_week, state.current_phase, state.cycle_id);

  let weekAdvanceResult;
  if (complete) {
    weekAdvanceResult = advanceWeek();
  }

  return {
    skipped: true,
    lift,
    week: state.current_week,
    reason: reason ?? null,
    week_complete: complete,
    lifts_remaining: complete ? undefined : remaining,
    week_advanced: weekAdvanceResult,
  };
}

export function skipWeek(reason?: string) {
  const state = queries.getProgramState();
  const logged = queries.getLiftsLoggedThisWeek(state.current_week, state.current_phase, state.cycle_id);
  const allLifts: Lift[] = ['squat', 'bench', 'deadlift', 'ohp'];
  const unlogged = allLifts.filter(l => !logged.has(l));

  for (const lift of unlogged) {
    skipLift(lift, reason ?? 'week skipped');
  }

  // The last skipLift should trigger auto-advance, but ensure it happened
  const newState = queries.getProgramState();

  return {
    skipped: true,
    week_skipped: state.current_week,
    advanced_to: newState.current_week,
    new_status: newState.phase_status,
    reason: reason ?? null,
  };
}

export function rescheduleLift(lift: Lift, newDay: DayOfWeek) {
  const originalDay = queries.getDayForLift(lift);
  queries.setScheduleEntry(newDay, lift);

  return {
    rescheduled: true,
    lift,
    original_day: originalDay,
    new_day: newDay,
  };
}
