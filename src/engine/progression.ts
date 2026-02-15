import * as queries from '../db/queries';
import type { Lift, Phase } from '../types';

const ALL_LIFTS: Lift[] = ['squat', 'bench', 'deadlift', 'ohp'];

export function checkWeekComplete(week: number, phase: Phase, cycleId: number): { complete: boolean; remaining: Lift[] } {
  const logged = queries.getLiftsLoggedThisWeek(week, phase, cycleId);
  const remaining = ALL_LIFTS.filter(l => !logged.has(l));
  return { complete: remaining.length === 0, remaining };
}

export function advanceWeek(): { previousWeek: number; newWeek: number; status: string; message: string } {
  const state = queries.getProgramState();
  const previousWeek = state.current_week;

  if (previousWeek < 3) {
    const newWeek = previousWeek + 1;
    queries.updateProgramState({ current_week: newWeek });
    return {
      previousWeek,
      newWeek,
      status: 'active',
      message: `Moving to week ${newWeek}.`,
    };
  }

  // Week 3 complete → pending TM bump.
  queries.updateProgramState({ current_week: 1, phase_status: 'pending_tm_bump' });
  return {
    previousWeek: 3,
    newWeek: 1,
    status: 'pending_tm_bump',
    message: 'Cycle complete. Ready to discuss TM bumps.',
  };
}

export function resolveTmBump(): { nextStatus: string; message: string } {
  const state = queries.getProgramState();

  if (state.current_phase === 'leader') {
    const newCount = state.leader_cycles_completed + 1;
    queries.updateProgramState({ leader_cycles_completed: newCount });

    if (newCount >= 2) {
      queries.updateProgramState({ phase_status: 'pending_deload_or_test' });
      return {
        nextStatus: 'pending_deload_or_test',
        message: `That's ${newCount} leader cycles done. Time for a deload or TM test before the anchor.`,
      };
    }

    // More leader cycles to go — increment cycle_id for the new cycle.
    queries.updateProgramState({ current_week: 1, phase_status: 'active', cycle_id: state.cycle_id + 1 });
    return {
      nextStatus: 'active',
      message: `Leader cycle ${newCount} complete. Starting next leader cycle at week 1.`,
    };
  }

  // Anchor phase TM bump resolved.
  queries.updateProgramState({ phase_status: 'pending_deload_or_test' });
  return {
    nextStatus: 'pending_deload_or_test',
    message: 'Anchor done. Time for a deload or TM test before starting new leaders.',
  };
}

export function transitionPhase(newPhase: Phase): void {
  const state = queries.getProgramState();
  const updates: Record<string, unknown> = {
    current_phase: newPhase,
    current_week: 1,
    phase_status: 'active',
    cycle_id: state.cycle_id + 1,
  };
  if (newPhase === 'leader') {
    updates.leader_cycles_completed = 0;
  }
  queries.updateProgramState(updates);
}
