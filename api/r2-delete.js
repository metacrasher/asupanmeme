import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { authenticate, createDahonoClient } from "../lib/r2.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await authenticate(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const { key } = req.body || {};
    if (typeof key !== "string" || !key || key.includes("..") || key.startsWith("/")) {
      return res.status(400).json({ error: "Object key tidak valid." });
    }
    const ownsKey = key.startsWith(auth.user.id + "/");
    const isAdmin = auth.profile?.role === "admin";
    if (!ownsKey && !isAdmin) return res.status(403).json({ error: "Tidak memiliki izin menghapus file ini." });
    await createDahonoClient().send(new DeleteObjectCommand({
      Bucket: process.env.DAHONO_S3_BUCKET,
      Key: key
    }));
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Gagal menghapus objek Dahono." });
  }
}
