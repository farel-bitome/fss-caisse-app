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

## Import / vidage du catalogue d'articles

Dans **Articles → Fichier Articles**, deux nouveaux boutons :

- **📥 Importer** : ouvre une fenêtre pour importer une liste d'articles depuis un
  fichier CSV (ou en collant directement le texte). Format des colonnes :
  `Référence,Nom,Catégorie,Unité,Prix vente,Prix achat,Stock,Stock min,Emoji,TVA`
  — seuls Nom, Catégorie et Prix vente sont obligatoires. Une case à cocher permet
  de **remplacer** tout le catalogue existant, ou d'**ajouter** les nouveaux
  articles à la suite de ceux déjà présents.
- **🗑️ Vider tout** : supprime tous les articles du catalogue (avec confirmation),
  pour repartir de zéro — via import ou saisie manuelle ensuite.

**Testé** : le parseur CSV gère correctement les en-têtes, les champs entre
guillemets, et ignore automatiquement les lignes invalides (nom, catégorie ou
prix manquant).

Ces deux actions sont synchronisées en temps réel sur tous les postes, comme le
reste de l'application.

## Restriction serveur/serveuse : plus d'accès à l'addition

Les comptes "serveur uniquement" ne pouvaient déjà pas encaisser (Espèces/Carte/
Airtel Money étaient bloqués), mais pouvaient encore imprimer l'aperçu de
l'addition (bouton 🧾 dans la barre "Commandes en attente"). C'est corrigé : ce
bouton est maintenant masqué pour ces comptes, avec une double sécurité (le
bouton disparaît de l'affichage, et la fonction elle-même refuse l'action si
jamais elle était déclenchée autrement).

## Impression cuisine désactivée — un seul ticket, au paiement

Suite à votre retour, l'impression automatique du bon de commande cuisine (au
moment d'envoyer une commande) a été **désactivée**. Désormais, une seule
impression a lieu : le **ticket de caisse final**, en 2 exemplaires, au moment
du paiement.

Le suivi "Commandes en attente" continue de fonctionner normalement pour
organiser le service (envoyer, reprendre, payer) — seule l'impression
automatique associée à l'envoi a été retirée.

Si vous souhaitez un jour la réactiver, tout le code reste en place (juste
désactivé) — il suffira de me le redemander.

## Impression cuisine — comportement final

Après plusieurs allers-retours, voici le comportement définitif :

- **Envoyer une commande** (bouton "Envoyer"/"En attente") → le **bon de commande
  cuisine s'imprime**, comme d'origine (avec le système "envoi incrémental" qui
  ne réimprime que les nouveaux articles à chaque ajout)
- **Payer / imprimer le ticket final** → **seul le ticket de caisse s'imprime**,
  en 2 exemplaires — le bon de commande cuisine ne ressort jamais à ce moment,
  car ces deux impressions sont deux mécanismes entièrement séparés dans le code
  (payer n'appelle jamais la fonction d'impression du bon de commande)

## Export CSV — choix de l'emplacement à l'enregistrement

Le bouton **⬇️ Export** (Articles, Clients, Rapports, etc.) ouvre maintenant une
véritable boîte de dialogue Windows **"Enregistrer sous"**, pour choisir
exactement où enregistrer le fichier CSV — au lieu d'un téléchargement
automatique dans le dossier par défaut.

## Bon de commande qui sortait avant le ticket de caisse — cause trouvée et corrigée

Après plusieurs vérifications infructueuses des chemins évidents (paiement,
impression du reçu), la vraie cause était **un troisième mécanisme d'impression
automatique**, séparé de tout le reste : à chaque vente finalisée, le serveur
imprimait automatiquement un document intitulé "🧾 BON DE COMMANDE"
(`imprimerTicketCommande`), déclenché par la synchronisation dès qu'une nouvelle
transaction apparaissait — indépendamment du ticket de caisse habituel.

C'est ce mécanisme qui sortait juste avant le vrai ticket de caisse (l'impression
automatique, quasi instantanée via la synchronisation, sortait avant que vous
n'ayez cliqué manuellement sur "Imprimer" pour le reçu).

**Ce mécanisme a été retiré.** Comportement final :
- **Envoyer une commande** → bon de commande cuisine imprimé (normal)
- **Payer** → seul le ticket de caisse s'imprime, en 2 exemplaires — plus aucune
  impression automatique parasite

## Nombre de tickets mémorisé + coupe papier entre chaque exemplaire

