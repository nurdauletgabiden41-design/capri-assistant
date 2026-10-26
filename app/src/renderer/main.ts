import { CapriController } from './character/CapriController';
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
      setInteractive: (on: boolean) => void;
      setNearTarget: (near: boolean) => void;
      setFocus: (on: boolean) => void;
      rearm: () => void;
      getCursor: () => Promise<{ x: number; y: number; inside: boolean }>;
      sendToBrain: (msg: any) => void;
      getConfig: () => Promise<any>;
      setConfig: (patch: any) => Promise<any>;
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

  // 1. Initialize FX & Chip
  const fx = new FxLayer(fxCanvas);
  const chip = new Chip(chipCanvas);
  chip.place(window.innerWidth, window.innerHeight);

  // Load cut-in assets
  const cutinNames = ['grin', 'laugh', 'eyes', 'many', 'look'];
  for (const name of cutinNames) {
    fx.loadCutin(name, `../assets/capri/cutin-${name}.png`);
  }

  // 2. Load character sprite texture (or graceful fallback)
  const spriteImg = await loadImage('../assets/capri/capri-full.png');
  const textureSource: TexImageSource = spriteImg || makeFallbackTexture();

  // 3. Initialize WebGL Capri Controller
  const capri = new CapriController(capriEl, canvasEl, textureSource);

  const cfg = await host.getConfig();
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

    const onChip = chip.contains(x, y);
    const onCapri = capri.hitTest(x, y);

    const hit = onPanel || onChip || onCapri;
    setInteractive(hit);

    // Adaptive polling: 30 Hz when near, 5 Hz when far
    const dist = Math.hypot(x - capri.pos.x, y - (capri.pos.y - 200));
    host.setNearTarget(dist < 260 || onPanel || onChip);
  }

  function setInteractive(on: boolean) {
    if (isInteractive === on) return;
    isInteractive = on;
    host.setInteractive(on);
  }

  window.addEventListener('mousemove', (e) => {
    mousePos = { x: e.clientX, y: e.clientY };
    capri.touchActivity();

    if (capri.isDragging) {
      capri.pos = { x: e.clientX, y: e.clientY + 180 };
      capri.place();
      return;
    }

    // Turn toward cursor if idle
    if (capri.stance === 'stand' && !capri.isSleeping) {
      const shouldFace = e.clientX < capri.pos.x ? 1 : -1;
      if (shouldFace !== capri.facing && Math.abs(e.clientX - capri.pos.x) > 60) {
        capri.facing = shouldFace;
        capri.playAct('turn');
      }
    }

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
    if (e.button === 0 && capri.hitTest(e.clientX, e.clientY)) {
      capri.isDragging = true;
      setInteractive(true);
    }
    if (chip.contains(e.clientX, e.clientY)) {
      // Clicked biochip: restore Capri
      chip.hide();
      capri.unstow();
      host.setConfig({ visible: true });
    }
  });

  window.addEventListener('mouseup', () => {
    if (capri.isDragging) {
      capri.isDragging = false;
      if (mousePos) refreshHitTest(mousePos.x, mousePos.y);
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
    host.sendToBrain({ type: 'user_text', text });
  });

  canvasEl.addEventListener('click', () => {
    if (panelEl.hidden) {
      panelEl.hidden = false;
      panelText.textContent = capri.mode === 'offline'
        ? 'Связь с мозгом потеряна. Проверь Python-процесс!'
        : 'Привет, хост! Готова к работе.';
      setFace(capri.mode === 'offline' ? 'laugh' : 'smug');
      updatePanelPosition();
    }
  });

  // Host Commands (e.g. from tray or hotkey)
  host.onCommand((cmd) => {
    if (cmd.name === 'stow') {
      if (cmd.on) {
        capri.stow();
        chip.show();
      } else {
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

  // Brain Protocol Message Dispatcher
  host.onBrainEvent((msg: any) => {
    const type = msg.type;

    if (type === 'session_start') {
      capri.mode = 'idle';
      offlineBanner.hidden = true;
      panelBadge.textContent = 'ONLINE';
      panelBadge.className = 'panel__badge';
      panelEl.hidden = false;
      panelText.textContent = `Капри онлайн! Модель: ${msg.active_model || 'Haiku'}`;
      setFace('smug');
      capri.playAct('hop');
      updatePanelPosition();
    } else if (type === 'session_offline') {
      capri.mode = 'offline';
      offlineBanner.hidden = false;
      panelBadge.textContent = 'OFFLINE';
      panelBadge.className = 'panel__badge badge-offline';
      panelText.textContent = 'Конструкт отключен от нейросети.';
      setFace('laugh');
    } else if (type === 'thinking_start') {
      tickerEl.hidden = false;
      tickerEl.className = 'is-thinking';
      tickerVerb.textContent = 'THINKING...';
      tickerTarget.textContent = '';
      capri.playAct('curious', capri.facing);
      updatePanelPosition();
    } else if (type === 'thinking_tick') {
      tickerVerb.textContent = `THINKING... ${msg.elapsed_sec}s`;
    } else if (type === 'thinking_end') {
      tickerEl.hidden = true;
    } else if (type === 'assistant_message') {
      panelEl.hidden = false;
      panelText.textContent = msg.text || '';
      if (msg.face) setFace(msg.face);
      if (msg.badge) panelBadge.textContent = msg.badge;
      capri.playAct('talk');
      updatePanelPosition();
    } else if (type === 'tool_start') {
      tickerEl.hidden = false;
      tickerEl.className = '';
      tickerVerb.textContent = msg.ticker || `${msg.tool.toUpperCase()}`;
      tickerTarget.textContent = msg.target || '';
      updatePanelPosition();
    } else if (type === 'tool_end') {
      setTimeout(() => {
        if (!tickerEl.classList.contains('is-thinking')) {
          tickerEl.hidden = true;
        }
      }, 1500);
    } else if (type === 'needs_approval') {
      // Mane bristles, alert cutin, teleport next to cursor
      if (mousePos) {
        capri.pos = { x: mousePos.x + 80, y: mousePos.y + 100 };
      }
      capri.playAct('alarm', capri.facing);
      fx.showCutin('many', 900);

      panelEl.hidden = false;
      panelBadge.textContent = 'APPROVAL';
      panelBadge.className = 'panel__badge badge-offline';
      panelText.textContent = `${msg.summary}\n${msg.details}`;
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
      panelText.textContent = msg.approved ? 'Действие подтверждено!' : 'Действие отклонено пользователем.';
      setFace(msg.approved ? 'smug' : 'aside');
      capri.playAct(msg.approved ? 'hop' : 'flinch');
    } else if (type === 'task_done') {
      // Victory sequence & cut-in
      capri.playAct('victory', capri.facing);
      fx.showCutin('grin', 1100);

      panelEl.hidden = false;
      panelBadge.textContent = 'VICTORY';
      panelBadge.className = 'panel__badge';
      panelText.textContent = `Задача выполнена!\n${msg.last_sentence}`;
      setFace('laugh');
      updatePanelPosition();
    }
  });

  // Demo sequence runner
  let demoTimer: any = null;
  host.onDemoStart(() => {
    clearTimeout(demoTimer);
    panelEl.hidden = false;
    panelText.textContent = 'Запуск демонстрационной сессии...';
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

  console.log('[renderer] Stage 2 Character Controller initialized.');
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
