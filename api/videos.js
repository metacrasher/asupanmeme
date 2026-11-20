import { getPool } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { rows } = await getPool().query(
      `SELECT id, title, description, thumbnail_url, duration, views,
              created_at, is_exclusive, video_url, storage_path, storage_provider
       FROM public.videos
       WHERE published = TRUE
       ORDER BY created_at DESC
       LIMIT 500`
    );

    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json({ videos: rows });
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "CATALOG_QUERY_FAILED";
    console.error("Public video catalog query failed:", code);
    return res.status(503).json({
      error: "Katalog belum dapat dimuat. Silakan coba kembali.",
      code
    });
  }
}
