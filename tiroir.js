// Tiroir-caisse : ouverture automatique à chaque vente.
// Deux branchements possibles :
//  - « imprimante » (le plus courant) : le tiroir est relié à l'imprimante de caisse (prise RJ11/RJ12) ;
//    on envoie l'impulsion ESC/POS « ESC p » à cette imprimante (USB/Windows ou réseau IP).
//  - « com » : le tiroir est relié à un port série du PC (ou du terminal Senor).
const fs = require('fs');
const path = require('path');
const printers = require('./printers');
const afficheur = require('./afficheur');

const DEFAUT = { actif: false, mode: 'imprimante', port: 'COM1', baud: 9600, broche: '2', duree: 100, quand: 'especes' };
let fichier = null;
function init(dossier) { fichier = path.join(dossier, 'tiroir.json'); }
function charger() { try { return Object.assign({}, DEFAUT, JSON.parse(fs.readFileSync(fichier, 'utf8'))); } catch (e) { return Object.assign({}, DEFAUT); } }
function sauver(c) {
  const t = Object.assign({}, DEFAUT, c || {});
  t.baud = parseInt(t.baud, 10) || 9600; t.duree = Math.min(500, Math.max(20, parseInt(t.duree, 10) || 100));
  try { fs.writeFileSync(fichier, JSON.stringify(t, null, 2)); } catch (e) {}
  return t;
}
// Octets ESC/POS : ESC p m t1 t2  (m = broche 0 ou 1 ; t1/t2 en unités de 2 ms)
function impulsion(t) {
  const t1 = Math.min(255, Math.max(1, Math.round((t.duree || 100) / 2))), t2 = Math.min(255, t1 * 2);
  const b = (m) => Buffer.from([0x1b, 0x70, m, t1, t2]);
  if (String(t.broche) === '5') return b(1);
  if (String(t.broche) === 'les deux') return Buffer.concat([b(0), b(1)]);
  return b(0);
}
async function ouvrir(opts) {
  opts = opts || {};
  const t = Object.assign(charger(), opts.cfg || {});
  if (!opts.force) {
    if (!t.actif) return { ok: true, ignore: true };
    if (t.quand === 'especes' && opts.pay && opts.pay !== 'Espèces') return { ok: true, ignore: true };
  }
  const octets = impulsion(t);
  try {
    if (t.mode === 'com') {
      await afficheur.ecrirePort(t.port, t.baud, octets);
      return { ok: true };
    }
    const cfg = printers.chargerConfig();
    const actives = (cfg.printers || []).filter(p => p.actif !== false);
    const caisse = actives.find(p => p.id === cfg.imprimanteCaisse) || actives.find(p => p.usage !== 'bons') || actives[0];
    if (!caisse) return { ok: false, error: 'Aucune imprimante de caisse configurée (Paramètres → Périphériques)' };
    if (caisse.type === 'network') await printers.envoyerTcp(caisse.ip, Number(caisse.port) || 9100, octets, 6000);
    else await printers.envoyerRawWindows(caisse.winName, octets);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
}
module.exports = { init, charger, sauver, ouvrir, impulsion, DEFAUT };
