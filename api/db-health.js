import pg from "pg";

const { Pool } = pg;
let pool;

function getPool() {
  if (pool) return pool;

  const rawConnectionString =
    process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!rawConnectionString) {
    throw new Error("PostgreSQL connection is not configured.");
  }

  // Supabase connection strings may carry sslmode/sslrootcert parameters.
  // The pg driver gives those URL parameters precedence over the explicit
  // TLS options and can reject Supabase's server chain in Vercel. Remove only
  // TLS query parameters, then keep TLS enabled with certificate verification
  // disabled for this diagnostic connection.
  const parsed = new URL(rawConnectionString);
  for (const key of [
    "sslmode",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "sslcrl",
    "uselibpqcompat"
  ]) {
    parsed.searchParams.delete(key);
  }

  pool = new Pool({
    connectionString: parsed.toString(),
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 7000,
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
    return res.status(200).json({ ok: true, database: "reachable" });
  } catch (error) {
    console.error(
      "Database connectivity check failed:",
      error?.code || error?.message || "unknown"
    );
    return res.status(503).json({
      ok: false,
      error: "Direct PostgreSQL connection is unavailable.",
      code: typeof error?.code === "string" ? error.code : undefined
    });
  }
}
