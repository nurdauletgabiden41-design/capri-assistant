"""Unit and integration tests for Stage 7 Voice (PTT, STT, Neural TTS, and Lip-Sync)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brain.voice.manager import VoiceManager
from brain.voice.stt import WhisperTranscriber
from brain.voice.tts import TtsEngine, clean_text_for_speech


def test_clean_text_for_speech():
    raw = "Привет! Посмотри на **код** в `main.py` и перейди по https://example.com"
    cleaned = clean_text_for_speech(raw)
    assert "**" not in cleaned
    assert "`" not in cleaned
    assert "https://" not in cleaned
    assert "ссылка" in cleaned


def test_detect_voice():
    tts = TtsEngine()
    assert tts.detect_voice("Привет, Капри!") == "ru-RU-SvetlanaNeural"
    assert tts.detect_voice("Hello, world!") == "en-US-AnaNeural"


@pytest.mark.asyncio
async def test_tts_engine_synthesize_mocked():
    tts = TtsEngine()

    mock_chunk = {"type": "audio", "data": b"FAKE_MP3_DATA_1234567890"}

    async def mock_stream(_self):
        yield mock_chunk

    with patch("edge_tts.Communicate.stream", side_effect=mock_stream, autospec=True):
        b64_uri, duration = await tts.synthesize("Привет!")
        assert b64_uri.startswith("data:audio/mp3;base64,")
        assert duration > 0


@pytest.mark.asyncio
async def test_tts_engine_speak_streaming():
    tts = TtsEngine()
    mock_client = AsyncMock()

    with patch.object(tts, "synthesize", return_value=("data:audio/mp3;base64,AAAA", 0.2)):
        await tts.speak(mock_client, "Тест")

    sent_types = [call.args[0]["type"] for call in mock_client.send.call_args_list]
    assert "tts_start" in sent_types
    assert "tts_level" in sent_types
    assert "tts_end" in sent_types


def test_whisper_transcriber_mocked():
    transcriber = WhisperTranscriber()
    mock_model = MagicMock()
    mock_segment = MagicMock()
    mock_segment.text = "запусти калькулятор"
    mock_info = MagicMock()
    mock_info.language = "ru"
    mock_info.language_probability = 0.98

    mock_model.transcribe.return_value = ([mock_segment], mock_info)
    transcriber._model = mock_model

    result = transcriber.transcribe(b"FAKE_WAV_HEADER_AND_SAMPLES")
    assert result == "запусти калькулятор"


@pytest.mark.asyncio
async def test_voice_manager_ptt_lifecycle():
    mock_tts = AsyncMock()
    mock_stt = MagicMock()
    mock_stt.transcribe.return_value = "открой браузер"

    vm = VoiceManager(tts_engine=mock_tts, transcriber=mock_stt)
    mock_client = AsyncMock()

    # 1. PTT Start
    await vm.handle_ptt_start(mock_client)
    assert vm.is_listening is True
    mock_client.send.assert_called_with({"type": "listening_start"})

    # 2. PTT Stop with base64 audio payload
    mock_client.send.reset_mock()
    fake_b64_audio = "data:audio/wav;base64,UklGRgAAAABXQVZFZm10"
    transcribed = await vm.handle_ptt_stop(mock_client, audio_payload=fake_b64_audio)

    assert transcribed == "открой браузер"
    assert vm.is_listening is False

    sent_events = [c.args[0]["type"] for c in mock_client.send.call_args_list]
    assert "listening_end" in sent_events
    assert "transcript" in sent_events
