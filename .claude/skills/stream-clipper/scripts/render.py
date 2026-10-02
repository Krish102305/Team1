#!/usr/bin/env python3
"""Render picked clips as vertical 9:16 videos with burned-in captions.

Usage: render.py <video> <out-dir>   (needs transcript.json and clips.json in out-dir)

clips.json: [{"start": 754.2, "end": 791.0, "title": "...", "caption": "...",
              "layout": "blur" | "crop", "crop_x": 0.5,
              "hook": "WAIT, WHAT IS THIS??",
              "labels": [{"start": 760.0, "end": 763.5, "text": "NEON"}],
              "subtitles": [{"start": 755.0, "end": 757.0, "text": "..."}]}]
  layout "blur" (default): whole frame centered over a blurred, zoomed copy.
  layout "crop": fill the frame; crop_x (0-1) picks the horizontal focus.
  hook (optional): big text pinned near the top for the whole clip.
  labels (optional): on-screen name tags, timed in source-video seconds.
  subtitles (optional): hand-written captions (source seconds) that replace the
    automatic word captions, for when the transcript is wrong.
Writes <out-dir>/clips/NN-<slug>.mp4 and <out-dir>/posts.md.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

W, H = 1080, 1920
WORDS_PER_CAPTION = 3

ASS_HEADER = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,DejaVu Sans,86,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,3,2,60,60,560,1
Style: Hook,DejaVu Sans,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,3,24,0,8,70,70,230,1
Style: Label,DejaVu Sans,96,&H0000FFFF,&H0000FFFF,&H00000000,&H64000000,-1,0,0,0,100,100,2,0,1,8,4,2,60,60,880,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def ts(t: float) -> str:
    t = max(t, 0)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def overlays(clip, start, end) -> list[str]:
    """Hook text for the whole clip, plus timed name labels in the lower third."""
    events = []
    if clip.get("hook"):
        events.append(f"Dialogue: 1,{ts(0)},{ts(end - start)},Hook,,0,0,0,,{clip['hook'].upper()}")
    for lb in clip.get("labels", []):
        t0, t1 = max(lb["start"], start) - start, min(lb["end"], end) - start
        if t1 > t0:
            events.append(f"Dialogue: 2,{ts(t0)},{ts(t1)},Label,,0,0,0,,{lb['text'].upper()}")
    return events


def captions(words, start, end, margin_v, clip) -> str:
    """Group words into short, punchy caption lines; current word highlighted yellow."""
    events = overlays(clip, start, end)
    if "subtitles" in clip:
        for sb in clip["subtitles"]:
            t0, t1 = max(sb["start"], start) - start, min(sb["end"], end) - start
            if t1 > t0:
                events.append(f"Dialogue: 0,{ts(t0)},{ts(t1)},Cap,,0,0,{margin_v},,{sb['text'].upper()}")
        return ASS_HEADER + "\n".join(events) + "\n"
    ws = [w for w in words if w["end"] > start and w["start"] < end and w["word"]]
    for i in range(0, len(ws), WORDS_PER_CAPTION):
        group = ws[i:i + WORDS_PER_CAPTION]
        for j, w in enumerate(group):
            text = " ".join(
                ("{\\c&H00FFFF&}" + g["word"].upper() + "{\\c&HFFFFFF&}") if k == j else g["word"].upper()
                for k, g in enumerate(group)
            )
            t0 = w["start"] - start
            t1 = (group[j + 1]["start"] if j + 1 < len(group) else w["end"]) - start
            events.append(f"Dialogue: 0,{ts(t0)},{ts(max(t1, t0 + 0.05))},Cap,,0,0,{margin_v},,{text}")
    return ASS_HEADER + "\n".join(events) + "\n"


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40] or "clip"


def video_filter(clip) -> str:
    if clip.get("layout", "blur") == "crop":
        x = min(max(float(clip.get("crop_x", 0.5)), 0.0), 1.0)
        return (f"scale=-2:{H},crop={W}:{H}:'(iw-{W})*{x}':0,setsar=1")
    return (f"split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H},boxblur=30:5[bg];[b]scale={W}:-2[fg];"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1")


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    video, out = sys.argv[1], Path(sys.argv[2])
    tr = json.loads((out / "transcript.json").read_text())
    clips = json.loads((out / "clips.json").read_text())
    words = [w for s in tr["segments"] for w in s["words"]]
    (out / "clips").mkdir(exist_ok=True)

    posts = ["# Clips and post copy", ""]
    for n, clip in enumerate(clips, 1):
        start, end = float(clip["start"]), float(clip["end"])
        name = f"{n:02d}-{slug(clip.get('title', ''))}"
        ass = out / "clips" / f"{name}.ass"
        # blur: sit in the blurred band under the video; crop: lower third
        margin_v = 380 if clip.get("layout", "blur") == "blur" else 560
        ass.write_text(captions(words, start, end, margin_v, clip))
        dst = out / "clips" / f"{name}.mp4"
        vf = f"{video_filter(clip)},ass={ass}"
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
               "-ss", f"{start}", "-to", f"{end}", "-i", video,
               "-filter_complex", f"[0:v]{vf}[v]", "-map", "[v]", "-map", "0:a?",
               "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
               "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(dst)]
        subprocess.run(cmd, check=True)
        ass.unlink()
        print(f"rendered {dst} ({end - start:.0f}s)")
        posts += [f"## {n:02d}. {clip.get('title', '')}", "",
                  f"- File: `clips/{dst.name}`",
                  f"- Source: {start:.1f}s – {end:.1f}s ({end - start:.0f}s)",
                  f"- Caption: {clip.get('caption', '')}", ""]

    (out / "posts.md").write_text("\n".join(posts))
    print(f"wrote {out / 'posts.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
