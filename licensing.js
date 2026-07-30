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

// IMPORTANT : doit rester identique à LICENSE_SECRET dans FSS-CAISSE-SALON
// (src/main/licensing.js) et dans tous les générateurs de licence.
const LICENSE_SECRET = 'FSS-CAISSE-SALON-2026-FALLSERVICES-9f3a7c1e5b2d4681';
const TRIAL_DAYS = 3;

let licensePath = null;
let trialPath = null;

function init(userDataPath) {
    licensePath = path.join(userDataPath, 'license.json');
    trialPath = path.join(userDataPath, 'trial.json');
}

function getMachineId() {
    const nets = os.networkInterfaces();
    let mac = '';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                mac = net.mac;
                break;
            }
        }
        if (mac) break;
    }
    const raw = [os.hostname(), os.cpus()?.[0]?.model || '', os.totalmem(), mac].join('|');
    const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
    return hash.slice(0, 16).match(/.{1,4}/g).join('-');
}

function isValidKey(machineId, key) {
    if (!key) return false;
    const expected = crypto.createHmac('sha256', LICENSE_SECRET).update(machineId).digest('hex').toUpperCase();
    const expectedFormatted = expected.slice(0, 16).match(/.{1,4}/g).join('-');
    return key.trim().toUpperCase() === expectedFormatted;
}

function isLicensed() {
    try {
        const raw = fs.readFileSync(licensePath, 'utf-8');
        const data = JSON.parse(raw);
        return isValidKey(getMachineId(), data.key);
    } catch (e) {
        return false;
    }
}

function activate(key) {
    const machineId = getMachineId();
    if (!isValidKey(machineId, key)) {
        return { success: false, error: 'Clé de licence invalide pour ce PC.' };
    }
    fs.writeFileSync(licensePath, JSON.stringify({ key: key.trim().toUpperCase(), machineId, activatedAt: new Date().toISOString() }, null, 2), 'utf-8');
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
