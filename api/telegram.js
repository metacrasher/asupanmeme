import { createClient } from "@supabase/supabase-js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = String(process.env.TELEGRAM_ADMIN_ID || "");
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "media-videos";
const db = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null;

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || "Telegram API error");
  return j.result;
}
async function send(chat_id, text, extra={}) { return tg("sendMessage",{chat_id,text, ...extra}); }
async function session(chat_id) {
  const { data } = await db.from("telegram_bot_sessions").select("*").eq("chat_id",chat_id).maybeSingle();
  return data;
}
async function setSession(chat_id, step, data={}) {
  const { error } = await db.from("telegram_bot_sessions").upsert({chat_id,step,data,updated_at:new Date().toISOString()});
  if(error) throw error;
}
async function clearSession(chat_id) { await db.from("telegram_bot_sessions").delete().eq("chat_id",chat_id); }
async function saveVideo(msg, chat_id) {
  const fileId = msg.video?.file_id || msg.document?.file_id;
  const meta = msg.video || msg.document;
  if (!fileId || !meta?.file_name && msg.document) throw new Error("Kirim video sebagai video Telegram, bukan file dokumen.");
  const file = await tg("getFile",{file_id:fileId});
  if (file.file_size > 20*1024*1024) throw new Error("Ukuran video melewati batas unduhan Bot API 20 MB. Gunakan video di bawah 20 MB.");
  const download = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
  if (!download.ok) throw new Error("Gagal mengunduh video dari Telegram.");
  const bytes = await download.arrayBuffer();
  const ext = (file.file_path.split(".").pop() || "mp4").replace(/[^a-z0-9]/gi,"").toLowerCase();
  const path = `telegram/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: meta.mime_type || "video/mp4", upsert:false });
  if(error) throw error;
  await setSession(chat_id,"title",{storage_path:path,duration:meta.duration || null});
  await send(chat_id,"✅ Video tersimpan sementara.\n\nSekarang kirim JUDUL video.");
}
async function handleText(msg) {
  const chat_id=msg.chat.id, text=String(msg.text||"").trim();
  if(String(msg.from.id)!==ADMIN_ID) return;
  if(text==="/start" || text==="/help") {
    return send(chat_id,"ASUPANMEME ADMIN BOT\n\n/upload — unggah video dari Telegram\n/videos — daftar video\n/premium email@domain.com 30 — aktifkan premium\n/users — daftar pengguna\n/checkuser email@domain.com — cek pengguna\n/deletevideo UUID — hapus video\n/stats — statistik\n/cancel — batalkan proses");
  }
  if(text==="/cancel"){await clearSession(chat_id);return send(chat_id,"Proses dibatalkan.");}
  if(text==="/upload"){await setSession(chat_id,"video",{});return send(chat_id,"Kirim video yang ingin diunggah (maksimal 20 MB).");}
  if(text==="/videos"){
    const {data,error}=await db.from("videos").select("id,title,is_exclusive,published").order("created_at",{ascending:false}).limit(30);
    if(error) throw error;
    return send(chat_id,(data||[]).map(v=>`${v.is_exclusive?"🔒 PREMIUM":"🆓 GRATIS"} | ${v.published?"Tayang":"Draft"}\n${v.title}\nID: ${v.id}`).join("\n\n") || "Belum ada video.");
  }
  if(text.startsWith("/premium ")){
    const [,email,daysRaw]=text.split(/\s+/); const days=Number(daysRaw||30);
    if(!email || !email.includes("@") || !Number.isInteger(days) || days<1 || days>3650) return send(chat_id,"Format: /premium email@domain.com 30");
    const {data,error}=await db.rpc("telegram_grant_premium",{target_email:email,days_to_grant:days});
    if(error) throw error;
    return send(chat_id,`👑 Premium berhasil diaktifkan untuk ${email} selama ${days} hari.`);
  }
  if(text.startsWith("/checkuser ")){
    const email=text.split(/\s+/)[1]; if(!email)return send(chat_id,"Format: /checkuser email@domain.com");
    const {data,error}=await db.rpc("telegram_lookup_user",{target_email:email});
    if(error)throw error;
    return send(chat_id,data?.length ? data.map(u=>`Email: ${u.email}\nNama: ${u.display_name||"-"}\nRole: ${u.role}\nStatus: ${u.subscription_status}\nBerakhir: ${u.subscription_expires_at||"-"}\nID: ${u.id}`).join("\n\n") : "User tidak ditemukan.");
  }
  if(text==="/users"){
    const {data,error}=await db.from("profiles").select("id,display_name,role,subscription_status,subscription_expires_at").order("created_at",{ascending:false}).limit(30);
    if(error)throw error;
    return send(chat_id,(data||[]).map(u=>`${u.display_name||"Member"} | ${u.role} | ${u.subscription_status}\nID: ${u.id}`).join("\n\n") || "Belum ada user.");
  }
  if(text.startsWith("/deletevideo ")){
    const id=text.split(/\s+/)[1]; const {data:v,error}=await db.from("videos").select("id,storage_path,title").eq("id",id).maybeSingle();
    if(error)throw error;if(!v)return send(chat_id,"Video tidak ditemukan.");
    if(v.storage_path) await db.storage.from(BUCKET).remove([v.storage_path]);
    const {error:delError}=await db.from("videos").delete().eq("id",id);if(delError)throw delError;
    return send(chat_id,`Video dihapus: ${v.title}`);
  }
  if(text==="/stats"){
    const [u,v,p]=await Promise.all([db.from("profiles").select("*",{count:"exact",head:true}),db.from("videos").select("*",{count:"exact",head:true}),db.from("profiles").select("*",{count:"exact",head:true}).eq("subscription_status","active")]);
    return send(chat_id,`📊 STATISTIK ASUPANMEME\nPengguna: ${u.count||0}\nVideo: ${v.count||0}\nPremium aktif: ${p.count||0}`);
  }
  const s=await session(chat_id);
  if(!s)return send(chat_id,"Perintah tidak dikenal. Ketik /help untuk melihat menu.");
  if(s.step==="title"){
    if(text.length<2 || text.length>120)return send(chat_id,"Judul harus 2–120 karakter. Kirim ulang judul.");
    return setSession(chat_id,"description",{...s.data,title:text}).then(()=>send(chat_id,"Kirim deskripsi video (atau ketik - jika kosong)."));
  }
  if(s.step==="description"){
    return setSession(chat_id,"access",{...s.data,description:text==="-"?"":text}).then(()=>send(chat_id,"Pilih jenis video:",{reply_markup:{keyboard:[[{text:"🆓 Gratis"},{text:"🔒 Eksklusif"}]],resize_keyboard:true,one_time_keyboard:true}}));
  }
  if(s.step==="access"){
    const exclusive=text.includes("Eksklusif");
    if(!exclusive && !text.includes("Gratis"))return send(chat_id,"Pilih tombol Gratis atau Eksklusif.");
    const {error}=await db.from("videos").insert({title:s.data.title,description:s.data.description,storage_path:s.data.storage_path,duration:s.data.duration?String(Math.floor(s.data.duration/60)).padStart(2,"0")+":"+String(s.data.duration%60).padStart(2,"0"):null,is_exclusive:exclusive,published:true});
    if(error)throw error;
    await clearSession(chat_id);
    return send(chat_id,`✅ Video berhasil dipublikasikan sebagai ${exclusive?"EKSKLUSIF":"GRATIS"}.`,{reply_markup:{remove_keyboard:true}});
  }
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).send("Method not allowed");
  if(!BOT_TOKEN||!ADMIN_ID||!WEBHOOK_SECRET||!db)return res.status(500).send("Bot environment is incomplete.");
  if(req.headers["x-telegram-bot-api-secret-token"]!==WEBHOOK_SECRET)return res.status(401).send("Unauthorized");
  try{
    const update=req.body||{}, msg=update.message;
    if(!msg)return res.status(200).json({ok:true});
    if(String(msg.from?.id)!==ADMIN_ID){await send(msg.chat.id,"⛔ Kamu tidak memiliki izin admin.");return res.status(200).json({ok:true});}
    if(msg.video || msg.document?.mime_type?.startsWith("video/")){
      const s=await session(msg.chat.id);
      if(s?.step!=="video"){await send(msg.chat.id,"Ketik /upload terlebih dahulu.");return res.status(200).json({ok:true});}
      await saveVideo(msg,msg.chat.id);
    }else if(msg.text){await handleText(msg);}
    return res.status(200).json({ok:true});
  }catch(e){console.error(e);try{await send(req.body?.message?.chat?.id,"❌ Gagal: "+e.message);}catch{}return res.status(200).json({ok:true});}
}
