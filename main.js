const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const licensing = require('./licensing');

const PORT = 3000;
const configPath = path.join(app.getPath('userData'), 'config.json');

let win;
let serverStarted = false;
let messageDemarrageDejaAffiche = false;

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

// Renvoie l'adresse à afficher/utiliser : l'IP manuelle si l'utilisateur en a défini une,
// sinon l'adresse détectée automatiquement.
function getEffectiveIP() {
  const cfg = loadConfig();
  if (cfg.manualIP) return { ip: cfg.manualIP, port: cfg.manualPort || PORT, manual: true };
  return { ip: getLocalIP(), port: PORT, manual: false };
}

async function startEmbeddedServer() {
  if (serverStarted) return;
  const startEmbeddedServerFn = require('./embedded-server');
  try {
    await startEmbeddedServerFn(PORT, app.getPath('userData'), __dirname);
    serverStarted = true;
  } catch (e) {
    serverStarted = false; // on autorise une nouvelle tentative (ex: via "Recharger")
    var msg;
    if (e && e.code === 'EADDRINUSE') {
      msg = "Le port " + PORT + " est déjà utilisé par un autre programme (peut-être une autre fenêtre de FSS-CAISSE déjà ouverte en arrière-plan).\n\n" +
            "Solution : fermez complètement FSS-CAISSE (vérifiez le Gestionnaire des tâches Windows), puis relancez l'application.";
    } else {
      msg = "Le serveur FSS-CAISSE n'a pas pu démarrer.\n\nDétail technique : " + (e && e.message ? e.message : e);
    }
    dialog.showErrorBox('Erreur de démarrage du serveur', msg);
    throw e;
  }
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

  let fermetureAutorisee = false;
  win.on('close', (event) => {
    if (fermetureAutorisee) return;
    event.preventDefault();
    let repondu = false;
    const terminerFermeture = () => {
      if (repondu) return;
      repondu = true;
      fermetureAutorisee = true;
      if (win && !win.isDestroyed()) win.close();
    };
    ipcMain.once('flush-termine', terminerFermeture);
    win.webContents.send('flush-avant-fermeture');
    // Filet de sécurité : si aucune confirmation n'arrive (réseau down,
    // page déjà en train de planter...), on ferme quand même après 5s max,
    // pour ne jamais bloquer complètement la fermeture de l'application.
    setTimeout(terminerFermeture, 5000);
  });

  // Même principe que la fermeture ci-dessus, mais pour "Recharger" (menu) :
  // on attend la vraie confirmation que tout changement en attente a atteint
  // le serveur avant de recharger la page — sans ça, un changement tout juste
  // fait (article ajouté, mouvement de stock...) pouvait se perdre.
  global.rechargerEnAttendantSync = function () {
    let repondu = false;
    const suite = () => {
      if (repondu) return;
      repondu = true;
      boot(true);
    };
    ipcMain.once('flush-termine', suite);
    if (win && !win.isDestroyed()) win.webContents.send('flush-avant-fermeture');
    setTimeout(suite, 5000);
  };

  // F12 ouvre directement les outils de développement, sans avoir besoin
  // d'afficher le menu au préalable (la barre de menu est masquée par défaut).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
    }
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode !== -3) {
      dialog.showErrorBox(
        'Connexion au serveur impossible',
        "Impossible de joindre le serveur FSS-CAISSE.\n\nVérifiez que :\n- Le serveur est bien démarré sur l'ordinateur central\n- Cet ordinateur est sur le même réseau\n- L'adresse IP est correcte\n\n(" + errorDescription + ')'
      );
      showClientScreen();
    }
  });

  // Récupération automatique en cas de plantage de la page (processus de rendu
  // interrompu — écran blanc ou figé). Auparavant il fallait recharger
  // manuellement via le menu (Alt → Recharger) ; désormais c'est automatique,
  // avec une courte pause pour éviter une boucle de plantages en rafale.
  let crashRecoveryCount = 0;
  win.webContents.on('render-process-gone', (event, details) => {
    if (details.reason === 'clean-exit') return;
    console.error('Processus de rendu interrompu (' + details.reason + '), rechargement automatique...');
    crashRecoveryCount++;
    const delay = Math.min(5000, 1000 * crashRecoveryCount);
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      boot();
    }, delay);
  });

  // Récupération automatique si la page reste figée (JavaScript bloqué) trop
  // longtemps sans jamais redevenir réactive. Délai volontairement généreux :
  // avec un gros catalogue (articles, tables...), certaines opérations
  // normales (enregistrer un article, synchroniser) peuvent légitimement
  // prendre plusieurs secondes sans que l'application soit vraiment plantée —
  // un délai trop court provoquait des rechargements intempestifs en plein
  // travail normal (ex: juste après avoir modifié un article).
  let unresponsiveTimer = null;
  win.webContents.on('unresponsive', () => {
    console.error('Application non réactive, tentative de rechargement dans 30s si ça persiste...');
    unresponsiveTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      boot();
    }, 30000);
  });
  win.webContents.on('responsive', () => {
    if (unresponsiveTimer) { clearTimeout(unresponsiveTimer); unresponsiveTimer = null; }
  });

  if (licensing.isBlocked()) {
    win.loadFile(path.join(__dirname, 'activation.html'));
    return;
  }

  if (!licensing.isLicensed()) {
    const trial = licensing.getTrialStatus();
    dialog.showMessageBox(win, {
      type: 'info',
      title: "Version d'essai",
      message: `Version d'essai — ${trial.daysLeft} jour(s) restant(s) avant activation obligatoire.\n\nMenu FSS-CAISSE → "Licence / Activation" pour activer dès maintenant.`
    });
  }

  boot();
}

