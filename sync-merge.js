// FSS-CAISSE — fusion à 3 voies (base / local / distant) de l'état de la caisse.
// Partagé par la version Windows (agent de synchronisation) et le serveur cloud.
//
// Principe : on compare chaque côté à la dernière version commune (« base »).
//   - un élément ajouté d'un côté est conservé ;
//   - un élément supprimé d'un côté est supprimé, sauf s'il a été modifié de l'autre côté ;
//   - un élément modifié d'un seul côté prend la version modifiée ;
//   - modifié des DEUX côtés : la version LOCALE (le poste de caisse) l'emporte ;
//   - cas particulier des listes qui ne font que grandir (ventes, mouvements de stock, paiements...) :
//     si les deux côtés créent une vente avec le même numéro, on garde LES DEUX (la version distante
//     reçoit le suffixe « -W ») — jamais de vente perdue.
// Écrit en JavaScript simple (pas de ?. ni ??) : doit tourner aussi sur les anciens Node des TPE.
'use strict';

function stable(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
    .map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
}

// Règles par liste. Les listes absentes d'ici utilisent la clé « id » si elle existe, sinon le contenu.
var LISTS = {
  users: { key: function (u) { return 'u:' + String(u.nom).toLowerCase(); }, ignore: ['pwdAt', 'mdp', 'mdpHashOf'] },
  tables: { key: function (t) { return 'n:' + t.n; } },
  printBatches: { key: function (b) { return 'b:' + b.batchId; } },
  txs: { appendOnly: true, newestFirst: true },
  mouv: { appendOnly: true, newestFirst: true },
  clotureHistorique: { appendOnly: true, newestFirst: true },
  prls: { appendOnly: true },
  pointages: { appendOnly: true }
};
// Compteurs : on garde toujours le plus grand pour ne jamais réutiliser un numéro.
var COUNTERS = { nextTk: 1, attenteSeq: 1, nextUserId: 1, artsUpdatedAt: 1 };

function without(obj, fields) {
  if (!fields || !obj || typeof obj !== 'object') return obj;
  var c = {};
  Object.keys(obj).forEach(function (k) { if (fields.indexOf(k) === -1) c[k] = obj[k]; });
  return c;
}
function same(a, b, cfg) {
  var ig = cfg && cfg.ignore;
  return stable(ig ? without(a, ig) : a) === stable(ig ? without(b, ig) : b);
}

function keyed(list, cfg) {
  var order = [], map = {}, seen = {};
  (list || []).forEach(function (el) {
    var base;
    if (cfg.key && el && typeof el === 'object') base = cfg.key(el);
    else if (el && typeof el === 'object' && el.id !== undefined && el.id !== null) base = 'id:' + el.id;
    else base = 'c:' + stable(el);
    // Plusieurs éléments identiques ou de même clé : on numérote les occurrences.
    seen[base] = (seen[base] || 0) + 1;
    var k = seen[base] === 1 ? base : base + '#' + seen[base];
    order.push(k);
    map[k] = el;
  });
  return { order: order, map: map };
}
function has(m, k) { return Object.prototype.hasOwnProperty.call(m, k); }

function mergeList(name, base, local, remote, conflicts) {
  var cfg = LISTS[name] || {};
  var B = keyed(base, cfg), L = keyed(local, cfg), R = keyed(remote, cfg);
  var out = [], added = [];

  L.order.forEach(function (k) {
    var l = L.map[k], inR = has(R.map, k), inB = has(B.map, k);
    if (inR) {
      var r = R.map[k];
      if (same(l, r, cfg)) { out.push(l); return; }
      if (inB && same(l, B.map[k], cfg)) { out.push(r); return; }   // seul le distant a modifié
      if (inB && same(r, B.map[k], cfg)) { out.push(l); return; }   // seul le local a modifié
      if (!inB && cfg.appendOnly && l && typeof l === 'object' && l.id !== undefined) {
        // Même numéro créé des deux côtés, contenus différents : on garde les deux.
        out.push(l);
        var copy = JSON.parse(JSON.stringify(r));
        var nid = String(r.id) + '-W', n = 2;
        while (has(L.map, 'id:' + nid) || has(R.map, 'id:' + nid)) { nid = String(r.id) + '-W' + n++; }
        copy.id = nid;
        added.push(copy);
        conflicts.push({ liste: name, cle: k, type: 'numero-en-double', renomme: nid });
        return;
      }
      conflicts.push({ liste: name, cle: k, type: 'modifie-des-deux-cotes' });
      out.push(l);                                                  // le local l'emporte
      return;
    }
    if (inB) { if (same(l, B.map[k], cfg)) return; out.push(l); return; } // supprimé côté distant (sauf si modifié ici)
    out.push(l);                                                    // ajouté ici
  });

  R.order.forEach(function (k) {
    if (has(L.map, k)) return;
    var r = R.map[k];
    if (has(B.map, k)) { if (same(r, B.map[k], cfg)) return; added.push(r); return; } // supprimé ici (sauf si modifié là-bas)
    added.push(r);                                                  // ajouté là-bas
  });

  if (cfg.newestFirst) return added.concat(out);
  return out.concat(added);
}

function scalar3(b, l, r) {
  if (stable(l) === stable(r)) return l;
  if (stable(l) === stable(b)) return r;
  if (stable(r) === stable(b)) return l;
  return l;
}
function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function mergeObject(b, l, r) {
  b = isPlainObject(b) ? b : {}; l = isPlainObject(l) ? l : {}; r = isPlainObject(r) ? r : {};
  var keys = {};
  [b, l, r].forEach(function (o) { Object.keys(o).forEach(function (k) { keys[k] = true; }); });
  var out = {};
  Object.keys(keys).forEach(function (k) {
    var v = (isPlainObject(l[k]) || isPlainObject(r[k]))
      ? mergeObject(b[k], l[k], r[k])
      : scalar3(b[k], l[k], r[k]);
    if (v !== undefined) out[k] = v;
  });
  return out;
}

// base : dernier état commun (ou null à la première synchronisation)
function merge3(base, local, remote) {
  base = base || {}; local = local || {}; remote = remote || {};
  var conflicts = [];
  var keys = {};
  [base, local, remote].forEach(function (o) { Object.keys(o).forEach(function (k) { keys[k] = true; }); });
  var out = {};
  Object.keys(keys).forEach(function (k) {
    var b = base[k], l = local[k], r = remote[k], v;
    if (Array.isArray(l) || Array.isArray(r)) {
      v = mergeList(k, Array.isArray(b) ? b : [], Array.isArray(l) ? l : [], Array.isArray(r) ? r : [], conflicts);
    } else if (has(COUNTERS, k)) {
      var nums = [b, l, r].filter(function (x) { return typeof x === 'number'; });
      v = nums.length ? Math.max.apply(null, nums) : undefined;
    } else if (isPlainObject(l) || isPlainObject(r)) {
      v = mergeObject(b, l, r);
    } else {
      v = scalar3(b, l, r);
    }
    if (v !== undefined) out[k] = v;
  });
  return { state: out, conflicts: conflicts };
}

module.exports = { merge3: merge3, stable: stable, LISTS: LISTS };
