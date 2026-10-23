// =====================================================================
// FSS-CAISSE — Gestion des imprimantes (processus principal, poste Serveur)
//
// - Imprimantes Windows (USB / pilote installé : Xprinter, Epson, etc.)
// - Imprimantes réseau (IP, port 9100) en ESC/POS "image" : fonctionne avec
//   toutes les Xprinter et Epson TM (et la plupart des imprimantes ESC/POS)
// - Détection automatique (Windows + analyse du réseau local)
// - Affectation : quel poste (client) imprime ses bons de commande sur
//   quelle(s) imprimante(s), ou sur toutes
// Toute la configuration est enregistrée une fois pour toutes dans
// <userData>/printers.json, puis tout est automatique (aucune question).
// =====================================================================
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');

// ---------------------------------------------------------------------
// Modèles pré-configurés : largeur de papier + nombre de points par ligne.
// 58 mm = 384 points, 80 mm = 576 points (tous ESC/POS, 203 dpi).
// ---------------------------------------------------------------------
const MODELES = [
  { marque: 'Xprinter', modele: 'XP-58IIH', papier: 58 },
  { marque: 'Xprinter', modele: 'XP-58IIL', papier: 58 },
  { marque: 'Xprinter', modele: 'XP-58III', papier: 58 },
  { marque: 'Xprinter', modele: 'XP-58IIIT', papier: 58 },
  { marque: 'Xprinter', modele: 'XP-58IV', papier: 58 },
  { marque: 'Xprinter', modele: 'XP-P300 (portable)', papier: 58 },
  { marque: 'Xprinter', modele: 'XP-P323B', papier: 58 },
  { marque: 'Xprinter', modele: 'XP-T58K', papier: 58 },
  { marque: 'Xprinter', modele: 'XP-Q90EC', papier: 58 },
  { marque: 'Xprinter', modele: 'XP-80C', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-80T', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-80IIH', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-N160II', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-N160I', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-Q200', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-Q300', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-Q800', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-T80Q', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-T890H', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-D200N', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-H300N', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-A160M', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-365B', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-420B', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-C260-K', papier: 80 },
  { marque: 'Xprinter', modele: 'XP-E200M', papier: 80 },
  { marque: 'Xprinter', modele: 'Autre Xprinter 80 mm', papier: 80 },
  { marque: 'Xprinter', modele: 'Autre Xprinter 58 mm', papier: 58 },
  { marque: 'Epson', modele: 'TM-T20', papier: 80 },
  { marque: 'Epson', modele: 'TM-T20II', papier: 80 },
  { marque: 'Epson', modele: 'TM-T20III', papier: 80 },
  { marque: 'Epson', modele: 'TM-T20IV', papier: 80 },
  { marque: 'Epson', modele: 'TM-T20X', papier: 80 },
  { marque: 'Epson', modele: 'TM-T70', papier: 80 },
  { marque: 'Epson', modele: 'TM-T70II', papier: 80 },
  { marque: 'Epson', modele: 'TM-T82', papier: 80 },
  { marque: 'Epson', modele: 'TM-T82II', papier: 80 },
  { marque: 'Epson', modele: 'TM-T82III', papier: 80 },
  { marque: 'Epson', modele: 'TM-T82X', papier: 80 },
  { marque: 'Epson', modele: 'TM-T88III', papier: 80 },
  { marque: 'Epson', modele: 'TM-T88IV', papier: 80 },
  { marque: 'Epson', modele: 'TM-T88V', papier: 80 },
  { marque: 'Epson', modele: 'TM-T88VI', papier: 80 },
  { marque: 'Epson', modele: 'TM-T88VII', papier: 80 },
  { marque: 'Epson', modele: 'TM-T100', papier: 80 },
  { marque: 'Epson', modele: 'TM-L90', papier: 80 },
  { marque: 'Epson', modele: 'TM-H6000IV', papier: 80 },
  { marque: 'Epson', modele: 'TM-m30', papier: 80 },
  { marque: 'Epson', modele: 'TM-m30II', papier: 80 },
  { marque: 'Epson', modele: 'TM-m50', papier: 80 },
  { marque: 'Epson', modele: 'TM-U220 (matricielle)', papier: 80 },
  { marque: 'Epson', modele: 'TM-P20 (portable)', papier: 58 },
  { marque: 'Epson', modele: 'TM-P60II (portable)', papier: 58 },
  { marque: 'Epson', modele: 'TM-P80 (portable)', papier: 80 },
  { marque: 'ESC/POS', modele: 'Générique 80 mm', papier: 80 },
  { marque: 'ESC/POS', modele: 'Générique 58 mm', papier: 58 }
];

const POINTS = { 58: 384, 80: 576 };
const LARGEUR_CSS = { 58: 219, 80: 302 }; // 58 mm et 80 mm en pixels CSS (96 dpi)

// Imprimantes Windows "virtuelles" à ne jamais ajouter automatiquement.
const VIRTUELLES = /pdf|xps|onenote|fax|microsoft print|document writer|anydesk|snagit|virtual|cutepdf|primopdf|send to|envoyer vers/i;

// ---------------------------------------------------------------------
// Configuration persistante
// ---------------------------------------------------------------------
let configFile = null;
function init(userDataDir) {
  configFile = path.join(userDataDir, 'printers.json');
}
function configParDefaut() {
  return {
    configure: false,            // devient true dès la première sauvegarde depuis Paramètres
    autoAjoutWindows: true,      // ajouter automatiquement les imprimantes Windows détectées
    printers: [],                // [{id,nom,type:'windows'|'network',winName,ip,port,marque,modele,papier,actif}]
    imprimanteCaisse: null,      // id : tickets de caisse, additions, clôtures, prélèvements
    routes: {}                   // { posteId: {mode:'all'} | {mode:'some', ids:[...]} }
  };
}
function chargerConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    return Object.assign(configParDefaut(), c);
  } catch (e) {
    return configParDefaut();
  }
}
function sauverConfig(cfg) {
  const tmp = configFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, configFile);
  return cfg;
}
function nouvelId() {
  return 'P' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------------
// ESC/POS : image raster (GS v 0) + coupe
// ---------------------------------------------------------------------
// bgra : tampon BGRA (comme NativeImage.getBitmap()), w x h déjà à la
// largeur exacte en points. Retourne un Buffer prêt à envoyer.
function rasterVersEscpos(bgra, w, h, options) {
  options = options || {};
  const octetsParLigne = Math.ceil(w / 8);
  const seuil = options.seuil || 170;
  const BANDE = 128; // lignes par commande raster : compatible avec les modèles bon marché
  const morceaux = [Buffer.from([0x1b, 0x40])]; // ESC @ : initialisation
  for (let y0 = 0; y0 < h; y0 += BANDE) {
    const hb = Math.min(BANDE, h - y0);
    const data = Buffer.alloc(octetsParLigne * hb);
    for (let y = 0; y < hb; y++) {
      for (let x = 0; x < w; x++) {
        const i = ((y0 + y) * w + x) * 4;
        const a = bgra[i + 3];
        // transparent => blanc ; sinon luminance
        const lum = a === 0 ? 255 : (bgra[i] * 0.114 + bgra[i + 1] * 0.587 + bgra[i + 2] * 0.299);
        if (lum < seuil) data[y * octetsParLigne + (x >> 3)] |= (0x80 >> (x & 7));
      }
    }
    // GS v 0 m xL xH yL yH
    morceaux.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, octetsParLigne & 0xff, (octetsParLigne >> 8) & 0xff, hb & 0xff, (hb >> 8) & 0xff]));
    morceaux.push(data);
  }
  morceaux.push(Buffer.from([0x1b, 0x64, 0x04])); // avance de 4 lignes
  if (options.coupe !== false) morceaux.push(Buffer.from([0x1d, 0x56, 0x01])); // coupe partielle
  return Buffer.concat(morceaux);
}

