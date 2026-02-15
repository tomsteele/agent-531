import cron from 'node-cron';
import { runAgent } from './agent';
import { sendDM, conversationHistory } from './discord';

const MORNING_HOUR = parseInt(process.env.MORNING_HOUR ?? '5', 10);

export function startScheduler(): void {
  const cronExpr = `0 ${MORNING_HOUR} * * *`;
  console.log(`[scheduler] Morning message scheduled: "${cronExpr}"`);

  cron.schedule(cronExpr, async () => {
    const today = new Date().toISOString().split('T')[0];
    console.log(`[scheduler] Firing morning message for ${today}`);

    // Clear conversation history.
    conversationHistory.length = 0;

    try {
      const response = await runAgent(
        "It's a new day. Check the program state and let me know if there's a workout today or anything pending.",
        conversationHistory,
      );

      if (response.text.trim()) {
        await sendDM(response);
      }
    } catch (err) {
      console.error('[scheduler] Error running morning agent:', err);
    }
  });
}
