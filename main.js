const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const licensing = require('./licensing');
const printers = require('./printers');
const afficheur = require('./afficheur');
const tiroir = require('./tiroir');

// ---- Anti-gel de la fenêtre -------------------------------------------------------------
// Symptôme : après un moment la fenêtre se fige (ou reste blanche) et il faut appuyer sur Alt
// (barre de menu -> redimensionnement -> repaint) puis « Recharger ». Causes classiques sous Windows :
// accélération graphique (GPU) qui cesse de dessiner, fenêtre « occultée » dont le rendu est mis en
// pause, throttling d'arrière-plan. On désactive ces mécanismes, on force un repaint régulier,
// et un chien de garde recharge la page tout seul si elle ne dessine plus.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const logFile = path.join(app.getPath('userData'), 'incidents.log');
function journalIncident(texte) {
  try {
    fs.appendFileSync(logFile, new Date().toISOString() + ' ' + texte + '\n');
    const st = fs.statSync(logFile);
    if (st.size > 500000) fs.writeFileSync(logFile, fs.readFileSync(logFile, 'utf8').slice(-200000));
  } catch (e) {}
}
process.on('uncaughtException', (e) => { journalIncident('uncaughtException : ' + (e && e.stack || e)); });
process.on('unhandledRejection', (e) => { journalIncident('unhandledRejection : ' + (e && e.stack || e)); });
app.on('child-process-gone', (event, details) => { journalIncident('processus ' + details.type + ' arrêté : ' + details.reason); });

