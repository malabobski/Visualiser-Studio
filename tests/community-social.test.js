const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {PGlite}=require('@electric-sql/pglite');
const {messageStore,socialHandlers}=require('../community-messages');
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
test('social database enforces private delivery, expiry, activity consent and blocking',async()=>{
  const db=new PGlite();try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const files=(await fs.readdir(path.join(__dirname,'../supabase/migrations'))).filter(f=>f.endsWith('.sql')).sort();
    for(const file of files)await db.exec(await fs.readFile(path.join(__dirname,'../supabase/migrations',file),'utf8'));
    await db.exec(await fs.readFile(path.join(__dirname,'../supabase/migrations/202610230005_community_social.sql'),'utf8'));
    const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);};
    const rpc=async(name,args=[])=>db.query('select * from public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args);
    for(let i=0;i<ids.length;i++){await db.exec('reset role');await db.query('insert into auth.users values($1)',[ids[i]]);await as(ids[i]);await rpc('community_create_profile',['user'+i,'User '+i,'',false]);}
    await as(ids[0]);assert.equal((await rpc('community_social_settings')).rows[0].community_social_settings,false);
    await rpc('community_set_activity',[true,'Listening to a favourite']);
    await as(ids[2]);assert.equal((await rpc('community_friend_activity')).rows.length,0);
    await as(ids[1]);await rpc('community_send_request',['user0']);await as(ids[0]);let request=(await rpc('community_friends')).rows[0];await rpc('community_friend_action',[request.id,'accept']);
    await as(ids[1]);assert.equal((await rpc('community_friend_activity')).rows[0].activity,'Listening to a favourite');
    assert.equal((await rpc('community_person',['user0'])).rows[0].relationship.status,'accepted');
    await as(ids[2]);assert.equal((await rpc('community_person',['user0'])).rows[0].activity,'','strangers cannot read activity through profile cards');
    await db.exec('reset role');await db.query("update public.community_activity set updated_at=now()-interval '91 seconds'");await as(ids[1]);assert.equal((await rpc('community_friend_activity')).rows.length,0,'stale activity disappears');
    await as(ids[0]);await rpc('community_set_activity',[false,'private']);await as(ids[1]);assert.equal((await rpc('community_friend_activity')).rows.length,0);
    const msg='10000000-0000-4000-8000-000000000001';await rpc('community_dm_send',[msg,ids[0],'Hello']);
    await assert.rejects(db.query('select * from public.community_messages'),/permission denied/);
    await as(ids[2]);assert.equal((await rpc('community_dm_receive',[ids[1]])).rows.length,0);await rpc('community_dm_ack',[[msg]]);
    await assert.rejects(rpc('community_dm_send',['10000000-0000-4000-8000-000000000002',ids[0],'Stranger']),/only message your friends/);
    await as(ids[0]);assert.equal((await rpc('community_dm_inbox')).rows[0].unread,1);assert.equal((await rpc('community_dm_receive',[ids[1]])).rows[0].body,'Hello');
    await rpc('community_dm_ack',[[msg]]);assert.equal((await rpc('community_dm_receive',[ids[1]])).rows.length,0);
    await as(ids[1]);await rpc('community_dm_send',[msg,ids[0],'Retry']);await as(ids[0]);assert.equal((await rpc('community_dm_inbox')).rows.length,0,'idempotent retry cannot resurrect an acknowledged message');
    await db.exec('reset role');await db.query("update public.community_dm_receipts set created_at=now()-interval '2 seconds'");
    await as(ids[1]);const msg2='10000000-0000-4000-8000-000000000002';await rpc('community_dm_send',[msg2,ids[0],'Expire me']);
    await db.exec('reset role');await db.query("update public.community_messages set expires_at=now()-interval '1 second'");
    await as(ids[0]);assert.equal((await rpc('community_dm_inbox')).rows.length,0);await assert.rejects(rpc('community_expire_messages'),/permission denied/);
    await db.exec('reset role');await rpc('community_expire_messages');assert.equal((await db.query('select * from public.community_messages')).rows.length,0);
    await as(ids[0]);await rpc('community_block_person',[ids[1],true]);assert.equal((await rpc('community_person',['user1'])).rows[0].blocked,true);
    await as(ids[1]);await assert.rejects(rpc('community_send_request',['user0']),/unavailable/);await assert.rejects(rpc('community_dm_send',['10000000-0000-4000-8000-000000000003',ids[0],'Blocked']),/only message/);
    const look=require('../community-feed').cleanSharedLook({style:'bars',template_name:'My saved name'});await rpc('community_publish_post',['',look]);assert.equal((await rpc('community_feed')).rows[0].look.template_name,'My saved name');
    await as(null,'anon');for(const name of ['community_social_settings','community_friend_activity','community_dm_inbox'])await assert.rejects(rpc(name),/permission denied/);
  }finally{await db.close();}
});
test('send saves the sender copy first and retries reuse its ID without duplicating history',async()=>{
  let history={version:1,conversations:{}},failWrite=false,failNetwork=true,calls=[];
  const store={available:()=>true,read:async()=>structuredClone(history),update:async(_,mutate)=>{if(failWrite)throw Error('write failed');const draft=structuredClone(history);await mutate(draft);history=draft;return draft;}};
  const peer={id:ids[1],username:'friend',display_name:'Friend',relationship:{status:'accepted'}};
  const client={rpc:async(name,args)=>{
    if(name==='community_person')return {data:[peer]};
    if(name==='community_dm_send'){assert.equal(history.conversations[peer.id].messages[0].status,'pending');calls.push(args);if(failNetwork)return {error:{code:'NETWORK'}};}
    return {data:null};
  }};
  const h=socialHandlers(client,()=>({id:ids[0]}),store);
  failWrite=true;await assert.rejects(h.dmSend({username:'friend',body:'hello'}),/write failed/);assert.equal(calls.length,0);
  failWrite=false;const result=await h.dmSend({username:'friend',body:'hello'});assert.equal(result.queued,true);assert.equal(history.conversations[peer.id].messages.length,1);
  failNetwork=false;await h.dmSend({username:'friend',body:'hello',retryId:result.id});assert.equal(calls[0].message_id,calls[1].message_id);assert.equal(history.conversations[peer.id].messages.length,1);assert.equal(history.conversations[peer.id].messages[0].status,'sent');
  await assert.rejects(h.dmSend({username:'friend',body:'hello',retryId:result.id}),/already been sent/);
});
test('unread counts remain available for notifications when encrypted history is unavailable',async()=>{
 const calls=[],client={rpc:async(name)=>{calls.push(name);return{data:[{person_id:ids[1],username:'friend',display_name:'Friend',unread:1}]};}};
 const h=socialHandlers(client,()=>({id:ids[0]}),{available:()=>false,read:async()=>{throw Error('Secure history unavailable');}});
 const result=await h.dmInbox();assert.equal(result.conversations[0].unread,1);assert.equal(result.warning,'Secure history unavailable');assert.deepEqual(calls,['community_dm_inbox'],'unread metadata never receives or acknowledges message bodies');
});
test('DM acknowledgement follows durable storage; save failure never deletes a server message',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vs-dm-'));let encrypted=true,fail=false;
  const safe={isEncryptionAvailable:()=>encrypted,encryptString:s=>{if(fail)throw Error('disk encryption failed');return Buffer.from('encrypted:'+s);},decryptString:b=>b.toString().slice(10)};
  const store=messageStore(dir,safe),peer={id:ids[1],username:'friend',display_name:'Friend',relationship:{status:'accepted'}};let ack=0;
  const client={rpc:async(name)=>{if(name==='community_person')return {data:[peer]};if(name==='community_dm_receive')return {data:[{id:'10000000-0000-4000-8000-000000000001',sender_id:peer.id,body:'Hello',created_at:new Date().toISOString()}]};if(name==='community_dm_ack'){const data=await store.read(ids[0]);assert.equal(data.conversations[peer.id].messages[0].body,'Hello');ack++;}return {data:null};}};
  const handlers=socialHandlers(client,()=>({id:ids[0]}),store);
  try{let result=await handlers.dmOpen('friend');assert.equal(ack,1);assert.equal(result.messages.length,1);
    await handlers.dmOpen('friend');assert.equal((await store.read(ids[0])).conversations[peer.id].messages.length,1);
    fail=true;result=await handlers.dmOpen('friend');assert.match(result.warning,/encryption/);assert.equal(ack,2,'failed write never acknowledged');
    encrypted=false;await assert.rejects(handlers.dmOpen('friend'),/Secure message history/);assert.equal(ack,2);
    encrypted=true;fail=false;await fs.writeFile(path.join(dir,ids[0]+'.bin'),'corrupt');await assert.rejects(handlers.dmOpen('friend'),/kept safely/);assert.equal(await fs.readFile(path.join(dir,ids[0]+'.bin'),'utf8'),'corrupt');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
