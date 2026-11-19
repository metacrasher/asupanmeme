import pg from "pg";

const { Pool } = pg;
let pool;

function getPool() {
  if (pool) return pool;

  const database = process.env.POSTGRES_DATABASE || "postgres";
  const password = process.env.POSTGRES_PASSWORD;
  const projectHost = process.env.POSTGRES_HOST;
  const projectRef = projectHost?.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];

  if (!password || !projectRef) {
    throw new Error("PostgreSQL pooler configuration is incomplete.");
  }

  // Use Supabase's IPv4-compatible transaction pooler. The direct database
  // hostname can be IPv6-only on some projects and fail from Vercel runtimes.
  // Region is read from the deployment configuration to avoid hardcoding a
  // database password or a full connection URL in source control.
  const region = process.env.SUPABASE_REGION || "ap-southeast-2";
  const host = `aws-0-${region}.pooler.supabase.com`;

  pool = new Pool({
    host,
    port: 6543,
    database,
    user: `postgres.${projectRef}`,
    password,
    ssl: { rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000
  });
  return pool;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    await getPool().query("SELECT 1");
    return res.status(200).json({
      ok: true,
      database: "reachable",
      connection: "supabase-pooler"
    });
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "CONNECTION_FAILED";
    console.error("Database connectivity check failed:", code);
    return res.status(503).json({
      ok: false,
      error: "Direct PostgreSQL connection is unavailable.",
      code
    });
  }
}
