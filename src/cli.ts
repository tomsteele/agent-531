import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

// Copy prod database to a temp file before anything imports connection.ts
const prodDb = join(import.meta.dir, "../data/training.db");
const tempDir = mkdtempSync(join(tmpdir(), "531-cli-"));
const tempDb = join(tempDir, "training.db");

copyFileSync(prodDb, tempDb);
// Also copy WAL/shm files if they exist
try {
	copyFileSync(`${prodDb}-wal`, `${tempDb}-wal`);
} catch {}
try {
	copyFileSync(`${prodDb}-shm`, `${tempDb}-shm`);
} catch {}

process.env.DB_PATH = tempDb;
console.log(`Using temp database: ${tempDb}`);

// Now import agent (which transitively imports db/connection using our env var)
const { runAgent } = await import("./agent");
const { initSchema } = await import("./db/schema");

initSchema();

const rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});

function prompt() {
	rl.question("\nyou> ", async (input) => {
		const trimmed = input.trim();
		if (!trimmed || trimmed === "/quit" || trimmed === "/exit") {
			console.log("Bye.");
			rl.close();
			process.exit(0);
		}

		try {
			const result = await runAgent(trimmed);
			console.log(`\nagent> ${result.text}`);
		} catch (err) {
			console.error("Error:", err);
		}

		prompt();
	});
}

console.log("5/3/1 CLI Chat (temp copy of prod db — changes won't persist)");
console.log("Type /quit to exit.\n");
prompt();
