// Per-account encrypted browser history. Never acknowledge a server message
// until the encrypted IndexedDB transaction has completed successfully.
(() => {
 function create(){
  let opened,queue=Promise.resolve();
  const supported=()=>!!(globalThis.indexedDB&&globalThis.crypto?.subtle&&globalThis.isSecureContext);
  async function database(){if(!supported())throw Error('This browser cannot save message history securely. Server messages have been kept.');if(!opened)opened=new Promise((resolve,reject)=>{const request=indexedDB.open('visualiser-community-messages',1);request.onupgradeneeded=()=>request.result.createObjectStore('accounts');request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opened=null;};resolve(db);};request.onerror=()=>{opened=null;reject(Error('Message history could not be opened. Check this browser’s storage settings.'));};});return opened;}
  function transaction(db,mode){const tx=db.transaction('accounts',mode,{durability:'strict'});if(mode==='readwrite'&&tx.durability!=='strict'){tx.abort();throw Error('This browser cannot safely commit message history. Your server copies have been kept.');}return tx;}
  async function snapshot(account){const db=await database();return new Promise((resolve,reject)=>{const tx=transaction(db,'readonly'),req=tx.objectStore('accounts').get(account);let value;req.onsuccess=()=>value=req.result;tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(Error('Couldn’t read local message history.'));});}
  async function commit(account,expected,value){const db=await database();return new Promise((resolve,reject)=>{const tx=transaction(db,'readwrite'),store=tx.objectStore('accounts'),req=store.get(account);let conflict=false;req.onsuccess=()=>{if((req.result?.revision||0)!==expected){conflict=true;return;}store.put(value,account);};tx.oncomplete=()=>resolve(!conflict);tx.onabort=tx.onerror=()=>reject(Error('Couldn’t save encrypted message history. Your server copies have been kept.'));});}
  async function decode(entry){if(!entry)return {version:1,conversations:{}};try{const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:entry.iv,additionalData:new TextEncoder().encode(entry.account)},entry.key,entry.cipher);const value=JSON.parse(new TextDecoder().decode(bytes));if(value.version!==1||!value.conversations||Array.isArray(value.conversations))throw Error();return value;}catch{throw Error('Local message history couldn’t be decrypted. It has been kept, and no server messages were removed.');}}
  function run(account,mutate){const task=queue.then(async()=>{
    if(!/^[0-9a-f-]{36}$/i.test(account||''))throw Error('Sign in to use messages.');
    for(let attempt=0;attempt<8;attempt++){
      const entry=await snapshot(account);if(entry&&entry.account!==account)throw Error('This message history belongs to another account. No server messages were removed.');const value=await decode(entry);if(!mutate)return value;
      await mutate(value);const key=entry?.key||await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));
      const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(account)},key,new TextEncoder().encode(JSON.stringify(value)));
      if(await commit(account,entry?.revision||0,{account,revision:(entry?.revision||0)+1,key,iv,cipher}))return value;
    }throw Error('Another tab is updating messages. Please try again.');
   });queue=task.catch(()=>{});return task;}
  return {available:supported,read:account=>run(account),update:(account,mutate)=>run(account,mutate)};
 }
 window.BrowserMessageStore={create};
})();
