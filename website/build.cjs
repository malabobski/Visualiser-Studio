// Reassemble the single uploadable HTML from its editable Community fragments.
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
let page=read('index.html');
page=page.replace(/\/\* WEBSITE WORKSPACE START \*\/[\s\S]*?\/\* WEBSITE WORKSPACE END \*\/\s*/,'');
page=page.replace(/<!-- WEBSITE COMMUNITY START -->[\s\S]*?<!-- WEBSITE COMMUNITY END -->/,()=>read('community-section.html').trimEnd());
page=page.replace(/\/\* WEBSITE COMMUNITY CSS START \*\/[\s\S]*?(?=\/\* COMMUNITY ADMIN CSS START \*\/|<\/style>)/,()=>read('community.css').trimEnd()+'\n');
page=page.replace(/\/\* WEBSITE COMMUNITY JS START \*\/[\s\S]*?\/\* WEBSITE COMMUNITY JS END \*\//,()=>read('community.js').trimEnd()+'\n'+read('workspace.js').trimEnd());
page=page.replace(/\/\* COMMUNITY ADMIN CSS START \*\/[\s\S]*?\/\* COMMUNITY ADMIN CSS END \*\/\s*/,'');
page=page.replace(/<script>\s*\/\* COMMUNITY ADMIN UI START \*\/[\s\S]*?\/\* COMMUNITY ADMIN UI END \*\/\s*<\/script>\s*/,'');
page=page.replace('</style>','/* COMMUNITY ADMIN CSS START */\n'+read('../community-admin.css')+'\n'+read('../notifications.css')+'\n'+read('../hints.css')+'\n/* COMMUNITY ADMIN CSS END */\n</style>');
const js=[read('../notifications.js'),read('../hints.js'),read('../community-admin-ui.js'),read('../community-listening.js'),read('../community-social-core.js'),read('message-store.js')].join('\n');if(/<\/script/i.test(js))throw Error('Invalid embedded script');new Function(js);new Function(read('community.js'));new Function(read('workspace.js'));
const marker=page.indexOf('/* WEBSITE COMMUNITY JS START */'),script=page.lastIndexOf('<script>',marker);if(script<0)throw Error('Missing Community script');
page=page.slice(0,script)+'<script>\n/* COMMUNITY ADMIN UI START */\n'+js+'\n/* COMMUNITY ADMIN UI END */\n</script>\n'+page.slice(script);
fs.writeFileSync(path.join(__dirname,'index.html'),page);
console.log('Built single-file website ('+Buffer.byteLength(page)+' bytes).');
