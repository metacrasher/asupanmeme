# ASUPANMEME — Cloudflare R2 setup

The application now supports hybrid video storage:
- Existing rows default to `storage_provider = 'supabase'` and keep using the private `media-videos` Supabase bucket.
- New uploads use Cloudflare R2.
- Supabase remains the database, authentication, membership, thumbnail, QRIS, and payment-proof provider.

## 1. Create a private R2 bucket

In Cloudflare Dashboard:
1. Open **R2 Object Storage** and create a bucket (for example, `asupanmeme-videos`).
2. Keep the bucket private. Do not enable public access.
3. Create an R2 API token with Object Read & Write permission scoped only to this bucket.
4. Copy the Account ID, Access Key ID, and Secret Access Key. The secret is shown only once.

## 2. Configure bucket CORS

In the bucket settings, add a CORS policy. Replace the example origins with the exact production website origin and any local development origin you use:

```json
[
  {
    "AllowedOrigins": [
      "https://YOUR-ASUPANMEME-DOMAIN",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

Do not use a wildcard origin for the production bucket.

## 3. Add Vercel environment variables

In Vercel → Project → Settings → Environment Variables, add these for Production (and Preview if needed):

- `R2_ACCOUNT_ID` = Cloudflare Account ID
- `R2_ACCESS_KEY_ID` = R2 Access Key ID
- `R2_SECRET_ACCESS_KEY` = R2 Secret Access Key
- `R2_BUCKET_NAME` = exact bucket name, for example `asupanmeme-videos`

Never put these credentials in `config.js`, `index.html`, or browser JavaScript. Redeploy after adding them.

## 4. Apply the database migration

Run the SQL in `supabase/migrations/20261112_add_storage_provider.sql` in Supabase SQL Editor. This only adds a column and constraint; it does not delete or move any existing video or database row. Existing videos remain marked as Supabase.

The frontend includes a compatibility fallback so the old catalog can still load before this migration is applied. R2 uploads require the migration.

## 5. Verify before production use

1. Confirm the Vercel deployment succeeds and all four R2 environment variables are present.
2. Confirm CORS is saved on the R2 bucket.
3. Log in as an admin and upload a small MP4 to R2.
4. Confirm the new row has `storage_provider = 'r2'` and its `storage_path` is an R2 object key.
5. Play the new video, seek forward/backward, pause/resume, and test an exclusive video with both active and inactive membership.
6. Play at least one older Supabase video to confirm legacy playback still works.
7. Test delete on a test upload before deleting any real content.

## Implementation notes

- Browser uploads use short-lived presigned PUT URLs; the R2 secret never reaches the browser.
- Playback uses short-lived presigned GET URLs and checks membership before signing exclusive video URLs.
- R2 object deletion is performed by an authenticated API route; users can only delete objects under their own user-ID prefix, while admins can delete any R2 object.
- The upload form currently allows video files up to 500 MB. R2 single PUT supports files up to 5 GiB; multipart/resumable upload can be added later if needed.
- Existing Supabase videos are not automatically migrated.
