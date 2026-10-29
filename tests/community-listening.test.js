const test=require('node:test'),assert=require('node:assert/strict');
const listening=require('../community-listening');
const {socialHandlers}=require('../community-social-core');
test('song metadata rejects remote images, oversized images and unsafe links',()=>{
  assert.deepEqual(listening.clean({title:'Song',artist:'Artist',source:'Spotify',artwork:'https://example.com/tracker',url:'javascript:alert(1)'}),{title:'Song',artist:'Artist',source:'Spotify'});
  for(const url of ['https://open.spotify.com.evil.test/track/abc','https://user@open.spotify.com/track/abc','https://open.spotify.com:1234/track/abc'])assert.equal(listening.clean({title:'Song',url}).url,undefined);
  assert.equal(listening.clean({title:'Song',artwork:'data:image/svg+xml;base64,YQ=='}).artwork,undefined);
  assert.equal(listening.clean({title:'Song',artwork:'data:image/webp;base64,'+'A'.repeat(60000)}).artwork,undefined);
});
test('exact song links stay exact while searches are explicitly labelled',()=>{
  const exact=listening.destination({title:'Song',url:'https://open.spotify.com/track/abc123'});
  assert.equal(exact.exact,true);assert.equal(exact.label,'Open song');
  const search=listening.destination({title:'Song & more',artist:'A/B',source:'Spotify'});
  assert.equal(search.label,'Search Spotify');assert.equal(search.exact,false);assert(search.url.endsWith('Song%20%26%20more%20A%2FB'));
  assert.equal(listening.destination({title:'Song',source:'Apple Music'}).label,'Search Apple Music');
  assert.deepEqual(listening.legacy('Listening to Song · Artist'),{title:'Song',artist:'Artist',source:''});
  assert.equal(listening.legacy('Creating a visualiser'),null);
});
test('old databases fall back to text activity; sharing off sends no song details',async()=>{
  const calls=[],client={rpc:async(name,args)=>{calls.push([name,args]);if(name.endsWith('_v2'))return {error:{code:'PGRST202'}};return {data:[]};}};
  const handlers=socialHandlers(client,()=>({id:'00000000-0000-4000-8000-000000000001'}),{});
  await handlers.setActivity({sharing:false,activity:'private',track:{title:'Private song'}});
  assert.equal(calls[0][1].track,null);assert.equal(calls[0][1].description,'');assert.equal(calls[1][0],'community_set_activity');
  assert.deepEqual(await handlers.friendActivity(),{activities:[]});
});
test('website shared modules run without Node and enrich friend profiles with artwork',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const context=vm.createContext({URL});
  for(const name of ['community-listening.js','community-social-core.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context);
  const track={title:'Song',artist:'Artist',source:'Spotify',artwork:'data:image/webp;base64,YQ=='};
  const client={rpc:async name=>name==='community_person'?{data:[{id:'friend',activity:'Listening to Song',relationship:{status:'accepted'}}]}:{data:[{person_id:'friend',activity:'Listening to Song',track}]}};
  const handlers=context.CommunitySocialCore.socialHandlers(client,()=>({id:'00000000-0000-4000-8000-000000000001'}),{});
  const result=await handlers.person('friend');assert.equal(result.person.track.artwork,track.artwork);
  assert.equal(context.CommunityListening.destination(result.person.track).label,'Search Spotify');
});
