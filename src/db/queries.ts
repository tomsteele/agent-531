import type {
	DayOfWeek,
	Lift,
	LiftRow,
	Phase,
	PR,
	ProgramState,
	Schedule,
	WorkoutLog,
} from "../types";
import { getDb } from "./connection";

type SQLValue = string | number | boolean | null | bigint | Uint8Array;

export function getProgramState(): ProgramState {
	return getDb().query("SELECT * FROM program_state WHERE id = 1").get() as ProgramState;
}

export function updateProgramState(updates: Partial<Omit<ProgramState, "id">>): void {
	const fields: string[] = [];
	const values: SQLValue[] = [];
	for (const [key, value] of Object.entries(updates)) {
		fields.push(`${key} = ?`);
		values.push(value as SQLValue);
	}
	getDb()
		.query(`UPDATE program_state SET ${fields.join(", ")} WHERE id = 1`)
		.run(...values);
}

export function getSchedule(): Schedule[] {
	return getDb()
		.query("SELECT * FROM schedule ORDER BY day_of_week, sort_order")
		.all() as Schedule[];
}

export function getLiftsForDay(day: DayOfWeek): Lift[] {
	const rows = getDb()
		.query("SELECT lift FROM schedule WHERE day_of_week = ? ORDER BY sort_order")
		.all(day) as { lift: Lift }[];
	return rows.map((r) => r.lift);
}

export function getDayForLift(lift: Lift): DayOfWeek | null {
	const row = getDb().query("SELECT day_of_week FROM schedule WHERE lift = ?").get(lift) as {
		day_of_week: DayOfWeek;
	} | null;
	return row ? row.day_of_week : null;
}

export function setScheduleEntry(
	day: DayOfWeek,
	lift: Lift,
): { previousDayForLift: DayOfWeek | null; otherLiftsOnDay: Lift[] } {
	const db = getDb();
	const previousDayForLift = getDayForLift(lift);

	// Remove existing entry for this lift (each lift can only be on one day).
	db.query("DELETE FROM schedule WHERE lift = ?").run(lift);

	// Determine sort_order: place after any existing lifts on this day.
	const existing = getLiftsForDay(day);
	const sortOrder = existing.length;

	db.query("INSERT INTO schedule (day_of_week, lift, sort_order) VALUES (?, ?, ?)").run(
		day,
		lift,
		sortOrder,
	);

	return { previousDayForLift, otherLiftsOnDay: existing };
}

export function removeScheduleEntry(lift: Lift): DayOfWeek | null {
	const previousDay = getDayForLift(lift);
	getDb().query("DELETE FROM schedule WHERE lift = ?").run(lift);
	return previousDay;
}

export function clearScheduleDay(day: DayOfWeek): void {
	getDb().query("DELETE FROM schedule WHERE day_of_week = ?").run(day);
}

export function getLift(name: Lift): LiftRow {
	return getDb().query("SELECT * FROM lifts WHERE name = ?").get(name) as LiftRow;
}

export function getAllLifts(): LiftRow[] {
	return getDb().query("SELECT * FROM lifts ORDER BY id").all() as LiftRow[];
}

export function updateLift(name: Lift, updates: Partial<Omit<LiftRow, "id" | "name">>): void {
	const fields: string[] = [];
	const values: SQLValue[] = [];
	for (const [key, value] of Object.entries(updates)) {
		fields.push(`${key} = ?`);
		values.push(value as SQLValue);
	}
	values.push(name);
	getDb()
		.query(`UPDATE lifts SET ${fields.join(", ")} WHERE name = ?`)
		.run(...values);
}

