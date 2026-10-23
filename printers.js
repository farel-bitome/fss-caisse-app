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
  { marque: 'Rongta', modele: 'RP58', papier: 58 },
  { marque: 'Rongta', modele: 'RP58-U', papier: 58 },
  { marque: 'Rongta', modele: 'RP80', papier: 80 },
  { marque: 'Rongta', modele: 'RP326', papier: 80 },
  { marque: 'Rongta', modele: 'RP327', papier: 80 },
  { marque: 'Rongta', modele: 'RP330', papier: 80 },
  { marque: 'Rongta', modele: 'RP332', papier: 80 },
  { marque: 'Rongta', modele: 'RP400', papier: 80 },
  { marque: 'Rongta', modele: 'RP410', papier: 80 },
  { marque: 'Rongta', modele: 'RPP02 (portable)', papier: 58 },
  { marque: 'Rongta', modele: 'RPP300 (portable)', papier: 80 },
  { marque: 'Rongta', modele: 'Autre Rongta 80 mm', papier: 80 },
  { marque: 'Rongta', modele: 'Autre Rongta 58 mm', papier: 58 },
  { marque: 'Star Micronics', modele: 'TSP143 (mode ESC/POS)', papier: 80 },
  { marque: 'Star Micronics', modele: 'TSP100 / TSP100III (mode ESC/POS)', papier: 80 },
  { marque: 'Star Micronics', modele: 'TSP650 / TSP650II (mode ESC/POS)', papier: 80 },
  { marque: 'Star Micronics', modele: 'TSP700II (mode ESC/POS)', papier: 80 },
  { marque: 'Star Micronics', modele: 'TSP800II (mode ESC/POS)', papier: 80 },
  { marque: 'Star Micronics', modele: 'mC-Print2', papier: 58 },
  { marque: 'Star Micronics', modele: 'mC-Print3', papier: 80 },
  { marque: 'Star Micronics', modele: 'SM-S230i (portable)', papier: 58 },
  { marque: 'Star Micronics', modele: 'SM-L300 (portable)', papier: 80 },
  { marque: 'Star Micronics', modele: 'Autre Star 80 mm', papier: 80 },
  { marque: 'Star Micronics', modele: 'Autre Star 58 mm', papier: 58 },
  { marque: 'Bixolon', modele: 'SRP-330II', papier: 80 },
  { marque: 'Bixolon', modele: 'SRP-350II', papier: 80 },
  { marque: 'Bixolon', modele: 'SRP-350III', papier: 80 },
  { marque: 'Bixolon', modele: 'SRP-350plusIII', papier: 80 },
  { marque: 'Bixolon', modele: 'SRP-275III', papier: 80 },
  { marque: 'Bixolon', modele: 'SRP-F310II', papier: 80 },
  { marque: 'Bixolon', modele: 'SRP-Q300', papier: 80 },
  { marque: 'Bixolon', modele: 'SRP-S300', papier: 80 },
  { marque: 'Bixolon', modele: 'SPP-R200III (portable)', papier: 58 },
  { marque: 'Bixolon', modele: 'SPP-R310 (portable)', papier: 80 },
  { marque: 'Bixolon', modele: 'Autre Bixolon 80 mm', papier: 80 },
  { marque: 'Bixolon', modele: 'Autre Bixolon 58 mm', papier: 58 },
  { marque: 'Citizen', modele: 'CT-S310II', papier: 80 },
  { marque: 'Citizen', modele: 'CT-S310A', papier: 80 },
  { marque: 'Citizen', modele: 'CT-S601II', papier: 80 },
  { marque: 'Citizen', modele: 'CT-S651II', papier: 80 },
  { marque: 'Citizen', modele: 'CT-S801II', papier: 80 },
  { marque: 'Citizen', modele: 'CT-S751', papier: 80 },
  { marque: 'Citizen', modele: 'CT-S2000', papier: 80 },
  { marque: 'Citizen', modele: 'CT-S4000', papier: 80 },
  { marque: 'Citizen', modele: 'CT-E351', papier: 80 },
  { marque: 'Citizen', modele: 'CMP-20II (portable)', papier: 58 },
  { marque: 'Citizen', modele: 'Autre Citizen 80 mm', papier: 80 },
  { marque: 'Citizen', modele: 'Autre Citizen 58 mm', papier: 58 },
  { marque: 'HPRT', modele: 'TP58', papier: 58 },
  { marque: 'HPRT', modele: 'TP80', papier: 80 },
  { marque: 'HPRT', modele: 'TP80K', papier: 80 },
  { marque: 'HPRT', modele: 'TP806', papier: 80 },
  { marque: 'HPRT', modele: 'TP808', papier: 80 },
  { marque: 'HPRT', modele: 'TP585', papier: 58 },
  { marque: 'HPRT', modele: 'TP584', papier: 58 },
  { marque: 'HPRT', modele: 'TP860', papier: 80 },
  { marque: 'HPRT', modele: 'Autre HPRT 80 mm', papier: 80 },
  { marque: 'HPRT', modele: 'Autre HPRT 58 mm', papier: 58 },
  // Zebra : imprimantes surtout ZPL/CPCL (pas ESC/POS) -> à utiliser via le pilote Windows (mode « Pilote Windows »).
  { marque: 'Zebra', modele: 'ZD220 (pilote Windows)', papier: 80, escpos: false },
  { marque: 'Zebra', modele: 'ZD230 (pilote Windows)', papier: 80, escpos: false },
  { marque: 'Zebra', modele: 'ZD420 (pilote Windows)', papier: 80, escpos: false },
  { marque: 'Zebra', modele: 'ZD621 (pilote Windows)', papier: 80, escpos: false },
  { marque: 'Zebra', modele: 'ZQ220 (portable, pilote Windows)', papier: 58, escpos: false },
  { marque: 'Zebra', modele: 'ZQ320 (portable, pilote Windows)', papier: 80, escpos: false },
  { marque: 'Zebra', modele: 'Autre Zebra (pilote Windows)', papier: 80, escpos: false },
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
  dossierDonnees = userDataDir;
  configFile = path.join(userDataDir, 'printers.json');
}
function configParDefaut() {
  return {
    configure: false,            // devient true dès la première sauvegarde depuis Paramètres
    autoAjoutReseau: true,       // détecter et ajouter automatiquement les imprimantes réseau (IP, port 9100) — PRIORITAIRE
    autoAjoutWindows: true,      // ajouter automatiquement les imprimantes Windows détectées
    printers: [],                // [{id,nom,type:'windows'|'network',winName,ip,port,marque,modele,papier,actif}]
    imprimanteCaisse: null,      // id : tickets de caisse, additions, clôtures, prélèvements
    routes: {},                  // { posteId: {mode:'all'} | {mode:'some', ids:[...]} }
    // Profils d'utilisateur autorisés à tout imprimer (tickets, additions, clôtures, prélèvements, rapports).
    // Les autres profils (serveurs, téléphones, autres rôles) ne peuvent imprimer QUE des bons de commande.
    profilsToutImprimer: { super: true, admin: true, caissier: true, autres: false }
  };
}
function chargerConfig() {
  try {
    const c = Object.assign(configParDefaut(), JSON.parse(fs.readFileSync(configFile, 'utf8')));
    // Migration (V7) : les imprimantes Windows ajoutées avant « ESC/POS direct par défaut » passent en
    // ESC/POS direct (largeur exacte, sans débordement) — sauf Zebra et Star.
    if (!c.modeV7) {
      c.printers.forEach(p => { if (p.type === 'windows' && p.mode !== 'escpos' && modeParMarque(p.marque) === 'escpos') p.mode = 'escpos'; });
      c.modeV7 = true;
      try { fs.writeFileSync(configFile, JSON.stringify(c, null, 2)); } catch (e) {}
    }
    return c;
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
  const total = bases.length * 254 + 9;
  const file = [];
  bases.forEach(b => { for (let i = 1; i <= 254; i++) file.push(b + '.' + i); });
  // Adresses IP d'usine des imprimantes réseau (souvent hors du réseau du PC) : testées en plus, en premier.
  const USINE = ['192.168.123.100', '192.168.192.168', '192.168.1.87', '192.168.0.87', '192.168.1.100', '192.168.0.100', '192.168.1.123', '192.168.0.123', '10.0.0.100'];
  USINE.slice().reverse().forEach(ip => { if (file.indexOf(ip) === -1) file.unshift(ip); });
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
function adapterHtml(html, papier, utile) {
  // utile = largeur réellement imprimable (mm) : 72 pour un rouleau 80 mm, 48 pour 58 mm. Par défaut = papier.
  utile = utile || papier;
  const style = '<style>@page{size:' + papier + 'mm auto;margin:0}' +
    'body{font-family:Arial,Helvetica,sans-serif !important;font-weight:900 !important;-webkit-text-stroke:0.35px currentColor;padding-left:1mm !important;padding-right:1mm !important}' +
    'html,body{box-sizing:border-box !important;width:' + utile + 'mm !important;max-width:' + utile + 'mm !important;background:#fff !important;overflow-x:hidden}' +
    'body{margin:0 auto !important}</style>';
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, style + '</head>');
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + style);
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' + style + '</head><body>' + html + '</body></html>';
}
const pause = (ms) => new Promise(r => setTimeout(r, ms));

