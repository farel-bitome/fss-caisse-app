// FSS-CAISSE — Synchronisation réseau (multi-postes)
// Ce script connecte l'application au serveur central FSS-CAISSE
// et synchronise en temps réel les données entre tous les postes.
(function () {
  var socket = (typeof io === 'function') ? io() : null;
  var API = '/api/state';
  var applying = false;
  var prevBatchIds = null;
  var prevTxIds = null;
  window.FSS_IS_SERVER = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '');
  window.users = window.users || [];
  window.nextUserId = window.nextUserId || 1;
  window.logoData = window.logoData || null;
  window.etabInfo = window.etabInfo || { nom: 'FSS-CAISSE', tel: '', adr: '', rccm: '', nif: '', msgFin: 'Merci pour votre visite !' };
  window.tables = window.tables || [];
  window.servers = window.servers || [];
  window.caisses = window.caisses || [];
  window.categories = window.categories || [];
  window.fondsOuverture = window.fondsOuverture || {};
  window.printBatches = window.printBatches || [];
  window.employes = window.employes || [];
  window.pointages = window.pointages || [];
  window.paieEntries = window.paieEntries || [];

  function fullState() {
    return {
      arts: arts, clis: clis, fours: fours, cmds: cmds, txs: txs, mouv: mouv,
      prls: prls, cmdAttente: cmdAttente, nextTk: nextTk, attenteSeq: attenteSeq,
      users: users, nextUserId: nextUserId, logo: logoData, etab: etabInfo, tables: tables, servers: servers, caisses: caisses, categories: categories, fondsOuverture: fondsOuverture, printBatches: printBatches,
      employes: employes, pointages: pointages, paieEntries: paieEntries
    };
  }

  function applyEtabToInputs() {
    if (g('etabNom')) g('etabNom').value = etabInfo.nom || '';
    if (g('etabTel')) g('etabTel').value = etabInfo.tel || '';
    if (g('etabAdr')) g('etabAdr').value = etabInfo.adr || '';
    if (g('etabRCCM')) g('etabRCCM').value = etabInfo.rccm || '';
    if (g('etabNIF')) g('etabNIF').value = etabInfo.nif || '';
    if (g('etabMsgFin')) g('etabMsgFin').value = etabInfo.msgFin || 'Merci pour votre visite !';
    // TVA : restaure l'état activé/désactivé et le taux, tels qu'enregistrés —
    // sans ça, ils repartaient toujours sur les valeurs par défaut (activée, 18%)
    // à chaque rechargement de la page, même après une désactivation explicite.
    if (typeof window.applyTVAFromEtab === 'function') window.applyTVAFromEtab();
  }

  function applyState(s) {
    if (!s) return;
    applying = true;
    arts = s.arts || [];
    clis = s.clis || [];
    fours = s.fours || [];
    cmds = s.cmds || [];
    txs = s.txs || [];
    if (window.FSS_IS_SERVER && prevTxIds !== null) {
      var nouvellesTx = txs.filter(function (t) { return prevTxIds.indexOf(t.id) === -1; });
      nouvellesTx.forEach(function (tx) {
        safe(function () { if (window.imprimerTicketCommande) window.imprimerTicketCommande(tx); });
      });
    }
    prevTxIds = txs.map(function (t) { return t.id; });
    mouv = s.mouv || [];
    prls = s.prls || [];
    cmdAttente = s.cmdAttente || [];
    printBatches = s.printBatches || [];
    if (window.FSS_IS_SERVER && prevBatchIds !== null) {
      var nouveauxLots = printBatches.filter(function (bt) { return prevBatchIds.indexOf(bt.batchId) === -1; });
      nouveauxLots.forEach(function (batch) {
        safe(function () { if (window.imprimerTicketAttente) window.imprimerTicketAttente(batch); });
      });
    }
    prevBatchIds = printBatches.map(function (bt) { return bt.batchId; });
    nextTk = s.nextTk || 1;
    attenteSeq = s.attenteSeq || 1;
    users = s.users || [];
    nextUserId = s.nextUserId || 1;
    logoData = s.logo || null;
    etabInfo = s.etab || { nom: 'FSS-CAISSE', tel: '', adr: '', rccm: '', nif: '', msgFin: 'Merci pour votre visite !' };
    if (s.tables && s.tables.length) tables = s.tables;
    window.tables = tables;
    if (s.servers && s.servers.length) servers = s.servers;
    window.servers = servers;
    if (s.caisses && s.caisses.length) caisses = s.caisses;
    window.caisses = caisses;
    if (s.categories && s.categories.length) categories = s.categories;
    window.categories = categories;
    if (s.fondsOuverture) fondsOuverture = s.fondsOuverture;
    window.fondsOuverture = fondsOuverture;
    employes = s.employes || [];
    window.employes = employes;
    pointages = s.pointages || [];
    window.pointages = pointages;
    paieEntries = s.paieEntries || [];
    window.paieEntries = paieEntries;
    refreshAllViews();
    applyEtabToInputs();
    applying = false;
    document.dispatchEvent(new Event('fss:ready'));
  }

  function safe(fn) { try { fn(); } catch (e) { /* la vue n'est peut-être pas encore prête */ } }

  function refreshAllViews() {
    safe(function () { buildCats(); });
    safe(function () { renderProds(''); });
    safe(function () { renderArt(); });
    safe(function () { renderStk(); });
    safe(function () { renderMouv(); });
    safe(function () { renderCli(); });
    safe(function () { renderFour(); });
    safe(function () { renderCmd(); });
    safe(function () { renderTkList(); });
    safe(function () { initTables(); });
    safe(function () { initServers(); });
    safe(function () { initCaisses(); });
    safe(function () { initCategories(); });
    safe(function () { if (window.refreshEtabLogoPreview) refreshEtabLogoPreview(); });
    safe(function () { renderDV(); });
    safe(function () { renderLV(); });
    safe(function () { renderReg(); });
    safe(function () { renderRegG(); });
    safe(function () { renderTopV(); });
    safe(function () { renderTotCat(); });
    safe(function () { renderRap(); });
    safe(function () { initCloture(); });
    safe(function () { renderAttenteBar(); });
    safe(function () { renderPrls(); });
    safe(function () { renderEmp(); });
    safe(function () { renderPtgLive(); });
    safe(function () { renderPaie(); });
    safe(function () { if (g('tkNum')) g('tkNum').textContent = 'TK-#' + ('000' + nextTk).slice(-4); });
  }

  var pushTimer = null;
  function syncPush() {
    if (applying) return; // ne pas renvoyer ce qu'on vient de recevoir
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullState())
      }).catch(function () {
        safe(function () { toast('⚠️ Synchronisation impossible — vérifiez le serveur', 'e'); });
      });
    }, 150);
  }

  window.fssSyncPush = syncPush;

  function wrap(name) {
    var orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      var r = orig.apply(this, arguments);
      syncPush();
      return r;
    };
  }

  [
    'saveArt', 'delArt', 'togArt', 'saveStk',
    'saveCli', 'delCli', 'saveFour', 'delFour',
    'saveCmd', 'valPay', 'addPrel', 'razCaisse',
    'mettreEnAttente', 'reprendreAttente', 'supprimerAttente',
    'saveEmp', 'delEmp', 'clockIn', 'clockOut', 'savePointageManuel', 'delPointage', 'savePaieDetail'
  ].forEach(wrap);

  if (socket) {
    socket.on('state:changed', function (s) { applyState(s); });
    socket.on('connect', function () {
      safe(function () { toast('Connecté au serveur FSS-CAISSE', 's'); });
    });
    socket.on('disconnect', function () {
      safe(function () { toast('⚠️ Connexion au serveur perdue', 'e'); });
    });
  }

  window.addEventListener('load', function () {
    fetch(API).then(function (r) { return r.json(); }).then(applyState).catch(function () {
      safe(function () { toast('⚠️ Serveur injoignable — mode hors-ligne', 'e'); });
    });
  });
})();
