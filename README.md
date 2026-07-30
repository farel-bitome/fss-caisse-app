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