// Marge blanche (en points d'impression, de chaque côté) : les têtes thermiques 58 mm ne
// peuvent pas toujours imprimer les premiers points du bord gauche -> les premières lettres
// étaient coupées. Valeur par défaut : 24 points (≈3 mm) en 58 mm, 16 points (≈2 mm) en 80 mm.
function margeParDefaut(papier) { return Number(papier) === 58 ? 24 : 16; }
function margeDe(imprimante, papier) {
  const m = imprimante && imprimante.marge !== undefined && imprimante.marge !== null && imprimante.marge !== '' ? Number(imprimante.marge) : NaN;
  return isFinite(m) && m >= 0 && m <= 80 ? Math.round(m) : margeParDefaut(papier);
}
async function htmlVersImage(electron, html, papier, marge) {
  const { BrowserWindow } = electron;
  const points = POINTS[papier] || POINTS[80];
  marge = marge === undefined ? margeParDefaut(papier) : marge;
  const pointsUtiles = points - 2 * marge;
  const largeurCss = Math.round((LARGEUR_CSS[papier] || LARGEUR_CSS[80]) * pointsUtiles / points);
  const win = new BrowserWindow({
    show: false, width: largeurCss, height: 600, useContentSize: true,
    webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true }
  });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(adapterHtml(html, papier, largeurCss * 25.4 / 96)));
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
    const hPoints = Math.max(1, Math.round(dim.height * pointsUtiles / dim.width));
    const redim = img.resize({ width: pointsUtiles, height: hPoints, quality: 'best' });
    const src = redim.toBitmap();
    // Toile blanche pleine largeur, contenu centré avec la marge de chaque côté.
    const out = Buffer.alloc(points * hPoints * 4, 255);
    for (let y = 0; y < hPoints; y++) {
      src.copy(out, (y * points + marge) * 4, y * pointsUtiles * 4, (y + 1) * pointsUtiles * 4);
    }
    return { bgra: out, w: points, h: hPoints };
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