// Une seule instance : une 2e copie ouverte en arrière-plan bloquait le port 3000.
const verrouInstance = app.requestSingleInstanceLock();
if (!verrouInstance) { app.quit(); }
else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
}

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
    title: 'FSS-CAISSE ' + app.getVersion(),
    autoHideMenuBar: false, // la barre de menu n'apparaît plus sur un simple appui sur Alt (voir plus bas)
    icon: path.join(__dirname, 'app', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    }
  });

  buildMenu();
  try { win.setMenuBarVisibility(false); } catch (e) {}

  // ---------------------------------------------------------------------------
  // ANTI-BLOCAGE : une touche Alt isolée (ou envoyée par une douchette / un clavier) activait la
  // barre de menu masquée de Windows : le clavier et la souris partaient dans le menu invisible
  // et l'interface semblait « figée » jusqu'à un nouvel appui sur Alt. Un Alt isolé est donc
  // ignoré. Le menu reste accessible par Ctrl+Maj+M. (AltGr / Ctrl+Alt+… ne sont pas touchés.)
  // ---------------------------------------------------------------------------
  win.webContents.on('before-input-event', (event, input) => {
    try {
      const k = String(input.key || '');
      if (k === 'Alt' && !input.control && !input.shift && !input.meta) { event.preventDefault(); return; }
      if (input.type === 'keyDown' && input.control && input.shift && !input.alt && k.toLowerCase() === 'm') {
        event.preventDefault();
        const m = Menu.getApplicationMenu();
        if (m) m.popup({ window: win });
      }
    } catch (e) {}
  });
  // Dès que la fenêtre reprend le focus, le clavier est rendu à la page (jamais au menu ou à une autre fenêtre).
  win.on('focus', () => { try { win.webContents.focus(); } catch (e) {} });
  // Fenêtres filles (impression de tickets, étiquettes...) : sans menu, jamais laissées ouvertes
  // indéfiniment, et le focus revient TOUJOURS à la fenêtre principale quand elles se ferment.
  win.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: false, skipTaskbar: false } }));
  win.webContents.on('did-create-window', (child) => {
    try {
      child.setMenuBarVisibility(false);
      child.removeMenu();
      const garde = setTimeout(() => { try { if (!child.isDestroyed()) child.destroy(); } catch (e) {} }, 3 * 60 * 1000);
      child.on('closed', () => {
        clearTimeout(garde);
        [0, 150, 600, 1500].forEach(d => setTimeout(rendreFocus, d));
      });
    } catch (e) {}
  });

  // Poste CLIENT : l'adresse/port du serveur ne s'affichent jamais et ne se modifient que par
  // le raccourci technicien Ctrl+Maj+Alt+K (code technicien demandé).
  win.webContents.on('before-input-event', (event, input) => {
    try {
      if (input.type === 'keyDown' && input.control && input.shift && input.alt && String(input.key).toLowerCase() === 'k') {
        const c = loadConfig();
        if (c.role === 'client' && c.serverUrl) {
          event.preventDefault();
          techAutorise = false;
          win.loadFile(path.join(__dirname, 'acces-technicien.html'));
        }
      }
    } catch (e) {}
  });
  // Petit bouton discret en haut à gauche (poste CLIENT) : ouvre l'accès technicien
  // (code requis) pour modifier l'adresse du serveur ou changer de mode (Serveur / Client).
  win.webContents.on('did-finish-load', () => {
    try {
      const c = loadConfig();
      if (c.role !== 'client' || !c.serverUrl) return;
      const u = win.webContents.getURL();
      if (u.indexOf(String(c.serverUrl).replace(/\/$/, '')) !== 0) return;
      win.webContents.executeJavaScript(`(function(){
        if (document.getElementById('fssTechBtn')) return;
        var b = document.createElement('button');
        b.id = 'fssTechBtn'; b.type = 'button'; b.title = 'Accès technicien'; b.textContent = '\u2699';
        b.style.cssText = 'position:fixed;top:2px;left:2px;z-index:2147483600;width:16px;height:16px;padding:0;margin:0;border:0;border-radius:3px;background:rgba(0,0,0,.35);color:#fff;font-size:11px;line-height:16px;text-align:center;cursor:pointer;opacity:.4';
        b.onmouseenter = function(){ b.style.opacity = '1'; };
        b.onmouseleave = function(){ b.style.opacity = '.4'; };
        b.onclick = function(){ try { window.electronAPI.ouvrirAccesTechnicien(); } catch (e) {} };
        document.body.appendChild(b);
      })();`).catch(() => {});
    } catch (e) {}
  });
  // Serveur injoignable : écran neutre avec réessai automatique (au lieu de la page d'erreur
  // du navigateur, qui afficherait l'adresse IP du serveur).
  win.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    try {
      if (!isMainFrame || code === -3) return;
      const c = loadConfig();
      if (c.role === 'client' && c.serverUrl && url && String(url).indexOf(String(c.serverUrl).replace(/\/$/, '')) === 0) {
        win.loadFile(path.join(__dirname, 'serveur-injoignable.html'));
      }
    } catch (err) {}
  });

  // Repaint forcé + chien de garde de dessin.
  const repaint = () => { try { if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) win.webContents.invalidate(); } catch (e) {} };
  ['focus', 'show', 'restore', 'resize', 'maximize', 'unmaximize'].forEach(ev => win.on(ev, repaint));
  setInterval(repaint, 5000);
  let echecsDessin = 0;
  setInterval(async () => {
    try {
      if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized() || win.webContents.isLoading()) { echecsDessin = 0; return; }
      const ok = await Promise.race([
        win.webContents.capturePage({ x: 0, y: 0, width: 2, height: 2 }).then(() => true),
        new Promise(r => setTimeout(() => r(false), 10000))
      ]);
      if (ok) { echecsDessin = 0; return; }
      echecsDessin++;
      journalIncident('la fenêtre ne dessine plus (' + echecsDessin + ')');
      if (echecsDessin >= 2) { echecsDessin = 0; journalIncident('rechargement automatique (chien de garde)'); boot(); }
    } catch (e) { echecsDessin = 0; }
  }, 15000);
  // Réveil énergique de l'affichage : reproduit ce que fait la touche Alt (barre de menu
  // qui apparaît puis disparaît + léger redimensionnement) pour forcer Windows à redessiner.
  let dernierReveil = 0, reveilsRecents = [];
  const reveilAffichage = (raison, retardMs) => {
    try {
      if (!win || win.isDestroyed() || win.isMinimized()) return;
      const maintenant = Date.now();
      if (maintenant - dernierReveil < 1000) return;
      dernierReveil = maintenant;
      // Escalade : si l'affichage re-fige plusieurs fois en 90 s, on passe aux grands moyens
      // (cycle de focus, puis rechargement de la page — les données sont sur le serveur, rien n'est perdu).
      reveilsRecents = reveilsRecents.filter(t => maintenant - t < 90000); if (!retardMs || retardMs >= 3000) reveilsRecents.push(maintenant); // seuls les vrais gels (≥ 3 s) comptent pour l'escalade
      if (reveilsRecents.length === 3) { try { win.blur(); win.focus(); win.webContents.focus(); } catch (e) {} journalIncident('escalade : cycle de focus'); }
      if (reveilsRecents.length >= 5) { reveilsRecents = []; journalIncident('escalade : rechargement automatique de la page'); try { boot(); } catch (e) {} return; }
      journalIncident('affichage figé détecté (' + raison + ') — repaint forcé');
      win.webContents.invalidate();
      setTimeout(() => {
        try {
          if (!win || win.isDestroyed()) return;
          if (win.isMaximized()) { win.unmaximize(); win.maximize(); }
          else if (!win.isFullScreen()) { const b = win.getBounds(); win.setBounds({ x: b.x, y: b.y, width: b.width + 1, height: b.height }); setTimeout(() => { try { win.setBounds(b); } catch (e) {} }, 60); }
          win.webContents.invalidate();
        } catch (e) {}
      }, 120);
    } catch (e) {}
  };
  ipcMain.on('ecran-fige', (e, retard) => { if (win && e.sender === win.webContents) reveilAffichage('plus d\'image depuis ' + retard + ' ms', retard); });
  const { powerMonitor } = require('electron');
  powerMonitor.on('resume', () => { journalIncident('sortie de veille'); setTimeout(repaint, 1500); });
  powerMonitor.on('unlock-screen', () => setTimeout(repaint, 500));

  let fermetureAutorisee = false;
  win.on('close', (event) => {
    if (fermetureAutorisee) return;
    event.preventDefault();
    // Demande confirmation avant de fermer réellement — pour éviter qu'un
    // clic accidentel sur la croix ne ferme l'application en plein service.
    const choix = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Annuler', 'Fermer quand même'],
      defaultId: 0,
      cancelId: 0,
      title: 'Fermer FSS-CAISSE ?',
      message: 'Voulez-vous vraiment fermer cette application ?'
    });
    if (choix !== 1) { [0, 150, 600, 1500].forEach(d => setTimeout(rendreFocus, d)); return; } // "Annuler" (ou fermeture de la boîte de dialogue elle-même)
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
    // Version installée : outils de développement interdits (F12, Ctrl+Maj+I/J/C) — protège le code.
    if (app.isPackaged) {
      const k = String(input.key || '').toLowerCase();
      if (input.type === 'keyDown' && (k === 'f12' || (input.control && input.shift && ['i', 'j', 'c'].includes(k)))) event.preventDefault();
      return;
    }
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
    }
  });
  if (app.isPackaged) {
    win.webContents.on('devtools-opened', () => { try { win.webContents.closeDevTools(); } catch (e) {} });
  }

  // Le nom de la fenêtre est toujours « FSS-CAISSE » suivi du numéro de version, quelle que soit la page.
  win.on('page-title-updated', (e) => { e.preventDefault(); try { win.setTitle('FSS-CAISSE ' + app.getVersion()); } catch (err) {} });

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
    journalIncident('render-process-gone : ' + details.reason + ' (code ' + details.exitCode + ')');
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
    journalIncident('page non réactive');
    unresponsiveTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      journalIncident('rechargement après blocage prolongé');
      boot();
    }, 12000);
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
  try { buildMenu(); } catch (e) {}
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
    demarrerSurveillanceImprimantes();
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
          visible: loadConfig().role !== 'client',
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
          visible: loadConfig().role !== 'client',
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
          visible: !app.isPackaged && loadConfig().role !== 'client',
          click: () => win.webContents.openDevTools({ mode: 'detach' })
        },
        { role: 'quit', label: 'Quitter' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  try { if (win && !win.isDestroyed()) win.setMenuBarVisibility(false); } catch (e) {}
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

// --- Code technicien (poste client) : protège la modification de l'adresse/port du serveur ---
let techAutorise = false;
let essaisCode = 0, bloqueJusqua = 0;
function hacherCode(code, sel) { return crypto.createHash('sha256').update(sel + '|' + code).digest('hex'); }
// Accès technicien : AUCUN identifiant ni mot de passe n'est mémorisé sur ce poste. Le compte admin / super-admin
// est vérifié EN DIRECT par le serveur (adresse actuelle, ou adresse saisie si l'actuelle ne répond plus).
ipcMain.handle('verifier-code-tech', async (event, code, nom, adresse) => {
  const maintenant = Date.now();
  if (maintenant < bloqueJusqua) return { ok: false, attente: Math.ceil((bloqueJusqua - maintenant) / 1000) };
  const cfg = loadConfig();
  let base = cfg.role === 'client' && cfg.serverUrl ? cfg.serverUrl : '';
  const adr = String(adresse || '').trim();
  if (adr) { const m = adr.replace(/^https?:\/\//, '').split('/')[0]; base = 'http://' + (m.indexOf(':') === -1 ? m + ':' + PORT : m); }
  if (!base) return { ok: false, injoignable: true };
  try {
    const r = await fetch(base.replace(/\/$/, '') + '/api/verif-admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: String(nom || ''), mdp: String(code || '') }), signal: AbortSignal.timeout(4000)
    });
    if (r.status === 429) return { ok: false, attente: 30 };
    const j = await r.json().catch(() => ({}));
    if (j && j.ok) { essaisCode = 0; techAutorise = true; return { ok: true }; }
  } catch (e) { return { ok: false, injoignable: true }; }
  essaisCode++;
  if (essaisCode >= 5) { essaisCode = 0; bloqueJusqua = Date.now() + 30000; }
  journalIncident('identifiants technicien incorrects (poste client)');
  return { ok: false };
});
ipcMain.handle('ouvrir-reglage-serveur', (event, creer) => {
  if (!techAutorise) return false;
  win.loadFile(path.join(__dirname, 'client.html'), { query: creer ? { modif: '1', creer: '1' } : { modif: '1' } });
  return true;
});
ipcMain.handle('annuler-reglage-serveur', () => {
  techAutorise = false;
  const cfg = loadConfig();
  if (cfg.role === 'client' && cfg.serverUrl) win.loadURL(cfg.serverUrl); else win.loadFile(path.join(__dirname, 'client.html'));
  return true;
});
ipcMain.handle('ouvrir-acces-technicien', () => {
  const cfg = loadConfig();
  if (cfg.role !== 'client' || !cfg.serverUrl) return false;
  techAutorise = false;
  win.loadFile(path.join(__dirname, 'acces-technicien.html'));
  return true;
});
// Changer de mode (Serveur / Client) depuis un poste client : réservé à la session technicien.
ipcMain.handle('changer-de-role', () => {
  if (!techAutorise) return false;
  const cfg = loadConfig();
  delete cfg.role; delete cfg.serverUrl; delete cfg.codeTech;
  saveConfig(cfg);
  techAutorise = false;
  try { buildMenu(); } catch (e) {}
  win.loadFile(path.join(__dirname, 'choice.html'));
  return true;
});
ipcMain.handle('reessayer-serveur', () => {
  const cfg = loadConfig();
  if (cfg.role === 'client' && cfg.serverUrl) win.loadURL(cfg.serverUrl);
  return true;
});

ipcMain.handle('save-server', (event, ip, port, code) => {
  const url = 'http://' + ip + ':' + (port || PORT);
  const cfgC = loadConfig();
  const premiere = !(cfgC.role === 'client' && cfgC.serverUrl);
  const codeValide = code && String(code).length >= 4;
  // Après la première configuration, seule une session technicien (code saisi) peut modifier.
  if (!premiere && !techAutorise) return false;
  // Un code technicien est obligatoire pour toute nouvelle configuration.
  
  // Plus aucun code mémorisé sur le poste (l'accès technicien passe par le compte admin du serveur).
  delete cfgC.codeTech; delete cfgC.adminsCache;
  cfgC.role = 'client';
  cfgC.serverUrl = url;
  saveConfig(cfgC);
  techAutorise = false;
  try { buildMenu(); } catch (e) {}
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

// ---------------------------------------------------------------------
// ADRESSE IP FIXE : fixe l'adresse de ce PC (statique) dans Windows, pour qu'elle ne change plus,
// même si le DHCP du routeur reste activé. Demande l'autorisation administrateur (fenêtre Windows).
// ---------------------------------------------------------------------
function prefixVersMasque(p) { p = Math.max(0, Math.min(32, p | 0)); const b = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0; return [b >>> 24, (b >>> 16) & 255, (b >>> 8) & 255, b & 255].join('.'); }
function ipv4Valide(x) { return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(x) && x.split('.').every(n => +n <= 255); }
function ipVersInt(x) { return x.split('.').reduce((a, n) => ((a << 8) | +n) >>> 0, 0); }
ipcMain.handle('reseau-info', () => new Promise((resolve) => {
  if (process.platform !== 'win32') return resolve({ ok: false, error: 'Disponible seulement sous Windows.' });
  const cmd = "$c=Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1; if(-not $c){ '{}' } else { $i=Get-NetIPInterface -InterfaceIndex $c.InterfaceIndex -AddressFamily IPv4; [pscustomobject]@{alias=$c.InterfaceAlias; ip=$c.IPv4Address[0].IPAddress; prefix=$c.IPv4Address[0].PrefixLength; gw=$c.IPv4DefaultGateway.NextHop; dns=@($c.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses }); dhcp=($i.Dhcp -eq 'Enabled')} | ConvertTo-Json -Compress }";
  require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 15000 }, (err, out) => {
    try { const j = JSON.parse(String(out || '{}').trim() || '{}'); if (!j.ip) return resolve({ ok: false, error: 'Aucune connexion réseau active trouvée.' }); j.dns = [].concat(j.dns || []); j.masque = prefixVersMasque(j.prefix); resolve(Object.assign({ ok: true }, j)); }
    catch (e) { resolve({ ok: false, error: 'Lecture du réseau impossible.' }); }
  });
}));
function lancerScriptAdmin(lignes) {
  return new Promise((resolve) => {
    try {
      const f = path.join(os.tmpdir(), 'fss-reseau.cmd'), log = path.join(os.tmpdir(), 'fss-reseau.log');
      try { fs.unlinkSync(log); } catch (e) {}
      fs.writeFileSync(f, '@echo off\r\n' + lignes.join('\r\n') + '\r\necho FIN > "' + log + '"\r\n');
      require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Start-Process -FilePath cmd.exe -ArgumentList '/c','\"" + f + "\"' -Verb RunAs -WindowStyle Hidden -Wait"], { windowsHide: true, timeout: 90000 }, (err) => {
        let fini = false; try { fini = fs.existsSync(log); } catch (e) {}
        resolve(fini ? { ok: true } : { ok: false, error: err ? 'Autorisation administrateur refusée ou impossible.' : 'Le changement n\'a pas pu s\'exécuter.' });
      });
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}
ipcMain.handle('reseau-fixer', async (event, ip) => {
  if (process.platform !== 'win32') return { ok: false, error: 'Disponible seulement sous Windows.' };
  const cur = await new Promise((res) => require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$c=Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1; [pscustomobject]@{alias=$c.InterfaceAlias; prefix=$c.IPv4Address[0].PrefixLength; gw=$c.IPv4DefaultGateway.NextHop; dns=@($c.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses })} | ConvertTo-Json -Compress"], { windowsHide: true, timeout: 15000 }, (e, o) => { try { res(JSON.parse(String(o).trim())); } catch (x) { res(null); } }));
  if (!cur || !cur.alias || !cur.gw) return { ok: false, error: 'Réseau actif introuvable.' };
  ip = String(ip || '').trim();
  if (!ipv4Valide(ip) || !ipv4Valide(cur.gw)) return { ok: false, error: 'Adresse IP invalide.' };
  const m = ipVersInt(prefixVersMasque(cur.prefix));
  if ((ipVersInt(ip) & m) !== (ipVersInt(cur.gw) & m)) return { ok: false, error: 'Cette adresse n\'est pas dans le même réseau que le routeur (' + cur.gw + ').' };
  if (ip === cur.gw) return { ok: false, error: 'Cette adresse est celle du routeur.' };
  const alias = String(cur.alias).replace(/["%\r\n&|<>^]/g, '');
  const dns = [].concat(cur.dns || []).filter(ipv4Valide);
  if (!dns.length) dns.push(cur.gw, '8.8.8.8');
  const lignes = ['netsh interface ip set address name="' + alias + '" static ' + ip + ' ' + prefixVersMasque(cur.prefix) + ' ' + cur.gw + ' 1',
    'netsh interface ip set dns name="' + alias + '" static ' + dns[0] + ' primary'];
  if (dns[1]) lignes.push('netsh interface ip add dns name="' + alias + '" ' + dns[1] + ' index=2');
  const r = await lancerScriptAdmin(lignes);
  if (!r.ok) return r;
  await new Promise(x => setTimeout(x, 4000));
  journalIncident('adresse IP fixée sur ' + ip);
  return { ok: true, ip: ip };
});
ipcMain.handle('reseau-dhcp', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'Disponible seulement sous Windows.' };
  const alias = await new Promise((res) => require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).InterfaceAlias"], { windowsHide: true, timeout: 15000 }, (e, o) => res(String(o || '').trim())));
  if (!alias) return { ok: false, error: 'Réseau actif introuvable.' };
  const a = alias.replace(/["%\r\n&|<>^]/g, '');
  return lancerScriptAdmin(['netsh interface ip set address name="' + a + '" dhcp', 'netsh interface ip set dns name="' + a + '" dhcp']);
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
// Ouvre WhatsApp (application ou navigateur) vers le numéro de FALLSERVICES&SOLUTIONS INFO uniquement.
ipcMain.handle('ouvrir-whatsapp', (event, url) => {
  // Seuls le WhatsApp et l'e-mail de FALLSERVICES&SOLUTIONS INFO sont autorisés.
  if (typeof url !== 'string' || (url.indexOf('https://wa.me/24177378602') !== 0 && url.indexOf('mailto:fallservices241@gmail.com') !== 0)) return { ok: false };
  shell.openExternal(url);
  return { ok: true };
});
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

function imprimerSilencieuxDefaut(html) {
  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    let termine = false;
    const finir = (r) => {
      if (termine) return;
      termine = true;
      clearTimeout(garde);
      try { if (!printWin.isDestroyed()) printWin.destroy(); } catch (e) {}
      resolve(r);
    };
    // Garde-fou : une impression qui ne répond jamais ne doit pas laisser une fenêtre cachée ouverte (fuite + vol de focus).
    const garde = setTimeout(() => finir({ success: false, error: 'délai dépassé' }), 60000);
    printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(printers.adapterHtml(html, 80, 72))).catch(() => finir({ success: false, error: 'chargement impossible' }));
    printWin.webContents.on('did-fail-load', () => finir({ success: false, error: 'chargement impossible' }));
    printWin.webContents.on('did-finish-load', () => {
      try {
        printWin.webContents.print({ silent: true, printBackground: true, margins: { marginType: 'none' } }, (success, errorType) => {
          finir({ success: success, error: success ? null : errorType });
        });
      } catch (e) { finir({ success: false, error: e.message }); }
    });
  });
}

// ---------------------------------------------------------------------
// GARDE DE FOCUS : une impression (fenêtre cachée, spouleur Windows, script d'impression brute)
// peut voler le focus clavier de la fenêtre principale. Résultat : l'écran semble « figé »
// (clics et clavier sans effet) jusqu'à ce qu'on appuie sur Alt. Après chaque impression, et
// après chaque boîte de dialogue (alert/confirm), on redonne donc le focus à l'application
// — seulement si elle l'avait avant, pour ne jamais voler le focus à un autre logiciel.
// ---------------------------------------------------------------------
function rendreFocus() {
  try {
    if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
    if (!win.isFocused()) win.focus();
    win.webContents.focus();
  } catch (e) {}
}
async function avecGardeFocus(fn) {
  let avait = false;
  try { avait = !!(win && !win.isDestroyed() && win.isFocused()); } catch (e) {}
  try { return await fn(); }
  finally { if (avait) [0, 300, 1200, 3000].forEach(d => setTimeout(rendreFocus, d)); }
}
ipcMain.on('refocus', (e) => { if (win && e.sender === win.webContents) [0, 150].forEach(d => setTimeout(rendreFocus, d)); });

ipcMain.handle('print-silent', (event, html) => avecGardeFocus(() => imprimerSilencieuxDefaut(html)));

// ---------------------------------------------------------------------
// IMPRIMANTES (poste Serveur) — voir printers.js
// ---------------------------------------------------------------------
printers.init(app.getPath('userData'));
let surveillanceImprimantes = null;
let dernierAvertissementPoste = {};

function envoyerAuRenderer(canal, donnees) {
  if (win && !win.isDestroyed()) win.webContents.send(canal, donnees);
}

// Surveille les imprimantes Windows : toute imprimante nouvellement branchée
// (USB Xprinter / Epson, pilote installé...) est détectée et ajoutée toute seule.
let scanReseauEnCours = false;
function demarrerSurveillanceImprimantes() {
  if (surveillanceImprimantes) return;
  // 1) PRIORITE : détection des imprimantes RESEAU (IP) — dès le démarrage puis toutes les 45 s.
  const cycleReseau = async () => {
    if (scanReseauEnCours) return;
    scanReseauEnCours = true;
    try {
      if (!win || win.isDestroyed()) return;
      const cfg = printers.chargerConfig();
      if (cfg.autoAjoutReseau === false) return;
      const trouvees = await printers.scannerReseau({});
      const ajouts = printers.ajoutAutomatiqueReseau(trouvees);
      if (ajouts.length) envoyerAuRenderer('printers-changed', { ajouts: ajouts.map(a => a.nom) });
    } catch (e) {} finally { scanReseauEnCours = false; }
  };
  // 2) Imprimantes USB / Windows : toutes les 8 s.
  const cycle = async () => {
    try {
      if (!win || win.isDestroyed()) return;
      const liste = await printers.listerWindows(win.webContents);
      const ajouts = printers.ajoutAutomatique(liste);
      if (ajouts.length) envoyerAuRenderer('printers-changed', { ajouts: ajouts.map(a => a.nom) });
    } catch (e) {}
  };
  setTimeout(cycleReseau, 1500);
  setInterval(cycleReseau, 45000);
  setTimeout(cycle, 6000);
  surveillanceImprimantes = setInterval(cycle, 8000);
}

ipcMain.handle('printers-get', async () => {
  const cfg = printers.chargerConfig();
  const windows = win && !win.isDestroyed() ? await printers.listerWindows(win.webContents) : [];
  // état de chaque imprimante Windows configurée : branchée ou non
  cfg.printers.forEach(p => {
    if (p.type === 'windows') p.presente = windows.some(w => w.name === p.winName);
  });
  const etat = await printers.etatReseau(cfg);
  cfg.printers.forEach(p => { if (p.type === 'network') p.presente = !!etat[p.id]; });
  return { config: cfg, windows: windows, modeles: printers.MODELES };
});
ipcMain.handle('printers-save', (event, cfg) => {
  cfg.configure = true;
  printers.sauverConfig(cfg);
  return { ok: true };
});
ipcMain.handle('printers-scan', async (event) => {
  const trouvees = await printers.scannerReseau({
    progress: (faits, total) => { try { event.sender.send('printers-scan-progress', { faits: faits, total: total }); } catch (e) {} }
  });
  return { trouvees: trouvees, reseaux: printers.sousReseauxLocaux().map(r => r.base + '.x') };
});
ipcMain.handle('printers-test', async (event, imp) => {
  const r = await avecGardeFocus(() => printers.imprimerSur({ BrowserWindow }, imp, printers.htmlTest(imp)));
  return r;
});
ipcMain.handle('printers-test-port', async (event, ip, port) => printers.testerPort(ip, Number(port) || 9100, 1500));
ipcMain.handle('printers-route', async (event, demande) => {
  const r = await avecGardeFocus(() => printers.router({ BrowserWindow }, demande, imprimerSilencieuxDefaut));
  // n'avertit qu'une fois par poste (pas à chaque commande)
  if (r.avertissement) {
    const cle = demande.posteId || '?';
    if (dernierAvertissementPoste[cle]) r.avertissement = null; else dernierAvertissementPoste[cle] = true;
  }
  return r;
});
// AFFICHEUR CLIENT (afficheur de prix 2 lignes) — voir afficheur.js
afficheur.init(app.getPath('userData'));
// TIROIR-CAISSE — voir tiroir.js
tiroir.init(app.getPath('userData'));
ipcMain.handle('tiroir-get', () => tiroir.charger());
ipcMain.handle('tiroir-save', (event, cfg) => tiroir.sauver(cfg));
ipcMain.handle('tiroir-ouvrir', (event, opts) => tiroir.ouvrir(opts || {}));
ipcMain.handle('afficheur-get', () => afficheur.charger());
ipcMain.handle('afficheur-save', (event, cfg) => afficheur.sauver(cfg));
ipcMain.handle('afficheur-ports', () => afficheur.listerPorts());
ipcMain.handle('afficheur-test', (event, cfg, l1, l2) => afficheur.afficher(l1 || 'FSS-CAISSE', l2 || 'TEST AFFICHEUR OK', Object.assign({}, afficheur.charger(), cfg || {}, { actif: true })));
ipcMain.handle('afficheur-pilotes-manquants', () => afficheur.pilotesManquants());
ipcMain.handle('afficheur-open-url', (event, url) => {
  // Uniquement les pages officielles des fabricants de puces
  if (Object.values(afficheur.LIENS_PUCES).indexOf(url) === -1) return { ok: false };
  shell.openExternal(url); return { ok: true };
});
ipcMain.handle('afficheur-open-drivers', async () => {
  const candidats = [path.join(process.resourcesPath || '', 'drivers', 'afficheur'), path.join(__dirname, 'drivers', 'afficheur')];
  for (const c of candidats) { try { if (fs.existsSync(c)) { await shell.openPath(c); return { ok: true, chemin: c }; } } catch (e) {} }
  return { ok: false };
});
ipcMain.handle('afficheur-install-drivers', () => new Promise((resolve) => {
  const candidats = [path.join(process.resourcesPath || '', 'drivers'), path.join(__dirname, 'drivers')];
  const dossier = candidats.find(c => fs.existsSync(path.join(c, 'installer-pilotes-afficheur.ps1')));
  if (!dossier) return resolve({ ok: false, error: 'Script des pilotes de l\'afficheur introuvable' });
  const script = path.join(dossier, 'installer-pilotes-afficheur.ps1');
  const { execFile } = require('child_process');
  execFile('powershell.exe', ['-NoProfile', '-Command',
    "Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"" + script + "\"','-Interactif'"],
    { timeout: 600000 }, (err) => resolve(err ? { ok: false, error: err.message } : { ok: true }));
}));
ipcMain.handle('afficheur-essais', () => afficheur.essais());
ipcMain.on('afficheur-afficher', (event, l1, l2) => { afficheur.afficher(l1, l2); });
ipcMain.handle('printers-open-drivers', async () => {
  const candidats = [path.join(process.resourcesPath || '', 'drivers'), path.join(__dirname, 'drivers')];
  for (const c of candidats) {
    try { if (fs.existsSync(c)) { await shell.openPath(c); return { ok: true, chemin: c }; } } catch (e) {}
  }
  return { ok: false };
});
ipcMain.handle('printers-install-drivers', () => new Promise((resolve) => {
  const candidats = [path.join(process.resourcesPath || '', 'drivers'), path.join(__dirname, 'drivers')];
  const dossier = candidats.find(c => fs.existsSync(path.join(c, 'installer-pilotes.ps1')));
  if (!dossier) return resolve({ ok: false, error: 'Script des pilotes introuvable' });
  const script = path.join(dossier, 'installer-pilotes.ps1');
  // Lancement avec élévation (demande d'autorisation administrateur de Windows)
  const { execFile } = require('child_process');
  execFile('powershell.exe', ['-NoProfile', '-Command',
    "Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"" + script + "\"','-Interactif'"],
    { timeout: 600000 }, (err) => resolve(err ? { ok: false, error: err.message } : { ok: true }));
}));
ipcMain.handle('get-hostname', () => os.hostname());

app.whenReady().then(() => {
  if (!verrouInstance) return;
  licensing.init(app.getPath('userData'));
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