Le nombre de tickets choisi (Paiement → +/−) est maintenant **mémorisé** d'une
vente à l'autre (et même après avoir fermé et rouvert l'application) — plus
besoin de le régler à chaque paiement.

De plus, un saut de page est inséré entre chaque exemplaire imprimé, ce qui
déclenche la **coupe automatique du papier** entre chaque ticket sur la plupart
des imprimantes thermiques (comportement standard des pilotes Windows pour ce
type d'imprimante). Aucune coupe/page vide superflue après le tout dernier
exemplaire.

## Nombre de tickets — mémorisé, avec coupure entre chaque exemplaire

Le nombre de tickets choisi (Paiement → sélecteur −/+) est maintenant **mémorisé**
sur ce PC (via localStorage) — il ne repart plus à 1 à chaque nouvelle vente,
il garde le dernier choix.

Chaque exemplaire est maintenant séparé par un **saut de page forcé**
(`page-break-after`), ce qui déclenche une **coupure papier** entre chaque ticket
sur la plupart des imprimantes thermiques (à condition que la coupe automatique
soit activée dans les paramètres du pilote d'imprimante Windows — généralement le
cas par défaut).

## Permissions séparées : Réimpression et Annulation de tickets

Dans **Utilisateurs → Droits d'accès**, la case combinée "🖨️ Réimpression /
Annulation tickets" est maintenant **deux cases distinctes** :
- 🖨️ **Réimpression tickets**
- 🗑️ **Annulation tickets**

Un compte peut donc avoir l'une sans l'autre (ex : autoriser à réimprimer un
ticket perdu, mais pas à annuler des ventes).

**Comptes déjà configurés** : la première fois que vous ouvrez les droits d'accès
d'un compte qui avait l'ancienne permission combinée, les deux nouvelles cases
apparaissent cochées automatiquement (pour ne rien changer à ce qu'il pouvait déjà
faire) — vous pouvez ensuite décocher l'une des deux si besoin, puis Enregistrer.

## Bug corrigé : catégories/articles qui disparaissaient sur un poste client

**Cause trouvée** : au tout premier chargement de l'application sur un poste
client, il existait une petite fenêtre de temps (plus large si le réseau est un
peu lent) pendant laquelle l'app pouvait renvoyer vers le serveur ses données
locales par défaut — celles intégrées dans le fichier avant toute
synchronisation — **avant** d'avoir reçu les vraies données. Si une action se
produisait pendant cette fenêtre (même un clic anodin), ça écrasait
silencieusement le vrai catalogue enregistré sur le serveur pour **tout le
monde**, jusqu'à ce qu'un redémarrage force une resynchronisation propre.

**Corrigé** : un verrou empêche désormais tout envoi vers le serveur tant que ce
poste n'a pas reçu au moins une fois les vraies données. Ce n'est qu'une fraction
de seconde au démarrage, donc ça ne change rien à l'usage normal — ça bloque
uniquement le scénario qui causait ce bug.

## Bouton "Exporter" (Sauvegarde) — enfin fonctionnel

Ce bouton n'était en réalité qu'un texte de test (`toast('Export en cours...')`)
qui ne faisait jamais rien. Il exporte maintenant réellement **toutes les
données de l'application** (articles, clients, ventes, personnel, tout) dans un
fichier `.json`, avec la boîte de dialogue **"Enregistrer sous"** pour choisir
l'emplacement.

## Sauvegarde / Restauration / Historique — désormais réels

Toute la section **Paramètres → Sauvegarde** était en réalité un décor (données
fictives, boutons sans effet). Elle est maintenant entièrement fonctionnelle :

- **💾 Sauvegarder** : crée immédiatement une sauvegarde complète (toutes les
  données) sur ce PC
- **🔄 Restaurer** : ouvre un sélecteur de fichier pour restaurer une sauvegarde
  externe (ex. exportée précédemment, ou copiée depuis un autre PC) —
  remplace toutes les données actuelles, sur tous les postes connectés
  (confirmation obligatoire avant d'agir, action irréversible)
- **⬇️ Exporter** : (déjà corrigé précédemment) exporte vers un fichier de votre choix
- **Historique** : liste réelle des sauvegardes déjà effectuées sur ce PC (taille
  réelle, date réelle, type Auto/Manuel), avec un bouton "Restaurer" par ligne

**Sauvegarde automatique** : le poste Serveur crée automatiquement une
sauvegarde toutes les 6 heures (uniquement lui, pour éviter les doublons entre
postes), conservées dans un dossier dédié sur ce PC. Les 60 sauvegardes les plus
récentes sont conservées, les plus anciennes sont supprimées automatiquement.

**Testé avant envoi** : logique de purge vérifiée avec de vrais fichiers (8
sauvegardes créées, limite à 5 pour le test → les 5 plus récentes correctement
conservées, les plus anciennes supprimées), lecture de fichier vérifiée.

## Ticket de clôture (80mm) — police agrandie + détail des ventes

Le ticket imprimé lors d'une clôture de caisse :
- Police **plus grande et en gras** partout (titres encore plus marqués)
- Nouvelle section **"DÉTAIL DES VENTES"** : la quantité totale vendue de chaque
  article (toutes boissons/plats confondus) sur la période clôturée, triée du
  plus vendu au moins vendu, avec le montant total par article

## Impression automatique à chaque prélèvement

Chaque fois qu'un prélèvement est enregistré (Clôture → Prélèvements), un petit
ticket 80mm s'imprime désormais automatiquement, avec : caisse, heure, caissier,
motif, montant prélevé et solde restant.

## Bilan de clôture — impression automatique

En plus des tickets de prélèvement (déjà auto-imprimés individuellement), le
**bilan de clôture complet** (ticket 80mm avec récapitulatif, détail des ventes,
solde) s'imprime maintenant **automatiquement** dès que la clôture est validée
— plus besoin de cliquer sur le bouton "80mm" après coup.

## Ticket de clôture depuis un téléphone ou un poste client

Quand la clôture est validée **depuis le poste Serveur lui-même**, le ticket
s'imprime directement, comme avant.

Quand elle est validée **depuis un téléphone ou un poste client** (aucune
imprimante physique connectée à cet appareil), la demande est désormais transmise
automatiquement au poste Serveur — qui imprime le bilan complet sur sa propre
imprimante, garantissant qu'un ticket sort bien à chaque clôture, peu importe
l'appareil utilisé pour la valider. Le ticket indique aussi depuis quel poste
(et quel utilisateur) la clôture a été déclenchée.

**Testé** : la logique de détection des nouvelles demandes de clôture a été
vérifiée (aucune impression au premier chargement, chaque demande imprimée une
seule fois, pas de doublon en cas de resynchronisation).

## Ticket de prélèvement — détail des ventes ajouté

Le ticket imprimé à chaque prélèvement affiche maintenant, comme celui de la
clôture, la section **"DÉTAIL DES VENTES"** avec tous les articles vendus et
leurs quantités depuis la dernière clôture.

## Compte Serveur/Serveuse — plus besoin de préciser son propre nom

Quand un compte "serveur uniquement" se connecte, le champ **Serveur** de la
Caisse se remplit automatiquement avec son propre nom et se verrouille — il n'a
plus qu'à choisir la **table**, comme demandé. (Les autres comptes — admin,
caissier — gardent le champ Serveur modifiable normalement, utile s'ils
enregistrent une commande pour quelqu'un d'autre.)

## Cumul des articles au ticket de clôture — rendu plus robuste

Le cumul par article (ex : 10 bières vendues sur plusieurs ventes séparées →
"10x Regab" avec le total) fonctionnait déjà, mais était fragile : une seule
ligne de vente avec un prix manquant ou mal formé dans l'historique pouvait
casser le total affiché pour tout cet article (tout en gardant la bonne
quantité). Rendu robuste — un éventuel article incomplet n'affecte plus les
autres lignes ni le total.

**Testé** : simulation avec 4 ventes séparées contenant du Regab (dont une avec
une ligne incomplète) → cumul correct de 10x Regab, total 25 000 FCFA.

## Nouvelle permission : Retirer article (factures / commandes en attente)

Ajoutée dans **Utilisateurs → Droits d'accès** : **➖ Retirer article (factures /
commandes en attente)**. Sans cette autorisation, la petite croix "✕" qui retire
un article du ticket en cours (que ce soit une facture en préparation ou une
commande en attente reprise) est masquée et l'action est bloquée si jamais
déclenchée autrement.

