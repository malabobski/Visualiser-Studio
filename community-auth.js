const http = require('node:http');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const config = require('./community-config');
const { encryptedStorage, cleanProfile } = require('./community-storage');

// A short-lived loopback listener only accepts this attempt's random path.
// PKCE binds the returned code to the verifier held by this process.
async function callbackListener(onCode, onFailure, timeout = 300000) {
  const callbackPath = '/community/callback/' + randomBytes(24).toString('hex');
  let busy = false, timer, closed = false;
  const close = () => { if (closed) return; closed = true; clearTimeout(timer); server.close(); server.closeIdleConnections?.(); };
  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); } catch { res.writeHead(400).end(); return; }
    if (req.method !== 'GET' || url.pathname !== callbackPath || busy) { res.writeHead(404).end(); return; }
    // An unrelated request cannot consume a pending sign-in.
    if (!url.searchParams.has('code') && !url.searchParams.has('error')) { res.writeHead(400).end(); return; }
    busy = true;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (url.searchParams.has('error')) throw new Error('Sign-in was cancelled. Try again when you’re ready.');
      await onCode(url.searchParams.get('code'));
      res.end('<html><title>Visualiser Studio</title><body style="background:#10121b;color:#edf0ff;font:18px system-ui;padding:12vh 8vw"><h1>You’re in.</h1><p>You can return to Visualiser Studio and close this tab.</p></body></html>');
    } catch {
      onFailure('Sign-in couldn’t finish. Please try again.');
      res.end('<html><title>Visualiser Studio</title><body><h1>Sign-in didn’t finish.</h1><p>Return to Visualiser Studio and try again.</p></body></html>');
    } finally { close(); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  timer = setTimeout(() => { close(); onFailure('Sign-in timed out. You can try again.'); }, timeout);
  timer.unref?.();
  return { url: `http://127.0.0.1:${server.address().port}${callbackPath}`, close };
}

