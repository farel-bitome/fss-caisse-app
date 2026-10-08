// FSS-CAISSE — Fusion à trois voies des données entre le PC (local) et le cloud.
//   base  = état commun lors de la dernière synchronisation réussie (ou null à la première liaison)
//   local = état actuel du PC            cloud = état actuel du serveur web
// Règles : aucune vente perdue ; stock/soldes = somme des variations des deux côtés ;
// en cas de modification simultanée du même champ, le PC (poste de caisse) gagne.
// Écrit sans syntaxe récente (?. ??) : doit tourner aussi sur les anciens Node des terminaux.
'use strict';

// Données propres à chaque côté, jamais synchronisées (opérationnel / réseau local).
var NOT_SYNCED = ['cmdAttente', 'printBatches', 'attenteSeq', 'syncVersion', 'menuMigratedV2', 'categoriesMigratedV1', 'tablesMigratedV1'];

var KEYED = {
  arts:  { key: 'id', counters: ['stk'], collision: 'renumber' },
  clis:  { key: 'id', counters: ['total', 'solde'], collision: 'renumber' },
  fours: { key: 'id', counters: ['enc'], collision: 'renumber' },
  cmds:  { key: 'id', collision: 'suffix', front: true },
  txs:   { key: 'id', collision: 'suffix', front: true },
  clotureHistorique: { key: 'id', collision: 'suffix', front: true },
  employes:  { key: 'id', collision: 'renumber' },
  pointages: { key: 'id', collision: 'renumber' },
  tables: { key: 'n' },
  paieEntries: { key: ['empId', 'mois'] },
  users: { key: 'id', collision: 'renumber', users: true }
};
var FRONT_SETS = { mouv: true };
var MAX_KEYS = ['nextTk', 'nextUserId', 'artsUpdatedAt'];
var PW_FIELDS = ['mdp', 'mdpHash', 'pwdAt'];

function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

