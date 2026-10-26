import { SpriteController } from './character/SpriteController';
import { getDemoSteps } from './demo/demoSequence';

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

async function bootstrap() {
  const capriEl = document.getElementById('capri') as HTMLDivElement;
  const canvasEl = document.getElementById('sprite') as HTMLCanvasElement;
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

  const sprite = new SpriteController(canvasEl);

  // Load config & sprite asset
  const cfg = await host.getConfig();
  sprite.scale = cfg.scale || 0.6;

  // Initial placement near bottom-right
  sprite.pos = {
    x: window.innerWidth - 220,
    y: window.innerHeight - 20,
  };

  // Attempt to load character atlas or fallback
  await sprite.init('../assets/capri/capri-full.png');

  // Place character in DOM
  function updateCapriTransform() {
    const s = sprite.scale;
    const pad = 56;
    const w = 240;
    const h = 420;
    const left = sprite.pos.x - (pad + w * 0.5) * s;
    const top = sprite.pos.y - (pad + h) * s;
    capriEl.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;

    // Position panel to her side
    if (!panelEl.hidden) {
      const panelX = Math.max(20, Math.min(window.innerWidth - 340, sprite.pos.x - 340));
      const panelY = Math.max(40, sprite.pos.y - 320);
      panelEl.style.left = `${panelX}px`;
      panelEl.style.top = `${panelY}px`;
    }

    // Position ticker over her head
    if (!tickerEl.hidden) {
      tickerEl.style.left = `${Math.round(sprite.pos.x - 40)}px`;
      tickerEl.style.top = `${Math.round(top - 24)}px`;
    }
  }

  updateCapriTransform();

  // Face portrait helper
  function setFace(faceName: string) {
    panelFace.src = `../assets/capri/face-${faceName}.png`;
    panelFace.onerror = () => {
      // Fallback if specific face image not found
      panelFace.src = '../assets/capri/capri-face.png';
    };
  }
  setFace('smug');

  // Interactive Click-Through Logic
  let isInteractive = false;
  let mousePos: { x: number; y: number } | null = null;

  function refreshHitTest(x: number, y: number) {
    if (sprite.isDragging) {
      setInteractive(true);
      return;
    }

    // Check panel rect
    let onPanel = false;
    if (!panelEl.hidden) {
      const rect = panelEl.getBoundingClientRect();
      onPanel = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    // Check pixel-precise sprite body
    const onSprite = sprite.hitTest(x, y);

    const hit = onPanel || onSprite;
    setInteractive(hit);

    // Adaptive cursor polling frequency: near if within 250px
    const dist = Math.hypot(x - sprite.pos.x, y - (sprite.pos.y - 200));
    host.setNearTarget(dist < 250 || onPanel);
  }

  function setInteractive(on: boolean) {
    if (isInteractive === on) return;
    isInteractive = on;
    host.setInteractive(on);
  }

  window.addEventListener('mousemove', (e) => {
    mousePos = { x: e.clientX, y: e.clientY };
    if (sprite.isDragging) {
      sprite.pos = { x: e.clientX, y: e.clientY + 180 };
      updateCapriTransform();
      return;
    }
    refreshHitTest(e.clientX, e.clientY);
  });

  window.addEventListener('mouseleave', () => {
    mousePos = null;
    if (!sprite.isDragging) {
      setInteractive(false);
      host.setNearTarget(false);
    }
  });

  // Host cursor polling fallback
  host.onCursorPoll((pos) => {
    if (pos.inside && !sprite.isDragging) {
      mousePos = { x: pos.x, y: pos.y };
      refreshHitTest(pos.x, pos.y);
    }
  });

  // Dragging interaction
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0 && sprite.hitTest(e.clientX, e.clientY)) {
      sprite.isDragging = true;
      setInteractive(true);
    }
  });

  window.addEventListener('mouseup', () => {
    if (sprite.isDragging) {
      sprite.isDragging = false;
      if (mousePos) refreshHitTest(mousePos.x, mousePos.y);
    }
  });

  // Chat input focus routing
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
    host.sendToBrain({ type: 'user_text', text });
  });

  // Show panel on sprite click
  canvasEl.addEventListener('click', () => {
    if (panelEl.hidden) {
      panelEl.hidden = false;
      panelText.textContent = sprite.isOnline
        ? 'Привет, хост! Чем займемся?'
        : 'Связь с мозгом потеряна. Проверь Python-процесс!';
      updateCapriTransform();
    }
  });

  // Brain event dispatcher
  host.onBrainEvent((msg: any) => {
    const type = msg.type;

    if (type === 'session_start') {
      sprite.isOnline = true;
      offlineBanner.hidden = true;
      panelBadge.textContent = 'ONLINE';
      panelBadge.className = 'panel__badge';
      panelEl.hidden = false;
      panelText.textContent = `Капри онлайн! Модель: ${msg.active_model || 'Haiku'}`;
      setFace('smug');
      updateCapriTransform();
    } else if (type === 'session_offline') {
      sprite.isOnline = false;
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
      updateCapriTransform();
    } else if (type === 'thinking_tick') {
      tickerVerb.textContent = `THINKING... ${msg.elapsed_sec}s`;
    } else if (type === 'thinking_end') {
      tickerEl.hidden = true;
    } else if (type === 'assistant_message') {
      panelEl.hidden = false;
      panelText.textContent = msg.text || '';
      if (msg.face) setFace(msg.face);
      if (msg.badge) panelBadge.textContent = msg.badge;
      updateCapriTransform();
    } else if (type === 'tool_start') {
      tickerEl.hidden = false;
      tickerEl.className = '';
      tickerVerb.textContent = msg.ticker || `${msg.tool.toUpperCase()}`;
      tickerTarget.textContent = msg.target || '';
      updateCapriTransform();
    } else if (type === 'tool_end') {
      setTimeout(() => {
        if (!tickerEl.classList.contains('is-thinking')) {
          tickerEl.hidden = true;
        }
      }, 1500);
    } else if (type === 'needs_approval') {
      // Teleport next to cursor and prompt
      if (mousePos) {
        sprite.pos = { x: mousePos.x + 80, y: mousePos.y + 100 };
      }
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

      updateCapriTransform();
    } else if (type === 'approval_resolved') {
      panelActions.hidden = true;
      panelText.textContent = msg.approved ? 'Действие подтверждено!' : 'Действие отклонено пользователем.';
      setFace(msg.approved ? 'smug' : 'aside');
    } else if (type === 'task_done') {
      panelEl.hidden = false;
      panelBadge.textContent = 'VICTORY';
      panelBadge.className = 'panel__badge';
      panelText.textContent = `Задача выполнена!\n${msg.last_sentence}`;
      setFace('laugh');
      updateCapriTransform();
    }
  });

  // Demo sequence runner
  let demoTimer: any = null;
  host.onDemoStart(() => {
    clearTimeout(demoTimer);
    panelEl.hidden = false;
    panelText.textContent = 'Запуск демонстрационной сессии...';
    setFace('wide');

    const steps = getDemoSteps('ru');
    let idx = 0;

    const playNext = () => {
      if (idx >= steps.length) return;
      const step = steps[idx++];
      demoTimer = setTimeout(() => {
        // Dispatch step event through event handler
        const eventHandler = (window as any).__onDemoEvent;
        if (eventHandler) eventHandler(step.event);
        playNext();
      }, step.delay);
    };

    (window as any).__onDemoEvent = (event: any) => {
      // Feed through standard brain event pipeline
      const listeners = (window as any).__brainListeners || [];
      for (const fn of listeners) fn(event);
    };

    playNext();
  });

  // Wire demo events to main event listener
  const brainListeners: ((msg: any) => void)[] = [];
  (window as any).__brainListeners = brainListeners;
  host.onBrainEvent((msg) => {
    for (const fn of brainListeners) fn(msg);
  });

  // Render loop (12 fps on twos)
  function renderLoop(time: number) {
    sprite.update(time);
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  loggerReady();
}

function loggerReady() {
  console.log('[renderer] Capri Renderer initialized.');
}

window.addEventListener('DOMContentLoaded', bootstrap);
