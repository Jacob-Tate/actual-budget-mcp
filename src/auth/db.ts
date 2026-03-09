import Database from 'better-sqlite3';
import { config } from '../config';

let _db: Database.Database | null = null;

export function getAuthDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(config.authDbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      client_id   TEXT PRIMARY KEY,
      data        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_codes (
      code            TEXT PRIMARY KEY,
      client_id       TEXT NOT NULL,
      redirect_uri    TEXT NOT NULL,
      code_challenge  TEXT NOT NULL,
      expires_at      INTEGER NOT NULL,
      used            INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tokens (
      jti         TEXT PRIMARY KEY,
      client_id   TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      revoked     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token       TEXT PRIMARY KEY,
      client_id   TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      revoked     INTEGER NOT NULL DEFAULT 0
    );
  `);

  return _db;
}
