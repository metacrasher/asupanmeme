import { getPool } from "../lib/db.js";

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
