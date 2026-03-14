import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { ActualSet, DayOfWeek, Lift, Phase } from "../types";
import type { GiphyType } from "./gif";
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

const LiftEnum = Type.Union(
	[Type.Literal("squat"), Type.Literal("bench"), Type.Literal("deadlift"), Type.Literal("ohp")],
	{ description: "The lift" },
);

const OptionalLiftEnum = Type.Optional(
	Type.Union(
		[Type.Literal("squat"), Type.Literal("bench"), Type.Literal("deadlift"), Type.Literal("ohp")],
		{ description: "Filter by lift. Omit for all lifts." },
	),
);

const DayEnum = Type.Union(
	[
		Type.Literal("sunday"),
		Type.Literal("monday"),
		Type.Literal("tuesday"),
		Type.Literal("wednesday"),
		Type.Literal("thursday"),
		Type.Literal("friday"),
		Type.Literal("saturday"),
	],
	{ description: "Day of the week" },
);

const PeriodEnum = Type.Optional(
	Type.Union(
		[
			Type.Literal("week"),
			Type.Literal("month"),
			Type.Literal("3months"),
			Type.Literal("6months"),
			Type.Literal("year"),
		],
		{ description: "Time period to look back. Omit for all time." },
	),
);

const ActualResultsArray = Type.Array(
	Type.Object({
		weight: Type.Number(),
		reps: Type.Number(),
	}),
	{ description: "Array of sets performed" },
);

function json(data: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(data) }], details: {} };
}

function makeTool(
	name: string,
	label: string,
	description: string,
	parameters: Record<string, unknown>,
	execute: (toolCallId: string, params: Record<string, unknown>) => unknown,
): AgentTool {
	return {
		name,
		label,
		description,
		parameters: Type.Object(parameters as Record<string, ReturnType<typeof Type.Any>>),
		execute: async (toolCallId, params) => {
			try {
				const result = execute(toolCallId, params as Record<string, unknown>);
				const resolved = result instanceof Promise ? await result : result;
				return json(resolved);
			} catch (err) {
				console.error(`[tool] ${name} error:`, err);
				throw err;
			}
		},
	};
}

