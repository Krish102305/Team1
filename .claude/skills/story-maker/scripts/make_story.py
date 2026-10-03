#!/usr/bin/env python3
"""Turn a written story into a vertical 9:16 narrated video with word-by-word captions.

Usage: make_story.py <story.json> <out-dir>

story.json: {"slug": "roommate-food", "hook": "MY ROOMMATE STOLE MY FOOD FOR 3 WEEKS",
             "script": "full narration text...", "title": "...", "caption": "..."}
Background: a random clip from .claude/skills/story-maker/backgrounds/*.mp4 if any
(footage you own or have a licence for), otherwise a generated animated gradient.
Writes <out-dir>/<slug>.mp4 and <out-dir>/<slug>.post.json.
"""
import json
import random
import subprocess
import sys
from pathlib import Path

from faster_whisper import WhisperModel

SKILL = Path(__file__).resolve().parent.parent
VOICE = SKILL / "voices" / "en_US-ryan-high.onnx"
VOICE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/"
W, H = 1080, 1920
WORDS_PER_CAPTION = 2

ASS_HEADER = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,DejaVu Sans,110,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,9,4,5,60,60,0,1
Style: Hook,DejaVu Sans,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,3,24,0,8,70,70,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def ts(t: float) -> str:
    t = max(t, 0)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def ensure_voice() -> None:
    VOICE.parent.mkdir(parents=True, exist_ok=True)
    for name in (VOICE.name, VOICE.name + ".json"):
        if not (VOICE.parent / name).exists():
            subprocess.run(["curl", "-sSL", "-o", str(VOICE.parent / name), VOICE_URL + name], check=True)


def narrate(text: str, wav: Path) -> float:
    ensure_voice()
    subprocess.run([sys.executable, "-m", "piper", "-m", str(VOICE), "-f", str(wav),
                    "--length-scale", "0.88", "--sentence-silence", "0.15"],
                   input=text.encode(), check=True, capture_output=True)
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(wav)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def word_times(wav: Path) -> list[dict]:
    model = WhisperModel("base", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(str(wav), word_timestamps=True)
    return [{"start": w.start, "end": w.end, "word": w.word.strip()} for s in segs for w in (s.words or [])]


def subtitles(words: list[dict], hook: str, dur: float) -> str:
    ev = [f"Dialogue: 1,{ts(0)},{ts(min(3.0, dur))},Hook,,0,0,0,,{hook.upper()}"]
    for i in range(0, len(words), WORDS_PER_CAPTION):
        g = words[i:i + WORDS_PER_CAPTION]
        end = words[i + WORDS_PER_CAPTION]["start"] if i + WORDS_PER_CAPTION < len(words) else g[-1]["end"]
        text = " ".join(w["word"] for w in g).upper()
        ev.append(f"Dialogue: 0,{ts(g[0]['start'])},{ts(max(end, g[0]['start'] + 0.1))},Cap,,0,0,0,,{text}")
    return ASS_HEADER + "\n".join(ev) + "\n"


def background_input(dur: float) -> list[str]:
    clips = sorted((SKILL / "backgrounds").glob("*.mp4"))
    if clips:
        clip = random.choice(clips)
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                              "-of", "csv=p=0", str(clip)], capture_output=True, text=True, check=True)
        start = random.uniform(0, max(float(out.stdout.strip()) - dur - 1, 0))
        return ["-stream_loop", "-1", "-ss", f"{start:.1f}", "-i", str(clip)]
    colors = random.choice([("0x1d0b3a", "0x7a1fa2", "0xff3d7f"), ("0x041e3a", "0x0e7c86", "0x38ef7d"),
                            ("0x2b0a0a", "0xb3261e", "0xffb02e")])
    return ["-f", "lavfi", "-i", f"gradients=s={W}x{H}:c0={colors[0]}:c1={colors[1]}:c2={colors[2]}"
                                 f":nb_colors=3:speed=0.015:d={dur + 1}"]


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    story = json.loads(Path(sys.argv[1]).read_text())
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    slug = story["slug"]
    wav, ass = out / f"{slug}.wav", out / f"{slug}.ass"

    dur = narrate(story["script"], wav)
    ass.write_text(subtitles(word_times(wav), story["hook"], dur))
    dst = out / f"{slug}.mp4"
    vf = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
          f"setsar=1,fps=30,ass={ass}[v]")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *background_input(dur),
                    "-i", str(wav), "-filter_complex", vf, "-map", "[v]", "-map", "1:a",
                    "-t", f"{dur + 0.3:.2f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
                    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(dst)], check=True)
    wav.unlink()
    ass.unlink()
    (out / f"{slug}.post.json").write_text(json.dumps({
        "title": story["title"], "caption": story["caption"], "file": dst.name,
        "duration": round(dur, 1), "ai_generated": True}, indent=1))
    print(f"wrote {dst} ({dur:.0f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
