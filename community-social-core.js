(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CommunitySocialCore=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'');
function socialHandlers(client,getUser,store) {
  const me=()=>{const id=getUser()?.id;if(!uuid(id))throw new Error('Sign in to use Community.');return id;};
  async function rpc(name,input){me();const {data,error}=await client.rpc(name,input);if(error){
    if(['PGRST202','42P01','PGRST205'].includes(error.code))throw new Error('Community needs the new social database setup file.');
    throw new Error(error.code==='P0001'?error.message:'Couldn’t connect to Community. Please try again.');}return data;}
  const username=input=>{const name=String(input||'').replace(/^@/,'').trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(name))throw new Error('Choose a valid username.');return name;};
  async function person(input){const rows=await rpc('community_person',{target_username:username(input)});if(!rows?.[0])throw new Error('This profile is unavailable.');return rows[0];}
  function checkAccount(id){if(me()!==id)throw new Error('Your account changed. Open the conversation again.');}
  async function sync(peer,account){
    const incoming=await rpc('community_dm_receive',{peer:peer.id});checkAccount(account);
    if(incoming?.length){
      if(incoming.some(m=>!uuid(m.id)||m.sender_id!==peer.id||typeof m.body!=='string'||m.body.length>2000))throw new Error('These messages could not be saved safely.');
      await store.update(account,data=>{const chat=data.conversations[peer.id]||{messages:[]};Object.assign(chat,{username:peer.username,display_name:peer.display_name});
        const known=new Set(chat.messages.map(m=>m.id));for(const message of incoming)if(!known.has(message.id))chat.messages.push({...message,direction:'incoming',status:'saved'});
        data.conversations[peer.id]=chat;});
      checkAccount(account);await rpc('community_dm_ack',{message_ids:incoming.map(m=>m.id)});
    }
    return incoming?.length||0;
  }
  return {
    person:async input=>({person:await person(input)}),
    socialSettings:async()=>({sharing:await rpc('community_social_settings')===true,secureMessages:store.available()}),
    setActivity:async input=>{if(typeof input?.sharing!=='boolean')throw new Error('Choose whether to share activity.');await rpc('community_set_activity',{shared:input.sharing,description:input.sharing?String(input.activity||'').slice(0,180):''});return {sharing:input.sharing};},
    friendActivity:async()=>({activities:await rpc('community_friend_activity')||[]}),
    blockPerson:async input=>{if(!uuid(input?.id)||typeof input.blocked!=='boolean')throw new Error('Choose a member.');await rpc('community_block_person',{target:input.id,blocked:input.blocked});return {blocked:input.blocked};},
    dmInbox:async()=>{
      const account=me(),inbox=await rpc('community_dm_inbox');checkAccount(account);
      let data={conversations:{}},warning='';try{data=await store.read(account);}catch(error){warning=error.message;}checkAccount(account);const chats=new Map(Object.entries(data.conversations).map(([id,c])=>[id,{person_id:id,username:c.username,display_name:c.display_name,unread:0,last:c.messages.at(-1)?.created_at||''}]));
      for(const entry of inbox||[])chats.set(entry.person_id,{...chats.get(entry.person_id),...entry});
      return {conversations:[...chats.values()].sort((a,b)=>Number(b.unread>0)-Number(a.unread>0)||(b.last||'').localeCompare(a.last||'')),warning};
    },
    dmOpen:async input=>{
      const account=me(),name=username(input);let peer,warning='';
      const local=await store.read(account);
      try{peer=await person(name);checkAccount(account);}catch(error){const found=Object.entries(local.conversations).find(([,c])=>c.username===name);if(!found)throw error;peer={id:found[0],username:name,display_name:found[1].display_name};warning=error.message;}
      if(peer.id===account)throw new Error('You can’t message yourself, silly!');
      if(!warning){try{
        await store.update(account,data=>{data.conversations[peer.id]={...(data.conversations[peer.id]||{messages:[]}),username:peer.username,display_name:peer.display_name};});
        for(let batch=0;batch<10;batch++)if(await sync(peer,account)<100)break;
      }catch(error){warning=error.message;}}
      const data=await store.read(account);
      const messages=(data.conversations[peer.id]?.messages||[]).slice().sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
      return {peer,messages,warning};
    },
    dmSend:async input=>{
      const account=me(),peer=await person(input?.username);checkAccount(account);
      const body=String(input?.body||'').trim();if(!body||body.length>2000)throw new Error('Write a message of up to 2,000 characters.');
      if(peer.relationship?.status!=='accepted'||peer.blocked)throw new Error('You can only message your friends.');
      const id=input?.retryId||globalThis.crypto.randomUUID();if(!uuid(id))throw new Error('Choose a valid message.');
      let message;
      await store.update(account,data=>{const chat=data.conversations[peer.id]||{messages:[]};Object.assign(chat,{username:peer.username,display_name:peer.display_name});
        if(input.retryId){message=chat.messages.find(m=>m.id===id&&m.direction==='outgoing'&&m.status==='pending');if(!message)throw new Error('This message has already been sent.');if(Date.now()-Date.parse(message.created_at)>30*86400000)throw new Error('This unsent message expired. Write a new message.');}
        else{message={id,body,created_at:new Date().toISOString(),direction:'outgoing',status:'pending'};chat.messages.push(message);}data.conversations[peer.id]=chat;});
      try{checkAccount(account);await rpc('community_dm_send',{message_id:id,target:peer.id,message_body:message.body});checkAccount(account);
        await store.update(account,data=>{data.conversations[peer.id].messages.find(m=>m.id===id).status='sent';});return {id};
      }catch(error){return {id,queued:true,error:'Saved on this computer, but sending wasn’t confirmed. '+error.message};}
    }
  };
}

return {socialHandlers};
});
