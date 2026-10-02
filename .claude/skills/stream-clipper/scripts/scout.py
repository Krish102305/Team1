#!/usr/bin/env python3
"""Find candidate moments: loudness spikes + a timestamped, readable transcript.

Usage: scout.py <video> <out-dir>     (needs <out-dir>/transcript.json)
Writes <out-dir>/candidates.md for picking clips. Streams are long; this is
what you read instead of the raw transcript.
"""
import json
import re
import statistics
import subprocess
import sys
from pathlib import Path

WINDOW = 30  # seconds per transcript block in candidates.md


def loudness(video: str) -> list[tuple[float, float]]:
    """Momentary loudness (LUFS) every 0.1s via ffmpeg ebur128."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", video, "-vn",
         "-af", "ebur128=metadata=1,ametadata=print:key=lavfi.r128.M", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    pts, t = [], None
    for line in proc.stderr.splitlines():
        if m := re.search(r"pts_time:([\d.]+)", line):
            t = float(m.group(1))
        elif (m := re.search(r"lavfi\.r128\.M=(-?[\d.]+)", line)) and t is not None:
            if float(m.group(1)) > -70:  # skip silence
                pts.append((t, float(m.group(1))))
    return pts


def spikes(pts, top=25, gap=20.0):
    """Loudest moments relative to the stream's typical level, at least `gap` s apart."""
    if not pts:
        return []
    base = statistics.median(v for _, v in pts)
    chosen = []
    for t, v in sorted(pts, key=lambda p: p[1], reverse=True):
        if all(abs(t - c[0]) >= gap for c in chosen):
            chosen.append((t, v - base))
        if len(chosen) >= top:
            break
    return sorted(chosen)


def mmss(t: float) -> str:
    return f"{int(t // 3600):d}:{int(t % 3600 // 60):02d}:{int(t % 60):02d}"


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    video, out = sys.argv[1], Path(sys.argv[2])
    tr = json.loads((out / "transcript.json").read_text())
    peaks = spikes(loudness(video))

    lines = [f"# Candidates for {Path(video).name}", "",
             f"Duration {mmss(tr['duration'])}, language {tr['language']}.", "",
             "## Loudness spikes (dB above the stream's median)", ""]
    lines += [f"- {mmss(t)} (+{d:.1f} dB)" for t, d in peaks] or ["- none found"]
    lines += ["", "## Transcript (30 s blocks; 🔊 = block contains a spike)", ""]

    blocks: dict[int, list[str]] = {}
    for seg in tr["segments"]:
        blocks.setdefault(int(seg["start"] // WINDOW), []).append(seg["text"])
    peak_blocks = {int(t // WINDOW) for t, _ in peaks}
    for b in sorted(blocks):
        flag = " 🔊" if b in peak_blocks else ""
        lines.append(f"**{mmss(b * WINDOW)}**{flag} {' '.join(blocks[b])}")
        lines.append("")

    (out / "candidates.md").write_text("\n".join(lines))
    print(f"wrote {out / 'candidates.md'} ({len(peaks)} spikes, {len(blocks)} blocks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
