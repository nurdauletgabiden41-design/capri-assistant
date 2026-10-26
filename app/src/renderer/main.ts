// Adapted from mochiiwuff/capri-desktop (MIT)

import { VoiceSynth } from './audio/VoiceSynth';
import { CapriController, WindowData } from './character/CapriController';
import { Chip } from './character/Chip';
import { getDemoSteps } from './demo/demoSequence';
import { FxLayer } from './fx/FxLayer';

declare global {
  interface Window {
    host: {
      onBrainEvent: (cb: (msg: any) => void) => () => void;
      onCommand: (cb: (cmd: any) => void) => () => void;
      onDemoStart: (cb: () => void) => () => void;
      onResize: (cb: (d: any) => void) => () => void;
      onCursorPoll: (cb: (pos: any) => void) => () => void;
      onConfigChanged: (cb: (cfg: any) => void) => () => void;
      onWindowUpdate: (cb: (data: WindowData) => void) => () => void;
      setInteractive: (on: boolean) => void;
      setNearTarget: (near: boolean) => void;
      setFocus: (on: boolean) => void;
      rearm: () => void;
      getCursor: () => Promise<{ x: number; y: number; inside: boolean }>;
      sendToBrain: (msg: any) => void;
      getConfig: () => Promise<any>;
      setConfig: (patch: any) => Promise<any>;
      getCustomSounds?: () => Promise<{ name: string; buffer: string }[]>;
      quit: () => void;
      triggerDemo: () => void;
    };
  }
}

const host = window.host;

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function makeFallbackTexture(): HTMLCanvasElement {
  const w = 240;
  const h = 420;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  // Spiked hot red mane
  ctx.fillStyle = '#ff2152';
  ctx.beginPath();
  ctx.moveTo(116, 30);
  ctx.lineTo(195, 75);
  ctx.lineTo(215, 155);
  ctx.lineTo(175, 235);
  ctx.lineTo(135, 265);
  ctx.lineTo(110, 265);
  ctx.lineTo(75, 235);
  ctx.lineTo(35, 155);
  ctx.lineTo(55, 75);
  ctx.closePath();
  ctx.fill();

  // Green mask
  ctx.fillStyle = '#36ff7a';
  ctx.beginPath();
  ctx.moveTo(92, 105);
  ctx.lineTo(152, 105);
  ctx.lineTo(146, 168);
  ctx.lineTo(94, 168);
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#14101c';
  ctx.fillRect(102, 122, 14, 10);
  ctx.fillRect(130, 122, 14, 10);
  ctx.fillStyle = '#3d6bff';
  ctx.fillRect(105, 124, 7, 6);
  ctx.fillRect(133, 124, 7, 6);

  // Torso & legs
  ctx.fillStyle = '#14101c';
  ctx.fillRect(106, 195, 30, 85);
  ctx.fillStyle = '#36ff7a';
  ctx.fillRect(99, 280, 15, 125);
  ctx.fillRect(128, 280, 15, 125);

  return c;
}

