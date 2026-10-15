import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipped=new Set(['.git','.claude','.idea','.vscode','node_modules','dist','coverage','work','tmp','.venv','__pycache__']);
function walk(directory){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(skipped.has(entry.name))return [];
    const filename=path.join(directory,entry.name);
    return entry.isDirectory()?walk(filename):[path.relative(root,filename)];
  });
}
const git=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'});
const gitRoot=spawnSync('git',['rev-parse','--show-toplevel'],{cwd:root,encoding:'utf8'});
const ownRepository=gitRoot.status===0&&fs.realpathSync(gitRoot.stdout.trim())===fs.realpathSync(root);
const files=git.status===0&&ownRepository?git.stdout.split('\0').filter(Boolean):walk(root);
const checks=[
  ['personal filesystem path',/\x2f(?:Users|home\x2f[^/\s]+|var\x2ffolders|private\x2fvar\x2ffolders)\x2f|[A-Z]:\\Users\\/i],
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['credential token',/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-proj-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9_-]{40,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,})/],
  ['credentials in URL',/https?:\x2f\x2f[^\s/:<>"']+:[^\s/@<>"']+@/i]
];
const internalContext=/原始聊天|聊天附件|公开包|本地项目中供后续审阅|项目与仓库名称保持|上传到\s*GitHub\s*与发布|original chat attachment|this public package|Built-in\s+image_gen/i;
const problems=[];
for(const name of files){
  if(/^(?:asset-packs|tools|exports)\//.test(name)){
    problems.push(`${name}: private production file`);
  }
  const filename=path.join(root,name);
  const stat=fs.lstatSync(filename);
  if(stat.isSymbolicLink()){problems.push(`${name}: symbolic link`);continue;}
  if(/(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|[^/]+\.(?:pem|key|p12|pfx))$/.test(name)&&!name.endsWith('.env.example')){
    problems.push(`${name}: credential file`);
  }
  if(/(?:^|\/)(?:\.claude|\.idea|\.vscode)(?:\/|$)|(?:^|\/)(?:\.DS_Store|\._[^/]+)$/.test(name)){
    problems.push(`${name}: local workspace metadata`);
  }
  const text=fs.readFileSync(filename).toString('utf8');
  for(const [label,expression] of checks)if(expression.test(text))problems.push(`${name}: ${label}`);
  if(/\.(?:md|json)$/.test(name)&&internalContext.test(text))problems.push(`${name}: internal publishing or chat context`);
  if(name.endsWith('.md')){
    for(const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
      let href=match[1];
      if(/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href))continue;
      href=href.replace(/^<|>$/g,'').split('#')[0];
      if(!href)continue;
      try{href=decodeURIComponent(href);}
      catch{problems.push(`${name}: invalid link encoding`);continue;}
      if(!fs.existsSync(path.resolve(path.dirname(filename),href)))problems.push(`${name}: broken local link ${href}`);
    }
  }
}
if(problems.length){
  // Report file names and categories; do not print matched credential contents.
  console.error(problems.join('\n'));process.exitCode=1;
}else console.log(`PASS: ${files.length} public files; paths, credentials, document context and local links.`);