function envoyerTcp(ip, port, buffer, timeoutMs) {
  return new Promise((resolve, reject) => {
    const s = new net.Socket();
    let fini = false;
    const fin = (err) => {
      if (fini) return;
      fini = true;
      try { s.destroy(); } catch (e) {}
      if (err) reject(err); else resolve();
    };
    s.setTimeout(timeoutMs || 8000);
    s.on('timeout', () => fin(new Error('Délai dépassé — imprimante ' + ip + ' injoignable')));
    s.on('error', (e) => {
      let msg = e.message;
      if (e.code === 'ECONNREFUSED') msg = 'Connexion refusée par ' + ip + ':' + port + ' (mauvais port ?)';
      else if (e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH') msg = 'Imprimante ' + ip + ' injoignable (éteinte ou hors réseau)';
      fin(new Error(msg));
    });
    s.connect(port, ip, () => {
      s.write(buffer, (err) => {
        if (err) return fin(err);
        // laisse le temps à l'imprimante de recevoir le tampon avant de fermer
        s.end();
      });
    });
    s.on('close', () => fin());
  });
}

// ---------------------------------------------------------------------
// Détection réseau : sous-réseaux locaux, port 9100 ouvert
// ---------------------------------------------------------------------
function sousReseauxLocaux() {
  const res = [];
  const nets = os.networkInterfaces();
  for (const nom of Object.keys(nets)) {
    for (const n of nets[nom]) {
      if (n.family !== 'IPv4' || n.internal) continue;
      if (n.address.startsWith('169.254.')) continue;
      if (/virtualbox|vmware|hyper-v|docker|wsl|vethernet|bluetooth|tailscale|zerotier/i.test(nom)) continue;
      const base = n.address.split('.').slice(0, 3).join('.');
      if (!res.find(r => r.base === base)) res.push({ base: base, monIp: n.address });
    }
  }
  return res;
}
function testerPort(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let fini = false;
    const fin = (ok) => { if (fini) return; fini = true; try { s.destroy(); } catch (e) {} resolve(ok); };
    s.setTimeout(timeoutMs || 450);
    s.on('connect', () => fin(true));
    s.on('timeout', () => fin(false));
    s.on('error', () => fin(false));
    s.connect(port, ip);
  });
}
async function scannerReseau(options) {
  options = options || {};
  const port = options.port || 9100;
  const bases = options.bases || sousReseauxLocaux().map(r => r.base);
  const trouvees = [];
  let faits = 0;
  const total = bases.length * 254;
  const file = [];
  bases.forEach(b => { for (let i = 1; i <= 254; i++) file.push(b + '.' + i); });
  const CONCURRENCE = options.concurrence || 80;
  async function ouvrier() {
    while (file.length) {
      const ip = file.shift();
      const ouvert = await testerPort(ip, port, options.timeout || 450);
      if (ouvert) trouvees.push({ ip: ip, port: port });
      faits++;
      if (options.progress && (faits % 20 === 0 || faits === total)) options.progress(faits, total);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCE }, ouvrier));
  trouvees.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
  return trouvees;
}

