import { createClient } from "@supabase/supabase-js";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { authenticate, createDahonoClient } from "../lib/r2.js";

const BUCKET = "media-videos";
const MAX_BATCH = 3;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_BY_EXT = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime"
};

function safeExtension(path) {
  const match = String(path || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = match?.[1] || "mp4";
  return Object.hasOwn(MIME_BY_EXT, ext) ? ext : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await authenticate(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.profile?.role !== "admin") {
    return res.status(403).json({ error: "Akses khusus admin." });
  }

  const approvedIds = new Set(
    String(process.env.DAHONO_MIGRATION_SAFE_VIDEO_IDS || "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter((id) => UUID_RE.test(id))
  );
  if (approvedIds.size === 0) {
    return res.status(503).json({
      error: "Belum ada ID video yang dimasukkan ke daftar migrasi aman."
    });
  }

  const { video_ids } = req.body || {};
  if (!Array.isArray(video_ids) || video_ids.length < 1 || video_ids.length > MAX_BATCH) {
    return res.status(400).json({
      error: "Kirim 1 sampai 3 video_ids per batch."
    });
  }

  const ids = [...new Set(video_ids.map((id) => String(id).trim().toLowerCase()))];
  if (ids.length !== video_ids.length || ids.some((id) => !UUID_RE.test(id))) {
    return res.status(400).json({ error: "Daftar video_ids tidak valid atau duplikat." });
  }
  if (ids.some((id) => !approvedIds.has(id))) {
    return res.status(403).json({
      error: "Ada video yang belum masuk daftar ID migrasi aman."
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseSecret) {
    return res.status(503).json({ error: "Kredensial server Supabase belum lengkap." });
  }

  let s3;
  try {
    s3 = createDahonoClient();
  } catch (error) {
    return res.status(503).json({ error: error.message || "Konfigurasi Dahono belum lengkap." });
  }

  const adminDb = createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const results = [];
  for (const id of ids) {
    let uploadedKey = null;
    try {
      const { data: video, error: readError } = await adminDb
        .from("videos")
        .select("id, storage_path, storage_provider")
        .eq("id", id)
        .maybeSingle();

      if (readError) throw readError;
      if (!video?.storage_path) throw new Error("Video atau storage_path tidak ditemukan.");
      if (video.storage_provider !== "supabase") {
        throw new Error("Video bukan lagi sumber Supabase; dilewati.");
      }

      const ext = safeExtension(video.storage_path);
      if (!ext) throw new Error("Ekstensi file bukan format video yang didukung.");

      const { data: file, error: downloadError } = await adminDb.storage
        .from(BUCKET)
        .download(video.storage_path);
      if (downloadError) throw downloadError;
      if (!file) throw new Error("Supabase tidak mengembalikan file.");
      if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
        throw new Error("Ukuran file kosong atau melebihi batas 100 MB per video.");
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.length !== file.size) throw new Error("Ukuran hasil unduhan tidak cocok.");

      const contentType = MIME_BY_EXT[ext];
      uploadedKey = `migration/${id}/${Date.now()}.${ext}`;
      await s3.send(new PutObjectCommand({
        Bucket: process.env.DAHONO_S3_BUCKET,
        Key: uploadedKey,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable"
      }));

      const head = await s3.send(new HeadObjectCommand({
        Bucket: process.env.DAHONO_S3_BUCKET,
        Key: uploadedKey
      }));
      if (Number(head.ContentLength) !== bytes.length) {
        throw new Error("Verifikasi ukuran file di Dahono gagal.");
      }

      const { data: updated, error: updateError } = await adminDb
        .from("videos")
        .update({ storage_provider: "r2", storage_path: uploadedKey })
        .eq("id", id)
        .eq("storage_provider", "supabase")
        .eq("storage_path", video.storage_path)
        .select("id")
        .maybeSingle();

      if (updateError) throw updateError;
      if (!updated) {
        throw new Error("Referensi database berubah; file sumber tidak disentuh.");
      }

      results.push({
        id,
        status: "migrated",
        bytes: bytes.length,
        previous_storage_path: video.storage_path,
        new_storage_path: uploadedKey,
        source_deleted: false
      });
    } catch (error) {
      results.push({
        id,
        status: "failed",
        error: error?.message || "Migrasi gagal.",
        uploaded_object_retained: Boolean(uploadedKey)
      });
    }
  }

  return res.status(200).json({
    success: results.every((item) => item.status === "migrated"),
    processed: results.length,
    source_files_deleted: 0,
    results
  });
}
