// Tests unitaires des règles de fusion PC <-> cloud. Lancer : node test/sync-merge.test.js
'use strict';
const { mergeStates, syncable } = require('../sync-merge');
let pass = 0, fails = 0;
function ok(c, m) { if (c) { pass++; console.log('  ok   ' + m); } else { fails++; console.log('  ECHEC ' + m); } }
const J = (x) => JSON.parse(JSON.stringify(x));
const tx = (id, ttc, extra) => Object.assign({ id: id, date: '08/10 10:00', ttc: ttc, stat: 'Validé' }, extra || {});

const base = {
  arts: [{ id: 1, nom: 'Biere', pv: 1000, stk: 40 }, { id: 2, nom: 'Whisky', pv: 5000, stk: 10 }],
  clis: [{ id: 1, nom: 'Jean', total: 1000, solde: 0 }],
  txs: [tx('TK-0001', 1000)], mouv: [{ art: 'Biere', typ: 'Entrée', vr: 24 }], prls: [], categories: ['Bar'],
  etab: { nom: 'Resto', tel: '1' }, nextTk: 2, users: [{ id: 1, nom: 'admin', mdpHash: 'H1', pwdAt: 10, full: true }], nextUserId: 2,
  tables: [{ n: 1, nom: 'T1', st: 'Libre' }], caisses: ['Caisse 1'], logo: 'L0'
};

console.log('Ventes hors-ligne sur le PC, rien côté web');
let local = J(base); local.txs.unshift(tx('TK-0002', 2500)); local.nextTk = 3; local.arts[0].stk = 38;
let r = mergeStates(base, local, J(base)).state;
ok(r.txs.length === 2 && r.txs[0].id === 'TK-0002', 'la vente du PC est conservée');
ok(r.arts[0].stk === 38, 'le stock du PC est conservé');
ok(r.nextTk === 3, 'compteur de tickets avancé');

console.log('Ventes sur le PC ET sur le web en même temps');
let cloud = J(base); cloud.txs.unshift(tx('TK-0002', 4000, { tbl: 'web' })); cloud.nextTk = 3; cloud.arts[0].stk = 35;
r = mergeStates(base, local, cloud);
ok(r.state.txs.length === 3, 'les deux ventes sont gardées (3 tickets)');
ok(r.state.txs.some((t) => t.id === 'TK-0002' && t.ttc === 2500), 'la vente du PC garde son numéro');
ok(r.state.txs.some((t) => t.id === 'TK-0002-W' && t.ttc === 4000), 'la vente du web en conflit est renommée (-W)');
ok(r.report.conflicts.length === 1, 'le conflit est signalé');
ok(r.state.arts[0].stk === 40 - 2 - 5, 'stock = base + variation PC + variation web (33)');

console.log('Stock : deux côtés vendent le même article');
local = J(base); local.arts[1].stk = 8; cloud = J(base); cloud.arts[1].stk = 7;
r = mergeStates(base, local, cloud).state; ok(r.arts[1].stk === 5, 'whisky : 10 -2 -3 = 5');
local = J(base); local.arts[1].stk = 0; cloud = J(base); cloud.arts[1].stk = 0;
r = mergeStates(base, local, cloud).state; ok(r.arts[1].stk === 0, 'le stock ne devient jamais négatif');

console.log('Modification du même champ des deux côtés : le PC gagne');
local = J(base); local.arts[0].pv = 1200; cloud = J(base); cloud.arts[0].pv = 1500; cloud.arts[0].nom = 'Biere Pression';
r = mergeStates(base, local, cloud).state;
ok(r.arts[0].pv === 1200, 'prix : le PC gagne'); ok(r.arts[0].nom === 'Biere Pression', 'autre champ modifié seulement sur le web : repris');

