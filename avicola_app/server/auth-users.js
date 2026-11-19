'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'avicola_session';
const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30 días

const ROLE_PERMISSIONS = {
  owner: {
    role: 'owner',
    roleLabel: 'Administrador',
    scope: 'owner_full',
    defaultViewMode: 'av2_only',
    allowedSections: [
      'resumen_ejecutivo',
      'simulador_whatif',
      'operacion_av2',
      'plan_av1',
      'bitacora_pesajes',
      'bodega_termica',
      'puente_antigravity'
    ],
    canViewAv1: true,
    canSwitchWorkspaceMode: true,
    canManageRfc: true,
    canManageUsers: true,
    canManageCredentials: true
  },
  farm_partner: {
    role: 'farm_partner',
    roleLabel: 'Fundador · Granja La Alejandra',
    scope: 'av2_only',
    defaultViewMode: 'av2_only',
    allowedSections: [
      'resumen_ejecutivo',
      'simulador_whatif',
      'operacion_av2',
      'bitacora_pesajes',
      'bodega_termica'
    ],
    canViewAv1: false,
    canSwitchWorkspaceMode: false,
    canManageRfc: false,
    canManageUsers: false,
    canManageCredentials: false
  }
};

function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.farm_partner;
}

function hashSecret(password, existingSalt = null) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return { salt, hash };
}

function verifySecret(password, salt, expectedHash) {
  if (!salt || !expectedHash || password === undefined || password === null) return false;
  const derived = crypto.scryptSync(String(password), salt, 32);
  const target = Buffer.from(expectedHash, 'hex');
  if (derived.length !== target.length) return false;
  return crypto.timingSafeEqual(derived, target);
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function sanitizeUsername(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '');
}

/**
 * Almacén transaccional multiusuario con separación real de roles (RBAC):
 * - `owner` (Mauricio): opera Granja Real AV-2 sin distracciones y conserva acceso opcional a Plantilla AV-1, RFCs y Gestión de Usuarios.
 * - `farm_partner` (Hermano): experiencia enfocada 100% en Granja Real AV-2, sin plantillas genéricas AV-1 ni configuraciones técnicas.
 */
