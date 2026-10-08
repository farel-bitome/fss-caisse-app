// FSS-CAISSE (version Windows) — synchronisation avec la version web.
// Le PC reste le poste de caisse : il fonctionne sans Internet ; dès que la connexion revient, il envoie
// ce qui s'est passé hors-ligne et reçoit ce qui a changé sur le web (fusion : voir sync-merge.js).
// Écrit sans syntaxe récente (?. ??) et avec http/https natifs : doit pouvoir tourner sur d'anciens Node.
'use strict';
var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var crypto = require('crypto');
var merge = require('./sync-merge');

var TICK_MS = 30 * 1000;       // vérification régulière (aussi : peu après chaque changement local)
var DEBOUNCE_MS = 4 * 1000;

function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
function isLoopback(addr) { return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'; }

function normalizeUrl(input) {
  var s = String(input || '').trim().replace(/\/+$/, '');
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  var u;
  try { u = new URL(s); } catch (e) { return null; }
  var local = (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  if (u.protocol !== 'https:' && !local) return null; // jamais d'identifiants en clair sur Internet
  return u.protocol + '//' + u.host;
}

function request(method, urlStr, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    var u = new URL(urlStr);
    var lib = u.protocol === 'https:' ? https : http;
    var data = opts.body !== undefined ? Buffer.from(JSON.stringify(opts.body)) : null;
    var headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = data.length; }
    var req = lib.request(u, { method: method, headers: headers, timeout: opts.timeout || 30000 }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var text = Buffer.concat(chunks).toString('utf8'), json = null;
        try { json = JSON.parse(text); } catch (e) { /* réponse non JSON */ }
        resolve({ status: res.statusCode || 0, json: json });
      });
    });
    req.on('timeout', function () { req.destroy(new Error('délai dépassé')); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// hooks : { userDataDir, getState(), replaceState(newSyncedKeys), journal(line) }
module.exports = function createCloudSync(hooks) {
  var linkFile = path.join(hooks.userDataDir, 'cloud-link.json');
  var baseFile = path.join(hooks.userDataDir, 'cloud-base.json');
  var running = false, timer = null, tickTimer = null;
  var status = { online: null, lastAttemptAt: null, lastSyncAt: null, lastError: '', conflits: [], avertissements: [] };

  function journal(l) { try { hooks.journal('[cloud] ' + l); } catch (e) { /* ignore */ } }
  function writeJson(f, obj) { var tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, f); }
  function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
  function loadLink() { return readJson(linkFile); }
  function loadBase() { return readJson(baseFile); }

  function authHeaders(link) { return { Authorization: 'Bearer ' + link.deviceId + '.' + link.token }; }

  // ---- Un cycle de synchronisation ----
  function syncOnce() {
    if (running) return Promise.resolve(status);
    var link = loadLink();
    if (!link) return Promise.resolve(status);
    running = true;
    status.lastAttemptAt = new Date().toISOString();
    var base = loadBase();

    function attempt(n) {
      var local0 = clone(merge.syncable(hooks.getState()));
      var localChanged = !base || !merge.eq(local0, base);
      var q = (base && n === 0 && link.lastVersion !== undefined) ? ('?since=' + encodeURIComponent(link.lastVersion)) : '';
      return request('GET', link.url + '/api/sync/state' + q, { headers: authHeaders(link) }).then(function (r) {
        if (r.status === 401) { var e = new Error((r.json && r.json.erreur) || 'Appareil non reconnu'); e.fatal = true; throw e; }
        if (r.status === 402) { var e2 = new Error('Abonnement suspendu — contactez FallServices&Solutions'); e2.fatal = true; throw e2; }
        if (r.status !== 200 || !r.json || !r.json.ok) throw new Error('Réponse inattendue du serveur (' + r.status + ')');
        status.online = true;
        var version = r.json.version;
        var cloud = r.json.unchanged ? clone(base) : r.json.state;
        if (r.json.unchanged && !localChanged) return { done: true, version: version };
        var res = merge.mergeStates(base, local0, cloud);
        var merged = res.state;
        // Le PC n'a rien changé et seul le web a bougé : rien à envoyer, on applique simplement.
        var needPush = localChanged;
        // À la première liaison, la renumérotation des comptes est normale : on ne signale que le reste.
        var conflicts = res.report.conflicts.filter(function (c) { return base || c.liste !== 'users'; });
        if (conflicts.length) {
          status.conflits = conflicts.concat(status.conflits).slice(0, 20);
          conflicts.forEach(function (c) { journal('Conflit ' + c.liste + ' : ' + c.ancien + ' -> ' + c.nouveau + ' (' + c.type + ')'); });
        }
        if (!needPush) return { merged: merged, local0: local0, version: version };
        return request('POST', link.url + '/api/sync/push', { headers: authHeaders(link), body: { baseVersion: version, state: merged }, timeout: 120000 }).then(function (p) {
          if (p.status === 409) { if (n >= 3) throw new Error('Le serveur change trop vite, nouvel essai plus tard'); return attempt(n + 1); }
          if (p.status === 401) { var e3 = new Error((p.json && p.json.erreur) || 'Appareil non reconnu'); e3.fatal = true; throw e3; }
          if (p.status !== 200 || !p.json || !p.json.ok) throw new Error((p.json && p.json.erreur) || ('Envoi refusé (' + p.status + ')'));
          if (Array.isArray(p.json.users)) merged.users = p.json.users; // le serveur renvoie les comptes avec leurs hachés
          status.avertissements = p.json.avertissements || [];
          return { merged: merged, local0: local0, version: p.json.version, pushed: true };
        });
      });
    }

    return attempt(0).then(function (out) {
      if (out.merged) {
        // Des caisses ont pu être modifiées pendant les échanges réseau : on les rebase sur le résultat.
        var local1 = merge.syncable(hooks.getState());
        var final = merge.eq(local1, out.local0) ? out.merged : merge.mergeStates(out.local0, local1, out.merged).state;
        hooks.replaceState(final);
        base = clone(out.merged);
        writeJson(baseFile, base);
      }
      link.lastVersion = out.version;
      writeJson(linkFile, link);
      status.lastSyncAt = new Date().toISOString();
      status.lastError = '';
      if (out.pushed) journal('Synchronisation réussie (version ' + out.version + ')');
    }).catch(function (e) {
      if (e && e.fatal) { status.online = true; status.lastError = e.message; journal('Erreur : ' + e.message); }
      else { status.online = false; status.lastError = 'Hors-ligne — les données seront envoyées au retour de la connexion'; }
    }).then(function () { running = false; return status; });
  }

  function schedule(ms) {
    if (!loadLink()) return;
    clearTimeout(timer);
    timer = setTimeout(function () { syncOnce(); }, ms === undefined ? DEBOUNCE_MS : ms);
  }

  // ---- Liaison ----
  function link(urlInput, nom, mdp, appareil) {
    var url = normalizeUrl(urlInput);
    if (!url) return Promise.resolve({ ok: false, erreur: 'Adresse invalide : utilisez l\'adresse https:// de votre établissement (ex. afrolounge.votre-domaine.com).' });
    return request('POST', url + '/api/sync/link', { body: { nom: nom, mdp: mdp, appareil: appareil } }).then(function (r) {
      if (r.status !== 200 || !r.json || !r.json.ok) return { ok: false, erreur: (r.json && r.json.erreur) || ('Liaison refusée (' + r.status + ')') };
      var l = { url: url, deviceId: r.json.deviceId, token: r.json.token, slug: r.json.slug, etablissement: r.json.etablissement, linkedAt: new Date().toISOString() };
      writeJson(linkFile, l);
      try { fs.unlinkSync(baseFile); } catch (e) { /* pas de base : première synchronisation, le PC fait référence */ }
      status.conflits = []; status.lastError = '';
      journal('Poste lié à ' + url + ' (' + l.etablissement + ')');
      return syncOnce().then(function () { return { ok: true, etablissement: l.etablissement, cloudVide: !!r.json.vide, status: publicStatus() }; });
    }, function () { return { ok: false, erreur: 'Impossible de joindre le serveur. Vérifiez la connexion Internet et l\'adresse.' }; });
  }
  function unlink() {
    try { fs.unlinkSync(linkFile); } catch (e) { /* déjà délié */ }
    try { fs.unlinkSync(baseFile); } catch (e) { /* idem */ }
    clearTimeout(timer);
    status = { online: null, lastAttemptAt: null, lastSyncAt: null, lastError: '', conflits: [], avertissements: [] };
    journal('Poste délié du serveur web');
  }

  function publicStatus() {
    var l = loadLink();
    var s = { linked: !!l, url: l ? l.url : '', etablissement: l ? l.etablissement : '', online: status.online, lastSyncAt: status.lastSyncAt, lastAttemptAt: status.lastAttemptAt,
      lastError: status.lastError, conflits: status.conflits, avertissements: status.avertissements, syncing: running };
    if (l) { var b = loadBase(); s.enAttente = !b || !merge.eq(merge.syncable(hooks.getState()), b); }
    return s;
  }

  // ---- Routes HTTP locales (utilisées par l'interface de l'application) ----
  function attach(app) {
    app.get('/api/cloud/status', function (req, res) { res.json(publicStatus()); });
    app.post('/api/cloud/sync', function (req, res) { syncOnce().then(function () { res.json(publicStatus()); }); });
    app.post('/api/cloud/link', function (req, res) {
      if (!isLoopback(req.socket.remoteAddress)) return res.status(403).json({ ok: false, erreur: 'La liaison se fait depuis le PC serveur uniquement.' });
      var b = req.body || {};
      link(b.url, String(b.nom || ''), String(b.mdp || ''), String(b.appareil || 'PC caisse')).then(function (r) { res.status(r.ok ? 200 : 400).json(r); });
    });
    app.post('/api/cloud/unlink', function (req, res) {
      if (!isLoopback(req.socket.remoteAddress)) return res.status(403).json({ ok: false, erreur: 'Réservé au PC serveur.' });
      unlink(); res.json({ ok: true });
    });
    tickTimer = setInterval(function () { syncOnce(); }, TICK_MS);
    if (tickTimer.unref) tickTimer.unref();
    schedule(5000);
  }

  return { attach: attach, notifyChange: function () { schedule(DEBOUNCE_MS); }, syncOnce: syncOnce, link: link, unlink: unlink, status: publicStatus, stop: function () { clearTimeout(timer); clearInterval(tickTimer); } };
};
