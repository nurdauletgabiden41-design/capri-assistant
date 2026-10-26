"""Voice subsystem coordinator for PTT, STT transcription, and TTS speech playback."""

import base64
import logging
from typing import Any

from brain.voice.stt import WhisperTranscriber
from brain.voice.tts import TtsEngine

logger = logging.getLogger("capri.brain.voice")


class VoiceManager:
    """Orchestrates Push-To-Talk state, audio transcription, and neural TTS streaming."""

    def __init__(
        self,
        tts_engine: TtsEngine | None = None,
        transcriber: WhisperTranscriber | None = None,
    ) -> None:
        self.tts = tts_engine or TtsEngine()
        self.stt = transcriber or WhisperTranscriber()
        self.is_listening = False

    async def handle_ptt_start(self, client: Any) -> None:
        """Triggered when user begins Push-To-Talk."""
        self.is_listening = True
        logger.info("PTT started: listening for speech...")
        await client.send({"type": "listening_start"})

    async def handle_ptt_stop(self, client: Any, audio_payload: str | None = None) -> str | None:
        """Triggered when user ends Push-To-Talk."""
        if not self.is_listening and not audio_payload:
            return None

        self.is_listening = False
        logger.info("PTT stopped: processing speech...")
        await client.send({"type": "listening_end"})

        if not audio_payload:
            return None

        # Decode audio data (e.g. data:audio/wav;base64,... or raw base64)
        try:
            raw_b64 = audio_payload
            if "," in raw_b64:
                raw_b64 = raw_b64.split(",", 1)[1]

            audio_bytes = base64.b64decode(raw_b64)
            if not audio_bytes:
                return None

            text = self.stt.transcribe(audio_bytes)
            if text:
                logger.info("Speech transcribed: %s", text)
                await client.send({"type": "transcript", "text": text, "is_final": True})
                return text

        except Exception as err:
            logger.error("Failed to process PTT audio: %s", err)

        return None

    async def speak(self, client: Any, text: str) -> None:
        """Speaks the text output with neural voice and streams lip-sync events."""
        await self.tts.speak(client, text)