async function bootstrap() {
  const capriEl = document.getElementById('capri') as HTMLDivElement;
  const canvasEl = document.getElementById('sprite') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx') as HTMLCanvasElement;
  const chipCanvas = document.getElementById('chip') as HTMLCanvasElement;

  const panelEl = document.getElementById('panel') as HTMLDivElement;
  const panelText = document.getElementById('panel-text') as HTMLParagraphElement;
  const panelBadge = panelEl.querySelector('.panel__badge') as HTMLSpanElement;
  const panelFace = document.getElementById('face-img') as HTMLImageElement;
  const panelActions = document.getElementById('panel-actions') as HTMLDivElement;
  const panelClose = document.getElementById('panel-close') as HTMLButtonElement;
  const chatForm = document.getElementById('chat-form') as HTMLFormElement;
  const chatInput = document.getElementById('chat-input') as HTMLInputElement;
  const tickerEl = document.getElementById('ticker') as HTMLDivElement;
  const tickerVerb = tickerEl.querySelector('.ticker__verb') as HTMLSpanElement;
  const tickerTarget = tickerEl.querySelector('.ticker__target') as HTMLSpanElement;
  const offlineBanner = document.getElementById('offline-banner') as HTMLDivElement;
  const contextMenu = document.getElementById('context-menu') as HTMLDivElement;
  const btnPtt = document.getElementById('btn-ptt') as HTMLButtonElement | null;
  const panelWave = document.getElementById('panel-wave') as HTMLDivElement | null;
  const waveBars = panelWave?.querySelectorAll('.panel__wave-bar') as NodeListOf<HTMLDivElement> | null;

  let currentAudio: HTMLAudioElement | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];

  // 1. Initialize FX & Chip
  const fx = new FxLayer(fxCanvas);
  const chip = new Chip(chipCanvas);
  chip.place(window.innerWidth, window.innerHeight);

  // 2. Initialize Web Audio Synthesizer & Sound Overrides
  const voice = new VoiceSynth();
  const cfg = await host.getConfig();
  voice.configure({ muted: cfg.muted, volume: cfg.volume });

  try {
    const customs = (await host.getCustomSounds?.()) || [];
    for (const item of customs) {
      const binary = atob(item.buffer);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      await voice.loadCustomSound(item.name, bytes.buffer);
    }
  } catch (err) {
    console.warn('[main] Could not load custom sounds:', err);
  }

  // Load cut-in assets
  const cutinNames = ['grin', 'laugh', 'eyes', 'many', 'look'];
  for (const name of cutinNames) {
    fx.loadCutin(name, `../assets/capri/cutin-${name}.png`);
  }

  // 3. Load character sprite texture (or graceful fallback)
  const spriteImg = await loadImage('../assets/capri/capri-full.png');
  const textureSource: TexImageSource = spriteImg || makeFallbackTexture();

  // 4. Initialize WebGL Capri Controller
  const capri = new CapriController(capriEl, canvasEl, textureSource, fx, voice);

  capri.setScale(cfg.scale || 0.6);
  capri.wander = cfg.wander ?? true;

  // Position Capri in bottom-right corner
  capri.pos = {
    x: window.innerWidth - 220,
    y: window.innerHeight - 20,
  };
  capri.place();

  function updatePanelPosition() {
    if (!panelEl.hidden) {
      const panelX = Math.max(20, Math.min(window.innerWidth - 340, capri.pos.x - 340));
      const panelY = Math.max(40, capri.pos.y - 320);
      panelEl.style.left = `${panelX}px`;
      panelEl.style.top = `${panelY}px`;
    }
    if (!tickerEl.hidden) {
      tickerEl.style.left = `${Math.round(capri.pos.x - 40)}px`;
      tickerEl.style.top = `${Math.round(capri.pos.y - 420 * capri.scale - 20)}px`;
    }
  }

  capri.onMove = () => updatePanelPosition();

  // Typewriter Scramble Decode Animation
  const NOISE = '░▒▓█▄▀#%&/\\<>01XZ';
  let decodeTimer: any = null;

  function decodeText(text: string, onChar?: () => void) {
    clearInterval(decodeTimer);
    const chars = [...text];
    let done = 0;

    const step = () => {
      done = Math.min(chars.length, done + 2);
      const head = chars.slice(0, done).join('');
      let tail = '';
      for (let i = done; i < Math.min(chars.length, done + 6); i++) {
        tail +=
          chars[i] === ' ' || chars[i] === '\n'
            ? chars[i]
            : NOISE[Math.floor(Math.random() * NOISE.length)];
      }
      panelText.textContent = head + tail;
      onChar?.();

      if (done >= chars.length) {
        clearInterval(decodeTimer);
        panelText.textContent = text;
      }
    };

    step();
    decodeTimer = setInterval(step, 24);
  }

  // Speech bubble notification line
  capri.onSpeakLine = (line: string) => {
    panelEl.hidden = false;
    panelBadge.textContent = 'CAPRI';
    panelBadge.className = 'panel__badge';
    decodeText(line, () => voice.play('blip'));
    setFace('smug');
    updatePanelPosition();
  };

  // Face switching with glitch effect
  const FACES = ['calm', 'aside', 'smug', 'wide', 'look', 'laugh', 'many', 'grin'];
  function setFace(faceName: string) {
    const valid = FACES.includes(faceName) ? faceName : 'smug';
    panelFace.classList.add('is-swapping');
    panelFace.src = `../assets/capri/face-${valid}.png`;
    panelFace.onerror = () => {
      panelFace.src = '../assets/capri/capri-face.png';
    };
    setTimeout(() => panelFace.classList.remove('is-swapping'), 150);
  }
  setFace('smug');

  // Interactive Click-Through Logic
  let isInteractive = false;
  let mousePos: { x: number; y: number } | null = null;

  function refreshHitTest(x: number, y: number) {
    if (capri.isDragging) {
      setInteractive(true);
      return;
    }

    let onPanel = false;
    if (!panelEl.hidden) {
      const r = panelEl.getBoundingClientRect();
      onPanel = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    let onMenu = false;
    if (!contextMenu.hidden) {
      const r = contextMenu.getBoundingClientRect();
      onMenu = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    const onChip = chip.contains(x, y);
    const onCapri = capri.hitTest(x, y);

    const hit = onPanel || onMenu || onChip || onCapri;
    setInteractive(hit);

    // Adaptive polling: 30 Hz when near, 5 Hz when far
    const dist = Math.hypot(x - capri.pos.x, y - (capri.pos.y - 200));
    host.setNearTarget(dist < 260 || onPanel || onMenu || onChip);
  }

  function setInteractive(on: boolean) {
    if (isInteractive === on) return;
    isInteractive = on;
    host.setInteractive(on);
  }

  function openContextMenu(x: number, y: number) {
    const w = 210;
    const h = 240;
    const posX = Math.min(x, window.innerWidth - w - 10);
    const posY = Math.min(y, window.innerHeight - h - 10);

    contextMenu.style.left = `${posX}px`;
    contextMenu.style.top = `${posY}px`;
    contextMenu.hidden = false;
    voice.play('tick');
    setInteractive(true);
  }

  function closeContextMenu() {
    contextMenu.hidden = true;
    if (mousePos) refreshHitTest(mousePos.x, mousePos.y);
  }

  // Pointer drag and click tracking
  let mouseDownPos: { x: number; y: number } | null = null;
  let lastClickTime = 0;
  let dragOffset = { x: 0, y: 0 };

  window.addEventListener('mousemove', (e) => {
    mousePos = { x: e.clientX, y: e.clientY };

    if (mouseDownPos && !capri.isDragging) {
      const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
      if (dist > 6) {
        capri.isDragging = true;
        dragOffset = {
          x: capri.pos.x - mouseDownPos.x,
          y: capri.pos.y - mouseDownPos.y,
        };
        closeContextMenu();
        setInteractive(true);
      }
    }

    if (capri.isDragging) {
      capri.pos = {
        x: Math.max(40, Math.min(window.innerWidth - 40, e.clientX + dragOffset.x)),
        y: Math.max(100, Math.min(capri.floor, e.clientY + dragOffset.y)),
      };
      capri.place();
      return;
    }

    // Notice cursor (head cocks, lightning zap, peek shy escape)
    capri.notice(e.clientX, e.clientY);
    refreshHitTest(e.clientX, e.clientY);
  });

  window.addEventListener('mouseleave', () => {
    mousePos = null;
    if (!capri.isDragging) {
      setInteractive(false);
      host.setNearTarget(false);
    }
  });

  host.onCursorPoll((pos) => {
    if (pos.inside && !capri.isDragging) {
      mousePos = { x: pos.x, y: pos.y };
      refreshHitTest(pos.x, pos.y);
    }
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      if (!contextMenu.hidden) {
        const r = contextMenu.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
          closeContextMenu();
        }
      }

      if (capri.hitTest(e.clientX, e.clientY)) {
        mouseDownPos = { x: e.clientX, y: e.clientY };
      }

      if (chip.contains(e.clientX, e.clientY)) {
        // Clicked biochip: restore Capri
        chip.hide();
        capri.unstow();
        voice.play('rise');
        host.setConfig({ visible: true });
      }
    }
  });

  window.addEventListener('contextmenu', (e) => {
    if (capri.hitTest(e.clientX, e.clientY)) {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY);
    } else if (!contextMenu.hidden) {
      closeContextMenu();
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      if (capri.isDragging) {
        capri.isDragging = false;
        capri.drop();
      } else if (mouseDownPos && capri.hitTest(e.clientX, e.clientY)) {
        // Click handling
        const now = performance.now();
        if (now - lastClickTime < 350) {
          // Double click
          capri.doubleClick();
          lastClickTime = 0;
        } else {
          lastClickTime = now;
          setTimeout(() => {
            if (lastClickTime === now) {
              // Single click action: speak status and show "Поговорим?"
              panelEl.hidden = false;
              panelBadge.textContent = 'CAPRI';
              panelBadge.className = 'panel__badge';

              if (capri.mode === 'offline') {
                decodeText('Конструкт оффлайн. Мозг не отвечает.', () => voice.play('blip'));
                setFace('laugh');
              } else if (capri.mode === 'work') {
                decodeText('Работаю над задачей, не отвлекай~', () => voice.play('blip'));
                setFace('aside');
              } else {
                decodeText(
                  'Привет! Чем займёмся? Могу открыть сайты, запустить тесты или поработать с файлами.',
                  () => voice.play('blip')
                );
                setFace('smug');
                panelActions.hidden = false;
                panelActions.innerHTML = `<button class="btn" id="btn-talk">ПОГОВОРИМ?</button>`;
                document.getElementById('btn-talk')?.addEventListener('click', () => {
                  panelActions.hidden = true;
                  chatInput.focus();
                });
              }
              updatePanelPosition();
            }
          }, 240);
        }
      }
      mouseDownPos = null;
      if (mousePos) refreshHitTest(mousePos.x, mousePos.y);
    }
  });

  // Context Menu Item Actions
  contextMenu.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
    if (!item) return;
    const action = item.getAttribute('data-action');
    closeContextMenu();

    if (action === 'stow') {
      voice.play('teleport-out');
      capri.stow();
      chip.show();
      host.setConfig({ visible: false });
    } else if (action === 'sleep') {
      voice.play('star');
      capri.setStance('sleep');
      capri.isSleeping = true;
    } else if (action === 'dance') {
      voice.play('rise');
      capri.playAct('victory');
      fx.showCutin('grin', 900);
    } else if (action === 'talk') {
      voice.play('hello');
      panelEl.hidden = false;
      chatInput.focus();
    } else if (action === 'settings') {
      voice.play('tick');
      panelEl.hidden = false;
      decodeText('Конфигурация Capri: %APPDATA%\\Capri\\config.json', () => voice.play('blip'));
      setFace('look');
      updatePanelPosition();
    } else if (action === 'quit') {
      host.quit();
    }
  });

  // Focus management
  chatInput.addEventListener('focus', () => host.setFocus(true));
  chatInput.addEventListener('blur', () => host.setFocus(false));
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      chatInput.blur();
      panelEl.hidden = true;
      host.setFocus(false);
    }
  });

  panelClose.addEventListener('click', () => {
    panelEl.hidden = true;
    host.setFocus(false);
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';

    panelText.textContent = 'Обрабатываю...';
    setFace('calm');
    capri.playAct('talk');
    voice.play('tick');
    host.sendToBrain({ type: 'user_text', text });
  });

  // Push-To-Talk Button Handler
  if (btnPtt) {
    const startPtt = async () => {
      btnPtt.classList.add('is-recording');
      host.sendToBrain({ type: 'ptt_start' });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunks.push(ev.data);
        };
        mediaRecorder.start(100);
      } catch (err) {
        console.warn('[renderer] Microphone access unavailable, continuing with protocol PTT:', err);
      }
    };

    const stopPtt = () => {
      if (!btnPtt.classList.contains('is-recording')) return;
      btnPtt.classList.remove('is-recording');
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = reader.result as string;
            host.sendToBrain({ type: 'ptt_stop', audio: base64Audio });
          };
          reader.readAsDataURL(blob);
        };
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
        mediaRecorder = null;
      } else {
        host.sendToBrain({ type: 'ptt_stop' });
      }
    };

    btnPtt.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startPtt();
    });
    window.addEventListener('mouseup', () => stopPtt());
  }

  // Host Commands (e.g. from tray or hotkey)
  host.onCommand((cmd) => {
    if (cmd.name === 'stow') {
      if (cmd.on) {
        voice.play('teleport-out');
        capri.stow();
        chip.show();
      } else {
        voice.play('rise');
        chip.hide();
        capri.unstow();
      }
    } else if (cmd.name === 'teleport') {
      capri.playAct('hop');
    }
  });

  host.onResize(() => {
    fx.resize(window.innerWidth, window.innerHeight);
    chip.place(window.innerWidth, window.innerHeight);
  });

  // Window Tracking Event
  host.onWindowUpdate?.((data: WindowData) => {
    capri.setWindows(data);
  });

  // Config Update Event (volume & mute)
  host.onConfigChanged?.((updated: any) => {
    voice.configure({ muted: updated.muted, volume: updated.volume });
  });

  // Brain Protocol Message Dispatcher
  host.onBrainEvent((msg: any) => {
    const type = msg.type;

    if (type === 'session_start') {
      capri.mode = 'idle';
      offlineBanner.hidden = true;
      panelBadge.textContent = 'ONLINE';
      panelBadge.className = 'panel__badge';
      panelEl.hidden = false;
      voice.play('hello');
      decodeText(`Капри онлайн! Модель: ${msg.active_model || 'Haiku'}`, () => voice.play('blip'));
      setFace('smug');
      capri.playAct('hop');
      updatePanelPosition();
    } else if (type === 'session_offline') {
      capri.mode = 'offline';
      offlineBanner.hidden = false;
      panelBadge.textContent = 'OFFLINE';
      panelBadge.className = 'panel__badge badge-offline';
      voice.play('error');
      decodeText('Конструкт отключен от нейросети.', () => voice.play('blip'));
      setFace('laugh');
    } else if (type === 'thinking_start') {
      tickerEl.hidden = false;
      tickerEl.className = 'is-thinking';
      tickerVerb.textContent = 'THINKING...';
      tickerTarget.textContent = '';
      voice.play('tick');
      capri.playAct('curious', capri.facing);
      updatePanelPosition();
    } else if (type === 'thinking_tick') {
      tickerVerb.textContent = `THINKING... ${msg.elapsed_sec}s`;
    } else if (type === 'thinking_end') {
      tickerEl.hidden = true;
    } else if (type === 'assistant_message') {
      panelEl.hidden = false;
      decodeText(msg.text || '', () => voice.play('blip'));
      if (msg.face) setFace(msg.face);
      if (msg.badge) panelBadge.textContent = msg.badge;
      capri.playAct('talk');
      updatePanelPosition();
    } else if (type === 'tool_start') {
      capri.goToWork();
      voice.play('bolt', { soft: true });
      fx.glyph(capri.pos.x, capri.pos.y - 250 * capri.scale);

      tickerEl.hidden = false;
      tickerEl.className = '';
      tickerVerb.textContent = msg.ticker || `${msg.tool.toUpperCase()}`;
      tickerTarget.textContent = msg.target || '';
      updatePanelPosition();
    } else if (type === 'tool_end') {
      voice.play('tick');
      setTimeout(() => {
        if (!tickerEl.classList.contains('is-thinking')) {
          tickerEl.hidden = true;
        }
      }, 1500);
    } else if (type === 'needs_approval') {
      if (mousePos) {
        capri.pos = { x: mousePos.x + 80, y: mousePos.y + 100 };
      }
      capri.playAct('alarm', capri.facing);
      fx.showCutin('many', 900);
      voice.play('alert');

      panelEl.hidden = false;
      panelBadge.textContent = 'APPROVAL';
      panelBadge.className = 'panel__badge badge-offline';
      decodeText(`${msg.summary}\n${msg.details}`, () => voice.play('blip'));
      setFace('many');

      panelActions.hidden = false;
      panelActions.innerHTML = `
        <button class="btn" id="btn-approve">РАЗРЕШИТЬ</button>
        <button class="btn btn-danger" id="btn-deny">ОТКЛОНИТЬ</button>
      `;

      document.getElementById('btn-approve')?.addEventListener('click', () => {
        panelActions.hidden = true;
        host.sendToBrain({ type: 'approval_response', id: msg.id, approved: true });
      });
      document.getElementById('btn-deny')?.addEventListener('click', () => {
        panelActions.hidden = true;
        host.sendToBrain({ type: 'approval_response', id: msg.id, approved: false });
      });

      updatePanelPosition();
    } else if (type === 'approval_resolved') {
      panelActions.hidden = true;
      voice.play(msg.approved ? 'hello' : 'alert');
      decodeText(
        msg.approved ? 'Действие подтверждено!' : 'Действие отклонено пользователем.',
        () => voice.play('blip')
      );
      setFace(msg.approved ? 'smug' : 'aside');
      capri.playAct(msg.approved ? 'hop' : 'flinch');
    } else if (type === 'task_done') {
      // Victory sequence & cut-in
      capri.playAct('victory', capri.facing);
      fx.showCutin('grin', 1100);
      voice.play('done');

      panelEl.hidden = false;
      panelBadge.textContent = 'VICTORY';
      panelBadge.className = 'panel__badge';
      decodeText(`Задача выполнена!\n${msg.last_sentence}`, () => voice.play('blip'));
      setFace('laugh');
      updatePanelPosition();
    } else if (type === 'listening_start') {
      btnPtt?.classList.add('is-recording');
      panelEl.hidden = false;
      panelBadge.textContent = 'LISTENING';
      panelBadge.className = 'panel__badge';
      if (panelWave) panelWave.hidden = false;
      decodeText('Слушаю тебя...', () => voice.play('blip'));
      setFace('look');
      capri.playAct('curious', capri.facing);
      updatePanelPosition();
    } else if (type === 'listening_level') {
      const lvl = Math.max(0, Math.min(1, msg.level || 0));
      if (waveBars) {
        waveBars.forEach((bar, i) => {
          const h = Math.round(3 + lvl * 13 * (0.6 + 0.4 * Math.sin(i * 1.3)));
          bar.style.height = `${h}px`;
        });
      }
    } else if (type === 'listening_end') {
      btnPtt?.classList.remove('is-recording');
      panelBadge.textContent = 'STT...';
      decodeText('Распознаю голос...', () => voice.play('blip'));
    } else if (type === 'transcript') {
      panelBadge.textContent = 'USER';
      if (panelWave) panelWave.hidden = true;
      decodeText(msg.text, () => voice.play('blip'));
    } else if (type === 'tts_start') {
      if (panelWave) panelWave.hidden = false;
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      if (msg.audio) {
        currentAudio = new Audio(msg.audio);
        currentAudio.play().catch((err) => console.warn('[renderer] Audio playback failed:', err));
        currentAudio.onended = () => {
          currentAudio = null;
          if (panelWave) panelWave.hidden = true;
        };
      }
    } else if (type === 'tts_level') {
      const lvl = Math.max(0, Math.min(1, msg.level || 0));
      if (lvl > 0.15) {
        capri.playAct('talk');
      }
      if (waveBars) {
        waveBars.forEach((bar, i) => {
          const h = Math.round(3 + lvl * 13 * (0.5 + 0.5 * Math.cos(i * 1.5)));
          bar.style.height = `${h}px`;
        });
      }
    } else if (type === 'tts_end') {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      if (panelWave) panelWave.hidden = true;
    }
  });

  // Demo sequence runner
  let demoTimer: any = null;
  host.onDemoStart(() => {
    clearTimeout(demoTimer);
    panelEl.hidden = false;
    decodeText('Запуск демонстрационной сессии...', () => voice.play('blip'));
    setFace('wide');
    capri.wake();

    const steps = getDemoSteps('ru');
    let idx = 0;

    const playNext = () => {
      if (idx >= steps.length) return;
      const step = steps[idx++];
      demoTimer = setTimeout(() => {
        const listeners = (window as any).__brainListeners || [];
        for (const fn of listeners) fn(step.event);
        playNext();
      }, step.delay);
    };

    playNext();
  });

  const brainListeners: ((msg: any) => void)[] = [];
  (window as any).__brainListeners = brainListeners;
  host.onBrainEvent((msg) => {
    for (const fn of brainListeners) fn(msg);
  });

  // Optimized Render Loop: 12 fps on twos, 24 fps during actions
  function renderLoop(time: number) {
    if (!capri.isStowed) {
      capri.update(time);
      fx.update(time);
    } else if (chip.visible) {
      chip.draw();
    }
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  console.log('[renderer] Stage 4 Effects, Transmission Panel & Voice Synth initialized.');
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
