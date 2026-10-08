// FSS-CAISSE (version Windows) — écran « Synchronisation en ligne » + indicateur d'état.
// Utilise les routes locales /api/cloud/* du serveur intégré (voir cloud-sync.js). Inactif en version web.
(function () {
  if (window.FSS_CLOUD) return;

  var overlay = null, badge = null, pollTimer = null, lastStatus = null;

  function el(tag, props, children) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'style') e.style.cssText = props[k]; else if (k === 'text') e.textContent = props[k]; else e[k] = props[k];
    });
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function api(method, url, body) {
    return fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { j._http = r.status; return j; }); });
  }
  function ago(iso) {
    if (!iso) return 'jamais';
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return 'à l\'instant';
    if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
    return 'il y a ' + Math.round(s / 86400) + ' j';
  }

  // ---------- Indicateur ----------
  function renderBadge(st) {
    if (!st || !st.linked) { if (badge) badge.style.display = 'none'; return; }
    if (!badge) {
      badge = el('div', { id: 'cloudBadge', style: 'position:fixed;bottom:10px;right:14px;z-index:9998;background:#1c1c1c;border:1px solid #333;border-radius:16px;padding:6px 14px;font:12px Arial,sans-serif;color:#fff;cursor:pointer;user-select:none' });
      badge.addEventListener('click', function () { if (window.currentUser && (window.currentUser.super || window.currentUser.full)) openPanel(); });
      document.body.appendChild(badge);
    }
    badge.style.display = '';
    var txt;
    if (st.lastError && st.online === true) txt = '☁️ ⚠️ ' + st.lastError;
    else if (st.online === false) txt = '☁️ Hors-ligne' + (st.enAttente ? ' — modifications en attente' : '');
    else if (st.syncing) txt = '☁️ Synchronisation…';
    else txt = '☁️ Synchronisé ' + ago(st.lastSyncAt) + (st.enAttente ? ' (envoi en cours)' : '');
    badge.textContent = txt;
    badge.style.borderColor = st.online === false ? '#b36b00' : (st.lastError ? '#CC0000' : '#2e7d32');
  }
  function refresh() {
    return api('GET', '/api/cloud/status').then(function (st) { lastStatus = st; renderBadge(st); if (overlay && overlay.style.display === 'flex') renderPanel(st); return st; }).catch(function () {});
  }

  // ---------- Panneau ----------
  function openPanel() {
    if (!overlay) {
      overlay = el('div', { id: 'cloudOverlay', style: 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.75);font-family:Arial,sans-serif' });
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    refresh().then(function (st) { renderPanel(st || { linked: false }); });
  }
  function closePanel() { if (overlay) overlay.style.display = 'none'; }

  function row(label, value) {
    return el('div', { style: 'display:flex;justify-content:space-between;gap:12px;font-size:12px;margin:4px 0' }, [
      el('span', { style: 'color:#999', text: label }), el('span', { style: 'color:#eee;text-align:right', text: value })
    ]);
  }
  function input(id, ph, type) {
    return el('input', { id: id, placeholder: ph, type: type || 'text', autocomplete: 'off', style: 'width:100%;padding:11px;margin-bottom:10px;border-radius:6px;border:1px solid #333;background:#0e0e0e;color:#fff;font-size:14px;box-sizing:border-box' });
  }
  function btn(text, onclick, secondary) {
    var b = el('button', { text: text, style: 'width:100%;padding:11px;margin-top:8px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;' + (secondary ? 'background:transparent;border:1px solid #444;color:#ccc' : 'background:#CC0000;border:none;color:#fff') });
    b.addEventListener('click', onclick);
    return b;
  }

  function renderPanel(st) {
    overlay.textContent = '';
    var box = el('div', { style: 'background:#1c1c1c;border:1px solid #2a2a2a;border-radius:12px;padding:26px 30px;width:420px;max-width:92vw;max-height:88vh;overflow:auto;color:#fff' });
    box.appendChild(el('h2', { style: 'margin:0 0 6px;font-size:17px;color:#CC0000', text: '☁️ Synchronisation en ligne' }));

    if (!st.linked) {
      box.appendChild(el('p', { style: 'margin:0 0 16px;font-size:12px;color:#999;line-height:1.5', text:
        'Reliez ce PC à votre compte en ligne : la caisse continue de fonctionner sans Internet, et tout se met à jour automatiquement dès que la connexion revient. ' +
        'Les données de ce PC (ventes, stock, clients…) sont envoyées en ligne ; rien n\'est effacé.' }));
      box.appendChild(input('cloudUrl', 'Adresse en ligne (ex. monresto.fss-caisse.com)'));
      box.appendChild(input('cloudNom', 'Identifiant administrateur'));
      box.appendChild(input('cloudMdp', 'Mot de passe', 'password'));
      var err = el('div', { id: 'cloudErr', style: 'color:#FF4444;font-size:12px;min-height:16px;margin:2px 0 6px' });
      box.appendChild(err);
      var go = btn('Lier ce PC', function () {
        var url = document.getElementById('cloudUrl').value.trim(), nom = document.getElementById('cloudNom').value.trim(), mdp = document.getElementById('cloudMdp').value;
        if (!url || !nom || !mdp) { err.textContent = 'Remplissez les trois champs.'; return; }
        go.disabled = true; go.textContent = 'Liaison et première synchronisation…'; err.textContent = '';
        api('POST', '/api/cloud/link', { url: url, nom: nom, mdp: mdp, appareil: 'PC caisse' }).then(function (r) {
          if (!r.ok) { err.textContent = r.erreur || 'Échec de la liaison'; go.disabled = false; go.textContent = 'Lier ce PC'; return; }
          lastStatus = r.status; renderBadge(r.status); renderPanel(r.status);
        }).catch(function () { err.textContent = 'Échec de la liaison'; go.disabled = false; go.textContent = 'Lier ce PC'; });
      });
      box.appendChild(go);
    } else {
      box.appendChild(row('Établissement', st.etablissement || '—'));
      box.appendChild(row('Adresse', st.url));
      var etat = st.online === false ? '🟠 Hors-ligne' : (st.lastError ? '🔴 ' + st.lastError : '🟢 Connecté');
      box.appendChild(row('État', etat));
      box.appendChild(row('Dernière synchronisation', ago(st.lastSyncAt)));
      box.appendChild(row('Modifications à envoyer', st.enAttente ? 'oui' : 'aucune'));
      if (st.online === false) box.appendChild(el('p', { style: 'margin:10px 0 0;font-size:12px;color:#d9a441', text: 'Pas d\'Internet : la caisse fonctionne normalement. Tout sera envoyé automatiquement au retour de la connexion.' }));
      (st.avertissements || []).forEach(function (a) { box.appendChild(el('p', { style: 'margin:10px 0 0;font-size:12px;color:#d9a441', text: '⚠️ ' + a })); });
      if ((st.conflits || []).length) {
        box.appendChild(el('p', { style: 'margin:12px 0 4px;font-size:12px;color:#ccc;font-weight:bold', text: 'Numéros modifiés pour éviter un doublon :' }));
        st.conflits.slice(0, 8).forEach(function (c) { box.appendChild(el('div', { style: 'font-size:11px;color:#aaa', text: c.ancien + ' → ' + c.nouveau + ' (' + c.liste + ')' })); });
      }
      var now = btn('Synchroniser maintenant', function () {
        now.disabled = true; now.textContent = 'Synchronisation…';
        api('POST', '/api/cloud/sync').then(function (s) { lastStatus = s; renderBadge(s); renderPanel(s); }).catch(function () { renderPanel(st); });
      });
      box.appendChild(now);
      box.appendChild(btn('Délier ce PC', function () {
        if (!confirm('Délier ce PC du compte en ligne ?\n\nLes données restent sur ce PC et sur le web, mais ne seront plus synchronisées.')) return;
        api('POST', '/api/cloud/unlink').then(function () { refresh().then(function (s) { renderPanel(s || { linked: false }); }); });
      }, true));
    }
    box.appendChild(btn('Fermer', closePanel, true));
    overlay.appendChild(box);
  }

  // ---------- Point d'entrée (appelé après la connexion de l'utilisateur) ----------
  window.fssOpenCloudSync = openPanel;
  window.fssStartCloudBadge = function () {
    if (pollTimer) return;
    refresh();
    pollTimer = setInterval(refresh, 20000);
  };
})();