function stable(x) {
  if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
  if (isObj(x)) {
    return '{' + Object.keys(x).sort().filter(function (k) { return x[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ':' + stable(x[k]); }).join(',') + '}';
  }
  return JSON.stringify(x === undefined ? null : x);
}
function eq(a, b) { return stable(a) === stable(b); }
function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

function recKey(cfg, rec) {
  if (!rec) return '';
  if (Array.isArray(cfg.key)) return cfg.key.map(function (k) { return String(rec[k]); }).join('|');
  return String(rec[cfg.key]);
}

// ---- Enregistrement : fusion champ par champ quand les deux côtés ont modifié ----
function mergeFields(b, l, c, counters) {
  var out = {};
  var keys = {};
  Object.keys(l).forEach(function (k) { keys[k] = 1; });
  Object.keys(c).forEach(function (k) { keys[k] = 1; });
  Object.keys(keys).forEach(function (k) {
    var lv = l[k], cv = c[k], bv = b ? b[k] : undefined;
    var v;
    if (counters && counters.indexOf(k) !== -1 && typeof lv === 'number' && typeof cv === 'number' && typeof bv === 'number') {
      v = bv + (lv - bv) + (cv - bv);
      if (k === 'stk') v = Math.max(0, v);
    } else if (eq(lv, bv)) v = cv; else v = lv; // le PC gagne
    if (v !== undefined) out[k] = clone(v);
  });
  return out;
}

function mergeUserRecord(b, l, c) {
  var strip = function (r) { var o = {}; if (!r) return o; Object.keys(r).forEach(function (k) { if (PW_FIELDS.indexOf(k) === -1) o[k] = r[k]; }); return o; };
  var out = mergeFields(b ? strip(b) : null, strip(l), strip(c), null);
  var cloudChanged = (c.pwdAt || 0) > ((b && b.pwdAt) || 0);
  var localChanged = !!l.mdp && (!b || l.mdp !== b.mdp);
  if (localChanged) { out.mdp = l.mdp; if (c.mdpHash) out.mdpHash = c.mdpHash; out.pwdAt = c.pwdAt || 0; }
  else if (cloudChanged) { out.mdpHash = c.mdpHash; out.pwdAt = c.pwdAt; }
  else {
    if (l.mdp) out.mdp = l.mdp;
    if (l.mdpHash || c.mdpHash) out.mdpHash = l.mdpHash || c.mdpHash;
    out.pwdAt = Math.max(l.pwdAt || 0, c.pwdAt || 0);
  }
  return out;
}

function recordChanged(a, b) { return !eq(a, b); }

// ---- Listes d'enregistrements avec identifiant ----
function mergeKeyed(cfg, base, local, cloud, hasBase, report, name) {
  local = Array.isArray(local) ? local : [];
  cloud = Array.isArray(cloud) ? cloud : [];
  var bMap = {}, lMap = {}, cMap = {};
  (Array.isArray(base) ? base : []).forEach(function (r) { bMap[recKey(cfg, r)] = r; });
  local.forEach(function (r) { lMap[recKey(cfg, r)] = r; });
  cloud.forEach(function (r) { cMap[recKey(cfg, r)] = r; });

  var maxNum = 0;
  [local, cloud, base || []].forEach(function (lst) { lst.forEach(function (r) { var n = Number(r && r.id); if (n > maxNum) maxNum = n; }); });
  var usedIds = {};
  Object.keys(lMap).forEach(function (k) { usedIds[k] = 1; });
  Object.keys(cMap).forEach(function (k) { usedIds[k] = 1; });

  var fromLocal = [], fromCloud = [];

  local.forEach(function (lr) {
    var k = recKey(cfg, lr);
    var b = bMap[k], c = cMap[k];
    if (c) {
      if (eq(lr, c)) { fromLocal.push(lr); return; }
      if (b) {
        var lCh = recordChanged(lr, b), cCh = recordChanged(c, b);
        if (lCh && !cCh) fromLocal.push(lr);
        else if (!lCh && cCh) fromLocal.push(c);
        else fromLocal.push(cfg.users ? mergeUserRecord(b, lr, c) : mergeFields(b, lr, c, cfg.counters));
      } else if (hasBase) {
        // Même identifiant créé des deux côtés depuis la dernière synchronisation : vraie collision.
        fromLocal.push(lr);
        var moved = clone(c);
        if (cfg.collision === 'suffix') {
          var nid = String(c.id) + '-W', n = 2;
          while (usedIds[nid]) { nid = String(c.id) + '-W' + (n++); }
          usedIds[nid] = 1; moved.id = nid;
          report.conflicts.push({ liste: name, type: 'renommé', ancien: String(c.id), nouveau: nid });
          fromCloud.push(moved);
        } else if (cfg.collision === 'renumber') {
          maxNum++; moved.id = maxNum; usedIds[String(maxNum)] = 1;
          report.conflicts.push({ liste: name, type: 'renuméroté', ancien: String(c.id), nouveau: String(maxNum) });
          fromCloud.push(moved);
        } else { /* le PC gagne */ }
      } else if (cfg.users && String(lr.nom).toLowerCase() !== String(c.nom).toLowerCase()) {
        // Première liaison, deux personnes différentes sous le même numéro : on garde les deux.
        fromLocal.push(lr);
        var autre = clone(c); maxNum++; autre.id = maxNum; usedIds[String(maxNum)] = 1;
        report.conflicts.push({ liste: name, type: 'renuméroté', ancien: String(c.id), nouveau: String(maxNum) });
        fromCloud.push(autre);
      } else {
        // Première liaison : le PC fait référence, il remplace l'enregistrement du serveur.
        fromLocal.push(cfg.users ? mergeUserRecord(null, lr, c) : lr);
      }
    } else {
      if (b && !recordChanged(lr, b)) return; // supprimé côté web, inchangé ici -> supprimé
      fromLocal.push(lr); // nouveau ici, ou modifié ici alors que le web l'a supprimé
    }
  });

  cloud.forEach(function (cr) {
    var k = recKey(cfg, cr);
    if (lMap[k]) return;
    var b = bMap[k];
    if (b && !recordChanged(cr, b)) return; // supprimé ici, inchangé côté web -> supprimé
    fromCloud.push(cr);
  });

  var out = cfg.front ? fromCloud.concat(fromLocal) : fromLocal.concat(fromCloud);
  if (cfg.users) {
    var seen = {};
    out = out.filter(function (u) {
      var n = String(u.nom || '').toLowerCase();
      if (seen[n]) {
        // Même nom des deux côtés (ex. « admin » créé sur le web et sur le PC) : un seul compte, qui garde le mot de passe du web s'il n'en a pas de valable.
        if (!seen[n].mdpHash && u.mdpHash) { seen[n].mdpHash = u.mdpHash; seen[n].pwdAt = u.pwdAt; }
        return false;
      }
      seen[n] = u; return true;
    });
  }
  return out;
}

// ---- Listes sans identifiant (mouvements de stock, prélèvements, catégories...) : multi-ensemble ----
function mergeBag(base, local, cloud, hasBase, front) {
  local = Array.isArray(local) ? local : [];
  cloud = Array.isArray(cloud) ? cloud : [];
  var count = function (lst) { var m = {}; (lst || []).forEach(function (x) { var f = stable(x); m[f] = (m[f] || 0) + 1; }); return m; };
  var bc = count(Array.isArray(base) ? base : []), lc = count(local), cc = count(cloud);
  var target = {};
  var all = {};
  [bc, lc, cc].forEach(function (m) { Object.keys(m).forEach(function (f) { all[f] = 1; }); });
  Object.keys(all).forEach(function (f) {
    var t = hasBase ? (lc[f] || 0) + (cc[f] || 0) - (bc[f] || 0) : Math.max(lc[f] || 0, cc[f] || 0);
    target[f] = Math.max(0, t);
  });
  var out = [], emitted = {};
  function take(lst) {
    lst.forEach(function (x) {
      var f = stable(x);
      if ((emitted[f] || 0) < target[f]) { emitted[f] = (emitted[f] || 0) + 1; out.push(clone(x)); }
    });
  }
  if (front) { // nouveautés du web d'abord (plus récentes que la dernière synchro), puis l'ordre du PC
    take(cloud.filter(function (x) { return !bc[stable(x)]; }));
    take(local); take(cloud);
    return out;
  }
  take(local); take(cloud);
  return out;
}

function mergeMap(base, local, cloud) {
  base = isObj(base) ? base : {}; local = isObj(local) ? local : {}; cloud = isObj(cloud) ? cloud : {};
  var m = mergeFields(base, local, cloud, null);
  return m;
}

// ---- Fusion complète ----
function mergeStates(base, local, cloud) {
  local = local || {}; cloud = cloud || {};
  var hasBase = isObj(base) && Object.keys(base).length > 0;
  var b = hasBase ? base : {};
  var report = { conflicts: [] };
  var out = {};
  var keys = {};
  [local, cloud].forEach(function (s) { Object.keys(s).forEach(function (k) { keys[k] = 1; }); });

  Object.keys(keys).forEach(function (k) {
    if (NOT_SYNCED.indexOf(k) !== -1 || k.charAt(0) === '_') return;
    var lv = local[k], cv = cloud[k], bv = b[k];
    var v;
    if (KEYED[k] && (Array.isArray(lv) || Array.isArray(cv))) {
      v = mergeKeyed(KEYED[k], bv, lv, cv, hasBase, report, k);
    } else if (MAX_KEYS.indexOf(k) !== -1) {
      v = Math.max(Number(lv) || 0, Number(cv) || 0, 0);
    } else if (Array.isArray(lv) || Array.isArray(cv)) {
      v = mergeBag(bv, lv, cv, hasBase, !!FRONT_SETS[k]);
    } else if (isObj(lv) || isObj(cv)) {
      v = mergeMap(bv, lv, cv);
    } else {
      v = eq(lv, bv) ? cv : lv; // valeur simple : le PC gagne s'il l'a modifiée
      if (!hasBase && lv !== undefined && lv !== null) v = lv;
    }
    if (v !== undefined) out[k] = v;
  });
  // Le compteur de comptes doit toujours dépasser le plus grand numéro attribué (y compris après renumérotation).
  if (Array.isArray(out.users)) {
    var maxUid = out.users.reduce(function (m, u) { return Math.max(m, Number(u.id) || 0); }, 0);
    out.nextUserId = Math.max(Number(out.nextUserId) || 1, maxUid + 1);
  }
  return { state: out, report: report };
}

// Sous-ensemble synchronisé d'un état (pour détecter les changements locaux)
function syncable(state) {
  var o = {};
  Object.keys(state || {}).forEach(function (k) { if (NOT_SYNCED.indexOf(k) === -1 && k.charAt(0) !== '_') o[k] = state[k]; });
  return o;
}

module.exports = { mergeStates: mergeStates, syncable: syncable, stable: stable, eq: eq, NOT_SYNCED: NOT_SYNCED };
