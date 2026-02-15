import * as queries from '../db/queries';
import { transitionPhase, resolveTmBump, advanceWeek as advanceWeekProgression } from '../engine/progression';
import { getAllTemplates, parseTemplate } from '../engine/templates';
import type { Lift, Phase } from '../types';

export function getProgramState() {
  const state = queries.getProgramState();
  const lifts = queries.getAllLifts();
  const schedule = queries.getSchedule();

  const liftsMap: Record<string, unknown> = {};
  for (const lift of lifts) {
    let templateDisplayName: string | null = null;
    if (lift.active_template) {
      try {
        templateDisplayName = parseTemplate(lift.active_template).displayName;
      } catch { /* template file missing */ }
    }

    liftsMap[lift.name] = {
      tested_1rm: lift.tested_1rm,
      estimated_1rm: lift.estimated_1rm,
      training_max: lift.training_max,
      tm_increment: lift.tm_increment,
      active_template: lift.active_template,
      active_template_display_name: templateDisplayName,
    };
  }

  const scheduleMap: Record<string, string> = {};
  for (const entry of schedule) {
    scheduleMap[entry.day_of_week] = entry.lift;
  }

  return {
    current_week: state.current_week,
    current_phase: state.current_phase,
    leader_cycles_completed: state.leader_cycles_completed,
    phase_status: state.phase_status,
    cycle_id: state.cycle_id,
    lifts: liftsMap,
    schedule: scheduleMap,
  };
}

export function advanceWeek() {
  return advanceWeekProgression();
}

export function bumpTm(lift: Lift, amount: number) {
  const liftData = queries.getLift(lift);
  const previousTm = liftData.training_max ?? 0;
  const newTm = previousTm + amount;

  queries.updateLift(lift, { training_max: newTm });

  return {
    lift,
    previous_tm: previousTm,
    new_tm: newTm,
    amount,
  };
}

export function skipTmBump(lift: Lift) {
  const liftData = queries.getLift(lift);
  return {
    lift,
    training_max: liftData.training_max,
    held: true,
  };
}

export function finalizeTmBumps() {
  return resolveTmBump();
}

export function setPhase(phase: Phase) {
  const state = queries.getProgramState();
  const previousPhase = state.current_phase;

  transitionPhase(phase);

  return {
    previous_phase: previousPhase,
    new_phase: phase,
    leader_cycles_completed_reset: phase === 'leader',
    current_week: 1,
  };
}

export function setTemplate(lift: Lift, templateName: string) {
  const available = getAllTemplates();
  const matched = available.find(t => t.name === templateName);
  if (!matched) {
    const names = available.map(t => `${t.displayName} (${t.name})`).join(', ');
    return { error: `Unknown template "${templateName}". Available: ${names}` };
  }

  const liftData = queries.getLift(lift);
  const previousTemplate = liftData.active_template;

  queries.updateLift(lift, { active_template: templateName });

  return {
    lift,
    previous_template: previousTemplate,
    new_template: templateName,
    new_template_display_name: matched.displayName,
  };
}

export function setWeek(week: number) {
  const state = queries.getProgramState();
  const previousWeek = state.current_week;

  queries.updateProgramState({ current_week: week });

  return {
    previous_week: previousWeek,
    new_week: week,
  };
}

export function setLeaderCyclesCompleted(count: number) {
  const state = queries.getProgramState();
  const previousCount = state.leader_cycles_completed;

  queries.updateProgramState({ leader_cycles_completed: count });

  return {
    previous_count: previousCount,
    new_count: count,
  };
}
