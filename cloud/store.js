// FSS-CAISSE Cloud — registre des établissements (tenants) et stockage de leurs données.
// Un dossier par établissement : DATA_DIR/tenants/<slug>/{data.json, data.backup.json, ...}
'use strict';
const fs = require('fs');
const path = require('path');
const security = require('./security');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
const RESERVED = new Set(['www', 'admin', 'api', 'app', 'mail', 'ftp', 'static', 'cdn', 'status', 'help', 'support', 'test', 'demo-admin']);

function atomicWrite(file, content) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function blankState(nomEtab) {
  return {
    arts: [], clis: [], fours: [], cmds: [], txs: [], mouv: [], prls: [], cmdAttente: [],
    nextTk: 1, attenteSeq: 1, users: [], nextUserId: 1, logo: null,
    etab: { nom: nomEtab || 'FSS-CAISSE', tel: '', adr: '', rccm: '', nif: '', msgFin: 'Merci pour votre visite !' },
    tables: Array.from({ length: 20 }, function (_, i) { return { n: i + 1, nom: 'Table ' + (i + 1), st: 'Libre' }; }),
    servers: [], caisses: [{ id: 1, nom: 'Caisse 1' }], categories: [], fondsOuverture: {}, printBatches: [],
    clotureHistorique: [], categoryAlerteActive: {}, employes: [], pointages: [], paieEntries: []
  };
}

// Normalise les comptes : tout mot de passe en clair est haché, jamais conservé.
function normalizeUsers(state) {
  let changed = false;
  (state.users || []).forEach(function (u) {
    if (u.mdp) {
      u.mdpHash = security.hashPasswordSync(u.mdp);
      u.pwdAt = Date.now();
      delete u.mdp;
      changed = true;
    }
    if (!u.mdpHash) { u.mdpHash = ''; }
    if (typeof u.pwdAt !== 'number') { u.pwdAt = 0; changed = true; }
  });
  return changed;
}

// Copie de l'état SANS aucun secret, pour envoi aux navigateurs.
function publicState(state) {
  const copy = Object.assign({}, state);
  copy.users = (state.users || []).map(function (u) {
    const c = Object.assign({}, u);
    delete c.mdp; delete c.mdpHash; delete c.pwdAt;
    return c;
  });
  return copy;
}

