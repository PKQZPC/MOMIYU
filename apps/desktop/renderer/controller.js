const $ = id => document.getElementById(id);
let snapshot,conversation = [],initialized = false,toastTimer;
const taskDrafts=new Map();
let lastLifeKey='';
const titles = {home:'小小的家',chat:'说说话',experiences:'一起经历',growth:'成长手记',abilities:'技能图鉴',settings:'相处设置',accounts:'账号管理'};
const errors = {collection_disabled:'先在相处设置里开启这一来源的本地保存。',request_in_progress:'它正在处理上一件事，稍等一下，或者先停止。',invalid_text:'写一点内容吧，每段最多 4000 字。',model_disabled:'模型调用尚未开启。',invalid_loopback_proxy:'代理配置无法使用，请选择有效的本地代理配置。',model_http_401:'代理未接受当前配置，请检查代理授权。',model_http_429:'代理额度或频率受限，这次不会自动重试。',model_incomplete:'这次模型没有完整回答，经历已保留。',invalid_analysis:'整理结果格式不完整，尚未采用。',invalid_analysis_evidence:'整理结果的依据不完整，尚未采用。',request_cancelled:'这次处理已经停下，经历仍在。',input_budget_exceeded:'这段内容超出本轮预算，请拆成较短的片段。'};
Object.assign(errors,{document_too_large:'这份文件超过 32KB，先选一份较短的文本吧。',unsupported_document:'这一版先支持 txt、md 和 csv 文本文件。',invalid_document:'这份文件目前无法读取，请选择普通 UTF-8 文本文件。'});
Object.assign(errors,{proxy_not_configured:'先选择现有代理配置吧。',proxy_unavailable:'还没连上代理，请先启动你配置的本地代理服务。'});
Object.assign(errors,{invalid_agent_output:'这次回应格式没有整理好，已保留进度。',invalid_task_artifact:'这次文件没有保存成功，已保留任务进度。',skill_assets_pending:'动作还没准备好，可以在技能页让它小睡准备一下。',skill_requires_hatched_pet:'等它孵化以后，再一起准备技能吧。',skill_material_review_required:'素材还需要检查，之前的记录已经保留。',invalid_task_resume:'这次任务暂时不能接着做，已完成的进展还在。',skill_source_not_authorized:'这个技能的来源还没获准用于模型，请先检查发送设置。',growth_source_not_authorized:'这段成长的来源还没获准用于模型。',image_generation_disabled:'请先在设置中允许形象生成。',unsupported_tool:'目前还没有完成这件事所需的工具，已保留进度。',invalid_app_list:'填写应用进程名，用英文逗号分隔，不要填写路径。'});
function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(() => {$('toast').hidden=true;},6000); }
async function invoke(operation,payload) {
  try { return await window.momiyu.invoke(operation,payload); }
  catch (error) { toast(errors[error.message] || '这次没有处理成功。请检查代理是否已启动、配置是否有效；程序不会自动重试。'); throw error; }
}
function page(name) {
  if(snapshot?.accounts && !snapshot.accountReady)name='accounts';
  if($('accounts').classList.contains('active') !== (name==='accounts'))accountView('list');
  for (const element of document.querySelectorAll('.page')) element.classList.toggle('active',element.id===name);
  for (const button of document.querySelectorAll('[data-page]')) button.classList.toggle('selected',button.dataset.page===name);
  $('breadcrumb').textContent='我们的日常 / '+titles[name];
}
for (const button of document.querySelectorAll('[data-page],[data-goto]')) button.onclick=() => page(button.dataset.page || button.dataset.goto);
window.momiyu.onPage(name=>{page(name);if(name==='chat')$('chat-input').focus();});
page('chat');
function node(tag,text,className) { const element=document.createElement(tag); if(text!==undefined)element.textContent=text; if(className)element.className=className; return element; }
function empty(container,copy) { container.replaceChildren(node('p',copy,'empty')); }
function drawChat() {
  const area=$('messages'); area.replaceChildren();
  if (!conversation.length) empty(area,'小家伙抬起头，等你说第一句话。');
  for (const message of conversation) {
    const item=node('div',undefined,'message '+message.role);
    item.append(node('small',message.role==='user'?'你':message.local?'MOMIYU · 本地回应':snapshot?.settings.alias || 'MOMIYU'),node('p',message.content)); area.append(item);
  }
  area.scrollTop=area.scrollHeight;
}
Object.assign(errors,{
  invalid_account_name:'请填写 1 至 40 个字符的账号名称。',
  duplicate_account_name:'本机已有同名账号，换一个名字吧。',
  account_unavailable:'无法打开这个账号的数据，请检查档案是否仍在原处。',
  account_required:'先创建或选择一个账号吧。',
  invalid_account_password:'密码须为 8 至 128 个字符。',
  account_password_mismatch:'两次输入的密码不一致。',
  incorrect_account_password:'密码不正确，请重新输入。',
});
let accountListKey, selectedLogin;
function accountView(view) {
  $('account-picker').hidden=view!=='list';
  $('login-form').hidden=view!=='login';
  $('account-form').hidden=view!=='register';
  if(view!=='login'){$('login-form').reset();selectedLogin=null;}
  if(view!=='register')$('account-form').reset();
}
$('open-register').onclick=()=>{accountView('register');$('account-name').focus();};
$('register-back').onclick=()=>{accountView('list');$('open-register').focus();};
$('login-back').onclick=()=>{
  const id=selectedLogin?.id;
  accountView('list');
  [...$('account-list').querySelectorAll('button')].find(button=>button.dataset.accountId===id)?.focus();
};
function renderAccounts(value) {
  if(!value.accounts)return;
  const {list,activeId,rememberedId}=value.accounts;
  document.body.classList.toggle('signed-out',!value.accountReady);
  const active=list.find(account=>account.id===activeId);
  $('accounts-heading').textContent=value.accountReady?'账号管理':'登录 MOMIYU';
  $('open-accounts').hidden=false;
  $('open-accounts').textContent=active&&value.accountReady?`账号 · ${active.name}`:'账号管理';
  for(const button of document.querySelectorAll('[data-page]'))button.disabled=!value.accountReady;
  $('create-account').disabled=!!value.busy;
  $('login-submit').disabled=!!value.busy;
  $('sign-out').hidden=!value.accountReady;
  $('sign-out').disabled=!!value.busy;
  const key=JSON.stringify([list,activeId,rememberedId,value.accountReady,!!value.busy]);
  if(key===accountListKey)return;
  accountListKey=key;
  const area=$('account-list');
  area.replaceChildren();
  if(!list.length)empty(area,'创建第一个账号，就可以选蛋了。');
  for(const account of list){
    const row=node('div',undefined,'account-row');
    row.append(node('strong',account.name));
    if(account.id===activeId&&value.accountReady)row.append(node('small','当前账号'));
    else {
      if(account.id===activeId)row.append(node('small','上次使用'));
      const remembered=!account.needsPassword && account.id===rememberedId;
      const button=node('button',remembered?'继续使用':account.needsPassword?'设置密码':value.accountReady?'切换账号':'登录','subtle');
      button.dataset.accountId=account.id;
      button.disabled=!!value.busy;
      button.onclick=()=>{
        if(remembered){invoke('switch-account',{id:account.id}).catch(()=>{});return;}
        selectedLogin=account;
        $('login-form').reset();
        accountView('login');
        $('login-heading').textContent=account.name;
        $('login-hint').hidden=!account.needsPassword;
        $('login-confirm-field').hidden=!account.needsPassword;
        $('login-confirmation').required=account.needsPassword;
        $('login-password').autocomplete=account.needsPassword?'new-password':'current-password';
        $('login-submit').textContent=account.needsPassword?'设置密码并登录':'登录';
        $('login-password').focus();
      };
      row.append(button);
    }
    area.append(row);
  }
}
$('sign-out').onclick=()=>invoke('sign-out').catch(()=>{});
$('login-form').onsubmit=async event=>{
  event.preventDefault();
  if(!selectedLogin)return;
  const button=$('login-submit');
  button.disabled=true;
  try {await invoke('switch-account',{id:selectedLogin.id,password:$('login-password').value,confirmation:$('login-confirmation').value,remember:$('login-remember').checked});}
  catch {event.target.reset();$('login-password').focus();}
  finally {button.disabled=!!snapshot?.busy;}
};
$('account-form').onsubmit=async event=>{
  event.preventDefault();
  const button=$('create-account');
  button.disabled=true;
  try {await invoke('create-account',{name:$('account-name').value,password:$('account-password').value,confirmation:$('account-confirmation').value,remember:$('register-remember').checked});}
  catch {}
  finally {button.disabled=!!snapshot?.busy;}
};
const hatchDialog=$('hatch-celebration');
let shownHatch;
function celebrateHatch(hatch){
  if(!hatch||shownHatch===hatch.id)return;
  shownHatch=hatch.id;
  $('hatch-copy').textContent=hatch.name ? '来认识一下 '+hatch.name+'。从今天起，它会以新的模样陪着你。' : '从今天起，它会以新的模样陪着你。';
  const portrait=$('hatch-portrait');
  portrait.hidden=true;
  window.momiyu.invoke('appearance',hatch.id).then(data=>{
    if(shownHatch!==hatch.id||!data.dataUrl)return;
    portrait.src=data.dataUrl;portrait.hidden=false;
  }).catch(()=>{});
  hatchDialog.showModal();
}
hatchDialog.addEventListener('close',()=>{if(shownHatch)invoke('ack-hatch',shownHatch).catch(()=>{});});
$('hatch-continue').onclick=()=>{hatchDialog.close();page('growth');};
function render(value) {
  if(snapshot && value.dataEpoch<snapshot.dataEpoch)return;
  if(snapshot && value.dataEpoch!==snapshot.dataEpoch){conversation=[];initialized=false;}
  snapshot=value;
  celebrateHatch(value.hatch);
  renderAccounts(value);
  if(value.accounts&&!value.accountReady){page('accounts');return;}
  if (!initialized) { conversation=value.observations.filter(row => row.source==='pet_chat'); initialized=true; drawChat(); }
  const settings=value.settings;$('profile-mode').textContent=value.demoDataset?'模拟经历 · '+value.demoDataset.version:'';document.querySelector('.sidebar-bottom small').textContent='MOMIYU v'+value.appVersion;
  if(document.activeElement!==$('pet-size')){$('pet-size').value=settings.petScale;$('pet-size-label').textContent=settings.petScale+'%';}
  const screenStates={off:'系统截图已关闭。',starting:'正在准备半小时截图。',waiting:'正在累计使用时间，每 30 分钟保存一次。',paused:'锁屏、休眠或显示器关闭，暂停计时。',saved:'这一张画面收好啦，重新累计半小时。',capture_paused:'系统截图已暂停，请关闭后重新开启。',screenshot_failed:'这次截图未保存，稍后再试。'};
  $('screen-status').textContent=screenStates[value.screen?.status]||'系统截图暂不可用。';
  const aiPet=value.life?.entries.find(x=>x.kind==='pet')?.payload;
  $('pet-name').textContent=settings.alias || aiPet?.name || 'MOMIYU';
  document.querySelector('.sample-label').textContent=value.appearance.id.startsWith('egg_')?'一起等待孵化':value.appearance.id==='sample_appearance_v1'?'临时示例形象':'已经长成的新模样';
  petActor.setAppearance(value.appearance);
  $('pet-status').textContent=settings.resting?'正在小睡':'安静陪伴中';
  $('pet-speech').textContent=settings.resting?'呼……就在这里，睡一会儿。':'嗨，我在这里。';
  $('rest').textContent=settings.resting?'轻轻叫醒它':'打个小盹';
  petActor.setRest(settings.resting);
  $('record-count').textContent=value.counts.observations;
  $('analysis-count').textContent=value.counts.completedJobs;
  $('connection').textContent=settings.modelEnabled?'模型调用已允许':'本地陪伴';
  $('chat-mode').textContent=settings.modelEnabled&&settings.sendChat?'本次消息和获准的近期聊天将发送给所选代理模型。':'模型聊天尚未开启；当前是本地回应。';
  $('note-permission').textContent=settings.saveNotes?'保存到本机；是否交给模型由发送设置决定。':'请先在相处设置中开启“保存主动提供的经历”。';
  const napReasons={device_unavailable:'设备锁屏或待机',task_active:'正在处理任务',resting:'正在休息',chat_active:'正在和它聊天',waiting:'等待合适的休息时间',window_already_used:'本次休息时段已结束或已唤醒'};
  const napLast=value.nap?.last;
  const schedule=value.nap?.schedule;
  const scheduleCopy=schedule?' 当前休息时段 '+schedule.start+'–'+schedule.end+({routine:'，根据近期电脑使用作息调整。',default:'，观察积累中，暂用默认时段。',manual:'，使用手动设置。'}[schedule.source]||''):'';
  $('nap-status').textContent=(napReasons[value.nap?.decision]||'等待休息')+(napLast?'。最近一次自动小睡在 '+new Date(napLast.startedAt).toLocaleString()+' 开始'+(napLast.endedAt?'，已结束':'')+'。'+({rest:'这次只休息。',analyzed:'本轮经历已整理。',resumed:'续接整理已完成。',failed:'整理未完成，可查看经历进度。',cancelled:'已唤醒，未完成的整理已停止。',checking:'正在检查待整理的经历。'}[napLast.analysis]||''):'。还没有自动小睡记录。')+scheduleCopy;
  if(!autoNapDirty){
    $('adaptive-nap-enabled').checked=settings.adaptiveNapEnabled;
    $('natural-nap-enabled').checked=settings.naturalNapEnabled;
    $('auto-nap-enabled').checked=settings.autoNapEnabled;
    $('auto-nap-start').value=settings.autoNapStart;
    $('auto-nap-end').value=settings.autoNapEnd;
  }
  for (const input of document.querySelectorAll('[data-setting]')) input.checked=settings[input.dataset.setting];
  if(document.activeElement!==$('alias'))$('alias').value=settings.alias;
  if(document.activeElement!==$('model'))$('model').value=settings.model;
  $('proxy-path').textContent=settings.proxyConfig || '尚未选择配置';
  $('chatgpt-binding').hidden=!value.accounts;
  $('chatgpt-binding-status').textContent=value.chatgpt?.unavailable?'本机凭据无法读取':value.chatgpt?`已绑定 ${value.chatgpt.account} · ${value.chatgpt.model}`:value.busy==='chatgpt-binding'?'等待浏览器完成授权…':settings.proxyConfig?'本机 API 调试模式 · '+settings.model:'尚未绑定';
  $('bind-chatgpt').hidden=!!value.chatgpt;
  $('bind-chatgpt').disabled=!!value.busy;
  $('unbind-chatgpt').hidden=!value.chatgpt;
  $('unbind-chatgpt').disabled=!!value.busy;
  $('chatgpt-usage-link').hidden=!value.chatgpt;
  renderModelUsage(value.modelUsage,value.modelUsageTotals);
  $('model-connection').textContent=!settings.modelEnabled?'模型调用已关闭':value.connection?.status==='ready'?'模型连接正常，当前模型可用':value.connection?.status==='model_unavailable'?'连接正常，当前模型未提供':value.connection?.status==='unavailable'?'暂未连上，请检查模型连接':'尚未检查连接';
  $('check-connection').disabled=!!value.busy;
  $('activity').hidden=!value.busy;
  $('activity-copy').textContent=value.busy==='sleep'?'正在把这段经历慢慢收好……':value.busy==='task'?'正在认真使出刚练习的方法……':value.busy==='growth'?'新的模样正在慢慢成形……':value.busy==='connection'?'正在检查模型连接……':'正在想怎么回应你……';
  for (const button of document.querySelectorAll('#chat-form button')) button.disabled=!!value.busy;
  $('rest').disabled=!!value.busy&&!settings.resting;
  const analysisSources={raw_input:['原始按键','sendRawInput'],system_screenshot:['系统截图','sendScreenshots'],system_interface:['旧版界面记录','sendSystem'],pet_chat:['宠物内聊天','sendChat'],file_document:['选定文件','sendFiles'],manual_note:['主动提供的经历','sendNotes']};
  const analysisLabel=(source,status)=>{
    if(status==='completed')return '已整理';
    if(status==='running')return '整理中';
    if(status==='failed')return '失败，待手动重试';
    if(!settings[analysisSources[source]?.[1]])return '仅存本机';
    if(!settings.modelEnabled||value.analysisConfigured===false)return '待整理（模型未配置或未启用）';
    return '待整理';
  };
  $('analysis-status').textContent=value.busy==='sleep'?'正在整理经历。':value.busy==='growth'||value.busy==='skill-materials'?'正在处理成长或技能。':settings.resting?'正在休息，当前没有整理任务。':'已整理表示经历整理完成。成长和技能的进度在各自页面查看。';
  $('analysis-coverage').replaceChildren(...(value.analysisCoverage?.length?value.analysisCoverage.map(row=>node('p',`${analysisSources[row.source]?.[0]||row.source} · ${analysisLabel(row.source,row.status)} ${row.count} 条`)):[node('p','还没有保存的经历。')]));
  $('observations').replaceChildren();
  for (const row of [...value.observations].reverse()) {
    const card=node('article',undefined,'card record');
    const sourceLabel=row.source==='raw_input'?'原始按键':row.source==='system_screenshot'?'系统截图':row.source==='system_interface'?(row.metadata.conversation_refs?.length?'聊天观察 · '+row.metadata.conversation_refs.map(c=>c.label||'未命名会话').join(' / '):'系统观察 · '+row.metadata.app):row.source==='pet_chat'?'宠物内聊天 · '+(row.role==='user'?'你':'宠物'):row.source==='file_document'?'已选文件 · '+row.metadata.name+' · v'+row.metadata.version+' · '+row.metadata.part+'/'+row.metadata.parts:'主动提供的经历';
    card.append(node('small',sourceLabel+' · '+analysisLabel(row.source,row.analysis_status)+' / '+new Date(row.created_at).toLocaleString()),node('p',row.content));
    if(row.metadata?.screenshot){const view=node('button',row.metadata.screenshot.reused?'查看复用的画面':'查看当时的画面','text-button');view.onclick=()=>invoke('screenshot',row.id).then(src=>{const image=node('img',undefined,'evidence-image');image.src=src;image.alt='当时获准前台窗口的画面';card.append(image);view.remove();}).catch(()=>{});card.append(view);}
    const button=node('button','删除这段','text-button'); button.onclick=() => invoke('remove',row.id).then(() => {conversation=[]; initialized=false; return invoke('state');}).then(render).catch(() => {}); card.append(button); $('observations').append(card);
  }
  if(!value.observations.length)empty($('observations'),'还没有保存的片段。你可以决定什么时候开始。');
  $('watched-files').replaceChildren();
  for(const watch of value.watches) {
    const item=node('div',undefined,'watch-row');
    item.append(node('span',watch.name+' · v'+watch.version+' · '+(!settings.saveFiles?'已暂停':watch.status==='unavailable'?'暂时不可读':'观察保存变化中')));
    const stop=node('button','停止并删除相关记录','text-button');stop.onclick=()=>invoke('unwatch-file',watch.id).catch(()=>{});item.append(stop);$('watched-files').append(item);
  }
  $('jobs').replaceChildren();
  const statusNames={completed:'整理完成',failed:'这次没整理好',cancelled:'这次停下了',interrupted:'上次意外中断，经历待下次整理',running:'正在整理'};
  for (const job of value.jobs) {
    const card=node('article',undefined,'card');card.append(node('small',new Date(job.created_at).toLocaleString()+' · '+statusNames[job.status]));
    if (job.result) {
      card.append(node('h2',job.result.summary));
      for (const [key,label] of [['experiences','整理的经历'],['user_understanding','对你的认识 · 待检查'],['workflow_candidates','做事的过程 · 候选'],['skill_candidates','可能学到的方法 · 尚未学会']]) {
        if (!job.result[key].length) continue;
        const group=node('details'); group.append(node('summary',label));
        for(const item of job.result[key]) { if(item.name)group.append(node('h3',item.name)); group.append(node('p',item.description)); if(item.basis)group.append(node('small',item.basis)); if(item.method)group.append(node('p',item.method)); }
        card.append(group);
      }
      card.append(node('p',(job.result.growth.should_change?'有成长依据：':'这次先积累：')+job.result.growth.reason));
      if(job.growth_input) {
        card.append(node('p','新的成长积累已经收好，形象构思资料也准备好了。'));
        const growthStatus={awaiting_image_generation:'成长资料已收好，继续时会结合当前和历史形象再作判断。',awaiting_materials:'新形象仍是候选：必要动作素材尚未齐备，当前继续使用完整的上一版。',planning_design:'正在把一起经历的日子构思成新的模样……',judging_growth:'正在回望一起走过的日子，判断这次是否该长出新模样……',judgment_failed:'成长判断暂未完成，资料仍在，可以下次小睡继续。',accumulating:'这次先把经历藏进心里，留给后面的成长。',generating:'新的样子正在成形……',awaiting_review:'候选形象已经收好，接着检查就好，不会重新生图。',reviewing:'正在看看新模样是否还是熟悉的它、能否好好活动……',stale_candidate:'后来的成长已经生效，这份较早候选留在记录里。',published:'新形象已经准备好，还是熟悉的那只小家伙。',rejected:'这次候选还不合适，先保留熟悉的样子。',failed_no_retry:'这次生成没有完成，原形象仍然可用，不会自动重试。',interrupted_no_retry:'上次生成中断，已保留原形象，不会自动重试。'};
        card.append(node('small',growthStatus[job.growth_state]||'成长资料已保存。'));
        if(job.growth_input.growth_judgment)card.append(node('p',job.growth_input.growth_judgment.reason));
        const review=job.growth_input.lifecycle?.design_review;
        const concept=job.growth_input.lifecycle?.design_concept;if(concept){const d=node('details'),h=node('summary','这次新模样的构思');d.append(h,node('p',concept.concept),node('p',concept.experience_basis),node('p',concept.continuity));if(concept.revision_response)d.append(node('p',concept.revision_response));card.append(d);}
        if(review?.growth&&review?.continuity){const details=node('details'),summary=node('summary','这次模样的成长检查');details.append(summary,node('p',(review.growth.demonstrated?'成长表达：':'成长表达的观察：')+review.growth.changes),node('p','经历依据：'+review.growth.experience_basis),node('p',(review.continuity.supported?'一路长来的联系：':'个体延续的观察：')+review.continuity.reason));card.append(details);}
        if(['awaiting_image_generation','awaiting_review','judgment_failed'].includes(job.growth_state)){const grow=node('button',job.growth_state==='awaiting_review'?'接着看看这次的新模样':'让这段成长继续成形','subtle');grow.disabled=!value.settings.modelEnabled||!value.settings.imageGeneration||!!value.busy;grow.onclick=()=>invoke('grow',job.id).catch(()=>{});card.append(grow);}
      } else card.append(node('small','本轮没有准备形象生成请求，当前外观保持可用版本。'));
      if(job.usage?.total_tokens)card.append(node('small','本轮模型用量：'+job.usage.total_tokens+' tokens'));
    } else card.append(node('p',job.status==='running'?'正在整理……':'原始片段仍然保留，可以之后再整理。'));
    $('jobs').append(card);
  }
  if(!value.jobs.length)empty($('jobs'),'还没有整理记录。小睡时，有获准的新经历才会交给模型。');
  renderLife(value);
  window.renderGrowthJourney(value.appearance,value.jobs);
}
let appearanceHistoryKey='';
function renderAppearanceHistory(appearance){const key=JSON.stringify(appearance);if(key===appearanceHistoryKey)return;appearanceHistoryKey=key;const area=$('appearance-history');area.replaceChildren();const states={active:'已经使用过的形象',candidate:'还在检查的新模样',rejected:'保留下来的候选'};
 for(const entry of [{id:'sample_appearance_v1',state:'active',reason:'最初陪在你身边的示例形象。'},...(appearance.history||[]).slice().reverse()]){const item=node('details');item.append(node('summary',(entry.id===appearance.id?'现在的它 · ':states[entry.state]||'形态记录 · ')+(entry.created_at?new Date(entry.created_at).toLocaleString():'最初的模样')),node('p',entry.reason));const view=node('button','看看这一版形象','text-button');view.onclick=()=>invoke('appearance',entry.id).then(data=>{const image=node('img',undefined,'evidence-image');image.src=data.dataUrl||'../../../demos/pet-animation/assets/body-poses.png';image.alt='这一版本的宠物形象参考';item.append(image);view.remove();}).catch(()=>{});item.append(view);area.append(item);}
}
function renderLife(value){
 const life=value.life||{entries:[],skills:[],tasks:[],phases:[]},key=JSON.stringify([life,value.busy,value.settings.modelEnabled,value.settings.imageGeneration]);if(key===lastLifeKey)return;lastLifeKey=key;$('memories').replaceChildren();
 const labels={shared_memory:'一起记得',user_understanding:'慢慢了解你',workflow:'做事的过程',pet:'它自己的样子'};
 for(const entry of life.entries.slice(0,12)){const item=node('details');item.append(node('summary',labels[entry.kind]||'成长记录'),node('p',entry.payload.description||entry.payload.personality));if(entry.payload.basis)item.append(node('small',entry.payload.basis));$('memories').append(item);}
 if(!life.entries.length)empty($('memories'),'等下一次小睡，把经历收进记忆。');
 $('skills').replaceChildren();$('skill-candidates').replaceChildren();let learnedCount=0,candidateCount=0;$('skill-connection-note').textContent=value.settings.modelEnabled?'选择技能并填写任务，再点击发动。任务结果会留在下面。':'模型当前关闭：可以查看技能和已有成果。发动前请在相处设置开启模型，并启动现有代理。';
 for(const skill of life.skills){const ready=!!skill.assets,learned=ready&&skill.assessment?.learned;if(learned)learnedCount++;else candidateCount++;const card=node('article',undefined,'card');card.append(node('small',(learned?'学会啦':'还在练习')+' · v'+skill.version),node('h2',skill.payload.name),node('p',skill.payload.description));
  card.append(node('small',skill.assessment?.proficiency||'需要后续经历核对，也要真正动手试一试。'));
  if(learned)card.append(node('p','新技能已经准备好，随时叫它来帮忙吧。'));
  const goal=node('textarea');goal.rows=2;goal.maxLength=4000;goal.placeholder='这次想让它帮你做什么？';goal.value=taskDrafts.get(skill.id)||'';goal.oninput=()=>taskDrafts.set(skill.id,goal.value);
  const button=node('button',learned?'发动技能':ready?'试着使一次（尚未学会）':'小睡准备试用','primary');const refreshButton=()=>{button.disabled=!!value.busy||!value.settings.modelEnabled||(!ready&&!value.settings.imageGeneration)||(ready&&!goal.value.trim());button.title=!value.settings.modelEnabled?'请先开启模型并启动代理':ready&&!goal.value.trim()?'先告诉它这次的任务':'';};goal.oninput=()=>{taskDrafts.set(skill.id,goal.value);refreshButton();};refreshButton();button.onclick=()=>!ready?invoke('prepare-skill',skill.id).then(()=>toast('动作整理好后，就能醒来练习啦。')).catch(()=>{}):invoke('use-skill',{id:skill.id,goal:goal.value}).then(result=>toast(result.status==='completed'?'整理好啦，结果放在下面的任务里。':'这次的进展放在任务里，可以看看。')).catch(()=>{});card.append(goal,button);$(learned?'skills':'skill-candidates').append(card);
 }
 if(!learnedCount)empty($('skills'),'它还在慢慢练习，正式学会的技能会出现在这里。');$('skill-candidate-summary').textContent='正在练习的方法 · '+candidateCount;if(!candidateCount)empty($('skill-candidates'),'暂时没有新的练习候选。');
 if(life.phases.some(x=>x.status!=='completed'))$('skill-candidates').append(node('p','还有一小段整理没完成，下次小睡会接着来。','quiet-note'));
 $('tasks').replaceChildren();const status={running:'正在使出技能',completed:'收好结果啦',partial:'先整理到这里',blocked:'还缺一些条件',failed:'这次没成功',cancelled:'已经停下',interrupted:'上次中断了'};
 for(const task of life.tasks){const card=node('article',undefined,'card');card.append(node('small',(status[task.status]||task.status)+(task.payload.trial?' · 练习中':'')),node('h2',task.payload.skill_name),node('p',task.payload.goal));if(task.payload.result)card.append(node('p',task.payload.result));for(const artifact of task.payload.artifacts)card.append(node('small','已保存文件：'+(artifact.display_name||artifact.name)));for(const step of task.payload.steps)card.append(node('small',step.message));if(['failed','partial','interrupted','cancelled','blocked'].includes(task.status)){const resume=node('button','接着完成这件事');resume.disabled=!!value.busy||!value.settings.modelEnabled;resume.onclick=()=>invoke('use-skill',{id:task.version_id,goal:task.payload.goal,resumeTaskId:task.id}).catch(()=>{});card.append(resume);}$('tasks').append(card);}
}
window.momiyu.subscribe(render);
window.momiyu.invoke('state').then(render).catch(() => toast('本地服务尚未连接。'));
$('greet').onclick=() => {petActor.greet();toast('小家伙朝你挥了挥爪子。');};
$('pet-canvas').onclick=() => snapshot?.settings.resting?invoke('wake').catch(() => {}):petActor.greet();
$('pet-canvas').onkeydown=event => {if(event.key==='Enter'||event.key===' '){event.preventDefault();$('pet-canvas').click();}};
$('rest').onclick=() => invoke(snapshot.settings.resting?'wake':'rest').then(result => {if(result?.message)toast(result.message);}).catch(() => {});
$('quit').onclick=() => invoke('quit').catch(() => {});
$('cancel').onclick=() => invoke('cancel').catch(() => {});
$('chat-form').onsubmit=async event => {
  event.preventDefault(); const draft=$('chat-input').value,content=draft.trim(); if(!content)return;
  if(snapshot?.busy){toast('它正在忙上一件事，写好的内容先留在这里。');return;}
  const message={role:'user',content};conversation.push(message);$('chat-input').value='';reportChatComposition();drawChat();
  try { const result=await invoke('chat',content); conversation.push({role:'assistant',content:result.text,local:result.mode==='local'});drawChat(); }
  catch {conversation=conversation.filter(item=>item!==message);if(!$('chat-input').value)$('chat-input').value=draft;drawChat();$('chat-input').focus();}
};
const chatEditor=$('chat-input');
function reportChatComposition(){
  window.momiyu.invoke('nap-compose',document.activeElement===chatEditor&&!!chatEditor.value.trim()).catch(()=>{});
}
for(const event of ['input','focus','blur'])chatEditor.addEventListener(event,reportChatComposition);
$('chat-input').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();$('chat-form').requestSubmit();}};
$('note-form').onsubmit=event => {event.preventDefault();const draft=$('note-input').value;invoke('note',draft).then(() => {if($('note-input').value===draft)$('note-input').value='';toast('收好啦，留在我们的经历里。');}).catch(() => {});};
let autoNapDirty=false;
Object.assign(errors,{invalid_nap_time:'请选择有效的时间。',invalid_nap_window:'指定休息时段时，请选择不同的开始和结束时间。'});
$('auto-nap-form').oninput=event=>{autoNapDirty=true;if(['auto-nap-start','auto-nap-end'].includes(event.target.id))$('adaptive-nap-enabled').checked=false;};
$('auto-nap-form').onsubmit=async event=>{
  event.preventDefault();
  try{
    await invoke('settings',{adaptiveNapEnabled:$('adaptive-nap-enabled').checked,naturalNapEnabled:$('natural-nap-enabled').checked,autoNapEnabled:$('auto-nap-enabled').checked,autoNapStart:$('auto-nap-start').value,autoNapEnd:$('auto-nap-end').value});
    autoNapDirty=false;
    toast('休息设置已保存。');
  }catch{}
};
for(const input of document.querySelectorAll('[data-setting]'))input.onchange=() => invoke('settings',{[input.dataset.setting]:input.checked}).catch(() => window.momiyu.invoke('state').then(render));
$('model').onchange=() => invoke('settings',{model:$('model').value}).catch(() => {});
$('save-alias').onclick=() => invoke('settings',{alias:$('alias').value.trim()}).then(() => toast('记住这个小称呼啦。')).catch(() => {});
$('bind-chatgpt').onclick=()=>invoke('bind-chatgpt').catch(()=>{});
$('unbind-chatgpt').onclick=()=>invoke('unbind-chatgpt').catch(()=>{});
let usageHistory=[],usageCursor,loadingUsage=false,usageHead=[];
function renderModelUsage(page,totals){
  if(usageCursor!==undefined||loadingUsage)usageHistory=[...new Map([...usageHistory,...usageHead].map(row=>[row.id,row])).values()];
  usageHead=page?.rows||[];
  const rows=[...usageHead,...usageHistory];
  $('chatgpt-usage-totals').textContent=totals?`累计 ${totals.calls} 次调用 · 输入 ${totals.input_tokens??'—'} / 输出 ${totals.output_tokens??'—'} token`+(totals.unknown_usage_calls?` · ${totals.unknown_usage_calls} 次用量未返回`:''):'';
  const distinct=[...new Map(rows.map(row=>[row.id,row])).values()].sort((a,b)=>b.id-a.id);
  $('chatgpt-usage-records').replaceChildren(...distinct.map(row=>node('p',`${new Date(row.at).toLocaleString()} · ${({growth:'成长',chat:'聊天',task:'技能执行','skill-materials':'技能素材',image:'生图'}[row.kind]||'小睡')} · ${row.model} · ${{completed:'完成',failed:'失败',cancelled:'取消',running:'进行中或状态未确认'}[row.status]||row.status} · 输入 ${row.input_tokens??'—'} / 输出 ${row.output_tokens??'—'} token`)));
  const more=$('chatgpt-usage-more');
  more.hidden=(usageCursor===undefined?page?.next:usageCursor)==null;
  more.disabled=loadingUsage;
}
$('chatgpt-usage-more').onclick=async()=>{
  const before=usageCursor===undefined?snapshot?.modelUsage?.next:usageCursor;
  if(before==null||loadingUsage)return;
  loadingUsage=true;
  $('chatgpt-usage-more').disabled=true;
  try{
    const page=await invoke('chatgpt-usage-history',before);
    usageHistory.push(...page.rows);
    usageCursor=page.next;
  }catch{}finally{
    loadingUsage=false;
    renderModelUsage(snapshot?.modelUsage,snapshot?.modelUsageTotals);
  }
};
$('chatgpt-usage-link').onclick=()=>invoke('chatgpt-usage').catch(()=>{});
Object.assign(errors,{chatgpt_binding_incomplete:'授权没有完成，请重新发起绑定。',EADDRINUSE:'本机授权端口 1455 已占用，请结束其他授权后重试。',chatgpt_identity_invalid:'账号凭据验证失败，请重新绑定。',chatgpt_plan_not_granted:'没有获得 ChatGPT 套餐使用授权。',chatgpt_no_models:'此账号暂无可用模型。',chatgpt_limit:'ChatGPT 套餐额度已到上限，请查看账号用量。',chatgpt_secure_storage_unavailable:'系统安全存储不可用。',chatgpt_revocation_unavailable:'未能撤销授权，请稍后重试。'});
$('choose-proxy').onclick=() => invoke('proxy').catch(() => {});
$('check-connection').onclick=()=>invoke('check-connection').then(value=>toast(value.status==='ready'?'连上啦，可以开始聊天或整理经历了。':'代理已连接，但还没有找到当前选择的模型。')).catch(()=>{});
$('choose-file').onclick=()=>invoke('choose-file').then(id=>{if(id)toast('记住这份文件啦，后续保存变化会留在本机。');}).catch(()=>{});

$('clear').onclick=() => {
  if(!confirm('删除本地保存的全部聊天、经历和整理结果，并停止选定文件的观察？相处设置会保留。'))return;
  invoke('clear').then(() => {conversation=[];drawChat();toast('本地经历与整理结果已删除。');}).catch(() => {});
};

let sizeTimer;
$('pet-size').oninput=()=>{$('pet-size-label').textContent=$('pet-size').value+'%';clearTimeout(sizeTimer);sizeTimer=setTimeout(()=>invoke('settings',{petScale:Number($('pet-size').value)}).catch(()=>{}),80);};
$('pet-size').onchange=()=>{clearTimeout(sizeTimer);invoke('settings',{petScale:Number($('pet-size').value)}).catch(()=>{});};
$('reset-pet-size').onclick=()=>{clearTimeout(sizeTimer);invoke('settings',{petScale:100}).catch(()=>{});};
