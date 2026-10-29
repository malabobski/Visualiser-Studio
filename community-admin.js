const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'');
function adminHandlers(client,getUser){
 async function rpc(name,input){if(!getUser())throw Error('Sign in to use Community.');const {data,error}=await client.rpc(name,input);if(error){if(error.code==='PGRST202')throw Error('Admin tools need the new database setup file.');throw Error(error.code==='P0001'?error.message:'Couldn’t connect to Community. Try again.');}return data;}
 const username=value=>{const s=String(value||'').trim().replace(/^@/,'').toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(s))throw Error('Enter a valid username.');return s;};
 return {
  adminStatus:async()=>({admin:await rpc('community_admin_status')===true}),
  badges:async input=>{if(!Array.isArray(input)||input.length>100)throw Error('Choose up to 100 members.');return {badges:await rpc('community_badges',{usernames:input.map(username)})||[]};},
  notifications:async()=>({notifications:await rpc('community_notifications')||[]}),
  acknowledgeNotifications:async ids=>{if(!Array.isArray(ids)||ids.length>30||!ids.every(uuid))throw Error('Choose valid notifications.');await rpc('community_ack_notifications',{notification_ids:ids});return {acknowledged:true};},
  admin:async input=>{
   const action=input?.action;let name,args;
   if(action==='pin'){if(!uuid(input.id)||typeof input.pinned!=='boolean')throw Error('Choose a post.');name='community_admin_pin';args={post_id:input.id,pin:input.pinned};}
   else if(action==='edit'){if(!uuid(input.id)||typeof input.body!=='string'||input.body.length>1000||input.template_name!==undefined&&(typeof input.template_name!=='string'||!input.template_name.trim()||input.template_name.length>120))throw Error('Check the post text and template name.');name='community_admin_edit';args={post_id:input.id,message_body:input.body,template_name:input.template_name??null};}
   else if(action==='announce'){if(typeof input.body!=='string'||!input.body.trim()||input.body.length>1000)throw Error('Write an announcement of up to 1,000 characters.');name='community_admin_announce';args={message_body:input.body};}
   else if(action==='verify'){if(typeof input.verified!=='boolean')throw Error('Choose a verification setting.');name='community_admin_verify';args={target_username:username(input.username),verify:input.verified};}
   else if(action==='notify'){if(typeof input.title!=='string'||!input.title.trim()||input.title.length>80||typeof input.body!=='string'||!input.body.trim()||input.body.length>500)throw Error('Add a notification title and message.');name='community_admin_notify';args={target_username:username(input.username),notification_title:input.title,message_body:input.body};}
   else if(action==='notify_all'){if(!uuid(input.requestId)||typeof input.title!=='string'||!input.title.trim()||input.title.length>80||typeof input.body!=='string'||!input.body.trim()||input.body.length>500)throw Error('Add a notification title and message.');name='community_admin_notify_all';args={request_id:input.requestId,notification_title:input.title,message_body:input.body};}
   else throw Error('Choose an available admin action.');
   return {result:await rpc(name,args)};
  }
 };
}
module.exports={adminHandlers};
