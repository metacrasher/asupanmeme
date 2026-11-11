import { createClient } from "@supabase/supabase-js";
import { S3Client } from "@aws-sdk/client-s3";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://icuebwblmzbncnjlzneh.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_PDuiLlxiv-_M_A7p60kAMw_0gW_07li";

export function createDahonoClient() {
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

export async function authenticate(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Silakan login terlebih dahulu.", status: 401 };
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { error: "Sesi login tidak valid.", status: 401 };
  const { data: profile, error: profileError } = await client
    .from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profileError) return { error: profileError.message, status: 500 };
  return { client, user: data.user, profile, token };
}
