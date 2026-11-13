// Small local web server to play and test the web version: node scripts/serve-web.mjs [root] [port]
// Then open http://localhost:5178/ (tests: http://localhost:5178/index.html?test=1, see tests/README.md).
import http from 'http';import {readFile} from 'fs/promises';import {join,extname,normalize,resolve,sep} from 'path';
const root=resolve(process.argv[2]||'.'),port=+process.argv[3]||5178;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.css':'text/css'};
http.createServer(async(q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  const f=normalize(join(root,p));if(f!==root&&!f.startsWith(root+sep)){r.writeHead(403);return r.end();}
  try{const b=await readFile(f);r.writeHead(200,{'Content-Type':types[extname(f)]||'application/octet-stream','Cache-Control':'no-store'});r.end(b);}
  catch(e){r.writeHead(404);r.end('not found');}}).listen(port,'127.0.0.1',()=>console.log('serving on',port));
