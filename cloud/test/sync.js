// Test de la synchronisation PC (hors-ligne) <-> web : liaison, coupure, changements des deux côtés, retour d'Internet.
// Lancer : npm run cloud:test:sync
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');
const startEmbedded = require('../../embedded-server');
const { merge3 } = require('../../sync-merge');

let pass = 0, fails = 0;
function ok(c, m) { if (c) { pass++; console.log('  ok   ' + m); } else { fails++; console.log('  ECHEC ' + m); } }
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function call(port, method, url, body, headers) {
  return new Promise(function (resolve, reject) {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const h = Object.assign({}, headers || {});
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = data.length; }
    const r = http.request({ host: '127.0.0.1', port: port, method: method, path: url, headers: h }, function (res) {
      const ch = []; res.on('data', function (c) { ch.push(c); });
      res.on('end', function () { const t = Buffer.concat(ch).toString(); let j = null; try { j = JSON.parse(t); } catch (e) {} resolve({ status: res.statusCode, json: j, cookie: (res.headers['set-cookie'] || [''])[0].split(';')[0] }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function waitFor(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(200); } return false; }

(async function () {
  // ---------- 1. Fusion à 3 voies (cas limites) ----------
  console.log('Fusion à 3 voies');
  let m = merge3({ arts: [{ id: 1, stk: 10 }] }, { arts: [{ id: 1, stk: 8 }] }, { arts: [{ id: 1, stk: 10 }] });
  ok(m.state.arts[0].stk === 8, 'modification locale seule conservée');
  m = merge3({ arts: [{ id: 1, stk: 10 }] }, { arts: [{ id: 1, stk: 10 }] }, { arts: [{ id: 1, stk: 7 }] });
  ok(m.state.arts[0].stk === 7, 'modification distante seule reprise');
  m = merge3({ arts: [{ id: 1, stk: 10 }] }, { arts: [{ id: 1, stk: 8 }] }, { arts: [{ id: 1, stk: 7 }] });
  ok(m.state.arts[0].stk === 8 && m.conflicts.length === 1, 'modifié des deux côtés : le PC l\'emporte (conflit signalé)');
  m = merge3({ txs: [] }, { txs: [{ id: 'TK-5', ttc: 100 }] }, { txs: [{ id: 'TK-5', ttc: 250 }] });
  ok(m.state.txs.length === 2 && m.state.txs.some(function (t) { return t.id === 'TK-5-W' && t.ttc === 250; }) && m.state.txs.some(function (t) { return t.id === 'TK-5' && t.ttc === 100; }), 'deux ventes au même numéro : les DEUX sont conservées');
  m = merge3({ clis: [{ id: 1, nom: 'A' }, { id: 2, nom: 'B' }] }, { clis: [{ id: 2, nom: 'B' }] }, { clis: [{ id: 1, nom: 'A' }, { id: 2, nom: 'B' }, { id: 3, nom: 'C' }] });
  ok(m.state.clis.map(function (c) { return c.id; }).join() === '2,3', 'suppression locale + ajout distant combinés');
  m = merge3({ mouv: [{ a: 1 }] }, { mouv: [{ a: 1 }, { a: 1 }] }, { mouv: [{ a: 1 }] });
  ok(m.state.mouv.length === 2, 'deux mouvements identiques ne sont pas fusionnés par erreur');
  m = merge3({ nextTk: 5 }, { nextTk: 9 }, { nextTk: 7 });
  ok(m.state.nextTk === 9, 'compteurs : on garde le plus grand');

  // ---------- 2. Serveur web + PC ----------
  const dirCloud = fs.mkdtempSync(path.join(os.tmpdir(), 'fss-sync-cloud-'));
  const dirPc = fs.mkdtempSync(path.join(os.tmpdir(), 'fss-sync-pc-'));
  const root = path.join(__dirname, '..', '..');
  const cloud = createApp({ dataDir: dirCloud, defaultTenant: 'resto', sessionSecret: 'k'.repeat(40) });
  const made = cloud.store.create('resto', 'Resto Test');
  await new Promise(function (r) { cloud.server.listen(0, '127.0.0.1', r); });
  let cloudPort = cloud.server.address().port;
  const cloudUrl = 'http://127.0.0.1:' + cloudPort;

  // Un PC avec des données existantes (comptes en clair, comme dans la version Windows actuelle)
  fs.writeFileSync(path.join(dirPc, 'data.json'), JSON.stringify({
    arts: [{ id: 1, nom: 'Biere', stk: 50, pv: 1000 }, { id: 2, nom: 'Eau', stk: 30, pv: 500 }],
    clis: [], fours: [], cmds: [], txs: [{ id: 'TK-0001', ttc: 3000 }], mouv: [], prls: [], cmdAttente: [], nextTk: 2, attenteSeq: 1,
    users: [{ id: 1, nom: 'BITOME', mdp: 'secret-pc', super: true, full: true, perms: [] }, { id: 2, nom: 'caissier', mdp: 'caisse123', perms: ['caisse'] }],
    nextUserId: 3, etab: { nom: 'Resto Test' }, tables: [{ n: 1, nom: 'T1', st: 'Libre' }], caisses: ['Caisse 1'], categories: [], menuMigratedV2: true, categoriesMigratedV1: true, tablesMigratedV1: true
  }));
  const pc = await startEmbedded(0, dirPc, root);
  const pcPort = pc.address().port;
  const local = { Origin: 'http://127.0.0.1:' + pcPort };

  console.log('Sécurité de la liaison');
  let r = await call(pcPort, 'GET', '/api/cloud/status', undefined, { Origin: 'https://evil.example' });
  ok(r.status === 403, 'une page web étrangère ne peut pas piloter la synchro du PC');
  r = await call(pcPort, 'POST', '/api/cloud/link', { url: 'http://exemple.com', nom: 'a', mdp: 'b' }, local);
  ok(r.json && r.json.ok === false, 'adresse non sécurisée (http) refusée');
  r = await call(pcPort, 'POST', '/api/cloud/link', { url: cloudUrl, nom: 'admin', mdp: 'mauvais' }, local);
  ok(r.json && r.json.ok === false, 'mauvais mot de passe : liaison refusée');

  console.log('Première liaison (PC -> web)');
  // le compte admin du web doit avoir changé son mot de passe : on le fait via l'API web
  let lg = await call(cloudPort, 'POST', '/api/login', { nom: 'admin', mdp: made.motDePasseAdmin });
  await call(cloudPort, 'POST', '/api/me/password', { mdp: 'AdminWeb-2026' }, { Cookie: lg.cookie });
  r = await call(pcPort, 'POST', '/api/cloud/link', { url: cloudUrl, nom: 'admin', mdp: 'AdminWeb-2026', mode: 'push' }, local);
  if (!(r.json && r.json.ok)) console.log('   détail:', JSON.stringify(r.json)); ok(r.json && r.json.ok === true && r.json.status.lie, 'liaison réussie avec un compte administrateur');
  const cs = cloud.store.open('resto').state;
  ok(cs.arts.length === 2 && cs.txs.length === 1, 'les données du PC sont arrivées sur le web');
  ok(cs.users.some(function (u) { return u.nom === 'caissier'; }) && !JSON.stringify(cs.users).includes('caisse123') && !JSON.stringify(cs.users).includes('secret-pc'), 'comptes publiés avec mots de passe HACHÉS (aucun clair)');
  lg = await call(cloudPort, 'POST', '/api/login', { nom: 'caissier', mdp: 'caisse123' });
  ok(lg.status === 200, 'le caissier du PC peut se connecter sur le web avec le même mot de passe');
  ok(JSON.stringify(cs.tables).includes('"n":1') , 'tables du PC présentes');

  console.log('Travail hors-ligne : le web devient injoignable');
  await new Promise(function (r) { cloud.server.close(r); });
  const pcState = async function () { return (await call(pcPort, 'GET', '/api/state')).json; };
  let st = await pcState();
  st.txs.unshift({ id: 'TK-0002', ttc: 5000 }); st.nextTk = 3; st.arts[0].stk = 45;
  await call(pcPort, 'POST', '/api/state', st);
  r = await call(pcPort, 'POST', '/api/cloud/sync-now', {}, local);
  ok(r.json.enLigne === false && r.json.enAttente === true, 'hors-ligne : la caisse le sait et garde les changements en attente');
  r = await call(pcPort, 'POST', '/api/verify-login', { nom: 'caissier', mdp: 'caisse123' });
  ok(r.status === 200, 'la caisse reste utilisable sans Internet');

  console.log('Pendant ce temps, des changements sont faits sur le web (état modifié directement)');
  const t = cloud.store.open('resto');
  t.state.clis.push({ id: 7, nom: 'Client web' });
  t.state.users.push({ id: 50, nom: 'serveuse', mdpHash: require('../security').hashPasswordSync('web-pass-1'), pwdAt: Date.now(), perms: ['caisse'], doitChangerMdp: false });
  t.state.txs.unshift({ id: 'TK-0002', ttc: 999 }); // collision volontaire avec la vente du PC
  t.save();

  console.log('Retour d\'Internet');
  await new Promise(function (res) { cloud.server.listen(cloudPort, '127.0.0.1', res); });
  r = await call(pcPort, 'POST', '/api/cloud/sync-now', {}, local);
  ok(r.json.enLigne === true && !r.json.erreur && r.json.enAttente === false, 'connexion rétablie : synchronisé');
  const s2 = cloud.store.open('resto').state;
  const pcs = await pcState();
  ok(s2.txs.some(function (x) { return x.id === 'TK-0002' && x.ttc === 5000; }), 'la vente faite hors-ligne est sur le web');
  ok(s2.txs.some(function (x) { return x.id === 'TK-0002-W' && x.ttc === 999; }) && s2.txs.filter(function (x) { return /^TK-0002/.test(x.id); }).length === 2, 'collision de numéro : les deux ventes sont gardées');
  ok(s2.arts[0].stk === 45, 'stock modifié hors-ligne envoyé');
  ok(pcs.clis.some(function (c) { return c.nom === 'Client web'; }), 'le client créé sur le web est arrivé sur le PC');
  ok(pcs.users.some(function (u) { return u.nom === 'serveuse'; }), 'le compte créé sur le web est arrivé sur le PC');
  ok(pcs.users.find(function (u) { return u.nom === 'caissier'; }).mdp === 'caisse123', 'le PC garde les mots de passe de ses comptes');
  r = await call(pcPort, 'POST', '/api/verify-login', { nom: 'serveuse', mdp: 'web-pass-1' });
  ok(r.json.ok === true, 'le compte créé sur le web se connecte sur le PC (vérification locale, sans Internet)');
  r = await call(pcPort, 'POST', '/api/verify-login', { nom: 'serveuse', mdp: 'faux' });
  ok(r.json.ok === false, 'mauvais mot de passe refusé sur le PC');

  console.log('Mise à jour continue');
  const flag = (await call(pcPort, 'GET', '/api/state')).json;
  flag.arts.push({ id: 9, nom: 'Nouveau', stk: 1 }); flag.arts[0].stk = 40;
  await call(pcPort, 'POST', '/api/state', flag);
  ok(await waitFor(function () { return cloud.store.open('resto').state.arts.some(function (a) { return a.id === 9; }); }, 12000), 'un changement sur le PC arrive seul sur le web (sans clic)');
  const t2 = cloud.store.open('resto'); t2.state.fours.push({ id: 4, nom: 'Fournisseur web' }); t2.save();
  await call(pcPort, 'POST', '/api/cloud/sync-now', {}, local);
  ok((await pcState()).fours.some(function (f) { return f.id === 4; }), 'un changement du web arrive sur le PC');

  console.log('Appareil révoqué');
  const dev = t2.devices.list()[0];
  t2.devices.revoke(dev.id);
  r = await call(pcPort, 'POST', '/api/cloud/sync-now', {}, local);
  ok(/révoqué|autorisé/.test(String(r.json.erreur)), 'un PC révoqué est refusé et le dit clairement');
  await call(pcPort, 'POST', '/api/cloud/unlink', {}, local);
  r = await call(pcPort, 'GET', '/api/cloud/status', undefined, local);
  ok(r.json.lie === false, 'délier : le PC redevient autonome');
  ok((await pcState()).arts.length >= 3, 'les données du PC restent intactes après avoir délié');

  console.log('Nouveau PC (récupération depuis le web)');
  const dirPc2 = fs.mkdtempSync(path.join(os.tmpdir(), 'fss-sync-pc2-'));
  const pc2 = await startEmbedded(0, dirPc2, root);
  const pc2Port = pc2.address().port;
  r = await call(pc2Port, 'POST', '/api/cloud/link', { url: cloudUrl, nom: 'admin', mdp: 'AdminWeb-2026', mode: 'pull' }, { Origin: 'http://127.0.0.1:' + pc2Port });
  ok(r.json.ok === true, 'liaison en mode « récupérer »');
  const p2 = (await call(pc2Port, 'GET', '/api/state')).json;
  ok(p2.arts.length >= 3 && p2.txs.length >= 2 && p2.menuMigratedV2 === true, 'le nouveau PC a toutes les données du web (et ne remplace pas le catalogue au redémarrage)');
  r = await call(pc2Port, 'POST', '/api/verify-login', { nom: 'caissier', mdp: 'caisse123' });
  ok(r.json.ok === true, 'les comptes fonctionnent sur le nouveau PC');

  console.log('\n' + pass + ' réussis, ' + fails + ' échec(s)');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
