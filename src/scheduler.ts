import cron from 'node-cron';
import { runAgent } from './agent';
import { sendDM, conversationHistory } from './discord';
import { getProgramState } from './tools/state';
import { getTodaysWorkout } from './tools/workout';
import { getAvailableTemplates } from './tools/query';
import type { DayOfWeek, Lift } from './types';

const MORNING_HOUR = parseInt(process.env.MORNING_HOUR ?? '5', 10);
const DAY_NAMES: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function startScheduler(): void {
  const cronExpr = `0 ${MORNING_HOUR} * * *`;
  console.log(`[scheduler] Morning message scheduled: "${cronExpr}"`);

  cron.schedule(cronExpr, async () => {
    const today = new Date().toISOString().split('T')[0];
    console.log(`[scheduler] Firing morning message for ${today}`);

    // Clear conversation history.
    conversationHistory.length = 0;

    try {
      const state = getProgramState();
      const todayName = DAY_NAMES[new Date().getDay()];

      if (state.phase_status === 'active') {
        const todaysLift = state.schedule[todayName] as Lift | undefined;
        if (!todaysLift) {
          console.log(`[scheduler] Rest day (${todayName}), no message`);
          return;
        }

        const workout = getTodaysWorkout(todaysLift);
        const prompt = [
          `Morning message. Here's today's pre-fetched data — format it for the user. No need to call get_program_state or get_todays_workout.`,
          ``,
          `Program state:`,
          JSON.stringify(state, null, 2),
          ``,
          `Today's workout (${todaysLift}):`,
          JSON.stringify(workout, null, 2),
        ].join('\n');

        const response = await runAgent(prompt, conversationHistory);
        if (response.text.trim()) {
          await sendDM(response);
        }
      } else {
        // pending_tm_bump or pending_deload_or_test — agent formats the appropriate prompt
        const parts = [
          `Morning message. Here's the pre-fetched program state — format the appropriate prompt for the user. No need to call get_program_state.`,
          ``,
          `Program state:`,
          JSON.stringify(state, null, 2),
        ];

        if (state.phase_status === 'pending_deload_or_test') {
          const templates = getAvailableTemplates();
          parts.push(``, `Available templates:`, JSON.stringify(templates, null, 2));
        }

        const response = await runAgent(parts.join('\n'), conversationHistory);
        if (response.text.trim()) {
          await sendDM(response);
        }
      }
    } catch (err) {
      console.error('[scheduler] Error running morning agent:', err);
    }
  });
}
