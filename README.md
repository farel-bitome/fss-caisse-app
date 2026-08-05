# FSS-CAISSE — Application réseau (installateur unique)

Un seul et même fichier `.exe` à installer sur **tous** les ordinateurs.
Au premier lancement, l'application demande simplement :

> 🖥️ Ordinateur Serveur — ou — 💻 Poste Client

## 🖥️ Sur l'ordinateur qui doit être le SERVEUR (1 seul)

1. Installe le `.exe` (voir plus bas comment l'obtenir)
2. Au premier lancement, choisis **"Ordinateur Serveur"**
3. Une fenêtre affiche l'adresse IP à utiliser sur les autres postes,
   par exemple : `192.168.1.24:3000`
4. L'application s'ouvre — c'est prêt, laisse-la ouverte

⚠️ Cet ordinateur doit rester **allumé** avec l'application ouverte pendant
les heures d'utilisation (les autres postes en dépendent).

## 💻 Sur TOUS LES AUTRES ordinateurs (Postes Client)

1. Installe le même `.exe`
2. Au premier lancement, choisis **"Poste Client"**
3. Entre l'adresse IP notée à l'étape précédente (ex: `192.168.1.24`), port `3000`
4. Clique **Se connecter** → c'est prêt, tout est synchronisé en temps réel

Les lancements suivants se reconnectent automatiquement, sans rien redemander.

Pour changer de rôle ou d'adresse plus tard : menu **FSS-CAISSE** en haut de
l'application.

## 📦 Comment obtenir le fichier `.exe`

Ce projet compile automatiquement le `.exe` via **GitHub Actions** :

1. Pousse ce dossier complet sur un repo GitHub (`git push`)
2. Onglet **Actions** du repo → attends la coche verte ✅
3. Télécharge l'artifact **FSS-CAISSE-windows** → dedans se trouve
   `FSS-CAISSE Setup 1.0.0.exe`
4. Ce même fichier s'installe sur **tous** les postes (serveur ou client,
   le choix se fait à l'intérieur de l'app)

## 🔐 Connexion des utilisateurs

À chaque ouverture de l'application, un écran de connexion est demandé.

**Comptes fournis par défaut :**
- **BITOME** / mot de passe `3701` → compte super-utilisateur, **ne peut jamais être supprimé**
- **admin** / mot de passe `admin` → à la première connexion, un nouveau mot de passe doit obligatoirement être défini

Une fois connecté, clique sur le badge "👤 Nom" en haut à droite pour :
- changer son propre mot de passe
- gérer les utilisateurs (ajouter, définir leurs droits d'accès, réinitialiser un mot de passe, supprimer)
- changer le logo de l'établissement (visible en grand sur l'écran de connexion, et sur les tickets)
- se déconnecter

**Droits d'accès par compte :** BITOME et admin voient tout, sans restriction.
Pour tout autre compte créé, tu choisis au moment de la création les sections
auxquelles il aura accès (Caisse, Stock, Clients, Rapports...). Modifiable à
tout moment via le bouton "🛡️ Droits" dans la liste des utilisateurs.

Les comptes utilisateurs sont partagés et synchronisés entre tous les postes,
comme le reste des données.

## 🔄 Fonctionnement

Le poste "Serveur" fait tourner un petit serveur local qui garde toutes les
données. Chaque poste "Client" s'y connecte et reçoit en direct toute vente,
changement de stock, client ajouté, etc.

## 📁 Où sont les données ?

Sur l'ordinateur serveur uniquement, dans le dossier de données de
l'application (créé et géré automatiquement, aucune manipulation nécessaire).

## ❓ Problèmes fréquents

**"Connexion au serveur impossible" sur un poste client**
→ Vérifie que l'ordinateur serveur est allumé avec l'application ouverte,
que ce poste est sur le même réseau WiFi/câble, et que l'adresse IP est bonne.

**L'adresse IP du serveur a changé**
→ Sur chaque poste client : menu **FSS-CAISSE → Changer l'adresse du serveur**.

**Je me suis trompé de rôle (Serveur/Client) à l'installation**
→ Menu **FSS-CAISSE → Changer de rôle (Serveur / Client)**.

## 📁 Structure du projet

```
fss-caisse-app/
├── main.js               ← logique principale (choix Serveur/Client, connexion)
├── preload.js
├── embedded-server.js     ← serveur intégré (utilisé si rôle = Serveur)
├── choice.html            ← écran de choix au 1er lancement
├── client.html            ← écran de saisie de l'IP (mode Client)
├── app/
│   ├── index.html         ← l'interface de caisse
│   ├── auth.js             ← écran de connexion + gestion des utilisateurs
│   └── network.js         ← synchronisation temps réel
├── server-data/
│   └── data.default.json  ← données de démarrage
├── package.json
├── .github/workflows/build.yml  ← compile automatiquement le .exe
└── README.md
```

## Licence — protection anti-copie

Depuis cette mise à jour, chaque PC (Serveur **et** Client) doit être **activé**
individuellement avant de pouvoir utiliser l'application — copier l'installation
sur un autre PC ne fonctionne pas sans une nouvelle clé.

Ce système est **compatible avec vos générateurs de licence existants**
(Windows, HTML, Android construits pour FSS-CAISSE-SALON) — une clé générée avec
l'un fonctionne pour n'importe lequel de vos logiciels, tant que vous utilisez le
bon identifiant machine.

**Pour activer un PC :**

