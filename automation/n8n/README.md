# creator.chaos – n8n auto-poster

## What exists in n8n already
- Data table **`creator_chaos_post_queue`** (id `9QnDewplY6xoxrtX`, personal project).
  Columns: `campaign, clip_name, platform, drive_file_id, title, description,
  publish_at, status, post_url, error`. One row = one post. `status` is
  `queued` → `posted` (or `failed`, with the reason in `error`).

## Workflow (created 2026-10-03, not yet active – id `4M8dsXMG5HWcVHMp`)
**creator.chaos – Auto-post YouTube Shorts**, every 30 min (rows with `campaign = TEST` upload as unlisted):
1. Read rows where `status = queued` and `platform = youtube`, oldest `publish_at` first.
2. Keep only rows whose `publish_at` has passed; take **one** per run (keeps posts spaced).
3. Download the clip from Google Drive (`drive_file_id`).
4. Upload to YouTube as a **public** Short (Entertainment, not made for kids).
5. Save `https://youtube.com/shorts/<id>` to the row and email you the link to submit on Whop.
6. If the upload fails, mark the row `failed` with the error instead of retrying forever.

## Not automated (and why)
- **TikTok** – TikTok's posting API keeps posts private until TikTok audits your app. Use TikTok Studio's scheduler.
- **Instagram** – possible later via the Instagram Graph API; needs a Creator account linked to a Facebook Page and a public video URL.
- **Whop submission** – tested 2026-10-03 with a user OAuth app (`oauth:token_exchange` + `bounty:*` scopes). Login works, but `GET /bounty_submissions` returns 0 items despite real Content Rewards submissions, and `GET /bounties` rejects user tokens ("Apps may not make requests for users"). Content Rewards campaigns are not exposed through the bounties API, so auto-submit is not possible; the email gives you the link to paste.
- **YouTube "paid promotion" box** – not settable through the API; tick it in YouTube Studio.

## Accounts to connect in n8n (Credentials → Add)
- YouTube OAuth2, Google Drive OAuth2, Gmail OAuth2 – sign in with the Google account that owns the **creator.chaos** channel.

## Clip intake (created 2026-10-03 – id `irCTwo3a0cbRffKz`)
**creator.chaos – Clip intake**: a webhook Claude POSTs each rendered clip to
(multipart file + `campaign, clip_name, title, description, publish_at`). It saves
the file to Google Drive and adds a `queued` row to `creator_chaos_post_queue`.
Requests must carry the `x-cc-key` header (kept out of this repo). Needs to be
switched on (Publish) in n8n before it accepts uploads.