Comme pour les autres droits, les comptes Super Admin et accès complet
l'ont automatiquement — à cocher manuellement pour les autres comptes qui en
ont besoin.

## Correction : ticket de clôture qui ne sortait pas depuis un téléphone

**Cause trouvée** : l'impression du bilan de clôture (côté Serveur, quand elle
est déclenchée depuis un téléphone ou un poste client) utilisait une fenêtre
popup + `window.print()` classique. Ce mécanisme fonctionne bien pour un clic
direct de l'utilisateur, mais **échoue silencieusement** quand il est déclenché
automatiquement (ici, via l'événement réseau reçu suite à une clôture lancée
ailleurs) — ce n'est pas un vrai clic de l'utilisateur sur ce poste précis.

Le bon de commande cuisine, lui, n'avait jamais ce problème car il utilisait
déjà un mécanisme différent et fiable (`imprimerSilencieux`, impression Electron
native invisible, sans fenêtre popup).

**Corrigé** : le ticket de clôture utilise maintenant ce même mécanisme fiable.
Une trace d'erreur apparaît aussi désormais dans la console développeur en cas
de nouvel échec, pour faciliter le diagnostic si le problème venait à se
reproduire pour une autre raison.

## Clôture depuis téléphone — envoi immédiat (sans délai)

