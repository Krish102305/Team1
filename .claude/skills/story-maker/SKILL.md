---
name: story-maker
description: Write original short story scripts and turn them into vertical 9:16 narrated videos (AI voice, word-by-word captions, hook text, background footage) for the AI-assisted story channel, then queue them for automatic posting. Use when the user asks for story videos, AI content, or new posts for the story channel. Not for clipping campaigns (use stream-clipper).
---

# Story maker (AI-assisted channel)

Separate from clipping: these post to the **story channel accounts**, never to
creator.chaos1 (campaign reviewers check that page).

## 1. Write the stories

Write **original** fiction in a familiar format (roommate / coworker / family /
neighbour drama, petty revenge, "I found out…"). Never copy or lightly reword
real Reddit posts or other creators' stories: that is reused content, gets
flagged, and can be someone else's copyright. No real, identifiable people.

Each story, 30–60 s narrated (≈90–160 words):
- **First sentence is the hook** (the conflict, immediately). No "So this happened…".
- One clear escalation and a **payoff/twist in the last 2 sentences**.
- Plain spoken English, short sentences (the voice reads it literally; spell out numbers if odd).

Save as JSON (see `scripts/make_story.py` docstring): `slug`, `hook` (≤8 words,
shown 3 s at the top), `script`, `title` (YouTube, ends `#shorts`), `caption`
(TikTok/IG, 2–4 hashtags).

## 2. Render

```
python3 .claude/skills/story-maker/scripts/make_story.py story.json clips-work/stories
```
Needs `pip install piper-tts faster-whisper`; the voice model downloads on first
run (~120 MB, git-ignored). Background: a random clip from
`.claude/skills/story-maker/backgrounds/*.mp4` if present — **only footage the
user owns or has a licence for** (own gameplay recordings, royalty-free stock).
Otherwise a generated gradient is used.

Check one frame per video before sending; captions centred and readable.

## 3. Queue

Same n8n intake as clipping (see `automation/n8n/README.md`), but with the story
channel's Upload-Post profile and **AI disclosure on** (`is_aigc` for TikTok,
`containsSyntheticMedia` for YouTube). Get the user's go-ahead per batch before
sending; space posts at least 3 h apart, max ~3/day per platform for a new account.
