# FSS-CAISSE — Application de bureau (.exe)

Ce dossier contient tout ce qu'il faut pour transformer `app/index.html`
en une application Windows (.exe) grâce à **Electron** + **GitHub Actions**.

## 🚀 Étapes à suivre

### 1. Créer le repo sur GitHub
1. Va sur https://github.com/new
2. Crée un nouveau repo (ex: `fss-caisse`), **vide**, sans README.

### 2. Envoyer ce dossier sur GitHub
Ouvre un terminal dans ce dossier et tape :

```bash
git init
git add .
git commit -m "Premier envoi de FSS-CAISSE"
git branch -M main
git remote add origin https://github.com/TON-UTILISATEUR/fss-caisse.git
git push -u origin main
```

(remplace `TON-UTILISATEUR` par ton nom d'utilisateur GitHub)

### 3. Laisser GitHub compiler le .exe
Dès que tu pousses le code (`git push`), GitHub Actions se lance
automatiquement et compile le `.exe` pour toi (inutile d'installer
Electron sur ton PC).

Tu peux suivre la progression dans l'onglet **Actions** de ton repo GitHub.

### 4. Télécharger le .exe
1. Va dans l'onglet **Actions** du repo.
2. Clique sur le dernier run terminé (coche verte ✅).
3. En bas de la page, dans **Artifacts**, télécharge
   **FSS-CAISSE-windows** → tu obtiens un .zip contenant le `.exe`.

## 🔁 Mettre à jour l'application
Si tu modifies `app/index.html`, il suffit de refaire :
```bash
git add .
git commit -m "Mise à jour"
git push
```
Un nouveau `.exe` sera généré automatiquement.

## 📁 Structure du dossier
```
fss-caisse-app/
├── app/
│   └── index.html        ← ton application (FSS-CAISSE)
├── main.js                ← lance la fenêtre Electron
├── package.json           ← configuration de build
├── .github/workflows/
│   └── build.yml          ← script qui compile le .exe sur GitHub
└── README.md
```
