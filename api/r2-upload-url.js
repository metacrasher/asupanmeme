import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authenticate, createDahonoClient } from "../lib/r2.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await authenticate(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const { filename, content_type, size } = req.body || {};
    const allowed = ["video/mp4", "video/webm", "video/quicktime"];
    if (!allowed.includes(content_type)) return res.status(400).json({ error: "Format video harus MP4, WEBM, atau MOV." });
    if (!Number.isFinite(size) || size <= 0 || size > 500 * 1024 * 1024) {
      return res.status(400).json({ error: "Ukuran video maksimal 500 MB." });
    }
    const ext = String(filename || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const key = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: process.env.DAHONO_S3_BUCKET,
      Key: key,
      ContentType: content_type
    });
    const upload_url = await getSignedUrl(createDahonoClient(), command, { expiresIn: 900 });
    return res.status(200).json({ key, upload_url });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Gagal menyiapkan upload Dahono." });
  }
}