Autre correction possible pour ce même problème : l'envoi vers le serveur avait
un petit délai (150ms) avant de partir réellement, pour éviter de spammer le
réseau sur les actions fréquentes. Sur un téléphone, si l'écran se verrouille ou
que le navigateur passe en arrière-plan juste après avoir confirmé la clôture,
ce délai peut ne jamais aboutir (les navigateurs mobiles suspendent souvent le
JavaScript des onglets en arrière-plan).

La clôture utilise maintenant un envoi **immédiat, sans délai**, pour ce cas
précis (action rare et critique, contrairement aux clics fréquents en caisse où
le délai reste utile).

**Si le problème persiste après ce correctif**, ouvrez la console développeur
sur le poste **Serveur** (Ctrl+Maj+I dans l'app) pendant qu'un téléphone fait une
clôture — une erreur détaillée s'affichera maintenant si l'impression échoue
encore, ce qui permettra d'identifier précisément la cause restante.

## Clôture — fusionnée avec le circuit des bons de commande

Sur votre demande, la clôture n'utilise plus un mécanisme séparé : elle passe
maintenant par **exactement le même tableau synchronisé et le même écouteur**
que les bons de commande cuisine (dont vous confirmez qu'ils fonctionnent bien
depuis un téléphone) — juste avec une étiquette `type:'cloture'` pour distinguer
laquelle des deux fonctions d'impression appeler. Aucune différence de circuit
ne subsiste entre les deux.

**Testé** : simulation de l'aiguillage avec un mélange de bons de commande et
d'un ticket de clôture dans le même tableau — chacun déclenche bien la bonne
fonction d'impression.

## Ticket de clôture et prélèvement — police réduite, plus de débordement

Après l'avoir agrandie précédemment, la police du ticket de clôture (et du
ticket de prélèvement, qui affiche le même détail des ventes) était devenue trop
grande pour la largeur du papier 80mm, risquant de faire déborder certains
montants. Réduite à une taille intermédiaire (toujours en gras, plus lisible que
l'original, mais qui tient correctement sur le papier) :

- Les **montants** ne se coupent/retournent jamais à la ligne (`white-space:nowrap`)
- Les **noms d'articles longs** peuvent revenir à la ligne proprement si besoin,
  sans pousser le montant hors du ticket




## Diviser l'addition — au bon endroit cette fois

Corrigé définitivement : l'option apparaît maintenant exactement là où vous la
cherchiez, sur le bouton **🧾** de "Commandes en attente" (l'aperçu de
l'addition, avant paiement).

En cliquant sur 🧾, une petite fenêtre s'ouvre désormais et demande "Combien de
parts ?" avant d'imprimer :
- **1 part** (par défaut) : aperçu classique, comme avant
- **Plus de 1** : imprime autant de tickets que de parts choisies, chacun
  affichant sa portion du total (ex : 321 000 F ÷ 4 = 80 250 F par ticket)

**Testé** : calcul de répartition vérifié avec les mêmes montants que votre
capture d'écran (321 000 FCFA ÷ 4 parts = 80 250 FCFA chacune, total exact).

## Bulletin de paie — format A4

Les bulletins de paie s'impriment maintenant en **A4** (au lieu du format ticket
80mm), avec une présentation professionnelle : en-tête établissement, bloc
informations employé, tableau détaillé des retenues, net à payer mis en
évidence, et zones de signature employeur/employé.

## Avertissement adresse réseau invalide (169.254.x.x)

Quand le PC Serveur détecte une adresse commençant par **169.254.** (adresse de
secours attribuée automatiquement par Windows quand il n'arrive à joindre
aucun routeur), un message d'avertissement s'affiche maintenant clairement sur
l'écran "Adresse du serveur" — au lieu de montrer cette adresse comme si elle
était utilisable.

**Si vous voyez ce message** : ce n'est pas un bug de l'application — ça veut
dire que ce PC n'est en réalité pas connecté au réseau (câble Ethernet
débranché, ou Wi-Fi déconnecté/mal configuré). Vérifiez la connexion réseau du
PC Serveur (icône réseau dans la barre des tâches Windows), reconnectez-le, puis
cliquez sur "↺ Revenir à la détection automatique".

