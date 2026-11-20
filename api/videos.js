import { getPool } from "../lib/db.js";

const MODERATION_BLOCKLIST = /\b(?:anak|bocil|smp|sma|sekolah|pelajar|remaja|adek|adik|teen(?:ager)?|underage|minor|child(?:ren)?|forced|rape[d]?|raping|drugged|unconscious|dipaksa|memaksa|paksa|perkosa|diperkosa|pemerkosaan|obat\s+tidur|tidak\s+sadar|tanpa\s+persetujuan|tanpa\s+izin|eksploitasi)\b/i;

function isEligibleForPublicListing(video) {
  // Metadata screening is a conservative first barrier, not proof that the
  // underlying media is lawful. Flagged entries remain stored for admin review.
  const metadata = [video.title, video.description].filter(Boolean).join(" ");
  return !MODERATION_BLOCKLIST.test(metadata);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { rows } = await getPool().query(
      "SELECT id, title, description, thumbnail_url, duration, views, " +
      "created_at, is_exclusive, video_url, storage_path, storage_provider " +
      "FROM public.videos WHERE published = TRUE " +
      "ORDER BY created_at DESC LIMIT 500"
    );

    const videos = rows.filter(isEligibleForPublicListing);
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json({ videos });
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "CATALOG_QUERY_FAILED";
    console.error("Public video catalog query failed:", code);
    return res.status(503).json({
      error: "Katalog belum dapat dimuat. Silakan coba kembali.",
      code
    });
  }
}
