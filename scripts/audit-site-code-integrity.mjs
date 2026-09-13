import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const failures=[];
const notes=[];
const skipNames=new Set(['.git','node_modules','.netlify']);
const skipRelPrefixes=['marketing/exports/'];

function walk(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    const rel=path.relative(ROOT,full).replaceAll('\\','/');
    if(entry.isDirectory()){
      if(skipNames.has(entry.name)||skipRelPrefixes.some(prefix=>`${rel}/`.startsWith(prefix)))continue;
      out.push(...walk(full));
    }else out.push(rel);
  }
  return out;
}

const files=walk(ROOT);
const htmlFiles=files.filter(file=>file.endsWith('.html'));
const sourceFiles=files.filter(file=>/\.(?:js|mjs|css|html|toml|yml|yaml)$/.test(file));

const protocol=/^(?:https?:|mailto:|tel:|data:|javascript:)/i;
const routedPrefixes=['/app','/api/'];

function tagAttr(html,tag,attr){
  const values=[];
  const re=new RegExp(`<${tag}\\b[^>]*?\\s${attr}=["']([^"']+)["'][^>]*>`,`gi`);
  let match;
  while((match=re.exec(html)))values.push(match[1]);
  return values;
}
function allAttr(html,attr){
  const values=[];
  const re=new RegExp(`\\s${attr}=["']([^"']+)["']`,'gi');
  let match;
  while((match=re.exec(html)))values.push(match[1]);
  return values;
}
function stripQueryHash(value){return value.split('#')[0].split('?')[0];}
function localCandidate(fromFile,ref){
  const clean=stripQueryHash(ref).trim();
  if(!clean||clean.startsWith('#')||protocol.test(clean)||routedPrefixes.some(prefix=>clean.startsWith(prefix)))return null;
  return clean.startsWith('/')?clean.slice(1):path.posix.normalize(path.posix.join(path.posix.dirname(fromFile),clean));
}
function existsTarget(candidate){
  if(!candidate)return true;
  const exact=path.join(ROOT,candidate);
  return fs.existsSync(exact)
    || (!path.extname(candidate)&&fs.existsSync(`${exact}.html`))
    || fs.existsSync(path.join(exact,'index.html'));
}

for(const file of htmlFiles){
  const html=fs.readFileSync(path.join(ROOT,file),'utf8');
  if(!/<html\b/i.test(html))failures.push(`${file}: missing <html>`);
  if(!/<body\b/i.test(html))failures.push(`${file}: missing <body>`);
  if(!/<title>[^<]+<\/title>/i.test(html))failures.push(`${file}: missing non-empty <title>`);
  if(!/<meta[^>]+name=["']viewport["']/i.test(html))failures.push(`${file}: missing viewport meta`);

  const idCounts=new Map();
  for(const id of allAttr(html,'id'))idCounts.set(id,(idCounts.get(id)||0)+1);
  for(const [id,count] of idCounts)if(count>1)failures.push(`${file}: duplicate static id ${JSON.stringify(id)} x${count}`);

  for(const [tag,attr] of [['script','src'],['link','href'],['img','src'],['source','src'],['video','src']]){
    const seen=new Map();
    for(const ref of tagAttr(html,tag,attr)){
      const clean=stripQueryHash(ref);
      if(clean&&!protocol.test(clean)&&!clean.startsWith('#'))seen.set(clean,(seen.get(clean)||0)+1);
      const candidate=localCandidate(file,ref);
      if(candidate&&!existsTarget(candidate))failures.push(`${file}: missing local ${tag} ${ref} -> ${candidate}`);
    }
    if(tag==='script'||tag==='link'){
      for(const [ref,count] of seen)if(count>1)failures.push(`${file}: duplicate ${tag} resource ${ref} x${count}`);
    }
  }

  for(const href of tagAttr(html,'a','href')){
    const candidate=localCandidate(file,href);
    if(candidate&&!existsTarget(candidate))failures.push(`${file}: broken local link ${href} -> ${candidate}`);
  }

  if(/href=["']\s*["']/i.test(html))failures.push(`${file}: empty href`);
  if(/(?:src|href)=["'](?:undefined|null)["']/i.test(html))failures.push(`${file}: undefined/null resource reference`);
}

for(const file of sourceFiles){
  const source=fs.readFileSync(path.join(ROOT,file),'utf8');
  if(source.includes('<<<<<<<')||source.includes('>>>>>>>'))failures.push(`${file}: merge-conflict marker present`);
}

const homepageJsPath='assets/js/homepage-v1.js';
const homepageJs=fs.readFileSync(path.join(ROOT,homepageJsPath),'utf8');
if(!homepageJs.includes('normalizeRoutePath'))failures.push(`${homepageJsPath}: missing normalized route guard`);
if(!homepageJs.includes('dedupeRouteLinks'))failures.push(`${homepageJsPath}: missing runtime duplicate-nav cleanup`);

const sw=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
const cachedAssets=[...sw.matchAll(/["'](\/[^"']+\.(?:css|js|svg|webp|png))["']/g)].map(match=>match[1].slice(1));
for(const asset of cachedAssets)if(!fs.existsSync(path.join(ROOT,asset)))failures.push(`sw.js: cached asset does not exist: /${asset}`);

console.log(`Static site integrity audit scanned ${htmlFiles.length} HTML files and ${sourceFiles.length} code/config files.`);
for(const note of notes)console.log(`NOTE: ${note}`);
if(failures.length){
  console.error(`FAILED: ${failures.length}`);
  failures.slice(0,250).forEach(failure=>console.error(`- ${failure}`));
  if(failures.length>250)console.error(`- ... ${failures.length-250} more`);
  process.exit(1);
}
console.log('PASS: no broken local assets/links, duplicate static IDs/resources, merge markers, missing PWA assets, or missing homepage de-duplication guards.');
