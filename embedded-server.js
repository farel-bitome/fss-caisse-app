const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { Server } = require('socket.io');

// Filet de sécurité global : une erreur imprévue n'importe où (surtout
// probable quand plusieurs postes sont connectés en même temps et envoient
// des changements proches dans le temps) ne doit JAMAIS faire planter le
// serveur entier — ce qui coupait TOUS les postes connectés d'un coup. On
// journalise l'erreur au lieu de laisser le processus s'arrêter.
process.on('uncaughtException', (err) => {
  console.error('[FSS-CAISSE] Erreur serveur non gérée (ignorée, le serveur continue) :', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[FSS-CAISSE] Promesse rejetée non gérée (ignorée, le serveur continue) :', err);
});

module.exports = function startEmbeddedServer(port, userDataDir, appRootDir) {
  return new Promise((resolve, reject) => {
    const appStaticDir = path.join(appRootDir, 'app');
    const dataFile = path.join(userDataDir, 'data.json');
    const backupDataFile = path.join(userDataDir, 'data.backup.json');
    const logFile = path.join(userDataDir, 'sync-log.txt');
    function ecrireJournal(ligne) {
      try {
        var horodatage = new Date().toLocaleString('fr-FR');
        fs.appendFileSync(logFile, '[' + horodatage + '] ' + ligne + '\n');
      } catch (e) {}
    }
    const defaultFile = path.join(appRootDir, 'server-data', 'data.default.json');
    const airtelConfigFile = path.join(userDataDir, 'airtel-config.json');

    function loadState() {
      let state;
      let sourceUtilisee = 'principale';
      try {
        if (fs.existsSync(dataFile)) {
          state = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        }
      } catch (e) {
        // Fichier principal corrompu (ex: l'app a planté en pleine écriture) —
        // avant d'abandonner et de repartir sur des données vierges (ce qui
        // effaçait TOUT : commandes en attente, ventes...), on tente d'abord
        // de récupérer la dernière copie de secours valide.
        console.error('Fichier de données principal illisible :', e.message);
        try {
          if (fs.existsSync(backupDataFile)) {
            state = JSON.parse(fs.readFileSync(backupDataFile, 'utf8'));
            sourceUtilisee = 'copie de secours';
            console.log('Récupéré depuis la copie de secours (data.backup.json).');
          }
        } catch (e2) {
          console.error('Copie de secours également illisible :', e2.message);
        }
      }
      if (!state) {
        console.error('Aucune donnée récupérable — démarrage sur les données par défaut (catalogue de base uniquement).');
        return JSON.parse(fs.readFileSync(defaultFile, 'utf8'));
      }
      if (sourceUtilisee === 'copie de secours') {
        // Réécrit immédiatement le fichier principal avec les données
        // récupérées, pour que la copie corrompue ne traîne pas.
        saveState(state);
      }
      // Migration unique : remplace le catalogue d'articles par le nouveau menu,
      // sans toucher au reste des données déjà enregistrées (clients, ventes,
      // personnel, etc.) — ne s'exécute qu'une seule fois grâce au marqueur.
      if (!state.menuMigratedV2) {
        try {
          const defaults = JSON.parse(fs.readFileSync(defaultFile, 'utf8'));
          state.arts = defaults.arts;
          state.menuMigratedV2 = true;
          saveState(state);
          console.log('Migration : catalogue d\'articles mis à jour (' + defaults.arts.length + ' articles).');
        } catch (e) {
          console.error('Erreur pendant la migration du catalogue d\'articles :', e.message);
        }
      }
      // Migration unique : corrige la liste des catégories (Paramètres) pour
      // qu'elle corresponde réellement aux catégories utilisées par les
      // articles — l'ancienne liste de démonstration ('Boissons', 'Bières'...)
      // ne correspondait à aucun article réel, ce qui rendait notamment les
      // réglages "gestion de stock par catégorie" inopérants (aucune
      // correspondance exacte possible).
      if (!state.categoriesMigratedV1) {
        try {
          const catsReelles = Array.from(new Set((state.arts || []).map(a => a.cat).filter(Boolean))).sort();
          if (catsReelles.length) {
            state.categories = catsReelles;
          }
          state.categoriesMigratedV1 = true;
          saveState(state);
          console.log('Migration : liste des catégories corrigée (' + catsReelles.length + ' catégories).');
        } catch (e) {
          console.error('Erreur pendant la migration des catégories :', e.message);
        }
      }
      // Migration unique : remplace l'ancienne liste de tables de démonstration
      // (8 tables) par les 400 tables demandées, toutes "Libre" par défaut —
      // à l'utilisateur de marquer ensuite lui-même celles qui sont réservées
      // ou occupées, via le formulaire d'édition d'une table.
      if (!state.tablesMigratedV1) {
        try {
          const defaults = JSON.parse(fs.readFileSync(defaultFile, 'utf8'));
          state.tables = defaults.tables;
          state.tablesMigratedV1 = true;
          saveState(state);
          console.log('Migration : ' + defaults.tables.length + ' tables mises en place (toutes libres).');
        } catch (e) {
          console.error('Erreur pendant la migration des tables :', e.message);
        }
      }
      return state;
    }

    function saveState(state) {
      const json = JSON.stringify(state, null, 2);
      // Garde une copie de secours du dernier état VALIDE avant d'écraser —
      // sert de filet de récupération si jamais la prochaine écriture est
      // interrompue par un plantage.
      try {
        if (fs.existsSync(dataFile)) {
          fs.copyFileSync(dataFile, backupDataFile);
        }
      } catch (e) {
        console.error('Impossible de mettre à jour la copie de secours :', e.message);
      }
      // Écriture atomique : on écrit d'abord dans un fichier temporaire, puis
      // on le renomme à la place du vrai fichier. Un "rename" est atomique au
      // niveau du système de fichiers — soit il réussit entièrement, soit le
      // fichier d'origine reste intact. Contrairement à une écriture directe,
      // un plantage en plein milieu ne peut plus jamais laisser le fichier
      // de données dans un état à moitié écrit (corrompu).
      const tmpFile = dataFile + '.tmp';
      fs.writeFileSync(tmpFile, json);
      fs.renameSync(tmpFile, dataFile);
    }

    // ---- Config Airtel Money : stockée à part, JAMAIS envoyée au navigateur/synchronisée ----
    function loadAirtelConfig() {
      try {
        if (fs.existsSync(airtelConfigFile)) {
          return JSON.parse(fs.readFileSync(airtelConfigFile, 'utf8'));
        }
      } catch (e) { /* ignore */ }
      return { clientId: '', clientSecret: '', pin: '', country: 'GA', currency: 'XAF', environment: 'staging' };
    }
    function saveAirtelConfig(cfg) {
      fs.writeFileSync(airtelConfigFile, JSON.stringify(cfg, null, 2));
    }

    async function airtelGetToken(cfg) {
      const base = cfg.environment === 'production' ? 'https://openapi.airtel.africa' : 'https://openapiuat.airtel.africa';
      const res = await fetch(base + '/auth/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: 'client_credentials'
        })
      });
      if (!res.ok) throw new Error('Échec authentification Airtel (' + res.status + ')');
      const data = await res.json();
      return data.access_token;
    }

    let state = loadState();

    const expressApp = express();
    const server = http.createServer(expressApp);
    const io = new Server(server);

    expressApp.use(function (req, res, next) {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,POST');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
    expressApp.use(express.json({ limit: '10mb' }));
    // Compression gzip des réponses (surtout utile pour /api/state, qui peut
    // devenir volumineux avec beaucoup d'articles/tables/historique) — réduit
    // nettement le temps de chargement sur un réseau mobile plus faible.
    // Implémenté avec le module natif "zlib" de Node, sans dépendance externe
    // à installer.
    expressApp.use(function (req, res, next) {
      var acceptEncoding = req.headers['accept-encoding'] || '';
      if (acceptEncoding.indexOf('gzip') === -1) return next();
      var originalJson = res.json.bind(res);
      var originalSend = res.send.bind(res);
      function compresserEtEnvoyer(corps) {
        var buffer = Buffer.isBuffer(corps) ? corps : Buffer.from(typeof corps === 'string' ? corps : JSON.stringify(corps));
        zlib.gzip(buffer, function (err, resultat) {
          if (err) { res.set('Content-Type', 'application/json'); return originalSend(buffer); }
          res.set('Content-Encoding', 'gzip');
          res.set('Content-Type', 'application/json');
          originalSend(resultat);
        });
      }
      res.json = function (corps) { compresserEtEnvoyer(corps); return res; };
      next();
    });
    expressApp.use(express.static(appStaticDir));

    expressApp.get('/api/state', (req, res) => {
      res.json(state);
    });

    // ---- Commandes en attente : gérées EXCLUSIVEMENT via des actions ciblées ----
    // Fini le système de fusion par délai de grâce (imprécis, pouvait quand
    // même perdre une commande si un poste restait en retard plus de 15s —
    // fréquent sur un wifi de restaurant chargé). Désormais, cmdAttente n'est
    // JAMAIS remplacé en bloc par le "fullState" envoyé par un poste — cette
    // route ignore volontairement tout cmdAttente reçu ici. Les seules façons
    // de le modifier sont les 3 routes ciblées ci-dessous (ajouter, retirer,
    // remplacer UNE commande précise par son id) — aucun risque qu'un poste
    // avec une vue partielle/en retard n'écrase les commandes des autres.
    expressApp.post('/api/cmdattente/ajouter', (req, res) => {
      try {
        state.cmdAttente = state.cmdAttente || [];
        state.cmdAttente = state.cmdAttente.filter(function (c) { return c.id !== req.body.id; });
        state.cmdAttente.push(req.body);
        saveState(state);
        io.emit('state:changed', state);
        ecrireJournal('Commande en attente ajoutée : ' + req.body.id + ' (' + req.body.tableNom + ', ' + req.body.total + ' FCFA) — liste complète après ajout (' + state.cmdAttente.length + ') : ' + state.cmdAttente.map(function (c) { return c.id; }).join(', '));
        res.json({ ok: true });
      } catch (e) {
        console.error('[FSS-CAISSE] Erreur ajout commande en attente :', e);
        res.status(500).json({ ok: false, error: e.message });
      }
    });
    expressApp.post('/api/cmdattente/retirer', (req, res) => {
      try {
        state.cmdAttente = (state.cmdAttente || []).filter(function (c) { return c.id !== req.body.id; });
        saveState(state);
        io.emit('state:changed', state);
        ecrireJournal('Commande en attente retirée : ' + req.body.id + ' — liste complète après retrait (' + state.cmdAttente.length + ') : ' + state.cmdAttente.map(function (c) { return c.id; }).join(', '));
        res.json({ ok: true });
      } catch (e) {
        console.error('[FSS-CAISSE] Erreur suppression commande en attente :', e);
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // Petite route de diagnostic : permet à l'application (n'importe quel
    // poste) d'écrire une ligne dans le journal texte du serveur — utile pour
    // suivre précisément ce qui se passe côté écran sans avoir besoin
    // d'ouvrir la console développeur.
    expressApp.post('/api/log', (req, res) => {
      try {
        ecrireJournal('[poste] ' + (req.body && req.body.message ? req.body.message : ''));
        res.json({ ok: true });
      } catch (e) {
        res.status(500).json({ ok: false });
      }
    });

    // Comme pour les commandes en attente : une table (création, modification
    // du statut Libre/Occupée/Réservée, suppression) passe désormais par sa
    // propre route dédiée, plutôt que par l'envoi de l'état complet. Fini la
    // comparaison d'horodatages entre appareils (tsModif), qui restait
    // fragile dès qu'une horloge était mal réglée quelque part — cause du
    // souci "le logiciel écrase toujours les tables". Le serveur applique
    // directement le changement demandé, sans jamais avoir besoin de deviner
    // laquelle de deux versions est "la plus récente".
    expressApp.post('/api/tables/enregistrer', (req, res) => {
      try {
        state.tables = state.tables || [];
        var idx = state.tables.findIndex(function (t) { return t.n === req.body.n; });
        if (idx >= 0) state.tables[idx] = req.body; else state.tables.push(req.body);
        saveState(state);
        io.emit('state:changed', state);
        ecrireJournal('Table enregistrée : n°' + req.body.n + ' (' + req.body.nom + ', statut: ' + req.body.st + ')');
        res.json({ ok: true });
      } catch (e) {
        console.error('[FSS-CAISSE] Erreur enregistrement table :', e);
        res.status(500).json({ ok: false, error: e.message });
      }
    });
    expressApp.post('/api/tables/supprimer', (req, res) => {
      try {
        state.tables = (state.tables || []).filter(function (t) { return t.n !== req.body.n; });
        saveState(state);
        io.emit('state:changed', state);
        ecrireJournal('Table supprimée : n°' + req.body.n);
        res.json({ ok: true });
      } catch (e) {
        console.error('[FSS-CAISSE] Erreur suppression table :', e);
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // Même principe, appliqué cette fois aux bons de commande cuisine et aux
    // bilans de clôture (printBatches) : route dédiée et immédiate, plutôt
    // que de compter sur la synchronisation générale (débouncée, et qui
    // pouvait être affectée par des versions concurrentes). Le serveur ajoute
    // directement le bon et diffuse le changement sans délai — c'est la même
    // approche que celle qui fonctionne déjà de façon fiable pour les
    // commandes en attente et les tables.
    expressApp.post('/api/printbatches/ajouter', (req, res) => {
      try {
        state.printBatches = state.printBatches || [];
        state.printBatches = state.printBatches.filter(function (bt) { return bt.batchId !== req.body.batchId; });
        state.printBatches.push(req.body);
        // Purge les bons de plus de 2h connus du serveur, pour ne pas
        // accumuler indéfiniment — basé uniquement sur l'horloge du serveur.
        var MAINTENANT = Date.now();
        state.printBatches.forEach(function (bt) { if (!bt._recuLe) bt._recuLe = MAINTENANT; });
        state.printBatches = state.printBatches.filter(function (bt) { return (MAINTENANT - bt._recuLe) < 2 * 60 * 60 * 1000; });
        saveState(state);
        io.emit('state:changed', state);
        ecrireJournal('[route dédiée] Bon de commande ajouté : ' + req.body.batchId + ' (table: ' + req.body.tableNom + ', ' + (req.body.items || []).length + ' article(s)) — total en file : ' + state.printBatches.length);
        res.json({ ok: true });
      } catch (e) {
        console.error('[FSS-CAISSE] Erreur ajout bon de commande :', e);
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // Le statut des tables (Libre/Occupée/Réservée) est désormais géré via
    // les routes dédiées /api/tables/* ci-dessous, plus robuste qu'une
    // comparaison d'horodatages entre appareils (tsModif), qui restait
    // fragile dès qu'une horloge était mal réglée quelque part.

    // Les bons de commande cuisine et bilans de clôture (printBatches) sont
    // désormais gérés via la route dédiée /api/printbatches/ajouter
    // ci-dessous, plus fiable qu'une fusion par horodatage.

    expressApp.post('/api/state', (req, res) => {
      try {
        const nouvelEtat = req.body;
        // cmdAttente n'est plus jamais accepté depuis cette route générique —
        // on garde toujours la version déjà connue du serveur, gérée à part
        // via les routes /api/cmdattente/*.
        nouvelEtat.cmdAttente = state.cmdAttente || [];
        // Même chose pour les tables — gérées à part via /api/tables/*, pour
        // ne plus jamais dépendre d'une comparaison d'horodatages entre
        // appareils.
        nouvelEtat.tables = state.tables || [];
        // printBatches n'est plus jamais accepté depuis cette route
        // générique — géré exclusivement via /api/printbatches/ajouter,
        // pour la même raison que cmdAttente et tables : ne plus jamais
        // dépendre d'une synchronisation débouncée qui pouvait manquer un
        // bon fraîchement créé.
        nouvelEtat.printBatches = state.printBatches || [];
        // Le catalogue d'articles n'est accepté que s'il est réellement plus
        // récent que celui déjà connu du serveur — sinon on garde la dernière
        // vraie mise à jour. Sans ça, un poste avec une version un peu
        // ancienne du catalogue (pas encore reçu un ajout/modif fait
        // ailleurs) pouvait écraser un article tout juste mis à jour.
        const ancienHorodatageArts = (state && state.artsUpdatedAt) || 0;
        const nouvelHorodatageArts = nouvelEtat.artsUpdatedAt || 0;
        if (ancienHorodatageArts > nouvelHorodatageArts) {
          nouvelEtat.arts = state.arts;
          nouvelEtat.artsUpdatedAt = ancienHorodatageArts;
        }
        state = nouvelEtat;
        saveState(state);
        io.emit('state:changed', state);
        res.json({ ok: true });
      } catch (e) {
        console.error('[FSS-CAISSE] Erreur lors de l\'enregistrement d\'un changement :', e);
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // ---- Routes Airtel Money ----
    expressApp.get('/api/airtel/config-status', (req, res) => {
      const cfg = loadAirtelConfig();
      res.json({ configured: !!(cfg.clientId && cfg.clientSecret), environment: cfg.environment || 'staging' });
    });

    expressApp.post('/api/airtel/save-config', (req, res) => {
      const { clientId, clientSecret, country, currency, environment } = req.body || {};
      saveAirtelConfig({
        clientId: clientId || '', clientSecret: clientSecret || '',
        country: country || 'GA', currency: currency || 'XAF',
        environment: environment === 'production' ? 'production' : 'staging'
      });
      res.json({ ok: true });
    });

    expressApp.post('/api/airtel/collect', async (req, res) => {
      try {
        const cfg = loadAirtelConfig();
        if (!cfg.clientId || !cfg.clientSecret) {
          return res.status(400).json({ ok: false, error: "Airtel Money n'est pas encore configuré (Paramètres > Paiement Mobile)." });
        }
        const { phone, amount, reference } = req.body || {};
        if (!phone || !amount) return res.status(400).json({ ok: false, error: 'Numéro et montant requis.' });
        const base = cfg.environment === 'production' ? 'https://openapi.airtel.africa' : 'https://openapiuat.airtel.africa';
        const token = await airtelGetToken(cfg);
        const txRef = reference || ('FSS-' + Date.now());
        const collectRes = await fetch(base + '/merchant/v1/payments/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'X-Country': cfg.country || 'GA',
            'X-Currency': cfg.currency || 'XAF'
          },
          body: JSON.stringify({
            reference: 'FSS-CAISSE',
            subscriber: { country: cfg.country || 'GA', currency: cfg.currency || 'XAF', msisdn: phone },
            transaction: { amount: amount, country: cfg.country || 'GA', currency: cfg.currency || 'XAF', id: txRef }
          })
        });
        const collectData = await collectRes.json().catch(function () { return {}; });
        if (!collectRes.ok) {
          return res.status(502).json({ ok: false, error: (collectData && collectData.message) || 'Échec de la demande de paiement Airtel Money.' });
        }
        res.json({ ok: true, transactionId: txRef });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message || 'Erreur Airtel Money' });
      }
    });

    expressApp.get('/api/airtel/status/:transactionId', async (req, res) => {
      try {
        const cfg = loadAirtelConfig();
        if (!cfg.clientId || !cfg.clientSecret) return res.status(400).json({ ok: false, error: 'Non configuré' });
        const base = cfg.environment === 'production' ? 'https://openapi.airtel.africa' : 'https://openapiuat.airtel.africa';
        const token = await airtelGetToken(cfg);
        const statusRes = await fetch(base + '/standard/v1/payments/' + encodeURIComponent(req.params.transactionId), {
          headers: {
            'Authorization': 'Bearer ' + token,
            'X-Country': cfg.country || 'GA',
            'X-Currency': cfg.currency || 'XAF'
          }
        });
        const statusData = await statusRes.json().catch(function () { return {}; });
        var statusCode = statusData && statusData.data && statusData.data.transaction && statusData.data.transaction.status;
        res.json({ ok: true, status: statusCode || 'PENDING', raw: statusData });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message || 'Erreur Airtel Money' });
      }
    });

    io.on('connection', (socket) => {
      try {
        socket.emit('state:changed', state);
      } catch (e) {
        console.error('[FSS-CAISSE] Erreur lors de la connexion d\'un poste :', e);
      }
    });

    server.on('error', reject);
    server.listen(port, '0.0.0.0', () => resolve(server));
  });
};
