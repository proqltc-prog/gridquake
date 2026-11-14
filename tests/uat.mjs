// UAT and negative tests for Gridquake 0.7, run in a desktop browser:
//   open http://localhost:<port>/index.html?test=1, then in the console:
//   (await import('/tests/uat.mjs')).run()
// The page exposes window.GQ only on localhost with ?test=1 (never in the app).
// Tests change the local game data of this browser; run them in a test browser profile.
// The wallet lives on the server (schema gridquake). These tests replace those server calls by a fake server
// with the same rules (fake() below), so they never change real coins; the real server rules are tested in SQL
// (tests/server-wallet.sql). Test N22 checks that real wallet calls carry the header Content-Profile: gridquake.

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const $=id=>document.getElementById(id);
const cardText=()=>$('ovcard').innerText;
const cardBtn=t=>[...document.querySelectorAll('#ovcard button')].find(b=>b.textContent.includes(t));
const close=()=>{$('ov').hidden=true;};
const G=()=>window.GQ;
const piece=(cells,color='#a77bff')=>({cells,color,w:Math.max(...cells.map(p=>p[1]))+1,h:Math.max(...cells.map(p=>p[0]))+1});
// ---- fake server: the same rules as gridquake.* in migration gq09 ----
const F={};const day=()=>new Date().toDateString();
const PRICE={hamer:60,draai:40,dobbel:50,raket:80,hart:90};
const SEGS=[{c:20},{it:'hamer'},{c:50},{it:'draai'},{c:10},{it:'dobbel'},{c:100},{it:'hart'},{c:30},{it:'raket'}];
function resetFake(o={}){for(const k in F)delete F[k];Object.assign(F,{coins:100,items:{hamer:1,draai:1,dobbel:1},wheelDay:null,extraDay:null,extra:0,adAt:0,adDay:null,adViews:0,
  earned:{},chests:{},cg:null,cp:0,replayAt:0,unverified:true,offline:false,calls:[],levelAt:0,classicAt:0,delay:0},o);}
function fj(){const d=day();return {coins:F.coins,items:{...F.items},wheel_free:F.wheelDay!==d,extra:F.extraDay===d?F.extra:0,extra_possible:F.extraDay!==d,
  ad_wait:Math.max(0,Math.ceil((F.adAt+1800e3-Date.now())/1000)),ads_left:Math.max(0,10-(F.adDay===d?F.adViews:0)),reset_in:3600,chests:{...F.chests}};}
async function fake(name,a={}){F.calls.push(name);if(F.delay)await wait(F.delay);if(F.offline)throw new Error('offline');const d=day();
  if(name==='wallet')return fj();
  if(name==='buy'){const p=PRICE[a.p_item];if(p==null)return {status:'unknown'};if(F.coins<p)return {status:'poor',wallet:fj()};F.coins-=p;F.items[a.p_item]=(F.items[a.p_item]|0)+1;return {status:'ok',wallet:fj()};}
  if(name==='use_item'){if(!(F.items[a.p_item]>0))return {status:'none',wallet:fj()};F.items[a.p_item]--;return {status:'used',wallet:fj()};}
  if(name==='wheel_spin'){if(F.wheelDay!==d)F.wheelDay=d;else if(F.extraDay===d&&F.extra>0)F.extra=0;else return {status:'cooldown',wallet:fj()};
    const seg=Math.floor(Math.random()*10),p=SEGS[seg];if(p.c)F.coins+=p.c;else F.items[p.it]=(F.items[p.it]|0)+1;return {status:'ok',seg,prize:p,wallet:fj()};}
  if(name==='ad_claim'){if(!F.unverified)return {status:'ssv',wallet:fj()};let st;
    if(a.p_kind==='coins'){if(F.adDay===d&&F.adViews>=10)st='limit';else if(Date.now()-F.adAt<29*60e3)st='cooldown';else{F.coins+=100;F.adAt=Date.now();F.adViews=F.adDay===d?F.adViews+1:1;F.adDay=d;st='granted';}}
    else{if(F.wheelDay!==d)st='not_needed';else if(F.extraDay===d)st='limit';else{F.extraDay=d;F.extra=1;st='granted';}}
    return {status:st,wallet:fj()};}
  if(name==='earn_level'){const prev=F.earned[a.p_level]|0;let gain=0,chest=null,paid=false,st='ok';
    if(a.p_stars>prev){if(Date.now()-F.levelAt<20e3)st='limit';else{gain=(10+5*a.p_stars)-(prev?10+5*prev:0);paid=!prev;F.earned[a.p_level]=a.p_stars;F.levelAt=Date.now();}}
    else if(Date.now()-F.replayAt>60e3){gain=3;F.replayAt=Date.now();}
    if(paid&&a.p_level%3===0&&!F.chests[a.p_level]){chest={c:40};gain+=40;F.chests[a.p_level]=true;}F.coins+=gain;return {status:st,gain,chest,wallet:fj()};}
  if(name==='earn_classic'){const same=F.cg===a.p_game;if(!same&&Date.now()-F.classicAt<60e3)return {status:'limit',gain:0,wallet:fj()};
    const tot=Math.min(30,Math.floor(a.p_score/1500)),gain=Math.max(0,tot-(same?F.cp:0));
    F.coins+=gain;F.cp=same?Math.max(F.cp,tot):tot;if(!same)F.classicAt=Date.now();F.cg=a.p_game;return {status:'ok',gain,wallet:fj()};}
  throw new Error('unknown '+name);}
let realCall=null;
function installFake(){const api=G().API;if(!realCall)realCall=api.call;
  api.call=function(name,args={},retried,schema){return schema==='gridquake'?fake(name,args):realCall.call(this,name,args,retried,schema);};
  if(!G().NET.db)G().NET.db=api;}
const wallet=()=>({c:F.coins,it:F.items,chest:F.chests,streak:G().WAL.streak});
function setWallet(c,it={},extra={}){resetFake({coins:c,items:{...it},chests:extra.chests||{},earned:extra.earned||{},wheelDay:extra.wheelDay??null});
  G().WAL.streak=extra.streak||0;G().applyWallet(fj());}
async function mapOverview(m){G().show('camp');await wait(50);if(!document.querySelector('.mapcard')){document.querySelector('#s-camp [data-back]').click();await wait(50);G().show('camp');await wait(50);}document.querySelectorAll('.mapcard')[m].click();await wait(100);}
function gameOverBoard(S){for(let r=0;r<8;r++)for(let c=0;c<8;c++)S.grid[r][c]=(r+c)%2?{color:'#ff5f7e'}:null;S.tray=[piece([[0,0],[0,1]]),null,null];}
function emptyBoard(){const S=G().S;for(let r=0;r<8;r++)for(let c=0;c<8;c++)S.grid[r][c]=null;}

