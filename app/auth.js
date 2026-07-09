// FSS-CAISSE — Authentification (connexion, comptes, permissions, logo)
(function () {
  var dataReady = false;
  var currentUser = null;

  var MODULES = [
    { key: 'caisse', label: '🧾 Caisse (vente)' },
    { key: 'articles', label: '🍽️ Articles' },
    { key: 'stock', label: '📦 Stock' },
    { key: 'achats', label: '🛒 Achats' },
    { key: 'clients', label: '👥 Clients' },
    { key: 'fournisseurs', label: '🚚 Fournisseurs' },
    { key: 'bons', label: '📄 Bons & Ventes' },
    { key: 'rapports', label: '📊 Rapports' },
    { key: 'cloture', label: '🔒 Clôture' },
    { key: 'params', label: '⚙️ Paramètres' },
    { key: 'reimpression', label: '🖨️ Réimpression / Annulation tickets' }
  ];

  document.addEventListener('fss:ready', function () {
    dataReady = true;
    var btn = document.getElementById('authLoginBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Se connecter'; }
    var wait = document.getElementById('authWait');
    if (wait) wait.style.display = 'none';
  });

  function injectCSS() {
    var s = document.createElement('style');
    s.textContent =
      '#authOverlay,#userMgmtOverlay,#chgPwdOverlay,#permsOverlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;background:#0e0e0e;}' +
      '#authOverlay{overflow:hidden;}' +
      '#authWatermark{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.08;pointer-events:none;z-index:0;}' +
      '#authOverlay .box{position:relative;z-index:1;}' +
      '#userMgmtOverlay,#chgPwdOverlay,#permsOverlay{background:rgba(0,0,0,.75);display:none;}' +
      '#authOverlay .box,#chgPwdOverlay .box{background:#1c1c1c;padding:36px 40px;border-radius:12px;width:360px;text-align:center;border:1px solid #2a2a2a;}' +
      '#userMgmtOverlay .box,#permsOverlay .box{background:#1c1c1c;padding:24px 28px;border-radius:12px;width:460px;max-height:82vh;overflow:auto;border:1px solid #2a2a2a;}' +
      '#authOverlay h1,#userMgmtOverlay h2,#chgPwdOverlay h1,#permsOverlay h2{color:#CC0000;margin:0 0 6px;}' +
      '#authOverlay h1{font-size:20px;} #chgPwdOverlay h1{font-size:20px;} #userMgmtOverlay h2,#permsOverlay h2{font-size:16px;}' +
      '#authOverlay p,#chgPwdOverlay p,#permsOverlay p{color:#999;font-size:12px;margin:0 0 20px;}' +
      '#authOverlay input,#userMgmtOverlay input,#chgPwdOverlay input{width:100%;padding:11px;margin-bottom:12px;border-radius:6px;border:1px solid #333;background:#0e0e0e;color:#fff;font-size:14px;box-sizing:border-box;}' +
      '#authOverlay button.main,#chgPwdOverlay button.main,#userMgmtOverlay button.main,#permsOverlay button.main{width:100%;padding:12px;border:none;border-radius:6px;background:#CC0000;color:#fff;font-weight:bold;cursor:pointer;font-size:14px;}' +
      '#authOverlay button.main:disabled{opacity:.5;cursor:default;}' +
      '#authOverlay button.main:hover,#chgPwdOverlay button.main:hover,#userMgmtOverlay button.main:hover,#permsOverlay button.main:hover{background:#a80000;}' +
      '.authErr{color:#FF4444;font-size:12px;margin-top:10px;min-height:16px;}' +
      '#authLogoImg{max-width:260px;max-height:160px;object-fit:contain;margin-bottom:16px;}' +
      '#userBadge{position:fixed;top:10px;right:14px;z-index:9999;background:#1c1c1c;border:1px solid #333;border-radius:20px;padding:7px 16px;font-size:12px;color:#fff;cursor:pointer;font-family:Arial,sans-serif;user-select:none;}' +
      '#userMenu{position:fixed;top:46px;right:14px;z-index:9999;background:#1c1c1c;border:1px solid #333;border-radius:8px;padding:6px;display:none;min-width:200px;font-family:Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4);}' +
      '#userMenu .mi{padding:9px 12px;font-size:12px;color:#eee;cursor:pointer;border-radius:5px;}' +
      '#userMenu .mi:hover{background:#2a2a2a;}' +
      '#userMgmtOverlay table{width:100%;border-collapse:collapse;margin-bottom:16px;}' +
      '#userMgmtOverlay td,#userMgmtOverlay th{padding:7px 4px;font-size:12px;border-bottom:1px solid #2a2a2a;color:#eee;text-align:left;}' +
      '#userMgmtOverlay button.sm,#permsOverlay button.sm{background:#333;border:none;color:#fff;border-radius:4px;padding:5px 9px;cursor:pointer;font-size:11px;margin-right:4px;}' +
      '#userMgmtOverlay button.sm:hover{background:#444;}' +
      '#userMgmtOverlay button.close,#permsOverlay button.close{background:transparent;border:1px solid #333;color:#999;width:100%;padding:9px;border-radius:6px;cursor:pointer;margin-top:6px;}' +
      '#userMgmtOverlay .badge-super{background:#CC0000;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:4px;}' +
      '#userMgmtOverlay .badge-full{background:#1144CC;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:4px;}' +
      '.permsGrid{text-align:left;display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;}' +
      '.permsGrid label{font-size:12px;color:#eee;display:flex;align-items:center;gap:6px;cursor:pointer;}' +
      '#logoFileInput{display:none;}';
    document.head.appendChild(s);
  }

  // ---------- Écran de connexion ----------
  function buildLoginOverlay() {
    var ov = document.createElement('div');
    ov.id = 'authOverlay';
    var watermarkHtml = window.FSS_LOGIN_WATERMARK
      ? '<img id="authWatermark" src="' + window.FSS_LOGIN_WATERMARK + '">'
      : '';
    ov.innerHTML =
      watermarkHtml +
      '<div class="box">' +
      '<img id="authLogoImg" style="display:none">' +
      '<h1 id="authTitle">FSS-CAISSE</h1>' +
      '<p id="authWait">Connexion au serveur...</p>' +
      '<input id="authNom" placeholder="Identifiant" autocomplete="username">' +
      '<input id="authMdp" type="password" placeholder="Mot de passe" autocomplete="current-password">' +
      '<button class="main" id="authLoginBtn" disabled>Chargement...</button>' +
      '<div class="authErr" id="authErr"></div>' +
      '<div style="margin-top:22px;font-size:10px;color:#555;font-weight:700">D\u00e9velopp\u00e9 par FallServices&amp;Solutions \u2014 +241 77 37 86 02</div>' +
      '</div>';
    document.body.appendChild(ov);

    document.getElementById('authLoginBtn').addEventListener('click', tryLogin);
    ov.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryLogin(); });
  }

  function updateLoginLogo() {
    var img = document.getElementById('authLogoImg');
    var title = document.getElementById('authTitle');
    if (!img) return;
    if (window.logoData) {
      img.src = window.logoData;
      img.style.display = 'block';
      if (title) title.style.display = 'none';
    } else {
      img.style.display = 'none';
      if (title) title.style.display = 'block';
    }
  }

  function tryLogin() {
    if (!dataReady) return;
    var nom = document.getElementById('authNom').value.trim();
    var mdp = document.getElementById('authMdp').value;
    var err = document.getElementById('authErr');
    var u = (window.users || []).find(function (x) {
      return x.nom.toLowerCase() === nom.toLowerCase() && x.mdp === mdp;
    });
    if (!u) { err.textContent = 'Identifiant ou mot de passe incorrect'; return; }
    err.textContent = '';
    currentUser = u;
    window.currentUser = u;
    document.getElementById('authOverlay').remove();
    if (u.doitChangerMdp) {
      showChangePassword(u, true);
    } else {
      enterApp();
    }
  }

  // ---------- Changement de mot de passe ----------
  function showChangePassword(u, forced) {
    if (u.super) { safeToast('Ce compte est protégé et ne peut jamais être modifié', 'e'); return; }
    var ov = document.createElement('div');
    ov.id = 'chgPwdOverlay';
    ov.style.display = 'flex';
    ov.innerHTML =
      '<div class="box">' +
      '<h1>🔑 Nouveau mot de passe</h1>' +
      '<p>' + (forced ? 'Première connexion — merci de définir un nouveau mot de passe pour "' + u.nom + '"' : 'Changer le mot de passe de "' + u.nom + '"') + '</p>' +
      '<input id="cpNew" type="password" placeholder="Nouveau mot de passe">' +
      '<input id="cpConfirm" type="password" placeholder="Confirmer le mot de passe">' +
      '<button class="main" id="cpBtn">Valider</button>' +
      '<div class="authErr" id="cpErr"></div>' +
      '</div>';
    document.body.appendChild(ov);

    document.getElementById('cpBtn').addEventListener('click', function () {
      var p1 = document.getElementById('cpNew').value;
      var p2 = document.getElementById('cpConfirm').value;
      var err = document.getElementById('cpErr');
      if (!p1 || p1.length < 3) { err.textContent = 'Mot de passe trop court (3 caractères minimum)'; return; }
      if (p1 !== p2) { err.textContent = 'Les mots de passe ne correspondent pas'; return; }
      u.mdp = p1;
      u.doitChangerMdp = false;
      if (window.fssSyncPush) window.fssSyncPush();
      ov.remove();
      if (forced) enterApp();
      else safeToast('Mot de passe modifié', 's');
    });
  }

  function safeToast(msg, typ) { try { toast(msg, typ); } catch (e) {} }

  // ---------- Droits d'accès ----------
  function hasAccess(u, moduleKey) {
    if (!u) return false;
    if (u.super || u.full) return true;
    return (u.perms || []).indexOf(moduleKey) !== -1;
  }

  window.hasReimprPermission = function () {
    return hasAccess(currentUser, 'reimpression');
  };

  function applyPermissions() {
    document.querySelectorAll('.nb').forEach(function (btn) {
      var m = (btn.getAttribute('onclick') || '').match(/goPage\('([a-zA-Z]+)'/);
      if (!m) return;
      btn.style.display = hasAccess(currentUser, m[1]) ? '' : 'none';
    });
    if (!window._goPageWrapped && typeof window.goPage === 'function') {
      var origGoPage = window.goPage;
      window.goPage = function (name, btn) {
        if (!hasAccess(currentUser, name)) {
          safeToast('Accès non autorisé pour ce compte', 'e');
          return;
        }
        return origGoPage(name, btn);
      };
      window._goPageWrapped = true;
    }
  }

  // ---------- Badge utilisateur + menu ----------
  function buildUserBadge() {
    var badge = document.createElement('div');
    badge.id = 'userBadge';
    badge.textContent = '👤 ' + currentUser.nom + (currentUser.super ? ' ⭐' : '');
    document.body.appendChild(badge);

    var canManage = currentUser.super || currentUser.full;

    var menu = document.createElement('div');
    menu.id = 'userMenu';
    menu.innerHTML =
      (!currentUser.super ? '<div class="mi" id="miChangePwd">🔑 Changer mon mot de passe</div>' : '') +
      (canManage ? '<div class="mi" id="miManageUsers">👥 Gérer les utilisateurs</div>' : '') +
      (canManage ? '<div class="mi" id="miChangeLogo">🖼️ Changer le logo</div>' : '') +
      '<div class="mi" id="miLogout">🚪 Déconnexion</div>';
    document.body.appendChild(menu);

    badge.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', function () { menu.style.display = 'none'; });

    if (!currentUser.super) {
      document.getElementById('miChangePwd').addEventListener('click', function () {
        menu.style.display = 'none';
        showChangePassword(currentUser, false);
      });
    }
    if (canManage) {
      document.getElementById('miManageUsers').addEventListener('click', function () {
        menu.style.display = 'none';
        openUserMgmt();
      });
      document.getElementById('miChangeLogo').addEventListener('click', function () {
        menu.style.display = 'none';
        document.getElementById('logoFileInput').click();
      });
    }
    document.getElementById('miLogout').addEventListener('click', function () {
      location.reload();
    });

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'logoFileInput';
    fileInput.accept = 'image/*';
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', function () {
      var file = fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        logoData = e.target.result;
        window.logoData = logoData;
        if (window.fssSyncPush) window.fssSyncPush();
        safeToast('Logo mis à jour', 's');
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- Gestion des utilisateurs ----------
  function buildUserMgmtOverlay() {
    var ov = document.createElement('div');
    ov.id = 'userMgmtOverlay';
    var permsHtml = '<div class="permsGrid" id="umgtPermsGrid">' +
      MODULES.map(function (m) {
        return '<label><input type="checkbox" class="umgtPermChk" value="' + m.key + '"> ' + m.label + '</label>';
      }).join('') + '</div>';
    ov.innerHTML =
      '<div class="box">' +
      '<h2>👥 Gestion des utilisateurs</h2>' +
      '<table><thead><tr><th>Identifiant</th><th></th><th></th></tr></thead><tbody id="umgtBody"></tbody></table>' +
      '<div style="border-top:1px solid #2a2a2a;padding-top:14px;margin-top:4px">' +
      '<div style="font-size:12px;color:#ccc;margin-bottom:8px">➕ Nouvel utilisateur</div>' +
      '<input id="umgtNom" placeholder="Identifiant">' +
      '<input id="umgtMdp" type="password" placeholder="Mot de passe">' +
      '<div style="font-size:11px;color:#888;margin-bottom:6px">Accès autorisés :</div>' +
      permsHtml +
      '<button class="main" id="umgtAddBtn">➕ Ajouter l\'utilisateur</button>' +
      '<div class="authErr" id="umgtErr"></div>' +
      '</div>' +
      '<button class="close" id="umgtCloseBtn">Fermer</button>' +
      '</div>';
    document.body.appendChild(ov);

    document.getElementById('umgtAddBtn').addEventListener('click', addUser);
    document.getElementById('umgtCloseBtn').addEventListener('click', function () {
      ov.style.display = 'none';
    });
  }

  function renderUserMgmt() {
    var body = document.getElementById('umgtBody');
    if (!body) return;
    body.innerHTML = '';
    (window.users || []).forEach(function (u) {
      var tr = document.createElement('tr');
      var canDelete = !u.super;
      var tag = u.super ? '<span class="badge-super">SUPER</span>' : (u.full ? '<span class="badge-full">COMPLET</span>' : '');
      var permsBtn = (!u.super && !u.full) ? '<button class="sm" data-action="perms" data-id="' + u.id + '">🛡️ Droits</button>' : '';
      var resetBtn = !u.super ? '<button class="sm" data-action="reset" data-id="' + u.id + '">🔑</button>' : '<span style="color:#555;font-size:11px">Protégé</span>';
      tr.innerHTML =
        '<td>' + u.nom + tag + '</td>' +
        '<td>' + permsBtn + resetBtn + '</td>' +
        '<td>' + (canDelete ? '<button class="sm" data-action="del" data-id="' + u.id + '">🗑️</button>' : '') + '</td>';
      body.appendChild(tr);
    });
    body.querySelectorAll('button[data-action="del"]').forEach(function (b) {
      b.addEventListener('click', function () { deleteUser(parseInt(b.dataset.id, 10)); });
    });
    body.querySelectorAll('button[data-action="reset"]').forEach(function (b) {
      b.addEventListener('click', function () { resetUserPassword(parseInt(b.dataset.id, 10)); });
    });
    body.querySelectorAll('button[data-action="perms"]').forEach(function (b) {
      b.addEventListener('click', function () { openPermsEditor(parseInt(b.dataset.id, 10)); });
    });
  }

  function openUserMgmt() {
    renderUserMgmt();
    document.getElementById('userMgmtOverlay').style.display = 'flex';
    document.getElementById('umgtErr').textContent = '';
    document.getElementById('umgtNom').value = '';
    document.getElementById('umgtMdp').value = '';
    document.querySelectorAll('.umgtPermChk').forEach(function (c) { c.checked = false; });
  }

  function addUser() {
    var nom = document.getElementById('umgtNom').value.trim();
    var mdp = document.getElementById('umgtMdp').value;
    var err = document.getElementById('umgtErr');
    if (!nom || !mdp) { err.textContent = 'Identifiant et mot de passe requis'; return; }
    var exists = (window.users || []).some(function (u) { return u.nom.toLowerCase() === nom.toLowerCase(); });
    if (exists) { err.textContent = 'Cet identifiant existe déjà'; return; }
    var perms = [];
    document.querySelectorAll('.umgtPermChk').forEach(function (c) { if (c.checked) perms.push(c.value); });
    users.push({ id: nextUserId, nom: nom, mdp: mdp, super: false, full: false, perms: perms, doitChangerMdp: false });
    nextUserId++;
    err.textContent = '';
    document.getElementById('umgtNom').value = '';
    document.getElementById('umgtMdp').value = '';
    document.querySelectorAll('.umgtPermChk').forEach(function (c) { c.checked = false; });
    if (window.fssSyncPush) window.fssSyncPush();
    renderUserMgmt();
    safeToast('Utilisateur ajouté', 's');
  }

  function deleteUser(id) {
    var u = (window.users || []).find(function (x) { return x.id === id; });
    if (!u) return;
    if (u.super) { safeToast('Ce compte ne peut pas être supprimé', 'e'); return; }
    if (!confirm('Supprimer l\'utilisateur "' + u.nom + '" ?')) return;
    users = users.filter(function (x) { return x.id !== id; });
    window.users = users;
    if (window.fssSyncPush) window.fssSyncPush();
    renderUserMgmt();
    safeToast('Utilisateur supprimé', 'i');
  }

  function resetUserPassword(id) {
    var u = (window.users || []).find(function (x) { return x.id === id; });
    if (!u) return;
    if (u.super) { safeToast('Ce compte est protégé et ne peut pas être modifié', 'e'); return; }
    showChangePassword(u, false);
  }

  // ---------- Édition des droits d'un utilisateur existant ----------
  function buildPermsOverlay() {
    var ov = document.createElement('div');
    ov.id = 'permsOverlay';
    var permsHtml = '<div class="permsGrid" id="permsGrid">' +
      MODULES.map(function (m) {
        return '<label><input type="checkbox" class="permsChk" value="' + m.key + '"> ' + m.label + '</label>';
      }).join('') + '</div>';
    ov.innerHTML =
      '<div class="box">' +
      '<h2>🛡️ Droits d\'accès — <span id="permsUserName"></span></h2>' +
      '<p>Coche les sections que ce compte pourra voir.</p>' +
      permsHtml +
      '<button class="main" id="permsSaveBtn">Enregistrer</button>' +
      '<button class="close" id="permsCloseBtn">Annuler</button>' +
      '</div>';
    document.body.appendChild(ov);
    document.getElementById('permsCloseBtn').addEventListener('click', function () {
      ov.style.display = 'none';
    });
  }

  var editingUserId = null;
  function openPermsEditor(id) {
    var u = (window.users || []).find(function (x) { return x.id === id; });
    if (!u) return;
    if (u.super || u.full) { safeToast('Ce compte a déjà accès à tout et ne peut pas être modifié', 'e'); return; }
    editingUserId = id;
    document.getElementById('permsUserName').textContent = u.nom;
    document.querySelectorAll('.permsChk').forEach(function (c) {
      c.checked = (u.perms || []).indexOf(c.value) !== -1;
    });
    document.getElementById('permsOverlay').style.display = 'flex';
  }

  function bindPermsSaveBtn() {
    var saveBtn = document.getElementById('permsSaveBtn');
    if (saveBtn && !saveBtn._bound) {
      saveBtn._bound = true;
      saveBtn.addEventListener('click', function () {
        var u = (window.users || []).find(function (x) { return x.id === editingUserId; });
        if (!u) return;
        var perms = [];
        document.querySelectorAll('.permsChk').forEach(function (c) { if (c.checked) perms.push(c.value); });
        u.perms = perms;
        if (window.fssSyncPush) window.fssSyncPush();
        document.getElementById('permsOverlay').style.display = 'none';
        safeToast('Droits mis à jour', 's');
      });
    }
  }

  // ---------- Entrée dans l'application ----------
  function enterApp() {
    buildUserBadge();
    buildUserMgmtOverlay();
    buildPermsOverlay();
    bindPermsSaveBtn();
    applyPermissions();
    try { renderRap(); } catch (e) {}
    try { renderTkList(); } catch (e) {}
  }

  injectCSS();
  buildLoginOverlay();
})();
