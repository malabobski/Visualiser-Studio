const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { friendHandlers } = require('../community-friends');

test('friend bridge validates inputs, requires sign-in and reports missing migration', async () => {
  let signedIn = false, result = { data: [] }, calls = [];
  const handlers = friendHandlers({ rpc: async (...args) => { calls.push(args); return result; } }, () => signedIn);
  await assert.rejects(handlers.friends(), /Sign in/);
  signedIn = true;
  await assert.rejects(handlers.searchPeople('a%_'), /3 letters/);
  await assert.rejects(handlers.friendAction({ id: 'invalid', action: 'accept' }), /available/);
  await handlers.searchPeople(' @A_USER ');
  assert.deepEqual(calls.at(-2), ['community_search_people', { search_term: 'a_user' }]);
  await handlers.sendRequest(' @FRIEND ');
  assert.deepEqual(calls.at(-2), ['community_send_request', { target_username: 'friend' }]);
  result = { error: { code: 'PGRST202' } };
  await assert.rejects(handlers.friends(), /database update/);
});

test('search includes current incoming requests rather than relying on the last background refresh', async () => {
  const incoming={id:'request',person_id:'person',status:'pending',direction:'incoming'};
  const person={id:'person',username:'friend',display_name:'Friend'};
  const handlers=friendHandlers({rpc:async name=>({data:name==='community_friends'?[incoming]:[person]})},()=>true);
  const result=await handlers.searchPeople('friend');
  assert.deepEqual(result.people,[person]);
  assert.deepEqual(result.relationships,[incoming]);
});

