const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),{adminHandlers}=require('../community-admin');
test('admin bridge validates actions and never trusts a supplied role',async()=>{
 let called;const h=adminHandlers({rpc:async(name,args)=>{called={name,args};return {data:true};}},()=>({id:'owner'}));
 await assert.rejects(h.admin({action:'grantAdmin',username:'other',role:'admin'}),/available admin action/);
 await assert.rejects(h.admin({action:'verify',username:'name',verified:'true'}),/verification/);
 await h.admin({action:'verify',username:'@name',verified:true});assert.deepEqual(called,{name:'community_admin_verify',args:{target_username:'name',verify:true}});
 await assert.rejects(adminHandlers({},()=>null).adminStatus(),/Sign in/);
});
test('only the bound owner can moderate, verify or notify; badges follow UUIDs and recipients stay private',async()=>{
 const db=new PGlite(),ids=Array.from({length:3},(_,i)=>'00000000-0000-4000-8000-00000000000'+(i+1));
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  const files=(await fs.readdir(path.join(__dirname,'../supabase/migrations'))).filter(f=>f.endsWith('.sql')).sort();for(const file of files)await db.exec(await fs.readFile(path.join(__dirname,'../supabase/migrations',file),'utf8'));
  await db.exec(await fs.readFile(path.join(__dirname,'../supabase/migrations/202610230006_community_admin.sql'),'utf8'));
  const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);};
  const rpc=(name,args=[])=>db.query('select * from public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args);
  for(let i=0;i<ids.length;i++){await db.exec('reset role');await db.query('insert into auth.users values($1)',[ids[i]]);await as(ids[i]);await rpc('community_create_profile',[i===0?'malchim':'user'+i,'User '+i,'',false]);}
  await db.exec('reset role');await db.exec(await fs.readFile(path.join(__dirname,'../supabase/community-admin-setup.sql'),'utf8'));
  await as(ids[1]);const post=(await rpc('community_publish_post',['A post',null])).rows[0].community_publish_post;
  assert.equal((await rpc('community_admin_status')).rows[0].community_admin_status,false);
  for(const [name,args]of [['community_admin_pin',[post,true]],['community_admin_announce',['Fake']],['community_admin_edit',[post,'Fake',null]],['community_admin_verify',['user1',true]],['community_admin_notify',['user2','Fake','No']]])await assert.rejects(rpc(name,args),/Admin access required/);
  await assert.rejects(db.query('insert into public.community_owner values(true,$1)',[ids[1]]),/permission denied/);
  await assert.rejects(db.query('insert into public.community_verifications values($1,true)',[ids[1]]),/permission denied/);
  await as(ids[0]);await rpc('community_admin_pin',[post,true]);await rpc('community_admin_edit',[post,'Corrected',null]);await rpc('community_admin_verify',['user1',true]);
  const template=require('../community-feed').cleanSharedLook({style:'radial'}),shared=(await rpc('community_publish_post',['',template])).rows[0].community_publish_post;
  await rpc('community_admin_edit',[shared,'VS DARK THEME','VS DARK THEME']);
  assert.equal((await rpc('community_feed_v2')).rows.find(p=>p.id===shared).look.template_name,'VS DARK THEME','admin can name a legacy shared template');
  const announcement=(await rpc('community_admin_announce',['News for everyone'])).rows[0].community_admin_announce;
  await rpc('community_admin_notify',['user1','A private notification','Hello <script>listener</script>']);
  let badges=(await rpc('community_badges',[['malchim','user1']])).rows;assert.equal(badges.find(b=>b.username==='malchim').is_admin,true);assert.equal(badges.find(b=>b.username==='user1').verified,true);
  assert.equal((await rpc('community_notifications')).rows.length,0,'sender cannot read recipient inbox');
  await as(ids[2]);const feed=(await rpc('community_feed_v2',['friends',null,null])).rows;assert.equal(feed[0].id,post);assert.equal(feed[0].body,'Corrected');assert.equal(feed[0].verified,true);assert.ok(feed[0].edited_at);assert.ok(feed.some(p=>p.id===announcement&&p.announcement),'announcements appear beyond friends filter');
  assert.equal((await rpc('community_notifications')).rows.length,0);await assert.rejects(rpc('community_delete_post',[post]),/no longer available/);
  await as(ids[1]);const notification=(await rpc('community_notifications')).rows[0];assert.equal(notification.title,'A private notification');
  await as(ids[2]);await rpc('community_ack_notifications',[[notification.id]]);await as(ids[1]);assert.equal((await rpc('community_notifications')).rows.length,1);await rpc('community_ack_notifications',[[notification.id]]);assert.equal((await rpc('community_notifications')).rows.length,0);
  await as(ids[0]);await db.query("update public.profiles set username='creator_renamed' where id=$1",[ids[0]]);await rpc('community_delete_post',[post]);
  await as(ids[2]);await db.query("update public.profiles set username='malchim' where id=$1",[ids[2]]);assert.equal((await rpc('community_admin_status')).rows[0].community_admin_status,false,'claiming the old username cannot transfer admin');
  await db.exec('reset role');await db.exec(await fs.readFile(path.join(__dirname,'../supabase/community-admin-setup.sql'),'utf8'));await as(ids[2]);assert.equal((await rpc('community_admin_status')).rows[0].community_admin_status,false,'rerunning setup cannot transfer ownership to the reused username');
  await as(ids[0]);assert.equal((await rpc('community_admin_status')).rows[0].community_admin_status,true);
  await as(null,'anon');await assert.rejects(rpc('community_admin_status'),/permission denied/);
 }finally{await db.close();}
});