console.log('Ajouts et suppressions');
local = J(base); cloud = J(base); cloud.arts.push({ id: 3, nom: 'Jus', pv: 500, stk: 12 }); local.arts.push({ id: 4, nom: 'Eau', pv: 300, stk: 20 });
r = mergeStates(base, local, cloud).state; ok(r.arts.length === 4, 'articles ajoutés des deux côtés : tous gardés');
local = J(base); cloud = J(base); local.arts = local.arts.filter((a) => a.id !== 2);
r = mergeStates(base, local, cloud).state; ok(r.arts.length === 1, 'suppression au PC répercutée');
local = J(base); cloud = J(base); local.arts = local.arts.filter((a) => a.id !== 2); cloud.arts[1].pv = 5500;
r = mergeStates(base, local, cloud).state; ok(r.arts.length === 2, 'supprimé au PC mais modifié sur le web : on garde (rien perdu)');
local = J(base); cloud = J(base); cloud.arts.push({ id: 3, nom: 'Jus', stk: 1 }); local.arts.push({ id: 3, nom: 'Eau', stk: 2 });
r = mergeStates(base, local, cloud); ok(r.state.arts.length === 4 && r.report.conflicts[0].type === 'renuméroté', 'même identifiant d\'article créé des deux côtés : renuméroté');

console.log('Listes sans identifiant (mouvements, catégories)');
local = J(base); cloud = J(base); local.mouv.unshift({ art: 'Biere', typ: 'Sortie', vr: -2 }); cloud.mouv.unshift({ art: 'Whisky', typ: 'Sortie', vr: -3 });
r = mergeStates(base, local, cloud).state; ok(r.mouv.length === 3, 'mouvements des deux côtés réunis, sans doublon');
local = J(base); cloud = J(base); local.mouv.push({ art: 'Biere', typ: 'Entrée', vr: 24 });
r = mergeStates(base, local, cloud).state; ok(r.mouv.length === 2, 'deux mouvements identiques légitimes ne sont pas fusionnés par erreur');
local = J(base); cloud = J(base); cloud.categories.push('Cuisine'); local.categories = [];
r = mergeStates(base, local, cloud).state; ok(r.categories.length === 1 && r.categories[0] === 'Cuisine', 'catégorie supprimée au PC, ajoutée sur le web');

console.log('Réglages et objets');
local = J(base); cloud = J(base); local.etab.tel = '2'; cloud.etab.nom = 'Resto Pro';
r = mergeStates(base, local, cloud).state; ok(r.etab.tel === '2' && r.etab.nom === 'Resto Pro', 'infos établissement fusionnées champ par champ');
local = J(base); cloud = J(base); cloud.logo = 'L1';
r = mergeStates(base, local, cloud).state; ok(r.logo === 'L1', 'logo changé sur le web : repris');

console.log('Données propres à chaque côté');
local = J(base); local.cmdAttente = [{ id: 'A1' }]; local.printBatches = [{ batchId: 'b' }]; cloud = J(base); cloud.syncVersion = 9;
r = mergeStates(base, local, cloud).state; ok(!('cmdAttente' in r) && !('printBatches' in r) && !('syncVersion' in r), 'commandes en attente / files d\'impression non synchronisées');

console.log('Comptes et mots de passe');
local = J(base); local.users[0].mdp = 'nouveau-mdp'; cloud = J(base);
r = mergeStates(base, local, cloud).state; ok(r.users[0].mdp === 'nouveau-mdp', 'mot de passe changé sur le PC : envoyé');
local = J(base); cloud = J(base); cloud.users[0].mdpHash = 'H2'; cloud.users[0].pwdAt = 20;
r = mergeStates(base, local, cloud).state; ok(r.users[0].mdpHash === 'H2' && !r.users[0].mdp, 'mot de passe changé sur le web : haché repris');
local = J(base); local.users[0].mdp = 'abc'; local.users[0].mdpHash = 'H1'; const b2 = J(base); b2.users[0].mdp = 'abc'; cloud = J(b2); cloud.users[0].mdpHash = 'H3'; cloud.users[0].pwdAt = 30; delete cloud.users[0].mdp;
r = mergeStates(b2, local, cloud).state; ok(r.users[0].mdpHash === 'H3' && !r.users[0].mdp, 'après envoi, le clair local est remplacé par le haché du serveur');
local = J(base); cloud = J(base); local.users.push({ id: 2, nom: 'Marie', mdp: 'm1', perms: ['caisse'] }); cloud.users.push({ id: 2, nom: 'Paul', mdpHash: 'HP', pwdAt: 5 });
r = mergeStates(base, local, cloud); ok(r.state.users.length === 3 && new Set(r.state.users.map((u) => u.id)).size === 3, 'même id d\'utilisateur créé des deux côtés : les deux comptes existent');
local = J(base); cloud = J(base); local.users.push({ id: 2, nom: 'Admin', mdp: 'x' }); cloud.users.push({ id: 3, nom: 'admin2', mdpHash: 'H' });
r = mergeStates(base, local, cloud).state; ok(r.users.filter((u) => u.nom.toLowerCase() === 'admin').length === 1, 'pas deux comptes de même nom');

