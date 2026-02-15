import * as queries from '../db/queries';
import { calculateTM } from '../engine/calculator';
import { parseTemplate } from '../engine/templates';
import type { Lift, DayOfWeek } from '../types';

export function setTested1rm(lift: Lift, weight: number) {
  const liftData = queries.getLift(lift);

  // Get TM percentage from active template, default 90
  let tmPercentage = 90;
  if (liftData.active_template) {
    try {
      const template = parseTemplate(liftData.active_template);
      tmPercentage = template.tmPercentage;
    } catch {
      // Use default if template can't be parsed
    }
  }

  const newTm = calculateTM(weight, tmPercentage);
  queries.updateLift(lift, { tested_1rm: weight, training_max: newTm });

  return {
    lift,
    tested_1rm: weight,
    tm_percentage: tmPercentage,
    new_training_max: newTm,
  };
}

export function setSchedule(day: DayOfWeek, lift: string) {
  if (lift === 'none') {
    queries.clearScheduleDay(day);
    return {
      day,
      lift: 'none',
      cleared: true,
    };
  }

  const { previousLiftOnDay, previousDayForLift } = queries.setScheduleEntry(day, lift as Lift);

  return {
    day,
    lift,
    previous_lift_on_day: previousLiftOnDay,
    previous_day_for_lift: previousDayForLift,
    conflict: previousLiftOnDay !== null && previousLiftOnDay !== lift,
  };
}

export function resetProgram(keepTms: boolean = true) {
  queries.updateProgramState({
    current_week: 1,
    current_phase: 'leader',
    leader_cycles_completed: 0,
    phase_status: 'active',
  });

  if (!keepTms) {
    const lifts = queries.getAllLifts();
    for (const lift of lifts) {
      if (lift.tested_1rm) {
        let tmPercentage = 90;
        if (lift.active_template) {
          try {
            const template = parseTemplate(lift.active_template);
            tmPercentage = template.tmPercentage;
          } catch {
            // Use default
          }
        }
        const newTm = calculateTM(lift.tested_1rm, tmPercentage);
        queries.updateLift(lift.name, { training_max: newTm });
      }
    }
  }

  return {
    reset: true,
    current_week: 1,
    current_phase: 'leader',
    leader_cycles_completed: 0,
    tms_kept: keepTms,
  };
}
