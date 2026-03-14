import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ActualSet, DayOfWeek, Lift, Phase } from "../types";
import * as Giphy from "./gif";
import {
	getAvailableTemplates,
	getCompletionStats,
	getE1rmHistory,
	getPRs,
	getTmHistory,
	getTrainingMaxes,
	getVolume,
	getWorkoutHistory,
} from "./query";
import { resetProgram, setSchedule, setTested1rm } from "./setup";
import {
	advanceWeek,
	bumpTm,
	finalizeTmBumps,
	getProgramState,
	setLeaderCyclesCompleted,
	setPhase,
	setTemplate,
	setWeek,
	skipTmBump,
} from "./state";
import {
	getSeventhWeekWorkout,
	getTodaysWorkout,
	logSeventhWeekWorkout,
	logWorkout,
	rescheduleLift,
	skipLift,
	skipWeek,
} from "./workout";

const liftEnum = z.enum(["squat", "bench", "deadlift", "ohp"]);
const dayEnum = z.enum([
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
]);

function jsonResult(data: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function errorResult(error: string) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify({ error }) }],
		isError: true as const,
	};
}

function wrap<T>(fn: () => T) {
	try {
		return jsonResult(fn());
	} catch (err) {
		console.error("[mcp] tool error:", err);
		return errorResult(String(err));
	}
}