async function boot(declencheParUtilisateur) {
  const cfg = loadConfig();
  if (!cfg.role) {
    win.loadFile(path.join(__dirname, 'choice.html'));
  } else if (cfg.role === 'server') {
    try {
      await startEmbeddedServer();
    } catch (e) {
      win.loadFile(path.join(__dirname, 'choice.html'));
      return;
    }
    win.loadURL('http://localhost:' + PORT);
    // Ce message (avec l'adresse IP à donner aux postes clients) s'affiche au
    // tout premier démarrage, ET à chaque fois que l'utilisateur clique
    // lui-même sur "Recharger" (utile pour retrouver l'adresse à tout
    // moment, par exemple pour connecter un nouveau téléphone). Il reste en
    // revanche silencieux lors d'une récupération AUTOMATIQUE après un
    // plantage ou un blocage — sans ça, il réapparaissait sans arrêt sans
    // que l'utilisateur n'ait rien demandé.
    if (declencheParUtilisateur || !messageDemarrageDejaAffiche) {
      messageDemarrageDejaAffiche = true;
      const eff = getEffectiveIP();
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'Serveur FSS-CAISSE démarré',
        message: eff.ip
          ? 'Adresse à utiliser sur les postes clients :\n\n' + eff.ip + ':' + eff.port + (eff.manual ? '\n(adresse manuelle)' : '')
          : "Serveur démarré, mais aucune adresse réseau n'a été détectée."
      });
    }
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
            const cfg = loadConfig();
            delete cfg.role;
            delete cfg.serverUrl;
            saveConfig(cfg);
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
              win.loadFile(path.join(__dirname, 'server-ip.html'));
            }
          }
        },
        { label: 'Recharger', click: () => global.rechargerEnAttendantSync ? global.rechargerEnAttendantSync() : boot(true) },
        {
          label: 'Licence / Activation',
          click: () => win.loadFile(path.join(__dirname, 'activation.html'))
        },
        {
          label: 'Outils de développement (diagnostic)',
          click: () => win.webContents.openDevTools({ mode: 'detach' })
        },
        { role: 'quit', label: 'Quitter' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('choose-role', async (event, role) => {
  if (role === 'server') {
    const cfg0 = loadConfig();
    cfg0.role = 'server';
    saveConfig(cfg0);
    try {
      await startEmbeddedServer();
    } catch (e) {
      return false;
    }
    win.loadURL('http://localhost:' + PORT);
    const eff = getEffectiveIP();
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Serveur FSS-CAISSE démarré',
      message: eff.ip
        ? 'Adresse à utiliser sur les postes clients :\n\n' + eff.ip + ':' + eff.port + (eff.manual ? '\n(adresse manuelle)' : '')
        : "Serveur démarré, mais aucune adresse réseau n'a été détectée."
    });
  } else {
    showClientScreen();
  }
  return true;
});

ipcMain.handle('save-server', (event, ip, port) => {
  const url = 'http://' + ip + ':' + (port || PORT);
  const cfgC = loadConfig();
  cfgC.role = 'client';
  cfgC.serverUrl = url;
  saveConfig(cfgC);
  win.loadURL(url);
  return true;
});

ipcMain.handle('get-current-server', () => {
  const cfg = loadConfig();
  return cfg.serverUrl || '';
});

