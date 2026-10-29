(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CommunityListening=factory();})(globalThis,()=>{
  function clean(input){
    if(!input||typeof input.title!=='string'||!input.title.trim())return null;
    const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
    const track={title:text(input.title,300),artist:text(input.artist,200),source:text(input.source,60)};
    if(typeof input.artwork==='string'&&input.artwork.length<=60000&&/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(input.artwork))track.artwork=input.artwork;
    try{
      const url=new URL(input.url);
      if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(
        (url.hostname==='open.spotify.com'&&/^\/track\/[a-zA-Z0-9]+$/.test(url.pathname))||
        (url.hostname==='www.youtube.com'&&url.pathname==='/watch'&&/^[\w-]{11}$/.test(url.searchParams.get('v')||''))||
        (url.hostname==='music.apple.com'&&/^\/[a-z]{2}\/album\//.test(url.pathname))||
        (url.hostname==='soundcloud.com'&&/^\/[\w-]+\/[\w-]+$/.test(url.pathname))
      ))track.url=url.href;
    }catch{}
    return track;
  }
  function legacy(activity){
    if(typeof activity!=='string'||!activity.startsWith('Listening to '))return null;
    const [title,...artist]=activity.slice(13).split(' · ');return clean({title,artist:artist.join(' · ')});
  }
  function destination(input){
    const track=clean(input);if(!track)return null;
    if(track.url)return {url:track.url,label:'Open song',exact:true};
    const query=encodeURIComponent([track.title,track.artist].filter(Boolean).join(' '));
    const source=track.source.toLowerCase();
    if(source.includes('spotify'))return {url:'https://open.spotify.com/search/'+query,label:'Search Spotify',exact:false};
    if(source.includes('soundcloud'))return {url:'https://soundcloud.com/search/sounds?q='+query,label:'Search SoundCloud',exact:false};
    if(source.includes('apple'))return {url:'https://music.apple.com/us/search?term='+query,label:'Search Apple Music',exact:false};
    return {url:'https://www.youtube.com/results?search_query='+query,label:'Search YouTube',exact:false};
  }
  return {clean,legacy,destination};
});
