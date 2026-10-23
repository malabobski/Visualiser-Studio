const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { encryptedStorage, cleanProfile } = require('../community-storage');
const { callbackListener, setupCommunity } = require('../community-auth');

test('credentials survive encrypted storage without plaintext; unavailable storage is memory only', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-community-'));
  const file = path.join(dir, 'session.bin');
  const safe = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s).map(v => v ^ 81), decryptString: b => Buffer.from(b).map(v => v ^ 81).toString() };
  try {
    const storage = encryptedStorage(file, safe);
    await Promise.all([storage.setItem('session', 'private-refresh-token'), storage.setItem('verifier', 'pkce-verifier')]);
    assert.equal((await fs.readFile(file)).includes('private-refresh-token'), false);
    assert.equal(await encryptedStorage(file, safe).getItem('session'), 'private-refresh-token');
    await storage.removeItem('session');
    assert.equal(await encryptedStorage(file, safe).getItem('session'), null);
    const noFile = path.join(dir, 'not-written.bin');
    const memory = encryptedStorage(noFile, { isEncryptionAvailable: () => false });
    await memory.setItem('session', 'secret');
    assert.equal(await memory.getItem('session'), 'secret');
    await assert.rejects(fs.access(noFile));
    const linux = encryptedStorage(noFile, { ...safe, getSelectedStorageBackend: () => 'basic_text' });
    assert.equal(linux.persistent(), false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('profile validation matches database rules and strips extra fields', () => {
  assert.deepEqual(cleanProfile({ username: ' A_USER ', display_name: ' Name ', bio: ' Hi ', id: 'other-user', admin: true }), { username: 'a_user', display_name: 'Name', bio: 'Hi' });
  for (const username of ['x', 'a'.repeat(25), 'has space', '<script>', 'ééé']) assert.throws(() => cleanProfile({ username, display_name: 'Name' }));
  assert.throws(() => cleanProfile({ username: 'valid', display_name: '' }));
  assert.throws(() => cleanProfile({ username: 'valid', display_name: 'Name', bio: 'x'.repeat(161) }));
});

test('loopback callback rejects wrong paths and exchanges a code only once', async () => {
  let code, failures = [];
  const listener = await callbackListener(async value => { code = value; }, value => failures.push(value));
  try {
    assert.equal((await fetch(new URL('/wrong', listener.url))).status, 404);
    assert.equal((await fetch(listener.url)).status, 400);
    assert.equal(code, undefined);
    const response = await fetch(listener.url + '?code=single-use');
    assert.match(await response.text(), /You’re in/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(code, 'single-use');
    assert.deepEqual(failures, []);
    await assert.rejects(fetch(listener.url + '?code=replay'));
  } finally { listener.close(); }
});

test('denied callback never exchanges a code and closes the attempt', async () => {
  let exchanged = false, message;
  const listener = await callbackListener(async () => { exchanged = true; }, value => { message = value; });
  await fetch(listener.url + '?error=access_denied');
  assert.equal(exchanged, false);
  assert.match(message, /try again/i);
  listener.close();
});

function fixture({ signedIn = false, discord = false, google = false } = {}) {
  const handlers = {}, events = [], app = new EventEmitter();
  app.getPath = () => os.tmpdir();
  const webContents = { mainFrame: { url: 'http://localhost:3000/' }, send: (channel, state) => events.push(state) };
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  const user = { id: 'authenticated-user', email: 'private@example.com', user_metadata: { full_name: 'Listener' } };
  let saved = null, wrote, redirect, oauthProvider;
  const query = {
    select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: saved }),
    insert: value => { wrote = value; saved = { ...value, created_at: '2026-10-23' }; return query; },
    update: value => { wrote = value; saved = { ...saved, ...value }; return query; },
    single: async () => ({ data: saved && { username: saved.username, display_name: saved.display_name, bio: saved.bio, created_at: saved.created_at } })
  };
  const auth = {
    getSession: async () => ({ data: { session: signedIn ? { user, access_token: 'private-access', refresh_token: 'private-refresh' } : null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    stopAutoRefresh() {},
    signOut: async () => ({}),
    signInWithOAuth: async options => { oauthProvider=options.provider;redirect = options.options.redirectTo; return { data: { url: 'https://hmofmufudjbgyvgeafwm.supabase.co/auth/v1/authorize?provider='+options.provider } }; },
    exchangeCodeForSession: async () => ({ data: { user } })
  };
  const rpc = (name, input) => name === 'community_create_profile' ? query.insert({id:user.id,username:input.username,display_name:input.display_name,bio:input.bio}) : Promise.resolve({data:null});
  setupCommunity({ app, ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }, safeStorage: { isEncryptionAvailable: () => false }, shell: { openExternal: async () => {} }, getWindow: () => ({ webContents, isDestroyed: () => false, show() {}, focus() {} }), getOrigin: () => 'http://localhost:3000', clientFactory: () => ({ auth, from: () => query, rpc }), fetcher: async () => ({ ok: true, json: async () => ({ external: { discord, google } }) }) });
  return { app, event, events, call: (name, input, sender = event) => handlers['community:' + name](sender, input), wrote: () => wrote, redirect: () => redirect, oauthProvider:()=>oauthProvider };
}

test('IPC rejects another window and a subframe; signed-out writes are refused', async () => {
  const f = fixture();
  assert.ok((await f.call('get', null, { ...f.event, sender: {} })).error);
  assert.ok((await f.call('get', null, { ...f.event, senderFrame: { url: 'http://localhost:3000/' } })).error);
  assert.match((await f.call('saveProfile', {})).error, /Sign in/);
  assert.match((await f.call('signIn')).error, /hasn’t been enabled/);
  f.app.emit('will-quit');
});

test('profile writes use the authenticated ID and bridge states contain no credentials or email', async () => {
  const f = fixture({ signedIn: true });
  const initial = await f.call('get');
  assert.equal(initial.profile.display_name, 'Listener');
  await f.call('saveProfile', { id: 'attacker', username: 'listener', display_name: 'Listener', bio: 'Hi' });
  assert.equal(f.wrote().id, 'authenticated-user');
  await f.call('saveProfile', { username: 'listener', display_name: 'Updated' });
  assert.equal(f.wrote().id, undefined);
  const exported = JSON.stringify([initial, f.events]);
  assert.doesNotMatch(exported, /private-|private@|access_token|refresh_token/);
  assert.equal((await f.call('signOut')).signedIn, false);
  f.app.emit('will-quit');
});

test('browser sign-in, cancellation and successful return update the public state', async () => {
  const f = fixture({ discord: true });
  assert.equal((await f.call('signIn')).waiting, true);
  const cancelled = f.redirect();
  assert.equal((await f.call('cancel')).waiting, false);
  await assert.rejects(fetch(cancelled + '?code=cancelled'));
  await f.call('signIn');
  const result = await fetch(f.redirect() + '?code=success');
  assert.match(await result.text(), /You’re in/);
  const state = await f.call('get');
  assert.equal(state.signedIn, true);
  assert.equal(state.waiting, false);
  f.app.emit('will-quit');
});

test('Google uses the same PKCE callback and rejects unsupported providers', async () => {
  const f=fixture({google:true});
  assert.ok((await f.call('signIn','unsupported')).error);
  assert.equal((await f.call('signIn','google')).waiting,true);
  assert.equal(f.oauthProvider(),'google');
  const result=await fetch(f.redirect()+'?code=google-success');
  assert.match(await result.text(),/You’re in/);
  assert.equal((await f.call('get')).signedIn,true);
  f.app.emit('will-quit');
});