function imprimerWindows(electron, html, nomWindows, papier, marge) {
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
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(adapterHtml(html, papier || 80, (Number(papier) === 58 ? 48 : 72) - 2 * (marge === undefined ? margeParDefaut(papier) : marge) * 25.4 / 203)));
  });
}


// ---------------------------------------------------------------------
// Envoi RAW (ESC/POS direct) à une imprimante Windows, quel que soit son pilote
// (y compris le pilote générique « Generic / Text Only » de Windows) : universel.
// ---------------------------------------------------------------------
const SCRIPT_RAW = `param([string]$Imprimante,[string]$Fichier)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class FssRaw {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DocInfo { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr h, int level, [In] DocInfo di);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
}
"@
$octets = [System.IO.File]::ReadAllBytes($Fichier)
$h = [IntPtr]::Zero
if (-not [FssRaw]::OpenPrinter($Imprimante, [ref]$h, [IntPtr]::Zero)) { throw "Imprimante introuvable : $Imprimante" }
try {
  $di = New-Object FssRaw+DocInfo
  $di.pDocName = 'FSS-CAISSE'; $di.pDataType = 'RAW'
  if ([FssRaw]::StartDocPrinter($h, 1, $di) -le 0) { throw 'StartDocPrinter a echoue (imprimante hors ligne ?)' }
  [void][FssRaw]::StartPagePrinter($h)
  $ecrit = 0
  if (-not [FssRaw]::WritePrinter($h, $octets, $octets.Length, [ref]$ecrit)) { throw 'WritePrinter a echoue' }
  [void][FssRaw]::EndPagePrinter($h)
  [void][FssRaw]::EndDocPrinter($h)
} finally { [void][FssRaw]::ClosePrinter($h) }
`;

