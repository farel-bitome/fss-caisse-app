const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chooseRole: (role) => ipcRenderer.invoke('choose-role', role),
  saveServer: (ip, port) => ipcRenderer.invoke('save-server', ip, port),
  getCurrentServer: () => ipcRenderer.invoke('get-current-server'),
  printSilent: (html) => ipcRenderer.invoke('print-silent', html),
  getHostname: () => ipcRenderer.invoke('get-hostname'),
  printers: {
    get: () => ipcRenderer.invoke('printers-get'),
    save: (cfg) => ipcRenderer.invoke('printers-save', cfg),
    scan: () => ipcRenderer.invoke('printers-scan'),
    test: (imp) => ipcRenderer.invoke('printers-test', imp),
    testPort: (ip, port) => ipcRenderer.invoke('printers-test-port', ip, port),
    route: (demande) => ipcRenderer.invoke('printers-route', demande),
    installDrivers: () => ipcRenderer.invoke('printers-install-drivers'),
    openDrivers: () => ipcRenderer.invoke('printers-open-drivers'),
    onChanged: (cb) => ipcRenderer.on('printers-changed', (e, d) => cb(d)),
    onScanProgress: (cb) => ipcRenderer.on('printers-scan-progress', (e, d) => cb(d))
  },
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
  openBackupFileDialog: () => ipcRenderer.invoke('open-backup-file-dialog'),
  onFlushAvantFermeture: (callback) => ipcRenderer.on('flush-avant-fermeture', callback),
  confirmerFlushTermine: () => ipcRenderer.send('flush-termine')
});

// Battement de cœur d'affichage : si le navigateur n'a plus dessiné d'image depuis plusieurs
// secondes alors que la page est visible (fenêtre « figée » qui ne revient qu'avec Alt), on
// prévient le processus principal qui force aussitôt un vrai repaint (équivalent de la touche Alt).
(function () {
  let dernier = Date.now();
  const battre = () => { dernier = Date.now(); requestAnimationFrame(battre); };
  try { requestAnimationFrame(battre); } catch (e) {}
  setInterval(() => {
    try {
      if (document.hidden) { dernier = Date.now(); return; }
      const retard = Date.now() - dernier;
      if (retard > 3500) ipcRenderer.send('ecran-fige', retard);
    } catch (e) {}
  }, 1500);
})();