## Plantages — rechargement désormais automatique

Avant, quand l'application plantait ou se figeait (écran blanc/gelé), il
fallait recharger manuellement via Alt → Recharger. C'est corrigé :

- **Plantage du processus de rendu** (crash) → rechargement automatique
  immédiat (avec une petite pause croissante si ça plante plusieurs fois
  d'affilée, pour éviter une boucle infinie)
- **Application figée** (JavaScript bloqué, ne répond plus) → si ça persiste
  plus de 8 secondes, rechargement automatique aussi

Vous ne devriez plus avoir besoin d'intervenir manuellement dans ces cas. Si
l'app plante encore malgré ça, ouvrez la console développeur (touche F12) pour
voir s'il y a un message d'erreur, qui aidera à identifier la vraie cause.

## Trois corrections importantes

**1. Droits d'accès enfin vraiment indépendants** — trouvé et corrigé le vrai
bug : la "migration" que j'avais ajoutée pour la séparation Réimpression/
Annulation se relançait à *chaque* ouverture de la fiche d'un compte (pas
qu'une seule fois comme prévu), recochant "Annulation" à chaque fois que
"Réimpression" était cochée. Complètement retirée — les deux cases sont
maintenant 100% indépendantes, sans aucun couplage automatique.

**2. TVA entièrement retirée** — l'onglet "TVA & Prix" a disparu de
Paramètres, la TVA est désactivée en permanence dans le calcul (impossible à
réactiver), et toutes les lignes "Sous-total HT" / "TVA X%" / "CA HT" ont été
retirées de la Caisse et du rapport de clôture. Il ne reste plus qu'un
"TOTAL" simple partout.

**3. Gestion du seuil d'alerte par catégorie — désormais activable/
désactivable** — nouvelle case à cocher "Activer la gestion du seuil d'alerte
stock par catégorie" en haut de Paramètres → Catégories. Désactivée par
défaut : la colonne et le bouton "Appliquer aux articles" restent masqués tant
qu'elle n'est pas cochée.

## Import/Export Articles — vrai format Excel (.xlsx)

Le bouton **⬇️ Export Excel** (Articles) génère maintenant un **vrai fichier
.xlsx** — pas du CSV — directement ouvrable dans Microsoft Excel, LibreOffice
Calc, Google Sheets, etc. avec les bonnes colonnes (texte/nombres correctement
typés).

Le bouton **📥 Importer** accepte maintenant aussi bien un fichier **.xlsx**
qu'un fichier CSV — l'app détecte automatiquement le format.

Tout est fait en JavaScript pur, **sans aucune dépendance ni connexion
internet nécessaire** (aucune bibliothèque externe téléchargée) — ça fonctionne
même hors ligne, comme le reste de l'application.

**Testé en profondeur avant l'envoi** :
- Cycle complet écriture → lecture avec accents, guillemets, apostrophes,
  emojis et nombres — vérifié bit par bit
- Fichier généré validé avec **Python zipfile** (intégrité ZIP confirmée) et
  **openpyxl** (bibliothèque Excel dédiée — ouverture et lecture des données
  réussies, avec les bons types texte/nombre)
- Lecture d'un fichier compressé en DEFLATE (comme le ferait un vrai export
  Excel) vérifiée et fonctionnelle
- Test de bout en bout avec le code réellement intégré dans le fichier livré
  (pas juste un prototype séparé)

## Correction : licence qui redemandait une réactivation, adresse qui changeait

