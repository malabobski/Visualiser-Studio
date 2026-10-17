const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { MacAutomation } = require('../mac-automation');
const { MacNowPlaying } = require('../mac-now-playing');
const { MediaVolume } = require('../media-volume');
const { installMacMenu } = require('../mac-menu');

test('Mac automation passes values as arguments and handles permission failures', async () => {
  let invocation;
  const helper = new MacAutomation({ execute: (command, args, options, done) => {
    invocation = { command, args, options }; done(null, '{"ok":true}');
  } });
  const id = 'literal $(do not run) `value`';
  assert.equal((await helper.run('control', { sourceAppId:id })).ok, true);
  assert.equal(invocation.command, '/usr/bin/osascript');
  assert.equal(JSON.parse(invocation.args.at(-1)).sourceAppId, id);
  assert(invocation.options.timeout > 0);
  assert(!invocation.options.shell);
  assert.equal(helper.children.size, 0);
  const denied = new MacAutomation({ execute: (_command, _args, _options, done) => done(Error('Not authorized -1743')) });
  assert.match((await denied.run('poll')).reason, /Automation/);
  helper.stop();
  assert.equal((await helper.run('poll')).ok, false);
});

test('Mac automation cancels outstanding child processes on shutdown', async () => {
  let callback, killed = 0;
  const child = { kill() { killed++; callback(Error('Stopped')); } };
  const helper = new MacAutomation({ execute: (_command, _args, _options, done) => { callback=done; return child; } });
  const result = helper.run('poll');
  helper.stop();
  assert.equal((await result).ok, false);
  assert.equal(killed, 1);
});