test('PostgreSQL enforces friend request lifecycle and access for three separate users', async () => {
  const db = new PGlite();
  const ids = ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
  const [alice, bob, stranger] = ids;
  try {
    // Minimal Supabase auth environment. The migrations below are the exact
    // production files, exercised under actual Postgres roles and RLS.
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;`);
    for (const file of ['202610230001_community_profiles.sql','202610230002_community_friends.sql']) await db.exec(await fs.readFile(path.join(__dirname, '../supabase/migrations', file), 'utf8'));
    // Repeatable friends setup does not erase data or duplicate policies.
    await db.exec(await fs.readFile(path.join(__dirname, '../supabase/migrations/202610230002_community_friends.sql'), 'utf8'));
    for (const [index, id] of ids.entries()) {
      await db.query('insert into auth.users(id) values ($1)', [id]);
      await db.query('insert into public.profiles(id, username, display_name) values ($1,$2,$3)', [id, ['alice','bob_user','bobby'][index], ['Alice','Bob','Stranger'][index]]);
    }
    async function as(id, role = 'authenticated') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
      await db.exec('set role ' + role);
    }
    const send = name => db.query('select public.community_send_request($1)', [name]);
    const act = (id, action) => db.query('select public.community_friend_action($1,$2)', [id, action]);
    const list = async () => (await db.query('select * from public.community_friends()')).rows;
    await as(alice);
    assert.equal((await db.query("select * from public.community_search_people('bob')")).rows.length, 2);
    assert.equal((await db.query("select * from public.community_search_people('bob_')")).rows.length, 1, 'underscore must be literal');
    assert.equal((await db.query("select * from public.community_search_people('ali')")).rows.length, 0, 'self excluded');
    await assert.rejects(send('alice'), /yourself/);
    await assert.rejects(send('missing'), /not be found/);
    await send('bob_user');
    let items = await list(), request = items[0].id;
    assert.equal(items[0].direction, 'outgoing');
    await assert.rejects(send('bob_user'), /already connected/);
    await assert.rejects(act(request, 'accept'), /not available/);
    await assert.rejects(act(request, 'decline'), /not available/);
    await assert.rejects(db.query("update public.friendships set status='accepted' where id=$1", [request]), /permission denied/);
    await assert.rejects(db.query('insert into public.friendships(sender_id,recipient_id) values($1,$2)', [bob, stranger]), /permission denied/);
    await as(stranger);
    assert.equal((await list()).length, 0);
    assert.equal((await db.query('select * from public.friendships')).rows.length, 0, 'RLS hides unrelated relationships');
    await assert.rejects(act(request, 'accept'), /no longer available/);
    await assert.rejects(act(request, 'remove'), /no longer available/);
    await as(bob);
    await assert.rejects(send('alice'), /already connected/, 'reverse request must not create a second row');
    assert.equal((await list())[0].direction, 'incoming');
    await assert.rejects(act(request, 'cancel'), /not available/);
    await act(request, 'accept');
    assert.equal((await list())[0].status, 'accepted');
    await as(alice);
    assert.equal((await list())[0].status, 'accepted');
    await act(request, 'remove');
    assert.equal((await list()).length, 0);
    await send('bob_user'); request = (await list())[0].id;
    await act(request, 'cancel');
    assert.equal((await list()).length, 0);
    await send('bob_user'); request = (await list())[0].id;
    await as(bob); await act(request, 'decline');
    assert.equal((await list()).length, 0);
    await assert.rejects(act(request, 'accept'), /no longer available/, 'stale actions cannot recreate a request');
    await as(null, 'anon');
    await assert.rejects(list(), /permission denied/);
    await assert.rejects(send('alice'), /permission denied/);
    await assert.rejects(db.query("select * from public.community_search_people('bob')"), /permission denied/);
    await as(alice);
    await assert.rejects(db.query('update public.profiles set display_name=$1 where id=$2', ['Forged',bob]).then(r => { if(r.affectedRows === 0) throw new Error('RLS blocked'); }), /RLS blocked/);
    await db.exec('reset role');
    const cooldown = await fs.readFile(path.join(__dirname, '../supabase/migrations/202610230003_username_cooldown.sql'), 'utf8');
    await db.exec(cooldown); await db.exec(cooldown);
    await as(alice);
    assert.equal((await db.query("select * from public.community_search_people('alice')")).rows[0].id, alice, 'own profile now appears in search');
    await assert.rejects(send('alice'), /yourself/, 'self search must not permit self requests');
    const nextChange = async () => (await db.query('select public.community_username_status() as next')).rows[0].next;
    assert.equal(await nextChange(), null, 'existing accounts can change once immediately');
    await assert.rejects(db.query("update public.profiles set username='bob_user' where id=$1", [alice]), /unique/, 'taken usernames must not consume cooldown');
    assert.equal(await nextChange(), null);
    await db.query("update public.profiles set username='alice_new' where id=$1", [alice]);
    const available = await nextChange();
    assert.ok(new Date(available) > new Date());
    await assert.rejects(db.query("update public.profiles set username='alice_again' where id=$1", [alice]), /change your username again/);
    await assert.rejects(db.query("update public.profiles set username_changed_at=null where id=$1", [alice]), /permission denied/, 'clients cannot clear the cooldown');
    await db.query("update public.profiles set display_name='Updated', bio='Still editable' where id=$1", [alice]);
    assert.equal(String(await nextChange()), String(available), 'display and bio edits do not extend the cooldown');
    await db.exec('reset role');
    // Privileged fixture setup simulates elapsed time; clients cannot do this.
    await db.exec('alter table public.profiles disable trigger community_username_cooldown');
    await db.query("update public.profiles set username_changed_at=now()-interval '2 months' where id=$1", [alice]);
    await db.exec('alter table public.profiles enable trigger community_username_cooldown');
    await as(alice);
    await db.query("update public.profiles set username='alice_again' where id=$1", [alice]);
    assert.ok(new Date(await nextChange()) > new Date());
    await as(bob);
    assert.equal(await nextChange(), null, 'other accounts have their own cooldown');
    await as(null, 'anon');
    await assert.rejects(db.query('select public.community_username_status()'), /permission denied/);
  } finally { await db.close(); }
});
