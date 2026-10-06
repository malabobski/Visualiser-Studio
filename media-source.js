function mediaSourceName(data) {
  const source = data.sourceAppId || '', metadata = [source, data.sourceName, data.albumTitle, data.subtitle].filter(Boolean).join(' ');
  if (/(?:\b(?:music\.)?youtube(?:\.com)?\b|youtu\.be)/i.test(metadata)) return 'YouTube';
  if (/\bsoundcloud(?:\.com)?\b/i.test(metadata)) return 'SoundCloud';
  const known = [['spotify','Spotify'],['msedge','Microsoft Edge'],['chrome','Google Chrome'],['firefox','Firefox'],['brave','Brave'],['vlc','VLC'],['applemusic','Apple Music'],['zunemusic','Media Player'],['musicbee','MusicBee'],['foobar','foobar2000']];
  for (const [id,name] of known) if(source.toLowerCase().includes(id)) return name;
  return data.sourceName || source.replace(/\.exe$/i,'').split('!').pop().split(/[\\/]/).pop() || 'Media app';
}
