export type Lift = 'squat' | 'bench' | 'deadlift' | 'ohp';
export type Phase = 'leader' | 'anchor';
export type PhaseStatus = 'active' | 'pending_tm_bump' | 'pending_deload_or_test';
export type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
export type TemplateType = 'leader' | 'anchor' | 'leader/anchor';

export interface ProgramState {
  id: number;
  current_week: number;
  current_phase: Phase;
  leader_cycles_completed: number;
  phase_status: PhaseStatus;
  cycle_id: number;
}

export interface Schedule {
  id: number;
  day_of_week: DayOfWeek;
  lift: Lift;
}

export interface LiftRow {
  id: number;
  name: Lift;
  tested_1rm: number | null;
  estimated_1rm: number | null;
  training_max: number | null;
  tm_increment: number;
  active_template: string | null;
}

export interface WorkoutLog {
  id: number;
  date: string;
  lift: Lift;
  template: string;
  week: number;
  phase: Phase;
  cycle_id: number;
  prescribed: string;
  actual: string;
  amrap_reps: number | null;
  amrap_weight: number | null;
  calculated_1rm: number | null;
  skipped: number;
  notes: string | null;
}

export interface PR {
  id: number;
  lift: Lift;
  weight: number;
  best_reps: number;
  estimated_1rm: number;
  date: string;
}

export interface SetPrescription {
  percentage: number;
  reps: string;
  sets?: number;
  type?: string;
}

export interface WeekPlan {
  weeks: number[];
  sets: SetPrescription[];
}

export interface Template {
  name: string;
  displayName: string;
  type: TemplateType;
  tmPercentage: number;
  leaderCycles?: string;
  pairedAnchor?: string;
  pairedLeader?: string;
  mainWork: WeekPlan[];
  supplemental?: WeekPlan[];
}

export interface ActualSet {
  weight: number;
  reps: number;
}

export interface PrescribedSet {
  percentage: number;
  weight: number;
  reps: string;
  sets?: number;
  type?: string;
}

export interface ToolCallResult {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
}

export interface AgentResponse {
  text: string;
  toolCalls: ToolCallResult[];
}
