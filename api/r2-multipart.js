import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authenticate, createDahonoClient } from "../lib/r2.js";

const MAX_SIZE = 500 * 1024 * 1024;
const PART_SIZE = 10 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await authenticate(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const s3 = createDahonoClient();
  const bucket = process.env.DAHONO_S3_BUCKET;

  try {
    const body = req.body || {};
    const { action } = body;

    if (action === "create") {
      const { filename, content_type, size } = body;
      const allowed = ["video/mp4", "video/webm", "video/quicktime"];
      if (!allowed.includes(content_type)) {
        return res.status(400).json({ error: "Format video harus MP4, WEBM, atau MOV." });
      }
      if (!Number.isFinite(size) || size <= 0 || size > MAX_SIZE) {
        return res.status(400).json({ error: "Ukuran video maksimal 500 MB." });
      }

      const ext = String(filename || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
      const key = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
      const created = await s3.send(new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: content_type
      }));

      try {
        const totalParts = Math.ceil(size / PART_SIZE);
        const parts = [];
        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          const command = new UploadPartCommand({
            Bucket: bucket,
            Key: key,
            UploadId: created.UploadId,
            PartNumber: partNumber
          });
          const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
          parts.push({ partNumber, url });
        }
        return res.status(200).json({ key, uploadId: created.UploadId, parts });
      } catch (signError) {
        await s3.send(new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: created.UploadId
        })).catch(() => {});
        throw signError;
      }
    }

    if (action === "complete") {
      const { key, uploadId, parts } = body;
      if (typeof key !== "string" || !key.startsWith(auth.user.id + "/") ||
          typeof uploadId !== "string" || !Array.isArray(parts) || parts.length < 1 || parts.length > 100) {
        return res.status(400).json({ error: "Data penyelesaian upload tidak valid." });
      }
      const normalized = parts.map((part, index) => ({
        PartNumber: Number(part.PartNumber),
        ETag: String(part.ETag || "")
      }));
      if (normalized.some((part, index) =>
        part.PartNumber !== index + 1 || !part.ETag || part.ETag.length > 200)) {
        return res.status(400).json({ error: "Daftar bagian upload tidak lengkap atau tidak valid." });
      }
      const result = await s3.send(new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: normalized }
      }));
      return res.status(200).json({ success: true, etag: result.ETag || null });
    }

    if (action === "abort") {
      const { key, uploadId } = body;
      if (typeof key !== "string" || !key.startsWith(auth.user.id + "/") || typeof uploadId !== "string") {
        return res.status(400).json({ error: "Data pembatalan upload tidak valid." });
      }
      await s3.send(new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId
      }));
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Aksi multipart tidak dikenal." });
  } catch (error) {
    console.error("Dahono multipart upload:", error);
    return res.status(500).json({ error: error.message || "Proses multipart upload Dahono gagal." });
  }
}
