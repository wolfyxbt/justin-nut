import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options={host:'127.0.0.1',port:8080};
const args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){
  const value=args[i+1];
  if(value===undefined||!['--host','--port'].includes(args[i])){
    console.error('Usage: npm start -- [--host 127.0.0.1] [--port 8080]');
    process.exit(1);
  }
  if(args[i]==='--host')options.host=value;
  else options.port=Number(value);
}
if(!Number.isInteger(options.port)||options.port<0||options.port>65535){
  console.error('Port must be an integer from 0 to 65535.');process.exit(1);
}
const pages=new Set(['index.html','style.css','game.js','plants.js']);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
  const fail=(status,message)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(message);};
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return fail(405,'Method not allowed');}
  let name;
  try{name=decodeURIComponent((req.url||'/').split('?')[0]);}
  catch{return fail(400,'Invalid URL');}
  if(name==='/')name='/index.html';
  name=name.slice(1);
  const asset=/^assets\/[A-Za-z0-9_-]+\.(png|jpg|gif|mp3|js|json)$/.test(name);
  if(!pages.has(name)&&!asset)return fail(404,'Not found');
  try{
    const filename=await fs.realpath(path.join(root,name));
    if(!filename.startsWith(root+path.sep))return fail(404,'Not found');
    const stat=await fs.stat(filename);
    if(!stat.isFile())return fail(404,'Not found');
    const content=await fs.readFile(filename);
    // One upstream .png filename contains GIF data; use its actual media type.
    const type=content.subarray(0,3).toString()==='GIF'?'image/gif':types[path.extname(name)];
    res.writeHead(200,{'Content-Type':type,'Content-Length':content.length,'Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:content);
  }catch(error){fail(error.code==='ENOENT'?404:500,error.code==='ENOENT'?'Not found':'Unable to read file');}
});
server.on('error',error=>{
  console.error(error.code==='EADDRINUSE'?'Port is already in use. Try --port 8081.':'Unable to start server. Check host and port.');
  process.exitCode=1;
});
server.listen(options.port,options.host,()=>{
  const port=server.address().port;
  const host=options.host.includes(':')?'['+options.host+']':options.host;
  console.log(`Justin Nut: http://${host}:${port}`);
  if(options.host==='0.0.0.0')console.log('Phone: open http://<computer-LAN-IP>:'+port+' on the same network.');
});
