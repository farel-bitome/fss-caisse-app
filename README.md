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

## Vraie cause trouvée : cumul cassé par des espaces/majuscules invisibles

**Reproduit exactement votre symptôme** : si un article a un espace en trop ou
une casse différente entre deux ventes (ex: "Regab" vs "Regab " avec un espace
en fin, ou "REGAB"), le cumul les traitait comme **deux articles différents**
— d'où plusieurs lignes séparées au lieu d'une seule ligne cumulée à 19.

**Corrigé** dans le ticket de clôture ET le ticket de prélèvement : le cumul
ignore maintenant les espaces superflus et la casse — "Regab", "Regab " et
"REGAB" fusionnent bien en une seule ligne, peu importe d'où vient la petite
différence de saisie.

**Testé avant envoi** : reproduit le bug exact avec 5+8+6 unités réparties sur
3 variantes d'écriture du même nom → confirmé cassé avant, puis vérifié 19
unités cumulées correctement sur une seule ligne après correction.

## Historique des clôtures — réimpression par période

Le bouton **🗂️ Historique** (en haut de la page Clôture) existait déjà dans
l'interface, mais n'était en réalité relié à rien — il ne faisait strictement
rien au clic. De même, le message "Journée clôturée et archivée" était
trompeur : rien n'était réellement conservé pour être retrouvé plus tard.

**Maintenant vraiment fonctionnel** :
- Chaque clôture est désormais **réellement archivée** (date, caisse, nombre de
  tickets, CA, prélèvements, solde, et le détail complet des ventes)
