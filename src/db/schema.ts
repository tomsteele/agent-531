import { getDb } from './connection';

export function initSchema(): void {
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS program_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_week INTEGER NOT NULL DEFAULT 1 CHECK (current_week IN (1, 2, 3)),
      current_phase TEXT NOT NULL DEFAULT 'leader' CHECK (current_phase IN ('leader', 'anchor')),
      leader_cycles_completed INTEGER NOT NULL DEFAULT 0,
      phase_status TEXT NOT NULL DEFAULT 'active' CHECK (phase_status IN ('active', 'pending_tm_bump', 'pending_deload_or_test')),
      cycle_id INTEGER NOT NULL DEFAULT 1
    );

    INSERT OR IGNORE INTO program_state (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week TEXT NOT NULL UNIQUE CHECK (day_of_week IN ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday')),
      lift TEXT NOT NULL CHECK (lift IN ('squat', 'bench', 'deadlift', 'ohp'))
    );

    CREATE TABLE IF NOT EXISTS lifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE CHECK (name IN ('squat', 'bench', 'deadlift', 'ohp')),
      tested_1rm REAL,
      estimated_1rm REAL,
      training_max REAL,
      tm_increment REAL NOT NULL DEFAULT 5,
      active_template TEXT
    );

    INSERT OR IGNORE INTO lifts (name, tm_increment) VALUES ('squat', 10);
    INSERT OR IGNORE INTO lifts (name, tm_increment) VALUES ('bench', 5);
    INSERT OR IGNORE INTO lifts (name, tm_increment) VALUES ('deadlift', 10);
    INSERT OR IGNORE INTO lifts (name, tm_increment) VALUES ('ohp', 5);

    CREATE TABLE IF NOT EXISTS workout_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      lift TEXT NOT NULL CHECK (lift IN ('squat', 'bench', 'deadlift', 'ohp')),
      template TEXT NOT NULL,
      week INTEGER NOT NULL,
      phase TEXT NOT NULL CHECK (phase IN ('leader', 'anchor')),
      cycle_id INTEGER NOT NULL DEFAULT 1,
      prescribed TEXT NOT NULL,
      actual TEXT NOT NULL,
      amrap_reps INTEGER,
      amrap_weight REAL,
      calculated_1rm REAL,
      skipped INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS prs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lift TEXT NOT NULL CHECK (lift IN ('squat', 'bench', 'deadlift', 'ohp')),
      weight REAL NOT NULL,
      best_reps INTEGER NOT NULL,
      estimated_1rm REAL NOT NULL,
      date TEXT NOT NULL,
      UNIQUE(lift, weight)
    );
  `);
}
