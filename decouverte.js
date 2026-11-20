// Détection automatique du PC serveur FSS-CAISSE sur le réseau local.
// Principe : on interroge /api/ping (port 3000) sur toutes les adresses des sous-réseaux /24 du PC,
// le serveur répond {ok:true, app:'FSS-CAISSE', nom}. Aucun réglage pare-feu de plus que celui du serveur lui-même.
const http = require('http');
const os = require('os');

function sousReseaux(interfaces) {
  const res = [];
  const ifs = interfaces || os.networkInterfaces();
  Object.keys(ifs).forEach((nom) => {
    (ifs[nom] || []).forEach((a) => {
      if (a.family !== 'IPv4' || a.internal) return;
      if (/^169\.254\./.test(a.address)) return; // adresse automatique sans réseau
      const base = a.address.split('.').slice(0, 3).join('.');
      if (!res.some((r) => r.base === base)) res.push({ base: base, moi: a.address });
    });
  });
  return res;
}

function ping(ip, port, delai) {
  return new Promise((resolve) => {
    let fini = false;
    const fin = (v) => { if (!fini) { fini = true; resolve(v); } };
    const req = http.get({ host: ip, port: port, path: '/api/ping', timeout: delai, agent: false }, (r) => {
      let corps = '';
      r.setEncoding('utf8');
      r.on('data', (d) => { corps += d; if (corps.length > 2000) r.destroy(); });
      r.on('end', () => {
        try { const j = JSON.parse(corps); fin(j && j.ok && j.app === 'FSS-CAISSE' ? { ip: ip, port: port, nom: j.nom || '' } : null); } catch (e) { fin(null); }
      });
      r.on('error', () => fin(null));
    });
    req.on('timeout', () => { req.destroy(); fin(null); });
    req.on('error', () => fin(null));
  });
}

async function chercherServeurs(opts) {
  opts = opts || {};
  const port = Number(opts.port) || 3000;
  const delai = opts.delai || 700;
  const lot = opts.lot || 64;
  const cibles = [];
  // Cette machine d'abord (au cas où), puis chaque sous-réseau.
  const reseaux = opts.reseaux || sousReseaux(opts.interfaces);
  reseaux.forEach((r) => { for (let i = 1; i <= 254; i++) { const ip = r.base + '.' + i; if (ip !== r.moi) cibles.push(ip); } });
  const trouves = [];
  for (let i = 0; i < cibles.length; i += lot) {
    const r = await Promise.all(cibles.slice(i, i + lot).map((ip) => ping(ip, port, delai)));
    r.forEach((x) => { if (x) trouves.push(x); });
    if (opts.progress) opts.progress(Math.min(i + lot, cibles.length), cibles.length);
  }
  return trouves;
}

// Test d'UNE adresse précise (même dans un autre réseau, tant que le routage le permet) avec un diagnostic de la cause en cas d'échec.
function diagnostiquer(ip, port, delai) {
  return new Promise((resolve) => {
    let fini = false;
    const fin = (v) => { if (!fini) { fini = true; resolve(v); } };
    const req = http.get({ host: ip, port: Number(port) || 3000, path: '/api/ping', timeout: delai || 4000, agent: false }, (r) => {
      let corps = '';
      r.setEncoding('utf8');
      r.on('data', (d) => { corps += d; if (corps.length > 2000) r.destroy(); });
      r.on('end', () => {
        try {
          const j = JSON.parse(corps);
          if (j && j.ok && j.app === 'FSS-CAISSE') return fin({ ok: true, nom: j.nom || '' });
        } catch (e) {}
        fin({ ok: false, erreur: 'autre' });
      });
      r.on('error', () => fin({ ok: false, erreur: 'autre' }));
    });
    req.on('timeout', () => { req.destroy(); fin({ ok: false, erreur: 'delai' }); });
    req.on('error', (e) => {
      const c = e && e.code;
      fin({ ok: false, erreur: c === 'ECONNREFUSED' ? 'refuse' : (c === 'EHOSTUNREACH' || c === 'ENETUNREACH' ? 'route' : 'delai') });
    });
  });
}

module.exports = { chercherServeurs, sousReseaux, ping, diagnostiquer };
