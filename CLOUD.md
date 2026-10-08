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

## Lier la version Windows (travail sans Internet, mise à jour automatique)

La caisse Windows reste le poste de travail : **elle fonctionne sans Internet**, et dès que la connexion est là elle
envoie ses changements au web et reprend ceux faits en ligne (stock, catalogue, clients, comptes, ventes…).

**Sur le PC « Serveur »** (une seule fois, avec Internet) :
1. Menu **FSS-CAISSE → Synchronisation en ligne (lier à mon compte web)**.
2. Saisir l'adresse de l'établissement (`https://afrolounge.votre-domaine.com`) et l'identifiant/mot de passe d'un **administrateur**.
3. Choisir : **« Ce PC contient déjà les données »** (envoi vers le web, pour une caisse déjà en service) ou
   **« Nouvel ordinateur »** (récupère les données du web — remplace celles du PC).
4. Terminé : le PC reçoit un jeton propre à lui (le mot de passe n'est pas conservé). Les comptes du PC sont publiés en ligne
   avec des mots de passe **hachés** ; les employés utilisent les mêmes identifiants partout, et les comptes créés sur le web
   fonctionnent aussi sur le PC **sans Internet**.

Les postes du réseau local (téléphones, autres PC) ne changent rien : ils continuent de se connecter au PC Serveur.

**Règles de fusion** (quand les deux côtés ont changé pendant une coupure) :
- Ce qui est **ajouté** d'un côté est gardé (ventes, clients, articles, mouvements de stock…). Deux ventes créées au même numéro des deux côtés sont **toutes les deux gardées** (la seconde reçoit le suffixe `-W`).
- Ce qui est **supprimé** d'un côté l'est aussi, sauf si l'autre côté l'a modifié entre-temps.
- Un élément **modifié des deux côtés** : la version du **PC de caisse** l'emporte (le détail est écrit dans le journal du web).
- Les compteurs (n° de ticket…) gardent toujours la plus grande valeur.

**Gérer les ordinateurs liés** (sur le VPS) :
```bash
docker compose -f docker-compose.cloud.yml exec app node cloud/admin.js appareils afrolounge
docker compose -f docker-compose.cloud.yml exec app node cloud/admin.js revoquer afrolounge <id-appareil>   # PC volé ou remplacé
```
Un PC révoqué est refusé et l'affiche clairement ; ses données locales restent intactes.

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
- La caisse **web** (navigateur) n'a pas de mode hors-ligne : sans Internet, c'est la version Windows liée qui assure le travail.
- **Stock et ventes des deux côtés en même temps** : si le même article est vendu sur le PC (hors-ligne) ET sur le web pendant la coupure, la quantité en stock du PC l'emporte (les ventes, elles, sont toutes conservées). Pour un stock toujours exact, vendre depuis un seul côté à la fois, ou recalculer le stock à partir des mouvements (évolution possible).
- Le serveur tourne sur **une seule instance** (pas de répartition de charge) : très largement suffisant pour des dizaines
  d'établissements, mais à revoir au-delà.

## Tests

`npm install && npm run cloud:test` — 60 vérifications (accès, sessions, isolation, droits, temps réel, import…).
`npm run cloud:test:sync` — 34 vérifications de la synchronisation PC ↔ web (fusion, coupure d'Internet, comptes, appareils révoqués…).
