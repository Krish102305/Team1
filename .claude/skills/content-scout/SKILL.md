---
name: content-scout
description: Scan what's trending on TikTok, YouTube Shorts and Instagram Reels and recommend specific videos for the user's AI story channel and Whop clipping campaigns, saved as idea cards on the Command Deck dashboard. Use when a scheduled task says "content scan", or when the user asks what to post, for video ideas, or what's trending.
---

# Content scout

Two channels to feed (see `.claude/skills/story-maker` and `stream-clipper`):
- **Story channel**: original narrated stories, 45–60 s, AI disclosed.
- **Clipping** (creator.chaos1): clips of campaign footage for Whop Content Rewards.

Read `os/README.md` for the store. Read the `brain` notes with `area: "content"` and
the last 30 `ideas` (all statuses) first: ideas marked `made` or `saved` show what
the user likes; `skip` shows what they don't. Don't repeat an idea from the last 14 days.

## Scan (WebSearch, standard mode, several queries in one turn)
- Story formats trending this week on TikTok / Shorts ("storytime", "reddit stories",
  "creepy story", "plot twist story", "AI story" + this month and year).
- Trending sounds, hooks and formats for faceless channels this week.
- Whop Content Rewards: new or well-funded clipping campaigns
  (`site:whop.com content rewards` and creator/brand names in the news).
- Big creator/stream moments of the last 48 h that clipping campaigns are likely
  to want.
Open the 3–5 most useful results (WebFetch) before trusting a headline.

## Recommend 5 ideas
Each idea is something the user can make **today** with the tools in this repo:
- `channel`: `story channel` or `clipping`; `platform`: where it fits best.
- `title`: the video, not the topic ("The neighbour who mows at 3 A.M.").
- `hook`: the first spoken line, ≤ 12 words, with something wrong in it.
- `why`: one or two sentences: which trend it rides and why it adds value for the
  audience (entertainment, a twist, a useful fact). Cite the numbers you saw.
- `format`: e.g. "story, eerie-then-wholesome, 55 s" or "clip, reveal, 15 s".
- `sourceUrl` / `sourceTitle`: the page that shows the trend.
- `status: "new"`, `date`, `createdAt`; doc id `<date>-<slug>`.

Write all five with one `ArtifactData` `batch`. Rules that always apply: original
stories only (never copy a real post or creator), no real private people, clipping
only for campaigns the user has joined or has rights to; say so in `why` when an
idea needs a campaign they haven't joined yet.

Prune: delete `ideas` with `status: "skip"` older than 14 days.
Finish with one line naming the best idea.
