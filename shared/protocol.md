# Capri: Inter-Process Communication Protocol

Version: `1.0.0-draft`  
Transport: **WebSocket on `127.0.0.1`**  
Serialization: **UTF-8 JSON**  
Validation: **JSON Schema (Draft-07 / 2020-12)**

---

## 1. Overview & Connection Handshake

The Capri desktop assistant operates via two separate processes communicating over a local WebSocket link:
1. **Host (Electron, WebSocket Server):** Listens on `127.0.0.1:<random_port>`.
2. **Brain (Python 3.12, WebSocket Client):** Connects to `ws://127.0.0.1:<random_port>`.

### 1.1. Security & Handshake Sequence
1. Upon spawn, Electron generates a 64-character hex cryptographic token (`CAPRI_WS_TOKEN`) and assigns a free port (`CAPRI_WS_PORT`).
2. The Python process connects to the WebSocket endpoint.
3. Immediately upon connection, the Brain MUST send a `handshake` frame:
   ```json
   {
     "type": "handshake",
     "token": "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"
   }
   ```
4. If the token matches, the Host responds with `session_start`:
   ```json
   {
     "type": "session_start",
     "version": "0.1.0",
     "active_model": "anthropic/claude-haiku-5.5"
   }
   ```
   If the token fails or no handshake is received within 3,000 ms, the connection is closed with code `4403` (Forbidden) and the socket is destroyed.
5. All incoming connections containing an `Origin` header are rejected to prevent malicious browser contexts from sending instructions.

---

## 2. Message Envelope Format

Every message on the WebSocket MUST be a JSON object containing at least:
```json
{
  "type": "<message_type_identifier>",
  "id": "<optional_uuid_or_correlation_id>",
  "timestamp": 1729987200000
}
```

---

## 3. Host → Brain Messages (Electron to Python)

### 3.1. `handshake`
Transmitted by the client immediately upon WebSocket open.
```json
{
  "type": "handshake",
  "token": "string (min 32 chars)"
}
```

### 3.2. `user_text`
Sent when the user submits a prompt in the transmission chat panel.
```json
{
  "type": "user_text",
  "text": "Open Spotify and play Daft Punk"
}
```

### 3.3. `ptt_start` & `ptt_stop`
Sent when the global Push-To-Talk hotkey is pressed and released.
```json
{
  "type": "ptt_start"
}
```
```json
{
  "type": "ptt_stop"
}
```

### 3.4. `approval_response`
Sent when the user explicitly clicks the Approve or Deny button on the approval panel.
```json
{
  "type": "approval_response",
  "id": "appr-8f3b-412e",
  "approved": true
}
```

### 3.5. `abort`
Sent when user presses `Escape`, closes the panel, or sends a new prompt during an active task.
```json
{
  "type": "abort"
}
```

### 3.6. `settings_update`
Sent when settings change via tray menu, config file, or setup panel.
```json
{
  "type": "settings_update",
  "settings": {
    "model": "anthropic/claude-haiku-5.5",
    "lang": "ru",
    "voice_enabled": true,
    "daily_budget_usd": 0.50
  }
}
```

### 3.7. `ping`
Heartbeat signal emitted by the Host every 5,000 ms.
```json
{
  "type": "ping",
  "timestamp": 1729987205000
}
```

---

## 4. Brain → Host Messages (Python to Electron)

### 4.1. `session_start`
Signals successful handshake and brain readiness.
```json
{
  "type": "session_start",
  "version": "0.1.0",
  "active_model": "anthropic/claude-haiku-5.5"
}
```

### 4.2. Voice Input Events
- `listening_start`: Microphone capture started.
  ```json
  { "type": "listening_start" }
  ```
- `listening_level`: Live volume RMS for sound wave visualization.
  ```json
  { "type": "listening_level", "level": 0.42 }
  ```
- `listening_end`: Recording finished, STT processing begins.
  ```json
  { "type": "listening_end" }
  ```
- `transcript`: Speech-to-text result.
  ```json
  {
    "type": "transcript",
    "text": "запусти спотифай",
    "is_final": true
  }
  ```

### 4.3. Thinking & Streaming Events
- `thinking_start`: LLM inference query sent.
  ```json
  { "type": "thinking_start" }
  ```
- `thinking_tick`: Periodic duration update (turns ticker violet after 15s).
  ```json
  { "type": "thinking_tick", "elapsed_sec": 16 }
  ```
- `thinking_end`: LLM finished generating stream.
  ```json
  { "type": "thinking_end" }
  ```
- `assistant_delta`: Incremental text token.
  ```json
  { "type": "assistant_delta", "text": "Врубаю" }
  ```
- `assistant_message`: Final complete response message.
  ```json
  {
    "type": "assistant_message",
    "text": "Врубаю Spotify. Сделай погромче!",
    "face": "smug",
    "badge": "TALK"
  }
  ```

### 4.4. Tool Events
- `tool_start`: Tool invoked.
  ```json
  {
    "type": "tool_start",
    "tool": "open_app",
    "target": "spotify",
    "ticker": "OPENS spotify"
  }
  ```
- `tool_end`: Tool execution completed.
  ```json
  {
    "type": "tool_end",
    "tool": "open_app",
    "ok": true
  }
  ```

### 4.5. Safety Approval Flow
- `needs_approval`: Brain pauses execution and requests explicit human click.
  Capri teleports next to cursor with bristling mane and alert sound.
  ```json
  {
    "type": "needs_approval",
    "id": "appr-8f3b-412e",
    "kind": "write_file",
    "summary": "EDITS src/config.py",
    "details": "Modifying default port parameter in configuration",
    "diff": "--- src/config.py\n+++ src/config.py\n@@ -12,3 +12,3 @@\n-PORT = 8000\n+PORT = 9000"
  }
  ```
- `approval_resolved`: Confirmation of the resolved approval.
  ```json
  {
    "type": "approval_resolved",
    "id": "appr-8f3b-412e",
    "approved": true
  }
  ```

### 4.6. TTS & Lip-Sync
- `tts_start`: Speech audio begins playing.
  ```json
  { "type": "tts_start", "sample_rate": 24000 }
  ```
- `tts_level`: Real-time audio amplitude (0.0 to 1.0) driving character mouth talking animation.
  ```json
  { "type": "tts_level", "level": 0.65 }
  ```
- `tts_end`: Speech audio concluded.
  ```json
  { "type": "tts_end" }
  ```

### 4.7. Task Completion & Mission Report
- `task_done`: Emitted at task conclusion; triggers victory animation and report panel.
  ```json
  {
    "type": "task_done",
    "actions": 4,
    "files_changed": 1,
    "duration_ms": 14200,
    "last_sentence": "Всё готово, трек играет."
  }
  ```

### 4.8. Metrics, Usage & Accounting
- `usage`: Emitted after each LLM call.
  ```json
  {
    "type": "usage",
    "tokens_in": 520,
    "tokens_out": 48,
    "cost_usd": 0.00042,
    "day_cost_usd": 0.0142
  }
  ```

### 4.9. Errors & Heartbeat
- `error`: Notifies Host of system or LLM error.
  ```json
  {
    "type": "error",
    "message": "OpenRouter API rate limit reached (429). Switched to fallback model.",
    "code": "RATE_LIMIT"
  }
  ```
- `pong`: Response to `ping`.
  ```json
  {
    "type": "pong",
    "timestamp": 1729987205010
  }
  ```
