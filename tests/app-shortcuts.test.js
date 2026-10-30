const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('Alt shortcuts follow sidebar order, including DAW, Community and Miniplayer',()=>{
 let handler;const clicks=[],settings={hidden:true};
 const document={querySelector:selector=>selector.startsWith('[data-screen=')?{click:()=>clicks.push(selector.match(/"([^"]+)"/)[1])}:null,getElementById:id=>id==='settingsWindow'?settings:{click:()=>clicks.push(id)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../app-shortcuts'),'utf8'),{document,window:{addEventListener:(_event,fn)=>handler=fn}});
 const event=digit=>({code:'Digit'+digit,key:String(digit),altKey:true,preventDefault(){},stopImmediatePropagation(){}});
 for(let digit=1;digit<=7;digit++)handler(event(digit));
 assert.deepEqual(clicks,['create','templates','batch','live','daw','community','sidebarMiniPlayer']);
 handler({...event(5),repeat:true});handler({...event(5),getModifierState:()=>true});assert.equal(clicks.length,7);
});
test('DAW and Community startup destinations use their normal navigation buttons',()=>{
 const source=fs.readFileSync(require.resolve('../startup'),'utf8');
 for(const destination of ['daw','community']){const clicks=[];vm.runInNewContext(source,{appSettings:{startupScreen:destination},window:{},requestAnimationFrame:fn=>fn(),document:{querySelector:selector=>({click:()=>clicks.push(selector)})}});assert.deepEqual(clicks,['[data-screen="'+destination+'"]']);}
});
