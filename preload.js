const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chooseRole: (role) => ipcRenderer.invoke('choose-role', role),
  saveServer: (ip, port) => ipcRenderer.invoke('save-server', ip, port),
  getCurrentServer: () => ipcRenderer.invoke('get-current-server'),
  printSilent: (html) => ipcRenderer.invoke('print-silent', html),
  getServerIpInfo: () => ipcRenderer.invoke('get-server-ip-info'),
  saveManualIp: (ip, port) => ipcRenderer.invoke('save-manual-ip', ip, port),
  resetManualIp: () => ipcRenderer.invoke('reset-manual-ip'),
  reloadApp: () => ipcRenderer.invoke('reload-app')
});
