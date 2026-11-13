// ============================================================
// Licence liée au matériel (protection anti-copie) — FSS-CAISSE
// ============================================================
// Même principe et même secret que FSS-CAISSE-SALON : une clé générée par
// n'importe lequel des générateurs existants (Windows, HTML, Android)
// fonctionne aussi ici, pour peu qu'on lui donne le bon identifiant machine.

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// IMPORTANT : doit rester identique à LICENSE_SECRET dans FSS-CAISSE-SALON
// (src/main/licensing.js) et dans tous les générateurs de licence.
const LICENSE_SECRET = 'FSS-CAISSE-SALON-2026-FALLSERVICES-9f3a7c1e5b2d4681';
// 0 = AUCUN essai : sans licence valide pour CE PC, le logiciel est bloqué tout de suite.
// Un dossier copié sur un autre PC ne démarre donc pas (la clé est liée au PC d'origine).
const TRIAL_DAYS = 0;

let licensePath = null;
let trialPath = null;
let backupLicensePath = null;

function init(userDataPath) {
    licensePath = path.join(userDataPath, 'license.json');
    trialPath = path.join(userDataPath, 'trial.json');
    // Copie de secours EN DEHORS du dossier de données de l'application : une mise à jour,
    // une réinstallation ou un nettoyage du dossier AppData ne fait plus perdre la licence.
    try {
        const base = process.env.ProgramData || process.env.PUBLIC || path.dirname(userDataPath);
        backupLicensePath = path.join(base, 'FSS-CAISSE', 'license.json');
    } catch (e) { backupLicensePath = null; }
}

function lireLicence(chemin) {
    try { return JSON.parse(fs.readFileSync(chemin, 'utf-8')); } catch (e) { return null; }
}
function ecrireLicence(chemin, data) {
    try { fs.mkdirSync(path.dirname(chemin), { recursive: true }); fs.writeFileSync(chemin, JSON.stringify(data, null, 2), 'utf-8'); return true; } catch (e) { return false; }
}
function licenceValide(data) {
    if (!data || !data.key) return false;
    const guid = getWindowsMachineGuid();
    if (guid) return isValidKey(getMachineId(), data.key);
    // Lecture de l'identifiant Windows impossible à cet instant : on fait confiance à l'identifiant
    // enregistré lors de l'activation (la clé doit toujours correspondre à cet identifiant).
    return !!data.machineId && isValidKey(data.machineId, data.key);
}

// Identifiant Windows unique et stable, attribué une seule fois à
// l'installation de Windows — ne change jamais tant que Windows n'est pas
// réinstallé (contrairement à l'adresse MAC, que Windows change
// régulièrement de lui-même par défaut pour le Wi-Fi, ce qui invalidait la
// licence à chaque fois).
let guidCache = null;
function getWindowsMachineGuid() {
    if (guidCache) return guidCache;
    const sysRoot = process.env.SystemRoot || 'C:\\Windows';
    const cmds = [
        '"' + path.join(sysRoot, 'System32', 'reg.exe') + '" query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid'
    ];
    // Plusieurs essais : un échec ponctuel de lecture ne doit JAMAIS changer l'identifiant machine
    // (c'est ce qui redemandait la licence après une mise à jour).
    for (let essai = 0; essai < 3; essai++) {
        for (const cmd of cmds) {
            try {
                const out = execSync(cmd, { windowsHide: true, timeout: 8000 }).toString();
                const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
                if (m) { guidCache = m[1].trim(); return guidCache; }
            } catch (e) { /* on réessaie */ }
        }
    }
    return null;
}

