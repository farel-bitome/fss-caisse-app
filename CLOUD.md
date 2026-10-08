# FSS-CAISSE Cloud — mise en ligne

Version web multi-établissements de FSS-CAISSE : un seul serveur, **un sous-domaine par client**
(`afrolounge.votre-domaine.com`), données **totalement séparées** par établissement, HTTPS automatique.
La version Windows (Electron) n'est pas modifiée et continue de fonctionner comme avant.

## Ce qu'il faut

- Un petit serveur Linux (VPS) avec **Docker** — 1 vCPU / 1 Go de RAM suffisent pour démarrer (Hetzner, OVH, DigitalOcean…).
- Un **nom de domaine** dont vous gérez le DNS.

## Installation (une seule fois)

1. **DNS** — chez votre registrar, créer deux enregistrements vers l'adresse IP du VPS :
   `A  votre-domaine.com → IP` et `A  *.votre-domaine.com → IP` (le `*` couvre tous les établissements).
2. **Récupérer le projet** sur le VPS (`git clone` du dépôt, branche `cloud-saas`).
3. **Configurer** : `cp cloud/.env.example .env`, puis éditer `.env` :
   - `BASE_DOMAIN=votre-domaine.com`
   - `SESSION_SECRET=` une valeur aléatoire (`openssl rand -hex 32`) — **à garder secrète**.
4. **Démarrer** : `docker compose -f docker-compose.cloud.yml up -d --build`
5. Ouvrir `https://votre-domaine.com` : la page d'accueil demande le code de l'établissement.
   Les certificats HTTPS sont obtenus automatiquement à la première visite de chaque sous-domaine.

## Gérer les établissements

Toutes les commandes se lancent sur le VPS (les changements sont pris en compte en ~2 secondes, sans redémarrage) :

```bash
docker compose -f docker-compose.cloud.yml exec app node cloud/admin.js creer afrolounge "Afro Lounge"
docker compose -f docker-compose.cloud.yml exec app node cloud/admin.js liste
docker compose -f docker-compose.cloud.yml exec app node cloud/admin.js suspendre afrolounge     # abonnement impayé
docker compose -f docker-compose.cloud.yml exec app node cloud/admin.js reactiver afrolounge
docker compose -f docker-compose.cloud.yml exec app node cloud/admin.js mot-de-passe afrolounge admin
```

`creer` affiche l'adresse et un mot de passe **généré aléatoirement** pour le compte `admin` du client
(à changer obligatoirement à sa 1re connexion). Il n'y a **aucun mot de passe par défaut**.
Un nouvel établissement démarre vide (catalogue, tables, clients à saisir ou importer par CSV/Excel).

### Reprendre un établissement existant (données de la version Windows)

1. Copier le fichier `data.json` du PC serveur (dossier de données de l'application) sur le VPS.
2. `docker compose -f docker-compose.cloud.yml cp data.json app:/tmp/data.json`
3. `docker compose -f docker-compose.cloud.yml exec app node cloud/admin.js importer afrolounge "Afro Lounge" /tmp/data.json`

Les mots de passe existants sont **hachés** (plus jamais stockés en clair) ; chaque employé choisit un nouveau
mot de passe à sa prochaine connexion. Un compte `admin` de secours est créé (mot de passe affiché une fois).

## Synchronisation avec la version Windows (hors-ligne ↔ en ligne)

Le PC de caisse reste le poste de vente : **il fonctionne sans Internet**. Une fois lié à son compte en ligne, il envoie
automatiquement ce qui s'est passé hors-ligne dès que la connexion revient, et reçoit ce qui a changé sur le web
(consultation des chiffres depuis n'importe où, modifications du catalogue, etc.).

**Lier un PC** (à faire une fois, avec Internet) : sur le PC serveur, connecté en administrateur, menu du badge en haut à droite →
**☁️ Synchronisation en ligne** → saisir l'adresse de l'établissement (`afrolounge.votre-domaine.com`) et l'identifiant/mot de passe
**administrateur** du compte en ligne. À la première liaison, **les données du PC sont envoyées en ligne** (rien n'est effacé côté web).
Un indicateur ☁️ en bas à droite montre l'état (synchronisé / hors-ligne / en attente).

Règles de fusion (aucune vente perdue) :
- ventes, mouvements de stock, prélèvements, clôtures : **tout est conservé des deux côtés** ;
- **stock et soldes** : on additionne les variations des deux côtés (PC −3 et web −5 → −8) ;
- même champ modifié des deux côtés en même temps : **le PC gagne** ;
- deux ventes de même numéro faites en même temps (PC et web) : la vente du web est renommée `TK-xxxx-W`, signalée dans le panneau ;
- les commandes en attente et les files d'impression restent propres à chaque côté.

Comptes : les mots de passe sont envoyés **hachés** ; sur le PC, un compte synchronisé se connecte sans Internet (vérification locale).
⚠ Un mot de passe de **moins de 6 caractères** n'est pas accepté sur le web (compte utilisable sur le PC seulement tant qu'il n'est pas changé) —
le panneau le signale. Chaque PC lié a son propre jeton : `node cloud/admin.js appareils <code>` pour les voir, `revoquer <code> <id>` pour en couper un.

## Données et sauvegardes

- Tout est dans le volume Docker `fss-data` : `/data/tenants/<code>/data.json` + une **sauvegarde automatique par jour**
  (30 jours) dans `/data/backups/<code>/`. **Copiez régulièrement ce volume hors du VPS** (snapshot du serveur, `rsync`, stockage objet).
- Journal par établissement : `/data/tenants/<code>/sync-log.txt`.

## Sécurité — ce qui est en place

- Connexion vérifiée **côté serveur**, mots de passe hachés (scrypt), jamais envoyés aux navigateurs.
- Session par cookie signé `HttpOnly` / `Secure` / `SameSite`, 12 h ; un changement de mot de passe ferme les anciennes sessions.
- Toutes les routes `/api/*` et le temps réel exigent une session ; essais de connexion limités (8 / 15 min).
- Isolation par établissement ; contrôle d'origine (anti-CSRF) ; pas de CORS ouvert.
- Seuls les administrateurs modifient les comptes ; impossible de se promouvoir ou de supprimer le dernier administrateur.
- Configuration Airtel/PVIT réservée aux administrateurs ; relais PVIT en `https://` uniquement et bloqué vers les réseaux internes.

## Limites actuelles (à connaître)

- **Droits fins côté serveur** : les droits par module (Caisse, Stock, Rapports…) restent appliqués par l'interface,
  comme avant. Un employé connecté techniquement habile pourrait appeler l'API directement et modifier des données
  métier (pas les comptes). Les appliquer côté serveur est la prochaine étape.
- **Impression automatique** (bons cuisine/bar, tickets) : sur la version Windows, c'est le PC « Serveur » qui imprime en silence.
  En version web, l'impression passe par le navigateur (boîte d'impression). Pour l'impression automatique en cuisine,
  il faudra un petit agent d'impression local — non inclus.
- Pas de mode hors-ligne : sans Internet, la caisse web ne fonctionne pas (la version Windows en réseau local reste disponible).
- Le serveur tourne sur **une seule instance** (pas de répartition de charge) : très largement suffisant pour des dizaines
  d'établissements, mais à revoir au-delà.

## Tests

`npm install && npm run cloud:test` — vérifications automatiques : serveur web (accès, sessions, isolation, droits, temps réel, import), règles de fusion, et un test de bout en bout PC ↔ web avec coupure Internet simulée.
