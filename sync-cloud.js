// FSS-CAISSE (version Windows) — synchronisation avec la version web.
//
// Le PC reste le poste de caisse : tout fonctionne sans Internet. Dès que la connexion est là,
// ce module envoie les changements faits hors-ligne, reprend ceux faits en ligne, et fusionne.
// Les mots de passe ne quittent jamais le PC en clair : seul leur « haché » est envoyé.
// Écrit sans ?. ni ?? : doit aussi tourner sur les anciens Node des TPE.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');
const { merge3 } = require('./sync-merge');

const INTERVAL_MS = 30 * 1000;
const DEBOUNCE_MS = 5 * 1000;
const REQUEST_TIMEOUT_MS = 25 * 1000;
const LOCAL_FLAGS = ['menuMigratedV2', 'categoriesMigratedV1', 'tablesMigratedV1'];

function sha256(x) { return crypto.createHash('sha256').update(String(x)).digest('hex'); }
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('hex') + '$' + h.toString('hex');
}
function verifyHash(pw, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const expected = Buffer.from(parts[2], 'hex');
    const h = crypto.scryptSync(String(pw), Buffer.from(parts[1], 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
    return h.length === expected.length && crypto.timingSafeEqual(h, expected);
  } catch (e) { return false; }
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function createSyncAgent(opts) {
  const linkFile = path.join(opts.dir, 'cloud-link.json');
  const log = opts.log || function () {};
  let link = null;                 // { url, token, appareil, etablissement, version, premier: 'push'|'pull'|null }
  let counter = 0;                 // incrémenté à chaque changement local
  let dirty = true;                // au démarrage on suppose qu'il y a des changements à envoyer
  let busy = false;
  let revoque = false;             // appareil refusé par le web : on arrête d'insister jusqu'à une nouvelle liaison
  let timer = null, debounce = null;
  const status = { enLigne: null, derniereSynchro: null, erreur: null, conflits: 0 };

  function loadLink() { try { link = JSON.parse(fs.readFileSync(linkFile, 'utf8')); } catch (e) { link = null; } }
  function saveLink() { const tmp = linkFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(link, null, 2)); fs.renameSync(tmp, linkFile); }
  loadLink();

  // ---------- Comptes : le PC garde les mots de passe en clair (comme avant) ; le web reçoit des hachés ----------
  function localUsersToHashForm(state) {
    let changed = false;
    (state.users || []).forEach(function (u) {
      if (typeof u.mdp === 'string' && u.mdp) {
        const tag = sha256(u.mdp);
        if (!u.mdpHash || u.mdpHashOf !== tag) { u.mdpHash = hashPassword(u.mdp); u.mdpHashOf = tag; changed = true; }
      }
    });
    return changed;
  }
  function forSending(state) {
    const c = clone(state);
    c.users = (c.users || []).map(function (u) { const x = Object.assign({}, u); delete x.mdp; delete x.mdpHashOf; return x; });
    return c;
  }
  // État venant du web -> état local : on garde le mot de passe en clair local quand il n'a pas changé.
  function fromRemote(remote, localLive) {
    const out = clone(remote);
    const byNom = {};
    ((localLive && localLive.users) || []).forEach(function (u) { byNom[String(u.nom).toLowerCase()] = u; });
    out.users = (out.users || []).map(function (u) {
      const l = byNom[String(u.nom).toLowerCase()];
      if (l && l.mdp && l.mdpHash === u.mdpHash) { u.mdp = l.mdp; u.mdpHashOf = l.mdpHashOf; }
      return u;
    });
    // Ces repères évitent que les migrations de démarrage de la caisse ne remplacent le catalogue.
    LOCAL_FLAGS.forEach(function (f) { if (localLive && localLive[f] && out[f] === undefined) out[f] = localLive[f]; });
    return out;
  }

  // ---------- Réseau ----------
  function request(method, urlPath, body, extraHeaders) {
    return new Promise(function (resolve, reject) {
      let u;
      try { u = new URL(link.url.replace(/\/+$/, '') + urlPath); } catch (e) { return reject(new Error('Adresse en ligne invalide')); }
      const lib = u.protocol === 'https:' ? https : http;
      const headers = Object.assign({ 'Accept': 'application/json' }, extraHeaders || {});
      if (link.token) headers['Authorization'] = 'Bearer ' + link.token;
      let payload = null;
      const send = function () {
        if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = payload.length; }
        const req = lib.request(u, { method: method, headers: headers, timeout: REQUEST_TIMEOUT_MS }, function (res) {
          const chunks = [];
          res.on('data', function (c) { chunks.push(c); });
          res.on('end', function () {
            let json = null;
            try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) {}
            resolve({ status: res.statusCode, json: json });
          });
        });
        req.on('timeout', function () { req.destroy(new Error('délai dépassé')); });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
      };
      if (body !== undefined && body !== null) {
        zlib.gzip(Buffer.from(JSON.stringify(body)), function (err, gz) {
          if (err) return reject(err);
          payload = gz; headers['Content-Encoding'] = 'gzip'; send();
        });
      } else send();
    });
  }

  // ---------- Un cycle de synchronisation ----------
  async function cycle() {
    if (!link || !link.token || busy || revoque) return;
    busy = true;
    try {
      const c0 = counter;
      const live = opts.getState();
      if (localUsersToHashForm(live)) opts.persist();
      const first = link.premier || null;
      let body;
      let sent = null;
      if (first === 'pull') body = { mode: 'pull' };
      else if (dirty || first === 'push') { sent = forSending(live); body = { dirty: true, baseVersion: link.version, state: sent }; }
      else body = { dirty: false, baseVersion: link.version };
      const r = await request('POST', '/api/sync', body);
      if (r.status === 401) { revoque = true; status.erreur = 'Cet ordinateur n\'est plus autorisé (appareil révoqué). Liez-le de nouveau.'; status.enLigne = true; log('Synchro en ligne : appareil révoqué par le web — liaison à refaire'); return; }
      if (r.status === 402) { status.erreur = 'Abonnement en ligne suspendu.'; status.enLigne = true; return; }
      if (!r.json || !r.json.ok) { status.erreur = (r.json && r.json.erreur) || ('Réponse inattendue (' + r.status + ')'); status.enLigne = true; return; }

      status.enLigne = true; status.erreur = null; status.derniereSynchro = new Date().toISOString();
      if (r.json.unchanged) { link.version = r.json.version; saveLink(); return; }

      const remote = r.json.state;
      if (remote) {
        const nowLive = opts.getState();
        let result;
        if (first === 'pull' || counter === c0) {
          result = fromRemote(remote, nowLive);                    // rien n'a bougé pendant l'envoi
        } else {
          // Des changements locaux sont arrivés pendant l'échange : on les fusionne avec la réponse.
          localUsersToHashForm(nowLive);
          const m = merge3(sent || forSending(nowLive), forSending(nowLive), remote);
          result = fromRemote(m.state, nowLive);
        }
        if (first === 'pull') LOCAL_FLAGS.forEach(function (f) { result[f] = true; });
        opts.applyState(result);
        status.conflits = r.json.conflits || 0;
      }
      link.version = r.json.version;
      link.premier = null;
      saveLink();
      dirty = counter !== c0;
      log('Synchro en ligne OK (version ' + r.json.version + (r.json.conflits ? ', ' + r.json.conflits + ' conflit(s) — voir journal du web' : '') + ')');
    } catch (e) {
      if (status.enLigne !== false) log('Synchro en ligne : hors-ligne (' + (e && e.message ? e.message : e) + ') — nouvel essai automatique');
      status.enLigne = false;
    } finally { busy = false; }
  }

  function start() {
    if (timer) return;
    timer = setInterval(function () { if (link && link.token) cycle(); }, INTERVAL_MS);
    if (timer.unref) timer.unref();
    setTimeout(function () { if (link && link.token) cycle(); }, 3000);
  }
  function notifyChange() {
    counter++; dirty = true;
    if (!link || !link.token) return;
    clearTimeout(debounce);
    debounce = setTimeout(cycle, DEBOUNCE_MS);
    if (debounce.unref) debounce.unref();
  }

  // ---------- Actions pilotées par l'écran « Synchronisation en ligne » ----------
  async function doLink(p) {
    const url = String(p.url || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return { ok: false, erreur: 'Adresse invalide (exemple : https://afrolounge.votre-domaine.com)' };
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)) return { ok: false, erreur: 'L\'adresse doit commencer par https://' };
    const mode = p.mode === 'pull' ? 'pull' : 'push';
    const prev = link;
    link = { url: url, token: null };
    try {
      const r = await request('POST', '/api/sync/link', { nom: p.nom, mdp: p.mdp, appareil: String(p.appareil || require('os').hostname()).slice(0, 60) }, {});
      if (!r.json || !r.json.ok) { link = prev; return { ok: false, erreur: (r.json && r.json.erreur) || ('Réponse inattendue (' + r.status + ')') }; }
      revoque = false;
      link = { url: url, token: r.json.token, appareil: r.json.appareil, etablissement: r.json.etablissement, version: null, premier: mode, lieLe: new Date().toISOString() };
      saveLink();
      dirty = true;
      log('Lié à l\'établissement en ligne : ' + (r.json.etablissement && r.json.etablissement.nom) + ' (' + url + ') — premier envoi : ' + (mode === 'pull' ? 'récupération depuis le web' : 'données de ce PC vers le web'));
    } catch (e) {
      link = prev;
      return { ok: false, erreur: 'Connexion impossible : ' + (e && e.message ? e.message : e) + '. Vérifiez Internet et l\'adresse.' };
    }
    await cycle();
    if (status.erreur) return { ok: false, erreur: status.erreur, status: getStatus() };
    return { ok: true, status: getStatus() };
  }
  function unlink() { link = null; try { fs.unlinkSync(linkFile); } catch (e) {} status.erreur = null; status.enLigne = null; log('Liaison avec le web supprimée sur cet ordinateur'); }
  function getStatus() {
    return {
      lie: !!(link && link.token),
      url: link && link.url || null,
      etablissement: link && link.etablissement || null,
      appareil: link && link.appareil || null,
      premierEnvoiEnCours: !!(link && link.premier),
      enLigne: status.enLigne,
      derniereSynchro: status.derniereSynchro,
      enAttente: !!(link && link.token) && dirty,
      conflits: status.conflits,
      erreur: status.erreur
    };
  }

  return { start: start, notifyChange: notifyChange, link: doLink, unlink: unlink, status: getStatus, syncNow: cycle, verifyHash: verifyHash };
}

module.exports = createSyncAgent;
module.exports.verifyHash = verifyHash;