console.log('Première liaison (pas de base) : le PC fait référence');
const blankCloud = { arts: [], clis: [], txs: [], tables: [{ n: 1, nom: 'Table 1', st: 'Libre' }, { n: 2, nom: 'Table 2', st: 'Libre' }], users: [{ id: 1, nom: 'admin', mdpHash: 'HC', pwdAt: 1, full: true }], nextUserId: 2, etab: { nom: 'Importé' }, nextTk: 1, categories: [] };
const pc = { arts: base.arts, clis: base.clis, txs: [tx('TK-0001', 1000), tx('TK-0002', 500)], tables: [{ n: 1, nom: 'Salle 1', st: 'Occupée' }], users: [{ id: 1, nom: 'BITOME', mdp: 'secret', super: true, full: true }, { id: 2, nom: 'caissier', mdp: 'c1', perms: ['caisse'] }], nextUserId: 3, etab: { nom: 'Afro Lounge', tel: '9' }, nextTk: 3, categories: ['Bar'], logo: 'LOGO' };
r = mergeStates(null, pc, blankCloud);
ok(r.state.txs.length === 2 && r.state.arts.length === 2, 'toutes les ventes et articles du PC arrivent dans le cloud');
ok(r.state.tables.find((t) => t.n === 1).nom === 'Salle 1' && r.state.tables.length === 2, 'la table du PC remplace celle du serveur ; les autres restent');
ok(r.state.users.map((u) => u.nom).sort().join() === 'BITOME,admin,caissier', 'comptes du PC repris ET compte du serveur conservé (renuméroté)');
ok(new Set(r.state.users.map((u) => u.id)).size === 3 && r.state.nextUserId > Math.max(...r.state.users.map((u) => u.id)), 'identifiants de comptes uniques, compteur à jour');
ok(r.state.etab.nom === 'Afro Lounge' && r.state.logo === 'LOGO' && r.state.nextTk === 3, 'établissement, logo et compteurs du PC repris');
ok(r.report.conflicts.every((c) => c.liste === 'users'), 'seuls les comptes sont signalés à la première liaison');
const sameName = mergeStates(null, { users: [{ id: 2, nom: 'admin', mdp: 'adm' }] }, { users: [{ id: 1, nom: 'admin', mdpHash: 'HC', pwdAt: 7, full: true }] }).state;
ok(sameName.users.length === 1 && sameName.users[0].mdpHash === 'HC', 'compte « admin » existant des deux côtés : un seul, avec le mot de passe web conservé');

console.log('Idempotence : deux synchronisations de suite ne changent rien');
const once = mergeStates(null, pc, blankCloud).state;
const twice = mergeStates(once, J(once), J(once)).state;
ok(JSON.stringify(syncable(twice)) === JSON.stringify(syncable(once)).replace(/\s/g, '') || require('../sync-merge').eq(syncable(twice), syncable(once)), 'état identique après re-synchronisation');

console.log('\n' + pass + ' réussis, ' + fails + ' échec(s)');
process.exit(fails ? 1 : 0);