let dossierDonnees = null;
function envoyerRawWindows(nomImprimante, buffer) {
  const fs = require('fs');
  const os = require('os');
  const { execFile } = require('child_process');
  return new Promise((resolve, reject) => {
    try {
      const base = dossierDonnees || os.tmpdir();
      const script = path.join(base, 'fss-raw-print.ps1');
      fs.writeFileSync(script, '\ufeff' + SCRIPT_RAW, 'utf8');
      const tmp = path.join(os.tmpdir(), 'fss-raw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.bin');
      fs.writeFileSync(tmp, buffer);
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Imprimante', nomImprimante, '-Fichier', tmp],
        { timeout: 30000, windowsHide: true }, (err, stdout, stderr) => {
          try { fs.unlinkSync(tmp); } catch (e) {}
          if (err) return reject(new Error('Envoi direct impossible : ' + ((stderr || err.message || '') + '').trim().split('\n')[0]));
          resolve();
        });
    } catch (e) { reject(e); }
  });
}

async function imprimerSur(electron, imprimante, html) {
  const papier = Number(imprimante.papier) === 58 ? 58 : 80;
  return enFile(imprimante.id, async () => {
    try {
      if (imprimante.type === 'network') {
        const img = await htmlVersImage(electron, html, papier, margeDe(imprimante, papier));
        const buf = rasterVersEscpos(img.bgra, img.w, img.h);
        await envoyerTcp(imprimante.ip, Number(imprimante.port) || 9100, buf, 10000);
        return { id: imprimante.id, nom: imprimante.nom, ok: true };
      }
      const mode = imprimante.mode || modeParMarque(imprimante.marque);
      if (imprimante.type === 'windows' && mode === 'escpos') {
        try {
          const img = await htmlVersImage(electron, html, papier, margeDe(imprimante, papier));
          await envoyerRawWindows(imprimante.winName, rasterVersEscpos(img.bgra, img.w, img.h));
          return { id: imprimante.id, nom: imprimante.nom, ok: true };
        } catch (e) {
          // Repli : si l'envoi direct échoue (imprimante non ESC/POS, pilote qui refuse le RAW...), on imprime via le pilote.
          const r2 = await imprimerWindows(electron, html, imprimante.winName, papier, margeDe(imprimante, papier));
          return { id: imprimante.id, nom: imprimante.nom, ok: r2.ok, error: r2.ok ? undefined : ('Envoi direct : ' + (e.message || e) + ' / Pilote : ' + r2.error) };
        }
      }
      const r = await imprimerWindows(electron, html, imprimante.winName, papier, margeDe(imprimante, papier));
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
function choisirCibles(cfg, kind, posteId, profil) {
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
  // Tout le reste (ticket, addition, clôture, prélèvement, rapport) : réservé aux profils autorisés.
  const autorises = Object.assign({ super: true, admin: true, caissier: true, autres: false }, cfg.profilsToutImprimer || {});
  if (profil && !autorises[profil]) {
    return { cibles: [], refus: true, avertissement: 'Votre profil ne peut imprimer que les bons de commande (réglage : Paramètres → Périphériques).' };
  }
  // Les imprimantes réservées aux « bons de commande » ne sortent jamais autre chose.
  const toutes = actives.filter(p => p.usage !== 'bons');
  const caisse = toutes.find(p => p.id === cfg.imprimanteCaisse) || toutes[0] || null;
  if (!caisse && actives.length) {
    return { cibles: [], refus: true, avertissement: 'Aucune imprimante n\'est autorisée à imprimer les tickets et rapports (toutes sont réservées aux bons de commande). Réglez-le dans Paramètres → Périphériques.' };
  }
  return { cibles: caisse ? [caisse] : [], avertissement: null };
}

async function router(electron, demande, repli) {
  const cfg = chargerConfig();
  const { cibles, avertissement, refus } = choisirCibles(cfg, demande.kind || 'ticket', demande.posteId, demande.profil);
  if (refus) return { ok: false, resultats: [], avertissement: avertissement, refus: true };
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
  if (/58|p20|p60|mobile|portable|zq220|sm-s|spp-r200|cmp-20|rpp02/i.test(nom)) return 58;
  return 80;
}
function devinerMarque(nom) {
  if (/xprinter|xp-|^xp\s/i.test(nom)) return 'Xprinter';
  if (/epson|tm-[a-z]/i.test(nom)) return 'Epson';
  if (/rongta|^rp[-\s]?\d/i.test(nom)) return 'Rongta';
  if (/star|tsp\s?\d|mc-print|sm-[sl]\d/i.test(nom)) return 'Star Micronics';
  if (/bixolon|srp-|spp-/i.test(nom)) return 'Bixolon';
  if (/citizen|ct-[se]\d|cmp-/i.test(nom)) return 'Citizen';
  if (/hprt|tp\d{2,3}/i.test(nom)) return 'HPRT';
  if (/zebra|zd\d{3}|zq\d{3}/i.test(nom)) return 'Zebra';
  return 'ESC/POS';
}
function devinerModele(nom) {
  const m = nom.match(/(XP-[A-Z0-9-]+|TM-[A-Za-z0-9]+|RP\d{2,3}[A-Z-]*|TSP\d{2,3}[A-Za-z]*|SRP-[A-Za-z0-9]+|SPP-[A-Za-z0-9]+|CT-[SE]\d+[A-Za-z]*|TP\d{2,3}[A-Z]?|ZD\d{3}|ZQ\d{3})/i);
  return m ? m[1].toUpperCase() : '';
}
// Mode d'envoi : « escpos » = image envoyée directement en ESC/POS (largeur exacte, aucun débordement,
// indépendant du pilote) ; « pilote » = impression graphique par le pilote Windows.
// Par défaut : ESC/POS pour toutes les thermiques ESC/POS ; pilote pour Zebra (ZPL) et Star (mode Star natif).
function modeParMarque(marque) {
  return /zebra|star/i.test(marque || '') ? 'pilote' : 'escpos';
}
// Imprimante créée par FSS-CAISSE avec le pilote générique de Windows : envoi ESC/POS direct.
function modeParDefaut(nom) {
  if (/universelle|universal|generic \/ text|g[ée]n[ée]rique/i.test(nom)) return 'escpos';
  return modeParMarque(devinerMarque(nom));
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
      marque: devinerMarque(w.name), modele: devinerModele(w.name), papier: devinerPapier(w.name), mode: modeParDefaut(w.name), actif: true
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


// Ajoute automatiquement les imprimantes RESEAU (IP) détectées. Retourne la liste des ajouts.
function ajoutAutomatiqueReseau(trouvees) {
  const cfg = chargerConfig();
  if (cfg.autoAjoutReseau === false) return [];
  const ajouts = [];
  trouvees.forEach(t => {
    if (cfg.printers.find(p => p.type === 'network' && p.ip === t.ip && (Number(p.port) || 9100) === (Number(t.port) || 9100))) return;
    if ((cfg.ignorees || []).indexOf('net:' + t.ip) !== -1) return;
    const imp = {
      id: nouvelId(), nom: 'Imprimante réseau ' + t.ip, type: 'network', ip: t.ip, port: Number(t.port) || 9100,
      marque: 'ESC/POS', modele: 'Générique 80 mm', papier: 80, actif: true, auto: true
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
// Etat (joignable ou non) des imprimantes réseau déjà configurées.
async function etatReseau(cfg) {
  const r = {};
  await Promise.all(cfg.printers.filter(p => p.type === 'network').map(async p => {
    r[p.id] = await testerPort(p.ip, Number(p.port) || 9100, 700);
  }));
  return r;
}

// Impression test (ticket simple)
function htmlTest(imp) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:13px;padding:1mm;text-align:center}</style></head><body>' +
    '<div style="font-size:16px">FSS-CAISSE</div><div>TEST IMPRESSION</div><div>------------------------</div>' +
    '<div>' + (imp.nom || '') + '</div><div>' + (imp.marque || '') + ' ' + (imp.modele || '') + '</div>' +
    '<div>Papier réglé : ' + (imp.papier || 80) + ' mm</div>' +
    '<div style="border:2px solid #000;margin:6px 0;padding:4px 2px;font-size:11px">◄ Les 2 traits verticaux doivent être visibles ►<br>Sinon : réglez le papier sur 58 mm</div>' +
    (imp.type === 'network' ? '<div>' + imp.ip + ':' + (imp.port || 9100) + '</div>' : '') +
    '<div>' + new Date().toLocaleString('fr-FR') + '</div><div>OK éàèçù €</div></body></html>';
}

module.exports = {
  MODELES, POINTS, ajoutAutomatiqueReseau, etatReseau, envoyerRawWindows, SCRIPT_RAW, init, chargerConfig, sauverConfig, nouvelId, rasterVersEscpos, envoyerTcp,
  scannerReseau, sousReseauxLocaux, testerPort, listerWindows, ajoutAutomatique, imprimerSur,
  router, choisirCibles, htmlTest, adapterHtml, htmlVersImage
};
