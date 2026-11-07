// Afficheur client (afficheur de prix à 2 lignes, type Senor / Epson DM-D / Posiflex...)
// relié par un port série (COM physique ou USB-série). Aucun module natif : on écrit
// directement dans le port Windows (\\.\COM3) après l'avoir configuré avec « mode ».
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DEFAUT = { actif: false, port: 'COM3', baud: 9600, protocole: 'simple', largeur: 20, accueil: 'BIENVENUE', accueil2: '' };
let fichier = null;
let fd = null, fdPort = null;

function init(dossierDonnees) { fichier = path.join(dossierDonnees, 'afficheur.json'); }
function charger() {
  try { return Object.assign({}, DEFAUT, JSON.parse(fs.readFileSync(fichier, 'utf8'))); } catch (e) { return Object.assign({}, DEFAUT); }
}
function sauver(cfg) {
  const c = Object.assign({}, DEFAUT, cfg || {});
  c.baud = parseInt(c.baud, 10) || 9600; c.largeur = parseInt(c.largeur, 10) || 20;
  fermer();
  try { fs.writeFileSync(fichier, JSON.stringify(c, null, 2)); } catch (e) {}
  return c;
}

// Texte -> ASCII sûr (les afficheurs n'ont pas les accents)
function ascii(t) {
  return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[œŒ]/g, 'oe').replace(/[^\x20-\x7e]/g, ' ');
}
function ligne(t, larg, droite) {
  t = ascii(t).slice(0, larg);
  return droite ? t.padStart(larg, ' ') : t.padEnd(larg, ' ');
}
// Construit les octets à envoyer pour 2 lignes, selon le protocole de l'afficheur
// Montant seul pour un afficheur numérique : dernier nombre de la ligne « TOTAL » (sinon de la 1re ligne), sans espaces
function montantLed(l1, l2) {
  const dernier = (t) => { const m = String(t || '').match(/(\d[\d\s\u00a0\u202f.,]*)\s*$/); return m ? m[1].replace(/\D/g, '') : ''; };
  return (dernier(l2) || dernier(l1) || '0').replace(/^0+(?=\d)/, '').slice(-8);
}
function trame(l1, l2, cfg) {
  const L = cfg.largeur || 20, a = ligne(l1, L), b = ligne(l2, L);
  const B = (s) => Buffer.from(s, 'latin1');
  switch (cfg.protocole) {
    case 'cd5220': // CD5220 / « ESC Q A » : ligne haute puis basse
      return Buffer.concat([B('\x1b\x40'), B('\x1bQA' + a.trimEnd() + '\r'), B('\x1bQB' + b.trimEnd() + '\r')]);
    case 'escpos': // Epson DM-D / ESC-POS : positionnement explicite (US $ colonne ligne)
      return Buffer.concat([B('\x1b\x40'), B('\x0c'), B('\x1f\x24\x01\x01' + a), B('\x1f\x24\x01\x02' + b)]);
    case 'aedex': // AEDEX / « ESC [ » : effacer puis 2 lignes
      return Buffer.concat([B('\x1b\x5b\x32\x4a'), B('\x1b\x5b\x31\x3b\x31\x48' + a), B('\x1b\x5b\x32\x3b\x31\x48' + b)]);
    case 'led': // Afficheur LED 7 segments (montant seul, ex. caisse F10) : ESC s 2 (total) + ESC Q A montant CR
      return Buffer.concat([B('\x1b\x73\x32'), B('\x1bQA' + montantLed(l1, l2) + '\r')]);
    case 'led2': // LED 7 segments, variante simple : montant + retour chariot
      return B(montantLed(l1, l2) + '\r');
    default: // « simple » : effacer + 2 lignes complètes (retour à la ligne automatique de l'afficheur)
      return Buffer.concat([B('\x0c'), B(a + b)]);
  }
}
function cheminPort(p) {
  p = String(p || '').trim();
  return /^COM\d+$/i.test(p) ? '\\\\.\\' + p.toUpperCase() : p;
}
function configurerPort(cfg) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32' || !/^COM\d+$/i.test(String(cfg.port))) return resolve();
    execFile('cmd.exe', ['/c', 'mode', cfg.port.toUpperCase() + ':', 'BAUD=' + cfg.baud, 'PARITY=n', 'DATA=8', 'STOP=1', 'to=off', 'xon=off', 'odsr=off', 'octs=off', 'dtr=on', 'rts=on'],
      { windowsHide: true, timeout: 5000 }, () => resolve());
  });
}
// Ne jamais bloquer le processus principal : un port série mal branché peut faire attendre indéfiniment
// une écriture synchrone et figer TOUTE l'application. Tout passe donc par des appels asynchrones avec délai maximum.
function avecDelai(promesse, ms, msg) {
  let t;
  return Promise.race([promesse, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg || 'Port série sans réponse')), ms); })]).finally(() => clearTimeout(t));
}
function fermer() { const f = fd; fd = null; fdPort = null; try { if (f !== null) fs.close(f, () => {}); } catch (e) {} }
async function ouvrir(cfg) {
  const cle = cfg.port + '|' + cfg.baud;
  if (fd !== null && fdPort === cle) return;
  fermer();
  await configurerPort(cfg);
  fd = await avecDelai(new Promise((res, rej) => fs.open(cheminPort(cfg.port), 'w', (e, f) => e ? rej(e) : res(f))), 3000, 'Ouverture du port ' + cfg.port + ' impossible (délai dépassé)');
  fdPort = cle;
}
// Écriture brute ponctuelle sur un port série (ouverture, envoi, fermeture) — utilisé aussi par le tiroir-caisse
async function ecrirePort(port, baud, buffer) {
  const cfg = { port: String(port || '').trim(), baud: parseInt(baud, 10) || 9600 };
  await configurerPort(cfg);
  const f = await avecDelai(new Promise((res, rej) => fs.open(cheminPort(cfg.port), 'w', (e, h) => e ? rej(e) : res(h))), 3000, 'Ouverture du port ' + cfg.port + ' impossible (délai dépassé)');
  try { await avecDelai(new Promise((res, rej) => fs.write(f, buffer, (e) => e ? rej(e) : res())), 3000, 'Écriture sur ' + cfg.port + ' bloquée (délai dépassé)'); }
  finally { try { fs.close(f, () => {}); } catch (e) {} }
}
let chaine = Promise.resolve();
// Envoie 2 lignes (les envois sont mis en file pour rester dans l'ordre)
function afficher(l1, l2, cfgForcee) {
  const cfg = cfgForcee || charger();
  if (!cfg.actif && !cfgForcee) return Promise.resolve({ ok: true, ignore: true });
  chaine = chaine.then(async () => {
    try {
      await ouvrir(cfg);
      const f = fd, buf = trame(l1, l2, cfg);
      await avecDelai(new Promise((res, rej) => fs.write(f, buf, (e) => e ? rej(e) : res())), 3000, 'Écriture sur l\'afficheur bloquée (délai dépassé)');
      return { ok: true };
    } catch (e) { fermer(); return { ok: false, error: e.message }; }
  });
  return chaine;
}
const PUCES = { '0403': 'FTDI', '067B': 'Prolific PL2303', '1A86': 'CH340/CH341 (QinHeng)', '10C4': 'Silicon Labs CP210x', '0557': 'ATEN', '04B8': 'Epson', '0DD4': 'Custom', '1CBE': 'TI / POS', '0483': 'STMicroelectronics', '03EB': 'Atmel' };
const MOTS_AFFICHEUR = /display|afficheur|vfd|pole|senor|posiflex|epson|bematech|partner|aures|wincor|hp |toshiba|ncr|logic ?controls|bixolon|cd5220/i;
function listerPorts() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve([]);
    const cmd = "Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\\(COM\\d+\\)' } | ForEach-Object { $_.Name + '|' + $_.Manufacturer + '|' + $_.PNPDeviceID }";
    execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true, timeout: 8000 }, (err, out) => {
      const l = String(out || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(ln => {
        const [nom, fab, id] = ln.split('|');
        const port = (/\((COM\d+)\)/.exec(nom) || [])[1];
        const m = /VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(id || '');
        const vid = m ? m[1].toUpperCase() : '', pid = m ? m[2].toUpperCase() : '';
        const puce = PUCES[vid] || '';
        const integre = /^ACPI|^PCI/i.test(id || ''); // vrai port série de la carte mère (RS232 intégré)
        const probable = integre || !!puce || MOTS_AFFICHEUR.test(nom + ' ' + fab);
        return { nom, port, fabricant: fab || '', vid, pid, puce, integre, probable };
      }).filter(x => x.port);
      resolve(l);
    });
  });
}
const LIENS_PUCES = {
  'FTDI': 'https://ftdichip.com/drivers/vcp-drivers/',
  'Prolific PL2303': 'https://www.prolific.com.tw/US/ShowProduct.aspx?p_id=225&pcid=41',
  'CH340/CH341 (QinHeng)': 'https://www.wch-ic.com/downloads/CH341SER_EXE.html',
  'Silicon Labs CP210x': 'https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers'
};
// Périphériques USB dont le pilote n'est pas installé (point d'exclamation dans le Gestionnaire de périphériques)
function pilotesManquants() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve([]);
    const cmd = "Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $_.PNPDeviceID -match '^USB\\\\VID_' } | ForEach-Object { $_.Name + '|' + $_.PNPDeviceID }";
    execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true, timeout: 8000 }, (err, out) => {
      resolve(String(out || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(ln => {
        const [nom, id] = ln.split('|');
        const m = /VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(id || '');
        const vid = m ? m[1].toUpperCase() : '';
        const puce = PUCES[vid] || '';
        return { nom: nom || 'Périphérique inconnu', vid, pid: m ? m[2].toUpperCase() : '', puce, lien: LIENS_PUCES[puce] || '' };
      }));
    });
  });
}
// Liste des essais pour la détection automatique (le plus courant d'abord)
function essais() {
  const protos = ['simple', 'escpos', 'cd5220', 'aedex', 'led', 'led2'], bauds = [9600, 19200, 2400, 4800, 38400, 115200], r = [];
  bauds.forEach(b => protos.forEach(p => r.push({ baud: b, protocole: p })));
  return r;
}
module.exports = { montantLed, init, charger, sauver, afficher, ecrirePort, listerPorts, pilotesManquants, LIENS_PUCES, essais, trame, ascii, ligne, DEFAUT };
