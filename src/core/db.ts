import Database from 'better-sqlite3';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DB = Database.Database;

const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
);

const MIGRATION_FILENAME = /^(\d{3,})_.+\.sql$/;

export interface OpenOptions {
  path: string;
  readonly?: boolean;
  migrationsDir?: string;
}

export function openDb(options: OpenOptions): DB {
  const dir = dirname(options.path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(options.path, {
    readonly: options.readonly ?? false,
    fileMustExist: false,
  });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  if (!options.readonly) {
    runMigrations(db, options.migrationsDir ?? MIGRATIONS_DIR);
  }
  return db;
}

export function runMigrations(db: DB, dir: string = MIGRATIONS_DIR): number {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at INTEGER NOT NULL
     );`,
  );

  if (!existsSync(dir)) {
    throw new Error(`Migrations directory not found: ${dir}`);
  }

  const applied = new Set<number>(
    db
      .prepare(`SELECT version FROM schema_migrations`)
      .all()
      .map((r) => (r as { version: number }).version),
  );

  const files = readdirSync(dir)
    .filter((f) => MIGRATION_FILENAME.test(f))
    .sort();

  let count = 0;
  const insert = db.prepare(
    `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
  );

  for (const file of files) {
    const match = MIGRATION_FILENAME.exec(file);
    if (!match || match[1] === undefined) continue;
    const version = Number.parseInt(match[1], 10);
    if (applied.has(version)) continue;

    const sql = readFileSync(join(dir, file), 'utf8');

    // BEGIN IMMEDIATE fails fast under writer contention instead of hanging.
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      insert.run(version, file, Date.now());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    count += 1;
  }

  return count;
}

export function appliedVersions(db: DB): number[] {
  return db
    .prepare(`SELECT version FROM schema_migrations ORDER BY version ASC`)
    .all()
    .map((r) => (r as { version: number }).version);
}

export function hasFts5(db: DB): boolean {
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_probe USING fts5(x)`);
    db.exec(`DROP TABLE IF EXISTS _fts5_probe`);
    return true;
  } catch {
    return false;
  }
}
