const {chromium}=require('playwright');const fs=require('fs');
const C=['#ff5f7e','#ff9a3d','#ffd84d','#4fdc8a','#3fc6ff','#a77bff'];
// 3x3 board of blocks, crack runs diagonally; blocks on each side shifted a bit
const grid=[[0,1,2],[5,null,3],[4,0,1]];
function art(s){ // art in a 0..100 box: blocks blown outward, a bomb in the middle with a lit fuse
  let g='';const sz=24,gap=4,o=50-(3*sz+2*gap)/2;
  // short cracks between the blocks, starting at the bomb
  const cr=[[[50,50],[47,40],[52,34],[49,22],[53,12]],[[50,50],[60,53],[66,49],[78,52],[90,48]],[[50,50],[44,60],[48,67],[42,78],[45,90]],[[50,50],[39,47],[33,52],[21,48],[10,51]]];
  for(const c of cr){const P=c.map(p=>p.join(' ')).join(' L');
    g+=`<path d="M${P}" fill="none" stroke="#ffb020" stroke-opacity=".45" stroke-width="4" stroke-linecap="round" stroke-linejoin="miter"/><path d="M${P}" fill="none" stroke="#151230" stroke-width="2" stroke-linecap="round" stroke-linejoin="miter"/>`;}
  for(let r=0;r<3;r++)for(let c=0;c<3;c++){const k=grid[r][c];if(k===null)continue;
    const dx=(c-1)*2.6,dy=(r-1)*2.6,rot=((r*3+c)%2?1:-1)*(r===1||c===1?2:5);
    const x=o+c*(sz+gap)+dx,y=o+r*(sz+gap)+dy,cx=x+sz/2,cy=y+sz/2;
    g+=`<g transform="rotate(${rot} ${cx} ${cy})"><rect x="${x}" y="${y+2}" width="${sz}" height="${sz}" rx="5" fill="#000" fill-opacity=".28"/><rect x="${x}" y="${y}" width="${sz}" height="${sz}" rx="5" fill="${C[k]}"/><rect x="${x+3}" y="${y+3}" width="${sz-6}" height="${sz*0.32}" rx="3" fill="#fff" fill-opacity=".35"/></g>`;}
  // glow behind the bomb
  g+=`<circle cx="50" cy="52" r="26" fill="url(#gl)"/>`;
  // bomb
  g+=`<circle cx="50" cy="54" r="15.5" fill="#000" fill-opacity=".3"/><circle cx="50" cy="52" r="15.5" fill="url(#bm)" stroke="#ffcf6a" stroke-width="1.2"/>`;
  g+=`<ellipse cx="45" cy="46" rx="4.5" ry="3" fill="#fff" fill-opacity=".45" transform="rotate(-35 45 46)"/>`;
  g+=`<rect x="54" y="35" width="8" height="6" rx="1.5" fill="#5b6080" transform="rotate(40 58 38)"/>`;
  g+=`<path d="M60 35 Q64 28 70 30" fill="none" stroke="#c9a46a" stroke-width="2" stroke-linecap="round"/>`;
  // spark
  g+=`<g transform="translate(71 29)"><circle r="8" fill="#ff4f73" fill-opacity=".55"/><path d="M0 -9 L2 -2 L9 0 L2 2 L0 9 L-2 2 L-9 0 L-2 -2 Z" fill="#ff7a2e"/><path d="M0 -6 L1.3 -1.3 L6 0 L1.3 1.3 L0 6 L-1.3 1.3 L-6 0 L-1.3 -1.3 Z" fill="#fff3c4"/><circle r="1.8" fill="#fff"/></g>`;
  return `<g transform="scale(${s/100})">${g}</g>`;}
const bg=(w,h)=>`<defs><radialGradient id="b" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#3a3478"/><stop offset="1" stop-color="#1b1838"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#b)"/>`;
const svg=(w,h,inner)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><radialGradient id="bm" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#5a5f86"/><stop offset=".55" stop-color="#262a45"/><stop offset="1" stop-color="#0f1124"/></radialGradient><radialGradient id="gl"><stop offset="0" stop-color="#ff7a2e" stop-opacity=".95"/><stop offset="1" stop-color="#ffb020" stop-opacity="0"/></radialGradient></defs>${inner}</svg>`;
const full=n=>svg(n,n,bg(n,n)+`<g transform="translate(${n*0.08},${n*0.08})">${art(n*0.84)}</g>`);
const round=n=>svg(n,n,`<clipPath id="c"><circle cx="${n/2}" cy="${n/2}" r="${n/2}"/></clipPath><g clip-path="url(#c)">${bg(n,n)}<g transform="translate(${n*0.15},${n*0.15})">${art(n*0.7)}</g></g>`);
const fg=n=>svg(n,n,`<g transform="translate(${n*0.22},${n*0.22})">${art(n*0.56)}</g>`); // adaptive safe zone 66%
const splash=n=>svg(n,n,bg(n,n)+`<g transform="translate(${n*0.4},${n*0.4})">${art(n*0.2)}</g>`);
const feature=svg(1024,500,bg(1024,500)+`<g transform="translate(60,60)">${art(380)}</g><text x="500" y="270" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="92" fill="#ffb020">Gridquake</text><text x="506" y="340" font-family="Arial,sans-serif" font-weight="700" font-size="40" fill="#cfd3ff">Block Puzzle</text>`);
(async()=>{const b=await chromium.launch();const p=await b.newPage();
 async function png(s,w,h,out,transparent){fs.mkdirSync(require('path').dirname(out),{recursive:true});await p.setViewportSize({width:w,height:h});await p.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);await p.screenshot({path:out,omitBackground:!!transparent,clip:{x:0,y:0,width:w,height:h}});}
 const R='out/res/';const D={mdpi:1,hdpi:1.5,xhdpi:2,xxhdpi:3,xxxhdpi:4};
 for(const [d,f] of Object.entries(D)){const L=48*f,A=108*f;
  await png(full(L),L,L,`${R}mipmap-${d}/ic_launcher.png`);await png(round(L),L,L,`${R}mipmap-${d}/ic_launcher_round.png`,true);await png(fg(A),A,A,`${R}mipmap-${d}/ic_launcher_foreground.png`,true);}
 await png(splash(2732),2732,2732,`${R}drawable/splash.png`);
 await png(full(512),512,512,'out/store/icon-512.png');await png(feature,1024,500,'out/store/feature-1024x500.png');
 await png(full(1024),1024,1024,'out/preview.png');
 await b.close();})();
