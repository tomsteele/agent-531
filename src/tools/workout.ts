import * as queries from "../db/queries";
import { calculateE1RM, calculateWeight } from "../engine/calculator";
import { advanceWeek, checkWeekComplete } from "../engine/progression";
import { getWeekSets, parseTemplate } from "../engine/templates";
import type { ActualSet, DayOfWeek, Lift, PrescribedSet } from "../types";

export function getTodaysWorkout(lift: Lift) {
	const state = queries.getProgramState();
	const liftData = queries.getLift(lift);

	if (!liftData.active_template) {
		return {
			error: `No template assigned to ${lift}. Set one with set_template.`,
		};
	}
	if (!liftData.training_max) {
		return {
			error: `No training max set for ${lift}. Set a tested 1RM first.`,
		};
	}

	const trainingMax = liftData.training_max;

	const template = parseTemplate(liftData.active_template);
	const mainSets = getWeekSets(template, state.current_week, "main");
	const suppSets = getWeekSets(template, state.current_week, "supplemental");

	// Resolve FSL percentage from first main work set
	const fslPercentage = mainSets.length > 0 ? mainSets[0].percentage : 0;

	const mainWork: PrescribedSet[] = mainSets.map((s) => ({
		percentage: s.percentage,
		weight: calculateWeight(trainingMax, s.percentage),
		reps: s.reps,
	}));

	const supplemental: PrescribedSet[] = suppSets.map((s) => {
		const pct = s.type === "FSL" ? fslPercentage : s.percentage;
		return {
			percentage: pct,
			weight: calculateWeight(trainingMax, pct),
			reps: s.reps,
			sets: s.sets,
			type: s.type,
		};
	});

	return {
		lift,
		template: liftData.active_template,
		week: state.current_week,
		phase: state.current_phase,
		training_max: liftData.training_max,
		main_work: mainWork,
		supplemental: supplemental.length > 0 ? supplemental : undefined,
	};
}

export function logWorkout(
	lift: Lift,
	actualResults: ActualSet[],
	amrapReps?: number,
	amrapWeight?: number,
	notes?: string,
) {
	const state = queries.getProgramState();
	const liftData = queries.getLift(lift);

	if (!liftData.active_template) {
		return { error: `No template assigned to ${lift}.` };
	}

	if (
		queries.isLiftLoggedThisCycle(lift, state.current_week, state.current_phase, state.cycle_id)
	) {
		return {
			error: `${lift} is already logged for week ${state.current_week}. Use skip_lift or reschedule if needed.`,
		};
	}

	const today = new Date().toISOString().split("T")[0];

	// Build prescribed data
	const workout = getTodaysWorkout(lift);
	if ("error" in workout) return workout;

	const prescribed = JSON.stringify({
		main: workout.main_work,
		supplemental: workout.supplemental,
	});

	// Calculate e1RM if AMRAP data provided
	let calculated1rm: number | null = null;
	let prResult: {
		type: "new_weight" | "rep_record" | "none";
		previousBestReps: number | null;
	} | null = null;

	if (amrapReps && amrapWeight) {
		calculated1rm = calculateE1RM(amrapWeight, amrapReps);

		// Update PR table
		prResult = queries.upsertPR(lift, amrapWeight, amrapReps, calculated1rm, today);

		// Update estimated_1rm on lift if this is a new best
		const bestE1rm = queries.getBestE1RM(lift);
		if (bestE1rm) {
			queries.updateLift(lift, { estimated_1rm: bestE1rm });
		}
	}

	// Log the workout
	queries.logWorkout({
		date: today,
		lift,
		template: liftData.active_template,
		week: state.current_week,
		phase: state.current_phase,
		cycle_id: state.cycle_id,
		prescribed,
		actual: JSON.stringify(actualResults),
		amrap_reps: amrapReps ?? null,
		amrap_weight: amrapWeight ?? null,
		calculated_1rm: calculated1rm,
		skipped: 0,
		notes: notes ?? null,
	});

	// Check if week is complete
	const { complete, remaining } = checkWeekComplete(
		state.current_week,
		state.current_phase,
		state.cycle_id,
	);

	let weekAdvanceResult: ReturnType<typeof advanceWeek> | undefined;
	if (complete) {
		weekAdvanceResult = advanceWeek();
	}

	const prType = prResult?.type ?? "none";

	const result: Record<string, unknown> = {
		logged: true,
		date: today,
		lift,
		pr: prType,
	};

	if (prType !== "none") {
		result.pr_details = {
			type: prType,
			weight: amrapWeight,
			reps: amrapReps,
			estimated_1rm: calculated1rm,
			previous_best_reps: prResult?.previousBestReps ?? null,
		};
	}

	result.week_complete = complete;
	if (!complete) {
		result.lifts_remaining = remaining;
	}
	if (weekAdvanceResult) {
		result.week_advanced = weekAdvanceResult;
	}

	return result;
}