function jxa(apps = {}, system = {}) {
  const context = vm.createContext({ Application: Object.assign(id => {
    if (!apps[id]) return { running: () => false };
    return apps[id];
  }, { currentApplication: () => system }) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../mac-media.jxa'), 'utf8'), context);
  return (operation, args = {}) => JSON.parse(context.run([operation, JSON.stringify(args)]));
}
function player(state = 'playing', name = 'Track') {
  let position = 12, volume = 75;
  return { running: () => true, playerState: () => state,
    currentTrack: () => ({ name:()=>name, artist:()=> 'Artist', album:()=> 'Album', duration:()=>120000, artworkUrl:()=>'', id:()=>name, persistentID:()=>name }),
    get playerPosition() { return () => position; }, set playerPosition(value) { position=value; },
    get soundVolume() { return () => volume; }, set soundVolume(value) { volume=value; },
    actions:[], playpause() { this.actions.push('toggle'); }, nextTrack() { this.actions.push('next'); }, previousTrack() { this.actions.push('previous'); }
  };
}

test('Mac player discovery prefers playing media, supports explicit source and preserves positions', () => {
  const spotify = player('paused', 'Spotify track'), music = player('playing', 'Music track');
  const run = jxa({ 'com.spotify.client':spotify, 'com.apple.Music':music });
  let result = run('poll');
  assert.equal(result.media.sourceAppId, 'com.apple.Music');
  assert.equal(result.media.position, 12);
  assert.equal(result.media.playbackStatus, 'Playing');
  result = run('poll', { preferred:'com.spotify.client' });
  assert.equal(result.media.title, 'Spotify track');
  assert.equal(result.media.end, 120);
  spotify.playerState = () => 'playing';
  assert.equal(run('poll', { previous:'com.apple.Music' }).media.sourceAppId, 'com.apple.Music');
  assert.equal(jxa()('poll').media, null);
});

test('Mac scripting controls only supported running players and validates seek and volume', () => {
  const spotify=player(), run=jxa({ 'com.spotify.client':spotify });
  const args={sourceAppId:'com.spotify.client'};
  assert.equal(run('control',{...args,action:'toggle'}).ok,true);
  assert.deepEqual(spotify.actions,['toggle']);
  assert.equal(run('control',{...args,action:'seek',position:28}).ok,true);
  assert.equal(spotify.playerPosition(),28);
  assert.equal(run('control',{...args,action:'seek',position:-1}).ok,false);
  assert.equal(run('app-volume',{...args,value:32}).value,32);
  assert.equal(run('app-volume',{...args,value:101}).ok,false);
  assert.equal(run('control',{sourceAppId:'arbitrary-app',action:'toggle'}).ok,false);
});

test('system volume uses Standard Additions without app discovery', () => {
  let value=60, muted=true;
  const system={ getVolumeSettings:()=>({outputVolume:value,outputMuted:muted}),setVolume(_unused,options){value=options.outputVolume;muted=options.outputMuted;} };
  const run=jxa({},system);
  assert.equal(run('system-volume').muted,true);
  assert.equal(run('system-volume',{value:31}).value,31);
  assert.equal(muted,false);
  assert.equal(run('system-volume',{value:150}).ok,false);
});

test('Mac volume service routes each target and rejects unknown app sessions', async () => {
  const calls=[];
  const service=new MediaVolume({platform:'darwin',automation:{async run(...args){calls.push(args);return{ok:true,available:true,value:52};}}});
  assert.equal((await service.request('system')).value,52);
  assert.equal(calls[0][0],'system-volume');
  assert.equal((await service.request('app','com.spotify.client',41)).available,true);
  assert.equal(calls[1][0],'app-volume');
  assert.equal((await service.request('app','browser')).available,false);
  assert.equal((await service.request('system','',NaN)).available,false);
  assert.equal(calls.length,2);
});

test('poll results from an old source are discarded when changing the selected player', async () => {
  let done, updates=[];
  const service=new MacNowPlaying({automation:{run:()=>new Promise(resolve=>done=resolve)},onChange:media=>updates.push(media)});
  service.stopped=false;
  const pending=service.poll();
  service.setPreferred('com.apple.Music');
  done({ok:true,media:{title:'Old track',sourceAppId:'com.spotify.client'}});
  await pending;service.stop();
  assert(updates.every(media=>media===null));
  assert.equal(service.setPreferred('unknown'),false);
});

test('artwork is cached and cannot fetch arbitrary hosts or unbounded images', async () => {
  let requests=0;
  const service=new MacNowPlaying({automation:{},onChange(){},fetchArtwork:async()=>{requests++;return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});}});
  const media={sourceAppId:'com.spotify.client',trackId:'1',artworkUrl:'http://127.0.0.1/private'};
  assert.equal(await service.readArtwork(media),'');assert.equal(requests,0);
  media.artworkUrl='https://i.scdn.co/image/test';
  assert.match(await service.readArtwork(media),/^data:image\/png;base64,/);
  await service.readArtwork(media);assert.equal(requests,1);
  const big=new MacNowPlaying({automation:{},onChange(){},fetchArtwork:async()=>new Response(new Uint8Array(4*1024*1024+1),{headers:{'content-type':'image/png'}})});
  assert.equal(await big.readArtwork(media),'');
});

test('Mac menu keeps text editing native and leaves editor undo shortcuts to the app', () => {
  let template,shown=0,quit=0;
  installMacMenu({Menu:{buildFromTemplate(value){template=value;return value;},setApplicationMenu(){}},app:{setAboutPanelOptions(){},getVersion:()=> 'test'},showMain:()=>shown++,requestExit:()=>quit++});
  template[0].submenu.find(item=>item.label==='Show Visualiser Studio').click();
  template[0].submenu.find(item=>item.accelerator==='Command+Q').click();
  assert.equal(shown,1);assert.equal(quit,1);
  assert.equal(template[1].submenu.find(item=>item.role==='undo').accelerator,null);
  assert(template[1].submenu.some(item=>item.role==='paste'));
});

test('real Mac script invocation returns a structured volume result', {skip:process.platform!=='darwin'}, async () => {
  const helper=new MacAutomation();
  try {
    const result=await helper.run('system-volume');
    assert.equal(typeof result.ok,'boolean');
    if(result.available)assert(result.value>=0&&result.value<=100);
    else assert(result.reason);
  } finally {helper.stop();}
});
