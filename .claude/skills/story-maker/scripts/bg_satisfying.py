#!/usr/bin/env python3
"""Render a 'satisfying' physics background: balls bouncing inside a ring,
leaving glowing trails; every wall hit spawns a new ball (up to a cap).

Usage: bg_satisfying.py <seconds> <out.mp4> [seed]
Renders at 540x960 and upscales to 1080x1920 (H.264, 30 fps, no audio).
"""
import colorsys
import math
import random
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

W, H, FPS = 540, 960, 30
CX, CY, R = W / 2, H / 2, 235
BALL, MAX_BALLS, G, FADE = 11, 45, 0.25, 0.90
MIN_SPEED, MAX_SPEED = 9.0, 20.0


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    secs, out = float(sys.argv[1]), sys.argv[2]
    rnd = random.Random(int(sys.argv[3]) if len(sys.argv) > 3 else None)
    hue0 = rnd.random()
    balls = [[CX + rnd.uniform(-40, 40), CY - 120, rnd.uniform(-4, 4), 0.0, hue0]]
    ff = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo",
                           "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-vf", "scale=1080:1920:flags=lanczos", "-c:v", "libx264", "-preset",
                           "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    canvas = np.zeros((H, W, 3), np.float32)
    for f in range(int(secs * FPS)):
        canvas *= FADE
        img = Image.fromarray(canvas.astype(np.uint8))
        d = ImageDraw.Draw(img)
        ring_hue = (hue0 + f / (FPS * 20)) % 1
        rc = tuple(int(c * 255) for c in colorsys.hsv_to_rgb(ring_hue, 0.6, 1))
        d.ellipse([CX - R - 6, CY - R - 6, CX + R + 6, CY + R + 6], outline=rc, width=4)
        spawn = []
        for b in balls:
            b[3] += G
            b[0] += b[2]
            b[1] += b[3]
            dx, dy = b[0] - CX, b[1] - CY
            dist = math.hypot(dx, dy)
            if dist > R - BALL:
                nx, ny = dx / dist, dy / dist
                dot = b[2] * nx + b[3] * ny
                b[2] -= 2 * dot * nx
                b[3] -= 2 * dot * ny
                b[0], b[1] = CX + nx * (R - BALL), CY + ny * (R - BALL)
                b[4] = (b[4] + 0.07) % 1
                if len(balls) + len(spawn) < MAX_BALLS:
                    ang = math.atan2(b[3], b[2]) + rnd.uniform(-0.9, 0.9)
                    sp = math.hypot(b[2], b[3])
                    spawn.append([b[0], b[1], math.cos(ang) * sp, math.sin(ang) * sp, (b[4] + 0.3) % 1])
                speed = math.hypot(b[2], b[3])
                if speed < MIN_SPEED:  # keep it lively: re-launch slow balls on bounce
                    b[2] *= MIN_SPEED / max(speed, 0.1)
                    b[3] *= MIN_SPEED / max(speed, 0.1)
            speed = math.hypot(b[2], b[3])
            if speed > MAX_SPEED:
                b[2] *= MAX_SPEED / speed
                b[3] *= MAX_SPEED / speed
            c = tuple(int(x * 255) for x in colorsys.hsv_to_rgb(b[4], 0.75, 1))
            d.ellipse([b[0] - BALL, b[1] - BALL, b[0] + BALL, b[1] + BALL], fill=c)
        balls.extend(spawn)
        canvas = np.asarray(img, np.float32)
        ff.stdin.write(canvas.astype(np.uint8).tobytes())
    ff.stdin.close()
    return ff.wait()


if __name__ == "__main__":
    sys.exit(main())
