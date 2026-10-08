// FSS-CAISSE Cloud — mots de passe, sessions signées, limitation des essais.
'use strict';
const crypto = require('crypto');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h
const MIN_PASSWORD = 6;

// ---------- Mots de passe (scrypt) ----------
function hashPasswordSync(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('hex') + '$' + h.toString('hex');
}
function verifyPassword(pw, stored) {
  return new Promise(function (resolve) {
    try {
      const parts = String(stored || '').split('$');
      if (parts.length !== 3 || parts[0] !== 'scrypt') return resolve(false);
      const salt = Buffer.from(parts[1], 'hex');
      const expected = Buffer.from(parts[2], 'hex');
      crypto.scrypt(String(pw), salt, expected.length, { N: 16384, r: 8, p: 1 }, function (err, h) {
        if (err) return resolve(false);
        resolve(h.length === expected.length && crypto.timingSafeEqual(h, expected));
      });
    } catch (e) { resolve(false); }
  });
}
function randomPassword(len) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len || 14);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// ---------- Sessions : jeton signé HMAC, porté par un cookie HttpOnly ----------
function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromB64u(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

function makeSessions(secret) {
  if (!secret || String(secret).length < 32) {
    throw new Error('SESSION_SECRET manquant ou trop court (32 caractères minimum).');
  }
  function sign(data) { return b64u(crypto.createHmac('sha256', secret).update(data).digest()); }
  return {
    create: function (slug, user) {
      const payload = b64u(JSON.stringify({ t: slug, u: user.id, p: user.pwdAt || 0, e: Date.now() + SESSION_TTL_MS }));
      return payload + '.' + sign(payload);
    },
    // Retourne { t, u, p, e } ou null
    verify: function (token) {
      if (!token || typeof token !== 'string') return null;
      const i = token.indexOf('.');
      if (i < 1) return null;
      const payload = token.slice(0, i);
      const sig = token.slice(i + 1);
      const expected = sign(payload);
      const a = Buffer.from(sig), b = Buffer.from(expected);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
      try {
        const data = JSON.parse(fromB64u(payload).toString('utf8'));
        if (!data || typeof data.e !== 'number' || data.e < Date.now()) return null;
        return data;
      } catch (e) { return null; }
    },
    ttlSeconds: Math.floor(SESSION_TTL_MS / 1000)
  };
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i < 0) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

// ---------- Limitation des essais de connexion ----------
function makeLimiter(maxFails, windowMs) {
  const hits = new Map();
  setInterval(function () {
    const now = Date.now();
    hits.forEach(function (v, k) { if (now - v.first > windowMs) hits.delete(k); });
  }, 60 * 1000).unref();
  return {
    blocked: function (key) {
      const v = hits.get(key);
      if (!v) return false;
      if (Date.now() - v.first > windowMs) { hits.delete(key); return false; }
      return v.n >= maxFails;
    },
    fail: function (key) {
      const v = hits.get(key);
      if (!v || Date.now() - v.first > windowMs) hits.set(key, { n: 1, first: Date.now() });
      else v.n++;
    },
    reset: function (key) { hits.delete(key); }
  };
}

module.exports = { hashPasswordSync, verifyPassword, randomPassword, makeSessions, parseCookies, makeLimiter, MIN_PASSWORD };
