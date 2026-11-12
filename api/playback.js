import { createClient } from "@supabase/supabase-js";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const url = process.env.SUPABASE_URL || "https://icuebwblmzbncnjlzneh.supabase.co";
const anon = process.env.SUPABASE_ANON_KEY || "sb_publishable_PDuiLlxiv-_M_A7p60kAMw_0gW_07li";

function dahonoClient() {
  const { DAHONO_S3_ACCESS_KEY, DAHONO_S3_SECRET_KEY } = process.env;
  if (!DAHONO_S3_ACCESS_KEY || !DAHONO_S3_SECRET_KEY || !process.env.DAHONO_S3_BUCKET) {
    throw new Error("Konfigurasi Dahono S3 belum lengkap di Vercel.");
  }
  return new S3Client({
    region: process.env.DAHONO_S3_REGION || "us-east-1",
    endpoint: process.env.DAHONO_S3_ENDPOINT || "https://s3.dahono.com",
    forcePathStyle: true,
    credentials: { accessKeyId: DAHONO_S3_ACCESS_KEY, secretAccessKey: DAHONO_S3_SECRET_KEY }
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!url || !anon) return res.status(500).json({ error: "Playback configuration is missing." });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  try {
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: token ? { headers: { Authorization: "Bearer " + token } } : {}
    });
    const { video_id } = req.body || {};
    if (!video_id) return res.status(400).json({ error: "video_id required" });

    // RLS still controls which published video rows can be read.
    const { data: video, error: videoError } = await client
      .from("videos")
      .select("id, storage_path, storage_provider, is_exclusive, published")
      .eq("id", video_id)
      .maybeSingle();
    if (videoError) throw videoError;
    if (!video || !video.storage_path) {
      return res.status(404).json({ error: "Video tidak tersedia." });
    }

    // Unpublished submissions can only be previewed by an authenticated admin.
    if (!video.published) {
      if (!req.body?.admin_preview || !token) {
        return res.status(404).json({ error: "Video tidak tersedia." });
      }
      const { data: adminData, error: adminAuthError } = await client.auth.getUser(token);
      if (adminAuthError || !adminData?.user) {
        return res.status(401).json({ error: "Sesi login tidak valid." });
      }
      const { data: adminProfile, error: adminProfileError } = await client
        .from("profiles").select("role").eq("id", adminData.user.id).maybeSingle();
      if (adminProfileError) throw adminProfileError;
      if (adminProfile?.role !== "admin") {
        return res.status(403).json({ error: "Preview hanya tersedia untuk admin." });
      }
    }

    // Enforce exclusive membership server-side before signing an Dahono URL.
    if (video.is_exclusive) {
      if (!token) return res.status(403).json({ error: "Membership aktif diperlukan." });
      const { data: userData, error: userError } = await client.auth.getUser(token);
      if (userError || !userData?.user) return res.status(401).json({ error: "Sesi login tidak valid." });
      const { data: profile, error: profileError } = await client
        .from("profiles").select("role, subscription_status, subscription_expires_at")
        .eq("id", userData.user.id).maybeSingle();
      if (profileError) throw profileError;
      const active = profile?.subscription_status === "active" &&
        (!profile.subscription_expires_at || new Date(profile.subscription_expires_at) > new Date());
      if (profile?.role !== "admin" && !active) {
        return res.status(403).json({ error: "Membership aktif diperlukan untuk video eksklusif." });
      }
    }

    if (video.storage_provider === "r2") {
      const command = new GetObjectCommand({
        Bucket: process.env.DAHONO_S3_BUCKET,
        Key: video.storage_path
      });
      const signedUrl = await getSignedUrl(dahonoClient(), command, { expiresIn: 3600 });
      return res.status(200).json({ url: signedUrl });
    }

    // Legacy records with a missing storage_provider are treated as Supabase.
    const { data, error } = await client.storage.from("media-videos").createSignedUrl(video.storage_path, 3600);
    if (error) throw error;
    return res.status(200).json({ url: data.signedUrl });
  } catch (error) {
    const message = error?.message || "Playback failed";
    const status = /JWT|token|auth/i.test(message) ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
