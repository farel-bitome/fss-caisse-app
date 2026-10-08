// FSS-CAISSE Cloud — serveur web multi-établissements.
// Réutilise l'interface existante (dossier app/) ; la version Windows (Electron) n'est pas modifiée.
//
// Différences clés avec le serveur embarqué (embedded-server.js) :
//  - connexion vérifiée CÔTÉ SERVEUR (mots de passe hachés, jamais envoyés aux navigateurs) ;
//  - toutes les routes /api/* et le temps réel exigent une session ;
//  - un établissement = un sous-domaine = ses propres données (isolation complète) ;
//  - pas de CORS ouvert, contrôle de l'origine, limitation des essais de connexion.
'use strict';
const express = require('express');
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { Server } = require('socket.io');
const security = require('./security');
const { createStore, publicState } = require('./store');

const APP_DIR = path.join(__dirname, '..', 'app');
const COOKIE = 'fss_sid';
const INVALID = '__invalide__';

function createApp(opts) {
  opts = opts || {};
  const baseDomain = (opts.baseDomain || '').toLowerCase().replace(/^\.+|\.+$/g, '');
  const defaultTenant = (opts.defaultTenant || '').toLowerCase();
  if (!baseDomain && !defaultTenant) {
    throw new Error('Configurer BASE_DOMAIN (plusieurs établissements) et/ou DEFAULT_TENANT (un seul établissement).');
  }
  const store = createStore(opts.dataDir);
  const sessions = security.makeSessions(opts.sessionSecret);
  const loginLimiter = security.makeLimiter(8, 15 * 60 * 1000);
  const DUMMY_HASH = security.hashPasswordSync('fss-dummy');

  const indexHtml = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8')
    .replace('<head>', '<head><script src="/cloud-config.js"></script>');
  const landingHtml = fs.readFileSync(path.join(__dirname, 'landing.html'), 'utf8')
    .replace(/__BASE_DOMAIN__/g, baseDomain);

  // ---------- Quel établissement ? ----------
  function hostToSlug(hostHeader) {
    const host = String(hostHeader || '').toLowerCase().replace(/:\d+$/, '');
    if (baseDomain) {
      if (host === baseDomain || host === 'www.' + baseDomain) return null; // page d'accueil
      if (host.endsWith('.' + baseDomain)) {
        const label = host.slice(0, -(baseDomain.length + 1));
        return store.SLUG_RE.test(label) ? label : INVALID;
      }
    }
    return defaultTenant || INVALID;
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', opts.trustProxy === undefined ? 1 : opts.trustProxy);
  const server = http.createServer(app);

  // ---------- Contrôle de l'origine (anti-CSRF entre sous-domaines) ----------
  function originOk(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try { return new URL(origin).host.toLowerCase() === String(req.headers.host || '').toLowerCase(); }
    catch (e) { return false; }
  }

  const io = new Server(server, {
    allowRequest: function (req, cb) {
      if (!originOk(req)) return cb('origine refusée', false);
      cb(null, true);
    }
  });

  // ---------- Santé (avant tout le reste) ----------
  app.get('/healthz', function (req, res) { res.type('text').send('ok'); });

  app.use(function (req, res, next) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    if (req.path.startsWith('/api/') || req.path === '/cloud-config.js') res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(function (req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' && !originOk(req)) {
      return res.status(403).json({ ok: false, erreur: 'Origine refusée' });
    }
    next();
  });
  // Résolution de l'établissement d'abord ; les gros corps JSON (état complet) ne sont lus qu'après authentification.
  const smallJson = express.json({ limit: '1mb' });
  const bigJson = express.json({ limit: '60mb' });
  const BIG_PATHS = { '/api/state': 1, '/api/sync/push': 1 };

  // ---------- Résolution de l'établissement ----------
  function pageMessage(res, code, titre, texte) {
    res.status(code).type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + titre +
      '</title><body style="font-family:Arial,sans-serif;background:#f5f5f7;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="background:#fff;border-top:6px solid #7a1f2b;padding:32px 40px;max-width:420px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.08)"><h1 style="color:#7a1f2b;font-size:20px;margin:0 0 10px">' +
      titre + '</h1><p style="color:#1b2a4a;margin:0;line-height:1.5">' + texte + '</p></div></body>');
  }

  app.use(function (req, res, next) {
    const slug = hostToSlug(req.headers.host);
    if (slug === null) { // adresse principale : page d'accueil uniquement
      if ((req.method === 'GET' || req.method === 'HEAD') && (req.path === '/' || req.path === '/index.html')) return res.type('html').send(landingHtml);
      return pageMessage(res, 404, 'Page introuvable', 'Utilisez l\'adresse de votre établissement.');
    }
    if (slug === INVALID || !store.exists(slug)) {
      if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, erreur: 'Établissement introuvable' });
      return pageMessage(res, 404, 'Établissement introuvable', 'Vérifiez l\'adresse ou contactez FallServices&amp;Solutions.');
    }
    if (!store.isActive(slug)) {
      if (req.path.startsWith('/api/')) return res.status(402).json({ ok: false, erreur: 'Abonnement suspendu' });
      return pageMessage(res, 402, 'Accès suspendu', 'L\'abonnement de cet établissement est suspendu. Contactez FallServices&amp;Solutions : +241 77 37 86 02.');
    }
    req.slug = slug;
    req.tenant = store.open(slug);
    if (req.method === 'POST' && BIG_PATHS[req.path]) return next();
    smallJson(req, res, next);
  });

  // ---------- Session ----------
  function userFromToken(t, token) {
    const s = sessions.verify(token);
    if (!s || s.t !== t.slug) return null;
    const u = (t.state.users || []).find(function (x) { return x.id === s.u; });
    if (!u || (u.pwdAt || 0) !== s.p) return null; // compte supprimé ou mot de passe changé
    return u;
  }
  function setSessionCookie(req, res, u) {
    const secure = req.secure || opts.forceSecureCookie;
    res.append('Set-Cookie', COOKIE + '=' + sessions.create(req.slug, u) + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + sessions.ttlSeconds + (secure ? '; Secure' : ''));
  }
  function clearSessionCookie(req, res) {
    res.append('Set-Cookie', COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + ((req.secure || opts.forceSecureCookie) ? '; Secure' : ''));
  }
  function requireAuth(req, res, next) {
    const u = userFromToken(req.tenant, security.parseCookies(req.headers.cookie)[COOKIE]);
    if (!u) return res.status(401).json({ ok: false, erreur: 'Session expirée — reconnectez-vous.' });
    req.user = u;
    req.isAdmin = !!(u.super || u.full);
    next();
  }
  function requireAdmin(req, res, next) {
    if (req.isAdmin || (req.user.perms || []).indexOf('params') !== -1) return next();
    res.status(403).json({ ok: false, erreur: 'Droits insuffisants' });
  }
  function broadcast(t) { io.to('t:' + t.slug).emit('state:changed', publicState(t.state)); }

  // ---------- Pages / configuration cloud (publiques) ----------
  app.get('/cloud-config.js', function (req, res) {
    res.type('application/javascript').send(
      'window.FSS_CLOUD=true;window.FSS_TENANT=' + JSON.stringify(req.slug) + ';' +
      // Session expirée : retour à l\'écran de connexion
      '(function(){var f=window.fetch;window.fetch=function(u,o){return f.apply(this,arguments).then(function(r){' +
      'if(r.status===401&&typeof u==="string"&&u.indexOf("/api/")===0&&u.indexOf("/api/login")!==0&&u.indexOf("/api/me/password")!==0){location.reload();}return r;});};})();');
  });
  app.get(['/', '/index.html'], function (req, res) { res.type('html').send(indexHtml); });
  app.get('/api/public', function (req, res) {
    const s = req.tenant.state;
    res.json({ nom: (s.etab && s.etab.nom) || req.tenant.meta.nom || 'FSS-CAISSE', logo: s.logo || null });
  });
  app.use(express.static(APP_DIR, { index: false }));

  // ---------- Connexion ----------
  app.post('/api/login', async function (req, res) {
    const t = req.tenant;
    const nom = String((req.body && req.body.nom) || '').trim();
    const mdp = String((req.body && req.body.mdp) || '');
    if (!nom || !mdp || nom.length > 100 || mdp.length > 200) return res.status(400).json({ ok: false, erreur: 'Identifiant et mot de passe requis' });
    const kIp = req.slug + '|ip|' + req.ip;
    const kUser = req.slug + '|u|' + nom.toLowerCase();
    if (loginLimiter.blocked(kIp) || loginLimiter.blocked(kUser)) {
      return res.status(429).json({ ok: false, erreur: 'Trop d\'essais. Réessayez dans 15 minutes.' });
    }
    const u = (t.state.users || []).find(function (x) { return String(x.nom).toLowerCase() === nom.toLowerCase(); });
    const ok = await security.verifyPassword(mdp, u && u.mdpHash ? u.mdpHash : DUMMY_HASH) && !!u && !!u.mdpHash;
    if (!ok) {
      loginLimiter.fail(kIp); loginLimiter.fail(kUser);
      t.journal('Connexion refusée : ' + nom + ' (' + req.ip + ')');
      return res.status(401).json({ ok: false, erreur: 'Identifiant ou mot de passe incorrect' });
    }
    loginLimiter.reset(kUser);
    setSessionCookie(req, res, u);
    t.journal('Connexion : ' + u.nom + ' (' + req.ip + ')');
    res.json({ ok: true, user: { id: u.id, nom: u.nom } });
  });

  app.post('/api/logout', function (req, res) { clearSessionCookie(req, res); res.json({ ok: true }); });

  app.get('/api/me', requireAuth, function (req, res) {
    res.json({ ok: true, user: { id: req.user.id, nom: req.user.nom } });
  });

  // Changement de SON propre mot de passe
  app.post('/api/me/password', requireAuth, async function (req, res) {
    const t = req.tenant, u = req.user;
    const mdp = String((req.body && req.body.mdp) || '');
    const ancien = String((req.body && req.body.ancien) || '');
    if (mdp.length < security.MIN_PASSWORD || mdp.length > 200) return res.status(400).json({ ok: false, erreur: 'Mot de passe trop court (' + security.MIN_PASSWORD + ' caractères minimum)' });
    if (!u.doitChangerMdp) {
      const k = req.slug + '|u|' + u.nom.toLowerCase();
      if (loginLimiter.blocked(k)) return res.status(429).json({ ok: false, erreur: 'Trop d\'essais. Réessayez plus tard.' });
      if (!(await security.verifyPassword(ancien, u.mdpHash))) { loginLimiter.fail(k); return res.status(403).json({ ok: false, erreur: 'Ancien mot de passe incorrect' }); }
    }
    u.mdpHash = security.hashPasswordSync(mdp);
    u.pwdAt = Date.now();
    u.doitChangerMdp = false;
    t.save();
    t.journal('Mot de passe modifié : ' + u.nom);
    setSessionCookie(req, res, u); // l'ancienne session devient invalide, on en émet une nouvelle
    broadcast(t);
    res.json({ ok: true });
  });

  // ---------- Synchronisation avec les PC liés (version Windows) ----------
  // Un administrateur « lie » un PC avec son identifiant ; le PC reçoit un jeton d'appareil (stocké haché ici)
  // et l'utilise ensuite seul, sans mot de passe, tant que l'appareil n'est pas révoqué (admin.js revoquer).
  const NOT_SYNCED_KEYS = ['cmdAttente', 'printBatches', 'attenteSeq', 'syncVersion'];
  function devicesFile(t) { return t.file('devices.json'); }
  function loadDevices(t) { try { return JSON.parse(fs.readFileSync(devicesFile(t), 'utf8')); } catch (e) { return {}; } }
  function saveDevices(t, d) { const f = devicesFile(t); fs.writeFileSync(f + '.tmp', JSON.stringify(d, null, 2)); fs.renameSync(f + '.tmp', f); }
  const sha256 = function (x) { return crypto.createHash('sha256').update(String(x)).digest('hex'); };

  function requireDevice(req, res, next) {
    const m = String(req.headers.authorization || '').match(/^Bearer ([a-f0-9]{12})\.([a-f0-9]{64})$/);
    const devices = loadDevices(req.tenant);
    const d = m && devices[m[1]];
    const okTok = d && (function () { const a = Buffer.from(sha256(m[2])), b = Buffer.from(d.tokenHash); return a.length === b.length && crypto.timingSafeEqual(a, b); })();
    if (!okTok) return res.status(401).json({ ok: false, erreur: 'Appareil non reconnu ou révoqué — liez de nouveau ce poste.' });
    req.device = { id: m[1], nom: d.nom };
    next();
  }
  // Données envoyées au PC : tout sauf ce qui est propre au serveur ; les comptes gardent leur haché (jamais de clair).
  function syncPayload(t) {
    const out = {};
    Object.keys(t.state).forEach(function (k) { if (NOT_SYNCED_KEYS.indexOf(k) === -1) out[k] = t.state[k]; });
    out.users = (t.state.users || []).map(function (u) { const c = Object.assign({}, u); delete c.mdp; return c; });
    return out;
  }

  app.post('/api/sync/link', async function (req, res) {
    const t = req.tenant;
    const nom = String((req.body && req.body.nom) || '').trim();
    const mdp = String((req.body && req.body.mdp) || '');
    const appareil = String((req.body && req.body.appareil) || 'Poste').slice(0, 60);
    if (!nom || !mdp) return res.status(400).json({ ok: false, erreur: 'Identifiant et mot de passe requis' });
    const kIp = req.slug + '|ip|' + req.ip, kUser = req.slug + '|u|' + nom.toLowerCase();
    if (loginLimiter.blocked(kIp) || loginLimiter.blocked(kUser)) return res.status(429).json({ ok: false, erreur: 'Trop d\'essais. Réessayez dans 15 minutes.' });
    const u = (t.state.users || []).find(function (x) { return String(x.nom).toLowerCase() === nom.toLowerCase(); });
    const ok = await security.verifyPassword(mdp, u && u.mdpHash ? u.mdpHash : DUMMY_HASH) && !!u && !!u.mdpHash;
    if (!ok) { loginLimiter.fail(kIp); loginLimiter.fail(kUser); t.journal('Liaison refusée : ' + nom + ' (' + req.ip + ')'); return res.status(401).json({ ok: false, erreur: 'Identifiant ou mot de passe incorrect' }); }
    if (!(u.super || u.full)) return res.status(403).json({ ok: false, erreur: 'Seul un administrateur peut lier un poste.' });
    loginLimiter.reset(kUser);
    const id = crypto.randomBytes(6).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');
    const devices = loadDevices(t);
    devices[id] = { nom: appareil, tokenHash: sha256(token), creeLe: new Date().toISOString(), par: u.nom, dernierSync: null };
    saveDevices(t, devices);
    t.journal('Poste lié : ' + appareil + ' (' + id + ') par ' + u.nom);
    const s = t.state;
    res.json({ ok: true, deviceId: id, token: token, slug: req.slug, etablissement: (s.etab && s.etab.nom) || t.meta.nom, version: s.syncVersion || 0,
      vide: !((s.txs || []).length || (s.arts || []).length || (s.clis || []).length) });
  });

  // Le PC demande l'état si la version a changé depuis sa dernière synchronisation.
  app.get('/api/sync/state', requireDevice, function (req, res) {
    const t = req.tenant;
    const version = t.state.syncVersion || 0;
    if (String(req.query.since) === String(version)) return res.json({ ok: true, unchanged: true, version: version });
    res.json({ ok: true, version: version, state: syncPayload(t) });
  });

  app.post('/api/sync/push', requireDevice, bigJson, function (req, res) {
    const t = req.tenant;
    try {
      const cur = t.state;
      const b = req.body || {};
      if (!b.state || typeof b.state !== 'object' || Array.isArray(b.state)) return res.status(400).json({ ok: false, erreur: 'Données invalides' });
      if (Number(b.baseVersion) !== (cur.syncVersion || 0)) return res.status(409).json({ ok: false, conflit: true, version: cur.syncVersion || 0 });
      const next = b.state;
      NOT_SYNCED_KEYS.forEach(function (k) { if (cur[k] !== undefined) next[k] = cur[k]; else delete next[k]; });
      // Comptes : mots de passe en clair -> hachés ; jamais d'élévation implicite ; jamais sans administrateur.
      const avertissements = [];
      const users = [];
      (Array.isArray(next.users) ? next.users : []).forEach(function (u) {
        if (!u || typeof u.nom !== 'string' || !u.nom.trim()) return;
        const c = Object.assign({}, u);
        if (typeof c.mdp === 'string' && c.mdp) {
          // Sur Internet : jamais de mot de passe faible. Le compte reste utilisable sur le PC ; pour l'utiliser
          // aussi sur le web, il faut choisir un mot de passe d'au moins 6 caractères (changé sur le PC, il sera envoyé).
          if (c.mdp.length < security.MIN_PASSWORD || c.mdp.length > 200) {
            avertissements.push('« ' + c.nom + ' » : mot de passe trop court pour le web (' + security.MIN_PASSWORD + ' caractères minimum) — compte utilisable sur le PC uniquement tant qu\'il n\'est pas changé.');
          } else { c.mdpHash = security.hashPasswordSync(c.mdp); c.pwdAt = Date.now(); }
        }
        delete c.mdp;
        if (typeof c.mdpHash !== 'string') c.mdpHash = '';
        if (typeof c.pwdAt !== 'number') c.pwdAt = 0;
        users.push(c);
      });
      if (!users.some(function (u) { return u.super || u.full; })) return res.status(400).json({ ok: false, erreur: 'Aucun compte administrateur dans les données envoyées.' });
      next.users = users;
      next.nextUserId = Math.max(Number(next.nextUserId) || 1, 1 + users.reduce(function (m, u) { return Math.max(m, Number(u.id) || 0); }, 0));
      t.state = next;
      t.save();
      broadcast(t);
      const devices = loadDevices(t);
      if (devices[req.device.id]) { devices[req.device.id].dernierSync = new Date().toISOString(); saveDevices(t, devices); }
      t.journal('Synchronisation reçue de ' + req.device.nom + ' (' + req.device.id + ') — version ' + t.state.syncVersion);
      res.json({ ok: true, version: t.state.syncVersion, users: users, avertissements: avertissements });
    } catch (e) {
      console.error('[' + req.slug + '] Erreur synchronisation :', e);
      res.status(500).json({ ok: false, erreur: 'Erreur serveur' });
    }
  });

  // ---------- Données ----------
  app.get('/api/state', requireAuth, function (req, res) { res.json(publicState(req.tenant.state)); });

  function mergeUsers(cur, inc, sessUser) {
    cur = cur || [];
    const byId = new Map(cur.map(function (u) { return [u.id, u]; }));
    const out = [];
    const names = new Set();
    let maxId = cur.reduce(function (m, u) { return Math.max(m, u.id || 0); }, 0);
    (Array.isArray(inc) ? inc : []).forEach(function (iu) {
      if (!iu || typeof iu.nom !== 'string' || !iu.nom.trim()) return;
      const old = byId.get(iu.id);
      if (old && old.super) { out.push(old); names.add(old.nom.toLowerCase()); return; } // comptes protégés : intouchables
      const nomKey = iu.nom.trim().toLowerCase();
      if (names.has(nomKey)) return;
      const u = Object.assign({}, iu);
      delete u.mdp; delete u.mdpHash; delete u.pwdAt;
      u.nom = iu.nom.trim();
      u.super = false; // jamais d'élévation en super-utilisateur
      if (old) {
        u.mdpHash = old.mdpHash; u.pwdAt = old.pwdAt || 0;
        if (typeof iu.mdp === 'string' && iu.mdp.length >= security.MIN_PASSWORD && iu.mdp.length <= 200) {
          u.mdpHash = security.hashPasswordSync(iu.mdp); u.pwdAt = Date.now();
        }
        if (old.id === sessUser.id) u.doitChangerMdp = old.doitChangerMdp; // on ne contourne pas le changement obligatoire
      } else {
        if (typeof iu.mdp !== 'string' || iu.mdp.length < security.MIN_PASSWORD || iu.mdp.length > 200) return; // nouveau compte sans mot de passe valable : ignoré
        u.mdpHash = security.hashPasswordSync(iu.mdp); u.pwdAt = Date.now();
        if (byId.has(u.id) || out.some(function (x) { return x.id === u.id; }) || typeof u.id !== 'number') u.id = ++maxId;
      }
      maxId = Math.max(maxId, u.id);
      names.add(nomKey);
      out.push(u);
    });
    cur.forEach(function (u) { if (u.super && !out.some(function (x) { return x.id === u.id; })) out.push(u); }); // un super supprimé réapparaît
    if (!out.some(function (u) { return u.super || u.full; })) return { users: cur, nextUserId: undefined }; // jamais sans administrateur
    return { users: out, nextUserId: maxId + 1 };
  }

  app.post('/api/state', requireAuth, bigJson, function (req, res) {
    const t = req.tenant;
    try {
      const cur = t.state;
      const next = req.body;
      if (!next || typeof next !== 'object' || Array.isArray(next)) return res.status(400).json({ ok: false, erreur: 'Données invalides' });
      // Mêmes garde-fous que la version Windows : ces listes ne passent que par leurs routes dédiées.
      next.cmdAttente = cur.cmdAttente || [];
      next.tables = cur.tables || [];
      next.printBatches = cur.printBatches || [];
      if ((cur.artsUpdatedAt || 0) > (next.artsUpdatedAt || 0)) { next.arts = cur.arts; next.artsUpdatedAt = cur.artsUpdatedAt; }
      // Comptes : seuls les administrateurs peuvent les modifier.
      if (req.isAdmin) {
        const m = mergeUsers(cur.users, next.users, req.user);
        next.users = m.users;
        next.nextUserId = m.nextUserId || cur.nextUserId;
      } else {
        next.users = cur.users;
        next.nextUserId = cur.nextUserId;
      }
      next.syncVersion = cur.syncVersion || 0;
      t.state = next;
      t.save();
      broadcast(t);
      res.json({ ok: true });
    } catch (e) {
      console.error('[' + req.slug + '] Erreur enregistrement :', e);
      res.status(500).json({ ok: false, erreur: 'Erreur serveur' });
    }
  });

  function ciblee(chemin, fn) {
    app.post(chemin, requireAuth, function (req, res) {
      const t = req.tenant;
      try {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ ok: false, erreur: 'Données invalides' });
        fn(t, req.body);
        t.save();
        broadcast(t);
        res.json({ ok: true });
      } catch (e) {
        console.error('[' + req.slug + '] Erreur ' + chemin + ' :', e);
        res.status(500).json({ ok: false, erreur: 'Erreur serveur' });
      }
    });
  }
  ciblee('/api/cmdattente/ajouter', function (t, b) {
    t.state.cmdAttente = (t.state.cmdAttente || []).filter(function (c) { return c.id !== b.id; });
    t.state.cmdAttente.push(b);
    t.journal('Commande en attente ajoutée : ' + b.id + ' (' + b.tableNom + ', ' + b.total + ')');
  });
  ciblee('/api/cmdattente/retirer', function (t, b) {
    t.state.cmdAttente = (t.state.cmdAttente || []).filter(function (c) { return c.id !== b.id; });
    t.journal('Commande en attente retirée : ' + b.id);
  });
  ciblee('/api/tables/enregistrer', function (t, b) {
    t.state.tables = t.state.tables || [];
    const i = t.state.tables.findIndex(function (x) { return x.n === b.n; });
    if (i >= 0) t.state.tables[i] = b; else t.state.tables.push(b);
  });
  ciblee('/api/tables/supprimer', function (t, b) {
    t.state.tables = (t.state.tables || []).filter(function (x) { return x.n !== b.n; });
  });
  ciblee('/api/printbatches/ajouter', function (t, b) {
    t.state.printBatches = (t.state.printBatches || []).filter(function (x) { return x.batchId !== b.batchId; });
    t.state.printBatches.push(b);
    const now = Date.now();
    t.state.printBatches.forEach(function (x) { if (!x._recuLe) x._recuLe = now; });
    t.state.printBatches = t.state.printBatches.filter(function (x) { return (now - x._recuLe) < 2 * 60 * 60 * 1000; });
  });

  app.post('/api/log', requireAuth, function (req, res) {
    req.tenant.journal('[poste ' + req.user.nom + '] ' + String((req.body && req.body.message) || '').slice(0, 500));
    res.json({ ok: true });
  });

  // ---------- Airtel Money (config par établissement, jamais envoyée au navigateur) ----------
  function loadJson(t, name, def) { try { return JSON.parse(fs.readFileSync(t.file(name), 'utf8')); } catch (e) { return def; } }
  function saveJson(t, name, obj) { const f = t.file(name); fs.writeFileSync(f + '.tmp', JSON.stringify(obj, null, 2)); fs.renameSync(f + '.tmp', f); }
  const airtelDefault = { clientId: '', clientSecret: '', pin: '', country: 'GA', currency: 'XAF', environment: 'staging' };
  const airtelBase = function (cfg) { return cfg.environment === 'production' ? 'https://openapi.airtel.africa' : 'https://openapiuat.airtel.africa'; };
  async function airtelToken(cfg) {
    const r = await fetch(airtelBase(cfg) + '/auth/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'client_credentials' })
    });
    if (!r.ok) throw new Error('Échec authentification Airtel (' + r.status + ')');
    return (await r.json()).access_token;
  }
  app.get('/api/airtel/config-status', requireAuth, function (req, res) {
    const cfg = loadJson(req.tenant, 'airtel-config.json', airtelDefault);
    res.json({ configured: !!(cfg.clientId && cfg.clientSecret), environment: cfg.environment || 'staging' });
  });
  app.post('/api/airtel/save-config', requireAuth, requireAdmin, function (req, res) {
    const b = req.body || {};
    saveJson(req.tenant, 'airtel-config.json', {
      clientId: String(b.clientId || ''), clientSecret: String(b.clientSecret || ''), pin: '',
      country: String(b.country || 'GA'), currency: String(b.currency || 'XAF'),
      environment: b.environment === 'production' ? 'production' : 'staging'
    });
    req.tenant.journal('Airtel : configuration mise à jour par ' + req.user.nom);
    res.json({ ok: true });
  });
  app.post('/api/airtel/collect', requireAuth, async function (req, res) {
    try {
      const cfg = loadJson(req.tenant, 'airtel-config.json', airtelDefault);
      if (!cfg.clientId || !cfg.clientSecret) return res.status(400).json({ ok: false, error: "Airtel Money n'est pas encore configuré (Paramètres > Paiement Mobile)." });
      const b = req.body || {};
      if (!b.phone || !b.amount) return res.status(400).json({ ok: false, error: 'Numéro et montant requis.' });
      const token = await airtelToken(cfg);
      const txRef = b.reference ? String(b.reference).slice(0, 60) : ('FSS-' + Date.now());
      const r = await fetch(airtelBase(cfg) + '/merchant/v1/payments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Country': cfg.country || 'GA', 'X-Currency': cfg.currency || 'XAF' },
        body: JSON.stringify({ reference: 'FSS-CAISSE', subscriber: { country: cfg.country, currency: cfg.currency, msisdn: String(b.phone) }, transaction: { amount: b.amount, country: cfg.country, currency: cfg.currency, id: txRef } })
      });
      const data = await r.json().catch(function () { return {}; });
      if (!r.ok) return res.status(502).json({ ok: false, error: (data && data.message) || 'Échec de la demande de paiement Airtel Money.' });
      res.json({ ok: true, transactionId: txRef });
    } catch (e) { res.status(500).json({ ok: false, error: e.message || 'Erreur Airtel Money' }); }
  });
  app.get('/api/airtel/status/:transactionId', requireAuth, async function (req, res) {
    try {
      const cfg = loadJson(req.tenant, 'airtel-config.json', airtelDefault);
      if (!cfg.clientId || !cfg.clientSecret) return res.status(400).json({ ok: false, error: 'Non configuré' });
      const token = await airtelToken(cfg);
      const r = await fetch(airtelBase(cfg) + '/standard/v1/payments/' + encodeURIComponent(req.params.transactionId), {
        headers: { 'Authorization': 'Bearer ' + token, 'X-Country': cfg.country || 'GA', 'X-Currency': cfg.currency || 'XAF' }
      });
      const data = await r.json().catch(function () { return {}; });
      const st = data && data.data && data.data.transaction && data.data.transaction.status;
      res.json({ ok: true, status: st || 'PENDING', raw: data });
    } catch (e) { res.status(500).json({ ok: false, error: e.message || 'Erreur Airtel Money' }); }
  });

  // ---------- Mobile Money PVIT via le relais FSS-PAY ----------
  // Protection SSRF : le relais est saisi par l'administrateur d'un établissement ; sur un serveur
  // partagé il ne doit jamais pouvoir viser le réseau interne (localhost, réseaux privés...).
  function isPrivateAddress(addr) {
    if (net.isIPv4(addr)) {
      const p = addr.split('.').map(Number);
      return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
    }
    if (net.isIPv6(addr)) {
      const a = addr.toLowerCase();
      if (a === '::1' || a === '::' || a.startsWith('fe80') || a.startsWith('fc') || a.startsWith('fd')) return true;
      const m = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
      return m ? isPrivateAddress(m[1]) : false;
    }
    return true;
  }
  function safeLookup(hostname, options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    dns.lookup(hostname, Object.assign({}, options, { all: true }), function (err, addrs) {
      if (err) return cb(err);
      const ok = addrs.filter(function (a) { return !isPrivateAddress(a.address); });
      if (!ok.length) return cb(new Error('adresse non autorisée'));
      if (options && options.all) return cb(null, ok);
      cb(null, ok[0].address, ok[0].family);
    });
  }
  const pvitDefault = { relais: '', cle: '' };
  function appelRelais(cfg, methode, chemin, corps) {
    return new Promise(function (resolve) {
      let url;
      try { url = new URL(cfg.relais.replace(/\/+$/, '') + '/api' + chemin); } catch (e) { return resolve({ status: 400, body: { ok: false, erreur: 'Adresse du relais FSS-PAY invalide' } }); }
      if (url.protocol !== 'https:') return resolve({ status: 400, body: { ok: false, erreur: 'Le relais FSS-PAY doit utiliser https://' } });
      const donnees = corps ? Buffer.from(JSON.stringify(corps)) : null;
      const entetes = { 'Accept': 'application/json', 'X-FSS-Cle': cfg.cle };
      if (donnees) { entetes['Content-Type'] = 'application/json'; entetes['Content-Length'] = donnees.length; }
      const r = https.request(url, { method: methode, headers: entetes, timeout: 30000, lookup: safeLookup }, function (rep) {
        const chunks = [];
        rep.on('data', function (c) { chunks.push(c); });
        rep.on('end', function () {
          let json;
          try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { json = { ok: false, erreur: 'Réponse invalide du relais FSS-PAY' }; }
          resolve({ status: rep.statusCode || 502, body: json });
        });
      });
      r.on('timeout', function () { r.destroy(new Error('délai dépassé')); });
      r.on('error', function (e) { resolve({ status: 502, body: { ok: false, erreur: 'Relais FSS-PAY injoignable (' + e.message + ').' } }); });
      if (donnees) r.write(donnees);
      r.end();
    });
  }
  app.get('/api/pvit/config-status', requireAuth, function (req, res) {
    const cfg = loadJson(req.tenant, 'pvit-config.json', pvitDefault);
    res.json({ configured: !!(cfg.relais && cfg.cle), relais: cfg.relais || '', cleFin: cfg.cle ? String(cfg.cle).slice(-4) : '' });
  });
  app.post('/api/pvit/save-config', requireAuth, requireAdmin, function (req, res) {
    const b = req.body || {};
    const actuel = loadJson(req.tenant, 'pvit-config.json', pvitDefault);
    const relais = String(b.relais || '').trim().replace(/\/+$/, '');
    if (relais && !/^https:\/\//i.test(relais)) return res.status(400).json({ ok: false, erreur: 'L\'adresse doit commencer par https://' });
    saveJson(req.tenant, 'pvit-config.json', { relais: relais, cle: String(b.cle || '').trim() || actuel.cle || '' });
    req.tenant.journal('PVIT : configuration mise à jour par ' + req.user.nom + ' (' + relais + ')');
    res.json({ ok: true });
  });
  const PVIT_CHEMINS = /^\/(sante|kyc|frais|solde|paiements(\/[A-Za-z0-9_-]{1,40})?)$/;
  app.all('/api/pvit/proxy/*', requireAuth, async function (req, res) {
    const chemin = '/' + req.params[0];
    if (!PVIT_CHEMINS.test(chemin) || (req.method !== 'GET' && req.method !== 'POST')) return res.status(404).json({ ok: false, erreur: 'Route Mobile Money inconnue' });
    const cfg = loadJson(req.tenant, 'pvit-config.json', pvitDefault);
    if (!cfg.relais || !cfg.cle) return res.status(400).json({ ok: false, erreur: 'Mobile Money non configuré (Paramètres > Paiement Mobile).' });
    const i = req.originalUrl.indexOf('?');
    const r = await appelRelais(cfg, req.method, chemin + (i >= 0 ? req.originalUrl.slice(i) : ''), req.method === 'POST' ? (req.body || {}) : null);
    if (req.method === 'POST' && chemin === '/paiements' && r.body && r.body.paiement) {
      req.tenant.journal('PVIT : paiement ' + r.body.paiement.reference + ' ' + r.body.paiement.montant + ' F -> ' + r.body.paiement.statut);
    }
    res.status(r.status).json(r.body);
  });

  app.use('/api', function (req, res) { res.status(404).json({ ok: false, erreur: 'Route inconnue' }); });

  // ---------- Temps réel (Socket.IO) : session obligatoire, une « salle » par établissement ----------
  io.use(function (socket, next) {
    const slug = hostToSlug(socket.handshake.headers.host);
    if (!slug || slug === INVALID || !store.exists(slug) || !store.isActive(slug)) return next(new Error('établissement indisponible'));
    const t = store.open(slug);
    const u = userFromToken(t, security.parseCookies(socket.handshake.headers.cookie)[COOKIE]);
    if (!u) return next(new Error('non connecté'));
    socket.data.slug = slug;
    next();
  });
  io.on('connection', function (socket) {
    const t = store.open(socket.data.slug);
    socket.join('t:' + t.slug);
    try { socket.emit('state:changed', publicState(t.state)); } catch (e) { console.error('[' + t.slug + '] connexion poste :', e); }
  });

  // ---------- Serveur interne : autorisation des certificats HTTPS à la demande (Caddy) ----------
  const internal = http.createServer(function (req, res) {
    const m = String(req.url || '').match(/^\/tls-ask\?(?:.*&)?domain=([^&]+)/);
    if (!m) { res.statusCode = 404; return res.end(); }
    const d = decodeURIComponent(m[1]).toLowerCase();
    let ok = false;
    if (baseDomain && (d === baseDomain || d === 'www.' + baseDomain)) ok = true;
    else if (baseDomain && d.endsWith('.' + baseDomain)) {
      const label = d.slice(0, -(baseDomain.length + 1));
      ok = store.SLUG_RE.test(label) && store.exists(label);
    } else if (defaultTenant && d !== '') ok = store.exists(defaultTenant) && !!opts.allowAnyHostTls;
    res.statusCode = ok ? 200 : 404;
    res.end(ok ? 'ok' : 'non');
  });

  // Filet de sécurité : une erreur imprévue ne doit jamais arrêter tous les établissements.
  return { app: app, server: server, io: io, store: store, internal: internal, sessions: sessions };
}

