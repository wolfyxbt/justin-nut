import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'justin-nut-test-'));
try {
const renderer=createRequire(import.meta.url)('@napi-rs/canvas');
const noop=()=>{},elements={},documentListeners={},windowListeners={},intervals=[],messages=[];
const standalone=process.argv.includes('--standalone');
const html=fs.readFileSync(path.join(root,standalone?'dist/justin-nut.html':'index.html'),'utf8');
let clockMs=0,frameCallback=null,serial=0,canvasRect={left:10,top:20,width:450,height:300};
function makeElement(id=null){
 return {id,dataset:{},style:{},attributes:{},children:[],queries:{},innerHTML:'',hidden:false,
  classList:{toggle:noop},setAttribute(name,value){this.attributes[name]=String(value);},
  addEventListener(type,fn){(this.listeners??={})[type]=fn;},
  querySelector(selector){return this.queries[selector]??=makeElement();},
  append(child){child.parent=this;this.children.push(child);},
  replaceChildren(...children){this.children=[];children.forEach(child=>this.append(child));},
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);},
  focus:noop,scrollIntoView:noop,clientWidth:158,firstElementChild:{style:{}}};
}
for(const match of html.matchAll(/\bid="([^"]+)"/g))elements[match[1]]=makeElement(match[1]);
const element=id=>{assert.ok(elements[id],'game references an existing HTML element: '+id);return elements[id];};
const intro=html.match(/<div id="dialog-body">([\s\S]*?)\n\s*<button id="primary"/)[1].replace(/<\/div>\s*$/,'');
element('dialog-body').innerHTML=intro;
const bufferCanvas=renderer.createCanvas(900,600),heldBuffer=renderer.createCanvas(900,600);
element('game').getContext=()=>bufferCanvas.getContext('2d');element('held-item').getContext=()=>heldBuffer.getContext('2d');
element('game').getBoundingClientRect=()=>canvasRect;
element('arena').getBoundingClientRect=()=>({...canvasRect,top:canvasRect.top+65*canvasRect.height/600,height:535*canvasRect.height/600});
element('game-wrap').setPointerCapture=function(id){this.capturedId=id;};
element('game-wrap').hasPointerCapture=function(id){return this.capturedId===id;};
element('game-wrap').releasePointerCapture=function(){this.capturedId=null;};
element('watch-frame').contentWindow={postMessage:message=>messages.push(JSON.parse(message))};
const pending=[],loadedImages=[],drawRecords=[],textRecords=[],playedSounds=[];let captureDraws=false;
class MockImage {
 constructor(){this.id=++serial;}
 set src(value){
  this.assetSource=value;loadedImages.push(value);
  const source=value.startsWith('data:')?Buffer.from(value.slice(value.indexOf(',')+1),'base64'):path.join(root,value);
  pending.push(renderer.loadImage(source).then(image=>{this.image=image;this.width=image.width;this.height=image.height;this.onload();}));
 }
}
class MockAudio {
 constructor(src){this.src=src;}
 cloneNode(){return new MockAudio(this.src);}
 addEventListener(){}
 play(){playedSounds.push({src:this.src,volume:this.volume});return Promise.resolve();}
 pause(){}
}
const realCtx=bufferCanvas.getContext('2d');
for(const context of [realCtx,heldBuffer.getContext('2d')]){
 const draw=context.drawImage.bind(context);context.drawImage=(im,...args)=>{if(captureDraws&&context===realCtx)drawRecords.push({src:im.assetSource,args,transform:context.getTransform()});return draw(im.image??im,...args);};
 const text=context.fillText.bind(context);context.fillText=(value,...args)=>{if(captureDraws&&context===realCtx)textRecords.push(value);return text(value,...args);};
}
const storage=new Map();
const sandbox={console,Math,URLSearchParams,performance:{now:()=>clockMs},Image:MockImage,Audio:MockAudio,
 HTMLInputElement:class{},requestAnimationFrame:fn=>{frameCallback=fn;},setInterval:fn=>{intervals.push(fn);},location:{search:'?debug=1'},
 localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},
 document:{hidden:false,getElementById:id=>elements[id]??null,addEventListener:(type,fn)=>{documentListeners[type]=fn;},createElement:()=>makeElement()},
 window:{addEventListener:(type,fn)=>{windowListeners[type]=fn;}}};