export function skipLift(lift: Lift, reason?: string) {
	const state = queries.getProgramState();
	const liftData = queries.getLift(lift);

	if (
		queries.isLiftLoggedThisCycle(lift, state.current_week, state.current_phase, state.cycle_id)
	) {
		return {
			error: `${lift} is already logged for week ${state.current_week}.`,
		};
	}

	const today = new Date().toISOString().split("T")[0];

	queries.logWorkout({
		date: today,
		lift,
		template: liftData.active_template ?? "none",
		week: state.current_week,
		phase: state.current_phase,
		cycle_id: state.cycle_id,
		prescribed: "[]",
		actual: "[]",
		amrap_reps: null,
		amrap_weight: null,
		calculated_1rm: null,
		skipped: 1,
		notes: reason ?? null,
	});

	const { complete, remaining } = checkWeekComplete(
		state.current_week,
		state.current_phase,
		state.cycle_id,
	);

	let weekAdvanceResult: ReturnType<typeof advanceWeek> | undefined;
	if (complete) {
		weekAdvanceResult = advanceWeek();
	}

	return {
		skipped: true,
		lift,
		week: state.current_week,
		reason: reason ?? null,
		week_complete: complete,
		lifts_remaining: complete ? undefined : remaining,
		week_advanced: weekAdvanceResult,
	};
}

export function skipWeek(reason?: string) {
	const state = queries.getProgramState();
	const logged = queries.getLiftsLoggedThisWeek(
		state.current_week,
		state.current_phase,
		state.cycle_id,
	);
	const allLifts: Lift[] = ["squat", "bench", "deadlift", "ohp"];
	const unlogged = allLifts.filter((l) => !logged.has(l));

	for (const lift of unlogged) {
		skipLift(lift, reason ?? "week skipped");
	}

	// The last skipLift should trigger auto-advance, but ensure it happened
	const newState = queries.getProgramState();

	return {
		skipped: true,
		week_skipped: state.current_week,
		advanced_to: newState.current_week,
		new_status: newState.phase_status,
		reason: reason ?? null,
	};
}

type SeventhWeekType = "deload" | "tm_test" | "1rm_test";

const SEVENTH_WEEK_SETS: Record<SeventhWeekType, { percentage: number; reps: string }[]> = {
	deload: [
		{ percentage: 40, reps: "5" },
		{ percentage: 50, reps: "5" },
		{ percentage: 60, reps: "5" },
	],
	tm_test: [
		{ percentage: 70, reps: "5" },
		{ percentage: 80, reps: "3" },
		{ percentage: 90, reps: "1" },
		{ percentage: 100, reps: "3-5" },
	],
	"1rm_test": [
		{ percentage: 70, reps: "5" },
		{ percentage: 80, reps: "3" },
		{ percentage: 90, reps: "1" },
		{ percentage: 100, reps: "1" },
		{ percentage: 0, reps: "1" },
	],
};

export function getSeventhWeekWorkout(lift: Lift, type: SeventhWeekType) {
	const state = queries.getProgramState();

	if (state.phase_status !== "pending_deload_or_test") {
		return { error: "Program is not in pending_deload_or_test status." };
	}

	const liftData = queries.getLift(lift);
	if (!liftData.training_max) {
		return { error: `No training max set for ${lift}.` };
	}

	const trainingMax = liftData.training_max;
	const sets = SEVENTH_WEEK_SETS[type];

	const mainWork: PrescribedSet[] = sets.map((s) => ({
		percentage: s.percentage,
		weight: s.percentage > 0 ? calculateWeight(trainingMax, s.percentage) : 0,
		reps: s.reps,
	}));

	// For 1RM test, the last set is "work up beyond TM" — mark it clearly.
	if (type === "1rm_test") {
		mainWork[mainWork.length - 1] = {
			percentage: 0,
			weight: 0,
			reps: "1RM attempt",
		};
	}

	return {
		lift,
		type,
		training_max: trainingMax,
		phase: state.current_phase,
		main_work: mainWork,
	};
}

