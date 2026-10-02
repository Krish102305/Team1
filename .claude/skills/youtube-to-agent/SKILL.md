---
name: youtube-to-agent
description: Turn a YouTube tutorial into a working Claude Code skill/agent. Watches the video two independent ways (Claude via the claude-video /watch skill, and Gemini natively), reconciles both into a spec where every claim is tagged confirmed / single-source / conflict, has the user resolve only the conflicts, then hands the spec to skill-creator. Use when the user gives a YouTube link and wants "an agent/skill that does what this video shows".
---

# YouTube → Agent

Four stages. Keep every intermediate file under `work/<slug>/` in the repo
(`slug` = the YouTube video id) so the run is auditable.

## 0. Preconditions

Check before starting, and tell the user exactly what is missing:

- `yt-dlp`, `ffmpeg`, `ffprobe`, Python 3.10+ on PATH (`pip install -U yt-dlp` if needed).
- The `watch` skill from the claude-video plugin is installed:
  ```
  claude plugin marketplace add bradautomates/claude-video
  claude plugin install watch@claude-video
  ```
  It is third-party code — confirm with the user before installing it.
- `GEMINI_API_KEY` is set (needed for stage 1b).

If the `watch` skill is unavailable, stage 1a can fall back to pulling the
transcript with `yt-dlp --write-auto-subs --skip-download` plus a handful of
frames with `ffmpeg`, but say that you did so.

## 1. Two independent viewings

Run these without letting one see the other's output.

**1a. Claude** — invoke the `watch` skill on the URL (frames + transcript).
From what you saw, write `work/<slug>/claude.md` using the extraction format
in `references/extraction-format.md`.

**1b. Gemini** — run:
```
python3 .claude/skills/youtube-to-agent/scripts/gemini_watch.py "<youtube-url>" \
  > work/<slug>/gemini.md
```
The script sends the same extraction format to Gemini, which ingests the
YouTube video natively. Override the model with `GEMINI_MODEL` if needed.

## 2. Reconcile into a spec

Compare `claude.md` and `gemini.md` item by item and write
`work/<slug>/spec.md` from `references/spec-template.md`. Tag every item:

- **confirmed** — both sources agree (wording may differ, meaning must not).
- **single-source** — only one source mentions it. Note which, with its timestamp.
- **conflict** — the sources disagree. Quote both, with timestamps.

Do not silently pick a winner on a conflict. Where possible, re-check the
disputed timestamp with `watch` (narrow time range) and record what you saw,
but leave the tag as `conflict` for the user to decide.

## 3. Human review — conflicts only

Show the user only the `conflict` items (and any `single-source` items that
are load-bearing, e.g. a command or config value the agent depends on). Ask
them to resolve each one, using AskUserQuestion when there are few enough.
Write their decisions back into `spec.md` and mark those items `resolved`.

## 4. Build the agent

Invoke `skill-creator` (`anthropic-skills:skill-creator`) with `spec.md` as
the source of truth. The new skill goes in `.claude/skills/<name>/`. Run
skill-creator's own test/eval loop, then tell the user what was built, where,
and anything from the spec that the skill could not implement.