class UserAuthStore {
  constructor(options = {}) {
    this.dataDir = options.dataDir || (process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, '../data'));
    this.usersFile = path.join(this.dataDir, 'users_auth.json');
    this.secretFile = path.join(this.dataDir, 'session_secret.key');
    this.hmacSecret = null;
    this.users = [];
  }

  init() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.hmacSecret = this.#loadOrCreateSecret();

    if (fs.existsSync(this.usersFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.usersFile, 'utf8'));
        if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
          let migrated = false;
          const hasDavid = parsed.users.some((u) => u.username === 'david');
          this.users = parsed.users.map((u) => {
            if (u.username === 'hermano' && !hasDavid) {
              migrated = true;
              return Object.assign({}, u, {
                username: 'david',
                displayName: 'David Bonilla',
                titleBadge: 'Fundador',
                updatedAt: new Date().toISOString()
              });
            }
            if (u.username === 'mauricio' && (u.titleBadge === 'Propietario · Granja Real & Modelo' || u.titleBadge === 'Plantillas + Granja')) {
              migrated = true;
              return Object.assign({}, u, {
                titleBadge: 'Administrador',
                updatedAt: new Date().toISOString()
              });
            }
            if (u.username === 'david' && (u.displayName !== 'David Bonilla' || u.titleBadge !== 'Fundador')) {
              migrated = true;
              return Object.assign({}, u, {
                displayName: 'David Bonilla',
                titleBadge: 'Fundador',
                updatedAt: new Date().toISOString()
              });
            }
            return u;
          });
          if (migrated) this.#save();
          return;
        }
      } catch (_) {
        // Si el archivo estuviera corrupto, re-inicializa perfiles base
      }
    }

    const now = new Date().toISOString();
    const mauSec = hashSecret('2026');
    const davSec = hashSecret('1234');
    this.users = [
      {
        username: 'mauricio',
        displayName: 'Mauricio Bonilla',
        role: 'owner',
        titleBadge: 'Administrador',
        salt: mauSec.salt,
        passwordHash: mauSec.hash,
        hasCustomPassword: false,
        active: true,
        createdAt: now,
        updatedAt: now
      },
      {
        username: 'david',
        displayName: 'David Bonilla',
        role: 'farm_partner',
        titleBadge: 'Fundador',
        salt: davSec.salt,
        passwordHash: davSec.hash,
        hasCustomPassword: false,
        active: true,
        createdAt: now,
        updatedAt: now
      }
    ];
    this.#save();
  }

  #loadOrCreateSecret() {
    if (process.env.AVICOLA_SESSION_SECRET && process.env.AVICOLA_SESSION_SECRET.length >= 16) {
      return process.env.AVICOLA_SESSION_SECRET;
    }
    if (fs.existsSync(this.secretFile)) {
      const existing = fs.readFileSync(this.secretFile, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(this.secretFile, generated, 'utf8');
    return generated;
  }

  #save() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.usersFile, JSON.stringify({ updatedAt: new Date().toISOString(), users: this.users }, null, 2), 'utf8');
  }

  #toSessionUser(user) {
    const perms = getPermissionsForRole(user.role);
    return {
      username: user.username,
      displayName: user.displayName,
      titleBadge: user.titleBadge || perms.roleLabel,
      ...perms
    };
  }

  listPublicProfiles() {
    return this.users
      .filter((u) => u.active !== false)
      .map((u) => {
        const perms = getPermissionsForRole(u.role);
        return {
          username: u.username,
          displayName: u.displayName,
          role: perms.role,
          roleLabel: perms.roleLabel,
          scope: perms.scope,
          titleBadge: u.titleBadge || perms.roleLabel,
          hasCustomPassword: Boolean(u.hasCustomPassword)
        };
      });
  }

  signSessionToken(user) {
    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
    const payload = Buffer.from(
      JSON.stringify({
        u: user.username,
        r: user.role,
        exp
      }),
      'utf8'
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', this.hmacSecret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  verifySessionToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    const expectedSig = crypto.createHmac('sha256', this.hmacSecret).update(payloadB64).digest('base64url');
    const a = Buffer.from(sigB64, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let decoded = null;
    try {
      decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch (_) {
      return null;
    }
    if (!decoded || !decoded.u || Number(decoded.exp || 0) < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const found = this.users.find((u) => u.username === decoded.u && u.active !== false);
    return found ? this.#toSessionUser(found) : null;
  }

  verifySessionFromRequest(req) {
    if (!req || !req.headers) return null;
    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies[SESSION_COOKIE_NAME]) {
      const fromCookie = this.verifySessionToken(cookies[SESSION_COOKIE_NAME]);
      if (fromCookie) return fromCookie;
    }
    const auth = String(req.headers.authorization || '');
    if (auth.toLowerCase().startsWith('bearer ')) {
      return this.verifySessionToken(auth.slice(7).trim());
    }
    return null;
  }

  authenticate(usernameRaw, password) {
    const rawUname = sanitizeUsername(usernameRaw);
    const canonicalUname = rawUname === 'hermano' ? 'david' : rawUname;
    const user = this.users.find(
      (u) => (u.username === canonicalUname || u.username === rawUname) && u.active !== false
    );
    if (!user) return null;
    if (!verifySecret(password, user.salt, user.passwordHash)) return null;
    return {
      sessionToken: this.signSessionToken(user),
      user: this.#toSessionUser(user)
    };
  }

  upsertUser({ username, displayName, role, password, titleBadge, active = true }) {
    const rawUname = sanitizeUsername(username);
    const uname = rawUname === 'hermano' ? 'david' : rawUname;
    if (!uname || uname.length < 2) {
      throw new Error('El nombre de usuario debe tener al menos 2 caracteres alfanuméricos.');
    }
    const validRole = role === 'owner' ? 'owner' : 'farm_partner';
    const existing = this.users.find((u) => u.username === uname || u.username === rawUname);
    const now = new Date().toISOString();

    if (existing) {
      if (displayName && String(displayName).trim()) {
        existing.displayName = String(displayName).trim();
      }
      if (titleBadge && String(titleBadge).trim()) {
        existing.titleBadge = String(titleBadge).trim();
      }
      // Evitar degradar accidentalmente al único owner si no queda otro
      if (existing.username !== 'mauricio') {
        existing.role = validRole;
      }
      if (typeof active === 'boolean' && existing.username !== 'mauricio') {
        existing.active = active;
      }
      if (password && String(password).trim()) {
        const sec = hashSecret(String(password).trim());
        existing.salt = sec.salt;
        existing.passwordHash = sec.hash;
        existing.hasCustomPassword = true;
      }
      existing.updatedAt = now;
      this.#save();
      return this.#toSessionUser(existing);
    }

    const cleanPass = String(password || '').trim();
    if (cleanPass.length < 4) {
      throw new Error('La contraseña o PIN inicial debe tener al menos 4 caracteres.');
    }
    const sec = hashSecret(cleanPass);
    const created = {
      username: uname,
      displayName: String(displayName || uname).trim(),
      role: validRole,
      titleBadge: String(titleBadge || ROLE_PERMISSIONS[validRole].roleLabel).trim(),
      salt: sec.salt,
      passwordHash: sec.hash,
      hasCustomPassword: true,
      active: true,
      createdAt: now,
      updatedAt: now
    };
    this.users.push(created);
    this.#save();
    return this.#toSessionUser(created);
  }

  buildSessionCookieHeader(token) {
    return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}`;
  }

  buildClearCookieHeader() {
    return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
  }
}

module.exports = {
  UserAuthStore,
  SESSION_COOKIE_NAME,
  getPermissionsForRole
};
