// Test de bout en bout du serveur cloud (aucun réseau externe). Lancer : npm run cloud:test
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io: ioc } = require('socket.io-client');
const { createApp } = require('../server');

let pass = 0, fails = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ok   ' + msg); } else { fails++; console.log('  ECHEC ' + msg); } }
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

function req(port, host, method, url, body, cookie, extra) {
  return new Promise(function (resolve, reject) {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const headers = Object.assign({ Host: host }, extra || {});
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = data.length; }
    if (cookie) headers.Cookie = cookie;
    const r = http.request({ host: '127.0.0.1', port: port, method: method, path: url, headers: headers }, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch (e) {}
        const sc = res.headers['set-cookie'];
        resolve({ status: res.statusCode, text: text, json: json, cookie: sc ? sc[0].split(';')[0] : null, setCookie: sc ? sc[0] : null });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fss-cloud-test-'));
  const inst = createApp({ dataDir: dir, baseDomain: 'caisse.test', sessionSecret: 'x'.repeat(40) });
  const store = inst.store;
  const a = store.create('demo', 'Demo Bar');
  store.create('autre', 'Autre Resto');
  await new Promise(function (r) { inst.server.listen(0, '127.0.0.1', r); });
  await new Promise(function (r) { inst.internal.listen(0, '127.0.0.1', r); });
  const P = inst.server.address().port, IP = inst.internal.address().port;
  const H = 'demo.caisse.test', H2 = 'autre.caisse.test';
  const PWD = a.motDePasseAdmin;

  console.log('Pages et résolution des établissements');
  let r = await req(P, H, 'GET', '/');
  ok(r.status === 200 && r.text.includes('/cloud-config.js'), 'page d\'application servie avec la config cloud');
  r = await req(P, 'caisse.test', 'GET', '/');
  ok(r.status === 200 && r.text.includes('Code établissement'), 'adresse principale : page d\'accueil');
  r = await req(P, 'inconnu.caisse.test', 'GET', '/');
  ok(r.status === 404, 'établissement inconnu : 404');
  r = await req(P, H, 'GET', '/auth.js');
  ok(r.status === 200, 'fichiers de l\'interface servis');
  r = await req(P, H, 'GET', '/cloud-config.js');
  ok(r.text.includes('FSS_CLOUD=true') && r.text.includes('"demo"'), 'cloud-config.js indique l\'établissement');

  console.log('Accès protégé');
  for (const u of ['/api/state', '/api/me', '/api/airtel/config-status', '/api/pvit/config-status']) {
    r = await req(P, H, 'GET', u); ok(r.status === 401, 'GET ' + u + ' sans session -> 401');
  }
  r = await req(P, H, 'POST', '/api/state', { users: [] }); ok(r.status === 401, 'POST /api/state sans session -> 401');
  r = await req(P, H, 'POST', '/api/airtel/save-config', {}); ok(r.status === 401, 'config Airtel sans session -> 401');
  r = await req(P, H, 'GET', '/api/public'); ok(r.status === 200 && r.json.nom === 'Demo Bar' && !('users' in r.json), 'infos publiques : nom seulement');

  console.log('Connexion');
  r = await req(P, H, 'POST', '/api/login', { nom: 'admin', mdp: 'mauvais' }); ok(r.status === 401, 'mauvais mot de passe -> 401');
  r = await req(P, H, 'POST', '/api/login', { nom: 'admin', mdp: PWD });
  ok(r.status === 200 && r.json.ok && r.cookie, 'bon mot de passe -> session');
  ok(/HttpOnly/.test(r.setCookie) && /SameSite=Lax/.test(r.setCookie), 'cookie HttpOnly + SameSite');
  let cookie = r.cookie;
  r = await req(P, H, 'GET', '/api/state', undefined, cookie);
  ok(r.status === 200 && Array.isArray(r.json.users), 'état lisible avec session');
  ok(!JSON.stringify(r.json).match(/mdp|scrypt|pwdAt/), 'AUCUN mot de passe/haché dans l\'état envoyé');
  ok(JSON.stringify(inst.store.open('demo').state.users).includes('scrypt$'), 'mots de passe hachés (scrypt) côté serveur');
  r = await req(P, H2, 'GET', '/api/state', undefined, cookie);
  ok(r.status === 401, 'session d\'un établissement refusée sur un autre (isolation)');

  console.log('Changement de mot de passe');
  r = await req(P, H, 'POST', '/api/me/password', { mdp: '123' }, cookie); ok(r.status === 400, 'mot de passe trop court refusé');
  r = await req(P, H, 'POST', '/api/me/password', { mdp: 'NouveauMdp-2026' }, cookie);
  ok(r.status === 200 && r.cookie, 'changement obligatoire accepté, nouvelle session émise');
  const oldCookie = cookie; cookie = r.cookie;
  r = await req(P, H, 'GET', '/api/state', undefined, oldCookie); ok(r.status === 401, 'ancienne session invalidée');
  r = await req(P, H, 'GET', '/api/state', undefined, cookie); ok(r.status === 200, 'nouvelle session valide');
  r = await req(P, H, 'POST', '/api/me/password', { mdp: 'Autre-Mdp-2026', ancien: 'faux' }, cookie); ok(r.status === 403, 'changement ultérieur : ancien mot de passe exigé');
  r = await req(P, H, 'POST', '/api/me/password', { mdp: 'Autre-Mdp-2026', ancien: 'NouveauMdp-2026' }, cookie); ok(r.status === 200, 'changement avec le bon ancien mot de passe');
  cookie = r.cookie;

  console.log('Comptes et droits');
  let st = (await req(P, H, 'GET', '/api/state', undefined, cookie)).json;
  st.users.push({ id: 99, nom: 'Marie', mdp: 'marie-2026', super: true, full: true, waiterOnly: false, perms: ['caisse'], doitChangerMdp: false });
  st.users.push({ id: 100, nom: 'SansMdp', mdp: '12', perms: [] });
  r = await req(P, H, 'POST', '/api/state', st, cookie); ok(r.status === 200, 'admin ajoute des comptes');
  st = (await req(P, H, 'GET', '/api/state', undefined, cookie)).json;
  const marie = st.users.find(function (u) { return u.nom === 'Marie'; });
  ok(marie && marie.super === false, 'élévation en super-utilisateur neutralisée');
  ok(!st.users.some(function (u) { return u.nom === 'SansMdp'; }), 'compte sans mot de passe valable ignoré');
  ok(!JSON.stringify(st).match(/mdp|scrypt/), 'toujours aucun secret dans l\'état');
  r = await req(P, H, 'POST', '/api/login', { nom: 'marie', mdp: 'marie-2026' }); ok(r.status === 200, 'le nouveau compte peut se connecter');
  // Marie : admin "full" (via full:true) -> on la retire pour tester un compte limité
  st.users.find(function (u) { return u.nom === 'Marie'; }).full = false;
  await req(P, H, 'POST', '/api/state', st, cookie);
  const mcookie = (await req(P, H, 'POST', '/api/login', { nom: 'Marie', mdp: 'marie-2026' })).cookie;
  let ms = (await req(P, H, 'GET', '/api/state', undefined, mcookie)).json;
  ms.users.push({ id: 500, nom: 'Pirate', mdp: 'pirate-2026', full: true, perms: [] });
  ms.users.find(function (u) { return u.nom === 'Marie'; }).full = true;
  ms.users = ms.users.filter(function (u) { return u.nom !== 'admin'; });
  ms.etab = { nom: 'Modifié par Marie', tel: '' };
  r = await req(P, H, 'POST', '/api/state', ms, mcookie); ok(r.status === 200, 'compte limité peut enregistrer ses données');
  st = (await req(P, H, 'GET', '/api/state', undefined, cookie)).json;
  ok(!st.users.some(function (u) { return u.nom === 'Pirate'; }), 'compte limité ne peut pas créer de comptes');
  ok(st.users.some(function (u) { return u.nom === 'admin'; }), 'compte limité ne peut pas supprimer l\'admin');
  ok(!st.users.find(function (u) { return u.nom === 'Marie'; }).full, 'compte limité ne peut pas s\'auto-promouvoir');
  ok(st.etab.nom === 'Modifié par Marie', 'ses données métier sont bien enregistrées');
  r = await req(P, H, 'POST', '/api/airtel/save-config', { clientId: 'a', clientSecret: 'b' }, mcookie); ok(r.status === 403, 'config paiement réservée aux administrateurs / droit Paramètres');
  r = await req(P, H, 'POST', '/api/airtel/save-config', { clientId: 'a', clientSecret: 'b' }, cookie); ok(r.status === 200, 'administrateur peut configurer Airtel');
  r = await req(P, H, 'GET', '/api/airtel/config-status', undefined, cookie); ok(r.json.configured === true && !JSON.stringify(r.json).includes('"b"'), 'secret Airtel jamais renvoyé');
  // plus aucun administrateur : refusé
  st.users = st.users.filter(function (u) { return !(u.super || u.full); });
  await req(P, H, 'POST', '/api/state', st, cookie);
  ok(inst.store.open('demo').state.users.some(function (u) { return u.full || u.super; }), 'jamais de situation sans administrateur');

  console.log('Protection contre les abus');
  r = await req(P, H, 'POST', '/api/state', { arts: [] }, cookie, { Origin: 'https://evil.example' }); ok(r.status === 403, 'origine étrangère refusée (CSRF)');
  r = await req(P, H, 'POST', '/api/state', { arts: [] }, cookie, { Origin: 'http://' + H }); ok(r.status === 200, 'même origine acceptée');
  r = await req(P, H, 'POST', '/api/pvit/save-config', { relais: 'http://exemple.com', cle: 'k' }, cookie); ok(r.status === 400, 'relais PVIT en http refusé');
  r = await req(P, H, 'POST', '/api/pvit/save-config', { relais: 'https://127.0.0.1', cle: 'k' }, cookie); ok(r.status === 200, 'relais enregistré');
  r = await req(P, H, 'GET', '/api/pvit/proxy/sante', undefined, cookie);
  ok(r.status === 502 && /non autoris|injoignable/.test(JSON.stringify(r.json)), 'relais pointant vers le réseau interne bloqué (SSRF)');
  for (let i = 0; i < 9; i++) r = await req(P, H2, 'POST', '/api/login', { nom: 'admin', mdp: 'essai' + i });
  ok(r.status === 429, 'trop d\'essais de connexion -> 429');

  console.log('Temps réel');
  const wsUrl = 'http://127.0.0.1:' + P;
  const sNo = ioc(wsUrl, { extraHeaders: { Host: H }, transports: ['websocket'], reconnection: false });
  const noAuth = await new Promise(function (res) { sNo.on('connect_error', function () { res(true); }); sNo.on('connect', function () { res(false); }); setTimeout(function () { res(false); }, 3000); });
  ok(noAuth, 'socket sans session refusé'); sNo.close();
  const sA = ioc(wsUrl, { extraHeaders: { Host: H, Cookie: cookie }, transports: ['websocket'], reconnection: false });
  const first = await new Promise(function (res) { sA.on('state:changed', res); setTimeout(function () { res(null); }, 3000); });
  ok(first && Array.isArray(first.users) && !JSON.stringify(first).match(/mdp|scrypt/), 'socket avec session reçoit l\'état (sans secrets)');
  const got = new Promise(function (res) { sA.on('state:changed', function (s) { if ((s.cmdAttente || []).some(function (c) { return c.id === 'C1'; })) res(true); }); setTimeout(function () { res(false); }, 3000); });
  await req(P, H, 'POST', '/api/cmdattente/ajouter', { id: 'C1', tableNom: 'T1', total: 1000 }, cookie);
  ok(await got, 'une commande ajoutée est diffusée en temps réel');
  sA.close();

  console.log('Suspension et sauvegardes');
  store.setActive('demo', false);
  await sleep(2100);
  r = await req(P, H, 'GET', '/'); ok(r.status === 402, 'établissement suspendu -> 402');
  r = await req(P, H, 'GET', '/api/state', undefined, cookie); ok(r.status === 402, 'API refusée pendant la suspension');
  store.setActive('demo', true); await sleep(2100);
  r = await req(P, H, 'GET', '/api/state', undefined, cookie); ok(r.status === 200, 'réactivation : accès rétabli');
  ok(fs.existsSync(path.join(dir, 'backups', 'demo')), 'sauvegarde quotidienne créée');

  console.log('Autorisation des certificats (Caddy)');
  const ask = function (d) { return new Promise(function (res) { http.get({ host: '127.0.0.1', port: IP, path: '/tls-ask?domain=' + d }, function (x) { x.resume(); res(x.statusCode); }); }); };
  ok(await ask('demo.caisse.test') === 200, 'sous-domaine d\'un établissement existant autorisé');
  ok(await ask('caisse.test') === 200, 'domaine principal autorisé');
  ok(await ask('inconnu.caisse.test') === 404, 'sous-domaine inconnu refusé');
  ok(await ask('evil.com') === 404, 'domaine étranger refusé');

  console.log('Import depuis la version Windows');
  const old = { users: [{ id: 1, nom: 'BITOME', mdp: 'ancien-super', super: true, full: true, perms: [] }, { id: 2, nom: 'caissier', mdp: 'abcdef', perms: ['caisse'] }], nextUserId: 3, arts: [{ id: 1, nom: 'Biere' }], tables: [{ n: 1, nom: 'T1', st: 'Libre' }] };
  const imp = store.importState('importe', 'Importé', old);
  const ist = store.open('importe').state;
  ok(!JSON.stringify(ist.users).includes('ancien-super') && ist.users.every(function (u) { return !u.mdp; }), 'mots de passe importés hachés, plus de clair');
  ok(ist.users.find(function (u) { return u.nom === 'caissier'; }).doitChangerMdp === true, 'employés importés : nouveau mot de passe exigé');
  ok(ist.arts.length === 1 && ist.users.some(function (u) { return u.nom === 'admin'; }), 'données conservées + compte admin de secours');
  await sleep(2100);
  r = await req(P, 'importe.caisse.test', 'POST', '/api/login', { nom: 'caissier', mdp: 'abcdef' }); ok(r.status === 200, 'un employé importé se connecte avec son ancien mot de passe');

  inst.io.close(); inst.server.close(); inst.internal.close();
  console.log('\n' + pass + ' réussis, ' + fails + ' échec(s)');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
