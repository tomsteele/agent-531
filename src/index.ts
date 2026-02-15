import { initSchema } from './db/schema';
import { startDiscord } from './discord';
import { startScheduler } from './scheduler';

console.log('[init] Starting 5/3/1 Training Agent...');

// Initialize database
initSchema();
console.log('[init] Database initialized');

// Start Discord bot
await startDiscord();
console.log('[init] Discord bot connected');

// Start scheduler
startScheduler();
console.log('[init] Scheduler started');

console.log('[init] Agent is running.');
