#!/usr/bin/env node
// FSS-CAISSE Cloud — administration des établissements (en ligne de commande).
//   node cloud/admin.js creer <code> "<Nom de l'établissement>"
//   node cloud/admin.js importer <code> "<Nom>" <chemin/vers/data.json>   (reprise des données de la version Windows)
//   node cloud/admin.js liste
//   node cloud/admin.js suspendre <code>      |  reactiver <code>
//   node cloud/admin.js mot-de-passe <code> [identifiant]   (génère un nouveau mot de passe, à changer à la connexion)
//   node cloud/admin.js appareils <code>      |  revoquer <code> <id-appareil>   (PC liés pour la synchronisation)
'use strict';
const path = require('path');
const fs = require('fs');
const { createStore } = require('./store');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'cloud-data');
const store = createStore(dataDir);
const base = process.env.BASE_DOMAIN || '<votre-domaine>';
const [cmd, a, b, c] = process.argv.slice(2);

function fail(msg) { console.error('Erreur : ' + msg); process.exit(1); }
function adresse(slug) { return 'https://' + slug + '.' + base; }

try {
  if (cmd === 'creer') {
    if (!a) fail('code manquant. Usage : creer <code> "<Nom>"');
    const r = store.create(a.toLowerCase(), b || a);
    console.log('Établissement créé : ' + (b || a));
    console.log('  Adresse        : ' + adresse(a.toLowerCase()));
    console.log('  Identifiant    : admin');
    console.log('  Mot de passe   : ' + r.motDePasseAdmin + '   (à changer obligatoirement à la 1re connexion — noter ce mot de passe maintenant, il ne sera plus affiché)');
  } else if (cmd === 'importer') {
    if (!a || !c) fail('Usage : importer <code> "<Nom>" <data.json>');
    let state;
    try { state = JSON.parse(fs.readFileSync(c, 'utf8')); } catch (e) { fail('data.json illisible : ' + e.message); }
    const r = store.importState(a.toLowerCase(), b || a, state);
    const users = r.tenant.state.users.filter(function (u) { return u.nom.toLowerCase() !== 'admin' || !u.doitChangerMdp ? true : true; });
    console.log('Données importées pour : ' + (b || a) + ' (' + adresse(a.toLowerCase()) + ')');
    console.log('  Comptes importés : ' + users.map(function (u) { return u.nom; }).join(', '));
    console.log('  Mots de passe existants hachés ; chaque employé choisira un nouveau mot de passe à sa prochaine connexion.');
    console.log('  Nouveau compte de secours : admin / ' + r.motDePasseAdmin + '  (à changer à la 1re connexion)');
    const supers = r.tenant.state.users.filter(function (u) { return u.super; });
    if (supers.length) console.log('  ⚠ Compte(s) protégé(s) conservé(s) tel quel : ' + supers.map(function (u) { return u.nom; }).join(', ') + ' — changez leur mot de passe : node cloud/admin.js mot-de-passe ' + a.toLowerCase() + ' <identifiant>');
  } else if (cmd === 'liste') {
    const l = store.list();
    if (!l.length) console.log('Aucun établissement.');
    l.forEach(function (t) { console.log((t.actif === false ? '[SUSPENDU] ' : '[actif]    ') + t.slug.padEnd(20) + t.nom + '  — ' + adresse(t.slug)); });
  } else if (cmd === 'suspendre' || cmd === 'reactiver') {
    if (!a) fail('code manquant');
    store.setActive(a.toLowerCase(), cmd === 'reactiver');
    console.log('Établissement ' + a + (cmd === 'reactiver' ? ' réactivé.' : ' suspendu.'));
  } else if (cmd === 'mot-de-passe') {
    if (!a) fail('code manquant');
    const nom = b || 'admin';
    const pwd = store.resetPassword(a.toLowerCase(), nom);
    console.log('Nouveau mot de passe pour ' + nom + ' (' + a + ') : ' + pwd + '   (à changer à la prochaine connexion)');
  } else if (cmd === 'appareils' || cmd === 'revoquer') {
    if (!a) fail('code manquant');
    const f = path.join(dataDir, 'tenants', a.toLowerCase(), 'devices.json');
    let dev = {};
    try { dev = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
    if (cmd === 'revoquer') {
      if (!b || !dev[b]) fail('appareil introuvable (voir : appareils ' + a + ')');
      delete dev[b]; fs.writeFileSync(f, JSON.stringify(dev, null, 2));
      console.log('Appareil ' + b + ' révoqué : il ne pourra plus se synchroniser.');
    } else {
      const ids = Object.keys(dev);
      if (!ids.length) console.log('Aucun poste lié.');
      ids.forEach(function (id) { console.log(id + '  ' + dev[id].nom.padEnd(24) + ' lié le ' + String(dev[id].creeLe).slice(0, 10) + ' par ' + dev[id].par + ' — dernière synchro : ' + (dev[id].dernierSync || 'jamais')); });
    }
  } else {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 9).map(function (l) { return l.replace(/^\/\/ ?/, ''); }).join('\n'));
    process.exit(cmd ? 1 : 0);
  }
} catch (e) { fail(e.message); }
