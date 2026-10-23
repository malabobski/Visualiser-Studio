const fs = require('node:fs/promises');
const path = require('node:path');

// Supabase sessions and PKCE verifiers stay in the main process. Never fall
// back to writing plaintext if the OS credential store isn't available.
function encryptedStorage(file, safeStorage) {
  let values, queue = Promise.resolve();
  const persistent = () => safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
  async function read() {
    if (values) return;
    values = {};
    if (!persistent()) return;
    try {
      const parsed = JSON.parse(safeStorage.decryptString(await fs.readFile(file)));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid session store');
      values = parsed;
    }
    catch (error) { if (error.code !== 'ENOENT') await fs.rm(file, { force: true }); }
  }
  const run = action => {
    const result = queue.then(async () => { await read(); return action(); });
    queue = result.catch(() => {});
    return result;
  };
  async function write() {
    if (!persistent()) return;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file + '.tmp', safeStorage.encryptString(JSON.stringify(values)), { mode: 0o600 });
    await fs.rename(file + '.tmp', file);
  }
  return {
    persistent,
    getItem: key => run(() => values[key] ?? null),
    setItem: (key, value) => run(async () => { values[key] = value; await write(); }),
    removeItem: key => run(async () => { delete values[key]; await write(); })
  };
}
function cleanProfile(input) {
  const username = String(input?.username || '').trim().toLowerCase();
  const display_name = String(input?.display_name || '').trim();
  const bio = String(input?.bio || '').trim();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('Choose a username with 3–24 letters, numbers or underscores.');
  if (!display_name || display_name.length > 40) throw new Error('Your display name needs 1–40 characters.');
  if (bio.length > 160) throw new Error('Keep your bio within 160 characters.');
  return { username, display_name, bio };
}
module.exports = { encryptedStorage, cleanProfile };