**Cause trouvée** : l'identifiant unique de chaque PC incluait l'adresse MAC de
la carte Wi-Fi. Or Windows **change automatiquement cette adresse** par défaut
(fonctionnalité de confidentialité "Adresse matérielle aléatoire", activée par
défaut sur la plupart des PC récents) — ce qui changeait l'identifiant du PC de
temps en temps, invalidant la licence déjà activée.

**Corrigé** : l'identifiant utilise maintenant le **GUID Windows**
(`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`), un identifiant unique
attribué une seule fois à l'installation de Windows, qui ne change **jamais**
tant que Windows n'est pas réinstallé — ni avec le Wi-Fi, ni au redémarrage, ni
en changeant de réseau.

⚠️ Sur demande, **aucune compatibilité n'a été gardée** avec l'ancien calcul —
les PC déjà activés avant ce correctif devront demander une **nouvelle clé**
(nouvel identifiant affiché sur leur écran d'activation).

**Testé avant envoi** : génération du nouvel identifiant stable + activation
réussie sur un système sans registre Windows (repli automatique testé).

## Suppression des bons de commande (Achats)

Ajouté un bouton **🗑️** dans "Achats → Bons de Commande" (et "Commandes
Fournisseurs") pour supprimer un bon de commande, avec confirmation avant
suppression. Synchronisé en temps réel comme le reste de l'application.

## Changement de version visible

- Le numéro de version sous le logo est maintenant un peu plus lisible
  (moins transparent, en bleu)
- **Nouveau** : quand l'application démarre avec une version différente de la
  dernière fois qu'elle a été ouverte sur ce PC, un message **"🆕 Application
  mise à jour : vX.X.X (build N)"** s'affiche automatiquement — vous savez
  immédiatement qu'une mise à jour vient d'être installée.

## Correction : version toujours affichée "v1.7.1" sous l'écran de connexion

**Cause trouvée** : il y avait en fait **deux affichages de version séparés** —
celui sous le logo (mis à jour automatiquement à chaque compilation) et celui
sous l'écran de connexion, qui était codé en dur et que je n'avais jamais mis à
jour au même rythme. D'où le décalage.

**Corrigé définitivement** : le processus de compilation automatique met
maintenant à jour **les deux affichages en même temps**, à chaque build — plus
jamais besoin d'y penser manuellement, ils resteront toujours synchronisés.


## Gestion de stock par catégorie — désactivation complète

Sur votre demande, la case dans Paramètres → Catégories (renommée "Gestion de
stock") va maintenant **bien plus loin** que juste masquer une alerte. Pour une
catégorie désactivée, ses articles :

- Ne voient **plus leur stock déduit** lors des ventes
- Se vendent **sans aucune limite**, même si le stock affiché est à 0
- **N'affichent plus le chiffre de stock** en Caisse (case masquée), dans la
  liste Articles (tiret "—" à la place), ni dans la page Stock
- **N'apparaissent plus du tout** dans la page Stock (liste, alertes, ni le
  sélecteur des mouvements d'entrée/sortie/ajustement — puisqu'il n'y a plus
  rien à y gérer)

Les catégories avec la gestion de stock **activée** (par défaut) continuent de
fonctionner exactement comme avant, sans aucun changement.

**Testé** avant envoi : vente d'un article à stock=0 d'une catégorie
désactivée → autorisée et le stock reste inchangé après-vente ; vente d'un
article d'une catégorie normale → déduction correcte comme d'habitude.

## Fiche article — la case "Alerte" reflète maintenant la catégorie

Trouvé la source de la confusion : la case "Activer l'alerte de stock faible
pour cet article" ne regardait que le réglage propre à l'article, jamais celui
de sa catégorie — elle restait donc cochée même quand la gestion de stock était
désactivée pour toute la catégorie (ce qui n'avait plus aucun effet réel, mais
donnait l'impression que ce n'était pas pris en compte).

**Corrigé** : quand la catégorie de l'article a la gestion de stock
désactivée, la case apparaît maintenant **grisée et inactive**, avec une note
explicative ("Gestion de stock désactivée pour la catégorie de cet article").

## Vraie cause trouvée : liste de catégories désynchronisée des articles

**C'était la vraie explication de tout** : la liste officielle des catégories
(Paramètres → Catégories, celle où se règle la gestion de stock) était restée
l'**ancienne liste de démonstration** ("Boissons", "Bières", "Alcools"...) alors
que vos vrais articles utilisent des catégories complètement différentes
("Whisky", "Rhum", "Verre", "Bière" au singulier, etc.) depuis l'import du
menu. Aucune correspondance exacte n'était possible — désactiver "Bières" dans
Paramètres n'avait donc **aucun effet réel**, puisqu'aucun article n'a
exactement cette catégorie.

**Corrigé** : la liste officielle contient maintenant les 15 vraies catégories
utilisées par vos 119 articles. Une **migration automatique** corrige aussi ce
même problème sur votre serveur déjà en service, sans toucher au reste de vos
données (clients, ventes, personnel...).

**Testé avant envoi** : simulation de la migration avec de fausses données —
catégories correctement recalculées à partir des vrais articles, données
existantes préservées, pas de ré-exécution au second chargement.

## Ligne TVA retirée des Articles

Retiré partout où elle traînait encore dans les Articles :
- Champ "TVA (%)" du formulaire d'ajout/modification d'article
- Colonne "TVA" de la liste des Articles
- Colonne "TVA" de l'export/import Excel et CSV des articles

## Correction : la suppression de commande en attente restait possible malgré le retrait de l'accès

**Trouvé** : il n'existait **aucune permission générale** pour "supprimer une
commande en attente" applicable à un compte normal (admin, caissier...) — seul
un compte de type "serveur" avait ce contrôle, via sa propre case dédiée à sa
création. Pour tout autre type de compte, la suppression était donc **toujours
autorisée**, quoi que vous décochiez ailleurs.

**Corrigé** : nouvelle permission **🗑️ Supprimer une commande en attente**
dans Utilisateurs → Droits d'accès, qui s'applique à tous les types de comptes.
Le bouton de suppression (✕) dans "Commandes en attente" est maintenant aussi
masqué visuellement si le compte n'a pas cette permission — pas juste bloqué au
clic.

**Testé** avant envoi : vérifié les 4 cas de figure (caissière avec/sans la
permission, serveur avec/sans sa case dédiée, admin) — tous corrects.

## Connexion parfois bloquée — filet de sécurité ajouté

Je n'ai pas trouvé de cause unique et certaine (le code de synchronisation
initiale semble déjà bien protégé), mais j'ai renforcé deux points :

- Nettoyé une référence à un ancien réglage supprimé (inoffensive mais du code
  mort)
- Protégé une étape interne qui n'était pas entièrement sécurisée contre les
  erreurs

Surtout, ajouté un **filet de sécurité** : si l'écran de connexion reste
bloqué (bouton "Chargement..." qui ne devient jamais cliquable) plus de **10
secondes**, il se débloque maintenant automatiquement avec un message
d'avertissement — vous ne devriez plus jamais rester coincé sans pouvoir
entrer vos identifiants, quelle que soit la cause exacte du ralentissement.

Si ça se reproduit malgré ça, notez si un message d'avertissement apparaît
("Connexion au serveur lente...") — ça confirmera que le filet de sécurité a
bien fonctionné, et le problème vient probablement du réseau plutôt que de
l'application elle-même.

## Écran de connexion — ne bloque plus jamais

Retiré complètement le mécanisme qui pouvait faire attendre le bouton "Se
connecter" (plus de bouton désactivé, plus de délai d'attente). Il est
maintenant **toujours cliquable** dès l'apparition de l'écran. Si les données
ne sont pas encore tout à fait chargées à ce moment précis (très bref, sur un
réseau normal), un message clair invite à réessayer dans l'instant plutôt que
de bloquer quoi que ce soit.

## Enfin trouvé où la TVA persistait : les Étiquettes articles

**C'était ça** : la page "Étiquettes" (labels de prix imprimables, un par
article) affichait encore "TVA: X%" sous chaque article — c'est ce que vous
voyiez à la fois pour les articles déjà enregistrés (avec l'ancien 18%) et
pour tout nouvel article une fois ajouté (puisque cette page affiche tout le
catalogue). Retiré.

## Réduction de quantité bloquée sur une commande déjà envoyée

Le bouton **"−"** (réduire la quantité d'un article) n'avait jusqu'ici aucune
restriction. Maintenant : une fois une commande **reprise depuis "Commandes en
attente"** (donc déjà envoyée), réduire une quantité nécessite la permission
**➖ Retirer article** — l'ajout (**"+"**) reste toujours libre pour tout le
monde. Sur un ticket pas encore envoyé, aucune restriction ne s'applique (comme
avant).

**Testé** : les 4 cas de figure (avant envoi, après envoi avec/sans
autorisation, ajout toujours libre) — tous corrects.
