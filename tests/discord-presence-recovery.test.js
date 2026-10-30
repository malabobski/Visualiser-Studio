const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const main=fs.readFileSync(require.resolve('../main.js'),'utf8');
const source=main.slice(main.indexOf('const DISCORD_CLIENT_ID'),main.indexOf('// Only one copy of the app'));
function fixture(request){
 let now=4000,destroyed=0;const timers=new Set(),calls=[];
 const client={request:(...args)=>{calls.push(args);return request(...args)},destroy:async()=>{destroyed++}};
 const context=vm.createContext({process:{pid:123},Date:{now:()=>now},console:{log(){}},ipcMain:{on(){}},RPC:{},setTimeout:(fn,delay)=>{const timer={fn,delay,unref(){}};timers.add(timer);return timer;},clearTimeout:timer=>timers.delete(timer)});
 vm.runInContext(source,context);context.client=client;vm.runInContext('discordClient=client;discordReady=true;discordEnabled=true;',context);
 return {calls,timers,run:code=>vm.runInContext(code,context),destroyed:()=>destroyed,fire:async delay=>{const timer=[...timers].find(t=>t.delay===delay);assert(timer,'Missing '+delay+'ms recovery timer');timers.delete(timer);now+=delay;timer.fn();await settle();}};
}
async function settle(){for(let i=0;i<12;i++)await Promise.resolve();}
test('a rejected presence is retried without a screen change, then unchanged success stays quiet',async()=>{
 let count=0;const f=fixture(()=>++count===1?Promise.reject(Error('temporary failure')):Promise.resolve({}));
 f.run('flushDiscordActivity()');await settle();assert.equal(f.calls.length,1);
 await f.fire(4000);assert.equal(f.calls.length,2);assert.equal(f.calls[1][1].activity.details,'Getting things ready…');
 f.run('flushDiscordActivity()');await settle();assert.equal(f.calls.length,2);assert.equal(f.timers.size,0);
});
test('stalled activity requests release the connection and schedule reconnection',async()=>{
 const f=fixture(()=>new Promise(()=>{}));f.run('flushDiscordActivity()');await settle();await f.fire(10000);
 assert.equal(f.destroyed(),1);assert.equal(f.run('discordReady'),false);assert.equal(f.run('discordActiveRequest'),null);assert([...f.timers].some(t=>t.delay===15000));
});
test('a disabled presence does not retry a rejected update',async()=>{
 let reject;const f=fixture(()=>new Promise((_resolve,fail)=>reject=fail));f.run('flushDiscordActivity()');await settle();f.run('discordEnabled=false');reject(Error('closed'));await settle();assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);
});
