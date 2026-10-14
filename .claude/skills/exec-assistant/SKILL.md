---
name: exec-assistant
description: Write the user's morning brief or evening summary from Gmail, Google Drive, the dashboard's priorities/goals/missions and the repo's recent work, and post it to the Command Deck dashboard. Use when a scheduled task says "morning brief" or "evening summary", or when the user asks for a brief, a recap, or "am I on track".
---

# Executive assistant

Read `os/README.md` first: it has the dashboard URL and the store's shape.
Today's date and "now" are America/New_York.

## Gather (read-only)
1. **Store**: `settings/goals`, all `tasks`, `missions` updated in the last 24 h, and
   (evening) `brain` docs with `filed: false`.
2. **Gmail** (`mcp__Gmail__search_threads`, load with ToolSearch):
   - `in:inbox is:unread category:primary newer_than:1d`
   - `is:important newer_than:2d -category:promotions`
   - Search previews show only a thread's oldest messages: open the threads that
     matter with `get_thread` before saying anything about them.
   - Whop / Upload-Post / n8n mail (`from:whop OR from:upload-post OR from:n8n newer_than:1d`):
     campaign approvals, rejections, payouts, failed posts.
3. **Drive**: `mcp__Google_Drive__list_recent_files` pageSize 10, no snippets.
4. **Repo**: `git log --since="24 hours ago" --oneline` and the post logs in
   `campaigns/*/POSTING.md` (empty boxes = clips still to post or submit).
5. **Morning only**: if a calendar connector exists, today's events. There is none
   today; say nothing about meetings rather than guessing.

## Write
**Morning brief** (`briefs/<date>-morning`), sections in this order, 3–6 items each,
each item one line a person can act on:
- `Top 3 today`: the three things that move the goals most. Name the goal.
- `Needs a reply`: sender, what they want, by when. Skip newsletters and promos.
- `Content`: what to post today (from `ideas` with status `saved`, the posting
  sheets, the n8n queue), respecting each campaign's rules.
- `Heads-up`: deadlines, money in/out, anything that broke overnight.

**Evening summary** (`briefs/<date>-evening`):
- `Done today`: finished tasks, commits, posts, submissions, missions.
- `Still open`: unfinished priorities and why they slipped, if you can tell.
- `Goals check`: one line per goal: progress and on/off pace.
- `Tomorrow`: the first thing to do.

Set `onTrack`: `on` if the top priorities are moving and no goal is behind pace,
`at-risk` if one is, `off` if most are. `headline` = the one thing to know.

Write with `ArtifactData` `set` (it's a new doc id each run; if it exists, read it
and pass `if_version`).

## Then
- Morning: add the Top 3 as `tasks` with `source: "EA"` (skip any that already exist
  as open tasks with the same meaning).
- Evening: **file the brain inbox**. For each `brain` doc with `filed: false`, set a
  real `title`, `area`, 1–3 `tags`, tidy the `body` (keep the user's words), and
  `filed: true`. If the note is a link, add a 2–3 line summary of the page (WebFetch)
  under the user's text.
- Never email, reply, or post. If something needs a reply, it goes in `Needs a reply`
  (and you may create a Gmail **draft** only if the user's goals or a task asked for it).
- Finish with one line: the headline. The dashboard is the delivery.
