import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = resolve(process.cwd(), 'data', 'kirana.sqlite');

export type JsonRecord = Record<string, unknown>;

export function openDatabase() {
  const dbPath = process.env.KIRANA_DB_PATH ? resolve(process.cwd(), process.env.KIRANA_DB_PATH) : DEFAULT_DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_runs (
      id TEXT PRIMARY KEY,
      player_type TEXT NOT NULL,
      status TEXT NOT NULL,
      current_day INTEGER NOT NULL,
      total_score INTEGER NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS day_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      log_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(run_id, day)
    );

    CREATE TABLE IF NOT EXISTS inventory_snapshots (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      opening INTEGER NOT NULL,
      ordered INTEGER NOT NULL,
      sold INTEGER NOT NULL,
      missed INTEGER NOT NULL,
      wasted INTEGER NOT NULL,
      closing INTEGER NOT NULL,
      perishability_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_visits (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      segment TEXT NOT NULL,
      outcome TEXT NOT NULL,
      payment_mode TEXT NOT NULL,
      revenue INTEGER NOT NULL,
      khata_amount INTEGER NOT NULL,
      visit_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_state (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      customer_id TEXT NOT NULL,
      customer_json TEXT NOT NULL,
      UNIQUE(run_id, day, customer_id)
    );

    CREATE TABLE IF NOT EXISTS player_actions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      actions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(run_id, day)
    );

    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
      spec_id TEXT NOT NULL,
      planned_day INTEGER NOT NULL,
      effect_start_day INTEGER NOT NULL,
      effect_end_day INTEGER NOT NULL,
      status TEXT NOT NULL,
      cost INTEGER NOT NULL,
      actual_result_json TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_players (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_decisions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
      ai_player_id TEXT NOT NULL,
      day INTEGER NOT NULL,
      observation_hash TEXT NOT NULL,
      action_json TEXT NOT NULL,
      rationale TEXT NOT NULL,
      model TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      cost_estimate REAL NOT NULL,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_memory_summaries (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      summary_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export function json<T>(value: T): string {
  return JSON.stringify(value);
}

export function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}
