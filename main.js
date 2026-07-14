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
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
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
    autoHideMenuBar: false,
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
          label: "Changer l'adresse du serveur",
          click: () => {
            const cfg = loadConfig();
            if (cfg.role === 'client') showClientScreen();
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