module.exports = { createApp };

if (require.main === module) {
  process.on('uncaughtException', function (e) { console.error('[FSS-CAISSE Cloud] Erreur non gérée (ignorée) :', e); });
  process.on('unhandledRejection', function (e) { console.error('[FSS-CAISSE Cloud] Promesse rejetée (ignorée) :', e); });
  const env = process.env;
  let inst;
  try {
    inst = createApp({
      dataDir: env.DATA_DIR || path.join(__dirname, '..', 'cloud-data'),
      baseDomain: env.BASE_DOMAIN, defaultTenant: env.DEFAULT_TENANT,
      sessionSecret: env.SESSION_SECRET,
      trustProxy: env.TRUST_PROXY === undefined ? 1 : (isNaN(Number(env.TRUST_PROXY)) ? env.TRUST_PROXY : Number(env.TRUST_PROXY)),
      forceSecureCookie: env.FORCE_SECURE_COOKIE === '1'
    });
  } catch (e) { console.error('Configuration invalide :', e.message); process.exit(1); }
  const port = Number(env.PORT) || 3000;
  inst.server.listen(port, '0.0.0.0', function () { console.log('[FSS-CAISSE Cloud] en écoute sur le port ' + port); });
  inst.internal.listen(Number(env.INTERNAL_PORT) || 3001, '0.0.0.0');
}
