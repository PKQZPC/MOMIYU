// Version-based action comparison uses the same player as the desktop pet.
(function(){
 const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
 let lastKey='',players=[];
 function render(appearance,jobs){const area=document.getElementById('appearance-history'),key=JSON.stringify([appearance,jobs.map(j=>[j.id,j.growth_state])]);if(key===lastKey)return;lastKey=key;players=[];area.replaceChildren();
  if(appearance.origin&&!appearance.origin.selected&&appearance.id.startsWith('egg_')&&!jobs.length){const picker=node('div',undefined,'egg-picker');picker.append(node('span','选择你的第一颗蛋 · 领取后款式与颜色都不能更换'));
   const buttons=new Map();let pendingColor=appearance.origin.color,pendingStyle=appearance.origin.style||'soft';
   for(const [style,label] of [['soft','柔和款 · 原版画风'],['pearl','珠光款 · 明亮质感']]){picker.append(node('h4',label,'egg-style-heading'));const options=node('div',undefined,'egg-options');picker.append(options);
    for(const [color,name] of [['ivory','白'],['mint','绿'],['lavender','紫'],['red','红'],['blue','蓝']]){const b=node('button',undefined,'egg-swatch '+color);b.append(node('span',name));b.dataset.egg=color;b.dataset.eggStyle=style;const id=style+':'+color;b.setAttribute('aria-pressed',String(pendingStyle===style&&pendingColor===color));b.onclick=()=>{pendingColor=color;pendingStyle=style;for(const [key,button] of buttons)button.setAttribute('aria-pressed',String(key===id));};options.append(b);buttons.set(id,b);}}
   const footer=node('div',undefined,'egg-confirm'),receive=node('button','确认领取这颗蛋','primary'),error=node('small');receive.onclick=async()=>{receive.disabled=true;error.textContent='';try{await window.momiyu.invoke('choose-egg',{color:pendingColor,style:pendingStyle});}catch{receive.disabled=false;error.textContent='这次未能领取，请刷新查看当前状态。';}};footer.append(receive,error);picker.append(footer);area.append(picker);
   window.momiyu.invoke('egg-options').then(items=>{if(!picker.isConnected)return;for(const item of items){const b=buttons.get(item.style+':'+item.color);if(!b)continue;const image=node('img');image.src=item.dataUrl;image.alt=item.styleName+' · '+item.name+'色的蛋';b.prepend(image);}}).catch(()=>{});}
  const originId=appearance.origin?'egg_'+((appearance.origin.style||'soft')==='pearl'?'pearl_':'')+appearance.origin.color:null;
  const entries=[...(appearance.origin?(appearance.origin.selected?[{id:originId,state:'active',reason:'我们从这颗'+((appearance.origin.style||'soft')==='pearl'?'珠光款':'柔和款')+'蛋开始。',origin:true}]:[]):[{id:'sample_appearance_v1',state:'active',reason:'早期示例形象，并非从蛋运行的成长记录。',origin:true}]),...(appearance.history||[]).slice().reverse()];
  let evolutionIndex=0;
  entries.forEach(entry=>{const card=node('article',undefined,'journey-version'),isEgg=entry.id.startsWith('egg_'),title=entry.origin?(isEgg?'最初 · 蛋':'早期示例'):entry.stage==='juvenile'?'孵化 · 幼体':'后续成长 '+(++evolutionIndex);
   const heading=node('div',undefined,'journey-version-heading');heading.append(node('h3',title),node('span',entry.id===appearance.id?'现在的它':entry.state==='active'?'曾经的模样':'尚未生效','journey-badge'));card.append(heading);
   const job=jobs.find(j=>j.id===entry.job_id);card.append(node('p',entry.reason,'journey-reason'));
   if(job){const evidence=node('details',undefined,'journey-evidence');evidence.append(node('summary','看看这次成长的经历与判断'),node('p',job.result?.summary),node('p',job.growth_input?.growth_judgment?.reason||job.result?.growth.reason||''));card.append(evidence);}
   const button=node('button','展开形象与动作','text-button');button.onclick=async()=>{button.disabled=true;try{
    const data=await window.momiyu.invoke('appearance',entry.id),body=node('div',undefined,'journey-body'),hero=node('figure',undefined,'journey-hero'),image=node('img');image.src=data.dataUrl||'../../../demos/pet-animation/assets/body-poses.png';image.alt=title+'的形象参考';hero.append(image,node('figcaption','形象参考 · 静态'));body.append(hero);
    const content=node('div',undefined,'journey-content');body.append(content);card.append(body);
    if(data.kind==='legacy'){content.append(node('p','旧素材缺少动作继承记录，暂只展示形象参考。'));button.remove();return;}
    const player=new MomiyuCharacterPlayer.CharacterPlayer();await player.load(data);
    if(data.actions.states?.length){const states=node('div',undefined,'journey-states');for(const state of data.actions.states)states.append(node('p',state.name+'：'+state.description));content.append(states);}
    const grid=node('div',undefined,'journey-actions');content.append(grid);
    for(const action of data.actions.actions||[]){const row=node('div',undefined,'journey-action');row.dataset.actionId=action.id;const change={initial:'初始动作',new:'新增动作',inherited:'继承 · 更新形象',adapted:'适配调整'}[action.change]||'待说明',group=action.id.startsWith('sleep.')?'睡眠':action.id.startsWith('skill.')?'技能':'基础';
     const binding=data.actions.bindings[action.id],canvas=node('canvas');canvas.width=260;canvas.height=220;canvas.setAttribute('aria-label',action.name);const copy=node('div',undefined,'journey-action-copy'),heading=node('div',undefined,'journey-action-heading');heading.append(node('strong',action.name),node('span',change,'journey-badge'));copy.append(heading,node('small',group+' · '+action.trigger),node('p',action.description));
     if(action.change!=='initial')copy.append(node('p',action.reason,'journey-action-reason'));
     if(!['base.idle','base.greet','sleep.rest','sleep.wake'].includes(action.id)&&!action.id.startsWith('skill.'))copy.append(node('small','当前可在这里预览，自动触发尚未接入。'));
     const dynamic=data.kind==='egg'?binding.motion==='rock':new Set(binding?.frames?.map(f=>f.page+':'+f.pose)).size>1;
     const item={player,canvas,binding,start:0,playing:false};players.push(item);
     if(dynamic){const play=node('button','播放动作','journey-play');play.onclick=()=>{item.playing=true;item.start=performance.now();};copy.append(play);if(data.kind!=='egg')copy.append(node('small','关键姿态切换预览，尚非连续帧动画。'));}else copy.append(node('small','静态姿态'));
     row.append(canvas,copy);grid.append(row);
    }
    for(const id of data.actions.missing||[])content.append(node('p','尚缺相应动作素材。'));button.remove();
   }catch{button.disabled=false;button.textContent='素材暂未读取，点击重试';}};card.append(button);area.append(card);
  });
  for(const job of jobs.slice().reverse())if(job.growth_state&&job.growth_state!=='published'){const card=node('details');card.append(node('summary',job.growth_state==='accumulating'?'这次先积累，没有改变形象':'这次成长尚未生效'),node('p',job.growth_input?.growth_judgment?.reason||job.result?.growth.reason||''));area.append(card);}
 }
 function tick(now){requestAnimationFrame(tick);if(document.hidden||!document.getElementById('growth')?.classList.contains('active'))return;for(const item of players){const ctx=item.canvas.getContext('2d');ctx.clearRect(0,0,item.canvas.width,item.canvas.height);item.player.key=JSON.stringify(item.binding);item.player.started=0;const duration=item.binding?.frames?item.binding.frames.length/(item.binding.fps||4)*1000:900,elapsed=item.playing?Math.min(duration,now-item.start):0;item.player.draw(ctx,item.binding,elapsed,item.canvas.width,item.canvas.height);}}
 requestAnimationFrame(tick);window.renderGrowthJourney=render;
})();
