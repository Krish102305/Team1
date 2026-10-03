#!/usr/bin/env python3
"""Turn a written story into a vertical 9:16 narrated video with word-by-word captions.

Usage: make_story.py <story.json> <out-dir>

story.json: {"slug": "roommate-food", "hook": "MY ROOMMATE STOLE MY FOOD FOR 3 WEEKS",
             "script": "full narration text...", "title": "...", "caption": "...",
             "voice": "am_michael", "speed": 1.1,      (optional; Kokoro voice ids)
             "scenes": [{"n": 2, "prompt": "dark apartment hallway at night"}, ...]}
  scenes (optional): AI images matched to the story; each covers the next n sentences.
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
VOICES = SKILL / "voices"
KOKORO_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
DEFAULT_VOICE = "am_michael"
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


def narrate(text: str, wav: Path, voice: str, speed: float) -> tuple[float, list[float]]:
    """Kokoro TTS, sentence by sentence with short natural pauses."""
    import re

    import numpy as np
    import soundfile as sf
    from kokoro_onnx import Kokoro

    VOICES.mkdir(parents=True, exist_ok=True)
    for name in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
        if not (VOICES / name).exists():
            subprocess.run(["curl", "-sSL", "-o", str(VOICES / name), KOKORO_URL + name], check=True)
    k = Kokoro(str(VOICES / "kokoro-v1.0.onnx"), str(VOICES / "voices-v1.0.bin"))
    parts, sent_durs, sr = [], [], 24000
    for sent in [x.strip() for x in re.split(r"(?<=[.!?])\s+", text) if x.strip()]:
        audio, sr = k.create(sent, voice=voice, speed=speed, lang="en-us")
        pause = 0.35 if sent.endswith(("?", "!")) else 0.22
        parts += [audio, np.zeros(int(sr * pause), dtype=audio.dtype)]
        sent_durs.append(len(audio) / sr + pause)
    full = np.concatenate(parts)
    sf.write(str(wav), full, sr)
    return len(full) / sr, sent_durs


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


IMAGE_STYLE = ("cinematic still, dramatic moody lighting, shallow depth of field, "
               "photorealistic, vertical composition, no text")


def fetch_image(prompt: str, dst: Path, seed: int) -> None:
    """Free text-to-image (pollinations.ai). Its corner watermark is cropped by the zoom."""
    from urllib.parse import quote
    url = (f"https://image.pollinations.ai/prompt/{quote(prompt + ', ' + IMAGE_STYLE)}"
           f"?width=1080&height=1920&nologo=true&seed={seed}")
    import time
    for attempt, wait in enumerate((0, 5, 15, 30, 60)):
        time.sleep(wait)  # free tier rate-limits bursts
        r = subprocess.run(["curl", "-sSL", "--max-time", "180", "-o", str(dst), "-w", "%{http_code}",
                            url.replace(f"seed={seed}", f"seed={seed + attempt}")],
                           capture_output=True, text=True)
        if r.stdout.strip() == "200" and dst.exists() and dst.stat().st_size > 10_000:
            return
    raise RuntimeError(f"image generation failed for: {prompt}")


def scene_background(scenes: list[dict], sent_durs: list[float], work: Path) -> Path:
    """One AI image per scene (scene['n'] = sentences it covers), slow zoom, cut on sentence breaks."""
    counts = [max(1, int(sc.get("n", 1))) for sc in scenes]
    counts[-1] += max(0, len(sent_durs) - sum(counts))
    seg_list, i = work / "scenes.txt", 0
    lines = []
    for k, (sc, n) in enumerate(zip(scenes, counts)):
        d = sum(sent_durs[i:i + n]) + (0.6 if k == len(scenes) - 1 else 0)
        i += n
        img, seg = work / f"scene{k}.jpg", work / f"scene{k}.mp4"
        fetch_image(sc["prompt"], img, random.randint(0, 10**6))
        frames = max(1, int(d * 30))
        zoom_in = k % 2 == 0  # alternate push-in / pull-out
        z = f"1.18+0.12*on/{frames}" if zoom_in else f"1.30-0.12*on/{frames}"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", str(img),
                        "-vf", f"scale=2160:3840,zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                               f":d={frames}:s={W}x{H}:fps=30,eq=brightness=-0.06:saturation=1.1",
                        "-frames:v", str(frames), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                        "-pix_fmt", "yuv420p", str(seg)], check=True)
        lines.append(f"file '{seg.name}'")
    seg_list.write_text("\n".join(lines) + "\n")
    bg = work / "bg.mp4"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
                    "-i", str(seg_list), "-c", "copy", str(bg)], check=True)
    for k in range(len(scenes)):
        (work / f"scene{k}.jpg").unlink(missing_ok=True)
        (work / f"scene{k}.mp4").unlink(missing_ok=True)
    seg_list.unlink(missing_ok=True)
    return bg


def background_input(dur: float, work: Path) -> list[str]:
    clips = sorted((SKILL / "backgrounds").glob("*.mp4"))
    if clips:
        clip = random.choice(clips)
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                              "-of", "csv=p=0", str(clip)], capture_output=True, text=True, check=True)
        start = random.uniform(0, max(float(out.stdout.strip()) - dur - 1, 0))
        return ["-stream_loop", "-1", "-ss", f"{start:.1f}", "-i", str(clip)]
    bg = work / "bg.mp4"  # generated 'satisfying' physics animation
    subprocess.run([sys.executable, str(Path(__file__).with_name("bg_satisfying.py")),
                    f"{dur + 1:.1f}", str(bg), str(random.randint(0, 10**6))], check=True)
    return ["-i", str(bg)]


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    story = json.loads(Path(sys.argv[1]).read_text())
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    slug = story["slug"]
    wav, ass = out / f"{slug}.wav", out / f"{slug}.ass"

    dur, sent_durs = narrate(story["script"], wav, story.get("voice", DEFAULT_VOICE), story.get("speed", 1.1))
    ass.write_text(subtitles(word_times(wav), story["hook"], dur))
    if story.get("scenes"):
        bg_args = ["-i", str(scene_background(story["scenes"], sent_durs, out))]
    else:
        bg_args = background_input(dur, out)
    dst = out / f"{slug}.mp4"
    vf = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
          f"setsar=1,fps=30,ass={ass}[v]")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *bg_args,
                    "-i", str(wav), "-filter_complex", vf, "-map", "[v]", "-map", "1:a",
                    "-t", f"{dur + 0.3:.2f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
                    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(dst)], check=True)
    for tmp in (wav, ass, out / "bg.mp4"):
        tmp.unlink(missing_ok=True)
    (out / f"{slug}.post.json").write_text(json.dumps({
        "title": story["title"], "caption": story["caption"], "file": dst.name,
        "duration": round(dur, 1), "ai_generated": True}, indent=1))
    print(f"wrote {dst} ({dur:.0f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