function setupCommunity({ app, ipcMain, safeStorage, shell, getWindow, getOrigin, onSignedIn, clientFactory = createClient, fetcher = fetch }) {
  const storage = encryptedStorage(path.join(app.getPath('userData'), 'community-session.bin'), safeStorage);
  const client = clientFactory(config.url, config.publishableKey, { global: { fetch: (url, options = {}) => fetcher(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }) }, auth: { flowType: 'pkce', storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  let user = null, profile = null, pending = null, message = '', ready;
  const state = () => ({ signedIn: !!user, accountId:user?.id||null, profile, waiting: !!pending, message, remembersSignIn: storage.persistent() });
  const emit = () => { const win = getWindow(); if (win && !win.isDestroyed()) win.webContents.send('community:state', state()); };
  function profileError(error) {
    if (error.code === 'PGRST202') return 'Profile creation needs the new feed database setup file.';
    if (error.code === 'P0001' && error.message?.startsWith('You can change your username again on ')) return error.message;
    if (['42P01', 'PGRST205'].includes(error.code)) return 'The Community database still needs its setup file. Your sign-in is saved.';
    if (error.code === '23505') return 'That username is already taken. Try another.';
    return 'Couldn’t reach your profile. Check your connection and try again.';
  }
  async function usernameStatus(value) {
    if (!value) return value;
    try {
      const { data, error } = await client.rpc('community_username_status');
      return { ...value, username_change_available_at: error ? null : data };
    } catch { return value; } // Older databases still allow profile editing.
  }
  async function loadProfile() {
    if (!user) return;
    const { data, error } = await client.from('profiles').select('username,display_name,bio,created_at').eq('id', user.id).maybeSingle();
    if (error) { message = profileError(error); return; }
    profile = await usernameStatus(data) || { username: '', display_name: String(user.user_metadata?.full_name || user.user_metadata?.name || '').slice(0,40), bio: '' };
  }
  ready = (async () => {
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      user = data.session?.user || null;
      await loadProfile();
    } catch { message = 'Couldn’t restore your sign-in. Check your connection or sign in again.'; }
  })();
  // Supabase calls this under its auth lock: don't await further auth calls here.
  const subscription = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { user = null; profile = null; emit(); }
    else if (event === 'TOKEN_REFRESHED' && session) user = session.user;
  });
  const cancel = () => { pending?.close(); pending = null; };
  const fail = text => { cancel(); message = text; emit(); };
  async function signIn(provider = 'discord') {
    if (!['discord','google'].includes(provider)) throw new Error('Choose Discord or Google.');
    if (pending || user) return state();
    message = '';
    const response = await fetcher(config.url + '/auth/v1/settings', { headers: { apikey: config.publishableKey }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Community is unavailable. Please try again shortly.');
    if (!(await response.json()).external?.[provider]) throw new Error(`${provider==='google'?'Google':'Discord'} sign-in hasn’t been enabled yet. Complete the Community setup first.`);
    const attempt = await callbackListener(async code => {
      if (pending !== attempt) throw new Error('Sign-in expired.');
      operation = true;
      try {
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;
        user = data.user; profile = null; pending = null; message = '';
        // Return immediately after verification, rather than waiting for the
        // profile/database requests to finish behind the browser window.
        try {
          if (onSignedIn) onSignedIn();
          else { const win=getWindow(); if(win&&!win.isDestroyed()){if(win.isMinimized?.())win.restore();win.show();win.focus();} }
        } catch { /* Window activation must not discard a valid sign-in. */ }
        await loadProfile(); emit();
      } finally { operation = false; }
    }, fail);
    pending = attempt;
    try {
      const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: pending.url, skipBrowserRedirect: true, ...(provider==='discord'?{scopes:'identify'}:{queryParams:{prompt:'select_account'}}) } });
      if (error) throw error;
      const url = new URL(data.url);
      if (url.origin !== config.url || url.pathname !== '/auth/v1/authorize') throw new Error('Invalid sign-in address.');
      await shell.openExternal(url.href);
      emit(); return state();
    } catch (error) { cancel(); throw error; }
  }
  let operation = false;
  const handlers = {
    ...require('./community-friends').friendHandlers(client, () => user),
    ...require('./community-feed').feedHandlers(client, () => user),
    ...require('./community-admin').adminHandlers(client, () => user),
    ...require('./community-messages').socialHandlers(client, () => user, require('./community-messages').messageStore(path.join(app.getPath('userData'),'community-messages'),safeStorage)),
    get: async () => state(),
    signIn,
    cancel: async () => { cancel(); message = ''; emit(); return state(); },
    refresh: async () => { message = ''; await loadProfile(); emit(); return state(); },
    signOut: async () => {
      cancel();
      // Expire the current description immediately; the opt-in preference stays.
      await client.rpc('community_social_settings').then(async ({data})=>{if(data===true)await client.rpc('community_set_activity',{shared:true,description:''});}).catch(()=>{});
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new Error('Couldn’t sign out. Check your connection and try again.');
      user = null; profile = null; message = ''; emit(); return state();
    },
    saveProfile: async input => {
      if (!user) throw new Error('Sign in before saving your profile.');
      const clean = cleanProfile(input);
      const query = profile?.created_at ? client.from('profiles').update(clean).eq('id', user.id) : client.rpc('community_create_profile',{...clean,announce:input?.announce===true});
      const { data, error } = await query.select('username,display_name,bio,created_at').single();
      if (error) throw new Error(profileError(error));
      profile = await usernameStatus(data); message = 'Profile saved.'; emit(); return state();
    }
  };
  for (const [action, handler] of Object.entries(handlers)) ipcMain.handle('community:' + action, async (event, input) => {
    const win = getWindow();
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return { error: 'Unavailable here.' };
    try { if (new URL(event.senderFrame.url).origin !== getOrigin()) return { error: 'Unavailable here.' }; }
    catch { return { error: 'Unavailable here.' }; }
    await ready;
    // Background reads must not dim or block foreground profile/friend actions.
    if (['friends','feed','announcements','person','socialSettings','friendActivity','dmInbox','adminStatus','badges','notifications'].includes(action)) {
      const account = user?.id;
      try {
        const result = await handler(input);
        return user?.id === account ? result : { error: 'Sign in to use friends.' };
      } catch (error) { return { error: error.message }; }
    }
    if (operation) return { error: 'Please wait for the current action to finish.' };
    operation = true;
    try { return await handler(input); }
    catch (error) { return { error: /fetch|network/i.test(error.message) ? 'Couldn’t connect. Check your internet connection and try again.' : error.message }; }
    finally { operation = false; }
  });
  app.once('will-quit', () => { cancel(); client.auth.stopAutoRefresh(); subscription.data.subscription.unsubscribe(); });
}
module.exports = { setupCommunity, callbackListener };