export const trainingServer = createSdkMcpServer({
	name: "training",
	version: "1.0.0",
	tools: [
		// --- Workout Tools ---
		tool(
			"get_todays_workout",
			"Returns the full prescribed workout for a lift based on the active template, current week, and training max.",
			{ lift: liftEnum.describe("The lift to get the workout for") },
			async (args) => wrap(() => getTodaysWorkout(args.lift as Lift)),
		),
		tool(
			"log_workout",
			"Logs a completed workout. Updates PRs if AMRAP/PR set results are provided. Auto-advances the week if all four lifts are logged or skipped.",
			{
				lift: liftEnum,
				actual_results: z
					.array(
						z.object({
							weight: z.number(),
							reps: z.number(),
						}),
					)
					.describe("Array of sets performed"),
				amrap_reps: z.int().optional().describe("Reps achieved on AMRAP/PR set"),
				amrap_weight: z.number().optional().describe("Weight used on AMRAP/PR set"),
				notes: z.string().optional().describe("Any notes about the session"),
			},
			async (args) =>
				wrap(() =>
					logWorkout(
						args.lift as Lift,
						args.actual_results as ActualSet[],
						args.amrap_reps ?? undefined,
						args.amrap_weight ?? undefined,
						args.notes ?? undefined,
					),
				),
		),
		tool(
			"skip_lift",
			"Marks a lift as skipped for the current week. Counts toward week completion.",
			{
				lift: liftEnum,
				reason: z.string().optional().describe("Why the lift was skipped"),
			},
			async (args) => wrap(() => skipLift(args.lift as Lift, args.reason ?? undefined)),
		),
		tool(
			"skip_week",
			"Skips the entire current week. All unlogged lifts are marked as skipped. Advances the week.",
			{
				reason: z.string().optional().describe("Why the week was skipped"),
			},
			async (args) => wrap(() => skipWeek(args.reason ?? undefined)),
		),
		tool(
			"reschedule_lift",
			"Moves a lift to a different day within the current week.",
			{
				lift: liftEnum.describe("The lift to reschedule"),
				new_day: dayEnum.describe("The new day for the lift"),
			},
			async (args) => wrap(() => rescheduleLift(args.lift as Lift, args.new_day as DayOfWeek)),
		),

		// --- 7th Week Tools ---
		tool(
			"get_seventh_week_workout",
			"Returns the prescribed 7th week workout (deload, TM test, or 1RM test) for a lift. Only works when status is pending_deload_or_test.",
			{
				lift: liftEnum,
				type: z
					.enum(["deload", "tm_test", "1rm_test"])
					.describe(
						"deload = light recovery (40/50/60%), tm_test = work up to TM for 3-5 reps, 1rm_test = work up to a true 1RM",
					),
			},
			async (args) =>
				wrap(() =>
					getSeventhWeekWorkout(args.lift as Lift, args.type as "deload" | "tm_test" | "1rm_test"),
				),
		),
		tool(
			"log_seventh_week_workout",
			"Logs a 7th week workout. For TM tests, validates the result and suggests TM adjustments. For 1RM tests, updates tested_1rm. Signals when all 4 lifts are done and phase transition is ready.",
			{
				lift: liftEnum,
				type: z.enum(["deload", "tm_test", "1rm_test"]),
				actual_results: z
					.array(z.object({ weight: z.number(), reps: z.number() }))
					.describe("Array of sets performed"),
				test_reps: z
					.int()
					.optional()
					.describe("Reps achieved on the test set (TM test) or the 1RM attempt"),
				test_weight: z.number().optional().describe("Weight used on the test set or 1RM attempt"),
				notes: z.string().optional(),
			},
			async (args) =>
				wrap(() =>
					logSeventhWeekWorkout(
						args.lift as Lift,
						args.type as "deload" | "tm_test" | "1rm_test",
						args.actual_results as ActualSet[],
						args.test_reps ?? undefined,
						args.test_weight ?? undefined,
						args.notes ?? undefined,
					),
				),
		),

		// --- State Tools ---
		tool(
			"get_program_state",
			"Returns the full current state of the program including lifts, schedule, and cycle position.",
			{},
			async () => wrap(() => getProgramState()),
		),
		tool(
			"advance_week",
			"Advances the program by one week. If completing week 3, sets status to pending_tm_bump.",
			{},
			async () => wrap(() => advanceWeek()),
		),
		tool(
			"bump_tm",
			"Bumps the training max for a specific lift by the given amount.",
			{
				lift: liftEnum,
				amount: z.number().describe("Amount to add to TM (can be 0 to hold)"),
			},
			async (args) => wrap(() => bumpTm(args.lift as Lift, args.amount)),
		),
		tool(
			"skip_tm_bump",
			"Holds the TM for a specific lift (equivalent to bumping by 0).",
			{
				lift: liftEnum,
			},
			async (args) => wrap(() => skipTmBump(args.lift as Lift)),
		),
		tool(
			"finalize_tm_bumps",
			"Call after all TM bumps are resolved to advance the program state. Moves from pending_tm_bump to the next phase or cycle.",
			{},
			async () => wrap(() => finalizeTmBumps()),
		),
		tool(
			"set_phase",
			"Switches the program phase (leader/anchor). Resets week to 1.",
			{
				phase: z.enum(["leader", "anchor"]),
			},
			async (args) => wrap(() => setPhase(args.phase as Phase)),
		),
		tool(
			"set_template",
			"Assigns a template to a specific lift.",
			{
				lift: liftEnum,
				template_name: z
					.string()
					.describe(
						'Template identifier (filename without extension, e.g. "leviathan-leader"). Use get_available_templates to see available options.',
					),
			},
			async (args) => wrap(() => setTemplate(args.lift as Lift, args.template_name)),
		),
		tool(
			"set_week",
			"Manually sets the current week.",
			{
				week: z.int().min(1).max(3).describe("Week number (1, 2, or 3)"),
			},
			async (args) => wrap(() => setWeek(args.week)),
		),
		tool(
			"set_leader_cycles_completed",
			"Manually sets the leader cycle count.",
			{
				count: z.int().describe("Number of leader cycles to mark as completed"),
			},
			async (args) => wrap(() => setLeaderCyclesCompleted(args.count)),
		),

		// --- Query Tools ---
		tool(
			"get_prs",
			"Returns PR history, optionally filtered by lift.",
			{
				lift: liftEnum.optional().describe("Filter by lift. Omit for all lifts."),
			},
			async (args) => wrap(() => getPRs(args.lift as Lift | undefined)),
		),
		tool("get_training_maxes", "Returns current training maxes for all lifts.", {}, async () =>
			wrap(() => getTrainingMaxes()),
		),
		tool(
			"get_workout_history",
			"Returns recent workout logs.",
			{
				lift: liftEnum.optional().describe("Filter by lift"),
				last_n: z.int().optional().describe("Number of recent workouts to return (default 10)"),
			},
			async (args) =>
				wrap(() => getWorkoutHistory(args.lift as Lift | undefined, args.last_n ?? undefined)),
		),
		tool(
			"get_available_templates",
			"Lists all templates in the templates folder.",
			{
				type: z.enum(["leader", "anchor"]).optional().describe("Filter by type"),
			},
			async (args) => wrap(() => getAvailableTemplates(args.type ?? undefined)),
		),

		// --- Analytics Tools ---
		tool(
			"get_volume",
			"Returns total training volume (tonnage, sets, reps) per lift for a given time period.",
			{
				lift: liftEnum.optional().describe("Filter by lift. Omit for all lifts."),
				period: z
					.enum(["week", "month", "3months", "6months", "year"])
					.optional()
					.describe("Time period to look back. Omit for all time."),
			},
			async (args) =>
				wrap(() => getVolume(args.lift as Lift | undefined, args.period ?? undefined)),
		),
		tool(
			"get_completion_stats",
			"Returns workout completion rates — how many sessions were completed vs skipped, overall and per lift.",
			{
				lift: liftEnum.optional().describe("Filter by lift. Omit for all lifts."),
				period: z
					.enum(["week", "month", "3months", "6months", "year"])
					.optional()
					.describe("Time period to look back. Omit for all time."),
			},
			async (args) =>
				wrap(() => getCompletionStats(args.lift as Lift | undefined, args.period ?? undefined)),
		),
		tool(
			"get_e1rm_history",
			"Returns estimated 1RM progression over time from AMRAP/PR sets. Shows how strength has trended across cycles.",
			{
				lift: liftEnum.optional().describe("Filter by lift. Omit for all lifts."),
				period: z
					.enum(["week", "month", "3months", "6months", "year"])
					.optional()
					.describe("Time period to look back. Omit for all time."),
			},
			async (args) =>
				wrap(() => getE1rmHistory(args.lift as Lift | undefined, args.period ?? undefined)),
		),
		tool(
			"get_tm_history",
			"Returns training max progression over time for each lift, showing when and how TMs changed across cycles.",
			{
				lift: liftEnum.optional().describe("Filter by lift. Omit for all lifts."),
			},
			async (args) => wrap(() => getTmHistory(args.lift as Lift | undefined)),
		),

		// --- Setup Tools ---
		tool(
			"set_tested_1rm",
			"Sets the tested 1RM for a lift and recalculates the training max.",
			{
				lift: liftEnum,
				weight: z.number().describe("Tested 1RM in lbs"),
			},
			async (args) => wrap(() => setTested1rm(args.lift as Lift, args.weight)),
		),
		tool(
			"set_schedule",
			"Maps a day of the week to a lift. Multiple lifts can share the same day. Reports what other lifts are already on that day.",
			{
				day: dayEnum,
				lift: z.enum(["squat", "bench", "deadlift", "ohp", "none"]),
			},
			async (args) => wrap(() => setSchedule(args.day as DayOfWeek, args.lift)),
		),
		tool(
			"reset_program",
			"Resets all cycle state. Keeps templates, 1RMs, and workout history.",
			{
				keep_tms: z
					.boolean()
					.optional()
					.describe(
						"If true, keep current TMs. If false, recalculate from tested 1RMs. Default true.",
					),
			},
			async (args) => wrap(() => resetProgram(args.keep_tms ?? undefined)),
		),
		tool("daily_success_gif", "Gets a celebratory GIF from giphy", {}, async () =>
			jsonResult(await Giphy.getDailySuccess()),
		),
		tool(
			"get_something_from_giphy",
			"Search giphy for a specific type of content with custom search terms",
			{
				type: z.enum(["gifs", "stickers", "text", "videos"]),
				terms: z.array(z.string()),
			},
			async (args) => jsonResult(await Giphy.getAnything(args.type, ...args.terms)),
		),
	],
});