ipcMain.handle('get-server-ip-info', () => {
  const cfg = loadConfig();
  return {
    detected: getLocalIP(),
    port: PORT,
    manual: !!cfg.manualIP,
    manualIp: cfg.manualIP || '',
    manualPort: cfg.manualPort || PORT
  };
});

ipcMain.handle('save-manual-ip', (event, ip, port) => {
  const cfg = loadConfig();
  cfg.manualIP = ip;
  cfg.manualPort = port || PORT;
  saveConfig(cfg);
  return true;
});

ipcMain.handle('reset-manual-ip', () => {
  const cfg = loadConfig();
  delete cfg.manualIP;
  delete cfg.manualPort;
  saveConfig(cfg);
  return true;
});

ipcMain.handle('reload-app', () => {
  boot(true);
  return true;
});

ipcMain.handle('get-machine-id', () => licensing.getMachineId());
ipcMain.handle('is-licensed', () => licensing.isLicensed());
ipcMain.handle('activate-license', (event, key) => licensing.activate(key));
ipcMain.handle('get-trial-status', () => licensing.getTrialStatus());

ipcMain.handle('save-file-dialog', async (event, defaultName, content, isBase64) => {
  const ext = (defaultName.split('.').pop() || 'csv').toLowerCase();
  const filterByExt = {
    csv: { name: 'Fichiers CSV', extensions: ['csv'] },
    json: { name: 'Fichiers de sauvegarde JSON', extensions: ['json'] },
    xlsx: { name: 'Classeur Excel', extensions: ['xlsx'] }
  };
  const mainFilter = filterByExt[ext] || { name: 'Fichier', extensions: [ext] };
  const result = await dialog.showSaveDialog(win, {
    title: 'Enregistrer le fichier',
    defaultPath: defaultName,
    filters: [mainFilter, { name: 'Tous les fichiers', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }
  try {
    if (isBase64) {
      fs.writeFileSync(result.filePath, Buffer.from(content, 'base64'));
    } else {
      fs.writeFileSync(result.filePath, content, 'utf-8');
    }
    return { success: true, filePath: result.filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ---------- Sauvegardes internes (historique, restauration) ----------
const backupsDir = path.join(app.getPath('userData'), 'backups');
function ensureBackupsDir() {
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
}
const MAX_BACKUPS = 60; // conserve les 60 dernières sauvegardes (auto + manuelles), purge les plus anciennes au-delà

function listBackupFiles() {
  ensureBackupsDir();
  return fs.readdirSync(backupsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const full = path.join(backupsDir, f);
      const st = fs.statSync(full);
      let type = 'Manuel';
      if (f.startsWith('auto_')) type = 'Auto';
      return { filename: f, date: st.mtime.toISOString(), size: st.size, type };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

ipcMain.handle('list-backups', () => {
  try {
    return { success: true, backups: listBackupFiles() };
  } catch (e) {
    return { success: false, error: e.message, backups: [] };
  }
});

ipcMain.handle('create-backup', (event, stateJson, type) => {
  try {
    ensureBackupsDir();
    const prefix = type === 'auto' ? 'auto_' : 'manuel_';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = prefix + stamp + '.json';
    fs.writeFileSync(path.join(backupsDir, filename), stateJson, 'utf-8');
    // Purge : garde seulement les MAX_BACKUPS plus récentes
    const all = listBackupFiles();
    if (all.length > MAX_BACKUPS) {
      all.slice(MAX_BACKUPS).forEach((b) => {
        try { fs.unlinkSync(path.join(backupsDir, b.filename)); } catch (e) {}
      });
    }
    const st = fs.statSync(path.join(backupsDir, filename));
    return { success: true, filename, date: st.mtime.toISOString(), size: st.size };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('read-backup', (event, filename) => {
  try {
    // Sécurité : empêche toute tentative de sortir du dossier de sauvegardes
    const safeName = path.basename(filename);
    const content = fs.readFileSync(path.join(backupsDir, safeName), 'utf-8');
    return { success: true, content };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-backup-file-dialog', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Choisir un fichier de sauvegarde',
    filters: [
      { name: 'Fichiers de sauvegarde JSON', extensions: ['json'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) {
    return { success: false, canceled: true };
  }
  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    return { success: true, content, filePath: result.filePaths[0] };
  } catch (e) {
    return { success: false, error: e.message };
  }
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

app.whenReady().then(() => {
  licensing.init(app.getPath('userData'));
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
