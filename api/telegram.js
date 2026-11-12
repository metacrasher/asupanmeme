import { createClient } from "@supabase/supabase-js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createDahonoClient } from "../lib/r2.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = String(process.env.TELEGRAM_ADMIN_ID || "");
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://icuebwblmzbncnjlzneh.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "media-videos";
const db = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

async function tg(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || "Telegram API error");
  return result.result;
}
async function send(chatId, text, extra = {}) {
  return tg("sendMessage", { chat_id: chatId, text, ...extra });
}
async function session(chatId) {
  const { data, error } = await db.from("telegram_bot_sessions").select("*").eq("chat_id", chatId).maybeSingle();
  if (error) throw error;
  return data;
}
async function setSession(chatId, step, data = {}) {
  const { error } = await db.from("telegram_bot_sessions").upsert({
    chat_id: chatId, step, data, updated_at: new Date().toISOString()
  });
  if (error) throw error;
}
async function clearSession(chatId) {
  const { error } = await db.from("telegram_bot_sessions").delete().eq("chat_id", chatId);
  if (error) throw error;
}
function helpText() {
  return [
    "🎬 ASUPANMEME ADMIN BOT",
    "",
    "VIDEO",
    "/upload — unggah video dari Telegram (maks. 20 MB)",
    "/videos — daftar 30 video terbaru beserta ID",
    "/video ID premium — jadikan eksklusif",
    "/video ID free — jadikan gratis",
    "/video ID publish — tayangkan video",
    "/video ID hide — sembunyikan video",
    "/deletevideo ID — hapus video dan file medianya",
    "",
    "MEMBERSHIP",
    "/premium email 7 — aktifkan premium 7 hari",
    "/premium email 30 — aktifkan premium 30 hari",
    "/premium email lifetime — premium permanen",
    "/unpremium email — cabut premium",
    "/checkuser email — cek akun dan masa premium",
    "/users — daftar 30 pengguna terbaru",
    "",
    "LAINNYA",
    "/stats — statistik website",
    "/cancel — batalkan proses upload",
    "/help — bantuan perintah"
  ].join("\n");
}
async function saveVideo(msg, chatId) {
  const fileId = msg.video?.file_id || msg.document?.file_id;
  const meta = msg.video || msg.document;
  if (!fileId || (msg.document && !meta?.file_name)) throw new Error("Kirim video sebagai video Telegram, bukan file dokumen.");
  const file = await tg("getFile", { file_id: fileId });
  if ((file.file_size || 0) > 20 * 1024 * 1024) {
    throw new Error("Video melebihi batas unduhan Telegram Bot API 20 MB. Kirim video yang lebih kecil.");
  }
  const download = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
  if (!download.ok) throw new Error("Gagal mengunduh video dari Telegram.");
  const bytes = await download.arrayBuffer();
  const ext = (file.file_path.split(".").pop() || "mp4").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const path = `telegram/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: meta.mime_type || "video/mp4", upsert: false
  });
  if (error) throw error;
  await setSession(chatId, "title", { storage_path: path, duration: meta.duration || null });
  await send(chatId, "✅ Video tersimpan sementara.\n\nSekarang kirim JUDUL video.");
}
async function deleteMedia(video) {
  if (!video.storage_path) return;
  if (video.storage_provider === "r2") {
    await createDahonoClient().send(new DeleteObjectCommand({
      Bucket: process.env.DAHONO_S3_BUCKET,
      Key: video.storage_path
    }));
    return;
  }
  const { error } = await db.storage.from(BUCKET).remove([video.storage_path]);
  if (error) throw error;
}
async function handleText(msg) {
  const chatId = msg.chat.id;
  const text = String(msg.text || "").trim();
  const [command, ...args] = text.split(/\s+/);
  const cmd = command.split("@")[0].toLowerCase();

  if (cmd === "/start" || cmd === "/help") return send(chatId, helpText());
  if (cmd === "/cancel") {
    await clearSession(chatId);
    return send(chatId, "Proses dibatalkan.", { reply_markup: { remove_keyboard: true } });
  }
  if (cmd === "/upload") {
    await setSession(chatId, "video", {});
    return send(chatId, "Kirim video yang ingin diunggah (maksimal 20 MB).");
  }
  if (cmd === "/videos") {
    const { data, error } = await db.from("videos")
      .select("id,title,is_exclusive,published,storage_provider,created_at")
      .order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    const lines = (data || []).map(v =>
      `${v.is_exclusive ? "🔒 PREMIUM" : "🆓 GRATIS"} · ${v.published ? "TAYANG" : "DRAFT"} · ${v.storage_provider || "supabase"}\n${v.title}\nID: ${v.id}`
    );
    return send(chatId, lines.join("\n\n") || "Belum ada video.");
  }
  if (cmd === "/premium") {
    const [email, durationRaw = "30"] = args;
    const permanent = durationRaw.toLowerCase() === "lifetime" || durationRaw.toLowerCase() === "permanent";
    const days = permanent ? 0 : Number(durationRaw);
    if (!email || !email.includes("@") || !Number.isInteger(days) || days < 0 || days > 3650) {
      return send(chatId, "Format: /premium email@domain.com 7\nAtau: /premium email@domain.com lifetime");
    }
    const { error } = await db.rpc("telegram_grant_premium", { target_email: email, days_to_grant: days });
    if (error) throw error;
    return send(chatId, permanent
      ? `👑 Premium permanen berhasil diaktifkan untuk ${email}.`
      : `👑 Premium berhasil diaktifkan untuk ${email} selama ${days} hari.`);
  }
  if (cmd === "/unpremium") {
    const [email] = args;
    if (!email || !email.includes("@")) return send(chatId, "Format: /unpremium email@domain.com");
    const { error } = await db.rpc("telegram_revoke_premium", { target_email: email });
    if (error) throw error;
    return send(chatId, `✅ Premium untuk ${email} telah dicabut. Akun kembali ke akses gratis.`);
  }
  if (cmd === "/checkuser") {
    const [email] = args;
    if (!email || !email.includes("@")) return send(chatId, "Format: /checkuser email@domain.com");
    const { data, error } = await db.rpc("telegram_lookup_user", { target_email: email });
    if (error) throw error;
    return send(chatId, data?.length
      ? data.map(u => `Email: ${u.email}\nNama: ${u.display_name || "-"}\nRole: ${u.role}\nStatus: ${u.subscription_status}\nBerakhir: ${u.subscription_expires_at || (u.subscription_status === "active" ? "Permanen" : "-")}\nID: ${u.id}`).join("\n\n")
      : "User tidak ditemukan.");
  }
  if (cmd === "/users") {
    const { data, error } = await db.rpc("telegram_list_users");
    if (error) throw error;
    return send(chatId, (data || []).map(u =>
      `${u.email}\n${u.display_name || "Member"} · ${u.role}\nPremium: ${u.subscription_status} · ${u.subscription_expires_at || "-"}`
    ).join("\n\n") || "Belum ada pengguna.");
  }
  if (cmd === "/video") {
    const [id, action] = args;
    if (!id || !action || !["premium", "free", "publish", "hide"].includes(action.toLowerCase())) {
      return send(chatId, "Format: /video ID premium|free|publish|hide");
    }
    const { data: video, error: findError } = await db.from("videos").select("id,title").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!video) return send(chatId, "Video tidak ditemukan.");
    const patch = action === "premium" ? { is_exclusive: true, published: true }
      : action === "free" ? { is_exclusive: false, published: true }
      : action === "publish" ? { published: true } : { published: false };
    const { error } = await db.from("videos").update(patch).eq("id", id);
    if (error) throw error;
    return send(chatId, `✅ Status video "${video.title}" berhasil diperbarui: ${action}.`);
  }
  if (cmd === "/deletevideo") {
    const [id] = args;
    if (!id) return send(chatId, "Format: /deletevideo UUID");
    const { data: video, error } = await db.from("videos")
      .select("id,title,storage_path,storage_provider").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!video) return send(chatId, "Video tidak ditemukan.");
    await deleteMedia(video);
    const { error: deleteError } = await db.from("videos").delete().eq("id", id);
    if (deleteError) throw deleteError;
    return send(chatId, `🗑 Video dan file medianya berhasil dihapus: ${video.title}`);
  }
  if (cmd === "/stats") {
    const [users, videos, premium] = await Promise.all([
      db.from("profiles").select("*", { count: "exact", head: true }),
      db.from("videos").select("*", { count: "exact", head: true }),
      db.from("profiles").select("*", { count: "exact", head: true })
        .eq("subscription_status", "active")
    ]);
    if (users.error) throw users.error;
    if (videos.error) throw videos.error;
    if (premium.error) throw premium.error;
    return send(chatId, `📊 STATISTIK ASUPANMEME\nPengguna: ${users.count || 0}\nVideo: ${videos.count || 0}\nPremium aktif: ${premium.count || 0}`);
  }

  const current = await session(chatId);
  if (!current) return send(chatId, "Perintah tidak dikenal. Ketik /help untuk melihat menu.");
  if (current.step === "title") {
    if (text.length < 2 || text.length > 120) return send(chatId, "Judul harus 2–120 karakter. Kirim ulang judul.");
    await setSession(chatId, "description", { ...current.data, title: text });
    return send(chatId, "Kirim deskripsi video (atau ketik - jika kosong).");
  }
  if (current.step === "description") {
    await setSession(chatId, "access", { ...current.data, description: text === "-" ? "" : text });
    return send(chatId, "Pilih jenis video:", {
      reply_markup: {
        keyboard: [[{ text: "🆓 Gratis" }, { text: "🔒 Eksklusif" }]],
        resize_keyboard: true, one_time_keyboard: true
      }
    });
  }
  if (current.step === "access") {
    const exclusive = text.includes("Eksklusif");
    if (!exclusive && !text.includes("Gratis")) return send(chatId, "Pilih tombol Gratis atau Eksklusif.");
    const { error } = await db.from("videos").insert({
      title: current.data.title,
      description: current.data.description,
      storage_path: current.data.storage_path,
      storage_provider: "supabase",
      duration: current.data.duration
        ? String(Math.floor(current.data.duration / 60)).padStart(2, "0") + ":" + String(current.data.duration % 60).padStart(2, "0")
        : null,
      is_exclusive: exclusive,
      published: true
    });
    if (error) throw error;
    await clearSession(chatId);
    return send(chatId, `✅ Video berhasil dipublikasikan sebagai ${exclusive ? "EKSKLUSIF" : "GRATIS"}.`, {
      reply_markup: { remove_keyboard: true }
    });
  }
  return send(chatId, "Tahap tidak dikenal. Ketik /cancel lalu mulai lagi.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  if (!BOT_TOKEN || !ADMIN_ID || !WEBHOOK_SECRET || !db) {
    return res.status(500).send("Bot environment is incomplete.");
  }
  if (req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    return res.status(401).send("Unauthorized");
  }
  try {
    const update = req.body || {};
    const msg = update.message;
    if (!msg) return res.status(200).json({ ok: true });
    if (String(msg.from?.id) !== ADMIN_ID) {
      await send(msg.chat.id, "⛔ Kamu tidak memiliki izin admin.");
      return res.status(200).json({ ok: true });
    }
    if (msg.video || msg.document?.mime_type?.startsWith("video/")) {
      const current = await session(msg.chat.id);
      if (current?.step !== "video") {
        await send(msg.chat.id, "Ketik /upload terlebih dahulu.");
        return res.status(200).json({ ok: true });
      }
      await saveVideo(msg, msg.chat.id);
    } else if (msg.text) {
      await handleText(msg);
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("ASUPANMEME Telegram bot:", error);
    try {
      await send(req.body?.message?.chat?.id, "❌ Gagal: " + (error?.message || "Kesalahan tidak diketahui."));
    } catch {}
    return res.status(200).json({ ok: true });
  }
}