// Identifiant de repli STABLE (quand le GUID Windows est illisible) : calculé UNE seule fois puis mémorisé,
// car la mémoire totale / le nom peuvent varier d'un lancement à l'autre — l'identifiant affiché changeait
// alors et la clé générée pour l'ancien identifiant « ne passait pas ».
function identifiantRepli() {
    const fichiers = [];
    try { if (licensePath) fichiers.push(path.join(path.dirname(licensePath), 'machine-id.json')); } catch (e) {}
    try { if (backupLicensePath) fichiers.push(path.join(path.dirname(backupLicensePath), 'machine-id.json')); } catch (e) {}
    for (const f of fichiers) {
        const d = lireLicence(f);
        if (d && d.raw) { fichiers.forEach((g) => { if (g !== f && !lireLicence(g)) ecrireLicence(g, d); }); return d.raw; }
    }
    const raw = 'FALLBACK|' + [os.hostname(), os.cpus()?.[0]?.model || ''].join('|') + '|' + crypto.randomBytes(8).toString('hex');
    fichiers.forEach((f) => ecrireLicence(f, { raw }));
    return raw;
}

function getMachineId() {
    const guid = getWindowsMachineGuid();
    // Identifiant stable basé sur le GUID Windows si disponible (cas normal
    // sur un PC Windows), sinon identifiant de repli mémorisé (voir ci-dessus).
    const raw = guid ? ('WINGUID|' + guid) : identifiantRepli();
    const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
    return hash.slice(0, 16).match(/.{1,4}/g).join('-');
}

// Tolère les erreurs de copier-coller : espaces, retours à la ligne, tirets « longs », minuscules,
// lettres O/I/L confondues avec 0/1 (la clé n'utilise que 0-9 et A-F).
function normaliserCle(key) {
    if (!key) return '';
    let k = String(key).toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-F]/g, '');
    if (k.length !== 16) return String(key).trim().toUpperCase();
    return k.match(/.{1,4}/g).join('-');
}

function isValidKey(machineId, key) {
    if (!key || !machineId) return false;
    const expected = crypto.createHmac('sha256', LICENSE_SECRET).update(machineId).digest('hex').toUpperCase();
    const expectedFormatted = expected.slice(0, 16).match(/.{1,4}/g).join('-');
    return normaliserCle(key) === expectedFormatted;
}

function isLicensed() {
    try {
        let data = lireLicence(licensePath);
        if (licenceValide(data)) {
            // Entretient la copie de secours
            if (backupLicensePath && !lireLicence(backupLicensePath)) ecrireLicence(backupLicensePath, data);
            return true;
        }
        // Fichier principal absent ou invalide : on tente la copie de secours et on restaure.
        const sauv = backupLicensePath ? lireLicence(backupLicensePath) : null;
        if (licenceValide(sauv)) {
            ecrireLicence(licensePath, sauv);
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

function activate(key) {
    const machineId = getMachineId();
    if (!isValidKey(machineId, key)) {
        return { success: false, error: 'Clé de licence invalide pour ce PC.' };
    }
    const data = { key: normaliserCle(key), machineId, activatedAt: new Date().toISOString() };
    fs.writeFileSync(licensePath, JSON.stringify(data, null, 2), 'utf-8');
    if (backupLicensePath) ecrireLicence(backupLicensePath, data);
    return { success: true };
}

/**
 * Suit la date du tout premier lancement sur ce PC, pour calculer les jours
 * d'essai restants avant blocage obligatoire.
 */
function getTrialStatus() {
    let firstLaunch;
    try {
        firstLaunch = JSON.parse(fs.readFileSync(trialPath, 'utf-8')).firstLaunch;
    } catch (e) {
        firstLaunch = new Date().toISOString();
        fs.writeFileSync(trialPath, JSON.stringify({ firstLaunch }), 'utf-8');
    }
    const daysElapsed = Math.floor((Date.now() - new Date(firstLaunch).getTime()) / (1000 * 60 * 60 * 24));
    const daysLeft = Math.max(0, TRIAL_DAYS - daysElapsed);
    return { daysLeft, expired: daysElapsed >= TRIAL_DAYS };
}

/** true si l'app doit être bloquée : essai terminé et pas de licence valide. */
function isBlocked() {
    return getTrialStatus().expired && !isLicensed();
}

module.exports = { init, getMachineId, isLicensed, activate, getTrialStatus, isBlocked };