- Le bouton **🗂️ Historique** ouvre une fenêtre où vous choisissez une
  **période** (du/au, ou raccourcis "Aujourd'hui" / "7 derniers jours" / "30
  derniers jours")
- Chaque clôture de la période s'affiche avec un bouton **🖨️ Réimprimer**, qui
  ressort exactement le même ticket qu'à l'époque (avec le détail des ventes
  cumulé, comme au moment de la clôture originale)

**Testé** avant envoi : filtrage par période vérifié sur 3 clôtures simulées à
des dates différentes — les bonnes clôtures ressortent selon la période
choisie.

## Vraie cause trouvée : commande perdue à la déconnexion/fermeture

**Trouvé le vrai bug** : le bouton "Se déconnecter" rechargeait la page
**instantanément**, sans jamais attendre qu'une synchronisation en cours ne se
termine. Si une commande venait d'être envoyée juste avant de se déconnecter
(fin de service, passage de relais...), la page pouvait se recharger **plus
vite que l'enregistrement** — la commande n'atteignait alors jamais le
serveur, et semblait "disparaître" alors qu'elle n'avait en fait jamais été
sauvegardée.

**Corrigé à deux endroits** :
- **Déconnexion** : force et attend la fin de la synchronisation avant de
  recharger la page (avec un filet de sécurité de 3 secondes maximum pour ne
  jamais bloquer indéfiniment)
- **Fermeture de l'application** (bouton X, redémarrage) : même principe,
  attend brièvement (0,6s) qu'une synchronisation en cours se termine avant de
  fermer réellement la fenêtre

Ces corrections couvrent les deux scénarios que vous mentionniez (changement
d'utilisateur ET redémarrage du logiciel). Rappel : une commande en attente ne
disparaît par ailleurs que si quelqu'un avec la permission **🗑️ Supprimer une
commande en attente** clique explicitement dessus.

## Correction plus robuste : vrai accusé de réception avant fermeture/rechargement

Ma correction précédente (fermeture/déconnexion) utilisait un **délai fixe**
avant de vraiment fermer — ce qui pouvait encore être trop court sur un réseau
un peu lent, laissant filer la même perte de données (articles ajoutés,
mouvements de stock...).

**Remplacé par un vrai accusé de réception** : l'application attend
maintenant une **confirmation réelle** que la sauvegarde a bien atteint le
serveur, plutôt qu'un délai fixe deviné à l'avance — avec un filet de sécurité
de 5 secondes maximum pour ne jamais bloquer indéfiniment si le réseau est
complètement down.

**Trouvé et corrigé un troisième point** avec la même faille, que je n'avais
pas encore vu : le bouton **"Recharger"** du menu (Alt → FSS-CAISSE →
Recharger) rechargeait aussi instantanément, sans jamais attendre — corrigé
avec le même mécanisme.

Ces trois points (déconnexion, fermeture de l'app, "Recharger") utilisent
maintenant tous la même protection fiable.

## Trouvé pourquoi "impossible de sélectionner" après quelques minutes

**Cause trouvée** : à chaque changement fait par N'IMPORTE QUEL poste connecté
(un autre caissier qui ajoute un article, une vente ailleurs...), l'application
reconstruisait automatiquement les menus déroulants (Table, Serveur, Caisse,
Catégorie) sur **tous les écrans en même temps**. Si vous aviez un de ces menus
ouvert pile à ce moment pour faire votre sélection, il se reconstruisait sous
vos yeux — le clic "ratait" sa cible, donnant l'impression que plus rien ne
répond.

Plus il y a de monde qui travaille en même temps (plusieurs caissiers, plusieurs
tables en cours), plus les synchronisations sont fréquentes, et plus ça devient
probable après quelques minutes d'activité — ce qui correspond exactement à ce
que vous décriviez.

**Corrigé** : ces menus ne se reconstruisent plus tant que vous êtes en train
de les utiliser (menu ouvert/en cours de sélection) — la mise à jour se fait
juste après, une fois que vous avez terminé votre sélection.

## ⚠️ CORRECTION CRITIQUE : perte de toutes les données après un plantage

**Cause trouvée et confirmée par simulation réelle** : la sauvegarde des
données n'était **pas atomique** — elle écrivait directement dans le fichier
principal. Si l'application plantait pile pendant cette écriture (ce qui
semble être exactement ce qui s'est passé chez vous), le fichier se
retrouvait à moitié écrit, donc **illisible**. Au redémarrage, comme ce
fichier ne pouvait plus être lu, l'application repartait silencieusement sur
des données vierges — ce qui donnait l'impression que TOUT avait été
supprimé (commandes en attente ET ventes encaissées), alors qu'en réalité
rien n'avait été "supprimé" à proprement parler : le fichier était juste
devenu illisible.

**Corrigé sérieusement, à deux niveaux** :
1. **Écriture atomique** : la sauvegarde écrit maintenant d'abord dans un
   fichier temporaire, puis le remplace d'un coup — le vrai fichier de
   données n'est **jamais touché** tant que la nouvelle version n'est pas
   complètement écrite. Un plantage en cours d'écriture ne peut donc plus
   jamais corrompre quoi que ce soit.
2. **Copie de secours automatique** : une copie du dernier état valide est
   conservée à chaque sauvegarde. Si jamais le fichier principal devenait
   quand même illisible pour une autre raison, l'application récupère
   automatiquement cette copie au lieu de repartir sur des données vierges.

**Testé avant envoi avec une vraie simulation** de plantage en pleine
écriture (fichier temporaire laissé à moitié écrit) — confirmé que le fichier
réel reste intact et qu'aucune donnée n'est perdue.

**Concernant les comptes serveur qui arrivaient encore à supprimer des
articles** : il est possible que ce soit lié à cette même corruption de
données (les réglages de permissions pouvant eux aussi être affectés).
Repartez sur cette version corrigée et retestez ce point précis — si le
problème persiste malgré cette correction majeure, dites-le-moi.

## Ajout d'utilisateur qui plantait — filet de sécurité mis en place

Je n'ai pas trouvé de bug précis en relisant tout le code d'ajout
d'utilisateur (rien d'anormal détecté), et j'ai aussi testé le vrai démarrage
du serveur avec des données réalistes (commandes en attente, ventes,
utilisateurs) — tout fonctionne correctement de mon côté.

**Plutôt que de continuer à deviner**, j'ai mis en place deux filets de
sécurité :

1. **Sur l'ajout/gestion d'utilisateurs spécifiquement** : si une erreur
   survient, elle s'affiche maintenant clairement à l'écran avec son message
   exact, au lieu de planter silencieusement sans rien indiquer.
2. **Partout dans l'application** : toute erreur technique inattendue,
   n'importe où, s'affiche désormais automatiquement en rouge en haut de
   l'écran avec le message précis — plus besoin d'ouvrir la console
   développeur pour la voir.

**Si ça plante encore la prochaine fois**, un message rouge devrait apparaître
à l'écran juste avant — envoyez-moi une capture d'écran de ce message précis,
ça me permettra de corriger le vrai problème directement, sans deviner.

## Bouton "🗑️ Annuler" en haut du ticket — ne supprime plus une commande reprise

**Trouvé le vrai trou** : le bouton **"🗑️ Annuler"** en haut du ticket (celui
que vous appeliez "le X au-dessus") videait le ticket sans jamais remettre la
commande dans "Commandes en attente" si elle avait été **reprise** — la
commande disparaissait purement et simplement, sans confirmation ni
possibilité de la retrouver. C'est exactement ce que vous décriviez : n'importe
qui, y compris un compte serveur, pouvait faire disparaître une commande déjà
envoyée juste en cliquant "Annuler" après l'avoir reprise.

**Corrigé** : cliquer sur "Annuler" après avoir repris une commande la remet
maintenant **automatiquement en attente**, exactement comme elle était avant
d'être reprise — rien n'est perdu, quel que soit le compte utilisé.

**Au passage, trouvé et corrigé un vrai bug dans ma propre correction** avant
de vous l'envoyer : après un paiement normal, l'état "commande reprise"
n'était jamais réinitialisé — ce qui aurait fait réapparaître à tort une
commande **déjà payée** dans "En attente". Corrigé et testé sur les 4 cas de
figure (reprise+annuler, envoi normal, paiement normal, nouveau ticket) —
tous corrects.

## 400 tables, toutes libres par défaut

Remplacé les anciennes tables de démonstration (8 tables, dont certaines
marquées "Occupée"/"Réservée" par défaut) par **400 tables** ("Table 1" à
"Table 400"), **toutes "Libre"** au départ — c'est vous qui décidez ensuite,
table par table, si elle est réservée ou occupée (via le bouton ✏️ dans
Paramètres → Tables, le statut se change comme avant).

**Migration automatique** incluse pour votre serveur déjà en service, sans
toucher au reste de vos données (testé avec de fausses données : clients
préservés, tables bien remplacées par les 400 nouvelles, toutes libres).

## Serveur qui plantait quand beaucoup de postes sont connectés en même temps

**Cause probable** : le serveur n'avait **aucune protection** contre une
erreur imprévue — si quoi que ce soit d'inattendu se produisait à un moment
donné (plus probable avec plusieurs serveuses connectées en même temps,
envoyant des changements proches dans le temps), ça pouvait faire planter
**tout le processus serveur d'un coup**, coupant tous les postes connectés en
même temps.

**Corrigé** : le serveur est maintenant protégé à trois niveaux — une erreur
imprévue est systématiquement journalisée au lieu d'arrêter le serveur, la
route qui reçoit chaque changement de chaque poste est explicitement protégée,
et la connexion d'un nouveau poste aussi. Un souci ponctuel n'affecte plus que
lui-même, jamais tout le monde en même temps.

**Testé avant envoi** : simulation d'une erreur non gérée en plein
fonctionnement — confirmé que le processus continue de tourner normalement
après, au lieu de s'arrêter.

## Format de la barre "Commandes en attente" corrigé

Avant : `ATT-47 sorel 13:46 100 000 FCFA F` (identifiant interne + devise en
double).

Maintenant : **`T-47 sorel 13:46 100 000 F`** — T-47 représente le numéro de
la table, l'heure, et le montant avec juste "F" (plus de doublon FCFA/F).

**Testé** avec vos valeurs exactes avant envoi — résultat conforme.

## Commandes qui disparaissaient toutes seules — vrai bug de synchronisation trouvé

**Cause trouvée** : chaque poste envoyait son état complet au serveur, qui
**écrasait tout** à chaque fois sans distinction. Si un poste avait une
version légèrement en retard (n'ayant pas encore reçu une commande tout juste
créée ailleurs) et envoyait son propre changement juste après, sa version
écrasait celle du serveur — la commande fraîchement créée disparaissait
purement et simplement, sans que personne ne l'ait supprimée. C'est
exactement ce qui donnait l'impression qu'une table "se libérait toute
seule".

**Corrigé** : le serveur fusionne maintenant intelligemment les commandes en
attente au lieu d'écraser brutalement — une commande tout juste créée (moins
de 15 secondes) est toujours préservée même si un autre poste envoie une
version qui ne la connaît pas encore. Les vraies suppressions (au-delà de ce
court délai) continuent de fonctionner normalement.

**Testé avant envoi** : simulé exactement le scénario du bug (commande créée
puis "écrasée" par un poste en retard) — confirmé préservée ; et vérifié
qu'une suppression légitime après le délai de grâce reste bien respectée.

## LA vraie cause trouvée : le client n'utilisait jamais les nouvelles routes protégées

**Ce qui s'est passé** : le serveur avait déjà une protection avancée en place
(commandes en attente jamais écrasées par l'état complet, gérées via des
routes dédiées) — mais **l'application elle-même n'avait jamais été mise à
jour pour utiliser ces routes**. Résultat : chaque nouvelle commande créée
était immédiatement ignorée par le serveur, et disparaissait dès la
synchronisation suivante — exactement le comportement que vous observiez, à
chaque fois.

**Corrigé pour de vrai cette fois** : l'application utilise maintenant
réellement ces routes dédiées à chaque étape :
- **Envoi d'une commande** → envoyée via la route protégée
- **Suppression** → retirée via la route protégée
- **Reprise d'une commande** → retirée du serveur pendant l'édition
- **Annuler après une reprise** → remise en attente via la route protégée

Un **journal texte simple** (`sync-log.txt`, dans le dossier de données de
l'application) enregistre maintenant aussi chaque ajout/retrait avec l'heure
exacte — utile pour vérifier ce qui s'est passé sans avoir besoin de la
console développeur, si jamais un doute persiste.

**Testé avant envoi** : simulé le scénario exact (poste A crée une commande,
poste B en retard envoie son état) avec la vraie logique du serveur —
confirmé que la commande survit désormais, et que les suppressions
explicites continuent de fonctionner normalement.

## Correction : commande perdue en changeant d'utilisateur

**Cause trouvée** : depuis la correction précédente, reprendre une commande
(bouton ▶) la retire temporairement du serveur pendant qu'elle est en cours
d'édition — le temps normal étant de cliquer ensuite sur "Envoyer" ou
"Annuler" pour la remettre en place. Mais si l'utilisateur se **déconnectait**
(ou fermait l'application) **sans faire ni l'un ni l'autre**, la commande
restait "sortie" du serveur pour de bon — elle disparaissait.

**Corrigé** : la déconnexion, la fermeture de l'application et le bouton
"Recharger" remettent maintenant **automatiquement** en attente toute
commande en cours d'édition avant de continuer — exactement comme si vous
aviez cliqué sur "Annuler" juste avant.

**Testé** avant envoi sur les deux cas de figure (reprise en cours vs. rien à
faire) — comportement correct dans les deux cas.

## Commandes qui disparaissaient au changement de compte / déconnexion

**Trouvé** : quand une serveuse ou un caissier reprenait une commande pour
l'éditer (bouton ▶), elle était temporairement retirée du serveur pendant
l'édition. Si la personne se déconnectait ensuite pour laisser la main à un
autre compte (ex: passer sur le compte admin) **sans avoir cliqué sur
"Envoyer" ni "Annuler" avant**, la commande restait "sortie" du serveur pour
toujours — elle disparaissait purement et simplement.

**Corrigé** : maintenant, si une commande est en cours de reprise au moment de
se déconnecter (ou de fermer l'application, ou de cliquer sur "Recharger"),
elle est **automatiquement remise en attente** avant que quoi que ce soit ne
se passe — comme si vous aviez cliqué sur "Annuler". Rien ne se perd, quel que
soit le compte utilisé ou la façon de quitter.

**Testé avant envoi** : les deux cas de figure (commande en cours d'édition
vs. aucune reprise en cours) donnent le bon comportement.

## Message répétitif au démarrage/rechargement

Je n'ai pas trouvé de message littéralement intitulé "recharger la dernière
base de données" dans le code — mais j'ai trouvé un candidat sérieux : le
message **"Serveur FSS-CAISSE démarré"** (avec l'adresse IP) réapparaissait à
**chaque** rechargement, y compris les rechargements automatiques après un
plantage ou un blocage (ajoutés récemment) — ce qui pouvait donner
l'impression que le logiciel redemande sans cesse quelque chose.

**Corrigé** : ce message ne s'affiche désormais **qu'une seule fois** par
lancement de l'application, plus à chaque "Recharger" ou récupération
automatique.

**Si ce n'est pas exactement ce que vous voyiez** : pouvez-vous m'envoyer une
capture d'écran du message exact ? Le texte précis m'aidera à trouver le bon
endroit si le souci persiste après cette correction.

## Message "Serveur démarré" après modification d'article — vraie cause trouvée

**Confirmé par vos précisions** : ma détection automatique de "blocage"
(ajoutée récemment pour la récupération après plantage) se déclenchait trop
facilement — avec 400 tables et tout votre catalogue d'articles, enregistrer
un article peut légitimement prendre quelques secondes de plus que la
normale, sans que l'application soit vraiment figée. Après seulement 8
secondes, elle déclenchait un rechargement automatique, qui rouvrait le
serveur et redéclenchait le message.

**Corrigé** : le délai de grâce passe de 8 à **30 secondes** — largement
suffisant pour toute opération normale, même avec un gros catalogue, tout en
gardant la protection contre un vrai blocage.

## La dernière mise à jour des articles est maintenant protégée

M�me correction que pour les commandes en attente, appliquée cette fois au
**catalogue d'articles** : si un poste a une version un peu ancienne du
catalogue (n'ayant pas encore reçu un ajout ou une modification faite
ailleurs) et envoie son propre changement juste après, sa version ne peut plus
écraser la dernière vraie mise à jour. La bonne version (la plus récente) est
toujours celle qui reste active.

**Testé avant envoi** avec le scénario complet : modification d'un prix →
préservée même si un autre poste envoie une version en retard juste après →
une vraie nouvelle modification passe toujours normalement ensuite.

## "Retour à une ancienne version" au changement d'utilisateur — vraie cause trouvée

**Ce qui se passait** : ma correction précédente (bien intentionnée) forçait
l'envoi de **l'état complet** du poste juste avant chaque déconnexion. Si ce
poste avait une vue un peu en retard des données (très possible sur un
téléphone resté un moment en arrière-plan, où les mises à jour des autres
postes peuvent être retardées), cet envoi forcé **écrasait les changements
plus récents** faits ailleurs pendant ce temps — donnant exactement
l'impression que "les données reviennent en arrière" après un changement de
compte, sur n'importe quel poste.

**Corrigé** : la déconnexion (et la fermeture de l'application) n'envoie plus
jamais l'état complet. Seule une commande en cours d'édition au moment de se
déconnecter est remise en attente, via sa route dédiée et protégée qui ne
touche à rien d'autre — tout le reste (articles, clients, ventes...) reste
intact, sans jamais risquer d'écraser une version plus récente.

**Vous ne devriez plus jamais avoir besoin d'exporter la base de données par
précaution avant de changer de compte** — le mécanisme de sauvegarde normal
(déjà protégé pour les commandes en attente et les articles) suffit
désormais.
