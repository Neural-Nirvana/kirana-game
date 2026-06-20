import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { PlayerProfile, PlayerRunSummary } from '../src/types';

const SESSION_DAYS = 90;

interface PlayerRow {
  id: string;
  display_name: string;
  name_key: string | null;
  kind: PlayerProfile['kind'];
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  player_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  user_agent: string | null;
  display_name: string;
  kind: PlayerProfile['kind'];
  player_created_at: string;
}

interface RunSummaryRow {
  id: string;
  run_name: string | null;
  player_type: PlayerRunSummary['playerType'];
  status: string;
  current_day: number;
  total_score: number;
  created_at: string;
  updated_at: string;
}

export interface AuthenticatedPlayerSession {
  sessionId: string;
  token: string;
  expiresAt: string;
  player: PlayerProfile;
}

export class SessionStore {
  constructor(private readonly db: DatabaseSync) {}

  createPlayerSession(displayName: string, userAgent?: string): AuthenticatedPlayerSession {
    const now = new Date().toISOString();
    const sessionId = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const nameKey = toNameKey(displayName);
    let player = this.findPlayerByNameKey('human', nameKey);

    this.db.exec('BEGIN');
    try {
      if (player) {
        this.db.prepare(`
          UPDATE players SET display_name = ?, updated_at = ? WHERE id = ?
        `).run(displayName, now, player.id);
        player = {
          ...player,
          displayName,
        };
      } else {
        const playerId = randomUUID();
        this.db.prepare(`
          INSERT INTO players (id, display_name, name_key, kind, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(playerId, displayName, nameKey, 'human', now, now);
        player = {
          id: playerId,
          displayName,
          kind: 'human',
          createdAt: now,
        };
      }

      this.db.prepare(`
        INSERT INTO player_sessions (id, player_id, token_hash, created_at, expires_at, last_seen_at, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(sessionId, player.id, hashToken(token), now, expiresAt, now, userAgent ?? null);

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return {
      sessionId,
      token,
      expiresAt,
      player,
    };
  }

  getSessionByToken(token: string | undefined): AuthenticatedPlayerSession | undefined {
    if (!token) return undefined;
    const tokenHash = hashToken(token);
    const row = this.db.prepare(`
      SELECT
        player_sessions.*,
        players.display_name,
        players.kind,
        players.created_at AS player_created_at
      FROM player_sessions
      JOIN players ON players.id = player_sessions.player_id
      WHERE player_sessions.token_hash = ?
      LIMIT 1
    `).get(tokenHash) as SessionRow | undefined;

    if (!row) return undefined;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      this.deleteSessionByToken(token);
      return undefined;
    }

    this.db.prepare(`
      UPDATE player_sessions SET last_seen_at = ? WHERE id = ?
    `).run(new Date().toISOString(), row.id);

    return {
      sessionId: row.id,
      token,
      expiresAt: row.expires_at,
      player: {
        id: row.player_id,
        displayName: row.display_name,
        kind: row.kind,
        createdAt: row.player_created_at,
      },
    };
  }

  deleteSessionByToken(token: string | undefined) {
    if (!token) return;
    this.db.prepare('DELETE FROM player_sessions WHERE token_hash = ?').run(hashToken(token));
  }

  listRuns(playerId: string): PlayerRunSummary[] {
    const rows = this.db.prepare(`
      SELECT id, run_name, player_type, status, current_day, total_score, created_at, updated_at
      FROM game_runs
      WHERE player_id = ?
      ORDER BY updated_at DESC
    `).all(playerId) as RunSummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      runName: row.run_name ?? undefined,
      playerType: row.player_type,
      status: row.status,
      currentDay: row.current_day,
      totalScore: row.total_score,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  ensureSystemPlayer(displayName: string, kind: PlayerProfile['kind'] = 'system'): PlayerProfile {
    const nameKey = toNameKey(displayName);
    const existing = this.db.prepare(`
      SELECT * FROM players WHERE kind = ? AND name_key = ? ORDER BY created_at ASC LIMIT 1
    `).get(kind, nameKey) as PlayerRow | undefined;
    if (existing) return toPlayerProfile(existing);

    const now = new Date().toISOString();
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO players (id, display_name, name_key, kind, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, displayName, nameKey, kind, now, now);

    return {
      id,
      displayName,
      kind,
      createdAt: now,
    };
  }

  private findPlayerByNameKey(kind: PlayerProfile['kind'], nameKey: string): PlayerProfile | undefined {
    const row = this.db.prepare(`
      SELECT * FROM players WHERE kind = ? AND name_key = ? ORDER BY created_at ASC LIMIT 1
    `).get(kind, nameKey) as PlayerRow | undefined;
    return row ? toPlayerProfile(row) : undefined;
  }
}

export function normalizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Player name is required');
  const displayName = value.replace(/\s+/g, ' ').trim();
  if (!displayName) throw new Error('Player name is required');
  if (displayName.length > 40) throw new Error('Player name must be 40 characters or less');
  return displayName;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toNameKey(displayName: string): string {
  return displayName.toLocaleLowerCase('en-IN');
}

function toPlayerProfile(row: PlayerRow): PlayerProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    kind: row.kind,
    createdAt: row.created_at,
  };
}
