const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chooseRole: (role) => ipcRenderer.invoke('choose-role', role),
  saveServer: (ip, port) => ipcRenderer.invoke('save-server', ip, port),
  getCurrentServer: () => ipcRenderer.invoke('get-current-server'),
  printSilent: (html) => ipcRenderer.invoke('print-silent', html),
  getServerIpInfo: () => ipcRenderer.invoke('get-server-ip-info'),
  saveManualIp: (ip, port) => ipcRenderer.invoke('save-manual-ip', ip, port),
  resetManualIp: () => ipcRenderer.invoke('reset-manual-ip'),
  reloadApp: () => ipcRenderer.invoke('reload-app'),
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  isLicensed: () => ipcRenderer.invoke('is-licensed'),
  activateLicense: (key) => ipcRenderer.invoke('activate-license', key),
  getTrialStatus: () => ipcRenderer.invoke('get-trial-status'),
  saveFileDialog: (defaultName, content, isBase64) => ipcRenderer.invoke('save-file-dialog', defaultName, content, isBase64),
  listBackups: () => ipcRenderer.invoke('list-backups'),
  createBackup: (stateJson, type) => ipcRenderer.invoke('create-backup', stateJson, type),
  readBackup: (filename) => ipcRenderer.invoke('read-backup', filename),
  openBackupFileDialog: () => ipcRenderer.invoke('open-backup-file-dialog')
});
