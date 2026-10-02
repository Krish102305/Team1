#!/usr/bin/env python3
"""Have Gemini watch a YouTube video natively and extract it in the shared format.

Usage: gemini_watch.py <youtube-url>   (needs GEMINI_API_KEY; optional GEMINI_MODEL)
Writes Markdown to stdout.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
FORMAT = Path(__file__).resolve().parent.parent / "references" / "extraction-format.md"


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        print("GEMINI_API_KEY is not set", file=sys.stderr)
        return 1
    model = os.environ.get("GEMINI_MODEL", "gemini-3.1-pro-preview")

    prompt = (
        "Watch this video and extract it using exactly the format below. "
        "Include timestamps on every item and quote on-screen code verbatim.\n\n"
        + FORMAT.read_text()
    )
    body = {
        "contents": [{
            "parts": [
                {"file_data": {"file_uri": sys.argv[1]}},
                {"text": prompt},
            ]
        }]
    }
    req = urllib.request.Request(
        API.format(model=model),
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"Gemini API error {e.code}: {e.read().decode(errors='replace')}", file=sys.stderr)
        return 1

    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts)
    if not text:
        print(f"No text in response: {json.dumps(data)[:2000]}", file=sys.stderr)
        return 1
    print(f"<!-- source: gemini ({model}) -->\n{text}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
