import * as queries from "../db/queries";
import { getAllTemplates } from "../engine/templates";
import type { ActualSet, Lift } from "../types";

export function getPRs(lift?: Lift) {
	const prs = queries.getPRs(lift);
	return { prs };
}

export function getTrainingMaxes() {
	const lifts = queries.getAllLifts();
	const result: Record<string, unknown> = {};

	for (const lift of lifts) {
		const tmPct =
			lift.tested_1rm && lift.training_max
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
	const workouts = queries.getWorkoutHistory(lift, lastN).map((w) => ({
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

export function getVolume(lift?: Lift, period?: string) {
	const since = periodToDate(period);
	const logs = queries.getWorkoutLogs(lift, since ?? undefined);

	const byLift: Record<
		string,
		{ total_tonnage: number; total_sets: number; total_reps: number; sessions: number }
	> = {};

	for (const log of logs) {
		if (log.skipped) continue;

		let sets: ActualSet[];
		try {
			sets = JSON.parse(log.actual) as ActualSet[];
		} catch {
			continue;
		}

		if (!byLift[log.lift]) {
			byLift[log.lift] = { total_tonnage: 0, total_sets: 0, total_reps: 0, sessions: 0 };
		}

		const entry = byLift[log.lift];
		entry.sessions++;
		for (const set of sets) {
			entry.total_tonnage += set.weight * set.reps;
			entry.total_sets++;
			entry.total_reps += set.reps;
		}
	}

	return {
		period: period ?? "all_time",
		since: since ?? "beginning",
		volume: byLift,
	};
}

export function getCompletionStats(lift?: Lift, period?: string) {
	const since = periodToDate(period);
	const counts = queries.getCompletionCounts(lift, since ?? undefined);

	let totalCompleted = 0;
	let totalSkipped = 0;

	const byLift: Record<string, { completed: number; skipped: number; completion_rate: number }> =
		{};

	for (const row of counts) {
		const total = row.completed + row.skipped;
		byLift[row.lift] = {
			completed: row.completed,
			skipped: row.skipped,
			completion_rate: total > 0 ? Math.round((row.completed / total) * 100) : 0,
		};
		totalCompleted += row.completed;
		totalSkipped += row.skipped;
	}

	const overallTotal = totalCompleted + totalSkipped;

	return {
		period: period ?? "all_time",
		since: since ?? "beginning",
		overall: {
			completed: totalCompleted,
			skipped: totalSkipped,
			total: overallTotal,
			completion_rate: overallTotal > 0 ? Math.round((totalCompleted / overallTotal) * 100) : 0,
		},
		by_lift: byLift,
	};
}

export function getE1rmHistory(lift?: Lift, period?: string) {
	const since = periodToDate(period);
	const entries = queries.getE1rmEntries(lift, since ?? undefined);

	const byLift: Record<
		string,
		{ date: string; e1rm: number; weight: number; reps: number; cycle_id: number }[]
	> = {};

	for (const entry of entries) {
		if (!byLift[entry.lift]) {
			byLift[entry.lift] = [];
		}
		byLift[entry.lift].push({
			date: entry.date,
			e1rm: entry.calculated_1rm,
			weight: entry.amrap_weight,
			reps: entry.amrap_reps,
			cycle_id: entry.cycle_id,
		});
	}

	return {
		period: period ?? "all_time",
		since: since ?? "beginning",
		history: byLift,
	};
}

export function getTmHistory(lift?: Lift) {
	// Derive TM at each session from prescribed data.
	const logs = queries.getWorkoutLogs(lift);
	const byLift: Record<string, { date: string; training_max: number; cycle_id: number }[]> = {};

	for (const log of logs) {
		if (log.skipped) continue;

		let prescribed: { main?: { percentage?: number; weight?: number }[] };
		try {
			prescribed = JSON.parse(log.prescribed);
		} catch {
			continue;
		}

		const mainSets = prescribed.main;
		if (!mainSets || mainSets.length === 0) continue;

		// Use first set with a percentage to back-calculate TM.
		const set = mainSets.find((s) => s.percentage && s.percentage > 0 && s.weight);
		if (!set || !set.percentage || !set.weight) continue;

		const tm = Math.round((set.weight / set.percentage) * 100);

		if (!byLift[log.lift]) {
			byLift[log.lift] = [];
		}

		const history = byLift[log.lift];
		// Only record when TM changes (or first entry).
		const last = history[history.length - 1];
		if (!last || last.training_max !== tm) {
			history.push({
				date: log.date,
				training_max: tm,
				cycle_id: log.cycle_id,
			});
		}
	}

	return { history: byLift };
}

function periodToDate(period?: string): string | null {
	if (!period) return null;

	const now = new Date();
	switch (period) {
		case "week": {
			const d = new Date(now);
			d.setDate(d.getDate() - 7);
			return d.toISOString().split("T")[0];
		}
		case "month": {
			const d = new Date(now);
			d.setMonth(d.getMonth() - 1);
			return d.toISOString().split("T")[0];
		}
		case "3months": {
			const d = new Date(now);
			d.setMonth(d.getMonth() - 3);
			return d.toISOString().split("T")[0];
		}
		case "6months": {
			const d = new Date(now);
			d.setMonth(d.getMonth() - 6);
			return d.toISOString().split("T")[0];
		}
		case "year": {
			const d = new Date(now);
			d.setFullYear(d.getFullYear() - 1);
			return d.toISOString().split("T")[0];
		}
		default:
			return null;
	}
}

export function getAvailableTemplates(type?: string) {
	let templates = getAllTemplates();

	if (type) {
		templates = templates.filter((t) => t.type === type || t.type === "leader/anchor");
	}

	return {
		templates: templates.map((t) => ({
			name: t.name,
			display_name: t.displayName,
			type: t.type,
			tm_percentage: t.tmPercentage,
		})),
	};
}
