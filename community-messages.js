const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');

// History is separate from auth storage: unreadable history must never be
// silently discarded. Commit a durable encrypted snapshot before acknowledging.
function messageStore(folder, safeStorage) {
  let queue=Promise.resolve();
  const available=()=>safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.()!=='basic_text';
  function run(account,mutate) {
    const task=queue.then(async()=>{
      if(!uuid(account))throw new Error('Sign in to use messages.');
      if(!available())throw new Error('Secure message history is unavailable on this computer. Messages will stay on the server until you can save them safely.');
      const file=path.join(folder,account+'.bin');let data={version:1,conversations:{}};
      try {data=JSON.parse(safeStorage.decryptString(await fs.readFile(file)));if(data.version!==1||!data.conversations||typeof data.conversations!=='object')throw new Error('Invalid history');}
      catch(error){if(error.code!=='ENOENT')throw new Error('Your local message history couldn’t be opened. It has been kept safely; no server messages were removed.');}
      if(mutate){await mutate(data);await fs.mkdir(folder,{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';let handle;
        try{handle=await fs.open(tmp,'wx',0o600);await handle.writeFile(safeStorage.encryptString(JSON.stringify(data)));await handle.sync();await handle.close();handle=null;await fs.rename(tmp,file);}
        finally{await handle?.close();await fs.rm(tmp,{force:true}).catch(()=>{});}
      }
      return data;
    });queue=task.catch(()=>{});return task;
  }
  return {read:account=>run(account),update:(account,mutate)=>run(account,mutate),available};
}
const {socialHandlers}=require('./community-social-core');
module.exports={messageStore,socialHandlers};
