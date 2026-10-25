const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {cleanSharedLook,feedHandlers}=require('../community-feed');

test('announcements load independently of feed filters and never expose attached private look data',async()=>{
  let selected,table,filter,limit;const query={select:value=>{selected=value;return query;},eq:(key,value)=>{filter=[key,value];return query;},order:()=>query,limit:async value=>{limit=value;return {data:[{id:'post',author_id:'me',announcement:true,profiles:{username:'creator',display_name:'Creator'},look:{style:'bars',audioPath:'private'}}]};}};
  const h=feedHandlers({from:name=>{table=name;return query;}},()=>({id:'me'}));
  const result=await h.announcements();assert.equal(table,'community_posts');assert.deepEqual(filter,['announcement',true]);assert.equal(limit,50);assert.match(selected,/profiles.*username,display_name/);assert.equal(result.posts[0].is_own,true);assert.equal(result.posts[0].username,'creator');assert.equal(result.posts[0].look.audioPath,undefined);
  await assert.rejects(feedHandlers({},()=>null).announcements(),/Sign in/);
});

test('shared looks retain supported visuals and strip audio, images, MIDI and automation',async()=>{
  const look=cleanSharedLook({style:'bars',colour:'#ff0066',params:[999999],midi:{bytes:'private'},stage:{layers:[{src:'private-image'}]},audioPath:'C:/secret.wav',automation:[{private:true}],transition:{secret:true}});
  assert.equal(look.style,'bars');assert.equal(look.colour,'#ff0066');
  assert.doesNotMatch(JSON.stringify(look),/private|secret|audioPath|automation|transition|midi|stage/);
  let last;const handlers=feedHandlers({rpc:async(name,input)=>{last={name,input};return {data:[]};}},()=>true);
  await assert.rejects(handlers.publishPost({body:''}),/Write/);
  await assert.rejects(handlers.publishPost({body:'x'.repeat(1001)}),/1,000/);
  await handlers.publishPost({body:'Hi',look:{style:'bars',audioPath:'private'}});
  assert.equal(last.name,'community_publish_post');assert.equal(last.input.post_body,'Hi');
  assert.equal(last.input.shared_look.audioPath,undefined);
  await assert.rejects(feedHandlers({},()=>null).feed(),/Sign in/);
});

test('Postgres feed permissions, opt-in signup, friends filtering and pagination',async()=>{
  const db=new PGlite();
  const ids=Array.from({length:4},(_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`);
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    for(const file of ['202610230001_community_profiles.sql','202610230002_community_friends.sql','202610230003_username_cooldown.sql','202610230004_community_feed.sql'])await db.exec(await fs.readFile(path.join(__dirname,'../supabase/migrations',file),'utf8'));
    await db.exec(await fs.readFile(path.join(__dirname,'../supabase/migrations/202610230004_community_feed.sql'),'utf8'));
    for(const id of ids)await db.query('insert into auth.users values($1)',[id]);
    const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);};
    const create=async(name,announce)=>db.query('select * from public.community_create_profile($1,$2,$3,$4)',[name,name,'',announce]);
    const feed=async(scope='everyone',cursor)=> (await db.query('select * from public.community_feed($1,$2,$3)',[scope,cursor?.created_at||null,cursor?.id||null])).rows;
    await as(ids[0]);await create('alice',false);
    assert.equal((await feed()).length,0,'signup announcement is OFF by default');
    await as(ids[1]);await create('bobby',true);
    let rows=await feed();assert.equal(rows.length,1);assert.equal(rows[0].kind,'joined');assert.equal(rows[0].is_own,true);
    await assert.rejects(create('bobby_new',true),/unique|duplicate/, 'cannot create extra signup announcements');
    await db.query('select public.community_send_request($1)',['alice']);
    await as(ids[0]);
    assert.equal((await feed('friends')).length,0,'pending request does not count as a friend');
    const request=(await db.query('select * from public.community_friends()')).rows[0];
    await db.query('select public.community_friend_action($1,$2)',[request.id,'accept']);
    assert.equal((await feed('friends')).length,1,'accepted friend intro appears');
    const look=cleanSharedLook({style:'radial',colour:'#ff0066'});
    const published=(await db.query('select public.community_publish_post($1,$2) as id',['A shared look',look])).rows[0].id;
    assert.equal((await feed())[0].kind,'look');
    await assert.rejects(db.query('select public.community_publish_post($1,null)',['Too soon']),/moment/);
    await assert.rejects(db.query('select public.community_publish_post($1,$2)',['Bad look',{...look,audioPath:'private'}]),/invalid/);
    await assert.rejects(db.query("insert into public.community_posts(author_id,kind,body) values($1,'text','fake')",[ids[1]]),/permission denied/);
    await assert.rejects(db.query("update public.community_posts set body='forged'"),/permission denied/);
    await as(ids[2]);await create('stranger',false);
    assert.equal((await feed('everyone')).length,2);assert.equal((await feed('friends')).length,0);
    await assert.rejects(db.query('select public.community_delete_post($1)',[published]),/no longer available/);
    await as(ids[3]);
    await assert.rejects(db.query('select public.community_publish_post($1,null)',['No profile']),/Save your profile/);
    await as(ids[0]);await db.query('select public.community_delete_post($1)',[published]);
    assert.equal((await feed()).length,1);
    // Fixture older text posts directly as the database owner, not a client.
    await db.exec('reset role');
    for(let i=0;i<35;i++)await db.query("insert into public.community_posts(author_id,kind,body,created_at) values($1,'text',$2,now()-interval '1 day')",[ids[0],'Old post '+i]);
    await as(ids[0]);const first=await feed(),second=await feed('everyone',first.at(-1));
    assert.equal(first.length,30);assert.equal(second.length,6);assert.equal(new Set([...first,...second].map(p=>p.id)).size,36,'stable pagination at equal timestamps');
    assert.deepEqual(Object.keys(first[0]).sort(),['id','kind','body','look','created_at','username','display_name','is_own'].sort());
    await as(null,'anon');await assert.rejects(feed(),/permission denied/);
    await assert.rejects(db.query('select public.community_publish_post($1,null)',['Anon']),/permission denied/);
    await assert.rejects(db.query('select * from public.community_posts'),/permission denied/);
  } finally {await db.close();}
});