export const trainingTools: AgentTool[] = [
	// --- Workout Tools ---
	makeTool(
		"get_todays_workout",
		"Get Today's Workout",
		"Returns the full prescribed workout for a lift based on the active template, current week, and training max.",
		{ lift: LiftEnum },
		(_id, p) => getTodaysWorkout(p.lift as Lift),
	),
	makeTool(
		"log_workout",
		"Log Workout",
		"Logs a completed workout. Updates PRs if AMRAP/PR set results are provided. Auto-advances the week if all four lifts are logged or skipped.",
		{
			lift: LiftEnum,
			actual_results: ActualResultsArray,
			amrap_reps: Type.Optional(Type.Integer({ description: "Reps achieved on AMRAP/PR set" })),
			amrap_weight: Type.Optional(Type.Number({ description: "Weight used on AMRAP/PR set" })),
			notes: Type.Optional(Type.String({ description: "Any notes about the session" })),
		},
		(_id, p) =>
			logWorkout(
				p.lift as Lift,
				p.actual_results as ActualSet[],
				(p.amrap_reps as number) ?? undefined,
				(p.amrap_weight as number) ?? undefined,
				(p.notes as string) ?? undefined,
			),
	),
	makeTool(
		"skip_lift",
		"Skip Lift",
		"Marks a lift as skipped for the current week. Counts toward week completion.",
		{
			lift: LiftEnum,
			reason: Type.Optional(Type.String({ description: "Why the lift was skipped" })),
		},
		(_id, p) => skipLift(p.lift as Lift, (p.reason as string) ?? undefined),
	),
	makeTool(
		"skip_week",
		"Skip Week",
		"Skips the entire current week. All unlogged lifts are marked as skipped. Advances the week.",
		{
			reason: Type.Optional(Type.String({ description: "Why the week was skipped" })),
		},
		(_id, p) => skipWeek((p.reason as string) ?? undefined),
	),
	makeTool(
		"reschedule_lift",
		"Reschedule Lift",
		"Moves a lift to a different day within the current week.",
		{
			lift: LiftEnum,
			new_day: DayEnum,
		},
		(_id, p) => rescheduleLift(p.lift as Lift, p.new_day as DayOfWeek),
	),

	// --- 7th Week Tools ---
	makeTool(
		"get_seventh_week_workout",
		"Get 7th Week Workout",
		"Returns the prescribed 7th week workout (deload, TM test, or 1RM test) for a lift. Only works when status is pending_deload_or_test.",
		{
			lift: LiftEnum,
			type: Type.Union(
				[Type.Literal("deload"), Type.Literal("tm_test"), Type.Literal("1rm_test")],
				{
					description:
						"deload = light recovery (40/50/60%), tm_test = work up to TM for 3-5 reps, 1rm_test = work up to a true 1RM",
				},
			),
		},
		(_id, p) => getSeventhWeekWorkout(p.lift as Lift, p.type as "deload" | "tm_test" | "1rm_test"),
	),
	makeTool(
		"log_seventh_week_workout",
		"Log 7th Week Workout",
		"Logs a 7th week workout. For TM tests, validates the result and suggests TM adjustments. For 1RM tests, updates tested_1rm. Signals when all 4 lifts are done and phase transition is ready.",
		{
			lift: LiftEnum,
			type: Type.Union([Type.Literal("deload"), Type.Literal("tm_test"), Type.Literal("1rm_test")]),
			actual_results: ActualResultsArray,
			test_reps: Type.Optional(
				Type.Integer({
					description: "Reps achieved on the test set (TM test) or the 1RM attempt",
				}),
			),
			test_weight: Type.Optional(
				Type.Number({ description: "Weight used on the test set or 1RM attempt" }),
			),
			notes: Type.Optional(Type.String()),
		},
		(_id, p) =>
			logSeventhWeekWorkout(
				p.lift as Lift,
				p.type as "deload" | "tm_test" | "1rm_test",
				p.actual_results as ActualSet[],
				(p.test_reps as number) ?? undefined,
				(p.test_weight as number) ?? undefined,
				(p.notes as string) ?? undefined,
			),
	),

	// --- State Tools ---
	makeTool(
		"get_program_state",
		"Get Program State",
		"Returns the full current state of the program including lifts, schedule, and cycle position.",
		{},
		() => getProgramState(),
	),
	makeTool(
		"advance_week",
		"Advance Week",
		"Advances the program by one week. If completing week 3, sets status to pending_tm_bump.",
		{},
		() => advanceWeek(),
	),
	makeTool(
		"bump_tm",
		"Bump Training Max",
		"Bumps the training max for a specific lift by the given amount.",
		{
			lift: LiftEnum,
			amount: Type.Number({ description: "Amount to add to TM (can be 0 to hold)" }),
		},
		(_id, p) => bumpTm(p.lift as Lift, p.amount as number),
	),
	makeTool(
		"skip_tm_bump",
		"Skip TM Bump",
		"Holds the TM for a specific lift (equivalent to bumping by 0).",
		{ lift: LiftEnum },
		(_id, p) => skipTmBump(p.lift as Lift),
	),
	makeTool(
		"finalize_tm_bumps",
		"Finalize TM Bumps",
		"Call after all TM bumps are resolved to advance the program state. Moves from pending_tm_bump to the next phase or cycle.",
		{},
		() => finalizeTmBumps(),
	),
	makeTool(
		"set_phase",
		"Set Phase",
		"Switches the program phase (leader/anchor). Resets week to 1.",
		{
			phase: Type.Union([Type.Literal("leader"), Type.Literal("anchor")]),
		},
		(_id, p) => setPhase(p.phase as Phase),
	),
	makeTool(
		"set_template",
		"Set Template",
		"Assigns a template to a specific lift.",
		{
			lift: LiftEnum,
			template_name: Type.String({
				description:
					'Template identifier (filename without extension, e.g. "leviathan-leader"). Use get_available_templates to see available options.',
			}),
		},
		(_id, p) => setTemplate(p.lift as Lift, p.template_name as string),
	),
	makeTool(
		"set_week",
		"Set Week",
		"Manually sets the current week.",
		{
			week: Type.Integer({
				minimum: 1,
				maximum: 3,
				description: "Week number (1, 2, or 3)",
			}),
		},
		(_id, p) => setWeek(p.week as number),
	),
	makeTool(
		"set_leader_cycles_completed",
		"Set Leader Cycles Completed",
		"Manually sets the leader cycle count.",
		{
			count: Type.Integer({
				description: "Number of leader cycles to mark as completed",
			}),
		},
		(_id, p) => setLeaderCyclesCompleted(p.count as number),
	),

	// --- Query Tools ---
	makeTool(
		"get_prs",
		"Get PRs",
		"Returns PR history, optionally filtered by lift.",
		{ lift: OptionalLiftEnum },
		(_id, p) => getPRs(p.lift as Lift | undefined),
	),
	makeTool(
		"get_training_maxes",
		"Get Training Maxes",
		"Returns current training maxes for all lifts.",
		{},
		() => getTrainingMaxes(),
	),
	makeTool(
		"get_workout_history",
		"Get Workout History",
		"Returns recent workout logs.",
		{
			lift: OptionalLiftEnum,
			last_n: Type.Optional(
				Type.Integer({ description: "Number of recent workouts to return (default 10)" }),
			),
		},
		(_id, p) => getWorkoutHistory(p.lift as Lift | undefined, (p.last_n as number) ?? undefined),
	),
	makeTool(
		"get_available_templates",
		"Get Available Templates",
		"Lists all templates in the templates folder.",
		{
			type: Type.Optional(
				Type.Union([Type.Literal("leader"), Type.Literal("anchor")], {
					description: "Filter by type",
				}),
			),
		},
		(_id, p) => getAvailableTemplates((p.type as string) ?? undefined),
	),

	// --- Analytics Tools ---
	makeTool(
		"get_volume",
		"Get Volume",
		"Returns total training volume (tonnage, sets, reps) per lift for a given time period.",
		{ lift: OptionalLiftEnum, period: PeriodEnum },
		(_id, p) => getVolume(p.lift as Lift | undefined, (p.period as string) ?? undefined),
	),
	makeTool(
		"get_completion_stats",
		"Get Completion Stats",
		"Returns workout completion rates — how many sessions were completed vs skipped, overall and per lift.",
		{ lift: OptionalLiftEnum, period: PeriodEnum },
		(_id, p) => getCompletionStats(p.lift as Lift | undefined, (p.period as string) ?? undefined),
	),
	makeTool(
		"get_e1rm_history",
		"Get e1RM History",
		"Returns estimated 1RM progression over time from AMRAP/PR sets. Shows how strength has trended across cycles.",
		{ lift: OptionalLiftEnum, period: PeriodEnum },
		(_id, p) => getE1rmHistory(p.lift as Lift | undefined, (p.period as string) ?? undefined),
	),
	makeTool(
		"get_tm_history",
		"Get TM History",
		"Returns training max progression over time for each lift, showing when and how TMs changed across cycles.",
		{ lift: OptionalLiftEnum },
		(_id, p) => getTmHistory(p.lift as Lift | undefined),
	),

	// --- Setup Tools ---
	makeTool(
		"set_tested_1rm",
		"Set Tested 1RM",
		"Sets the tested 1RM for a lift and recalculates the training max.",
		{
			lift: LiftEnum,
			weight: Type.Number({ description: "Tested 1RM in lbs" }),
		},
		(_id, p) => setTested1rm(p.lift as Lift, p.weight as number),
	),
	makeTool(
		"set_schedule",
		"Set Schedule",
		"Maps a day of the week to a lift. Multiple lifts can share the same day. Reports what other lifts are already on that day.",
		{
			day: DayEnum,
			lift: Type.Union([
				Type.Literal("squat"),
				Type.Literal("bench"),
				Type.Literal("deadlift"),
				Type.Literal("ohp"),
				Type.Literal("none"),
			]),
		},
		(_id, p) => setSchedule(p.day as DayOfWeek, p.lift as string),
	),
	makeTool(
		"reset_program",
		"Reset Program",
		"Resets all cycle state. Keeps templates, 1RMs, and workout history.",
		{
			keep_tms: Type.Optional(
				Type.Boolean({
					description:
						"If true, keep current TMs. If false, recalculate from tested 1RMs. Default true.",
				}),
			),
		},
		(_id, p) => resetProgram((p.keep_tms as boolean) ?? undefined),
	),

	// --- GIF Tools ---
	{
		name: "daily_success_gif",
		label: "Daily Success GIF",
		description: "Gets a celebratory GIF from giphy",
		parameters: Type.Object({}),
		execute: async () => json(await Giphy.getDailySuccess()),
	},
	makeTool(
		"get_something_from_giphy",
		"Get GIF from Giphy",
		"Search giphy for a specific type of content with custom search terms",
		{
			type: Type.Union([
				Type.Literal("gifs"),
				Type.Literal("stickers"),
				Type.Literal("text"),
				Type.Literal("videos"),
			]),
			terms: Type.Array(Type.String()),
		},
		async (_id, p) => await Giphy.getAnything(p.type as GiphyType, ...(p.terms as string[])),
	),
];
