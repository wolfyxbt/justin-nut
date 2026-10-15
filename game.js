(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const gameWrap = $('game-wrap');
  const heldCanvas = $('held-item');
  const heldCtx = heldCanvas.getContext('2d');
  const defs = window.PLANT_DEFINITIONS;
  const grid = { x: 140, y: 85, width: 80, height: 98, rows: 5, cols: 9 };
  const images = {}, sounds = {}, activeSounds = new Set();
  const introBody = $('dialog-body').innerHTML;
  let ready = false, muted = false, gameVolume = 1, selected = null, selectedPacket = null, pointer = null;
  let touchGesture = null, suppressedCardClick = null;
  let mode = 'loading', previous = 0, accumulator = 0;
  let state, timer = 0, noticeUntil = 0;
  const step = 1 / 60;

  // Endless bowling: nuts arrive on a belt, roll right and ricochet between lanes.
  // Belt numbers follow the original: 10 slots of 50 px, packets enter at the right end and crawl left
  // at 25 px/s (half a slot per second); the next packet waits longer the fuller the belt is.
  // Rolling nuts follow Plant::UpdateBowling in the original: once deflected they travel diagonally
  // (2 px per tick vertically, i.e. one lane per half second) and keep zig-zagging until they leave.
  const bowl = { speed:230, diagonal:196, maxNuts:10, line:3, beltSpeed:.5, boomChance:.13, flowerChance:.12, zengFlowerChance:.06,
    nutInterval:count=>count>8?10:count>6?5:count>4?4.25:4 };
  function freshState() {
    return { time:0, plants:[], zombies:[], drops:[], effects:[],
      mowers:Array.from({length:5},(_,row)=>({row,x:99,used:false,moving:false})),
      heldNut:null, kills:0, nextGroan:37, id:1,
      seed:6182026,
      // One packet is already on its way in, as in the original; it uses id 1.
      belt:[{id:1,type:'wallnut',pos:bowl.maxNuts+.3}], nextNut:4, rolling:[], score:0,
      nextSpawn:4, nextWave:50, wave:0, queue:[] };
  }
  const clock = t => Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');

  function random() {
    state.seed = (Math.imul(1664525,state.seed)+1013904223)>>>0;
    return state.seed / 4294967296;
  }
  const plantX = col => grid.x + col * grid.width + grid.width / 2;
  const feet = row => grid.y + (row + 1) * grid.height - 12;
  const plantAt = (row,col) => state.plants.find(p=>p.row===row&&p.col===col&&p.hp>0);
  function cellAt(x,y) {
    const col=Math.floor((x-grid.x)/grid.width),row=Math.floor((y-grid.y)/grid.height);
    return col>=0&&col<9&&row>=0&&row<5 ? {row,col} : null;
  }
  function announce(text,duration=2.5) { $('notice').textContent=text;noticeUntil=timer+duration; }

  function sound(name,volume=.45) {
    if(muted || !sounds[name])return;
    const audio = sounds[name].cloneNode();audio.volume=volume*gameVolume;
    activeSounds.add(audio);
    audio.addEventListener('ended',()=>activeSounds.delete(audio),{once:true});
    audio.play().catch(()=>activeSounds.delete(audio));
  }
  function stopSounds() { for(const a of activeSounds)a.pause();activeSounds.clear(); }
  function setMute(value) {
    muted=value;$('sound-button').textContent='声音：'+(muted?'关':'开');
    $('sound-button').setAttribute('aria-pressed',String(!muted));
    if(muted)stopSounds();
  }
  function select(type,event=null,packetId=null) {
    if(mode!=='playing'||state.heldNut)return;
    if(type!=='shovel') {
      if(!defs[type])return;
      const packet=packetId!==null?state.belt.find(p=>p.id===packetId):state.belt.find(p=>p.type===type);
      if(!packet){announce('坚果还在路上',1);return;}
      if(event)pointer=isTouch(event)&&!touchGesture?null:coords(event);
      if(selectedPacket===packet.id){selected=null;selectedPacket=null;}
      else {selected=packet.type;selectedPacket=packet.id;sound('seedlift',.4);}
      updateHud();return;
    }
    if(event)pointer=isTouch(event)&&!touchGesture?null:coords(event);
    selected=selected===type?null:type;
    selectedPacket=null;
    if(selected)sound(type==='shovel'?'buttonclick':'seedlift',type==='shovel'?.25:.4);
    updateHud();
  }
  function canBowl(row,col) {
    return col<bowl.line&&(!!state.heldNut||state.belt.length>0)&&!plantAt(row,col)&&!state.rolling.some(n=>n.row===row&&Math.abs(n.x-plantX(col))<60);
  }
  const canFeed = (plant,type) => plant&&defs[plant.type].feedType===type&&plant.nextAction===null;
  function place(row,col,type=selected) {
    if(mode!=='playing'||row<0||row>=grid.rows||col<0||col>=grid.cols)return false;
    const existing=plantAt(row,col);
    if(!type) {
      if(existing&&defs[existing.type].feedType) {
        announce(existing.nextAction===null?'喂我一颗孙宇晨坚果吧':'正在转化，请稍等',2);
        return true;
      }
      return false;
    }
    if(state.heldNut&&type!==state.heldNut.type)return false;
    const pickedNut=!!state.heldNut&&type===state.heldNut.type;
    if(type==='shovel') {
      if(existing){state.plants=state.plants.filter(p=>p!==existing);sound('shovel',.6);}
      selected=null;selectedPacket=null;updateHud();return !!existing;
    }
    if(!defs[type])return false;
    if(col>=bowl.line){announce('只能放在红线左侧',1);return false;}
    const packet=pickedNut?null:state.belt.find(p=>p.id===selectedPacket&&p.type===type)||state.belt.find(p=>p.type===type);
    if(!pickedNut&&!packet){announce('坚果还在路上',1);return false;}
    if(existing&&defs[existing.type].feedType) {
      const d=defs[existing.type];
      if(type!==d.feedType||!canFeed(existing,type)){sound('error',.55);return false;}
      if(packet)state.belt=state.belt.filter(p=>p!==packet);
      state.heldNut=null;selected=null;selectedPacket=null;
      existing.nextAction=state.time+d.processTime;
      sound('chomp',.45);updateHud();return true;
    }
    if(defs[type].nutType) {
      // The flower stays planted; its nuts are picked up directly from the lawn.
      if(existing){announce('这里已经有植物了',1);return false;}
      const d=defs[type];state.belt=state.belt.filter(p=>p!==packet);
      state.plants.push({id:++state.id,type,row,col,x:plantX(col),hp:d.health,born:state.time,nextAction:d.feedType?null:state.time+d.firstNut,phase:random()*2});
      state.effects.push({type:'soil',x:plantX(col)-27,y:feet(row)-25,born:state.time,life:.7});
      selected=null;selectedPacket=null;sound(state.id%2?'plant':'plant2',.6);
      updateHud();return true;
    }
    if(!canBowl(row,col)){announce('这里已经有坚果了',1);return false;}
    if(packet)state.belt=state.belt.filter(p=>p!==packet);
    state.rolling.push({id:++state.id,type,row,x:plantX(col),y:feet(row),startX:plantX(col),dir:0,hits:0});
    state.heldNut=null;
    selected=null;selectedPacket=null;sound('bowling',.45);updateHud();return true;
  }

  function spawnZombie(row,type='normal',x=936) {
    const z={id:++state.id,row,type,x,hp:type==='pingpong'?810:270,armor:type==='cone'?370:0,
      speed:(type==='pingpong'?25.8:type==='flag'?10:8.6)*(1+Math.min(.6,state.time/400)),
      phase:random()*3,action:'walk',changed:state.time,
      bite:0,flash:0,dying:false,deathTime:0};
    state.zombies.push(z);return z;
  }
  function killZombie(z) {
    if(z.dying)return;
    let droppedHead;
    if(z.type==='pingpong'){
      const live=window.SPRITES['pingpong-'+(z.action==='eat'?'eat':'walk')];
      const pose=live.headPoses?.[spriteFrame(live,state.time-z.changed+z.phase)];
      if(pose){
        const x=z.x-live.anchorX+pose[0],y=feet(z.row)-live.feetY+pose[1],floorY=feet(z.row)-28;
        const vy=-50,gravity=320,landAt=(-vy+Math.sqrt(vy*vy+2*gravity*Math.max(0,floorY-y)))/gravity;
        droppedHead={type:'pingpong-head',x,y,angle:pose[2],vx:-18,vy,gravity,floorY,landAt,born:state.time,life:2.3};
      }
    }
    z.dying=true;z.action='die';z.changed=state.time;z.deathTime=state.time;
    state.kills++;sound(z.id%2?'zombie_falling_1':'zombie_falling_2',.35);
    state.effects.push(droppedHead??{type:z.type==='pingpong'?'pingpong-head':'zombie-head',x:z.x-80,y:feet(z.row)-(z.type==='pingpong'?174:144),born:state.time,life:1.2});
  }
  function setAction(z,action) {
    if(z.action!==action){z.action=action;z.changed=state.time;}
  }
  function makeNut(x,y,targetY,type,startWidth=48) {
    state.drops.push({id:++state.id,type,x,y,startX:x,startY:y,targetY,startWidth,born:state.time,age:0});
  }
  function formingNutPose(p) {
    const duration=defs[p.type].processTime;
    const progress=Math.max(0,Math.min(1,1-(p.nextAction-state.time)/duration));
    const elapsed=progress*duration,sway=Math.sin(progress*Math.PI);
    return {progress,x:p.x+29,y:feet(p.row)-12-Math.sin(elapsed*3)*1.5*sway,
      width:12+28*progress,rotation:Math.sin(elapsed*4)*.07*sway};
  }
  function pickupNut(nut) {
    if(state.heldNut)return false;
    state.heldNut={id:nut.id,type:nut.type};
    state.drops=state.drops.filter(item=>item!==nut);
    selected=nut.type;selectedPacket=null;
    if(!pointer)pointer={x:nut.x,y:nut.y};
    sound('seedlift',.45);
    updateHud();return true;
  }
  function hitNut(x,y,radius=39) {
    return state.drops.filter(s=>Math.hypot(x-s.x,y-s.y)<radius)
      .sort((a,b)=>Math.hypot(x-a.x,y-a.y)-Math.hypot(x-b.x,y-b.y))[0];
  }

  function update(dt) {
    state.time+=dt;
    const t=state.time;
    if(t>=state.nextGroan) {sound(random()>.5?'groan3':'groan4',.18);state.nextGroan=t+20+random()*15;}
    updateBowling(t,dt);
    for(const p of state.plants) {
      if(p.hp<=0)continue;
      const d=defs[p.type];
      if(p.nextAction!==null&&t>=p.nextAction) {
        if(d.feedType) {
          // The attached fruit becomes the actual pickup at the same position
          // and size, rather than a second nut appearing over the flower's face.
          const fruit=formingNutPose(p);
          makeNut(fruit.x,fruit.y,feet(p.row)-12,d.nutType,fruit.width);
        }else makeNut(p.x+18,feet(p.row)-55,feet(p.row)-12,d.nutType);
        p.nextAction=d.feedType?null:t+d.nutInterval;
      }
    }
    for(const z of state.zombies) {
      if(z.dying)continue;
      z.flash=Math.max(0,z.flash-dt);
      const target=state.plants.filter(p=>p.hp>0&&p.row===z.row&&z.x-p.x<38&&z.x-p.x>-38)
        .sort((a,b)=>b.x-a.x)[0];
      if(target) {
        setAction(z,'eat');z.bite+=dt;
        if(z.bite>=.5){target.hp-=50;target.hurtUntil=t+.12;z.bite-=.5;if(random()>.8)sound('chomp',.13);}
      }else {z.bite=0;setAction(z,'walk');z.x-=z.speed*dt;}
      const mower=state.mowers[z.row];
      if(z.x<115&&!mower.used){mower.used=true;mower.moving=true;sound('lawnmower',.65);}
      if(z.x<30){finish();return;}
    }
    for(const mower of state.mowers)if(mower.moving) {
      mower.x+=440*dt;
      for(const z of state.zombies)if(!z.dying&&z.row===mower.row&&Math.abs(z.x-mower.x)<60)killZombie(z);
      if(mower.x>1000)mower.moving=false;
    }
    for(const nut of state.drops) {
      nut.age+=dt;
      const f=Math.min(1,nut.age/.9);
      nut.x=nut.startX+Math.sin(f*Math.PI/2)*22;
      nut.y=nut.startY+(nut.targetY-nut.startY)*f-32*Math.sin(f*Math.PI);
    }
    state.plants=state.plants.filter(p=>p.hp>0);
    state.zombies=state.zombies.filter(z=>!z.dying||t-z.deathTime<2.3);
    state.drops=state.drops.filter(nut=>nut.age<12);
    state.effects=state.effects.filter(e=>t-e.born<e.life);
  }
  function updateBowling(t,dt) {
    if(state.belt.length>=bowl.maxNuts)state.nextNut=t+bowl.nutInterval(state.belt.length);
    else if(t>=state.nextNut) {
      const roll=random();
      state.belt.push({id:++state.id,type:roll<bowl.boomChance?'boomnut':roll<bowl.boomChance+bowl.flowerChance?'nutflower':roll<bowl.boomChance+bowl.flowerChance+bowl.zengFlowerChance?'zengflower':'wallnut',pos:bowl.maxNuts+.3});
      state.nextNut=t+bowl.nutInterval(state.belt.length);
    }
    // Packets slide in from the right end of the belt and close up gaps when one is taken.
    state.belt.forEach((p,i)=>{p.pos=Math.max(i,p.pos-bowl.beltSpeed*dt);});
    if(t>=state.nextSpawn) {
      const row=Math.floor(random()*5),roll=random(),athlete=t>=45?.08:0;
      spawnZombie(row,roll<athlete?'pingpong':roll<athlete+Math.min(.45,.08+t/500)?'cone':'normal');
      state.nextSpawn=t+Math.max(1.3,5-t/60)+random()*1.2;
    }
    if(t>=state.nextWave) {
      state.wave++;announce('第 '+state.wave+' 波僵尸来了！',3);sound('hugewave',.6);
      const count=Math.min(12,3+state.wave*2),coneChance=Math.min(.5,.15+state.wave*.05),athlete=t>=45?.08:0;
      for(let i=0;i<count;i++){
        const row=Math.floor(random()*5),roll=i===0?null:random();
        state.queue.push([t+.3+i*.45,row,i===0?'flag':roll<athlete?'pingpong':roll<coneChance+athlete?'cone':'normal']);
      }
      state.nextWave=t+Math.max(25,45-state.wave*2);
    }
    while(state.queue.length&&t>=state.queue[0][0]){const [,row,type]=state.queue.shift();spawnZombie(row,type);}
    for(const n of state.rolling) {
      n.x+=bowl.speed*dt;
      if(n.dir)n.y+=n.dir*bowl.diagonal*dt;
      // Between lanes nothing is checked, exactly like the original; hits only happen when lined up with a lane.
      if(Math.abs(feet(n.row)-n.y)>2)continue;
      n.y=feet(n.row);
      let dir=n.dir;
      if(dir<0&&n.row<=0)dir=1;else if(dir>0&&n.row>=4)dir=-1;
      const target=state.zombies.filter(z=>!z.dying&&z.row===n.row&&Math.abs(z.x-n.x)<36).sort((a,b)=>a.x-b.x)[0];
      if(target) {
        if(n.type==='boomnut') {
          const radius=defs.boomnut.blastRadius,caught=state.zombies.filter(z=>!z.dying&&Math.abs(z.row-n.row)<=1&&Math.abs(z.x-n.x)<=radius);
          for(const z of caught){z.flash=.2;z.armor=0;killZombie(z);}
          const points=100*caught.length;state.score+=points;
          state.effects.push({type:'boom',x:n.x,y:feet(n.row)-45,born:t,life:.7});
          state.effects.push({type:'score',text:'+'+points,x:n.x,y:feet(n.row)-150,born:t,life:.9});
          sound('cherrybomb',.6);sound('bowlingimpact2',.4);n.x=Infinity;continue;
        }
        // Each extra hit by the same nut is worth more, like the bowling coin bonus.
        n.hits++;
        const points=100*n.hits;state.score+=points;
        state.effects.push({type:'score',text:'+'+points,x:target.x,y:feet(target.row)-150,born:t,life:.9});
        target.flash=.12;
        if(target.armor>0){target.armor=0;sound('plastichit',.4);}
        else{target.hp-=270;if(target.hp<=0)killZombie(target);}
        sound(n.hits%2?'bowlingimpact':'bowlingimpact2',.5);
        // A hit sends the nut diagonally the other way; a straight roll picks down at the top, up at the bottom, else at random.
        if(n.row===4||n.dir>0)dir=-1;else if(n.row===0||n.dir<0)dir=1;else dir=random()<.5?-1:1;
      }
      if(dir<0)n.row--;else if(dir>0)n.row++;
      n.dir=dir;
    }
    state.rolling=state.rolling.filter(n=>n.x<960);
  }

  function spriteFrame(s,time,loop=true){
    let ms=Math.max(0,time*1000),frame=0;
    ms=loop?ms%s.duration:Math.min(ms,s.duration-1);
    while(frame<s.durations.length-1&&ms>=s.durations[frame])ms-=s.durations[frame++];
    return frame;
  }
  function sprite(name,x,y,time=state.time,width=null,height=null,loop=true,target=ctx) {
    const s=window.SPRITES[name],im=images[name];if(!s||!im)return;
    const frame=spriteFrame(s,time,loop);
    const crop=s.crop||{x:0,y:0,w:s.w,h:s.h};
    target.drawImage(im,(frame%s.cols)*s.w+crop.x,Math.floor(frame/s.cols)*s.h+crop.y,crop.w,crop.h,x,y,width??s.displayWidth??crop.w,height??s.displayHeight??crop.h);
  }
  function image(name,x,y,w=null,h=null) {
    const im=images[name];if(im)ctx.drawImage(im,x,y,w??im.width,h??im.height);
  }
  function drawPlant(p,alpha=1) {
    const d=defs[p.type];let name=d.sprite;
    if(d.glowSprite&&p.nextAction!==null&&p.nextAction-state.time<1.3)name=d.glowSprite;
    ctx.save();ctx.globalAlpha=alpha;
    image('shadow',p.x-38,feet(p.row)-13,76,30);
    if(p.hurtUntil>state.time)ctx.filter='brightness(1.25)';
    if(d.idleMotion) {
      const m=d.idleMotion,phase=(state.time-p.born+p.phase)*Math.PI*2/m.period;
      const rocked=Math.sin(phase),breath=Math.cos(phase);
      ctx.translate(p.x,feet(p.row));ctx.rotate(rocked*m.rotation);
      ctx.scale(1-breath*m.breathe,1+breath*m.breathe);
      sprite(name,-d.width/2,-d.height,state.time-p.born+p.phase,d.width,d.height);
    }else sprite(name,p.x-d.width/2,feet(p.row)-d.height,state.time-p.born+p.phase,d.width,d.height);
    ctx.restore();
    if(alpha===1&&p.hp>0&&d.feedType&&Number.isFinite(p.nextAction)&&p.nextAction!==null)drawFormingNut(p);
  }
  function drawFormingNut(p) {
    const fruit=formingNutPose(p),{x,y,width,progress}=fruit;
    ctx.save();
    // A small fruit on the right leaf marks a fed flower immediately. Only the
    // fruit grows and rocks; the selected face and plant animation stay intact.
    ctx.lineCap='round';ctx.strokeStyle='#253e0c';ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(p.x+5,feet(p.row)-17);
    ctx.quadraticCurveTo(p.x+17,feet(p.row)-7,x,y);ctx.stroke();
    ctx.strokeStyle='#83b92c';ctx.lineWidth=2;ctx.stroke();
    const radius=width*.7,light=ctx.createRadialGradient(x,y,0,x,y,radius);
    light.addColorStop(0,'rgba(255,105,45,'+(.18+progress*.12)+')');
    light.addColorStop(1,'rgba(255,105,45,0)');
    ctx.fillStyle=light;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
    ctx.translate(x,y);ctx.rotate(fruit.rotation);
    const height=width*82/74;
    sprite(defs[defs[p.type].nutType].sprite,-width/2,-height/2,0,width,height);
    ctx.restore();
  }
  function drawNut(n) {
    const d=defs.wallnut,y=n.y;
    ctx.save();image('shadow',n.x-38,y-13,76,30);
    ctx.translate(n.x,y-d.height/2);ctx.rotate((n.x-n.startX)/36);
    sprite(defs[n.type].sprite,-d.width/2,-d.height/2,0,d.width,d.height);
    ctx.restore();
  }
  function drawZombie(z) {
    let name;
    if(z.dying)name=z.type==='pingpong'?'pingpong-die':'zombie-die';
    else {const prefix=z.type==='pingpong'?'pingpong':z.type==='flag'?'flag':z.armor>0?'cone':'zombie';name=prefix+'-'+(z.action==='eat'?'eat':'walk');}
    const s=window.SPRITES[name];
    ctx.save();
    if(z.flash>0)ctx.filter='brightness(1.7)';
    if(z.dying)ctx.globalAlpha=Math.min(1,(2.3-(state.time-z.deathTime))*3);
    image('shadow',z.x-35,feet(z.row)-12,70,24);
    sprite(name,z.x-(s.anchorX??80),feet(z.row)-(s.feetY??s.h),state.time-z.changed+(z.dying?0:z.phase),s.displayWidth??null,s.displayHeight??null,!z.dying);
    ctx.restore();
  }
  function render() {
    renderHeldItem();
    ctx.clearRect(0,0,900,600);image('background',-115,0,1400,600);
    if(!state)return;
    image('bowling-stripe',grid.x+bowl.line*grid.width-11,grid.y-3,22,grid.rows*grid.height+2);
    if(selected&&pointer&&mode==='playing') {
      const cell=cellAt(pointer.x,pointer.y);
      if(cell) {
        const existing=plantAt(cell.row,cell.col),occupied=!!existing;
        const valid=selected==='shovel'?occupied:defs[selected].nutType?cell.col<bowl.line&&!occupied:canFeed(existing,selected)||canBowl(cell.row,cell.col);
        ctx.fillStyle=valid?'#ffffe030':'#ff432648';
        ctx.fillRect(grid.x+cell.col*80,grid.y+cell.row*98,80,98);
        if(valid&&selected!=='shovel'&&!occupied)drawPlant({type:selected,row:cell.row,col:cell.col,x:plantX(cell.col),hp:defs[selected].health,born:0,phase:0,nextAction:Infinity},.25);
      }
    }
    // Row-order drawing gives correct overlap between adjacent lanes.
    for(let row=0;row<5;row++) {
      const mower=state.mowers[row];
      if(!mower.used||mower.moving)image('mower',mower.x-35,feet(row)-42,70,57);
      for(const p of state.plants.filter(p=>p.row===row))drawPlant(p);
      for(const n of state.rolling.filter(n=>n.row===row))drawNut(n);
      for(const z of state.zombies.filter(z=>z.row===row).sort((a,b)=>b.x-a.x))drawZombie(z);
    }
    for(const e of state.effects) {
      const f=(state.time-e.born)/e.life;
      if(e.type==='boom') {
        const r=50+f*120,g=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,r);
        g.addColorStop(0,'rgba(255,240,170,.95)');g.addColorStop(.45,'rgba(255,120,30,.8)');g.addColorStop(1,'rgba(180,30,10,0)');
        ctx.save();ctx.globalAlpha=1-f*f;ctx.fillStyle=g;ctx.beginPath();ctx.arc(e.x,e.y,r,0,Math.PI*2);ctx.fill();ctx.restore();continue;
      }
      if(e.type==='pingpong-head'&&e.floorY!==undefined){
        const age=state.time-e.born,travel=Math.min(age,e.landAt+.25),x=e.x+e.vx*travel;
        let y=Math.min(e.floorY,e.y+e.vy*age+.5*e.gravity*age*age);
        const landed=age-e.landAt;
        if(landed>0&&landed<.25)y=e.floorY-4*Math.sin(landed/.25*Math.PI);
        const alpha=Math.min(1,(e.life-age)*3),s=window.SPRITES['pingpong-head'];
        ctx.save();ctx.globalAlpha=alpha*Math.max(.12,.38*(1-Math.max(0,e.floorY-y)/140));
        image('shadow',x-20,e.floorY+18,40,14);
        ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(e.angle);
        sprite('pingpong-head',-(s.anchorX??44),-(s.anchorY??48),age,null,null,false);ctx.restore();continue;
      }
      if(e.type!=='score'){sprite(e.type,e.x,e.y,state.time-e.born,null,null,false);continue;}
      ctx.save();ctx.globalAlpha=1-f;ctx.font='bold 24px Georgia,serif';ctx.textAlign='center';
      ctx.lineWidth=4;ctx.strokeStyle='#3a2a05';ctx.fillStyle='#ffe76a';
      ctx.strokeText(e.text,e.x,e.y-f*40);ctx.fillText(e.text,e.x,e.y-f*40);ctx.restore();
    }
    for(const nut of state.drops) {
      ctx.save();
      if(nut.age>10)ctx.globalAlpha=.45+.4*Math.sin(state.time*12);
      const settle=Math.min(1,nut.age/.15),startWidth=nut.startWidth??48;
      const w=startWidth+(48-startWidth)*settle,h=w*82/74;
      ctx.translate(nut.x,nut.y);ctx.rotate(Math.sin((state.time-nut.born)*3)*.12);
      sprite(defs[nut.type].sprite,-w/2,-h/2,0,w,h);ctx.restore();
    }
    if(mode==='countdown')banner(timer<.9?'start-ready':timer<1.8?'start-set':'start-plant',timer%.9);
  }
  // Original countdown art pops in at the centre of the lawn.
  function banner(name,age) {
    const im=images[name];if(!im)return;
    const pop=1+.3*Math.max(0,1-age/.2);
    ctx.save();ctx.translate(450,300);ctx.scale(pop,pop);
    ctx.drawImage(im,-im.width/2,-im.height/2);ctx.restore();
  }

  function renderHeldItem() {
    heldCtx.clearRect(0,0,900,600);
    if(!state||!selected||!pointer||mode!=='playing')return;
    heldCtx.save();
    heldCtx.shadowColor='#0007';heldCtx.shadowBlur=7;heldCtx.shadowOffsetY=3;
    if(selected==='shovel') {
      if(pointer.touch) {
        const top=Math.max((pointer.viewportTop||0)+6,pointer.y-22-(pointer.lift||0));
        sprite('shovel',pointer.x-48,top,0,96,43,true,heldCtx);
      }else sprite('shovel',pointer.x-45,pointer.y-20,0,76,34,true,heldCtx);
    }
    else {
      const d=defs[selected];
      const scale=pointer.touch?1.25:1;
      let top=pointer.y-d.height*scale*.75-(pointer.lift||0);
      if(pointer.touch)top=Math.max((pointer.viewportTop||0)+6,top);
      sprite(d.sprite,pointer.x-d.width*scale/2,top,state.time,d.width*scale,d.height*scale,true,heldCtx);
    }
    heldCtx.restore();
  }

  function updateHud() {
    if(!state)return;
    $('shovel').classList.toggle('selected',selected==='shovel');
    $('shovel').setAttribute('aria-pressed',String(selected==='shovel'));
    $('shovel').disabled=mode!=='playing'||!!state.heldNut;
    $('score-value').textContent=state.score;$('kills-value').textContent=state.kills;$('time-value').textContent=clock(state.time);
    updateBelt();
    if(timer>=noticeUntil)$('notice').textContent='';
    const holding=mode==='playing'&&!!selected;
    canvas.style.cursor=holding?'grabbing':'default';
    gameWrap.style.cursor=holding?'grabbing':'';
  }
  // The conveyor is DOM: one button per packet, positioned by its belt slot.
  const packetElements=new Map();
  function updateBelt() {
    const track=$('belt-track');
    for(const packet of state.belt) {
      let el=packetElements.get(packet.id);
      if(!el) {
        el=document.createElement('button');el.className='packet';
        el.dataset.plant=packet.type;el.dataset.packetId=String(packet.id);
        const image=defs[packet.type].packet;
        el.innerHTML='<img src="'+image+'" alt="">';
        el.setAttribute('aria-label',defs[packet.type].name);
        bindPicker(el,packet.type,packet.id);track.append(el);packetElements.set(packet.id,el);
      }
      el.style.left=(packet.pos*50/502*100)+'%';
      el.classList.toggle('selected',selectedPacket===packet.id);
      el.setAttribute('aria-pressed',String(selectedPacket===packet.id));
      el.disabled=mode!=='playing'||!!state.heldNut;
    }
    for(const [id,el] of packetElements)if(!state.belt.some(p=>p.id===id)){el.remove?.();packetElements.delete(id);}
  }
  function clearBelt() {for(const el of packetElements.values())el.remove?.();packetElements.clear();}
  function dialog(title,body,primary,action,extras=[],showSettings=false) {
    $('dialog-title').textContent=title;$('dialog-body').innerHTML=body;
    $('primary').textContent=primary;$('primary').disabled=false;$('primary').onclick=action;
    $('extra-buttons').replaceChildren();
    $('menu-settings').hidden=!showSettings;
    for(const [text,fn] of extras){const b=document.createElement('button');b.className='stone large menu-action';b.textContent=text;b.onclick=fn;$('extra-buttons').append(b);}
    $('overlay').hidden=false;$('primary').focus({preventScroll:true});
  }
  function start() {
    if(!ready)return;
    stopSounds();state=freshState();selected=null;selectedPacket=null;pointer=null;touchGesture=null;suppressedCardClick=null;accumulator=0;timer=0;
    clearBelt();mode='countdown';$('overlay').hidden=true;$('notice').textContent='';noticeUntil=0;
    sound('readysetplant',.7);updateHud();
  }
  function showIntro() {
    stopSounds();mode='ready';selected=null;selectedPacket=null;pointer=null;touchGesture=null;
    state=freshState();clearBelt();$('notice').textContent='';
    dialog('植物大战僵尸（孙宇晨坚果版）',introBody,'开始游戏',start);
    updateHud();
  }
  function pause() {
    if(mode==='paused'){resume();return;}
    if(mode!=='playing')return;
    mode='paused';if(touchGesture&&!state.heldNut)pointer=null;touchGesture=null;stopSounds();sound('pause',.5);
    dialog('游戏暂停','','继续游戏',resume,[['重新开始',confirmRestart]],true);
    updateHud();
  }
  function resume() {mode='playing';$('overlay').hidden=true;accumulator=0;previous=performance.now();updateHud();}
  function confirmRestart() {
    dialog('重新开始？','','重新开始',()=>start(),[['返回',()=>pauseMenu()]]);
  }
  function pauseMenu(){mode='playing';pause();}
  function finish() {
    if(mode!=='playing')return;
    mode='lost';selected=null;selectedPacket=null;state.heldNut=null;stopSounds();$('notice').textContent='';
    sound('losemusic',.7);
    let best=state.score;
    try{best=Math.max(best,Number(localStorage.getItem('justin-nut-bowling-best'))||0);localStorage.setItem('justin-nut-bowling-best',String(best));}catch{}
    const body='<img class="result-lost" src="assets/zombies-won.png" alt="僵尸吃掉了你的脑子！">'+
      '<p class="summary">得分 '+state.score+'<br>消灭僵尸 '+state.kills+' 只 · 坚持 '+clock(state.time)+'<br>最佳成绩 '+best+'</p>';
    dialog('僵尸吃掉了你的脑子！',body,'再玩一次',start);
    updateHud();
  }
  // The simulation follows the wall clock, so the game keeps going while the tab is in the background
  // (browsers throttle timers there and stop animation frames; the catch-up below fills any gap, up to a minute per tick).
  function advanceClock(now) {
    const elapsed=previous?Math.min(Math.max(0,(now-previous)/1000),60):0;previous=now;
    if(mode==='playing') {
      accumulator+=elapsed;
      while(accumulator>=step&&mode==='playing'){update(step);timer+=step;accumulator-=step;}
    }else if(mode==='countdown') {
      timer+=elapsed;
      if(timer>=2.7){mode='playing';$('notice').textContent='';}
    }
    if(!document.hidden){render();updateHud();}
  }
  function frame(now) {advanceClock(now);requestAnimationFrame(frame);}
  if(typeof setInterval==='function')setInterval(()=>{if(document.hidden)advanceClock(performance.now());},500);

  function bindPicker(button,type,packetId=null) {
    button.onclick=event=>{
      if(suppressedCardClick===button&&event?.detail!==0){suppressedCardClick=null;return;}
      suppressedCardClick=null;select(type,event,packetId);
    };
    button.addEventListener('pointerdown',event=>{
      suppressedCardClick=null;
      if(!isTouch(event)||mode!=='playing'||state.heldNut||(touchGesture&&touchGesture.pointerId!==event.pointerId))return;
      touchGesture={kind:'card',pointerId:event.pointerId,type,packetId,button,startX:event.clientX,startY:event.clientY,dragging:false};
    });
  }
  bindPicker($('shovel'),'shovel');$('menu-button').onclick=pause;
  $('sound-button').onclick=()=>setMute(!muted);
  // Video chapters: buttons under the player talk to YouTube's embedded player through its message
  // interface (enablejsapi=1), so no extra script is loaded; the player reports its time back the same way.
  const chapters=window.VIDEO_CHAPTERS||[],watchFrame=$('watch-frame'),chapterButtons=[],chapterToggle=$('chapter-current');
  let videoTime=0,currentChapter=-1,chaptersOpen=false;
  function openChapters(open) {
    chaptersOpen=open;$('chapters').classList.toggle('open',open);chapterToggle.setAttribute('aria-expanded',String(open));
    const el=chapterButtons[currentChapter];if(open&&el&&el.scrollIntoView)el.scrollIntoView({block:'center'});
  }
  function jumpChapter(index) {
    const c=chapters[index];if(!c)return;
    videoCommand('seekTo',[c.t,true]);videoCommand('playVideo');videoTime=c.t;markChapter(index);
  }
  chapterToggle.onclick=()=>openChapters(!chaptersOpen);
  $('chapter-prev').onclick=()=>jumpChapter(Math.max(0,currentChapter-1));
  $('chapter-next').onclick=()=>jumpChapter(Math.min(chapters.length-1,currentChapter+1));
  const videoCommand=(func,args=[])=>watchFrame.contentWindow?.postMessage(JSON.stringify({event:'command',func,args}),'*');
  const clockLong=t=>{t=Math.floor(t);const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return (h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(s).padStart(2,'0');};
  for(const [i,c] of chapters.entries()) {
    const b=document.createElement('button');b.className='chapter';b.type='button';
    b.innerHTML='<span class="time">'+clockLong(c.t)+'</span><span class="title"></span>';
    b.querySelector('.title').textContent=c.title;
    b.onclick=()=>{jumpChapter(i);if(chaptersOpen)openChapters(false);};
    $('chapter-list').append(b);chapterButtons.push(b);
  }
  function markChapter(index) {
    if(index===currentChapter)return;
    currentChapter=index;
    chapterButtons.forEach((b,i)=>{b.classList.toggle('current',i===index);b.setAttribute('aria-current',i===index?'true':'false');});
    const c=chapters[index];
    chapterToggle.querySelector('.time').textContent=c?clockLong(c.t):'';chapterToggle.querySelector('.title').textContent=c?c.title:'';
    $('chapter-prev').disabled=index<=0;$('chapter-next').disabled=index>=chapters.length-1;
    const el=chapterButtons[index];if(el&&el.scrollIntoView&&(!document.hidden))el.scrollIntoView({block:'nearest'});
  }
  function chapterAt(time) {let index=-1;for(const [i,c] of chapters.entries())if(time>=c.t)index=i;return index;}
  window.addEventListener('message',e=>{
    if(e.origin!=='https://www.youtube.com'&&e.origin!=='https://www.youtube-nocookie.com')return;
    let data;try{data=typeof e.data==='string'?JSON.parse(e.data):e.data;}catch{return;}
    if(data?.event==='infoDelivery'&&typeof data.info?.currentTime==='number'){videoTime=data.info.currentTime;markChapter(chapterAt(videoTime));}
  });
  // Ask the player to start reporting; it only listens after it has loaded.
  const listenToPlayer=()=>watchFrame.contentWindow?.postMessage(JSON.stringify({event:'listening',id:'justin-nut',channel:'widget'}),'*');
  watchFrame.addEventListener('load',listenToPlayer);listenToPlayer();
  if(chapters.length)markChapter(chapterAt(180));
  // Game volume only scales the game's own sound effects; the podcast keeps following the device volume.
  function setVolume(value,remember=true) {
    gameVolume=Math.min(1,Math.max(0,value));
    $('volume').value=String(Math.round(gameVolume*100));$('volume-value').textContent=Math.round(gameVolume*100)+'%';
    for(const a of activeSounds)a.volume=Math.min(1,a.volume);
    if(remember)try{localStorage.setItem('justin-nut-volume',String(gameVolume));}catch{}
  }
  $('volume').addEventListener('input',e=>setVolume(Number(e.target.value)/100));
  $('volume').addEventListener('change',()=>sound('buttonclick',.4));
  let storedVolume=null;try{const saved=localStorage.getItem('justin-nut-volume');if(saved!==null)storedVolume=Number(saved);}catch{}
  setVolume(Number.isFinite(storedVolume)?storedVolume:1,false);
  function isTouch(e) {return e.pointerType==='touch'||e.pointerType==='pen';}
  function coords(e) {
    const r=canvas.getBoundingClientRect(),touch=isTouch(e);
    return {x:(e.clientX-r.left)*900/r.width,y:(e.clientY-r.top)*600/r.height,
      touch,lift:touch?24*600/r.height:0,hitRadius:touch?Math.max(39,22*900/r.width):39,
      viewportTop:touch?Math.max(0,($('arena').getBoundingClientRect().top-r.top)*600/r.height):0};
  }
  gameWrap.addEventListener('pointermove',e=>{
    if(touchGesture&&touchGesture.pointerId!==e.pointerId)return;
    pointer=coords(e);
    if(touchGesture?.kind==='pickup') {
      if(Math.hypot(e.clientX-touchGesture.startX,e.clientY-touchGesture.startY)>=8)touchGesture.dragging=true;
      return;
    }
    if(!touchGesture||touchGesture.kind!=='card'||touchGesture.dragging)return;
    if(Math.hypot(e.clientX-touchGesture.startX,e.clientY-touchGesture.startY)<8)return;
    const wanted=()=>selected===touchGesture.type&&(touchGesture.packetId===null||selectedPacket===touchGesture.packetId);
    if(!wanted())select(touchGesture.type,e,touchGesture.packetId);
    if(!wanted()){touchGesture=null;return;}
    touchGesture.dragging=true;gameWrap.setPointerCapture(e.pointerId);
  });
  gameWrap.addEventListener('pointerenter',e=>{pointer=coords(e);});
  gameWrap.addEventListener('pointerleave',e=>{if(!touchGesture&&(!state?.heldNut||!e||!isTouch(e)))pointer=null;});
  gameWrap.addEventListener('dragstart',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=> {
    if(mode!=='playing'||(e.button!==undefined&&e.button!==0))return;
    if(touchGesture&&touchGesture.pointerId!==e.pointerId)return;
    e.preventDefault();pointer=coords(e);const nut=hitNut(pointer.x,pointer.y,pointer.hitRadius);
    if(nut){
      const picked=pickupNut(nut);
      if(isTouch(e)) {
        if(picked) {
          touchGesture={kind:'pickup',pointerId:e.pointerId,type:nut.type,startX:e.clientX,startY:e.clientY,dragging:false};
          gameWrap.setPointerCapture(e.pointerId);
        }else if(!state.heldNut)pointer=null;
      }
      return;
    }
    if(isTouch(e)) {
      touchGesture={kind:'lawn',pointerId:e.pointerId,type:selected};
      gameWrap.setPointerCapture(e.pointerId);return;
    }
    const cell=cellAt(pointer.x,pointer.y);if(cell)place(cell.row,cell.col);
  });
  gameWrap.addEventListener('pointerup',e=>{
    if(!touchGesture||touchGesture.pointerId!==e.pointerId){if(isTouch(e)&&!state.heldNut)pointer=null;return;}
    const gesture=touchGesture;touchGesture=null;
    if(gesture.kind==='lawn'||gesture.dragging) {
      if(gesture.kind==='card')suppressedCardClick=gesture.button;
      pointer=coords(e);
      if(mode==='playing'&&selected===gesture.type) {
        const cell=cellAt(pointer.x,pointer.y);
        if(cell)place(cell.row,cell.col);
        else if(gesture.kind==='card'){selected=null;selectedPacket=null;updateHud();}
      }
    }
    if(!state.heldNut)pointer=null;
    if(gameWrap.hasPointerCapture?.(e.pointerId))gameWrap.releasePointerCapture(e.pointerId);
  });
  gameWrap.addEventListener('pointercancel',()=>{
    if(touchGesture?.kind==='card'&&touchGesture.dragging){selected=null;selectedPacket=null;}
    touchGesture=null;if(!state.heldNut)pointer=null;suppressedCardClick=null;updateHud();
  });
  gameWrap.addEventListener('contextmenu',e=>{e.preventDefault();if(state?.heldNut)return;selected=null;selectedPacket=null;touchGesture=null;updateHud();});
  document.addEventListener('keydown',e=> {
    if(e.target instanceof HTMLInputElement || e.repeat)return;
    if(e.code==='Space'){e.preventDefault();pause();}
    if(e.key==='Escape'){if(mode==='paused')resume();else if(!state?.heldNut){selected=null;selectedPacket=null;updateHud();}}
    if(e.key==='3'){e.preventDefault();const packet=state?.belt[0];if(packet)select(packet.type,null,packet.id);return;}
    if(e.key==='5'){e.preventDefault();select('shovel');}
  });
  window.addEventListener('resize',updateHud);

  async function load() {
    const staticAssets={background:'assets/background.jpg',shadow:'assets/shadow.png',mower:'assets/mower.png',
      'bowling-stripe':'assets/bowling-stripe.png','start-ready':'assets/start-ready.png','start-set':'assets/start-set.png',
      'start-plant':'assets/start-plant.png'};
    const spriteNames=new Set(['soil','shovel','zombie-walk','zombie-eat','zombie-die','zombie-head','cone-walk','cone-eat','flag-walk','flag-eat','pingpong-walk','pingpong-eat','pingpong-die','pingpong-head',...Object.values(defs).flatMap(d=>[d.sprite,d.glowSprite].filter(Boolean))]);
    const entries=[...Object.entries(staticAssets),...Object.entries(window.SPRITES).filter(([name])=>spriteNames.has(name)).map(([name,s])=>[name,s.src])];
    await Promise.all(entries.map(([name,src])=>new Promise((resolve,reject)=>{
      const im=new Image();im.onload=()=>{images[name]=im;resolve();};im.onerror=()=>reject(new Error(src));im.src=src;
    })));
    for(const name of ['readysetplant','plant','plant2','shovel','bowling','bowlingimpact','bowlingimpact2','cherrybomb','seedlift','plastichit','zombie_falling_1','zombie_falling_2','pause','buttonclick','chomp','error','groan3','groan4','hugewave','lawnmower','losemusic']) {
      sounds[name]=new Audio((window.AUDIO_SOURCES||{})[name]||'assets/'+name+'.mp3');sounds[name].preload='auto';
    }
    // No looping background music: sound effects only, so an embedded podcast stays audible.
    ready=true;showIntro();
    requestAnimationFrame(frame);
  }
  // Diagnostics are available only with ?debug=1, keeping regular play unchanged.
  if(new URLSearchParams(location.search).get('debug')==='1') {
    window.pvzDebug={
      snapshot:()=>JSON.parse(JSON.stringify({mode,selected,selectedPacket,...state})),
      start,skipCountdown:()=>{mode='playing';$('overlay').hidden=true;updateHud();},
      plant:(row,col,type)=>{if((type!=='shovel'&&!defs[type])||(state.heldNut&&type!==state.heldNut.type))return false;selected=type;selectedPacket=null;return place(row,col,type);},
      addPacket:type=>{if(!defs[type]||state.belt.length>=bowl.maxNuts)return false;const packet={id:++state.id,type,pos:state.belt.length};state.belt.push(packet);updateHud();return packet.id;},
      spawn:spawnZombie,advance:seconds=>{for(let i=0;i<seconds*60&&mode==='playing';i++)update(step);render();updateHud();},
      pickNut:()=>{const nut=state.drops[0];return nut?pickupNut(nut):false;},
      damagePlant:(row,col,hp)=>{const p=plantAt(row,col);if(p)p.hp=hp;render();},
      pause,resume,mute:()=>setMute(true),setVolume,volume:()=>gameVolume,videoTime:()=>videoTime,currentChapter:()=>currentChapter
    };
  }
  load().catch(error=> {
    mode='error';$('error').hidden=false;
    $('error').textContent='素材加载失败：'+error.message+'。请刷新页面；本地运行时请确认 assets 文件夹完整。';
    console.error(error);
  });
})();
