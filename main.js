const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 3000;
const configPath = path.join(app.getPath('userData'), 'config.json');

let win;
let serverStarted = false;

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg));
}

function getLocalIP() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family !== 'IPv4' || net.internal) continue;
      candidates.push({ name: name, address: net.address });
    }
  }
  // On écarte les adresses de secours Windows (APIPA, 169.254.x.x) : jamais utilisables en réseau.
  const usable = candidates.filter(c => !c.address.startsWith('169.254.'));
  // On écarte les cartes virtuelles connues (VPN, machines virtuelles, Bluetooth...) qui ne
  // correspondent pas au vrai réseau local du restaurant.
  const virtualPattern = /virtualbox|vmware|hyper-v|tailscale|loopback|bluetooth|docker|wsl|zerotier|radmin|vethernet/i;
  const real = usable.filter(c => !virtualPattern.test(c.name));
  // On préfère les plages d'adresses privées classiques d'un réseau Wi-Fi/Ethernet domestique.
  const privatePattern = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/;
  const preferred = real.find(c => privatePattern.test(c.address));
  if (preferred) return preferred.address;
  if (real.length) return real[0].address;
  if (usable.length) return usable[0].address;
  if (candidates.length) return candidates[0].address;
  return null;
}

async function startEmbeddedServer() {
  if (serverStarted) return;
  serverStarted = true;
  const startEmbeddedServerFn = require('./embedded-server');
  await startEmbeddedServerFn(PORT, app.getPath('userData'), __dirname);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'app', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  buildMenu();

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode !== -3) {
      dialog.showErrorBox(
        'Connexion au serveur impossible',
        "Impossible de joindre le serveur FSS-CAISSE.\n\nVérifiez que :\n- Le serveur est bien démarré sur l'ordinateur central\n- Cet ordinateur est sur le même réseau\n- L'adresse IP est correcte\n\n(" + errorDescription + ')'
      );
      showClientScreen();
    }
  });

  boot();
}

async function boot() {
  const cfg = loadConfig();
  if (!cfg.role) {
    win.loadFile(path.join(__dirname, 'choice.html'));
  } else if (cfg.role === 'server') {
    await startEmbeddedServer();
    win.loadURL('http://localhost:' + PORT);
    const ip = getLocalIP();
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Serveur FSS-CAISSE démarré',
      message: ip
        ? 'Adresse à utiliser sur les postes clients :\n\n' + ip + ':' + PORT
        : "Serveur démarré, mais aucune adresse réseau n'a été détectée."
    });
  } else if (cfg.role === 'client' && cfg.serverUrl) {
    win.loadURL(cfg.serverUrl);
  } else {
    win.loadFile(path.join(__dirname, 'choice.html'));
  }
}

function showClientScreen() {
  win.loadFile(path.join(__dirname, 'client.html'));
}

function buildMenu() {
  const template = [
    {
      label: 'FSS-CAISSE',
      submenu: [
        {
          label: 'Changer de rôle (Serveur / Client)',
          click: () => {
            saveConfig({});
            win.loadFile(path.join(__dirname, 'choice.html'));
          }
        },
        {
          label: "Changer l'adresse du serveur / Voir mon adresse",
          click: () => {
            const cfg = loadConfig();
            if (cfg.role === 'client') {
              showClientScreen();
            } else {
              const ip = getLocalIP();
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'Adresse de ce PC (serveur)',
                message: ip
                  ? 'Adresse à utiliser sur les postes clients :\n\n' + ip + ':' + PORT
                  : "Impossible de détecter une adresse réseau valide.\nVérifiez que ce PC est bien connecté au Wi-Fi ou au câble réseau."
              });
            }
          }
        },
        { label: 'Recharger', click: () => boot() },
        { role: 'quit', label: 'Quitter' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('choose-role', async (event, role) => {
  if (role === 'server') {
    saveConfig({ role: 'server' });
    await startEmbeddedServer();
    win.loadURL('http://localhost:' + PORT);
    const ip = getLocalIP();
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Serveur FSS-CAISSE démarré',
      message: ip
        ? 'Adresse à utiliser sur les postes clients :\n\n' + ip + ':' + PORT
        : "Serveur démarré, mais aucune adresse réseau n'a été détectée."
    });
  } else {
    showClientScreen();
  }
  return true;
});

ipcMain.handle('save-server', (event, ip, port) => {
  const url = 'http://' + ip + ':' + (port || PORT);
  saveConfig({ role: 'client', serverUrl: url });
  win.loadURL(url);
  return true;
});

ipcMain.handle('get-current-server', () => {
  const cfg = loadConfig();
  return cfg.serverUrl || '';
});

ipcMain.handle('print-silent', (event, html) => {
  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    printWin.webContents.on('did-finish-load', () => {
      printWin.webContents.print({ silent: true, printBackground: true, margins: { marginType: 'none' } }, (success, errorType) => {
        if (!printWin.isDestroyed()) printWin.close();
        resolve({ success: success, error: success ? null : errorType });
      });
    });
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
