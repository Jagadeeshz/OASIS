'use strict';
// Secret storage. Uses Electron safeStorage (OS-backed: DPAPI on Windows) when available.
// The plaintext key never leaves the main process: the renderer can only write or clear it.
const fs = require('node:fs');
const path = require('node:path');

class SecretVault {
  /**
   * @param {{file: string, safeStorage?: {isEncryptionAvailable():boolean, encryptString(s:string):Buffer, decryptString(b:Buffer):string}}} opts
   */
  constructor({ file, safeStorage = null }) {
    this.file = file;
    this.safeStorage = safeStorage;
    this.cache = null;
  }

  encryptionAvailable() {
    try {
      return !!(this.safeStorage && this.safeStorage.isEncryptionAvailable());
    } catch {
      return false;
    }
  }

  load() {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.cache || {}), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  set(provider, secret) {
    const data = this.load();
    if (!secret) {
      delete data[provider];
      this.save();
      return false;
    }
    if (this.encryptionAvailable()) {
      data[provider] = { v: 1, enc: 'safeStorage', value: this.safeStorage.encryptString(String(secret)).toString('base64') };
    } else {
      // Documented fallback when OS encryption is unavailable (e.g. headless CI):
      // obfuscated, not encrypted. The UI surfaces this state.
      data[provider] = { v: 1, enc: 'none', value: Buffer.from(String(secret), 'utf8').toString('base64') };
    }
    this.save();
    return true;
  }

  get(provider) {
    const data = this.load();
    const entry = data[provider];
    if (!entry) {
      const env = process.env[`${String(provider).toUpperCase()}_API_KEY`];
      return env || null;
    }
    if (entry.enc === 'safeStorage') {
      try {
        return this.safeStorage.decryptString(Buffer.from(entry.value, 'base64'));
      } catch {
        return null;
      }
    }
    return Buffer.from(entry.value, 'base64').toString('utf8');
  }

  has(provider) {
    return !!(this.load()[provider] || process.env[`${String(provider).toUpperCase()}_API_KEY`]);
  }

  source(provider) {
    if (this.load()[provider]) return 'vault';
    if (process.env[`${String(provider).toUpperCase()}_API_KEY`]) return 'environment';
    return null;
  }

  clear(provider) {
    const data = this.load();
    delete data[provider];
    this.save();
  }

  /** Last 4 characters only — never the full key. */
  hint(provider) {
    const secret = this.get(provider);
    if (!secret) return null;
    return `••••${String(secret).slice(-4)}`;
  }
}

/** Replace any known secret with [redacted] before writing to logs or errors. */
function redact(text, secrets = []) {
  let out = String(text ?? '');
  for (const s of secrets) {
    if (s && String(s).length >= 6) out = out.split(String(s)).join('[redacted]');
  }
  return out.replace(/(?:Key|Bearer)\s+[A-Za-z0-9_\-:.]{12,}/g, (m) => `${m.split(/\s+/)[0]} [redacted]`);
}

module.exports = { SecretVault, redact };
