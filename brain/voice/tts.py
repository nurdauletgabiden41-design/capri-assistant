"""Neural speech synthesis (TTS) with edge-tts and real-time lip-sync level streaming."""

import asyncio
import base64
import logging
import math
import re
from typing import Any

import edge_tts

logger = logging.getLogger("capri.brain.voice.tts")

DEFAULT_VOICE_RU = "ru-RU-SvetlanaNeural"
DEFAULT_VOICE_EN = "en-US-AnaNeural"

# Remove markdown, links, and code blocks for natural speech pronunciation
MARKDOWN_PATTERN = re.compile(r"(\*\*|__|\*|_|`|#+ )")
URL_PATTERN = re.compile(r"https?://\S+")
BRACKET_PATTERN = re.compile(r"\[([^\]]+)\]\([^\)]+\)")


def clean_text_for_speech(text: str) -> str:
    """Strips markdown syntax and URLs so speech engine reads clean conversational prose."""
    s = URL_PATTERN.sub("ссылка", text)
    s = BRACKET_PATTERN.sub(r"\1", s)
    s = MARKDOWN_PATTERN.sub("", s)
    return s.strip()


class TtsEngine:
    """Manages Edge-TTS synthesis and generates synchronized mouth lip-sync levels."""

    def __init__(self, default_voice: str = DEFAULT_VOICE_RU) -> None:
        self.default_voice = default_voice

    def detect_voice(self, text: str) -> str:
        """Selects appropriate voice based on alphabet presence."""
        has_cyrillic = bool(re.search(r"[а-яА-ЯёЁ]", text))
        return self.default_voice if has_cyrillic else DEFAULT_VOICE_EN

    async def synthesize(
        self,
        text: str,
        voice: str | None = None,
        rate: str = "+10%",
        pitch: str = "+5Hz",
    ) -> tuple[str, float]:
        """Synthesizes text into base64 MP3 data URI and estimates playback duration."""
        clean = clean_text_for_speech(text)
        if not clean:
            return "", 0.0

        v = voice or self.detect_voice(clean)
        logger.info("Synthesizing speech with voice %s: %s", v, clean[:40])

        communicate = edge_tts.Communicate(clean, v, rate=rate, pitch=pitch)
        chunks: list[bytes] = []

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])

        full_mp3 = b"".join(chunks)
        if not full_mp3:
            raise RuntimeError("TTS returned empty audio data")

        b64 = "data:audio/mp3;base64," + base64.b64encode(full_mp3).decode("ascii")
        # Approximate playback duration based on typical ~48kbps edge-tts MP3 stream
        duration = max(0.6, len(full_mp3) / 6000.0)
        return b64, duration

    async def speak(self, client: Any, text: str, voice: str | None = None) -> None:
        """Synthesizes speech and streams tts_start, tts_level, and tts_end events to Host."""
        try:
            audio_uri, duration = await self.synthesize(text, voice=voice)
            if not audio_uri:
                return

            await client.send(
                {
                    "type": "tts_start",
                    "audio": audio_uri,
                    "sample_rate": 24000,
                }
            )

            # Stream lip-sync level animation while audio plays
            fps = 15
            total_frames = int(duration * fps)
            dt = 1.0 / fps

            for i in range(total_frames):
                # Harmonic wave function simulating syllable modulation and mouth opening
                t = i * dt
                level = 0.45 + 0.35 * math.sin(t * 14.0) * math.cos(t * 6.5)
                # Occasional brief pauses between sentences
                if i % 18 in (0, 1):
                    level = 0.05

                await client.send({"type": "tts_level", "level": round(max(0.0, min(1.0, level)), 2)})
                await asyncio.sleep(dt)

            await client.send({"type": "tts_end"})

        except Exception as err:
            logger.warning("TTS speech streaming skipped or failed: %s", err)
            # Ensure Host is not stuck in tts_start state
            try:
                await client.send({"type": "tts_end"})
            except Exception:
                pass