const results=[];
async function t(id,type,name,fn){
  let pass=false,detail='';
  try{const r=await fn();pass=r===true||(r&&r.pass===true);detail=r&&r.detail?r.detail:(r===true?'':'returned '+JSON.stringify(r));}
  catch(e){detail='ERROR '+(e&&e.message||e);}
  results.push({id,type,name,pass,detail});close();await wait(60);
}

export async function run(){
  if(!G())throw new Error('open the page with ?test=1 on localhost');
  results.length=0;resetFake();installFake();
  // keep the data of whoever plays in this browser: everything is put back after the run
  const saved={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);saved[k]=localStorage.getItem(k);}
  try{return await runAll();}finally{localStorage.clear();Object.entries(saved).forEach(([k,v])=>localStorage.setItem(k,v));G().API.call=realCall;}
}
async function runAll(){
  localStorage.setItem('blockers-lang','nl');G().setLang('nl');
  localStorage.setItem('blockers-camp2',JSON.stringify({s:{},b:{},st:{},md:{},tut:5}));
  Object.assign(G().CAMP,{s:{},b:{},st:{},md:{},tut:5});
  close();G().show('menu');

  // ---------------- UAT ----------------
  await t('U1','UAT','Menu toont munten, Dagrad en Winkel',async()=>{
    setWallet(100,{hamer:1});G().show('menu');
    return {pass:$('coins').textContent.includes('100')&&!$('wheel-dot').hidden&&!!$('go-shop')&&!!$('go-wheel'),detail:$('coins').textContent};
  });
  await t('U2','UAT','Dagrad: één keer draaien geeft een prijs en wordt bewaard',async()=>{
    setWallet(100,{});const before=JSON.parse(JSON.stringify(wallet()));
    $('go-wheel').click();await wait(100);cardBtn('Draaien!').click();await wait(3900);
    const after=wallet(),gotCoins=after.c>before.c,gotItem=Object.keys(after.it).some(k=>after.it[k]>(before.it[k]||0));
    const spinGone=cardBtn('Draaien!').hidden,eb=cardBtn('Nog 1 keer draaien'),extraShown=!!eb&&!eb.hidden;close();G().show('menu');
    return {pass:(gotCoins||gotItem)&&spinGone&&extraShown&&F.wheelDay===day()&&$('wheel-dot').hidden,detail:'extra-knop '+extraShown};
  });
  await t('U3','UAT','Winkel: kopen verlaagt munten en verhoogt het hulpmiddel',async()=>{
    setWallet(100,{});G().shopCard();await wait(50);
    const row=[...document.querySelectorAll('#ovcard .shoprow')].find(r=>r.innerText.includes('Draaien'));
    const label=row.querySelector('button').innerText;row.querySelector('button').click();await wait(80);
    const still=row.isConnected,count=row.querySelector('.own').textContent,coins=document.querySelector('#ovcard .coinbig').textContent;
    const w=wallet();return {pass:w.c===60&&w.it.draai===1&&still&&count==='1'&&coins.includes('60')&&label.includes('Koop'),detail:`munten ${w.c}, draaien ${w.it.draai}, teller ${count}`};
  });
  await t('U4','UAT','Klassiek: hulpbalk zichtbaar, geen power-blokken bij 2 lijnen',async()=>{
    setWallet(0,{hamer:1,draai:1,dobbel:1});G().startClassic();await wait(300);
    const S=G().S;emptyBoard();for(let c=0;c<7;c++){S.grid[0][c]={color:'#ff5f7e'};S.grid[1][c]={color:'#ff5f7e'};}
    S.tray=[piece([[0,0],[1,0]]),piece([[0,0]]),piece([[0,0]])];G().place(0,0,7);await wait(1500);
    const sp=S.grid.flat().some(x=>x&&x.sp),tools=document.querySelectorAll('#tools .tool').length;
    return {pass:!$('tools').hidden&&tools===4&&!sp&&S.score>0,detail:`tools ${tools}, power-blok ${sp}, score ${S.score}`};
  });
  await t('U5','UAT','Draaien: blok draait een kwartslag, 1 hulpmiddel gebruikt',async()=>{
    setWallet(0,{draai:1});G().startClassic();await wait(300);const S=G().S;S.tray[0]=piece([[0,0],[0,1],[0,2]]);
    await G().toolTap('draai');await G().rotatePiece(0);const p=S.tray[0];
    return {pass:p.w===1&&p.h===3&&wallet().it.draai===0,detail:`w${p.w} h${p.h}`};
  });
  await t('U6','UAT','Nieuwe blokken: lade vervangen door blokken die passen',async()=>{
    setWallet(0,{dobbel:1});G().startClassic();await wait(300);const S=G().S;const old=S.tray.slice();
    await G().toolTap('dobbel');const changed=S.tray.some((p,i)=>p!==old[i]),fit=S.tray.every(p=>!p||G().fitsAny(p));
    return {pass:changed&&fit&&wallet().it.dobbel===0,detail:`changed ${changed}, fit ${fit}`};
  });
  await t('U7','UAT','Hamer: wist één blok, kost geen zet',async()=>{
    setWallet(0,{hamer:1});const lv=G().makeLevel(2);G().newGame({mode:'camp',lvl:lv});await wait(300);const S=G().S;
    emptyBoard();S.grid[4][4]={color:'#3fc6ff'};const moves=S.movesLeft;await G().toolTap('hamer');await G().hammer(4,4);await wait(700);
    return {pass:!S.grid[4][4]&&S.movesLeft===moves&&wallet().it.hamer===0,detail:`zetten ${moves}->${S.movesLeft}`};
  });
  await t('U8','UAT','Klassiek game-over: 4 knoppen, munten, verder spelen met een filmpje (1 keer per spel)',async()=>{
    setWallet(0,{});localStorage.setItem('blockers-best','999999');G().startClassic();await wait(300);const S=G().S;
    S.best=999999;S.bestStart=999999;S.score=4500;S.shown=4500;gameOverBoard(S);G().endGame();await wait(1200);
    const txt=cardText(),btns=[...document.querySelectorAll('#ovcard button')].map(b=>b.textContent);
    const four=btns.length===4&&btns[0].includes('hartje')&&btns[1].includes('bekijk reclame')&&btns[2]==='Opnieuw spelen'&&btns[3]==='Menu';
    const heartOff=cardBtn('hartje').disabled,noRecordMsg=!txt.includes('tot je record');
    cardBtn('bekijk reclame').click();await wait(4600);const resumed=!S.over&&S.adUsed===true&&S.tray.filter(Boolean).length===3;
    gameOverBoard(S);S.over=false;G().endGame();await wait(1200);const vid=cardBtn('Filmpje al gebruikt');
    return {pass:four&&heartOff&&noRecordMsg&&txt.includes('+3 munten')&&resumed&&!!vid&&vid.disabled,detail:btns.join(' | ')};
  });
  await t('U9','UAT','Level-start met Start-Raket',async()=>{
    setWallet(0,{raket:1});G().levelIntro(4);await wait(50);
    const boosts=document.querySelectorAll('#ovcard button.boost').length;
    document.querySelectorAll('#ovcard button.boost').forEach(b=>b.click());cardBtn('Spelen').click();await wait(900);
    const S=G().S,rk=S.grid.flat().some(x=>x&&x.sp==='raket');
    return {pass:boosts===1&&rk&&S.movesLeft===S.lvl.moves&&!wallet().it.raket,detail:'keuzes '+boosts};
  });
  await t('U10','UAT','Level winnen: munten, winreeks +1 en cadeau na level 3',async()=>{
    setWallet(0,{},{streak:0});G().CAMP.s={1:1,2:1};G().startLevel(3);await wait(300);const S=G().S;
    S.lvl.goals.forEach(g=>{if(g.t==='stones')S.stats.stones=g.target;if(g.t==='make')S.stats.made[g.sp]=g.target;if(g.t==='score')S.score=g.target;});
    S.movesLeft=0;G().winLevel();await wait(2600);
    const chestCard=cardText().includes('Cadeau');const w=wallet();
    if(cardBtn('Verder'))cardBtn('Verder').click();await wait(100);const fin=cardText();
    return {pass:chestCard&&w.chest['3']===true&&w.streak===1&&w.c>=25&&fin.includes('munten'),detail:`munten ${w.c}, reeks ${w.streak}, kist ${chestCard}`};
  });
  await t('U11','UAT','Level verliezen en Opnieuw: winreeks terug naar 0',async()=>{
    setWallet(0,{},{streak:2});G().startLevel(1);await wait(300);G().loseLevel('moves');await wait(100);
    cardBtn('Opnieuw').click();await wait(400);return {pass:wallet().streak===0,detail:'reeks '+wallet().streak};
  });
  await t('U12','UAT','Power-combo: raket naast bom ontploft samen',async()=>{
    G().startLevel(1);await wait(300);const S=G().S;emptyBoard();
    for(let c=0;c<7;c++)S.grid[4][c]={color:'#ff5f7e'};S.grid[4][2]={color:'#3fc6ff',sp:'raket'};S.grid[3][2]={color:'#ffd84d',sp:'bom'};
    S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];G().place(0,4,7);await wait(200);
    const said=G().pops.includes('Power-combo!');await wait(1500);
    return {pass:said&&!S.grid[3][2],detail:'melding '+said};
  });
  await t('U13','UAT','Laatste zet: waarschuwing en rode rand',async()=>{
    G().startLevel(1);await wait(300);const S=G().S;emptyBoard();S.movesLeft=2;S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];
    G().place(0,0,0);await wait(900);
    return {pass:$('cv').classList.contains('lastmove')&&G().pops.includes('Laatste zet!'),detail:'zetten '+S.movesLeft};
  });
  await t('U14','UAT','Duel: geen hulpbalk',async()=>{
    G().newGame({mode:'duel',seed:42,duel:{id:null,opp:null,oppName:'',ghost:null,oppScore:null}});await wait(300);
    const hidden=$('tools').hidden;G().S.over=true;G().show('menu');return {pass:hidden,detail:''};
  });
  await t('U15','UAT','Engels: nieuwe teksten vertaald',async()=>{
    let txt='';try{G().setLang('en');G().show('menu');G().shopCard();await wait(50);txt=cardText();}finally{G().setLang('nl');localStorage.setItem('blockers-lang','nl');}
    return {pass:txt.includes('Shop')&&txt.includes('Hammer')&&txt.includes('New blocks')&&$('go-wheel').innerText.includes('wheel')===false,detail:txt.slice(0,40)};
  });
  await t('U16','UAT','Vrienden op de kaart',async()=>{
    G().CAMP.tut=5;G().NET.friends=[{id:'x',nickname:'Ann',lvl:2},{id:'y',nickname:'Bo',lvl:0}];await mapOverview(1);
    const at3=document.querySelector('#lv-3 .friends-on'),at1=document.querySelector('#lv-1 .friends-on');G().NET.friends=[];
    return {pass:!!at3&&at3.innerText.includes('A')&&!!at1&&at1.innerText.includes('B'),detail:''};
  });

  await t('U17','UAT','Kristalmijn: kaart 10 staat voor Meesterproef (11), 220 levels',async()=>{
    G().CAMP.s={180:1};await mapOverview(10);/* card 0 is the practice map */const head=document.querySelector('#s-camp h2.sec').textContent;
    const nodes=document.querySelectorAll('.path .node').length;G().CAMP.s={};
    return {pass:head==='Kristalmijn'&&nodes===20&&G().makeLevel(201).m===10&&G().makeLevel(181).goals[0].t==='crystals',detail:head};
  });
  await t('U18','UAT','Kristal valt als de lijn eronder gewist wordt en wordt verzameld',async()=>{
    G().startLevel(181);await wait(300);const S=G().S;emptyBoard();S.grid[5][3]={crystal:true};
    for(let c=0;c<7;c++)S.grid[6][c]={color:'#ff5f7e'};S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];
    const before=S.stats.crystals;G().place(0,6,7);await wait(200);const said=G().pops.includes('Kristal!');await wait(2500);
    return {pass:S.stats.crystals===before+1&&!S.grid.flat().some(x=>x&&x.crystal)&&said,detail:'verzameld '+S.stats.crystals};
  });
  await t('U19','UAT','Kristal-level winnen als alle kristallen beneden zijn',async()=>{
    G().startLevel(184);await wait(300);const S=G().S;emptyBoard();S.grid[6][2]={crystal:true};
    S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];
    // a single block elsewhere: the crystal falls into the bottom row after the move
    G().place(0,0,0);await wait(3200);
    return {pass:G().levelWon(S)||S.over,detail:'over '+S.over};
  });

  // ---------------- negative tests ----------------
  await t('N15','negatief','Hamer op een kristal kost niets en het kristal blijft',async()=>{
    setWallet(0,{hamer:1});G().startLevel(181);await wait(300);const S=G().S;emptyBoard();S.grid[2][2]={crystal:true};S.grid[3][2]={color:'#ff5f7e'};
    await G().hammer(2,2);return {pass:wallet().it.hamer===1&&!!S.grid[2][2]&&S.grid[2][2].crystal,detail:''};
  });
  await t('N16','negatief','Explosie of lijn vernietigt geen kristal',async()=>{
    G().startLevel(181);await wait(300);const S=G().S;emptyBoard();
    for(let c=0;c<7;c++)S.grid[1][c]={color:'#ff5f7e'};S.grid[1][3]={crystal:true};S.grid[1][2]={color:'#3fc6ff',sp:'bom'};S.grid[2][3]={color:'#a77bff'};
    S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];G().place(0,1,7);await wait(1600);
    const cr=S.grid.flat().filter(x=>x&&x.crystal).length;return {pass:cr+S.stats.crystals===1,detail:'op bord '+cr+', verzameld '+S.stats.crystals};
  });
  await t('N17','negatief','Blok onder een kristal houdt het tegen',async()=>{
    G().startLevel(181);await wait(300);const S=G().S;emptyBoard();S.grid[3][4]={crystal:true};
    S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];G().place(0,4,4);await wait(800);
    return {pass:!!S.grid[3][4]&&S.grid[3][4].crystal,detail:''};
  });
  await t('N1','negatief','Kopen zonder genoeg munten',async()=>{
    setWallet(10,{});G().shopCard();await wait(50);const b=document.querySelector('#ovcard .shoprow button');b.click();
    const w=wallet();return {pass:w.c===10&&!w.it.hamer&&b.textContent.includes('Te weinig'),detail:b.textContent};
  });
  await t('N2','negatief','Snel 5× klikken met munten voor 1 stuk',async()=>{
    setWallet(60,{});G().shopCard();await wait(50);
    for(let i=0;i<5;i++){const b=document.querySelector('#ovcard .shoprow button');b.click();await wait(5);}
    await wait(200);const w=wallet();return {pass:w.c===0&&w.it.hamer===1,detail:`munten ${w.c}, hamers ${w.it.hamer}`};
  });
  await t('N3','negatief','Dagrad twee keer op dezelfde dag',async()=>{
    setWallet(0,{});$('go-wheel').click();await wait(50);const b=cardBtn('Draaien!');b.click();b.click();b.click();await wait(3900);
    const spins=F.calls.filter(c=>c==='wheel_spin').length,total=x=>x.c+Object.values(x.it).reduce((a,v)=>a+v,0),w1=total(wallet());
    close();$('go-wheel').click();await wait(50);const b2=cardBtn('Draaien!');b2.click();await wait(300);
    return {pass:spins===1&&b2.disabled&&total(wallet())===w1,detail:'draaien naar server: '+spins};
  });
  await t('N4','negatief','Hamer op een leeg vakje kost niets',async()=>{
    setWallet(0,{hamer:1});G().startClassic();await wait(300);emptyBoard();await G().toolTap('hamer');await G().hammer(2,2);
    return {pass:wallet().it.hamer===1,detail:''};
  });
  await t('N5','negatief','Hamer op water en op een kist kost niets',async()=>{
    setWallet(0,{hamer:2});G().startClassic();await wait(300);const S=G().S;S.grid[1][1]={hole:true};S.grid[2][2]={chest:true};
    await G().hammer(1,1);await G().hammer(2,2);return {pass:wallet().it.hamer===2&&!!S.grid[2][2],detail:''};
  });
  await t('N6','negatief','Hulpmiddel op 0: grijs, doet niets, niets verbruikt',async()=>{
    setWallet(5,{});G().startClassic();await wait(300);const b=[...document.querySelectorAll('#tools .tool')][0];
    await G().toolTap('hamer');await wait(50);
    return {pass:b.disabled&&$('ov').hidden&&wallet().c===5&&!G().S.tool,detail:''};
  });
  await t('N7','negatief','Hulpmiddel tijdens animatie of open venster wordt genegeerd',async()=>{
    setWallet(0,{dobbel:2});G().startClassic();await wait(300);const S=G().S;S.lock=true;await G().toolTap('dobbel');S.lock=false;
    $('ov').hidden=false;await G().toolTap('dobbel');$('ov').hidden=true;return {pass:wallet().it.dobbel===2,detail:''};
  });
  await t('N8','negatief','Start-Raket op een vol bord wordt niet verbruikt',async()=>{
    setWallet(0,{raket:1});G().startLevel(5);await wait(200);const S=G().S;
    for(let r=0;r<8;r++)for(let c=0;c<8;c++)S.grid[r][c]={color:'#ff5f7e'};
    const placed=await G().startRocket(false,{raket:true});
    return {pass:placed===false&&wallet().it.raket===1,detail:'geplaatst '+placed};
  });
  await t('N9','negatief','Kist komt niet twee keer bij opnieuw spelen van level 3',async()=>{
    setWallet(0,{},{chests:{3:true}});const before=JSON.stringify(wallet().it);G().CAMP.s={1:1,2:1,3:1};G().startLevel(3);await wait(300);const S=G().S;
    S.lvl.goals.forEach(g=>{if(g.t==='stones')S.stats.stones=g.target;if(g.t==='make')S.stats.made[g.sp]=g.target;if(g.t==='score')S.score=g.target;});
    S.movesLeft=0;G().winLevel();await wait(2600);
    return {pass:!cardText().includes('Cadeau')&&JSON.stringify(wallet().it)===before,detail:''};
  });
  await t('N10','negatief','Level opnieuw winnen met dezelfde sterren geeft maar 3 munten',async()=>{
    const stars=G().CAMP.s[3];setWallet(0,{},{chests:{3:true},earned:{3:3}});G().startLevel(3);await wait(300);const S=G().S;
    S.lvl.goals.forEach(g=>{if(g.t==='stones')S.stats.stones=g.target;if(g.t==='make')S.stats.made[g.sp]=g.target;if(g.t==='score')S.score=g.target;});
    S.movesLeft=0;S.score=Math.min(S.score,S.lvl.stars[0]-1);G().winLevel();await wait(2600);
    return {pass:wallet().c===3,detail:`munten ${wallet().c} (sterren voordien ${stars})`};
  });
  await t('N11','negatief','Level verlaten met ✕ zet de winreeks op 0',async()=>{
    setWallet(0,{},{streak:2});G().startLevel(1);await wait(300);$('g-back').click();await wait(50);cardBtn('Stoppen').click();
    return {pass:wallet().streak===0,detail:''};
  });
  await t('N12','negatief','Draaien op een leeg vak in de lade kost niets',async()=>{
    setWallet(0,{draai:1});G().startClassic();await wait(300);G().S.tray[1]=null;await G().rotatePiece(1);
    return {pass:wallet().it.draai===1,detail:''};
  });
  await t('N13','negatief','Gratis raket (winreeks) verbruikt geen gekochte raket',async()=>{
    setWallet(0,{raket:1},{streak:3});G().startLevel(1,{raket:true});await wait(700);const S=G().S;
    const rk=S.grid.flat().filter(x=>x&&x.sp==='raket').length;
    return {pass:rk===1&&wallet().it.raket===1&&wallet().streak===0,detail:`raketten ${rk}`};
  });
  await t('N14','negatief','Vriend zonder level of met HTML in de naam',async()=>{
    G().NET.friends=[{id:'a',nickname:'<img src=x onerror=alert(1)>'},{id:'b',nickname:'',lvl:1}];
    await mapOverview(1);
    const img=document.querySelector('.friends-on img'),chip=document.querySelector('#lv-2 .friends-on');G().NET.friends=[];
    return {pass:!img&&!!chip&&chip.innerText.includes('?'),detail:''};
  });
  // ---------------- video bonuses, server wallet, username ----------------
  await t('U20','UAT','Munten-filmpje: +100 munten, daarna 30 minuten wachten',async()=>{
    setWallet(0,{});G().show('menu');await wait(50);const ready=!$('go-ad').disabled&&$('go-ad').textContent.includes('+100');
    $('go-ad').click();await wait(4800);const got=cardText().includes('+100 munten');close();G().renderCoins();
    return {pass:ready&&got&&wallet().c===100&&$('go-ad').disabled&&/⏳ (29|30):/.test($('go-ad').textContent),detail:$('go-ad').textContent};
  });
  await t('U21','UAT','Dagrad: na de gratis draai één extra draai via een filmpje',async()=>{
    setWallet(0,{},{wheelDay:day()});$('go-wheel').click();await wait(50);
    const eb=cardBtn('Nog 1 keer draaien');if(!eb||eb.hidden)return {pass:false,detail:'geen extra-knop'};
    eb.click();await wait(4800);const sb=cardBtn('Draaien!');const ready=!!sb&&!sb.disabled&&!sb.hidden;
    sb.click();await wait(3900);const after=total();
    return {pass:ready&&after>0&&F.extra===0&&F.extraDay===day(),detail:'na extra draai '+after};
    function total(){return wallet().c+Object.values(wallet().it).reduce((a,v)=>a+v,0);}
  });
  await t('U22','UAT','Gebruikersnaam: knop onderaan, uitleg dat hij vast staat',async()=>{
    const P=G().NET.player;G().NET.player=null;G().show('menu');await wait(50);const shown=!$('me-pick').hidden;
    $('me-pick').click();await wait(50);const txt=cardText();close();
    G().NET.player={nick:'Testspeler',best:0};G().show('menu');await wait(50);
    const locked=$('me-pick').hidden&&$('me-name').textContent.includes('Testspeler')&&$('me-name').textContent.includes('🔒');G().NET.player=P;G().show('menu');
    return {pass:shown&&txt.includes('niet meer wijzigen')&&txt.includes('3 tot 16 tekens')&&locked,detail:''};
  });
  await t('N19','negatief','Munten-filmpje tijdens de wachttijd doet niets',async()=>{
    setWallet(0,{});F.adAt=Date.now()-5*60e3;G().applyWallet(fj());G().show('menu');const calls=F.calls.length;
    $('go-ad').click();await G().coinVideo();await wait(300);
    return {pass:$('go-ad').disabled&&wallet().c===0&&!F.calls.slice(calls).includes('ad_claim')&&$('ov').hidden,detail:$('go-ad').textContent};
  });
  await t('N20','negatief','Na 10 filmpjes op een dag: "Morgen weer"',async()=>{
    setWallet(0,{});F.adDay=day();F.adViews=10;G().applyWallet(fj());G().show('menu');
    return {pass:$('go-ad').disabled&&$('go-ad').textContent.includes('Morgen weer'),detail:$('go-ad').textContent};
  });
  await t('N21','negatief','Tweede extra draai op dezelfde dag kan niet',async()=>{
    setWallet(0,{},{wheelDay:day()});F.extraDay=day();F.extra=0;G().applyWallet(fj());$('go-wheel').click();await wait(50);
    const eb=cardBtn('Nog 1 keer draaien'),sb=cardBtn('Draaien!');
    const r=await fake('ad_claim',{p_kind:'spin'});
    return {pass:(!eb||eb.hidden)&&sb.disabled&&r.status==='limit'&&cardText().includes('middernacht'),detail:r.status};
  });
  await t('N22','negatief','Server-oproepen van de portemonnee gaan naar schema gridquake, de oude gq_-oproepen niet',async()=>{
    const seen=[],orig=window.fetch;
    window.fetch=async(url,o={})=>{if(String(url).includes('/rest/v1/rpc/'))seen.push({fn:String(url).split('/rpc/')[1],profile:(o.headers||{})['Content-Profile']||null});
      return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});};
    try{G().API.s={access_token:'x',refresh_token:'y',uid:'u',expires_at:Date.now()+3600e3,...G().API.s,expires_at:Date.now()+3600e3};
      await realCall.call(G().API,'wallet',{},false,'gridquake');await realCall.call(G().API,'gq_friends',{});}
    finally{window.fetch=orig;}
    const w=seen.find(x=>x.fn==='wallet'),p=seen.find(x=>x.fn==='gq_friends');
    return {pass:!!w&&w.profile==='gridquake'&&!!p&&p.profile===null,detail:JSON.stringify(seen)};
  });
  await t('N23','negatief','Zonder verbinding: winkel meldt het, hulpmiddelen tonen –, niets verbruikt',async()=>{
    setWallet(50,{hamer:1});F.offline=true;G().WAL.ok=false;G().renderCoins();G().shopCard();await wait(100);
    const msg=cardText().includes('Geen verbinding');close();G().startClassic();await wait(300);
    const dash=[...document.querySelectorAll('#tools .tn')].every(x=>x.textContent==='–');await G().toolTap('hamer');
    F.offline=false;const coinsDash=$('coins').textContent.includes('–');await G().API.call('wallet',{},false,'gridquake').then(G().applyWallet);
    return {pass:msg&&dash&&coinsDash&&F.items.hamer===1,detail:''};
  });
  await t('N24','negatief','Gebruikersnaam: regels in de app (zelfde als de server)',async()=>{
    const ok=['Blokbaas','Zoë_99','Jean-Luc','Ab1','Mia Rose'],bad=['ab','Dit is veel te lang 1','<script>','a__b','_abc','abc-','Ana  Bo','12345','Аdmin','na​me','x;drop','😀abc'];
    const wrong=[...ok.filter(n=>!G().nickOk(n)),...bad.filter(n=>G().nickOk(n))];
    return {pass:!wrong.length,detail:'fout: '+wrong.join(', ')};
  });
  await t('N25','negatief','Klassement zonder naam: geen naamknop, alleen een verwijzing naar het menu',async()=>{
    const P=G().NET.player;G().NET.player=null;G().show('lb');await wait(300);
    const body=$('lb-body').innerText,btn=[...$('lb-body').querySelectorAll('button')].some(b=>/naam/i.test(b.textContent));G().NET.player=P;G().show('menu');
    return {pass:!btn&&body.includes('onderaan in het menu'),detail:body.slice(0,80)};
  });
  await t('N26','negatief','Geen munten op het toestel: oude lokale portemonnee wordt genegeerd',async()=>{
    localStorage.setItem('blockers-wallet',JSON.stringify({c:999999,it:{hamer:99}}));setWallet(5,{});
    return {pass:G().WAL.c===5&&(G().WAL.it.hamer|0)===0,detail:'munten '+G().WAL.c};
  });
  // ---------------- fixes after the review of pull request 1 ----------------
  await t('N27','negatief','Level net na een ander level: geen munten, maar ook geen "Geen verbinding"',async()=>{
    setWallet(0,{});F.levelAt=Date.now();G().CAMP.s={};G().startLevel(2);await wait(300);const S=G().S;
    S.lvl.goals.forEach(g=>{if(g.t==='stones')S.stats.stones=g.target;if(g.t==='make')S.stats.made[g.sp]=g.target;if(g.t==='score')S.score=g.target;});
    S.movesLeft=0;G().winLevel();await wait(2800);const txt=cardText();
    return {pass:txt.includes('gehaald')&&!txt.includes('Geen verbinding')&&!/\+\d+ munten/.test(txt)&&wallet().c===0,detail:txt.split('\n').slice(0,4).join(' | ')};
  });
  await t('N28','negatief','Verbinding weg op het game-over-scherm: het scherm blijft staan met een melding',async()=>{
    setWallet(0,{hart:1});G().startClassic();await wait(300);const S=G().S;S.score=1000;S.shown=1000;gameOverBoard(S);
    G().endGame();await wait(1200);F.offline=true;cardBtn('hartje').click();await wait(300);F.offline=false;
    const txt=cardText();return {pass:!$('ov').hidden&&!!cardBtn('Opnieuw spelen')&&txt.includes('Geen verbinding')&&wallet().it.hart===1,detail:''};
  });
  await t('N29','negatief','Tijdens het gebruik van de hamer ligt het bord vast',async()=>{
    setWallet(0,{hamer:1});G().startClassic();await wait(300);const S=G().S;emptyBoard();S.grid[3][3]={color:'#3fc6ff'};F.delay=400;
    const p=G().hammer(3,3);await wait(150);const lockedDuring=S.lock===true;await p;F.delay=0;await wait(600);
    return {pass:lockedDuring&&!S.grid[3][3]&&wallet().it.hamer===0&&S.lock===false,detail:'vast tijdens oproep: '+lockedDuring};
  });
  await t('N30','negatief','Dubbel tikken op het munten-filmpje start één filmpje',async()=>{
    setWallet(0,{});G().show('menu');G().coinVideo();G().coinVideo();await wait(4800);close();
    return {pass:F.calls.filter(c=>c==='ad_claim').length===1&&wallet().c===100,detail:'claims '+F.calls.filter(c=>c==='ad_claim').length};
  });
  await t('N31','negatief','Eindscherm verschijnt niet meer als de speler al weg is',async()=>{
    setWallet(0,{});G().startLevel(4);await wait(300);const S=G().S;F.delay=1500;
    S.lvl.goals.forEach(g=>{if(g.t==='stones')S.stats.stones=g.target;if(g.t==='make')S.stats.made[g.sp]=g.target;if(g.t==='score')S.score=g.target;});
    S.movesLeft=0;G().winLevel();await wait(1900);close();G().show('menu');await wait(2500);F.delay=0;
    return {pass:$('ov').hidden&&G().screen==='menu'&&wallet().c>0,detail:'munten wel bewaard: '+wallet().c};
  });
  await t('N32','negatief','Instellingen tonen geen oude naam van het toestel',async()=>{
    const P=G().NET.player;G().NET.player=null;localStorage.setItem('blockers-nick','OudeNaam');$('settings').click();await wait(100);
    const txt=cardText();close();G().NET.player=P;localStorage.removeItem('blockers-nick');
    return {pass:!txt.includes('OudeNaam'),detail:''};
  });
  // ---------------- helper column next to the board ----------------
  await t('U23','UAT','Hulpmiddelen in één rij onder de blokken, bord op volle breedte, alles op het scherm',async()=>{
    setWallet(0,{hamer:1,raket:2});G().startClassic();await wait(400);
    const t=$('tools').getBoundingClientRect(),c=$('cv').getBoundingClientRect(),n=document.querySelectorAll('#tools .tool').length;
    // the board takes the full width, unless the screen height is the limit (then the helper row ends at the bottom)
    const fullWidth=c.width>=$('cv').parentElement.clientWidth-2||t.bottom>=innerHeight-24;
    return {pass:n===4&&t.top>=c.bottom-1&&t.bottom<=innerHeight+1&&fullWidth,detail:`${n} knoppen, rij ${Math.round(t.top)}-${Math.round(t.bottom)}, bord ${Math.round(c.width)} breed`};
  });
  await t('U24','UAT','Raket uit de winkel: tik op een leeg vakje en hij staat er',async()=>{
    setWallet(0,{raket:2});G().startClassic();await wait(300);const S=G().S;emptyBoard();
    await G().toolTap('raket');const sel=G().S.tool==='raket';await G().placeRocket(2,5);
    return {pass:sel&&S.grid[2][5]&&S.grid[2][5].sp==='raket'&&wallet().it.raket===1&&!S.tool,detail:''};
  });
  await t('U25','UAT','Klassiek game-over: verder spelen met een hartje',async()=>{
    setWallet(0,{hart:2});G().startClassic();await wait(300);const S=G().S;gameOverBoard(S);G().endGame();await wait(1200);
    const b=cardBtn('hartje');const label=b.textContent;b.click();await wait(500);
    return {pass:label.includes('(2)')&&!S.over&&$('ov').hidden&&wallet().it.hart===1&&S.tray.filter(Boolean).length===3,detail:label};
  });
  await t('U26','UAT','Level zonder zetten: verder spelen met een hartje geeft +5 zetten; Menu gaat naar het menu',async()=>{
    setWallet(0,{hart:1});G().startLevel(1);await wait(300);const S=G().S;S.movesLeft=0;G().loseLevel('moves');await wait(100);
    const btns=[...document.querySelectorAll('#ovcard button')].map(b=>b.textContent);cardBtn('hartje').click();await wait(500);
    const ok=!S.over&&S.movesLeft===5&&wallet().it.hart===0&&$('ov').hidden;
    S.movesLeft=0;G().loseLevel('moves');await wait(100);const heartOff=cardBtn('❤️').disabled;cardBtn('Menu').click();await wait(400);
    return {pass:btns.length===4&&ok&&heartOff&&G().screen==='menu',detail:btns.join(' | ')};
  });
  await t('N33','negatief','Hartje is een teller (menu en spel), geen knop tussen de hulpmiddelen; apart in de winkel',async()=>{
    setWallet(0,{hart:2});G().show('menu');await wait(50);const menu=$('hearts').textContent;
    G().startClassic();await wait(300);const game=$('g-hearts').textContent,noBtn=![...document.querySelectorAll('#tools .tool')].some(b=>b.textContent.includes('Hartje'));
    G().shopCard();await wait(50);const rows=[...document.querySelectorAll('#ovcard .shoplist > *')].map(e=>e.textContent);
    const head=rows.findIndex(x=>x==='Hartjes'),heartRow=rows.findIndex(x=>x.includes('Hartje')&&x!=='Hartjes');
    return {pass:menu==='❤️ 2'&&game==='❤️ 2'&&noBtn&&head>=0&&heartRow===head+1&&heartRow===rows.length-1,detail:`menu ${menu}, spel ${game}`};
  });
  await t('N34','negatief','Raket op een bezet vakje kost niets',async()=>{
    setWallet(0,{raket:1});G().startClassic();await wait(300);const S=G().S;S.grid[1][1]={color:'#ff5f7e'};
    await G().toolTap('raket');await G().placeRocket(1,1);
    return {pass:wallet().it.raket===1&&!S.grid[1][1].sp,detail:''};
  });
  // ---------------- themes ----------------
  const pickTheme=async i=>{close();$('settings').click();await wait(100);if(!document.querySelector('.themegrid'))[...document.querySelectorAll('.acc-h')].find(h=>h.dataset.sec==='theme').click();
    await wait(100);[...document.querySelectorAll('.themebtn')][i].click();await wait(100);close();};
  await t('U27','UAT','Thema kiezen: 6 gratis thema\'s, Diepzee geeft eigen kleuren en bewegende achtergrond',async()=>{
    G().show('menu');$('settings').click();await wait(100);if(!document.querySelector('.themegrid'))[...document.querySelectorAll('.acc-h')].find(h=>h.dataset.sec==='theme').click();await wait(100);
    const names=[...document.querySelectorAll('.themebtn')].map(b=>b.textContent),noPrice=!names.some(n=>/🪙|munt/.test(n)),noCalm=!names.some(n=>/Rustig/.test(n));
    await pickTheme(3);
    return {pass:names.length===6&&noPrice&&noCalm&&G().themeId==='diepzee'&&document.documentElement.dataset.theme==='dark'&&G().fx.kind==='bubbles'
      &&getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()==='#062a33'&&localStorage.getItem('blockers-theme')==='diepzee',detail:names.join(', ')};
  });
  await t('U28','UAT','Combo laat de achtergrond gloeien in een levendig thema',async()=>{
    await pickTheme(4);setWallet(0,{});G().startClassic();await wait(300);const S=G().S;emptyBoard();
    for(let c=0;c<7;c++)S.grid[0][c]={color:'#ff5f7e'};S.combo=4;S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];G().place(0,0,7);await wait(600);
    return {pass:G().fx.kind==='stars'&&G().fx.target>0.5,detail:'gloed '+G().fx.target.toFixed(2)};
  });
  await t('N35','negatief','Light: geen bewegende achtergrond en geen gloed bij combo; een oude Dark-keuze wordt Disco',async()=>{
    const out=[];for(const i of [0]){await pickTheme(i);G().startClassic();await wait(200);const S=G().S;S.combo=6;G().S.combo=6;
      const ok=G().fx.kind===null;S.over=true;out.push(ok);}
    await pickTheme(0);G().startClassic();await wait(200);const S=G().S;emptyBoard();for(let c=0;c<7;c++)S.grid[0][c]={color:'#ff5f7e'};S.combo=4;
    S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];G().place(0,0,7);await wait(400);
    const calm=G().fx.target===0;S.over=true;G().show('menu');
    const disco=G().THEMES[1].id==='disco'&&G().THEMES[1].fx==='disco'&&!G().THEMES.some(x=>x.id==='donker');
    return {pass:out.every(Boolean)&&calm&&disco,detail:''};
  });
  await t('N36','negatief','Buiten het spel geen gloed (ook niet na een combo)',async()=>{
    await pickTheme(2);G().startClassic();await wait(200);G().fx.target=.8;G().S.over=true;G().show('menu');
    return {pass:G().fx.target===0&&G().fx.kind==='motes',detail:''};
  });
  await t('U29','UAT','Menu: titel alleen en groot; dagrad, winkel en instellingen op de muntenrij; in het spel weer geluid en instellingen bovenaan',async()=>{
    close();G().show('menu');await wait(50);const hb=getComputedStyle(document.querySelector('header .hbtns')).display,big=parseFloat(getComputedStyle(document.querySelector('.logo')).fontSize);
    const row=['go-ad','go-wheel','go-shop','go-set'].every(id=>$(id).closest('.wallet'));$('go-set').click();await wait(100);const settings=cardText().includes('Instellingen');close();
    G().startClassic();await wait(200);const hbGame=getComputedStyle(document.querySelector('header .hbtns')).display,small=parseFloat(getComputedStyle(document.querySelector('.logo')).fontSize);G().S.over=true;G().show('menu');
    return {pass:hb==='none'&&big>small&&row&&settings&&hbGame!=='none',detail:`titel ${big}px / ${small}px`};
  });
  await t('U30','UAT','Spelscherm: alle rijen even breed als het bord; combo-teller alleen bij een combo',async()=>{
    close();setWallet(0,{});G().startClassic();await wait(400);const S=G().S;
    const c=$('cv').getBoundingClientRect(),k=c.width/360,L=c.left+11*k,R=c.left+349*k;
    const off=['.gtop','.meter','#tools','#hint'].map(q=>{const b=document.querySelector('#s-game '+q).getBoundingClientRect();return Math.max(Math.abs(b.left-L),Math.abs(R-b.right));});
    const hiddenAtStart=$('combo').hidden&&$('combo').textContent==='';
    emptyBoard();for(let c2=0;c2<7;c2++)S.grid[0][c2]={color:'#ff5f7e'};S.combo=1;S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];G().place(0,0,7);await wait(300);
    const shown=!$('combo').hidden&&$('combo').textContent.startsWith('×');S.over=true;G().show('menu');
    return {pass:off.every(x=>x<=2)&&hiddenAtStart&&shown,detail:'afwijking '+off.map(x=>Math.round(x)).join('/')+' px'};
  });
  await t('U31','UAT','Volle combo-balk: FRENZY!, een gloeiende balk en een gratis Raket bij de hulpmiddelen',async()=>{
    close();setWallet(0,{});G().startClassic();await wait(300);const S=G().S;emptyBoard();
    for(let c=0;c<7;c++)S.grid[0][c]={color:'#ff5f7e'};S.combo=7;S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];
    G().place(0,0,7);await wait(200);const burning=document.querySelector('#s-game .meter').classList.contains('fire');
    await wait(1400);const said=G().pops.includes('FRENZY!'),onBoard=S.grid.flat().some(x=>x&&x.sp==='raket');
    const btn=[...document.querySelectorAll('#tools .tool')].find(b=>b.textContent.includes('🚀'));
    const shown=!!btn&&!btn.disabled&&btn.querySelector('.tn').textContent==='1';
    await G().toolTap('raket');await G().placeRocket(2,5);const used=S.grid[2][5]&&S.grid[2][5].sp==='raket'&&S.freeRockets===0&&wallet().it.raket===undefined;
    S.combo=0;G().S.over=true;G().show('menu');
    return {pass:burning&&said&&!onBoard&&shown&&used,detail:`balk ${burning}, melding ${said}, knop ${shown}, gebruikt ${!!used}`};
  });
  await t('N38','negatief','Een gratis Raket geldt alleen voor dat spel: weg in een nieuw spel, nooit in de portemonnee',async()=>{
    close();setWallet(0,{});G().startClassic();await wait(300);let S=G().S;emptyBoard();
    for(let c=0;c<7;c++)S.grid[0][c]={color:'#ff5f7e'};S.combo=7;S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];
    G().place(0,0,7);await wait(1600);const had=S.freeRockets===1;S.over=true;G().show('menu');
    G().startClassic();await wait(300);S=G().S;
    const btn=[...document.querySelectorAll('#tools .tool')].find(b=>b.textContent.includes('🚀'));
    const gone=!S.freeRockets&&btn.disabled&&!wallet().it.raket;S.over=true;G().show('menu');
    return {pass:had&&gone,detail:''};
  });
  await t('N37','negatief','Geen combo-vuur bij combo 7, en de balk brandt niet',async()=>{
    close();setWallet(0,{});G().startClassic();await wait(300);const S=G().S;emptyBoard();
    for(let c=0;c<7;c++)S.grid[0][c]={color:'#ff5f7e'};S.combo=6;S.tray=[piece([[0,0]]),piece([[0,0]]),piece([[0,0]])];
    G().place(0,0,7);await wait(1600);const burning=document.querySelector('#s-game .meter').classList.contains('fire');
    const rockets=S.grid.flat().filter(x=>x&&x.sp==='raket').length;S.over=true;G().show('menu');
    return {pass:!burning&&rockets===0&&!G().pops.includes('FRENZY!'),detail:''};
  });
  await t('N39','negatief','Eigen hartje maximaal 1 keer per spel',async()=>{
    setWallet(0,{hart:2});G().startClassic();await wait(300);const S=G().S;gameOverBoard(S);G().endGame();await wait(1200);
    cardBtn('hartje').click();await wait(500);const first=!S.over&&wallet().it.hart===1;
    gameOverBoard(S);G().endGame();await wait(1200);const b=cardBtn('❤️'),off=b.disabled&&b.textContent.includes('al gebruikt');b.click();await wait(300);
    const kept=wallet().it.hart===1&&S.over;cardBtn('Menu').click();await wait(300);
    return {pass:first&&off&&kept,detail:b.textContent};
  });
  await t('U32','UAT','Instellingen openen altijd met alle onderdelen dicht',async()=>{
    G().show('menu');$('go-set').click();await wait(50);document.querySelector('#ovcard .acc-h').click();await wait(50);
    const opened=!!document.querySelector('#ovcard .acc.open');close();await wait(50);$('go-set').click();await wait(50);
    const shut=!document.querySelector('#ovcard .acc.open');close();
    return {pass:opened&&shut,detail:''};
  });
  await t('U33','UAT','Terug- en sluitknoppen zijn groot genoeg (minstens 40 px)',async()=>{
    const sz=[];G().show('camp');await wait(50);sz.push(document.querySelector('#s-camp [data-back]').getBoundingClientRect());
    G().startClassic();await wait(300);sz.push($('g-back').getBoundingClientRect());G().S.over=true;G().show('menu');
    return {pass:sz.every(r=>r.width>=40&&r.height>=40),detail:sz.map(r=>Math.round(r.width)+'×'+Math.round(r.height)).join(', ')};
  });
  await pickTheme(0);
  localStorage.removeItem('blockers-wallet');
  G().API.call=realCall;
  close();G().show('menu');
  return results;
}
