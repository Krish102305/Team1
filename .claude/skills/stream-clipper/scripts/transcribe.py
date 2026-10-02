#!/usr/bin/env python3
"""Transcribe a video with word-level timestamps.

Usage: transcribe.py <video> <out-dir>
Writes <out-dir>/transcript.json. Model size via WHISPER_MODEL (default "small").
"""
import json
import os
import sys
from pathlib import Path

from faster_whisper import WhisperModel


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    video, out = sys.argv[1], Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)

    model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device="cpu", compute_type="int8")
    segments, info = model.transcribe(video, word_timestamps=True, vad_filter=True)

    result = {"language": info.language, "duration": info.duration, "segments": []}
    for seg in segments:
        result["segments"].append({
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
            "words": [
                {"start": round(w.start, 2), "end": round(w.end, 2), "word": w.word.strip()}
                for w in (seg.words or [])
            ],
        })
        print(f"[{seg.start:7.1f}] {seg.text.strip()}", file=sys.stderr)

    (out / "transcript.json").write_text(json.dumps(result, indent=1))
    print(f"wrote {out / 'transcript.json'} ({len(result['segments'])} segments)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
