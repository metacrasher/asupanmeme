const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

export default async function handler(req, res) {
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup Telegram</title><body style="font:16px system-ui;background:#09090b;color:#fafafa;display:grid;place-items:center;min-height:90vh;margin:0"><main style="width:min(420px,88vw);background:#18181b;padding:24px;border:1px solid #333;border-radius:16px"><h2>Aktifkan Telegram Webhook</h2><p>Masukkan nilai TELEGRAM_WEBHOOK_SECRET dari Vercel. Nilai ini dikirim langsung ke website kamu dan tidak ditampilkan kembali.</p><input id="secret" type="password" autocomplete="off" placeholder="Webhook secret" style="box-sizing:border-box;width:100%;padding:13px;border-radius:8px;border:1px solid #555;background:#09090b;color:white"><button id="go" style="margin-top:12px;padding:12px 16px;border:0;border-radius:8px;background:#16a34a;color:white;font-weight:700">Pasang Webhook</button><p id="status" role="status"></p></main><script>document.getElementById('go').onclick=async()=>{const s=document.getElementById('secret').value;const out=document.getElementById('status');if(!s){out.textContent='Secret belum diisi.';return}out.textContent='Memasang webhook...';try{const r=await fetch(location.pathname,{method:'POST',headers:{Authorization:'Bearer '+s}});const j=await r.json();out.textContent=j.message||'Selesai';if(j.ok)document.getElementById('secret').value=''}catch(e){out.textContent='Gagal menghubungi server.'}}</script></body></html>`);
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  if (!WEBHOOK_SECRET || req.headers.authorization !== `Bearer ${WEBHOOK_SECRET}`) {
    return res.status(401).json({ ok: false, message: "Secret tidak cocok" });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false, message: "TELEGRAM_BOT_TOKEN belum tersedia" });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://asupanmeme.web.id/api/telegram",
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ["message"],
        drop_pending_updates: false
      })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      console.error("Telegram webhook setup failed:", result.description || response.status);
      return res.status(502).json({ ok: false, message: "Telegram menolak pendaftaran webhook. Periksa token bot di Vercel." });
    }
    return res.status(200).json({ ok: true, message: "Webhook berhasil dipasang. Silakan tes /start di Telegram." });
  } catch (error) {
    console.error("Telegram webhook setup error:", error?.message || "Unknown error");
    return res.status(502).json({ ok: false, message: "Server gagal menghubungi Telegram." });
  }
}
