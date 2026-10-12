const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {UpdateService}=require('../app-updates'),{restartBlockReason}=require('../update-ui');
function fixture(options={}){
  const updater=new EventEmitter();updater.checks=0;updater.installs=0;
  updater.checkForUpdates=async()=>{updater.checks++;updater.emit('checking-for-update');updater.emit('update-not-available',{version:'1.2.0'});return{};};
  updater.quitAndInstall=(silent,restart)=>{assert.equal(silent,false);assert.equal(restart,true);updater.installs++;};
  let approved=false;
  const service=new UpdateService({updater,version:'1.2.0',enabled:true,onInstall:()=>approved=true,onInstallError:()=>approved=false,...options});
  return{updater,service,approved:()=>approved};
}
test('updates download automatically but never install on ordinary exit',()=>{
  const {updater,service}=fixture();assert.equal(updater.autoDownload,true);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(updater.allowPrerelease,false);assert.equal(updater.allowDowngrade,false);assert.equal(service.snapshot().currentVersion,'1.2.0');service.dispose();
});
test('development builds do not check, download or install',async()=>{
  const {updater,service}=fixture({enabled:false});service.start();await service.check();assert.equal(updater.checks,0);assert.equal(service.install().ok,false);assert.equal(updater.installs,0);assert.equal(service.snapshot().status,'development');service.dispose();
});
test('manual checks report current versions and do not install',async()=>{
  const {updater,service}=fixture();const state=await service.check();assert.equal(state.status,'current');assert(state.lastChecked);assert.equal(updater.installs,0);service.dispose();
});
test('overlapping checks share one request',async()=>{
  const {updater,service}=fixture();let resolve;updater.checkForUpdates=()=>{updater.checks++;return new Promise(done=>resolve=done);};
  const first=service.check(),second=service.check();await Promise.resolve();assert.equal(updater.checks,1);resolve({});await Promise.all([first,second]);service.dispose();
});
test('update progress and readiness do not restart the app',()=>{
  const {updater,service,approved}=fixture();updater.emit('update-available',{version:'1.2.1'});updater.emit('download-progress',{percent:54.3});assert.equal(service.snapshot().status,'downloading');assert.equal(service.snapshot().progress,54.3);updater.emit('update-downloaded',{version:'1.2.1'});assert.equal(service.snapshot().status,'ready');assert.equal(updater.installs,0);assert.equal(approved(),false);service.dispose();
});
test('only a downloaded update can install, and duplicate install requests are ignored',()=>{
  const {updater,service,approved}=fixture();assert.equal(service.install().ok,false);updater.emit('update-downloaded',{version:'1.2.1'});assert.equal(service.install().ok,true);assert.equal(approved(),true);assert.equal(updater.installs,1);assert.equal(service.install().ok,false);assert.equal(updater.installs,1);service.dispose();
});
test('failed installation restores normal exit confirmation',()=>{
  const {updater,service,approved}=fixture();updater.quitAndInstall=()=>updater.emit('error',new Error('Installer unavailable'));updater.emit('update-downloaded',{version:'1.2.1'});assert.equal(service.install().ok,false);assert.equal(approved(),false);assert.equal(service.snapshot().status,'error');service.dispose();
});
test('network and missing-release errors are readable and recoverable',async()=>{
  const {updater,service}=fixture();updater.checkForUpdates=async()=>{throw Error('HTTP 404 latest.yml https://secret.invalid/token');};assert.match((await service.check()).message,/No update files/);assert(!service.snapshot().message.includes('secret'));updater.checkForUpdates=async()=>{updater.emit('update-not-available',{});return{};};assert.equal((await service.check()).status,'current');service.dispose();
});
test('background download failures are handled after the version check completes',async()=>{
  const {updater,service}=fixture();let reject;updater.checkForUpdates=async()=>{updater.emit('update-available',{version:'1.2.1'});return{downloadPromise:new Promise((_resolve,fail)=>reject=fail)};};assert.equal((await service.check()).status,'downloading');reject(Error('Download lost'));await Promise.resolve();assert.equal(service.snapshot().status,'error');service.dispose();
});
test('a failed preference save preserves the previous setting',async()=>{
  const {service}=fixture({savePreference:async()=>{throw Error('Read-only folder');}});await assert.rejects(service.setAutomatic(false));assert.equal(service.snapshot().automatic,true);await assert.rejects(service.setAutomatic('false'));service.dispose();
});
test('automatic checks honour the saved setting; manual checks remain available',async context=>{
  context.mock.timers.enable({apis:['setTimeout','setInterval']});const {service,updater}=fixture();service.start(false);context.mock.timers.tick(8000);await Promise.resolve();assert.equal(updater.checks,0);await service.check();assert.equal(updater.checks,1);await service.setAutomatic(true);await Promise.resolve();await Promise.resolve();assert.equal(updater.checks,2);service.dispose();
});
test('startup check runs once after the initial delay',async context=>{
  context.mock.timers.enable({apis:['setTimeout','setInterval']});const {service,updater}=fixture();service.start();service.start();context.mock.timers.tick(7999);await Promise.resolve();assert.equal(updater.checks,0);context.mock.timers.tick(1);await Promise.resolve();assert.equal(updater.checks,1);service.dispose();
});
test('restart guards cover exports, project saves and all unfinished recording states',()=>{
  assert.match(restartBlockReason({exporting:true}),/export/);assert.match(restartBlockReason({saving:true}),/saving your project/);for(const state of ['recording','paused','saving','review'])assert.match(restartBlockReason({recording:state}),/recording/);assert.equal(restartBlockReason({recording:'idle'}),'');assert.equal(restartBlockReason({recording:'setup'}),'');
});
test('installer commands are restricted to the main app window',async()=>{
  const fs=require('fs'),vm=require('vm'),source=fs.readFileSync(require('path').join(__dirname,'../main.js'),'utf8'),handlers={},mainWindow={webContents:{},isDestroyed:()=>false};let installs=0;
  const box={mainWindow,ipcMain:{handle:(name,handler)=>handlers[name]=handler},updates:{snapshot:()=>({status:'ready'}),install:()=>{installs++;return{ok:true};},check:async()=>({status:'current'}),setAutomatic:async()=>({automatic:false})}};vm.createContext(box);vm.runInContext(source.slice(source.indexOf('const isUpdateWindow'),source.indexOf("app.on('will-quit',()=>updates.dispose())")),box);
  assert.equal(handlers['updates:install']({sender:{}}).ok,false);assert.equal(installs,0);assert.equal(handlers['updates:install']({sender:mainWindow.webContents}).ok,true);assert.equal(installs,1);
});
test('electron-builder validates the public GitHub feed and compatible installer targets',async()=>{
  const config=require('../package.json').build;await require('app-builder-lib/out/util/config/config').validateConfiguration(config,{isEnabled:false});assert.equal(config.publish[0].owner,'malabobski');assert.equal(config.publish[0].repo,'Visualiser-Studio');assert.equal(config.publish[0].releaseType,'draft');assert(!config.publish[0].token);assert.equal(config.win.target,'nsis');assert(config.mac.target.includes('zip'));
});


test('development manual checks report newer GitHub releases without downloading or installing',async()=>{
  const {service,updater}=fixture({enabled:false,version:'1.2.5',inspectLatestVersion:async()=> 'v1.2.6'});
  service.start();const result=await service.check();assert.equal(result.status,'development');assert.match(result.message,/1\.2\.6 is available/);assert(result.lastChecked);assert.equal(updater.checks,0);assert.equal(service.install().ok,false);assert.equal(updater.installs,0);service.dispose();
});
test('development manual checks recover from failures and distinguish older releases',async()=>{
  let failed=true;const {service}=fixture({enabled:false,version:'1.2.5',inspectLatestVersion:async()=>{if(failed)throw Error('offline');return 'v1.2.0';}});
  assert.match((await service.check()).message,/Couldn’t check GitHub/);failed=false;assert.match((await service.check()).message,/up to date/);service.dispose();
});