function createStore(dataDir) {
  const tenantsFile = path.join(dataDir, 'tenants.json');
  const tenantsRoot = path.join(dataDir, 'tenants');
  const backupsRoot = path.join(dataDir, 'backups');
  fs.mkdirSync(tenantsRoot, { recursive: true });
  fs.mkdirSync(backupsRoot, { recursive: true });

  const cache = new Map();
  let registry = {};
  let registryMtime = -1;
  let registryCheckedAt = 0;
  function loadRegistry() {
    try { registry = JSON.parse(fs.readFileSync(tenantsFile, 'utf8')); } catch (e) { registry = {}; }
    try { registryMtime = fs.statSync(tenantsFile).mtimeMs; } catch (e) { registryMtime = -1; }
    registryCheckedAt = Date.now();
  }
  function saveRegistry() { atomicWrite(tenantsFile, JSON.stringify(registry, null, 2)); try { registryMtime = fs.statSync(tenantsFile).mtimeMs; } catch (e) {} }
  // Les commandes d'administration (admin.js) tournent dans un autre processus :
  // on relit le registre dès que le fichier change (vérifié au plus toutes les 2 s).
  function refreshRegistry() {
    if (Date.now() - registryCheckedAt < 2000) return;
    registryCheckedAt = Date.now();
    let m = -1;
    try { m = fs.statSync(tenantsFile).mtimeMs; } catch (e) {}
    if (m !== registryMtime) {
      loadRegistry();
      cache.forEach(function (t, slug) { if (!registry[slug]) cache.delete(slug); else t.meta = registry[slug]; });
    }
  }
  loadRegistry();

  function tenantDir(slug) { return path.join(tenantsRoot, slug); }

  function open(slug) {
    refreshRegistry();
    if (cache.has(slug)) {
      const c = cache.get(slug);
      if (Date.now() - c.checkedAt > 2000) {
        c.checkedAt = Date.now();
        try {
          const m = fs.statSync(c.file('data.json')).mtimeMs;
          if (m !== c.mtime) { c.state = JSON.parse(fs.readFileSync(c.file('data.json'), 'utf8')); normalizeUsers(c.state); c.mtime = m; }
        } catch (e) { /* fichier en cours d'écriture : on garde l'état en mémoire */ }
      }
      return c;
    }
    const meta = registry[slug];
    if (!meta) return null;
    const dir = tenantDir(slug);
    fs.mkdirSync(dir, { recursive: true });
    const dataFile = path.join(dir, 'data.json');
    const backupFile = path.join(dir, 'data.backup.json');
    const logFile = path.join(dir, 'sync-log.txt');
    let state = null;
    try { if (fs.existsSync(dataFile)) state = JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
    catch (e) {
      console.error('[' + slug + '] data.json illisible :', e.message);
      try { state = JSON.parse(fs.readFileSync(backupFile, 'utf8')); console.log('[' + slug + '] récupéré depuis la copie de secours'); }
      catch (e2) { console.error('[' + slug + '] copie de secours illisible aussi'); }
    }
    if (!state) state = blankState(meta.nom);

    const t = {
      slug: slug, meta: meta, dir: dir, state: state, mtime: -1, checkedAt: Date.now(),
      journal: function (ligne) {
        try { fs.appendFileSync(logFile, '[' + new Date().toISOString() + '] ' + ligne + '\n'); } catch (e) {}
      },
      save: function () {
        try { if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, backupFile); } catch (e) { console.error('[' + slug + '] copie de secours impossible :', e.message); }
        atomicWrite(dataFile, JSON.stringify(t.state));
        try { t.mtime = fs.statSync(dataFile).mtimeMs; } catch (e) {}
        dailyBackup(slug, dataFile);
      },
      file: function (name) { return path.join(dir, name); }
    };
    if (normalizeUsers(t.state)) t.save();
    try { t.mtime = fs.statSync(dataFile).mtimeMs; } catch (e) {}
    cache.set(slug, t);
    return t;
  }

  // Une sauvegarde par jour, 30 jours conservés.
  const lastBackupDay = new Map();
  function dailyBackup(slug, dataFile) {
    const day = new Date().toISOString().slice(0, 10);
    if (lastBackupDay.get(slug) === day) return;
    try {
      const dir = path.join(backupsRoot, slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(dataFile, path.join(dir, day + '.json'));
      lastBackupDay.set(slug, day);
      const files = fs.readdirSync(dir).filter(function (f) { return /^\d{4}-\d{2}-\d{2}\.json$/.test(f); }).sort();
      files.slice(0, Math.max(0, files.length - 30)).forEach(function (f) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
    } catch (e) { console.error('[' + slug + '] sauvegarde quotidienne impossible :', e.message); }
  }

  return {
    SLUG_RE: SLUG_RE,
    isValidSlug: function (s) { return SLUG_RE.test(s) && !RESERVED.has(s); },
    exists: function (slug) { refreshRegistry(); return !!registry[slug]; },
    isActive: function (slug) { refreshRegistry(); return !!registry[slug] && registry[slug].actif !== false; },
    list: function () { loadRegistry(); return Object.keys(registry).map(function (k) { return Object.assign({ slug: k }, registry[k]); }); },
    open: open,
    // Création : retourne { tenant, motDePasseAdmin }
    create: function (slug, nom, opts) {
      opts = opts || {};
      loadRegistry();
      if (!this.isValidSlug(slug)) throw new Error('Code établissement invalide (2 à 31 caractères : a-z, 0-9, tiret ; non réservé).');
      if (registry[slug]) throw new Error('Cet établissement existe déjà.');
      registry[slug] = { nom: nom || slug, actif: true, creeLe: new Date().toISOString() };
      saveRegistry();
      const t = open(slug);
      if (opts.state) t.state = opts.state; else t.state = blankState(nom || slug);
      // Import : mots de passe en clair -> hachés ; chaque employé (hors super) devra choisir un nouveau mot de passe.
      const importe = !!opts.state;
      normalizeUsers(t.state);
      if (importe) (t.state.users || []).forEach(function (u) { if (!u.super) u.doitChangerMdp = true; });
      const pwd = opts.adminPassword || security.randomPassword(14);
      // Compte administrateur du client — doit changer son mot de passe à la 1re connexion.
      t.state.users = (t.state.users || []).filter(function (u) { return u.nom.toLowerCase() !== 'admin'; });
      const id = (t.state.nextUserId = Math.max(t.state.nextUserId || 1, 1 + Math.max(0, ...(t.state.users || []).map(function (u) { return u.id || 0; }))));
      t.state.users.push({ id: id, nom: 'admin', mdpHash: security.hashPasswordSync(pwd), pwdAt: Date.now(), super: false, full: true, doitChangerMdp: true, perms: [] });
      t.state.nextUserId = id + 1;
      t.save();
      return { tenant: t, motDePasseAdmin: pwd };
    },
    setActive: function (slug, actif) {
      loadRegistry();
      if (!registry[slug]) throw new Error('Établissement introuvable.');
      registry[slug].actif = !!actif; saveRegistry();
    },
    // Nouveau mot de passe pour 'admin' (ou un autre compte)
    resetPassword: function (slug, nom) {
      const t = open(slug);
      if (!t) throw new Error('Établissement introuvable.');
      const u = (t.state.users || []).find(function (x) { return x.nom.toLowerCase() === String(nom || 'admin').toLowerCase(); });
      if (!u) throw new Error('Compte introuvable : ' + nom);
      const pwd = security.randomPassword(14);
      u.mdpHash = security.hashPasswordSync(pwd); u.pwdAt = Date.now(); u.doitChangerMdp = true;
      t.save();
      return pwd;
    },
    // Import d'un data.json existant (ex. venant de la version Windows)
    importState: function (slug, nom, state) {
      return this.create(slug, nom, { state: state });
    },
    blankState: blankState
  };
}

module.exports = { createStore, publicState, normalizeUsers, blankState };
