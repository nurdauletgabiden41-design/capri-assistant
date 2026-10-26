"""Local Speech-to-Text (STT) powered by faster-whisper."""

import io
import logging
import tempfile
from pathlib import Path
from typing import Any

import av

logger = logging.getLogger("capri.brain.voice.stt")

# Compatibility patch: PyAV 14+ removed 'metadata_errors' keyword argument expected by faster-whisper
_orig_av_open = av.open


def _safe_av_open(*args: Any, **kwargs: Any) -> Any:
    kwargs.pop("metadata_errors", None)
    return _orig_av_open(*args, **kwargs)


av.open = _safe_av_open


class WhisperTranscriber:
    """Lazy-loaded faster-whisper transcriber."""

    def __init__(self, model_size: str = "tiny", device: str = "cpu", compute_type: str = "int8") -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model: Any = None

    def _ensure_model(self) -> Any:
        if self._model is None:
            logger.info("Initializing faster-whisper model '%s' on %s...", self.model_size, self.device)
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
            )
        return self._model

    def transcribe(
        self,
        audio_input: str | Path | bytes | io.BytesIO,
        language: str | None = None,
    ) -> str:
        """Transcribes audio file or audio bytes into plain text."""
        model = self._ensure_model()

        temp_path: Path | None = None
        try:
            if isinstance(audio_input, (bytes, io.BytesIO)):
                raw_bytes = audio_input.getvalue() if isinstance(audio_input, io.BytesIO) else audio_input
                suffix = ".wav" if raw_bytes.startswith(b"RIFF") else ".webm"
                with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                    tmp.write(raw_bytes)
                    temp_path = Path(tmp.name)
                source_path = str(temp_path)
            else:
                source_path = str(audio_input)

            logger.info("Transcribing audio from %s...", source_path)
            segments, info = model.transcribe(
                source_path,
                beam_size=2,
                language=language,
                vad_filter=True,
            )

            text_chunks = [segment.text.strip() for segment in segments]
            full_transcript = " ".join(text_chunks).strip()
            logger.info("Transcription completed (lang: %s, prob: %.2f): %s", info.language, info.language_probability, full_transcript)
            return full_transcript

        except Exception as err:
            logger.error("Whisper transcription error: %s", err)
            raise
        finally:
            if temp_path and temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass
