---
name: stream-clipper
description: Turn a long stream VOD or podcast into vertical 9:16 short clips with burned-in captions and post copy, for Whop Content Rewards (clipping) campaigns or any TikTok/Reels/Shorts posting. Use when the user hands over a long video file (or a campaign's Google Drive folder) and wants clips cut from it.
---

# Stream Clipper

Long video in → 5–10 ready-to-post vertical clips + captions out. Work in
`clips-work/<name>/` (git-ignored; videos are big). Scripts live in
`.claude/skills/stream-clipper/scripts/`.

## 0. Campaign check (before any cutting)

Ask which Whop campaign (or creator permission) this is for, and get its
rules: allowed platforms, min/max length, required tags/links, banned
content, and the CPM + budget left. If the user has no campaign, say clearly
that clipping a creator without permission earns nothing on Whop and risks
copyright strikes, then continue only if they confirm they have the rights.
Flag campaigns whose budget is mostly spent, or that ask for a fee to join.

## 1. Get the source

A local file, an upload, or a file from the campaign's Google Drive folder
(use the Google Drive connector to download). Direct YouTube/Twitch downloads
are usually blocked from cloud servers; ask the user for the file instead.

## 2. Transcribe

```
python3 .claude/skills/stream-clipper/scripts/transcribe.py <video> clips-work/<name>
```
Uses faster-whisper on CPU (`pip install faster-whisper` if missing).
`WHISPER_MODEL=base` is faster for multi-hour streams; `small` is the default.

## 3. Scout

```
python3 .claude/skills/stream-clipper/scripts/scout.py <video> clips-work/<name>
```
Read `candidates.md`: a 30-second-block transcript with 🔊 on blocks that
contain a loudness spike (yelling, laughing, crowd noise — where stream
highlights usually are).

## 4. Pick clips — this is the actual skill

Write `clips-work/<name>/clips.json`. Pick 5–10 moments, each 20–60 s
(or the campaign's limits). A good clip:
- **Hooks in the first 2 seconds.** Start on the line or reaction, not the setup. Trim dead air.
- **Is self-contained.** Someone scrolling with no context gets it.
- **Has a payoff**: punchline, reaction, reveal, argument, absurd moment.
- **Ends right after the payoff**, not on a trailing "anyway…".

Use 🔊 spikes as leads, but confirm with the transcript; loud ≠ good. Check
word timestamps in `transcript.json` to set start/end precisely. Fields:
`start`, `end` (seconds), `title` (short, for the file name), `caption`
(post text: hook line + 3–5 relevant hashtags + any campaign-required tag),
`layout` (`blur` for gameplay/wide shots where the whole frame matters,
`crop` for a face-cam/IRL shot or footage that is already 9:16), and `crop_x`
(0–1, where the subject is) for `crop`. Optional, when the brief asks for them:
`hook` (big text pinned at the top, e.g. "wait, what is this??"), `labels`
(timed on-screen name tags, source-video seconds), and `subtitles` (hand-written
captions that replace the automatic ones when the transcript mishears a line;
always check the transcript against the audio before trusting it).
Only put a name label on a segment the footage itself identifies (a title
card, the speaker saying their name, or the brief); never guess who someone is
from their face.
If unsure about framing, extract a frame
(`ffmpeg -ss <t> -i <video> -frames:v 1 frame.jpg`) and look at it.

## 5. Render

```
python3 .claude/skills/stream-clipper/scripts/render.py <video> clips-work/<name>
```
Outputs `clips/NN-title.mp4` (1080×1920, H.264/AAC, word-by-word captions
with the current word in yellow) and `posts.md` with the caption for each.

## 6. Check and hand off

Extract one frame from each clip and look at it: captions readable, subject
in frame. Fix `clips.json` and re-render any that look off. Then send the
user the clips and `posts.md`. The user posts them from their own accounts
and submits the links in the Whop campaign; do not attempt to post.