1. Au premier lancement (ou via le menu **FSS-CAISSE → Licence / Activation**),
   l'écran affiche l'**identifiant de ce PC**
2. Le client vous communique cet identifiant
3. Générez la clé avec l'outil de votre choix (`node build/generate-license.js
   <identifiant>` sur FSS-CAISSE-SALON, l'outil HTML, ou l'app Android)
4. Le client saisit la clé reçue — l'application démarre normalement ensuite

⚠️ Ne partagez jamais le contenu de `licensing.js` (la clé secrète qu'il contient)
avec vos clients.

## Personnel — Pointage et Paie

Nouvel onglet **🧑‍🍳 Personnel** dans le menu principal, avec trois sections :

- **Employés** : liste du personnel avec poste et salaire de base mensuel fixé
- **Pointage** : arrivée/départ en un clic pour chaque employé actif (avec saisie
  manuelle possible), historique du jour
- **Paie** : calcul automatique du net à payer par employé, mois par mois, à partir
  du salaire de base et des ajustements saisis (absences, retard, sanction,
  accompte, produits/facture) — imprimable via le bouton "🖨️ État de paie"

Ces données sont **synchronisées en temps réel** entre tous les postes (Serveur et
Clients), comme le reste de l'application — pas besoin de configuration
supplémentaire.

**Calcul du net à payer :**
```
Salaire / jour  = Salaire brut / 30
Salaire / heure = Salaire brut / 240
Net à payer = Salaire brut − (absences × salaire/jour) − (retard × salaire/heure)
              − produits/facture − sanction − accompte
```

## Bons de commande — envoi incrémental (pas de réimpression)

Quand un serveur/serveuse ajoute des articles à une commande déjà envoyée (via le
bouton **▶ Reprendre** dans "Commandes en attente"), seuls les **nouveaux
articles/quantités** s'impriment au prochain envoi — pas ceux déjà envoyés.

Cette mécanique existait déjà dans le fichier reçu, mais reposait sur une variable
temporaire en mémoire pouvant potentiellement se perdre selon le déroulé exact des
actions. Je l'ai rendue plus robuste : ce qui a été "déjà envoyé" est maintenant
enregistré directement sur la commande elle-même (`sentQty`), et non plus dans une
variable annexe — ça élimine tout risque de perte de cet état.

**Testé** (calcul isolé, 3 envois successifs sur la même commande) :
- Envoi 1 : 2 Bières + 1 Frites → tout s'imprime (nouvelle commande)
- Envoi 2 : ajout de 1 Bière + 1 Coca → seuls ces 2 articles s'impriment
- Envoi 3 : ajout de 2 Desserts → seul cet article s'imprime

Si le problème persiste malgré cette correction, dites-le-moi avec le détail exact
de ce qui se passe (idéalement en testant sur un seul poste/une seule imprimante
pour écarter toute question de synchronisation réseau).

## TVA — réglage désormais permanent

Le bouton d'activation/désactivation de la TVA (Paramètres → TVA & Prix) ne
sauvegardait jamais son état : à chaque rechargement de la page, il repartait sur
"activée" par défaut, même après une désactivation explicite. C'est corrigé —
le réglage (activé/désactivé + taux) est maintenant enregistré avec les autres
paramètres de l'établissement et restauré correctement à chaque démarrage.

## Ticket de caisse en double exemplaire

Le ticket de caisse final (`imprimerRecu`) imprime maintenant **automatiquement
en 2 exemplaires** — le même contenu est répété deux fois dans le même document
imprimé (séparés par une ligne de coupe), donc un seul geste d'impression sort
directement les deux tickets.

## Bon de commande au ticket final — non reproduit dans le code

J'ai vérifié en détail : dans le code actuel, la fonction qui imprime le ticket
final de paiement (`imprimerRecu`) n'appelle à aucun moment la fonction qui imprime
le bon de commande cuisine (`imprimerTicketAttente`) — ce sont deux mécanismes
indépendants, l'un ne déclenche pas l'autre. Je n'ai donc rien changé sur ce point
faute d'avoir pu identifier où ce lien se ferait dans le code fourni.

Si le problème persiste malgré cette vérification, décrivez-moi précisément les
étapes suivies (Envoyer → Reprendre → Payer ? ou un autre enchaînement ?) pour
que je puisse localiser exactement où ça se déclenche.

## Contrats du personnel (types + alertes) et archives des bulletins

**Types de contrat** (Personnel → Employés → ✏️) :
- **1 mois renouvelable** — avec une date de prochain renouvellement (proposée
  automatiquement à +1 mois, modifiable)
- **CDD** — avec une date de fin
- **CDI** — sans échéance

**Alertes** : un bandeau apparaît en haut de l'onglet Employés dès qu'un contrat
"1 mois renouvelable" doit être renouvelé sous 7 jours (ou est déjà dépassé), ou
qu'un CDD arrive à échéance sous 15 jours — avec un bouton "Renouveler" direct pour
les contrats mensuels. Un badge 🟠/🔴 apparaît aussi dans la liste, à côté du type
de contrat de l'employé concerné.

**Archives des bulletins** : nouveau sous-onglet **🗂️ Archives** (Personnel), qui
liste tous les bulletins de paie déjà calculés, filtrables par employé, avec un
bouton pour réimprimer n'importe quel bulletin passé à tout moment.

**Testé** : la logique de calcul des jours restants/dépassés a été vérifiée
isolément sur plusieurs cas (renouvellement proche, dépassé, CDD proche de la fin,
CDI sans alerte) — tous corrects.
