// Adapted from mochiiwuff/capri-desktop (MIT)

import { VoiceSynth } from './audio/VoiceSynth';
import { CapriController, WindowData } from './character/CapriController';
import { Chip } from './character/Chip';
import { getDemoSteps } from './demo/demoSequence';
import { FxLayer } from './fx/FxLayer';
import { HolocallFeed } from './holocall/HolocallFeed';

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
  const btnSwitchHolocall = document.getElementById('btn-switch-holocall') as HTMLButtonElement | null;

  // Holocall Mode Elements (Variant 3)
  const holocallContainer = document.getElementById('holocall-container') as HTMLDivElement;
  const holocallHeader = document.getElementById('holocall-header') as HTMLDivElement;
  const holocallBtnMode = document.getElementById('holocall-btn-mode') as HTMLButtonElement;
  const holocallBtnClose = document.getElementById('holocall-btn-close') as HTMLButtonElement;
  const holocallForm = document.getElementById('holocall-form') as HTMLFormElement;
  const holocallInput = document.getElementById('holocall-input') as HTMLInputElement;
  const holocallMic = document.getElementById('holocall-mic') as HTMLButtonElement | null;
  const holocallCanvas = document.getElementById('holocall-canvas') as HTMLCanvasElement;
  const holocallSubtitles = document.getElementById('holocall-subtitles') as HTMLDivElement;
  const holocallDrawerToggle = document.getElementById('holocall-drawer-toggle') as HTMLDivElement;
  const holocallDrawerTitle = document.getElementById('holocall-drawer-title') as HTMLSpanElement;
  const holocallDrawerContent = document.getElementById('holocall-drawer-content') as HTMLDivElement;
  const holocallCodeText = document.getElementById('holocall-code-text') as HTMLElement;
  const holocallBtnCopy = document.getElementById('holocall-btn-copy') as HTMLButtonElement;
  const holocallTimer = document.getElementById('holocall-timer') as HTMLSpanElement;
  const holocallAudioBars = document.querySelectorAll<HTMLSpanElement>('.holocall__audio-bar');

  const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
  const settingsClose = document.getElementById('settings-close') as HTMLButtonElement;
  const settingModel = document.getElementById('setting-model') as HTMLSelectElement;
  const settingBudget = document.getElementById('setting-budget') as HTMLInputElement;
  const settingMotion = document.getElementById('setting-motion') as HTMLSelectElement;
  const settingScale = document.getElementById('setting-scale') as HTMLInputElement;
  const settingScaleVal = document.getElementById('setting-scale-val') as HTMLSpanElement;
  const settingVolume = document.getElementById('setting-volume') as HTMLInputElement;
  const settingVolumeVal = document.getElementById('setting-volume-val') as HTMLSpanElement;
  const settingVoice = document.getElementById('setting-voice') as HTMLInputElement;
  const settingMute = document.getElementById('setting-mute') as HTMLInputElement;
  const settingKey = document.getElementById('setting-key') as HTMLInputElement;
  const settingsSave = document.getElementById('settings-save') as HTMLButtonElement;
  const settingsCancel = document.getElementById('settings-cancel') as HTMLButtonElement;

  let currentAudio: HTMLAudioElement | null = null;

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

  // 3. Load character sprite textures (HD standing and HD sitting with graceful fallbacks)
  const [standImg, sitImg] = await Promise.all([
    loadImage('../assets/capri/capri-stand-hd.png').then((img) => img || loadImage('../assets/capri/capri-full.png')),
    loadImage('../assets/capri/capri-sitting-hd.png'),
  ]);

  const standTextureSource: TexImageSource = standImg || makeFallbackTexture();
  const sitTextureSource: TexImageSource | undefined = sitImg || undefined;

  // 4. Initialize WebGL Capri Controller
  const capri = new CapriController(capriEl, canvasEl, standTextureSource, sitTextureSource, fx, voice);

  // 4b. Initialize PixiJS Holographic Video Feed for Cyberpunk Holocall Mode
  const holocallFeed = new HolocallFeed(holocallCanvas);
  await holocallFeed.init();

  // Mode Management: Variant 2 (Desktop Companion) vs Variant 3 (Cyberpunk Holocall)
  type AppMode = 'companion' | 'holocall';
  let currentMode: AppMode = 'companion';
  let holocallTimerInterval: any = null;
  let holocallSeconds = 0;
  let holocallSubTimer: any = null;

  holocallContainer.style.left = `${Math.max(20, window.innerWidth - 480)}px`;
  holocallContainer.style.top = `${Math.max(40, Math.round((window.innerHeight - 620) / 2))}px`;

  function updateHolocallTimer() {
    holocallSeconds++;
    const h = String(Math.floor(holocallSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((holocallSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(holocallSeconds % 60).padStart(2, '0');
    holocallTimer.textContent = `${h}:${m}:${s}`;
  }

  function setMode(mode: AppMode) {
    currentMode = mode;
    if (mode === 'holocall') {
      panelEl.hidden = true;
      holocallContainer.hidden = false;
      holocallFeed.setEmotion('calm');
      holocallFeed.triggerGlitch(0.8, 300);
      voice.play('hello');
      clearInterval(holocallTimerInterval);
      holocallSeconds = 0;
      updateHolocallTimer();
      holocallTimerInterval = setInterval(updateHolocallTimer, 1000);
      holocallInput.focus();
    } else {
      holocallContainer.hidden = true;
      clearInterval(holocallTimerInterval);
      panelEl.hidden = false;
      voice.play('rise');
      capri.playAct('hop');
      updatePanelPosition();
    }
    setInteractive(true);
  }

  function streamSubtitles(text: string) {
    clearInterval(holocallSubTimer);
    const chars = [...text];
    let done = 0;
    const step = () => {
      done = Math.min(chars.length, done + 3);
      holocallSubtitles.textContent = chars.slice(0, done).join('');
      if (done >= chars.length) {
        clearInterval(holocallSubTimer);
      }
    };
    step();
    holocallSubTimer = setInterval(step, 20);
  }

  function appendToHolocallStream(line: string) {
    if (holocallCodeText.textContent === '// Данные операций и код будут отображаться здесь') {
      holocallCodeText.textContent = line;
    } else {
      holocallCodeText.textContent += '\n' + line;
    }
    holocallBtnCopy.hidden = false;
    holocallDrawerContent.scrollTop = holocallDrawerContent.scrollHeight;
  }

  function updateHolocallAudioBars(level: number) {
    holocallAudioBars.forEach((bar, i) => {
      const h = Math.round(3 + level * 10 * (0.6 + 0.4 * Math.sin(i * 1.5)));
      bar.style.height = `${h}px`;
    });
  }

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isReducedMotion = cfg.motion === 'reduced' || (cfg.motion === 'auto' && prefersReduced);
  capri.reduceMotion = isReducedMotion;
  fx.reduceMotion = isReducedMotion;
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
  let isDraggingHolocall = false;
  let holocallDragOffset = { x: 0, y: 0 };

  holocallHeader.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isDraggingHolocall = true;
    const r = holocallContainer.getBoundingClientRect();
    holocallDragOffset = {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    };
    setInteractive(true);
  });

  function refreshHitTest(x: number, y: number) {
    if (capri.isDragging || isDraggingHolocall) {
      setInteractive(true);
      return;
    }

    let onPanel = false;
    if (!panelEl.hidden) {
      const r = panelEl.getBoundingClientRect();
      onPanel = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    let onHolocall = false;
    if (!holocallContainer.hidden) {
      const r = holocallContainer.getBoundingClientRect();
      onHolocall = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    let onMenu = false;
    if (!contextMenu.hidden) {
      const r = contextMenu.getBoundingClientRect();
      onMenu = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    let onSettings = false;
    if (!settingsModal.hidden) {
      const r = settingsModal.getBoundingClientRect();
      onSettings = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    const onChip = chip.contains(x, y);
    const onCapri = capri.hitTest(x, y);

    const hit = onPanel || onHolocall || onMenu || onChip || onCapri || onSettings;
    setInteractive(hit);

    // Adaptive polling: 30 Hz when near, 5 Hz when far
    const dist = Math.hypot(x - capri.pos.x, y - (capri.pos.y - 200));
    host.setNearTarget(dist < 260 || onPanel || onHolocall || onMenu || onChip || onSettings);
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

    if (isDraggingHolocall) {
      const newX = Math.max(10, Math.min(window.innerWidth - 450, e.clientX - holocallDragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 350, e.clientY - holocallDragOffset.y));
      holocallContainer.style.left = `${newX}px`;
      holocallContainer.style.top = `${newY}px`;
      return;
    }

    if (mouseDownPos && !capri.isDragging) {
      const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
      if (dist > 3) {
        capri.isDragging = true;
        dragOffset = {
          x: capri.pos.x - mouseDownPos.x,
          y: capri.pos.y - mouseDownPos.y,
        };
        closeContextMenu();
        setInteractive(true);
        if (capri.stance === 'sit' || capri.stance === 'sleep') {
          capri.setStance('fall');
        }
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
        dragOffset = {
          x: capri.pos.x - e.clientX,
          y: capri.pos.y - e.clientY,
        };
        setInteractive(true);
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
      if (isDraggingHolocall) {
        isDraggingHolocall = false;
        if (mousePos) refreshHitTest(mousePos.x, mousePos.y);
      }
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
    } else if (action === 'holocall') {
      setMode('holocall');
    } else if (action === 'settings') {
      openSettings();
    } else if (action === 'quit') {
      host.quit();
    }
  });

  async function openSettings() {
    voice.play('tick');
    const c = await host.getConfig();
    settingModel.value = c.model || 'anthropic/claude-haiku-5.5';
    settingBudget.value = String(c.dailyBudgetUsd ?? 0.50);
    settingMotion.value = c.motion || 'auto';
    settingScale.value = String(c.scale ?? 0.6);
    settingScaleVal.textContent = `${c.scale ?? 0.6}x`;
    settingVolume.value = String(c.volume ?? 0.7);
    settingVolumeVal.textContent = `${Math.round((c.volume ?? 0.7) * 100)}%`;
    settingVoice.checked = Boolean(c.voiceEnabled ?? true);
    settingMute.checked = Boolean(c.muted);
    settingKey.value = '';

    settingsModal.hidden = false;
    host.setNearTarget(true);
  }

  function closeSettings() {
    settingsModal.hidden = true;
    host.setFocus(false);
  }

  settingsClose.addEventListener('click', closeSettings);
  settingsCancel.addEventListener('click', closeSettings);

  settingScale.addEventListener('input', () => {
    const s = parseFloat(settingScale.value);
    settingScaleVal.textContent = `${s.toFixed(2)}x`;
    capri.setScale(s);
  });

  settingVolume.addEventListener('input', () => {
    const v = parseFloat(settingVolume.value);
    settingVolumeVal.textContent = `${Math.round(v * 100)}%`;
    voice.configure({ volume: v });
  });

  settingMute.addEventListener('change', () => {
    voice.configure({ muted: settingMute.checked });
  });

  [settingBudget, settingKey].forEach((el) => {
    el.addEventListener('focus', () => host.setFocus(true));
    el.addEventListener('blur', () => host.setFocus(false));
  });

  settingsSave.addEventListener('click', async () => {
    const s = parseFloat(settingScale.value);
    const v = parseFloat(settingVolume.value);
    const b = parseFloat(settingBudget.value) || 0.50;
    const m = settingModel.value;
    const mot = settingMotion.value as 'auto' | 'full' | 'reduced';
    const vc = settingVoice.checked;
    const mu = settingMute.checked;
    const key = settingKey.value.trim();

    await host.setConfig({
      scale: s,
      volume: v,
      dailyBudgetUsd: b,
      model: m,
      motion: mot,
      voiceEnabled: vc,
      muted: mu,
    });

    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isReducedMotion = mot === 'reduced' || (mot === 'auto' && isReduced);
    capri.reduceMotion = isReducedMotion;
    fx.reduceMotion = isReducedMotion;

    host.sendToBrain({
      type: 'settings_update',
      settings: {
        model: m,
        daily_budget_usd: b,
        voice_enabled: vc,
      },
    });

    if (key) {
      host.sendToBrain({ type: 'user_text', text: `key ${key}` });
    }

    voice.play('done');
    closeSettings();
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

  holocallInput.addEventListener('focus', () => host.setFocus(true));
  holocallInput.addEventListener('blur', () => host.setFocus(false));
  holocallInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      holocallInput.blur();
      setMode('companion');
      host.setFocus(false);
    }
  });

  // Mode Switchers
  btnSwitchHolocall?.addEventListener('click', () => setMode('holocall'));
  holocallBtnMode?.addEventListener('click', () => setMode('companion'));
  holocallBtnClose?.addEventListener('click', () => setMode('companion'));

  // Quick Suggestion Chips (Desktop Companion HUD)
  document.querySelectorAll<HTMLButtonElement>('.panel__chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd') || btn.textContent || '';
      chatInput.value = cmd;
      chatForm.dispatchEvent(new Event('submit'));
    });
  });

  // Quick Netrunner Commands (Holocall Window)
  document.querySelectorAll<HTMLButtonElement>('.holocall__chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd') || btn.textContent || '';
      holocallInput.value = cmd;
      holocallForm.dispatchEvent(new Event('submit'));
    });
  });

  // Holocall CLI Form
  holocallForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = holocallInput.value.trim();
    if (!text) return;
    holocallInput.value = '';

    streamSubtitles('Обрабатываю запрос...');
    holocallFeed.setEmotion('calm');
    voice.play('tick');
    host.sendToBrain({ type: 'user_text', text });
  });

  // Holocall Code Drawer Toggle & Copy Button
  holocallDrawerToggle.addEventListener('click', () => {
    const isHidden = holocallDrawerContent.hidden;
    holocallDrawerContent.hidden = !isHidden;
    holocallDrawerTitle.textContent = isHidden
      ? '⯆ NEURAL DATA STREAM // CODE & LOGS'
      : '⯈ NEURAL DATA STREAM // CODE & LOGS';
    voice.play('tick');
  });

  holocallBtnCopy.addEventListener('click', async (e) => {
    e.stopPropagation();
    const code = holocallCodeText.textContent || '';
    if (code) {
      await navigator.clipboard.writeText(code);
      holocallBtnCopy.textContent = 'COPIED!';
      voice.play('star', { soft: true });
      setTimeout(() => {
        holocallBtnCopy.textContent = 'COPY CODE';
      }, 1500);
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

  // Audio WAV Encoder for 16kHz Whisper STT
  function encodeWav(samples: Float32Array, sampleRate: number): string {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return 'data:audio/wav;base64,' + btoa(binary);
  }

  // Push-To-Talk Button Handler (16kHz PCM WAV)
  let audioCtx: AudioContext | null = null;
  let micStream: MediaStream | null = null;
  let scriptProcessor: ScriptProcessorNode | null = null;
  let recordedPcm: Float32Array[] = [];

  if (btnPtt || holocallMic) {
    const startPtt = async () => {
      btnPtt?.classList.add('is-recording');
      holocallMic?.classList.add('is-recording');
      host.sendToBrain({ type: 'ptt_start' });
      recordedPcm = [];
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new AudioContext({ sampleRate: 16000 });
        const source = audioCtx.createMediaStreamSource(micStream);
        scriptProcessor = audioCtx.createScriptProcessor(2048, 1, 1);
        scriptProcessor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          recordedPcm.push(new Float32Array(input));

          let sum = 0;
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
          const rms = Math.sqrt(sum / input.length);
          if (waveBars) {
            waveBars.forEach((bar, i) => {
              const h = Math.round(3 + Math.min(1, rms * 5) * 13 * (0.6 + 0.4 * Math.sin(i * 1.3)));
              bar.style.height = `${h}px`;
            });
          }
          updateHolocallAudioBars(rms * 4);
        };
        source.connect(scriptProcessor);
        scriptProcessor.connect(audioCtx.destination);
      } catch (err) {
        console.warn('[renderer] Microphone access unavailable, continuing with protocol PTT:', err);
      }
    };

    const stopPtt = () => {
      if (!btnPtt?.classList.contains('is-recording') && !holocallMic?.classList.contains('is-recording')) return;
      btnPtt?.classList.remove('is-recording');
      holocallMic?.classList.remove('is-recording');

      let base64Wav: string | null = null;
      if (recordedPcm.length > 0) {
        let totalLen = 0;
        for (const c of recordedPcm) totalLen += c.length;
        if (totalLen >= 1600) {
          const merged = new Float32Array(totalLen);
          let offset = 0;
          for (const c of recordedPcm) {
            merged.set(c, offset);
            offset += c.length;
          }
          base64Wav = encodeWav(merged, 16000);
        }
      }

      try {
        scriptProcessor?.disconnect();
        scriptProcessor = null;
        micStream?.getTracks().forEach((track) => track.stop());
        micStream = null;
        audioCtx?.close();
        audioCtx = null;
      } catch (_) {}

      if (base64Wav) {
        host.sendToBrain({ type: 'ptt_stop', audio: base64Wav });
      } else {
        host.sendToBrain({ type: 'ptt_stop' });
      }
    };

    if (btnPtt) {
      btnPtt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startPtt();
      });
    }
    if (holocallMic) {
      holocallMic.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startPtt();
      });
    }
    window.addEventListener('mouseup', () => stopPtt());
  }

  // Host Commands (e.g. from tray or hotkey)
  host.onCommand((cmd) => {
    if (cmd.name === 'toggle-holocall') {
      setMode(currentMode === 'companion' ? 'holocall' : 'companion');
    } else if (cmd.name === 'stow') {
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
    } else if (cmd.name === 'open-settings') {
      openSettings();
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
      const startText = `Капри онлайн! Модель: ${msg.active_model || 'Haiku'}`;
      decodeText(startText, () => voice.play('blip'));
      streamSubtitles(startText);
      holocallFeed.setEmotion('calm');
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
      streamSubtitles('Конструкт отключен от нейросети.');
      holocallFeed.triggerGlitch(0.8, 400);
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
      const sec = msg.elapsed_sec || 0;
      tickerVerb.textContent = `THINKING... ${sec}s`;
      if (sec >= 15) {
        tickerEl.className = 'is-thinking is-deep-thinking';
        capri.misreg([4, -2], 300);
        holocallFeed.triggerGlitch(0.4, 250);
      }
    } else if (type === 'thinking_end') {
      tickerEl.hidden = true;
    } else if (type === 'error') {
      voice.play('error');
      capri.glitch(0.6, 350);
      holocallFeed.triggerGlitch(0.9, 450);
      fx.burst(capri.pos.x, capri.pos.y - 100, { count: 18, power: 0.8 });
      capri.playAct('flinch', capri.facing);
      setFace('aside');
      panelEl.hidden = false;
      panelBadge.textContent = 'ERROR';
      panelBadge.className = 'panel__badge badge-offline';
      const errText = msg.message || 'Произошла непредвиденная ошибка.';
      decodeText(errText, () => voice.play('blip'));
      streamSubtitles(`ОШИБКА: ${errText}`);
      appendToHolocallStream(`[ERR] ${errText}`);
      updatePanelPosition();
    } else if (type === 'assistant_message') {
      panelEl.hidden = false;
      const text = msg.text || '';
      decodeText(text, () => voice.play('blip'));
      streamSubtitles(text);

      if (msg.face) {
        setFace(msg.face);
        if (msg.face === 'laugh') {
          holocallFeed.setEmotion('laugh');
        } else if (msg.face === 'smug' || msg.face === 'wide') {
          holocallFeed.setEmotion('wink');
        } else {
          holocallFeed.setEmotion('calm');
        }
      }

      if (msg.badge) panelBadge.textContent = msg.badge;
      capri.playAct('talk');
      updatePanelPosition();
    } else if (type === 'tool_start') {
      capri.goToWork();
      voice.play('bolt', { soft: true });
      fx.glyph(capri.pos.x, capri.pos.y - 250 * capri.scale);

      tickerEl.hidden = false;
      tickerEl.className = '';
      const tVerb = msg.ticker || `${msg.tool?.toUpperCase()}`;
      tickerVerb.textContent = tVerb;
      tickerTarget.textContent = msg.target || '';
      appendToHolocallStream(`> EXEC [${tVerb}] ${msg.target || ''}`);
      updatePanelPosition();
    } else if (type === 'tool_end') {
      voice.play('tick');
      appendToHolocallStream(`< DONE [${msg.tool || 'ACTION'}]`);
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
      holocallFeed.triggerGlitch(0.8, 400);

      panelEl.hidden = false;
      panelBadge.textContent = 'APPROVAL';
      panelBadge.className = 'panel__badge badge-offline';
      decodeText(`${msg.summary}\n${msg.details}`, () => voice.play('blip'));
      streamSubtitles(`ТРЕБУЕТСЯ ПОДТВЕРЖДЕНИЕ: ${msg.summary || ''}`);
      appendToHolocallStream(`! APPROVAL REQUIRED: ${msg.summary || ''}\n${msg.details || ''}`);
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
      const resText = msg.approved ? 'Действие подтверждено!' : 'Действие отклонено пользователем.';
      decodeText(resText, () => voice.play('blip'));
      streamSubtitles(resText);
      appendToHolocallStream(msg.approved ? `[CONFIRMED] Действие разрешено` : `[DENIED] Действие отклонено`);
      setFace(msg.approved ? 'smug' : 'aside');
      capri.playAct(msg.approved ? 'hop' : 'flinch');
      holocallFeed.setEmotion(msg.approved ? 'wink' : 'calm');
    } else if (type === 'task_done') {
      // Trigger-style Victory Sequence: hop, cut-in, shards, star audio, mission report
      capri.playAct('victory', capri.facing);
      fx.showCutin('grin', 1200);
      fx.burst(capri.pos.x, capri.pos.y - 120, { count: 36, power: 1.4 });
      voice.play('done');
      holocallFeed.setEmotion('laugh');
      holocallFeed.triggerGlitch(0.6, 300);

      panelEl.hidden = false;
      panelBadge.textContent = 'VICTORY';
      panelBadge.className = 'panel__badge';
      const actionsCount = msg.actions ?? 1;
      const filesCount = msg.files_changed ?? 0;
      const durationSec = ((msg.duration_ms || 1000) / 1000).toFixed(1);
      const report = `★ ЗАДАЧА ВЫПОЛНЕНА ★\n⚡ Действий: ${actionsCount} | 📁 Файлов: ${filesCount} | ⏱ ${durationSec}с\n\n${msg.last_sentence || 'Все операции завершены успешно.'}`;
      decodeText(report, () => voice.play('star', { soft: true }));
      streamSubtitles(`★ ЗАДАЧА ВЫПОЛНЕНА: ${msg.last_sentence || 'Все операции завершены.'}`);
      appendToHolocallStream(`★ MISSION REPORT ★\nActions: ${actionsCount} | Files: ${filesCount} | Time: ${durationSec}s\n${msg.last_sentence || 'OK'}`);
      setFace('laugh');
      updatePanelPosition();
    } else if (type === 'listening_start') {
      btnPtt?.classList.add('is-recording');
      holocallMic?.classList.add('is-recording');
      panelEl.hidden = false;
      panelBadge.textContent = 'LISTENING';
      panelBadge.className = 'panel__badge';
      if (panelWave) panelWave.hidden = false;
      decodeText('Слушаю тебя...', () => voice.play('blip'));
      streamSubtitles('Слушаю голосовой поток... Говори.');
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
      updateHolocallAudioBars(lvl);
    } else if (type === 'listening_end') {
      btnPtt?.classList.remove('is-recording');
      holocallMic?.classList.remove('is-recording');
      panelBadge.textContent = 'STT...';
      decodeText('Распознаю голос...', () => voice.play('blip'));
      streamSubtitles('Обработка аудиопотока STT...');
    } else if (type === 'transcript') {
      panelBadge.textContent = 'USER';
      if (panelWave) panelWave.hidden = true;
      decodeText(msg.text, () => voice.play('blip'));
      streamSubtitles(`USER: "${msg.text}"`);
      appendToHolocallStream(`USER > ${msg.text}`);
    } else if (type === 'tts_start') {
      holocallFeed.setSpeaking(true);
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
          holocallFeed.setSpeaking(false);
          updateHolocallAudioBars(0);
          if (panelWave) panelWave.hidden = true;
        };
      }
    } else if (type === 'tts_level') {
      const lvl = Math.max(0, Math.min(1, msg.level || 0));
      if (lvl > 0.15) {
        capri.playAct('talk');
      }
      holocallFeed.setVoiceLevel(lvl);
      updateHolocallAudioBars(lvl);
      if (waveBars) {
        waveBars.forEach((bar, i) => {
          const h = Math.round(3 + lvl * 13 * (0.5 + 0.5 * Math.cos(i * 1.5)));
          bar.style.height = `${h}px`;
        });
      }
    } else if (type === 'tts_end') {
      holocallFeed.setSpeaking(false);
      updateHolocallAudioBars(0);
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
