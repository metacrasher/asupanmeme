const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const SETUP_KEY = process.env.TELEGRAM_WEBHOOK_SETUP_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  // Separate one-time setup key prevents exposing the webhook secret as an admin credential.
  if (!SETUP_KEY || req.headers.authorization !== `Bearer ${SETUP_KEY}`) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  if (!BOT_TOKEN || !WEBHOOK_SECRET) {
    return res.status(500).json({ ok: false, message: "Telegram environment is incomplete" });
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
      return res.status(502).json({ ok: false, message: "Telegram rejected webhook setup" });
    }
    return res.status(200).json({ ok: true, message: "Telegram webhook registered" });
  } catch (error) {
    console.error("Telegram webhook setup error:", error?.message || "Unknown error");
    return res.status(502).json({ ok: false, message: "Could not contact Telegram API" });
  }
}