// ---------------------------------------------------------------------
// Rendu HTML -> image monochrome (fenêtre cachée Electron)
// ---------------------------------------------------------------------
function adapterHtml(html, papier) {
  const style = '<style>@page{size:' + papier + 'mm auto;margin:0}' +
    'body{font-family:Arial,Helvetica,sans-serif !important;font-weight:900 !important;-webkit-text-stroke:0.35px currentColor;padding-left:1mm !important;padding-right:1mm !important}' +
    'html,body{box-sizing:border-box !important;width:' + papier + 'mm !important;max-width:' + papier + 'mm !important;background:#fff !important;overflow-x:hidden}</style>';
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, style + '</head>');
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + style);
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' + style + '</head><body>' + html + '</body></html>';
}
const pause = (ms) => new Promise(r => setTimeout(r, ms));

async function htmlVersImage(electron, html, papier) {
  const { BrowserWindow } = electron;
  const largeurCss = LARGEUR_CSS[papier] || LARGEUR_CSS[80];
  const points = POINTS[papier] || POINTS[80];
  const win = new BrowserWindow({
    show: false, width: largeurCss, height: 600, useContentSize: true,
    webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true }
  });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(adapterHtml(html, papier)));
    await pause(250);
    // Hauteur réelle du contenu (et non celle de la fenêtre : scrollHeight vaut au moins la
    // hauteur de la fenêtre, ce qui ajouterait un grand blanc en bas du ticket).
    const hauteur = await win.webContents.executeJavaScript(
      '(function(){var b=document.body.getBoundingClientRect();var cs=getComputedStyle(document.body);' +
      'return Math.max(document.documentElement.getBoundingClientRect().height, b.bottom + (parseFloat(cs.marginBottom)||0));})()');
    const h = Math.max(40, Math.min(12000, Math.ceil(hauteur) + 4));
    win.setContentSize(largeurCss, h);
    await pause(250);
    let img = await win.webContents.capturePage({ x: 0, y: 0, width: largeurCss, height: h });
    if (img.isEmpty()) { await pause(400); img = await win.webContents.capturePage(); }
    if (img.isEmpty()) throw new Error('Rendu du ticket impossible (image vide)');
    const dim = img.getSize();
    const hPoints = Math.max(1, Math.round(dim.height * points / dim.width));
    const redim = img.resize({ width: points, height: hPoints, quality: 'best' });
    return { bgra: redim.toBitmap(), w: points, h: hPoints };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

