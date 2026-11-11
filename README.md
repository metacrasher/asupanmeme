# ASUPANMEME

Responsive dark video-catalog frontend with Supabase authentication, exclusive membership, proof-of-payment submission and admin review.

## Included
- Responsive homepage, popular/latest/exclusive filters, search and saved videos
- Email/password signup and login via Supabase Auth
- Premium access checked by subscription status and expiry
- Payment proof image upload to a private Supabase Storage bucket
- Admin approval/rejection through a database function with role verification
- Age confirmation UI and content-use notice
- Demo catalog when Supabase is not configured

## Setup
1. Create a Supabase project.
2. In Supabase SQL Editor, run all of `supabase/schema.sql`, then run `supabase/fix_payment_qris_status.sql` (and `supabase/fix_video_upload.sql` if you have not already run it).
3. In Storage, create a **private** bucket named `payment-proofs`.
4. Open `config.js` and set your project URL and public anon key. Never put the service_role key in frontend code.
5. Register your own account on the website. Find its user ID in Supabase Auth, then run the admin promotion SQL at the bottom of `supabase/schema.sql`, replacing the email with yours.
6. In the website, sign in as admin → Dashboard admin → QRIS pembayaran, then upload your real QRIS image. Set `payment_instructions` and `payment_account` in `site_settings` with your actual payment details.
7. Add videos in the `videos` table. Set `published=true`; set `is_exclusive=true` for subscriber-only videos. Use video hosting/storage URLs that you control and are authorized to publish.
8. Edit subscription prices in `subscription_plans` to match your actual offer.

## Deploy
This is a static site. Enable GitHub Pages for the repository root, or import the repository into Vercel and use no build command with the repository root as output directory. Add your Supabase values to `config.js` before deploying.

## Important production notes
- Supabase RLS protects database reads and payment status. Do not expose service-role credentials.
- The frontend expects video URLs in the `videos` table. For stronger media protection, use private media storage and a server-side function that issues short-lived signed playback URLs after checking membership; a public video URL can be shared outside the site.
- Admin status must only be granted manually in the database to a trusted account.
- The current proof workflow supports JPG/PNG/WEBP images up to 5 MB.
- Configure Supabase Auth email verification, password recovery, backups and rate limits before public launch.
- Use only lawful content for which you have distribution rights. The age confirmation screen is not identity or age verification.
