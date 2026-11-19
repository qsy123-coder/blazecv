import { mkdir } from "node:fs/promises";
import path from "node:path";

type Row = Record<string, unknown>;

export interface Database {
  query<T extends Row = Row>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
  /**
   * Run `fn` in a real transaction. PostgreSQL gets a dedicated pool client;
   * PGlite is a single-connection file database, so every query is serialized
   * through an in-process queue while the transaction is open.
   */
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
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

-- 支付订单：唯一事实来源。金额单位一律为分。
CREATE TABLE IF NOT EXISTS payment_orders (
  id uuid PRIMARY KEY,
  out_trade_no text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  amount_fen integer NOT NULL CHECK (amount_fen > 0),
  status text NOT NULL DEFAULT 'created',
  provider text NOT NULL DEFAULT 'wechat',
  channel text NOT NULL DEFAULT 'wechat',
  sub_mchid text,
  code_url text,
  provider_trade_no text,
  attach jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  last_checked_at timestamptz,
  refunded_at timestamptz
);

ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS sub_mchid text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'wechat';

CREATE INDEX IF NOT EXISTS payment_orders_user_idx
  ON payment_orders (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_trade_no_key
  ON payment_orders (provider_trade_no) WHERE provider_trade_no IS NOT NULL;

-- 会员投影：导出接口只需一次主键查询。
CREATE TABLE IF NOT EXISTS memberships (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 发货账本：order_id 主键保证同一订单只加一次时长。
CREATE TABLE IF NOT EXISTS membership_grants (
  order_id uuid PRIMARY KEY REFERENCES payment_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  days integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id text PRIMARY KEY,
  out_trade_no text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_events_order_idx
  ON payment_events (out_trade_no, created_at DESC);
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

/**
 * PGlite is a single-connection file database. Serialize every statement so a
 * transaction's BEGIN/COMMIT cannot be interleaved with another request.
 */
let pgliteQueue: Promise<unknown> = Promise.resolve();
function runPgliteExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = pgliteQueue.then(fn, fn);
  pgliteQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
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
      transaction: async <T>(fn: (tx: Database) => Promise<T>) => {
        const client = await pool.connect();
        const tx: Database = {
          query: async <U extends Row = Row>(sql: string, params: unknown[] = []) => {
            const result = await client.query(sql, params);
            return { rows: result.rows as U[] };
          },
          exec: async (sql) => {
            await client.query(sql);
          },
          transaction: async <U>(inner: (nested: Database) => Promise<U>) => inner(tx),
        };
        try {
          await client.query("BEGIN");
          const result = await fn(tx);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          try {
            await client.query("ROLLBACK");
          } catch {
            /* the connection may already be broken */
          }
          throw error;
        } finally {
          client.release();
        }
      },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const directory =
      process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
    await mkdir(directory, { recursive: true });
    const client = new PGlite(directory);
    await client.waitReady;

    const rawQuery = async <T extends Row = Row>(
      sql: string,
      params: unknown[] = [],
    ) => {
      const result = await client.query(sql, params);
      return { rows: result.rows as T[] };
    };

    database = {
      query: <T extends Row = Row>(sql: string, params: unknown[] = []) =>
        runPgliteExclusive(() => rawQuery<T>(sql, params)),
      exec: (sql: string) =>
        runPgliteExclusive(async () => {
          await client.exec(sql);
        }),
      transaction: <T>(fn: (tx: Database) => Promise<T>) =>
        runPgliteExclusive(async () => {
          const tx: Database = {
            query: rawQuery,
            exec: async (sql) => {
              await client.exec(sql);
            },
            transaction: async <U>(inner: (nested: Database) => Promise<U>) => inner(tx),
          };
          await client.exec("BEGIN");
          try {
            const result = await fn(tx);
            await client.exec("COMMIT");
            return result;
          } catch (error) {
            try {
              await client.exec("ROLLBACK");
            } catch {
              /* ignore rollback failure */
            }
            throw error;
          }
        }),
    };
  }

  await database.exec(SCHEMA);
  return database;
}