// ---------------------------------------------------------------------
// Impression sur UNE imprimante
// ---------------------------------------------------------------------
const files = {}; // une file d'attente par imprimante (jamais deux travaux en même temps)
function enFile(cle, fn) {
  const prec = files[cle] || Promise.resolve();
  const suite = prec.catch(() => {}).then(fn);
  files[cle] = suite.catch(() => {});
  return suite;
}

function imprimerWindows(electron, html, nomWindows, papier) {
  const { BrowserWindow } = electron;
  return new Promise((resolve) => {
    const w = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    let termine = false;
    const fin = (r) => { if (termine) return; termine = true; if (!w.isDestroyed()) w.close(); resolve(r); };
    const garde = setTimeout(() => fin({ ok: false, error: 'Délai dépassé (spouleur Windows)' }), 30000);
    w.webContents.on('did-fail-load', (e, code, desc) => { clearTimeout(garde); fin({ ok: false, error: 'Chargement impossible : ' + desc }); });
    w.webContents.on('did-finish-load', () => {
      const opts = { silent: true, printBackground: true, margins: { marginType: 'none' } };
      if (nomWindows) opts.deviceName = nomWindows;
      w.webContents.print(opts, (ok, raison) => {
        clearTimeout(garde);
        fin(ok ? { ok: true } : { ok: false, error: 'Échec impression Windows : ' + (raison || 'imprimante indisponible') });
      });
    });
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(adapterHtml(html, papier || 80)));
  });
}

async function imprimerSur(electron, imprimante, html) {
  const papier = Number(imprimante.papier) === 58 ? 58 : 80;
  return enFile(imprimante.id, async () => {
    try {
      if (imprimante.type === 'network') {
        const img = await htmlVersImage(electron, html, papier);
        const buf = rasterVersEscpos(img.bgra, img.w, img.h);
        await envoyerTcp(imprimante.ip, Number(imprimante.port) || 9100, buf, 10000);
        return { id: imprimante.id, nom: imprimante.nom, ok: true };
      }
      const r = await imprimerWindows(electron, html, imprimante.winName, papier);
      return { id: imprimante.id, nom: imprimante.nom, ok: r.ok, error: r.error };
    } catch (e) {
      return { id: imprimante.id, nom: imprimante.nom, ok: false, error: e.message || String(e) };
    }
  });
}

// ---------------------------------------------------------------------
// Aiguillage automatique
//   kind 'commande' : bons de commande -> imprimantes affectées au poste émetteur
//   autres (ticket, addition, cloture, prelevement) -> imprimante de caisse
// ---------------------------------------------------------------------
function choisirCibles(cfg, kind, posteId) {
  const actives = cfg.printers.filter(p => p.actif !== false);
  if (kind === 'commande') {
    const r = cfg.routes[posteId];
    if (r && r.mode === 'all') return { cibles: actives, avertissement: null };
    if (r && r.mode === 'some') {
      const cibles = actives.filter(p => (r.ids || []).indexOf(p.id) !== -1);
      if (cibles.length) return { cibles: cibles, avertissement: null };
    }
    // Poste non configuré : on retombe sur l'imprimante de caisse (pour ne JAMAIS perdre un bon)
    const caisse = actives.find(p => p.id === cfg.imprimanteCaisse) || actives[0];
    return { cibles: caisse ? [caisse] : [], avertissement: 'Ce poste n\'a pas d\'imprimante affectée — bon envoyé sur l\'imprimante de caisse. Configurez-le dans Paramètres → Périphériques.' };
  }
  const caisse = actives.find(p => p.id === cfg.imprimanteCaisse) || null;
  return { cibles: caisse ? [caisse] : [], avertissement: null };
}

