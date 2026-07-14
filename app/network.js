// FSS-CAISSE — Synchronisation réseau (multi-postes)
// Ce script connecte l'application au serveur central FSS-CAISSE
// et synchronise en temps réel les données entre tous les postes.
(function () {
  var socket = (typeof io === 'function') ? io() : null;
  var API = '/api/state';
  var applying = false;
  var prevAttenteIds = null;
  window.FSS_IS_SERVER = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '');
  window.users = window.users || [];
  window.nextUserId = window.nextUserId || 1;
  window.logoData = window.logoData || null;
  window.etabInfo = window.etabInfo || { nom: 'FSS-CAISSE', tel: '', adr: '', rccm: '', nif: '', msgFin: 'Merci pour votre visite !' };
  window.tables = window.tables || [];
  window.servers = window.servers || [];

  function fullState() {
    return {
      arts: arts, clis: clis, fours: fours, cmds: cmds, txs: txs, mouv: mouv,
      prls: prls, cmdAttente: cmdAttente, nextTk: nextTk, attenteSeq: attenteSeq,
      users: users, nextUserId: nextUserId, logo: logoData, etab: etabInfo, tables: tables, servers: servers
    };
  }

  function applyEtabToInputs() {
    if (g('etabNom')) g('etabNom').value = etabInfo.nom || '';
    if (g('etabTel')) g('etabTel').value = etabInfo.tel || '';
    if (g('etabAdr')) g('etabAdr').value = etabInfo.adr || '';
    if (g('etabRCCM')) g('etabRCCM').value = etabInfo.rccm || '';
    if (g('etabNIF')) g('etabNIF').value = etabInfo.nif || '';
    if (g('etabMsgFin')) g('etabMsgFin').value = etabInfo.msgFin || 'Merci pour votre visite !';
  }

  function applyState(s) {
    if (!s) return;
    applying = true;
    arts = s.arts || [];
    clis = s.clis || [];
    fours = s.fours || [];
    cmds = s.cmds || [];
    txs = s.txs || [];
    mouv = s.mouv || [];
    prls = s.prls || [];
    cmdAttente = s.cmdAttente || [];
    if (window.FSS_IS_SERVER && prevAttenteIds !== null) {
      var nouvelles = cmdAttente.filter(function (c) { return prevAttenteIds.indexOf(c.id) === -1; });
      nouvelles.forEach(function (order) {
        safe(function () { if (window.imprimerTicketAttente) window.imprimerTicketAttente(order); });
      });
    }
    prevAttenteIds = cmdAttente.map(function (c) { return c.id; });
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
    'mettreEnAttente', 'reprendreAttente', 'supprimerAttente'
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
