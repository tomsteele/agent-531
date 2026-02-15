import { getTodaysWorkout, logWorkout, skipLift, skipWeek, rescheduleLift } from './workout';
import { getProgramState, advanceWeek, bumpTm, skipTmBump, finalizeTmBumps, setPhase, setTemplate, setWeek, setLeaderCyclesCompleted } from './state';
import { getPRs, getTrainingMaxes, getWorkoutHistory, getAvailableTemplates } from './query';
import { setTested1rm, setSchedule, resetProgram } from './setup';
import type { Lift, Phase, DayOfWeek, ActualSet } from '../types';

export function handleToolCall(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    // Workout
    case 'get_todays_workout':
      return getTodaysWorkout(input.lift as Lift);
    case 'log_workout':
      return logWorkout(
        input.lift as Lift,
        input.actual_results as ActualSet[],
        input.amrap_reps as number | undefined,
        input.amrap_weight as number | undefined,
        input.notes as string | undefined,
      );
    case 'skip_lift':
      return skipLift(input.lift as Lift, input.reason as string | undefined);
    case 'skip_week':
      return skipWeek(input.reason as string | undefined);
    case 'reschedule_lift':
      return rescheduleLift(input.lift as Lift, input.new_day as DayOfWeek);

    // State
    case 'get_program_state':
      return getProgramState();
    case 'advance_week':
      return advanceWeek();
    case 'bump_tm': {
      const result = bumpTm(input.lift as Lift, input.amount as number);
      // Check if all bumps are done — caller (agent) manages this conversationally
      return result;
    }
    case 'skip_tm_bump':
      return skipTmBump(input.lift as Lift);
    case 'finalize_tm_bumps':
      return finalizeTmBumps();
    case 'set_phase':
      return setPhase(input.phase as Phase);
    case 'set_template':
      return setTemplate(input.lift as Lift, input.template_name as string);
    case 'set_week':
      return setWeek(input.week as number);
    case 'set_leader_cycles_completed':
      return setLeaderCyclesCompleted(input.count as number);

    // Query
    case 'get_prs':
      return getPRs(input.lift as Lift | undefined);
    case 'get_training_maxes':
      return getTrainingMaxes();
    case 'get_workout_history':
      return getWorkoutHistory(input.lift as Lift | undefined, input.last_n as number | undefined);
    case 'get_available_templates':
      return getAvailableTemplates(input.type as string | undefined);

    // Setup
    case 'set_tested_1rm':
      return setTested1rm(input.lift as Lift, input.weight as number);
    case 'set_schedule':
      return setSchedule(input.day as DayOfWeek, input.lift as string);
    case 'reset_program':
      return resetProgram(input.keep_tms as boolean | undefined);

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