async function router(electron, demande, repli) {
  const cfg = chargerConfig();
  const { cibles, avertissement } = choisirCibles(cfg, demande.kind || 'ticket', demande.posteId);
  if (!cibles.length) {
    // Aucune imprimante configurée : comportement d'avant (imprimante Windows par défaut)
    const r = await repli(demande.html);
    return { ok: !!(r && r.success !== false), resultats: [{ nom: 'Imprimante Windows par défaut', ok: !!(r && r.success !== false), error: r && r.error }], avertissement: null };
  }
  const resultats = await Promise.all(cibles.map(p => imprimerSur(electron, p, demande.html)));
  return { ok: resultats.every(r => r.ok), resultats: resultats, avertissement: avertissement };
}

// ---------------------------------------------------------------------
// Détection Windows + ajout automatique
// ---------------------------------------------------------------------
function devinerPapier(nom) {
  if (/58|p20|p60|mobile|portable/i.test(nom)) return 58;
  return 80;
}
function devinerMarque(nom) {
  if (/xprinter|xp-|^xp\s/i.test(nom)) return 'Xprinter';
  if (/epson|tm-/i.test(nom)) return 'Epson';
  return 'ESC/POS';
}
function devinerModele(nom) {
  const m = nom.match(/(XP-[A-Z0-9-]+|TM-[A-Za-z0-9]+)/i);
  return m ? m[1].toUpperCase() : '';
}
async function listerWindows(webContents) {
  try {
    const l = await webContents.getPrintersAsync();
    return l.map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault, status: p.status, virtuelle: VIRTUELLES.test(p.name) }));
  } catch (e) {
    return [];
  }
}
// Ajoute automatiquement les nouvelles imprimantes Windows. Retourne la liste des ajouts.
function ajoutAutomatique(listeWindows) {
  const cfg = chargerConfig();
  if (!cfg.autoAjoutWindows) return [];
  const ajouts = [];
  listeWindows.forEach(w => {
    if (w.virtuelle) return;
    if (cfg.printers.find(p => p.type === 'windows' && p.winName === w.name)) return;
    if ((cfg.ignorees || []).indexOf(w.name) !== -1) return;
    const imp = {
      id: nouvelId(), nom: w.displayName, type: 'windows', winName: w.name,
      marque: devinerMarque(w.name), modele: devinerModele(w.name), papier: devinerPapier(w.name), actif: true
    };
    cfg.printers.push(imp);
    ajouts.push(imp);
  });
  if (ajouts.length) {
    if (!cfg.imprimanteCaisse) cfg.imprimanteCaisse = ajouts[0].id;
    sauverConfig(cfg);
  }
  return ajouts;
}

// Impression test (ticket simple)
function htmlTest(imp) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:13px;padding:3mm;text-align:center}</style></head><body>' +
    '<div style="font-size:16px">FSS-CAISSE</div><div>TEST IMPRESSION</div><div>------------------------</div>' +
    '<div>' + (imp.nom || '') + '</div><div>' + (imp.marque || '') + ' ' + (imp.modele || '') + '</div>' +
    '<div>Papier ' + (imp.papier || 80) + ' mm</div>' +
    (imp.type === 'network' ? '<div>' + imp.ip + ':' + (imp.port || 9100) + '</div>' : '') +
    '<div>' + new Date().toLocaleString('fr-FR') + '</div><div>OK éàèçù €</div></body></html>';
}

module.exports = {
  MODELES, POINTS, init, chargerConfig, sauverConfig, nouvelId, rasterVersEscpos, envoyerTcp,
  scannerReseau, sousReseauxLocaux, testerPort, listerWindows, ajoutAutomatique, imprimerSur,
  router, choisirCibles, htmlTest, adapterHtml, htmlVersImage
};
