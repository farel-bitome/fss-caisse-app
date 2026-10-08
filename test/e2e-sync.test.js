// Test de bout en bout : vrai serveur cloud + vrai serveur local de la version Windows, coupure Internet simulée.
// Lancer : node test/e2e-sync.test.js
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const root = path.join(__dirname, '..');
const { createApp } = require(path.join(root, 'cloud', 'server.js'));
const startLocal = require(path.join(root, 'embedded-server.js'));

let pass = 0, fails = 0;
function ok(c, m) { if (c) { pass++; console.log('  ok   ' + m); } else { fails++; console.log('  ECHEC ' + m); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function call(port, method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const h = Object.assign({}, headers || {});
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = data.length; }
    const r = http.request({ host: '127.0.0.1', port: port, method: method, path: url, headers: h }, (res) => {
      const ch = []; res.on('data', (c) => ch.push(c));
      res.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (e) {} resolve({ status: res.statusCode, json: j, cookie: res.headers['set-cookie'] ? res.headers['set-cookie'][0].split(';')[0] : null }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
function freePort() { return new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); }

(async () => {
  // ---- Cloud (un établissement « demo ») ----
  const cdir = fs.mkdtempSync(path.join(os.tmpdir(), 'fss-e2e-cloud-'));
  let cloud = createApp({ dataDir: cdir, defaultTenant: 'demo', sessionSecret: 'k'.repeat(40) });
  const created = cloud.store.create('demo', 'Afro Lounge');
  let cloudPort = await freePort();
  await new Promise((r) => cloud.server.listen(cloudPort, '127.0.0.1', r));
  const cloudUrl = 'http://127.0.0.1:' + cloudPort;
  const cloudState = async () => {
    const lg = await call(cloudPort, 'POST', '/api/login', { nom: 'BITOME', mdp: 'Secret-BITOME-1' });
    return (await call(cloudPort, 'GET', '/api/state', undefined, { Cookie: lg.cookie })).json;
  };

  // ---- PC local (vraie version Windows : serveur intégré, données par défaut du dépôt) ----
  const ldir = fs.mkdtempSync(path.join(os.tmpdir(), 'fss-e2e-pc-'));
  const lport = await freePort();
  const lserver = await startLocal(lport, ldir, root);
  // mots de passe du PC : BITOME fort (envoyé au web), admin faible (reste local), caissier fort
  let st = (await call(lport, 'GET', '/api/state')).json;
  st.users.forEach((u) => { if (u.nom === 'BITOME') u.mdp = 'Secret-BITOME-1'; });
  st.users.push({ id: 3, nom: 'caissier', mdp: 'caisse-2026', super: false, full: false, perms: ['caisse'], doitChangerMdp: false });
  st.nextUserId = 4;
  st.txs.unshift({ id: 'TK-0043', date: '08/10 09:00', ttc: 7000, stat: 'Validé', items: [] });
  st.nextTk = 44;
  const art1 = st.arts[0]; const stk0 = art1.stk;
  await call(lport, 'POST', '/api/state', st);
  const nbArts = st.arts.length;

  console.log('Liaison (première synchronisation : le PC fait référence)');
  let r = await call(lport, 'POST', '/api/cloud/link', { url: cloudUrl, nom: 'admin', mdp: created.motDePasseAdmin, appareil: 'PC test' });
  ok(r.status === 200 && r.json.ok, 'le PC se lie avec l\'identifiant administrateur du cloud');
  ok(r.json.cloudVide === true, 'le cloud était vide');
  let cs = await cloudState();
  ok(cs.arts.length === nbArts, 'les ' + nbArts + ' articles du PC sont dans le cloud');
  ok(cs.txs.some((t) => t.id === 'TK-0043'), 'la vente du PC est dans le cloud');
  ok(cs.users.some((u) => u.nom === 'BITOME') && !JSON.stringify(cs).match(/Secret-BITOME|mdp"|scrypt/), 'comptes du PC repris, mots de passe jamais exposés');
  const cloudRaw = JSON.stringify(cloud.store.open('demo').state.users);
  ok(!cloudRaw.includes('Secret-BITOME-1') && !cloudRaw.includes('caisse-2026'), 'aucun mot de passe en clair sur le serveur');
  let ls = (await call(lport, 'GET', '/api/state')).json;
  const wAdmin = await call(cloudPort, 'POST', '/api/login', { nom: 'admin', mdp: created.motDePasseAdmin });
  ok(wAdmin.status === 200, 'le compte « admin » du web garde son mot de passe (celui du PC, « admin », est trop faible pour Internet)');
  const wAdminWeak = await call(cloudPort, 'POST', '/api/login', { nom: 'admin', mdp: 'admin' });
  ok(wAdminWeak.status === 401, 'le mot de passe faible du PC n\'ouvre PAS le web');
  ok((r.json.status.avertissements || []).some((a) => /admin/.test(a)), 'l\'utilisateur est averti pour le compte au mot de passe trop court');
  const lb = ls.users.find((u) => u.nom === 'BITOME');
  ok(lb && !lb.mdp && /^scrypt\$/.test(lb.mdpHash), 'sur le PC, le mot de passe de BITOME est désormais remplacé par son haché');

  console.log('Connexion locale avec compte synchronisé (sans Internet)');
  r = await call(lport, 'POST', '/api/auth/verify', { nom: 'BITOME', mdp: 'Secret-BITOME-1' }); ok(r.json.ok === true, 'mot de passe correct accepté par le serveur local');
  r = await call(lport, 'POST', '/api/auth/verify', { nom: 'BITOME', mdp: 'faux' }); ok(r.json.ok === false, 'mauvais mot de passe refusé');
  const web = await call(cloudPort, 'POST', '/api/login', { nom: 'BITOME', mdp: 'Secret-BITOME-1' }); ok(web.status === 200, 'le même compte se connecte sur le web');
  const faibleWeb = await call(cloudPort, 'POST', '/api/login', { nom: 'caissier', mdp: 'caisse-2026' }); ok(faibleWeb.status === 200, 'compte avec mot de passe de 11 caractères utilisable sur le web');

  console.log('Coupure Internet : le PC continue de vendre');
  await new Promise((r2) => cloud.server.close(r2)); // le cloud « disparaît »
  cloud.io.close();
  st = (await call(lport, 'GET', '/api/state')).json;
  st.txs.unshift({ id: 'TK-0044', date: '08/10 12:00', ttc: 3000, stat: 'Validé', items: [] });
  st.txs.unshift({ id: 'TK-0045', date: '08/10 12:30', ttc: 4500, stat: 'Validé', items: [] });
  st.nextTk = 46;
  st.arts[0].stk = stk0 - 3;
  await call(lport, 'POST', '/api/state', st);
  let ss = (await call(lport, 'POST', '/api/cloud/sync')).json;
  ok(ss.online === false && ss.enAttente === true, 'hors-ligne détecté, modifications en attente');
  r = await call(lport, 'GET', '/api/state'); ok(r.json.txs.length === st.txs.length, 'la caisse fonctionne normalement hors-ligne');

  console.log('Pendant ce temps, quelqu\'un vend sur le web');
  cloud = createApp({ dataDir: cdir, defaultTenant: 'demo', sessionSecret: 'k'.repeat(40) }); // redémarrage du serveur web
  await new Promise((r2) => cloud.server.listen(cloudPort, '127.0.0.1', r2));
  const lg = await call(cloudPort, 'POST', '/api/login', { nom: 'BITOME', mdp: 'Secret-BITOME-1' });
  let ws = (await call(cloudPort, 'GET', '/api/state', undefined, { Cookie: lg.cookie })).json;
  ws.txs.unshift({ id: 'TK-0044', date: '08/10 12:10', ttc: 9999, stat: 'Validé', items: [], tbl: 'web' }); // même numéro que la vente du PC
  ws.arts[0].stk = stk0 - 5;
  ws.nextTk = 45;
  await call(cloudPort, 'POST', '/api/state', ws, { Cookie: lg.cookie });

  console.log('Retour d\'Internet : tout se met à jour');
  ss = (await call(lport, 'POST', '/api/cloud/sync')).json;
  ok(ss.online === true && ss.enAttente === false && !ss.lastError, 'synchronisation réussie, plus rien en attente');
  cs = await cloudState();
  ls = (await call(lport, 'GET', '/api/state')).json;
  const idsC = cs.txs.map((t) => t.id).sort().join(), idsL = ls.txs.map((t) => t.id).sort().join();
  ok(idsC === idsL, 'PC et web ont exactement les mêmes ventes');
  ok(['TK-0043', 'TK-0044', 'TK-0044-W', 'TK-0045'].every((id) => idsC.includes(id)), 'aucune vente perdue (la vente web du même numéro est renommée -W)');
  ok(cs.arts[0].stk === stk0 - 3 - 5 && ls.arts[0].stk === stk0 - 3 - 5, 'stock = base - 3 (PC) - 5 (web), identique des deux côtés');
  ok(ss.conflits.length >= 1, 'le conflit de numéro est signalé');

  console.log('Données propres au PC non touchées');
  await call(lport, 'POST', '/api/cmdattente/ajouter', { id: 'ATT-1', tableNom: 'T9', total: 100 });
  await call(lport, 'POST', '/api/cloud/sync');
  cs = await cloudState();
  ok(!(cs.cmdAttente || []).some((c) => c.id === 'ATT-1'), 'les commandes en attente restent locales');
  ls = (await call(lport, 'GET', '/api/state')).json;
  ok((ls.cmdAttente || []).some((c) => c.id === 'ATT-1'), 'et ne sont pas effacées sur le PC');

  console.log('Changement web -> PC');
  ws = cs; ws.etab = Object.assign({}, ws.etab, { nom: 'Afro Lounge (web)' });
  const lg2 = await call(cloudPort, 'POST', '/api/login', { nom: 'BITOME', mdp: 'Secret-BITOME-1' });
  await call(cloudPort, 'POST', '/api/state', ws, { Cookie: lg2.cookie });
  await call(lport, 'POST', '/api/cloud/sync');
  ls = (await call(lport, 'GET', '/api/state')).json;
  ok(ls.etab.nom === 'Afro Lounge (web)', 'une modification faite sur le web arrive sur le PC');

  console.log('Mot de passe changé sur le web -> utilisable sur le PC hors-ligne');
  const adm = (await cloudState()).users.find((u) => u.nom === 'caissier');
  const wsx = await cloudState();
  wsx.users.find((u) => u.nom === 'caissier').mdp = 'nouveau-web-2026';
  await call(cloudPort, 'POST', '/api/state', wsx, { Cookie: (await call(cloudPort, 'POST', '/api/login', { nom: 'BITOME', mdp: 'Secret-BITOME-1' })).cookie });
  await call(lport, 'POST', '/api/cloud/sync');
  r = await call(lport, 'POST', '/api/auth/verify', { nom: 'caissier', mdp: 'nouveau-web-2026' }); ok(r.json.ok === true, 'le nouveau mot de passe fonctionne sur le PC');
  r = await call(lport, 'POST', '/api/auth/verify', { nom: 'caissier', mdp: 'caisse-2026' }); ok(r.json.ok === false, 'l\'ancien est refusé');

  console.log('Sécurité de la liaison');
  r = await call(cloudPort, 'POST', '/api/sync/push', { baseVersion: 1, state: {} });
  ok(r.status === 401, 'sans jeton d\'appareil : refusé');
  r = await call(cloudPort, 'POST', '/api/sync/link', { nom: 'caissier', mdp: 'nouveau-web-2026' });
  ok(r.status === 403, 'un simple caissier ne peut pas lier un poste');
  const link = JSON.parse(fs.readFileSync(path.join(ldir, 'cloud-link.json'), 'utf8'));
  const dev = JSON.parse(fs.readFileSync(path.join(cdir, 'tenants', 'demo', 'devices.json'), 'utf8'));
  ok(Object.keys(dev).length === 1 && !JSON.stringify(dev).includes(link.token), 'le jeton n\'est stocké que haché côté serveur');
  r = await call(lport, 'POST', '/api/cloud/unlink', {}); ok(r.json.ok && !fs.existsSync(path.join(ldir, 'cloud-link.json')), 'déliaison possible depuis le PC');

  console.log('Appareil révoqué');
  fs.writeFileSync(path.join(cdir, 'tenants', 'demo', 'devices.json'), '{}');
  fs.writeFileSync(path.join(ldir, 'cloud-link.json'), JSON.stringify(link));
  await sleep(100);
  ss = (await call(lport, 'POST', '/api/cloud/sync')).json;
  ok(/non reconnu|révoqué/i.test(ss.lastError), 'un appareil révoqué est refusé avec un message clair');

  lserver.close(); cloud.io.close(); cloud.server.close();
  console.log('\n' + pass + ' réussis, ' + fails + ' échec(s)');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
