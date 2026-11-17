import { mkdir } from "node:fs/promises";
import path from "node:path";

type Row = Record<string, unknown>;

export interface Database {
  query<T extends Row = Row>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 手机号登录：账号可以是手机号或邮箱，二者至少有一个。
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key
  ON users (phone) WHERE phone IS NOT NULL;
-- 验证码登录的账号没有密码，password_hash 允许为空。
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS verify_codes (
  id uuid PRIMARY KEY,
  account text NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS verify_codes_account_idx
  ON verify_codes (account, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS resumes (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  doc jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shares (
  token text PRIMARY KEY,
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  doc jsonb NOT NULL,
  password_hash text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shares ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE shares ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE TABLE IF NOT EXISTS cloud_resumes (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  doc jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cloud_resumes_user_idx
  ON cloud_resumes (user_id, updated_at DESC);

INSERT INTO cloud_resumes (id, user_id, title, doc, created_at, updated_at)
SELECT 'legacy-' || user_id::text, user_id, title, doc, updated_at, updated_at
FROM resumes
WHERE NOT EXISTS (
  SELECT 1 FROM cloud_resumes c WHERE c.user_id = resumes.user_id
);

CREATE TABLE IF NOT EXISTS user_resumes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id text NOT NULL,
  title text NOT NULL DEFAULT '',
  doc jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS user_resumes_user_idx
  ON user_resumes (user_id, updated_at DESC);

INSERT INTO user_resumes (user_id, id, title, doc, created_at, updated_at)
SELECT user_id, id, title, doc, created_at, updated_at
FROM cloud_resumes
ON CONFLICT DO NOTHING;
`;

declare global {
  // eslint-disable-next-line no-var
  var __blazecvDbPromise: Promise<Database> | undefined;
}

export function getDb(): Promise<Database> {
  if (!globalThis.__blazecvDbPromise) {
    globalThis.__blazecvDbPromise = initDb().catch((error) => {
      globalThis.__blazecvDbPromise = undefined;
      throw error;
    });
  }
  return globalThis.__blazecvDbPromise;
}

async function initDb(): Promise<Database> {
  const databaseUrl = process.env.DATABASE_URL;
  let database: Database;

  if (databaseUrl) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: databaseUrl, max: 5 });
    database = {
      query: async <T extends Row = Row>(sql: string, params: unknown[] = []) => {
        const result = await pool.query(sql, params);
        return { rows: result.rows as T[] };
      },
      exec: async (sql) => {
        await pool.query(sql);
      },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const directory =
      process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
    await mkdir(directory, { recursive: true });
    const client = new PGlite(directory);
    await client.waitReady;
    database = {
      query: async <T extends Row = Row>(sql: string, params: unknown[] = []) => {
        const result = await client.query(sql, params);
        return { rows: result.rows as T[] };
      },
      exec: async (sql) => {
        await client.exec(sql);
      },
    };
  }

  await database.exec(SCHEMA);
  return database;
}