sandbox.window.window=sandbox.window;vm.createContext(sandbox);
if(standalone){for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(script[1],sandbox);}
else for(const file of ['assets/chapters.js','assets/sprites.js','assets/justin-sprites.js','assets/pingpong-sprites.js','plants.js','game.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox);
await Promise.all(pending);await new Promise(resolve=>setTimeout(resolve,30));
const d=sandbox.window.pvzDebug,results=[];
const check=(value,name)=>{assert.ok(value,name);results.push(name);};
const key=(key,code)=>documentListeners.keydown({key,code,preventDefault:noop});
const event=(x,y,pointerType='mouse',pointerId=301)=>({clientX:canvasRect.left+x*canvasRect.width/900,clientY:canvasRect.top+y*canvasRect.height/600,pointerType,pointerId,button:0,detail:1,preventDefault:noop});
const packet=(type,id=null)=>element('belt-track').children.find(button=>button.dataset.plant===type&&(id===null||button.dataset.packetId===String(id)));
const begin=()=>{d.start();d.skipCountdown();};
const visible=()=>heldBuffer.getContext('2d').getImageData(0,0,900,600).data.some((value,index)=>index%4===3&&value>0);
check(d.snapshot().mode==='ready'&&element('primary').textContent==='开始游戏'&&element('extra-buttons').children.length===0,'入口：一个开始按钮，直接进入保龄球');
check((intro.match(/<figure /g)||[]).length===4&&['孙宇晨坚果','爆炸坚果','景甜向日葵','曾颖向日葵'].every(name=>intro.includes('alt="'+name+'"')),'入口：四张植物卡片，包含曾颖向日葵');
check(!elements['seed-bank']&&!elements['sun-total']&&!elements.meter&&!/选择关卡|经典关卡/.test(html),'界面：没有选关、阳光栏和关卡进度条');
check(Object.keys(sandbox.window.PLANT_DEFINITIONS).sort().join(',')==='boomnut,nutflower,wallnut,zengflower','角色：四种保龄球植物');
check(!loadedImages.includes(sandbox.window.SPRITES.peashooter.src)&&!loadedImages.includes(sandbox.window.SPRITES.sun.src),'加载：不请求豌豆射手和阳光动画');
d.mute();element('primary').onclick();check(d.snapshot().mode==='countdown'&&element('overlay').hidden,'开始：点击后进入倒计时');
clockMs=1000;frameCallback(clockMs);clockMs=3800;frameCallback(clockMs);
check(d.snapshot().mode==='playing'&&d.snapshot().belt.length===1&&!element('shovel').disabled,'倒计时：结束后传送带和铲子可用');
check(d.snapshot().sun===undefined&&d.snapshot().cooldowns===undefined&&d.snapshot().peas===undefined&&d.snapshot().level===undefined,'状态：没有阳光、冷却、豌豆或模式分支');
// The custom sunflower must retain the source GIF's timeline, silhouette and body pixels.
const definitions=sandbox.window.PLANT_DEFINITIONS,sprites=sandbox.window.SPRITES;
const feedForTest=(type,row,col)=>{
 if(!definitions[type].feedType)return;
 assert.ok(d.addPacket('wallnut'),'feeding scene has an input nut');
 assert.ok(d.plant(row,col,'wallnut'),'feeding scene starts processing');
};
check(!definitions.nutflower.idleMotion,'景甜动画：不再叠加整图旋转和呼吸缩放');
check(definitions.nutflower.width===sprites.sunflower.w&&definitions.nutflower.height===sprites.sunflower.h,'景甜动画：草坪绘制尺寸与原版一致');
const readSprite=async meta=>{
 const source=meta.src.startsWith('data:')?Buffer.from(meta.src.slice(meta.src.indexOf(',')+1),'base64'):path.join(root,meta.src);
 const picture=await renderer.loadImage(source),surface=renderer.createCanvas(picture.width,picture.height),context=surface.getContext('2d');
 context.drawImage(picture,0,0);return {width:picture.width,pixels:context.getImageData(0,0,picture.width,picture.height).data};
};
for(const [customName,sourceName] of [['justin-sunflower','sunflower'],['justin-sunflower-glow','sunflower-glow'],['zeng-ying-sunflower','sunflower'],['zeng-ying-sunflower-glow','sunflower-glow']]){
 const custom=sprites[customName],original=sprites[sourceName];
 check(JSON.stringify(custom.durations)===JSON.stringify(original.durations)&&custom.duration===original.duration,customName+'：帧数与每帧时长完全一致');
 check(custom.motionSource===sourceName&&custom.w===original.w*custom.scale&&custom.h===original.h*custom.scale&&custom.faceRows.length===original.durations.length,customName+'：每个图集帧对应原版帧');
 const actual=await readSprite(custom),expected=await readSprite(original);
 let sameAlpha=true,sameBody=true,samePetals=true,redPixels=0;
 for(let frame=0;frame<original.durations.length;frame++){
  for(let y=0;y<original.h;y++)for(let x=0;x<original.w;x++){
   const originalIndex=(((Math.floor(frame/original.cols)*original.h+y)*expected.width)+(frame%original.cols)*original.w+x)*4;
   const customIndex=(((Math.floor(frame/custom.cols)*custom.h+y*custom.scale+Math.floor(custom.scale/2))*actual.width)+(frame%custom.cols)*custom.w+x*custom.scale+Math.floor(custom.scale/2))*4;
   if(actual.pixels[customIndex+3]!==expected.pixels[originalIndex+3])sameAlpha=false;
   const [left,right]=custom.faceRows[frame][y];
   const [red,green,blue,alpha]=expected.pixels.subarray(originalIndex,originalIndex+4);
   const tintedPetal=custom.petalTint&&y<56&&red>=green&&green>blue*1.5;
   if((left<0||x<left||x>right)&&!tintedPetal){
    for(let channel=0;channel<4;channel++)if(actual.pixels[customIndex+channel]!==expected.pixels[originalIndex+channel])sameBody=false;
   }
   if(alpha>128&&red>170&&green>red*.78&&blue<green*.55){
    if(actual.pixels[customIndex]>actual.pixels[customIndex+1]*1.6)redPixels++;
    for(let dy=0;dy<custom.scale;dy++)for(let dx=0;dx<custom.scale;dx++){
     const index=(((Math.floor(frame/custom.cols)*custom.h+y*custom.scale+dy)*actual.width)+(frame%custom.cols)*custom.w+x*custom.scale+dx)*4;
     for(let channel=0;channel<4;channel++)if(actual.pixels[index+channel]!==expected.pixels[originalIndex+channel])samePetals=false;
    }
   }
  }
 }
 check(sameAlpha,customName+'：25 帧轮廓逐像素一致');
 check(sameBody,customName+'：脸部与花瓣配色之外的原版像素全部保留');
 if(custom.petalTint)check(redPixels>500,customName+'：原版花瓣区域呈现红色');
 else check(samePetals,customName+'：花瓣及花盘边缘的黄色像素保持原版，包括图集的每个放大像素');
}
// Track the rendered facial texture in flower-local coordinates. A changing
// per-frame face size fails this pixel check even if the atlas timing is correct.
const facePoints=[];
for(let y=-8;y<=8;y+=2)for(let x=-10;x<=10;x+=2)facePoints.push([x,y]);
let fixedFaceReference=null;
for(const name of ['zeng-ying-sunflower','zeng-ying-sunflower-glow']){
 const meta=sprites[name],atlas=await readSprite(meta);
 check(meta.faceSampling==='fixed'&&meta.sourcePixelsPerPixel===sprites['zeng-ying-sunflower'].sourcePixelsPerPixel,name+'：普通与发光共用固定脸部尺寸');
 check(meta.faceMotion?.length===meta.durations.length&&meta.faceMotion.every(p=>p.length===3&&p.every(Number.isFinite)),name+'：每帧脸部仅记录平移与旋转');
 const bilinear=(frame,x,y,c)=>{
  const px=frame%meta.cols*meta.w+x,py=Math.floor(frame/meta.cols)*meta.h+y;
  const ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;let value=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)value+=atlas.pixels[((iy+dy)*atlas.width+ix+dx)*4+c]*(dx?fx:1-fx)*(dy?fy:1-fy);
  return value;
 };
 const sample=(frame,x,y)=>{
  const [cx,cy,angle]=meta.faceMotion[frame];
  const px=meta.scale*(cx+x*Math.cos(angle)-y*Math.sin(angle))-.5;
  const py=meta.scale*(cy+x*Math.sin(angle)+y*Math.cos(angle))-.5;
  return [0,1,2].map(c=>{
   let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=bilinear(frame,px+dx,py+dy,c);
   return sum/9;
  });
 };
 fixedFaceReference??=facePoints.map(([x,y])=>sample(0,x,y));
 let squaredError=0,samples=0;
 for(let frame=0;frame<meta.durations.length;frame++)for(let point=0;point<facePoints.length;point++){
  const rgb=sample(frame,...facePoints[point]);
  for(let c=0;c<3;c++){squaredError+=(rgb[c]-fixedFaceReference[point][c])**2;samples++;}
 }
 check(Math.sqrt(squaredError/samples)<4,name+'：实际脸部像素随花盘稳定移动，25 帧无缩放呼吸或发光切换跳变');
 // Check the actual rendered seed material on both sides of the old inset rim.
 // A baked inner flower outline or differently coloured extension creates a
 // large discontinuity here even while the face itself moves rigidly.
 const averageRim=(frame,side,radius)=>{
  const rgb=[0,0,0];let count=0;
  for(let y=-1;y<=1;y+=.5)for(let x=-1;x<=1;x+=.5){
   const point=sample(frame,side*radius*meta.faceCrop[2]/2/meta.sourcePixelsPerPixel+x,y);
   for(let c=0;c<3;c++)rgb[c]+=point[c];count++;
  }
  return rgb.map(v=>v/count);
 };
 let rimJump=0,rimSamples=0,maxRimJump=0;
 for(let frame=0;frame<meta.durations.length;frame++)for(const side of [-1,1]){
  const inside=averageRim(frame,side,.9),outside=averageRim(frame,side,1.05);
  for(let c=0;c<3;c++){const jump=Math.abs(inside[c]-outside[c]);rimJump+=jump;rimSamples++;maxRimJump=Math.max(maxRimJump,jump);}
 }
 check(rimJump/rimSamples<5&&maxRimJump<10,name+'：实际花盘纹理跨过原贴图边界时没有第二圈光晕或颜色断层');
}
for(const flowerType of ['nutflower','zengflower']){
 d.mute();d.start();d.skipCountdown();d.addPacket(flowerType);d.plant(2,2,flowerType);d.advance(0);
 feedForTest(flowerType,2,2);
 const plantPixels=()=>Buffer.from(bufferCanvas.getContext('2d').getImageData(302,290,77,79).data);
 const initial=plantPixels();d.advance(.2);
 check(!plantPixels().equals(initial),'景甜动画：游戏渲染会推进原版帧序列');
 d.pause();d.advance(0);const paused=plantPixels();d.advance(1);
 check(plantPixels().equals(paused),'景甜动画：暂停时帧画面保持不动');
 d.resume();d.advance(.2);
 check(!plantPixels().equals(paused),'景甜动画：继续游戏后恢复逐帧播放');
 captureDraws=true;drawRecords.length=0;d.advance(8.6);captureDraws=false;
 const glow=sprites[definitions[flowerType].glowSprite],glowDraw=drawRecords.find(record=>record.src===glow.src);
 check(!!glowDraw,'景甜动画：结果前使用原版发光帧序列');
 const snapshot=d.snapshot(),plant=snapshot.plants[0];
 const expectedFrame=Math.floor(((snapshot.time-plant.born+plant.phase)*1000%glow.duration)/40);
 check(glowDraw&&glowDraw.args[0]/glow.w+glow.cols*glowDraw.args[1]/glow.h===expectedFrame,'景甜动画：切换发光状态时保持原版时钟相位');
}

// Mouse carrying uses actual conveyor buttons, including duplicate packets.
const mass=()=>{const pixels=heldBuffer.getContext('2d').getImageData(0,0,900,600).data;let weight=0,x=0,y=0;for(let i=3;i<pixels.length;i+=4){const alpha=pixels[i],n=(i-3)/4;weight+=alpha;x+=(n%900)*alpha;y+=Math.floor(n/900)*alpha;}return {weight,x:x/weight,y:y/weight};};
for(const type of ['wallnut','boomnut','nutflower','zengflower']){
 begin();const id=d.addPacket(type),button=packet(type,id);button.onclick(event(200,40));d.advance(0);
 check(d.snapshot().selected===type&&d.snapshot().selectedPacket===id&&visible(),type+'：传送带取卡后显示携带形象');
 element('game-wrap').listeners.pointermove(event(180,134));d.advance(0);const a=mass();
 element('game-wrap').listeners.pointermove(event(260,232));d.advance(0);const b=mass();
 check(Math.abs(b.x-a.x-80)<.1&&Math.abs(b.y-a.y-98)<.1,type+'：缩放草坪上的鼠标跟随正确');
 check(element('game').style.cursor==='grabbing','携带：保留可见光标');key('Escape');d.advance(0);
 check(!visible()&&d.snapshot().selected===null&&element('game').style.cursor==='default','取消卡片：清除携带画面和光标状态');
}
begin();const first=d.addPacket('wallnut'),second=d.addPacket('wallnut');packet('wallnut',second).onclick(event(200,40));element('game').listeners.pointerdown(event(180,428));
check(!d.snapshot().belt.some(card=>card.id===second)&&d.snapshot().belt.some(card=>card.id===first),'传送带：同类卡片只消耗实际选中的那张');
packet('wallnut',first).onclick(event(200,40));element('menu-button').onclick();d.advance(0);
check(!visible()&&d.snapshot().mode==='paused'&&element('shovel').disabled,'暂停：隐藏携带形象并禁用操作');
check(element('extra-buttons').children.map(button=>button.textContent).join(',')==='重新开始','暂停菜单：只有重开，没有选关入口');
element('primary').onclick();d.advance(0);check(visible()&&d.snapshot().mode==='playing','继续：恢复携带卡片');
element('game-wrap').listeners.contextmenu({preventDefault:noop});d.advance(0);check(!visible(),'右键：取消卡片选择');
d.pause();element('extra-buttons').children[0].onclick();check(element('dialog-title').textContent==='重新开始？','重开：进入确认窗口');
element('extra-buttons').children[0].onclick();check(d.snapshot().mode==='paused'&&element('primary').textContent==='继续游戏','重开返回：回到暂停菜单');
const videoMessages=messages.length;element('extra-buttons').children[0].onclick();element('primary').onclick();
check(d.snapshot().mode==='countdown'&&d.snapshot().time===0&&d.snapshot().rolling.length===0&&d.snapshot().belt.length===1,'确认重开：清空进度并直接开始保龄球');
check(messages.length===videoMessages,'重开：不控制播客播放器');
// Touch cards use the actual belt instead of the removed seed bank.
for(const width of [316,370,460]){
 canvasRect={left:8,top:137,width,height:width*2/3};const wrap=element('game-wrap');begin();
 const id=d.addPacket('nutflower'),flower=packet('nutflower',id),input=event(150,-40,'touch',101);
 flower.listeners.pointerdown(input);wrap.listeners.pointerup(input);flower.onclick(input);check(d.snapshot().selected==='nutflower','手机 '+width+'px：点选传送带卡片');
 element('game').listeners.pointerdown(event(180,134,'touch',102));check(d.snapshot().plants.length===0,'触屏：按下仅预览');wrap.listeners.pointerup(event(180,134,'touch',102));
 check(d.snapshot().plants.some(p=>p.row===0&&p.col===0),'手机 '+width+'px：松手映射到正确格子');
 const dragId=d.addPacket('nutflower'),drag=packet('nutflower',dragId);drag.listeners.pointerdown(event(200,-40,'touch',103));wrap.listeners.pointermove(event(340,330,'touch',103));
 check(d.snapshot().selected==='nutflower'&&d.snapshot().plants.length===1,'拖动：保持预览');wrap.listeners.pointerup(event(340,330,'touch',103));drag.onclick(event(340,330,'touch',103));
 check(d.snapshot().plants.some(p=>p.row===2&&p.col===2)&&d.snapshot().selected===null,'手机 '+width+'px：拖拽种植，click 不重选');
 const rejected=d.addPacket('nutflower'),candidate=packet('nutflower',rejected);candidate.listeners.pointerdown(event(200,-40,'touch',104));wrap.listeners.pointermove(event(340,330,'touch',104));wrap.listeners.pointerup(event(340,330,'touch',104));
 check(d.snapshot().plants.length===2&&d.snapshot().belt.some(p=>p.id===rejected),'手机 '+width+'px：占用格不扣卡片');
 element('game').listeners.pointerdown(event(500,428,'touch',105));wrap.listeners.pointerup(event(500,428,'touch',105));check(d.snapshot().plants.length===2&&d.snapshot().selected==='nutflower','手机 '+width+'px：红线右侧保留卡片');
 wrap.listeners.contextmenu({preventDefault:noop});candidate.listeners.pointerdown(event(200,-40,'touch',106));wrap.listeners.pointermove(event(260,428,'touch',106));wrap.listeners.pointercancel();wrap.listeners.pointerup(event(260,428,'touch',106));
 check(d.snapshot().plants.length===2&&d.snapshot().selected===null,'手机 '+width+'px：取消拖动不会误种');
}
canvasRect={left:10,top:20,width:450,height:300};
// Endless bowling: belt-fed nuts, red-line placement, ricochets, scoring and the loss path.
d.start();d.skipCountdown();
{const s=d.snapshot();check(s.belt.length===1&&s.belt[0].pos>9,'保龄球：开局一颗坚果从传送带右端进入');}
d.addPacket('wallnut');d.addPacket('wallnut');
check(!d.plant(2,3,'wallnut')&&!d.plant(2,8,'wallnut'),'保龄球：红线右侧不能放置');
check(!d.plant(2,0,'sunflower')&&!d.plant(2,0,'peashooter'),'保龄球：不使用普通向日葵和豌豆射手');
d.spawn(0,'cone',420);d.spawn(1,'normal',500);d.spawn(2,'normal',500);
check(d.plant(0,0,'wallnut')&&d.snapshot().belt.length===2&&d.snapshot().rolling.length===1,'保龄球：取用坚果后开始滚动');
check(d.snapshot().selected===null&&d.snapshot().selectedPacket===null,'保龄球：放下后需要重新手动取卡');
check(!d.plant(0,0,'wallnut'),'保龄球：同一格不能叠放');
// Timeline: hit the cone at ~0.86 s, reach lane 1 at ~1.36 s and hit there, reverse to lane 0, bounce off the edge at ~1.86 s.
d.advance(1);
{const s=d.snapshot();const cone=s.zombies.find(z=>z.type==='cone');
 check(cone&&cone.armor===0&&!cone.dying,'保龄球：路障僵尸第一下只掉路障');
 check(s.rolling[0].row===1&&s.rolling[0].dir===1,'保龄球：最上行撞击后立刻斜向下滚');
 check(s.score===100,'保龄球：首次命中得 100 分');}
d.advance(.6);
{const s=d.snapshot();
 check(s.kills===1&&s.score===300,'保龄球：同一颗坚果第二次命中得 200 分');
 check(s.rolling[0].dir===-1&&s.rolling[0].row===0,'保龄球：再次命中后反向斜滚');}
d.advance(.5);
{const n=d.snapshot().rolling[0];check(n&&n.dir===1&&n.row===1,'保龄球：碰到草坪边缘后折返');}
d.advance(1.5);
check(d.snapshot().rolling.length===0,'保龄球：坚果滚出草坪后消失');
check(d.snapshot().zombies.some(z=>z.row===2&&!z.dying),'保龄球：未被命中的僵尸继续前进');
for(let r=0;r<5&&d.snapshot().belt.length>0;r++)d.plant(r,2,'wallnut');
check(d.snapshot().belt.length===0&&d.snapshot().selected===null,'保龄球：传送带空了就取消选择');
check(!d.plant(3,0,'wallnut'),'保龄球：传送带空时不能放置');
d.advance(4.1);
{const s=d.snapshot();check(s.belt.length>=1&&s.belt[0].pos>3,'保龄球：新坚果从传送带右端进入');}
d.advance(21);check(d.snapshot().belt[0].pos===0,'保龄球：坚果以每秒半格的速度滑到最前面');
d.advance(75);check(d.snapshot().belt.length===10,'保龄球：传送带最多 10 颗');
// Jing Tian Sunflower on the belt: plants behind the line, zombies eat it, its nuts go straight into the hand.
d.start();d.skipCountdown();d.addPacket('nutflower');
check(!d.plant(2,4,'nutflower'),'景甜向日葵：无尽模式只能种在红线左侧');
{const before=d.snapshot().belt.length;
 check(d.plant(2,1,'nutflower')&&d.snapshot().plants.length===1&&d.snapshot().belt.length===before-1,'景甜向日葵：从传送带取卡种下');}
check(!d.plant(2,1,'wallnut'),'景甜向日葵：坚果不能放在它的格子上');
d.advance(10.2);check(d.snapshot().drops.length>0,'景甜向日葵：无尽模式也结坚果');
{const before=d.snapshot().belt.length;d.pickNut();const s=d.snapshot();
 check(s.heldNut&&s.selected==='wallnut'&&s.belt.length===before,'景甜向日葵：拿起坚果不加入传送带');}
d.spawn(2,'normal',330);d.advance(6);
{const p=d.snapshot().plants[0];check(p&&p.hp<300,'景甜向日葵：僵尸会停下来吃它');}
// Pick-up input must preserve a single nut until a valid placement in either mode.
const lawnEvent=(x,y,pointerType='mouse',pointerId=301)=>({clientX:canvasRect.left+x*canvasRect.width/900,clientY:canvasRect.top+y*canvasRect.height/600,pointerType,pointerId,button:0,detail:1,preventDefault:noop});
const heldVisible=()=>heldBuffer.getContext('2d').getImageData(0,0,900,600).data.some((value,index)=>index%4===3&&value>0);
const pickNut=(pointerType='mouse',pointerId=301)=>{
 const nut=d.snapshot().drops.at(0);assert.ok(nut,'pickup scene has a nut');
 const event=lawnEvent(nut.x,nut.y,pointerType,pointerId);element('game').listeners.pointerdown(event);
 if(pointerType==='touch')element('game-wrap').listeners.pointerup(event);
 d.advance(0);return nut;
};
// A growing red fruit distinguishes fed flowers and hands off to the actual drop.
const formingFruits=()=>{
 captureDraws=true;drawRecords.length=0;d.advance(0);captureDraws=false;
 return drawRecords.filter(record=>record.src===sprites['justin-nut-boom'].src);
};
begin();d.addPacket('zengflower');d.plant(2,0,'zengflower');d.addPacket('zengflower');d.plant(2,1,'zengflower');
check(formingFruits().length===0,'生成动画：未喂食的向日葵没有红色果实');
feedForTest('zengflower',2,1);
const fruitStart=formingFruits();
check(fruitStart.length===1&&fruitStart[0].args[6]>=10&&fruitStart[0].args[6]<20&&d.snapshot().drops.length===0,'生成动画：喂食后立即出现小红果，邻株仍为空');
check(!d.pickNut()&&!d.snapshot().heldNut,'生成动画：尚未生成完成的坚果不能提前拿走');
d.advance(5);const fruitMiddle=formingFruits();
check(fruitMiddle.length===1&&fruitMiddle[0].args[6]>fruitStart[0].args[6]&&fruitMiddle[0].args[6]<40,'生成动画：等待期间红色果实持续长大');
const frozenFruit=Buffer.from(bufferCanvas.getContext('2d').getImageData(220,280,110,100).data);
d.pause();d.advance(3);
check(frozenFruit.equals(Buffer.from(bufferCanvas.getContext('2d').getImageData(220,280,110,100).data)),'生成动画：暂停时果实大小和晃动全部冻结');d.resume();
feedForTest('zengflower',2,0);
const staggered=formingFruits().sort((a,b)=>a.transform.e-b.transform.e);
check(staggered.length===2&&staggered[1].args[6]>staggered[0].args[6],'生成动画：不同时间喂食的向日葵分别显示自身进度');
d.advance(4.9);const fruitAlmost=formingFruits().find(record=>record.transform.e>250);
check(fruitAlmost&&fruitAlmost.args[6]>fruitMiddle[0].args[6]&&d.snapshot().drops.length===0,'生成动画：临近完成时果实更大，仍须等满转化时间');
d.advance(.15);
{const s=d.snapshot(),drop=s.drops[0];
 check(s.drops.length===1&&drop.type==='boomnut'&&s.plants.find(p=>p.col===1).nextAction===null,'生成动画：成熟后恰好生成一颗可拾取红色坚果');
 check(Math.abs(drop.startX-fruitAlmost.transform.e)<1&&Math.abs(drop.startY-fruitAlmost.transform.f)<1&&Math.abs(drop.startWidth-fruitAlmost.args[6])<1,'生成动画：成熟果实从原位置、原大小自然脱落');
 check(formingFruits().length===2,'生成动画：已完成植株不保留重复果实，另一株继续生长');
}
d.pickNut();
check(d.snapshot().heldNut?.type==='boomnut'&&formingFruits().length===1,'生成动画：成熟后可拿走果实，不影响另一株生长');
// Feeding help appears on demand; wrong ingredients use the error sound only.
begin();d.addPacket('zengflower');d.plant(2,1,'zengflower');
check(element('notice').textContent==='','曾颖向日葵：种下时不自动显示喂食长提示');
captureDraws=true;textRecords.length=0;d.advance(0);captureDraws=false;
check(textRecords.length===0,'曾颖向日葵：待喂食时周围没有常驻文字');
element('game').listeners.pointerdown(lawnEvent(260,330));
check(element('notice').textContent==='喂我一颗孙宇晨坚果吧'&&d.snapshot().selected===null,'曾颖向日葵：鼠标空手点击显示简短喂食提示');
d.resume();clockMs+=2100;frameCallback(clockMs);check(element('notice').textContent==='','曾颖向日葵：点击提示会自动消失');
element('sound-button').onclick();d.setVolume(.4);
const errorSource=sandbox.window.AUDIO_SOURCES?.error||'assets/error.mp3';
for(const type of ['boomnut','nutflower','zengflower']){
 const id=d.addPacket(type);packet(type,id).onclick(lawnEvent(200,-40));
 const before=d.snapshot(),soundsBefore=playedSounds.length;
 element('game').listeners.pointerdown(lawnEvent(260,330));
 check(playedSounds.length===soundsBefore+1&&playedSounds.at(-1).src===errorSource&&Math.abs(playedSounds.at(-1).volume-.22)<1e-8,'曾颖向日葵：错误原料 '+type+' 播放错误提示音并遵循游戏音量');
 check(JSON.stringify(d.snapshot().belt)===JSON.stringify(before.belt)&&d.snapshot().selected===type&&d.snapshot().plants[0].nextAction===null&&element('notice').textContent==='','曾颖向日葵：错误原料 '+type+' 不扣卡片、不替换植物、不弹文字');
 key('Escape');
}
d.mute();d.addPacket('boomnut');
{const n=playedSounds.length;d.plant(2,1,'boomnut');check(playedSounds.length===n,'曾颖向日葵：静音时不播放错误提示音');}key('Escape');d.setVolume(1);
feedForTest('zengflower',2,1);
captureDraws=true;textRecords.length=0;d.advance(0);captureDraws=false;
check(textRecords.length===0&&element('notice').textContent==='','曾颖向日葵：转化中没有倒计时文字或喂食成功长提示');
element('game').listeners.pointerdown(lawnEvent(260,330));
check(element('notice').textContent==='正在转化，请稍等','曾颖向日葵：转化中空手点击显示简短状态');
for(const width of [316,370,460]){
 canvasRect={left:8,top:137,width,height:width*2/3};begin();d.addPacket('zengflower');d.plant(2,1,'zengflower');
 const wrap=element('game-wrap'),tap=lawnEvent(260,330,'touch',701);
 element('game').listeners.pointerdown(tap);
 check(element('notice').textContent==='','提示 手机 '+width+'px：按下时不提前弹出');
 wrap.listeners.pointerup(tap);
 check(element('notice').textContent==='喂我一颗孙宇晨坚果吧','提示 手机 '+width+'px：空手轻点向日葵弹出喂食提示');
 d.resume();clockMs+=2100;frameCallback(clockMs);element('game').listeners.pointerdown(tap);wrap.listeners.pointercancel();wrap.listeners.pointerup(tap);
 check(element('notice').textContent==='','提示 手机 '+width+'px：取消手势不误触提示');
 const id=d.addPacket('nutflower'),card=packet('nutflower',id);element('sound-button').onclick();
 card.listeners.pointerdown(lawnEvent(200,-40,'touch',702));wrap.listeners.pointermove(lawnEvent(260,330,'touch',702));
 const soundsBefore=playedSounds.length;wrap.listeners.pointerup(lawnEvent(260,330,'touch',702));
 check(playedSounds.length===soundsBefore+1&&playedSounds.at(-1).src===errorSource&&d.snapshot().belt.some(p=>p.id===id),'错误提示 手机 '+width+'px：拖错植物时只播一次错误音并保留卡片');d.mute();
}
canvasRect={left:10,top:20,width:450,height:300};
// A harvested red nut must retain the actual explosion behaviour, not just its colour.
begin();d.addPacket('zengflower');
check(!d.plant(2,3,'zengflower'),'曾颖向日葵：红线右侧不能种植');
check(d.plant(2,1,'zengflower'),'曾颖向日葵：从传送带种下');
d.advance(35);check(d.snapshot().drops.length===0&&d.snapshot().plants[0].nextAction===null,'曾颖向日葵：未喂食时始终不自动产出');
begin();d.addPacket('zengflower');d.plant(2,1,'zengflower');
const rejectedRed=d.addPacket('boomnut'),beforeRed=d.snapshot();
check(!d.plant(2,1,'boomnut')&&JSON.stringify(d.snapshot().belt)===JSON.stringify(beforeRed.belt),'曾颖向日葵：不接受红色坚果，拒绝时不扣卡片');
const feedFirst=d.addPacket('wallnut'),feedSecond=d.addPacket('wallnut');
packet('wallnut',feedSecond).onclick(lawnEvent(200,-40));
element('game').listeners.pointerdown(lawnEvent(260,330));
{const s=d.snapshot();check(!s.belt.some(p=>p.id===feedSecond)&&s.belt.some(p=>p.id===feedFirst)&&s.belt.some(p=>p.id===rejectedRed)&&s.rolling.length===0&&s.selected===null&&Math.abs(s.plants[0].nextAction-s.time-10)<1e-8,'曾颖向日葵：鼠标喂食只消耗选中的普通坚果，开始 10 秒转化，不滚出');}
{const before=d.snapshot();check(!d.plant(2,1,'wallnut')&&JSON.stringify(d.snapshot().belt)===JSON.stringify(before.belt)&&d.snapshot().plants[0].nextAction===before.plants[0].nextAction,'曾颖向日葵：转化中拒绝重复喂食，不扣坚果也不重置时间');}
d.pause();const frozen=d.snapshot();d.advance(20);
check(d.snapshot().time===frozen.time&&d.snapshot().plants[0].nextAction===frozen.plants[0].nextAction&&d.snapshot().drops.length===0,'曾颖向日葵：暂停冻结喂食倒计时');d.resume();
d.advance(9.9);check(d.snapshot().drops.length===0,'曾颖向日葵：喂食后需等满 10 秒');
captureDraws=true;drawRecords.length=0;d.advance(.3);captureDraws=false;
check(d.snapshot().drops.length===1&&d.snapshot().drops[0].type==='boomnut','曾颖向日葵：首颗产出为红色爆炸坚果');
check(drawRecords.some(record=>record.src===sprites['justin-nut-boom'].src&&record.args[6]===48),'曾颖向日葵：地上产出绘制红色坚果素材');
const harvested=pickNut();
check(d.snapshot().heldNut?.type==='boomnut'&&!d.plant(4,0,'wallnut'),'曾颖向日葵：手持红色坚果时不能变为普通坚果');
d.spawn(1,'normal',520);d.spawn(2,'cone',540);d.spawn(3,'normal',500);
const beforeLaunch=d.snapshot().belt;
check(d.plant(2,0,'boomnut')&&JSON.stringify(d.snapshot().belt)===JSON.stringify(beforeLaunch),'曾颖向日葵：投放红色产出不消耗同类型传送带卡片');
d.advance(1.6);
check(d.snapshot().kills===3&&d.snapshot().score===300&&!d.snapshot().rolling.some(n=>n.type==='boomnut'),'曾颖向日葵：产出的红色坚果撞击后炸掉相邻三行僵尸并消失');
d.advance(30);check(d.snapshot().drops.length===0&&d.snapshot().plants[0].nextAction===null,'曾颖向日葵：一颗输入只产一颗，完成后不自动重复');
check(d.plant(2,1,'wallnut'),'曾颖向日葵：完成后可再次喂食');
d.advance(10.2);check(d.snapshot().drops.length===1&&d.snapshot().drops[0].type==='boomnut'&&d.snapshot().drops[0].id!==harvested.id,'曾颖向日葵：再次喂一颗后再生成一颗红色坚果');
d.spawn(2,'normal',280);d.advance(.6);
check(d.snapshot().plants[0].hp<300,'曾颖向日葵：僵尸会啃咬新植物');
check(d.plant(2,1,'shovel')&&d.snapshot().plants.length===0,'曾颖向日葵：可以铲除并腾出格子');
// Feed harvested nuts through real touch gestures, including cancellation and busy rejection.
for(const width of [316,370,460]){
 canvasRect={left:8,top:137,width,height:width*2/3};
 const wrap=element('game-wrap');begin();
 d.addPacket('zengflower');d.plant(2,1,'zengflower');
 d.addPacket('nutflower');d.plant(0,0,'nutflower');d.addPacket('nutflower');d.plant(1,0,'nutflower');d.advance(10.2);
 const input=d.snapshot().drops[0],beltBefore=d.snapshot().belt;
 element('game').listeners.pointerdown(lawnEvent(input.x,input.y,'touch',501));
 wrap.listeners.pointermove(lawnEvent(260,330,'touch',501));wrap.listeners.pointercancel();wrap.listeners.pointerup(lawnEvent(260,330,'touch',501));
 check(d.snapshot().heldNut?.id===input.id&&d.snapshot().plants.find(p=>p.type==='zengflower').nextAction===null,'喂食 手机 '+width+'px：取消拖动保留普通坚果，不开始转化');
 element('game').listeners.pointerdown(lawnEvent(260,330,'touch',502));wrap.listeners.pointerup(lawnEvent(260,330,'touch',502));d.advance(0);
 {const s=d.snapshot();check(!s.heldNut&&s.selected===null&&!heldVisible()&&s.rolling.length===0&&JSON.stringify(s.belt)===JSON.stringify(beltBefore)&&Math.abs(s.plants.find(p=>p.type==='zengflower').nextAction-s.time-10)<1e-8,'喂食 手机 '+width+'px：点放收获的普通坚果，只消耗手中一颗，不扣卡片');}
 const secondInput=pickNut('touch',503),processing=d.snapshot().plants.find(p=>p.type==='zengflower').nextAction;
 element('game').listeners.pointerdown(lawnEvent(260,330,'touch',504));wrap.listeners.pointerup(lawnEvent(260,330,'touch',504));
 check(d.snapshot().heldNut?.id===secondInput.id&&d.snapshot().plants.find(p=>p.type==='zengflower').nextAction===processing,'喂食 手机 '+width+'px：转化中拒绝第二颗时保留手持坚果');
 d.plant(4,0,'wallnut');d.advance(10.2);
 check(d.snapshot().drops.length===1&&d.snapshot().drops[0].type==='boomnut','喂食 手机 '+width+'px：收获的普通坚果转化为一颗红色坚果');
 // Drag a belt card directly onto the now-idle flower.
 const id=d.addPacket('wallnut'),card=packet('wallnut',id);
 card.listeners.pointerdown(lawnEvent(200,-40,'touch',505));wrap.listeners.pointermove(lawnEvent(260,330,'touch',505));wrap.listeners.pointerup(lawnEvent(260,330,'touch',505));card.onclick(lawnEvent(260,330,'touch',505));
 check(!d.snapshot().belt.some(p=>p.id===id)&&d.snapshot().selected===null&&d.snapshot().plants.find(p=>p.type==='zengflower').nextAction!==null,'喂食 手机 '+width+'px：卡片可直接拖到向日葵上，松手只喂一次');
}
canvasRect={left:10,top:20,width:450,height:300};
for(const removal of ['shovel','death','restart']){
 begin();d.addPacket('zengflower');d.plant(2,1,'zengflower');feedForTest('zengflower',2,1);
 if(removal==='shovel')d.plant(2,1,'shovel');
 else if(removal==='death')d.damagePlant(2,1,0);
 else begin();
 d.advance(10.2);
 check(d.snapshot().plants.length===0&&d.snapshot().drops.length===0,'曾颖向日葵：'+removal+' 清除未完成转化，不留下延迟产出');
}
for(const [flowerType,nutType] of [['nutflower','wallnut'],['zengflower','boomnut']]){
 const level=definitions[flowerType].name;
 d.start(level);d.skipCountdown();
 d.addPacket(flowerType);d.plant(2,1,flowerType);d.plant(4,2,'wallnut');
 d.addPacket(flowerType);
 d.plant(1,0,flowerType);feedForTest(flowerType,2,1);feedForTest(flowerType,1,0);d.advance(10.2);
 for(const [index,packet] of d.snapshot().belt.entries())d.plant(index,2,packet.type);
 const before=d.snapshot(),nut=pickNut(),held=d.snapshot();
 check(nut.type===nutType&&held.heldNut?.type===nutType&&held.heldNut.id===nut.id&&held.selected===nutType&&!held.drops.some(s=>s.id===nut.id),level+' 拿取：保留产出类型，地上坚果直接转为手持形象');
 check(held.score===before.score&&JSON.stringify(held.belt)===JSON.stringify(before.belt)&&held.freeNuts===undefined,level+' 拿取：不存道具、不进传送带、不加分');
 check(heldVisible()&&element('game').style.cursor==='grabbing',level+' 拿取：鼠标旁显示坚果并保留光标');
 check(element('belt-track').children.every(button=>button.disabled)&&element('shovel').disabled,level+' 拿取：先放下才能选择卡片和铲子');
 const another=held.drops.at(0);assert.ok(another,'second flower produced a nut');
 element('game').listeners.pointerdown(lawnEvent(another.x,another.y));
 check(d.snapshot().heldNut?.id===nut.id&&d.snapshot().drops.some(s=>s.id===another.id),level+' 拿取：手满时不叠加或替换第二颗坚果');
 d.addPacket('boomnut');packet('boomnut').onclick(lawnEvent(150,-40));documentListeners.keydown({key:'5',preventDefault:noop});
 documentListeners.keydown({key:'3',preventDefault:noop});
 check(d.snapshot().selected===nutType&&d.snapshot().heldNut?.id===nut.id,level+' 拿取：点击卡片和快捷键不能覆盖手持坚果');
 documentListeners.keydown({key:'Escape',preventDefault:noop});element('game-wrap').listeners.contextmenu({preventDefault:noop});
 check(d.snapshot().selected===nutType&&d.snapshot().heldNut?.id===nut.id,level+' 拿取：Esc 与右键不会收起或丢失坚果');
 element('game').listeners.pointerdown(lawnEvent(260,330));
 element('game').listeners.pointerdown(lawnEvent(80,330));
 element('game').listeners.pointerdown(lawnEvent(500,428));
 check(d.snapshot().heldNut?.id===nut.id&&d.snapshot().selected===nutType,level+' 拿取：占用格、草坪外和红线限制保留手持坚果');
 element('game-wrap').listeners.pointermove(lawnEvent(260,428));d.pause();d.advance(0);
 check(d.snapshot().heldNut?.id===nut.id&&!heldVisible(),level+' 拿取：暂停保留坚果并隐藏携带画面');
 d.resume();d.advance(0);check(heldVisible()&&d.snapshot().selected===nutType,level+' 拿取：继续游戏后恢复携带画面');
 const prior=d.snapshot();element('game').listeners.pointerdown(lawnEvent(260,428));d.advance(0);const placed=d.snapshot();
 const destination=placed.rolling.some(n=>n.type===nutType&&n.row===3&&n.x===260);
 check(destination&&!placed.heldNut&&placed.selected===null&&!heldVisible(),level+' 放下：只释放一颗滚动坚果，仅放下一颗');
 check(JSON.stringify(placed.belt)===JSON.stringify(prior.belt),level+' 放下：不扣传送带卡片');
 check(!element('shovel').disabled,level+' 放下：恢复工具选择');
 const next=pickNut();check(d.snapshot().heldNut?.id===next.id,level+' 放下：随后可以拿起下一颗');
 d.start(level);d.skipCountdown();d.advance(0);
 check(!d.snapshot().heldNut&&d.snapshot().selected===null&&!heldVisible(),level+' 重开：清除上一局手持坚果');
}
// A full belt never turns a picked nut into points or consumes a packet on launch.
for(const [flowerType,nutType] of [['nutflower','wallnut'],['zengflower','boomnut']]){
d.start('bowling');d.skipCountdown();d.addPacket(flowerType);d.plant(2,1,flowerType);feedForTest(flowerType,2,1);d.advance(10.2);
while(d.snapshot().belt.length<10)d.addPacket('wallnut');
{const before=d.snapshot();pickNut();documentListeners.keydown({key:'3',preventDefault:noop});const picked=d.snapshot();
 check(picked.heldNut&&picked.selected===nutType&&picked.score===before.score&&JSON.stringify(picked.belt)===JSON.stringify(before.belt),flowerType+' 拿取：满传送带仍直接手持，不转为分数');
 element('game').listeners.pointerdown(lawnEvent(180,428));const placed=d.snapshot();
 check(!placed.heldNut&&placed.rolling.length===1&&JSON.stringify(placed.belt)===JSON.stringify(before.belt),'保龄球放下：满传送带卡片不被误扣');}
}
for(const [flowerType,nutType] of [['nutflower','wallnut'],['zengflower','boomnut']])for(const width of [316,370,460]){
 const level=definitions[flowerType].name;
 canvasRect={left:8,top:137,width,height:width*2/3};
 const wrap=element('game-wrap'),prepare=()=>{d.start();d.skipCountdown();d.addPacket(flowerType);d.plant(2,0,flowerType);feedForTest(flowerType,2,0);d.advance(10.2);};
 prepare();const nut=pickNut('touch',401);wrap.listeners.pointerleave({pointerType:'touch'});d.advance(0);
 check(d.snapshot().heldNut?.id===nut.id&&heldVisible(),level+' 手机 '+width+'px：点取后松手仍显示手持坚果');
 element('game').listeners.pointerdown(lawnEvent(180,330,'touch',402));wrap.listeners.pointerup(lawnEvent(180,330,'touch',402));d.advance(0);
 check(d.snapshot().heldNut?.id===nut.id&&heldVisible(),level+' 手机 '+width+'px：点占用格保留手持坚果');
 element('game').listeners.pointerdown(lawnEvent(340,428,'touch',403));wrap.listeners.pointercancel();wrap.listeners.pointerup(lawnEvent(340,428,'touch',403));d.advance(0);
 check(d.snapshot().heldNut?.id===nut.id&&d.snapshot().selected===nutType&&heldVisible(),level+' 手机 '+width+'px：取消手势不会丢掉或误放坚果');
 element('game').listeners.pointerdown(lawnEvent(340,428,'touch',404));wrap.listeners.pointerup(lawnEvent(340,428,'touch',404));d.advance(0);
 {const placed=d.snapshot(),destination=placed.rolling.some(n=>n.type===nutType&&n.row===3&&n.x===340);
  check(destination&&!placed.heldNut&&!heldVisible(),level+' 手机 '+width+'px：第二次轻点放下并清除手持形象');}
 prepare();const dropped=d.snapshot().drops.at(0);
 element('game').listeners.pointerdown(lawnEvent(dropped.x,dropped.y,'touch',405));wrap.listeners.pointermove(lawnEvent(260,428,'touch',405));wrap.listeners.pointerup(lawnEvent(260,428,'touch',405));d.advance(0);
 {const placed=d.snapshot(),destination=placed.rolling.some(n=>n.type===nutType&&n.row===3&&n.x===260);
  check(destination&&!placed.heldNut&&placed.selected===null,level+' 手机 '+width+'px：从地上直接拖动坚果到落点');}
}
canvasRect={left:10,top:20,width:450,height:300};
// Bowling shares the normal shovel picker, including empty belts and touch gestures.
d.start('bowling');d.skipCountdown();d.addPacket('nutflower');d.plant(2,1,'nutflower');d.advance(0);
const shovel=element('shovel');
check(!shovel.disabled,'保龄球铲子：游戏开始后可用');
documentListeners.keydown({key:'3',preventDefault:noop});
shovel.onclick({clientX:280,clientY:45});d.advance(0);
check(d.snapshot().selected==='shovel','保龄球铲子：可从传送带卡片切换到铲子');
if(heldBuffer){
 const pixels=heldBuffer.getContext('2d').getImageData(0,0,900,600).data;
 check(pixels.some((value,index)=>index%4===3&&value>0),'保龄球铲子：鼠标携带铲子可见');
}
{const before=d.snapshot();
 element('game').listeners.pointerdown({clientX:140,clientY:185,button:0,preventDefault:noop});
 const after=d.snapshot();
 check(after.plants.length===0&&after.selected===null,'保龄球铲子：鼠标点击移除向日葵并归还铲子');
 check(JSON.stringify(after.belt)===JSON.stringify(before.belt)&&after.score===before.score,'保龄球铲子：铲除不消耗卡片或资源');
}
d.addPacket('nutflower');check(d.plant(2,1,'nutflower'),'保龄球铲子：腾出的格子可重新种植');
d.plant(4,0,'wallnut');d.advance(0);
documentListeners.keydown({key:'5',preventDefault:noop});
check(d.snapshot().belt.length===0&&d.snapshot().selected==='shovel','保龄球铲子：传送带空时快捷键 5 仍可选取');
{const before=d.snapshot();check(!d.plant(4,0,'shovel')&&d.snapshot().rolling.length===before.rolling.length,'保龄球铲子：空格不移除滚动中的坚果');}
shovel.onclick({clientX:280,clientY:45});d.pause();
check(shovel.disabled,'保龄球铲子：暂停时禁用');d.resume();
check(!shovel.disabled,'保龄球铲子：继续后恢复可用');
for(const width of [316,370,460]){
 canvasRect={left:8,top:137,width,height:width*2/3};
 const wrap=element('game-wrap'),e=(x,y,id)=>({clientX:canvasRect.left+x*width/900,clientY:canvasRect.top+y*canvasRect.height/600,pointerId:id,pointerType:'touch',button:0,detail:1,preventDefault:noop});
 d.start('bowling');d.skipCountdown();d.addPacket('nutflower');d.plant(1,2,'nutflower');d.plant(4,0,'wallnut');d.advance(0);
 const toolEvent=e(350,-40,201);shovel.listeners.pointerdown(toolEvent);wrap.listeners.pointerup(toolEvent);shovel.onclick(toolEvent);
 element('game').listeners.pointerdown(e(340,232,202));wrap.listeners.pointerup(e(340,232,202));
 check(d.snapshot().plants.length===0&&d.snapshot().selected===null&&d.snapshot().belt.length===0,'手机 '+width+'px：保龄球空传送带仍可点选铲除');
 d.addPacket('nutflower');d.plant(1,2,'nutflower');
 shovel.listeners.pointerdown(e(350,-40,203));wrap.listeners.pointermove(e(340,232,203));wrap.listeners.pointerup(e(340,232,203));shovel.onclick(e(340,232,203));
 check(d.snapshot().plants.length===0&&d.snapshot().selected===null,'手机 '+width+'px：保龄球拖动铲子铲除且不被 click 重选');
}
canvasRect={left:10,top:20,width:450,height:300};

// Background simulation, independent audio and video controls remain intact.
begin();clockMs=10000;d.resume();sandbox.document.hidden=true;clockMs=11000;intervals[0]();
check(d.snapshot().time>.9&&d.snapshot().mode==='playing','后台：切换标签页仍推进保龄球');d.pause();const pausedTime=d.snapshot().time;clockMs=15000;intervals[0]();
check(d.snapshot().time===pausedTime,'后台：主动暂停才停止模拟');d.resume();clockMs=16000;intervals[0]();check(d.snapshot().time>pausedTime+.9,'后台：继续后按时间推进');sandbox.document.hidden=false;
const initialChapter=d.currentChapter();element('chapter-next').onclick();check(d.currentChapter()===initialChapter+1&&messages.slice(-2).map(message=>message.func).join(',')==='seekTo,playVideo','播客：下一章仍可跳转并播放');
d.setVolume(.4);check(d.volume()===.4,'音量：按比例设置');d.setVolume(3);check(d.volume()===1,'音量：上限 100%');d.setVolume(-1);check(d.volume()===0,'音量：下限 0%');d.setVolume(1);
// Explode-o-nut: clears every zombie in the surrounding lanes on impact and does not bounce.
d.start();d.skipCountdown();d.addPacket('boomnut');
d.spawn(1,'normal',520);d.spawn(2,'cone',540);d.spawn(3,'normal',500);d.spawn(2,'normal',760);
{const before=d.snapshot();
 check(d.plant(2,0,'boomnut')&&d.snapshot().belt.length===before.belt.length-1,'爆炸坚果：从传送带取用');
 check(d.snapshot().rolling.some(n=>n.type==='boomnut'),'爆炸坚果：带类型滚动');
 d.advance(1.7);const s=d.snapshot();
 check(s.kills===before.kills+3&&s.score===before.score+300,'爆炸坚果：炸掉相邻三行的僵尸，每只 100 分');
 check(s.zombies.some(z=>z.row===2&&z.x>700&&!z.dying),'爆炸坚果：范围外的僵尸不受影响');
 check(!s.rolling.some(n=>n.type==='boomnut'),'爆炸坚果：爆炸后消失');}
for(let i=0;i<120&&d.snapshot().mode==='playing';i++)d.advance(5);
{const s=d.snapshot();
 check(s.mode==='lost','保龄球：无尽模式最终失败');
 check(s.wave>=1&&s.zombies.length>0,'保龄球：持续出现僵尸和波次');
 check(s.mowers.every(m=>m.used),'保龄球：割草机全部用完');}

check(element('primary').textContent==='再玩一次'&&element('extra-buttons').children.length===0&&element('dialog-body').innerHTML.includes('最佳成绩'),'结束：显示成绩与重玩，没有选关入口');
check(Number(storage.get('justin-nut-bowling-best'))>=d.snapshot().score,'成绩：保存最佳记录');
element('primary').onclick();check(d.snapshot().mode==='countdown'&&d.snapshot().score===0&&d.snapshot().kills===0&&d.snapshot().belt.length===1,'重玩：直接重启保龄球并清空成绩');
// The athlete uses its own body actions and matching head, with three ordinary nut hits.
begin();d.spawn(0,'normal',760);d.spawn(2,'pingpong',760);d.advance(1);
{
 const s=d.snapshot(),athlete=s.zombies.find(z=>z.type==='pingpong'),normal=s.zombies.find(z=>z.type==='normal');
 check(athlete.x<normal.x-15&&athlete.armor===0,'乒乓僵尸：无头盔，移动速度约为普通僵尸三倍');
 captureDraws=true;drawRecords.length=0;d.advance(0);captureDraws=false;
 const draw=drawRecords.find(record=>record.src===sprites['pingpong-walk'].src);
 check(draw&&draw.args.at(-2)===sprites['pingpong-walk'].displayWidth&&draw.args.at(-1)===sprites['pingpong-walk'].displayHeight,'乒乓僵尸：跑动图集按逻辑尺寸绘制');
}
begin();d.addPacket('nutflower');d.plant(2,1,'nutflower');d.spawn(2,'pingpong',290);d.advance(.2);
captureDraws=true;drawRecords.length=0;d.advance(0);captureDraws=false;
{
 const draw=drawRecords.find(record=>record.src===sprites['pingpong-eat'].src);
 check(d.snapshot().zombies[0].action==='eat'&&!!draw,'乒乓僵尸：停在向日葵前啃咬，使用自己的动作');
 d.pause();captureDraws=true;drawRecords.length=0;d.advance(1);captureDraws=false;
 const paused=drawRecords.find(record=>record.src===sprites['pingpong-eat'].src);
 check(paused&&paused.args[0]===draw.args[0]&&paused.args[1]===draw.args[1],'乒乓僵尸：暂停时动画帧保持不变');d.resume();
}
begin();d.spawn(2,'pingpong',350);
for(let hit=1;hit<=3;hit++){
 d.addPacket('wallnut');check(d.plant(2,0,'wallnut'),'乒乓僵尸：第 '+hit+' 颗坚果能放下');
 d.advance(.7);const athlete=d.snapshot().zombies.find(z=>z.type==='pingpong');
 check(athlete&&athlete.hp===810-hit*270&&athlete.dying===(hit===3),'乒乓僵尸：第 '+hit+' 次撞击的生命和倒下状态正确');
}
{
 const s=d.snapshot();
 check(s.kills===1&&s.score===300&&s.effects.some(e=>e.type==='pingpong-head')&&!s.effects.some(e=>e.type==='zombie-head'),'乒乓僵尸：击倒计分一次，脱落的是同款乒乓球僵尸头部');
 captureDraws=true;drawRecords.length=0;d.advance(0);captureDraws=false;
 check(drawRecords.some(record=>record.src===sprites['pingpong-die'].src)&&drawRecords.some(record=>record.src===sprites['pingpong-head'].src),'乒乓僵尸：倒下身体和头部都使用专属图集');
}
{
 const before=d.snapshot().effects.find(e=>e.type==='pingpong-head');
 captureDraws=true;drawRecords.length=0;d.advance(0);captureDraws=false;
 const first=drawRecords.find(record=>record.src===sprites['pingpong-head'].src);
 d.pause();captureDraws=true;drawRecords.length=0;d.advance(1);captureDraws=false;
 const paused=drawRecords.find(record=>record.src===sprites['pingpong-head'].src);
 check(paused&&first&&paused.transform.e===first.transform.e&&paused.transform.f===first.transform.f,'乒乓僵尸：暂停时头部抛物线停止');d.resume();
 captureDraws=true;drawRecords.length=0;d.advance(1.3);captureDraws=false;
 const landed=drawRecords.find(record=>record.src===sprites['pingpong-head'].src);
 check(landed&&Math.abs(landed.transform.f-before.floorY)<.5,'乒乓僵尸：掉落头部停在草地上，不在半空消失或继续穿过地面');
 d.advance(1);
 check(!d.snapshot().effects.some(e=>e.type==='pingpong-head'),'乒乓僵尸：落地停留后与尸体一起消失');
}
begin();d.spawn(2,'pingpong',340);d.addPacket('boomnut');d.plant(2,0,'boomnut');d.advance(.7);
check(d.snapshot().kills===1&&d.snapshot().zombies.some(z=>z.type==='pingpong'&&z.dying),'乒乓僵尸：爆炸坚果直接击倒');
begin();d.spawn(1,'pingpong',112);d.advance(.1);
check(d.snapshot().mowers[1].used&&d.snapshot().zombies[0].dying,'乒乓僵尸：割草机正常击倒');
begin();d.advance(70);
check(d.snapshot().zombies.some(z=>z.type==='pingpong'),'乒乓僵尸：正常出怪流程会出现新种类');
console.log(`PASS: ${results.length} checks (${standalone?'offline HTML':'source'}); bowling entry, mouse, touch, rendering, replay and loss paths.`);
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
