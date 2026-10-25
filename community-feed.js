const Scenes = require('./scene-transitions');
function cleanSharedLook(input) {
  if (!input || typeof input !== 'object') throw new Error('Attach a look from Create first.');
  const clean = Scenes.look(input);
  delete clean.automation;
  const name=String(input.template_name||'').trim().slice(0,120);
  return {...clean, response:['smooth','punchy'].includes(input.response)?input.response:'balanced',...(name?{template_name:name}:{})};
}
function feedHandlers(client, getUser) {
  async function rpc(name, input) {
    if (!getUser()) throw new Error('Sign in to use the feed.');
    const {data,error} = await client.rpc(name,input);
    if (error) {
      if (['PGRST202','42P01','PGRST205'].includes(error.code)) throw new Error('The feed needs its database setup file.');
      throw new Error(error.code==='P0001'?error.message:'Couldn’t reach the feed. Please try again.');
    }
    return data;
  }
  return {
    announcements:async()=>{
      const user=getUser();if(!user)throw new Error('Sign in to use the feed.');
      const {data,error}=await client.from('community_posts').select('id,kind,body,look,created_at,author_id,pinned,announcement,edited_at,profiles!community_posts_author_id_fkey(username,display_name)').eq('announcement',true).order('pinned',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(50);
      if(error)throw new Error('Couldn’t load announcements. Please try again.');
      return {posts:(data||[]).map(p=>({...p,username:p.profiles?.username||'',display_name:p.profiles?.display_name||'Community',is_own:p.author_id===user.id,look:p.look?cleanSharedLook(p.look):null}))};
    },
    feed: async input => {
      const scope = input?.scope==='friends'?'friends':'everyone';
      const cursor = input?.cursor;
      if (cursor && (!Number.isFinite(Date.parse(cursor.created_at)) || !/^[0-9a-f-]{36}$/i.test(cursor.id||''))) throw new Error('Refresh the feed and try again.');
      const args={feed_scope:scope,before_created:cursor?.created_at||null,before_id:cursor?.id||null};
      if(!getUser())throw new Error('Sign in to use the feed.');
      const response=await client.rpc('community_feed_v2',args);
      let posts=response.data;
      if(response.error){if(response.error.code==='PGRST202'||response.error.code==='42883')posts=await rpc('community_feed',args);else throw new Error('Couldn’t reach the feed. Please try again.');}
      return {posts:(posts||[]).map(post=>({...post,look:post.look?cleanSharedLook(post.look):null}))};
    },
    publishPost: async input => {
      const body = String(input?.body||'').trim();
      if (body.length>1000 || (!body&&!input?.look)) throw new Error('Write up to 1,000 characters or attach a look.');
      return {id:await rpc('community_publish_post',{post_body:body,shared_look:input?.look?cleanSharedLook(input.look):null})};
    },
    deletePost: async id => {
      if (!/^[0-9a-f-]{36}$/i.test(id||'')) throw new Error('Choose a post to delete.');
      await rpc('community_delete_post',{post_id:id}); return {deleted:id};
    }
  };
}
module.exports={feedHandlers,cleanSharedLook};