export function logSeventhWeekWorkout(
	lift: Lift,
	type: SeventhWeekType,
	actualResults: ActualSet[],
	testReps?: number,
	testWeight?: number,
	notes?: string,
) {
	const state = queries.getProgramState();

	if (state.phase_status !== "pending_deload_or_test") {
		return { error: "Program is not in pending_deload_or_test status." };
	}

	// Check if already logged for 7th week (week=0).
	if (queries.isLiftLoggedThisCycle(lift, 0, state.current_phase, state.cycle_id)) {
		return { error: `${lift} is already logged for the 7th week.` };
	}

	const liftData = queries.getLift(lift);
	const trainingMax = liftData.training_max ?? 0;
	const today = new Date().toISOString().split("T")[0];

	// Build prescribed from the hardcoded sets.
	const sets = SEVENTH_WEEK_SETS[type];
	const prescribed = JSON.stringify({
		main: sets.map((s) => ({
			percentage: s.percentage,
			weight: s.percentage > 0 ? calculateWeight(trainingMax, s.percentage) : 0,
			reps: s.reps,
		})),
	});

	const templateName = `7th-week-${type}`;

	// Handle test set validation and PR tracking.
	let calculated1rm: number | null = null;
	let tmValidation: { reps: number; weight: number; result: string; suggestion: string } | null =
		null;
	let prResult: {
		type: "new_weight" | "rep_record" | "none";
		previousBestReps: number | null;
	} | null = null;

	if (testReps && testWeight) {
		calculated1rm = calculateE1RM(testWeight, testReps);

		// Track as PR.
		prResult = queries.upsertPR(lift, testWeight, testReps, calculated1rm, today);
		const bestE1rm = queries.getBestE1RM(lift);
		if (bestE1rm) {
			queries.updateLift(lift, { estimated_1rm: bestE1rm });
		}

		if (type === "tm_test") {
			if (testReps < 3) {
				tmValidation = {
					reps: testReps,
					weight: testWeight,
					result: "too_heavy",
					suggestion: `Only ${testReps} rep${testReps === 1 ? "" : "s"} at TM. Consider lowering by 10-20 lbs.`,
				};
			} else if (testReps <= 4) {
				tmValidation = {
					reps: testReps,
					weight: testWeight,
					result: "solid",
					suggestion: "TM is appropriate. Good to proceed.",
				};
			} else {
				tmValidation = {
					reps: testReps,
					weight: testWeight,
					result: "strong",
					suggestion: `${testReps} reps at TM — strong. TM is well-calibrated.`,
				};
			}
		} else if (type === "1rm_test") {
			// For a 1RM test, update tested_1rm on the lift.
			queries.updateLift(lift, { tested_1rm: testWeight });
			tmValidation = {
				reps: 1,
				weight: testWeight,
				result: "tested",
				suggestion: `New tested 1RM: ${testWeight} lbs. TM can be recalculated from this.`,
			};
		}
	}

	queries.logWorkout({
		date: today,
		lift,
		template: templateName,
		week: 0,
		phase: state.current_phase,
		cycle_id: state.cycle_id,
		prescribed,
		actual: JSON.stringify(actualResults),
		amrap_reps: testReps ?? null,
		amrap_weight: testWeight ?? null,
		calculated_1rm: calculated1rm,
		skipped: 0,
		notes: notes ?? null,
	});

	// Check if all 4 lifts are done for the 7th week.
	const logged = queries.getLiftsLoggedThisWeek(0, state.current_phase, state.cycle_id);
	const allLifts: Lift[] = ["squat", "bench", "deadlift", "ohp"];
	const remaining = allLifts.filter((l) => !logged.has(l));

	const result: Record<string, unknown> = {
		logged: true,
		date: today,
		lift,
		type,
		all_lifts_complete: remaining.length === 0,
	};

	if (remaining.length > 0) {
		result.lifts_remaining = remaining;
	} else {
		result.ready_for_phase_transition = true;
	}

	if (tmValidation) {
		result.tm_validation = tmValidation;
	}

	const prType = prResult?.type ?? "none";
	if (prType !== "none") {
		result.pr = prType;
		result.pr_details = {
			type: prType,
			weight: testWeight,
			reps: testReps,
			estimated_1rm: calculated1rm,
			previous_best_reps: prResult?.previousBestReps ?? null,
		};
	}

	return result;
}

export function rescheduleLift(lift: Lift, newDay: DayOfWeek) {
	const originalDay = queries.getDayForLift(lift);
	queries.setScheduleEntry(newDay, lift);

	return {
		rescheduled: true,
		lift,
		original_day: originalDay,
		new_day: newDay,
	};
}