export function logWorkout(entry: Omit<WorkoutLog, "id">): number {
	const result = getDb()
		.query(
			`
    INSERT INTO workout_log (date, lift, template, week, phase, cycle_id, prescribed, actual, amrap_reps, amrap_weight, calculated_1rm, skipped, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
		)
		.run(
			entry.date,
			entry.lift,
			entry.template,
			entry.week,
			entry.phase,
			entry.cycle_id,
			entry.prescribed,
			entry.actual,
			entry.amrap_reps,
			entry.amrap_weight,
			entry.calculated_1rm,
			entry.skipped,
			entry.notes,
		);
	return Number(result.lastInsertRowid);
}

export function getWorkoutHistory(lift?: Lift, lastN: number = 10): WorkoutLog[] {
	if (lift) {
		return getDb()
			.query("SELECT * FROM workout_log WHERE lift = ? ORDER BY date DESC, id DESC LIMIT ?")
			.all(lift, lastN) as WorkoutLog[];
	}
	return getDb()
		.query("SELECT * FROM workout_log ORDER BY date DESC, id DESC LIMIT ?")
		.all(lastN) as WorkoutLog[];
}

export function getLiftsLoggedThisWeek(week: number, phase: Phase, cycleId: number): Set<Lift> {
	const rows = getDb()
		.query(
			`
    SELECT DISTINCT lift FROM workout_log
    WHERE week = ? AND phase = ? AND cycle_id = ?
  `,
		)
		.all(week, phase, cycleId) as { lift: Lift }[];
	return new Set(rows.map((r) => r.lift));
}

export function isLiftLoggedThisCycle(
	lift: Lift,
	week: number,
	phase: Phase,
	cycleId: number,
): boolean {
	const row = getDb()
		.query(
			`
    SELECT 1 FROM workout_log
    WHERE lift = ? AND week = ? AND phase = ? AND cycle_id = ?
    LIMIT 1
  `,
		)
		.get(lift, week, phase, cycleId);
	return row !== null;
}

export function getPRs(lift?: Lift): PR[] {
	if (lift) {
		return getDb()
			.query("SELECT * FROM prs WHERE lift = ? ORDER BY estimated_1rm DESC")
			.all(lift) as PR[];
	}
	return getDb().query("SELECT * FROM prs ORDER BY lift, estimated_1rm DESC").all() as PR[];
}

export function upsertPR(
	lift: Lift,
	weight: number,
	reps: number,
	estimated1rm: number,
	date: string,
): { type: "new_weight" | "rep_record" | "none"; previousBestReps: number | null } {
	const db = getDb();
	const existing = db
		.query("SELECT * FROM prs WHERE lift = ? AND weight = ?")
		.get(lift, weight) as PR | null;

	if (existing) {
		if (reps > existing.best_reps) {
			db.query(
				"UPDATE prs SET best_reps = ?, estimated_1rm = ?, date = ? WHERE lift = ? AND weight = ?",
			).run(reps, estimated1rm, date, lift, weight);
			return { type: "rep_record", previousBestReps: existing.best_reps };
		}
		return { type: "none", previousBestReps: existing.best_reps };
	}

	db.query(
		"INSERT INTO prs (lift, weight, best_reps, estimated_1rm, date) VALUES (?, ?, ?, ?, ?)",
	).run(lift, weight, reps, estimated1rm, date);
	return { type: "new_weight", previousBestReps: null };
}

export function getBestE1RM(lift: Lift): number | null {
	const row = getDb()
		.query("SELECT MAX(estimated_1rm) as best FROM prs WHERE lift = ?")
		.get(lift) as { best: number | null } | null;
	return row?.best ?? null;
}

export function getWorkoutLogs(lift?: Lift, since?: string): WorkoutLog[] {
	const conditions: string[] = [];
	const params: SQLValue[] = [];

	if (lift) {
		conditions.push("lift = ?");
		params.push(lift);
	}
	if (since) {
		conditions.push("date >= ?");
		params.push(since);
	}

	const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
	return getDb()
		.query(`SELECT * FROM workout_log ${where} ORDER BY date ASC, id ASC`)
		.all(...params) as WorkoutLog[];
}

export function getCompletionCounts(
	lift?: Lift,
	since?: string,
): { lift: Lift; completed: number; skipped: number }[] {
	const conditions: string[] = [];
	const params: SQLValue[] = [];

	if (lift) {
		conditions.push("lift = ?");
		params.push(lift);
	}
	if (since) {
		conditions.push("date >= ?");
		params.push(since);
	}

	const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
	return getDb()
		.query(
			`SELECT lift,
				SUM(CASE WHEN skipped = 0 THEN 1 ELSE 0 END) as completed,
				SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) as skipped
			FROM workout_log ${where}
			GROUP BY lift
			ORDER BY lift`,
		)
		.all(...params) as { lift: Lift; completed: number; skipped: number }[];
}

export function getE1rmEntries(
	lift?: Lift,
	since?: string,
): {
	date: string;
	lift: Lift;
	calculated_1rm: number;
	amrap_weight: number;
	amrap_reps: number;
	cycle_id: number;
}[] {
	const conditions: string[] = ["calculated_1rm IS NOT NULL"];
	const params: SQLValue[] = [];

	if (lift) {
		conditions.push("lift = ?");
		params.push(lift);
	}
	if (since) {
		conditions.push("date >= ?");
		params.push(since);
	}

	const where = `WHERE ${conditions.join(" AND ")}`;
	return getDb()
		.query(
			`SELECT date, lift, calculated_1rm, amrap_weight, amrap_reps, cycle_id
			FROM workout_log ${where}
			ORDER BY date ASC, id ASC`,
		)
		.all(...params) as {
		date: string;
		lift: Lift;
		calculated_1rm: number;
		amrap_weight: number;
		amrap_reps: number;
		cycle_id: number;
	}[];
}
