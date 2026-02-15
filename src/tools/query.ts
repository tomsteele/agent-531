import * as queries from '../db/queries';
import { getAllTemplates } from '../engine/templates';
import type { Lift } from '../types';

export function getPRs(lift?: Lift) {
  const prs = queries.getPRs(lift);
  return { prs };
}

export function getTrainingMaxes() {
  const lifts = queries.getAllLifts();
  const result: Record<string, unknown> = {};

  for (const lift of lifts) {
    const tmPct = lift.tested_1rm && lift.training_max
      ? Math.round((lift.training_max / lift.tested_1rm) * 100)
      : null;

    result[lift.name] = {
      training_max: lift.training_max,
      tested_1rm: lift.tested_1rm,
      estimated_1rm: lift.estimated_1rm,
      tm_percentage: tmPct,
    };
  }

  return result;
}

export function getWorkoutHistory(lift?: Lift, lastN: number = 10) {
  const workouts = queries.getWorkoutHistory(lift, lastN).map(w => ({
    date: w.date,
    lift: w.lift,
    template: w.template,
    week: w.week,
    phase: w.phase,
    prescribed: JSON.parse(w.prescribed),
    actual: JSON.parse(w.actual),
    amrap_reps: w.amrap_reps,
    amrap_weight: w.amrap_weight,
    calculated_1rm: w.calculated_1rm,
    skipped: w.skipped === 1,
    notes: w.notes,
  }));

  return { workouts };
}

export function getAvailableTemplates(type?: string) {
  let templates = getAllTemplates();

  if (type) {
    templates = templates.filter(t =>
      t.type === type || t.type === 'leader/anchor'
    );
  }

  return {
    templates: templates.map(t => ({
      name: t.name,
      display_name: t.displayName,
      type: t.type,
      tm_percentage: t.tmPercentage,
    })),
  };
}
