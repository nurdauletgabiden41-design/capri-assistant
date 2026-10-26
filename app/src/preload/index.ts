import { contextBridge, ipcRenderer } from 'electron';

const on = (channel: string) => (callback: (payload: any) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: any) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
};

contextBridge.exposeInMainWorld('host', {
  // Event listeners
  onBrainEvent: on('brain:event'),
  onCommand: on('capri:command'),
  onDemoStart: on('demo:start'),
  onResize: on('overlay:resize'),
  onCursorPoll: on('overlay:cursor-poll'),
  onConfigChanged: on('config:changed'),
  onWindowUpdate: on('window:update'),

  // Control actions
  setInteractive: (interactive: boolean) => {
    ipcRenderer.send('overlay:interactive', Boolean(interactive));
  },
  setNearTarget: (near: boolean) => {
    ipcRenderer.send('overlay:near-target', Boolean(near));
  },
  setFocus: (focused: boolean) => {
    ipcRenderer.send('overlay:focus', Boolean(focused));
  },
  rearm: () => {
    ipcRenderer.send('overlay:rearm');
  },
  getCursor: () => {
    return ipcRenderer.invoke('overlay:cursor');
  },

  // Brain communication
  sendToBrain: (msg: Record<string, unknown>) => {
    ipcRenderer.send('brain:send', msg);
  },

  // Configuration
  getConfig: () => {
    return ipcRenderer.invoke('config:get');
  },
  setConfig: (patch: Record<string, unknown>) => {
    return ipcRenderer.invoke('config:set', patch);
  },

  // App control
  quit: () => {
    ipcRenderer.send('app:quit');
  },
  triggerDemo: () => {
    ipcRenderer.send('demo:trigger');
  },
});
