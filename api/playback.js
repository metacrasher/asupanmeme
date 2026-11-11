import { createClient } from "@supabase/supabase-js";

// The URL and publishable key are public browser credentials, not secrets.
// Keeping these fallbacks here means playback does not require a service-role
// key in Vercel. Storage RLS below controls which files can be signed.
const url = process.env.SUPABASE_URL || "https://icuebwblmzbncnjlzneh.supabase.co";
const anon = process.env.SUPABASE_ANON_KEY || "sb_publishable_PDuiLlxiv-_M_A7p60kAMw_0gW_07li";

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

    // RLS on public.videos and storage.objects verifies publication and access.
    const { data: video, error: videoError } = await client
      .from("videos")
      .select("id, storage_path")
      .eq("id", video_id)
      .maybeSingle();

    if (videoError) throw videoError;
    if (!video || !video.storage_path) {
      return res.status(404).json({ error: "Video tidak tersedia atau akses membership tidak aktif." });
    }

    const { data, error } = await client.storage
      .from("media-videos")
      .createSignedUrl(video.storage_path, 90);

    if (error) throw error;
    return res.status(200).json({ url: data.signedUrl });
  } catch (error) {
    const message = error?.message || "Playback failed";
    const status = /JWT|token|auth/i.test(message) ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
