'use strict';

const fs = require('fs');
const path = require('path');
const { loadEnvFiles } = require('./state-store');
const { resolveRealtimeSessionConfig } = require('../shared/openai-models-config');

const ALLOWED_KEYS = Object.freeze([
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ALLOWED_CHAT_IDS',
  'OPENAI_VOICE_NAME',
  'OPENAI_VOICE_SPEED',
  'OPENAI_API_KEY'
]);

function isMaskedOrEmpty(val) {
  if (val === undefined || val === null) return true;
  const s = String(val).trim();
  if (!s) return true;
  if (s.includes('••••') || /^\*+$/.test(s) || s.includes('***')) return true;
  return false;
}

function serializeEnvValue(val) {
  const s = String(val).replace(/[\r\n]/g, '').trim();
  if (/[\s#"'=]/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Gestor de credenciales en tiempo real para el modal de la interfaz web.
 * Nunca retorna claves o tokens en respuestas API; solo estados booleanos y metadatos públicos.
 */
class CredentialsManager {
  constructor(options = {}) {
    const defaultEnvPath = process.env.DATA_DIR
      ? path.join(path.resolve(process.env.DATA_DIR), '.env')
      : path.resolve(__dirname, '../.env');
    this.envFilePath = options.envFilePath || defaultEnvPath;
    loadEnvFiles([this.envFilePath]);
  }

  getIntegrationsStatus({ store = null, telegramBot = null } = {}) {
    const rt = resolveRealtimeSessionConfig(process.env);
    const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim());
    const hasSupabaseKey = Boolean(
      (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim()) ||
      (process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_ANON_KEY.trim())
    );

    return {
      openai: {
        configured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()),
        realtimeModel: rt.primaryModel,
        fullDuplexModel: rt.fullDuplexModel,
        agentModel: rt.agentModel,
        fastModel: rt.agentFastModel,
        sttModel: rt.sttModel,
        ttsModel: rt.ttsModel,
        voice: rt.voice,
        speed: rt.speed
      },
      supabase: {
        configured: hasSupabaseUrl && hasSupabaseKey,
        hasUrl: hasSupabaseUrl,
        persistence: store ? store.getPersistenceStatus() : null
      },
      telegram: {
        configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()),
        running: telegramBot ? Boolean(telegramBot.isRunning()) : false,
        botUsername: telegramBot ? telegramBot.botUsername || null : null,
        hasAllowedChats: Boolean(
          process.env.TELEGRAM_ALLOWED_CHAT_IDS && process.env.TELEGRAM_ALLOWED_CHAT_IDS.trim()
        )
      }
    };
  }

  #persistKeysToEnvFile(updates) {
    const dir = path.dirname(this.envFilePath);
    fs.mkdirSync(dir, { recursive: true });

    const existingLines = fs.existsSync(this.envFilePath)
      ? fs.readFileSync(this.envFilePath, 'utf8').split(/\r?\n/)
      : [
          '# ==============================================================================',
          '# Gemelo Digital Avícola (AV-1 / AV-2) — Credenciales Locales',
          '# =============================================================================='
        ];

    const remaining = new Map(Object.entries(updates));
    const nextLines = existingLines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return line;
      const key = trimmed.slice(0, eq).trim();
      if (!remaining.has(key)) return line;
      const nextVal = remaining.get(key);
      remaining.delete(key);
      return `${key}=${serializeEnvValue(nextVal)}`;
    });

    if (remaining.size > 0) {
      if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
        nextLines.push('');
      }
      for (const [key, val] of remaining.entries()) {
        nextLines.push(`${key}=${serializeEnvValue(val)}`);
      }
    }

    fs.writeFileSync(this.envFilePath, nextLines.join('\n').replace(/\n*$/, '\n'), 'utf8');
  }

  async updateCredentials(input = {}, { store = null, telegramBot = null, bridge = null } = {}) {
    const appliedUpdates = {};
    const changedKeys = [];

    for (const key of ALLOWED_KEYS) {
      if (!(key in input) || isMaskedOrEmpty(input[key])) continue;
      let val = String(input[key]).trim();

      if (key === 'SUPABASE_URL') {
        val = val.replace(/\/+$/, '');
      } else if (key === 'OPENAI_VOICE_SPEED') {
        const n = Number(val);
        if (!Number.isFinite(n)) continue;
        val = String(Math.min(1.5, Math.max(0.75, n)));
      }

      appliedUpdates[key] = val;
      process.env[key] = val;
      changedKeys.push(key);
    }

    if (changedKeys.length > 0) {
      this.#persistKeysToEnvFile(appliedUpdates);
    }

    const supabaseChanged = changedKeys.some((k) =>
      ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].includes(k)
    );
    if (supabaseChanged) {
      const nextUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
      const nextKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
      if (store) {
        store.supabaseUrl = nextUrl;
        store.supabaseKey = nextKey;
        await store.init();
      }
      if (bridge) {
        bridge.supabaseUrl = nextUrl;
        bridge.supabaseKey = nextKey;
      }
    }

    const telegramTokenChanged = changedKeys.includes('TELEGRAM_BOT_TOKEN');
    const telegramAllowedChanged = changedKeys.includes('TELEGRAM_ALLOWED_CHAT_IDS');
    if (telegramBot) {
      if (telegramAllowedChanged && typeof telegramBot.reloadAllowedChats === 'function') {
        telegramBot.reloadAllowedChats(process.env.TELEGRAM_ALLOWED_CHAT_IDS || '');
      }
      if (telegramTokenChanged && typeof telegramBot.restart === 'function') {
        await telegramBot.restart(process.env.TELEGRAM_BOT_TOKEN);
      }
    }

    return {
      ok: true,
      updatedKeys: changedKeys,
      status: this.getIntegrationsStatus({ store, telegramBot })
    };
  }
}

module.exports = {
  CredentialsManager,
  ALLOWED_KEYS
};
