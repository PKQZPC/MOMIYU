// Create a new immutable scenario version; refuses to overwrite an existing one.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'demo_data/scenarios/egg_journey/v001');
if(fs.existsSync(base))throw new Error('dataset_version_exists');fs.mkdirSync(path.join(base,'sessions'),{recursive:true});
const batches=[
 ['01-first-days','初见与零散经历',[
  ['2026-09-01T09:00:00+08:00','用户打开旅行照片文件夹，看了两张照片后关掉，没有进行整理。','打开文件夹，预览两张图片，然后退出。','一次短暂浏览，约 3 分钟。'],
  ['2026-09-01T20:00:00+08:00','用户给朋友发消息讨论周末安排，随后听了一首轻音乐。','发送周末见面的消息，切换到音乐播放器。','一次消息交流；一首约 4 分钟的音乐。']]],
 ['02-continuing-experiences','逐渐持续的经历',[
  ['2026-09-04T19:00:00+08:00','用户整理旅行照片，先按地点分组，发现拍摄时间有偏差，查看行程后纠正归类。','先按地点初分；核对行程；发现时间偏移；修正分组并保留原片。','本周三次整理，共约 110 分钟；这里记录第三次的过程。'],
  ['2026-09-07T21:00:00+08:00','用户反复观看水彩动画短片，记录柔和的留白和色彩变化，尝试画一张小卡片。','观看片段，暂停观察色彩，草绘，擦除过满的笔触后重新留白。','一周内四次相关观看和绘画，共约 150 分钟。'],
  ['2026-09-10T18:30:00+08:00','用户把照片做成送给朋友的小册子，比较两个排版，删去重复内容并完成分享。','比较排版，删除重复页，校对地点说明，导出并分享。','本次约 45 分钟；完成一份小册子。']]],
 ['03-deepening-methods','既有经历延续与方法形成',[
  ['2026-09-15T10:00:00+08:00','用户开始工作中的小机器人校准，先固定其他变量，只改变一个参数，记录偏差。','保持环境一致，修改单个参数，测量偏差，把结果写入记录。','项目本周三次实验，总约 3 小时。'],
  ['2026-09-19T11:00:00+08:00','校准第一次失败，用户发现传感器安装角度造成干扰，重新固定后复测并记录纠错原因。','比较失败记录，检查安装角度，重新固定，复测，同原结果对照并记录。','同一项目第二周，约 90 分钟；两次失败后完成纠正。'],
  ['2026-09-23T20:00:00+08:00','用户对宠物说机器人是项目任务，并非个人爱好。晚上仍继续水彩小卡片创作，给朋友解释删减画面的思路。','先说明工作背景，后进行绘画与方法交流。','机器人活动目的为用户明确说明；本次绘画约 35 分钟。']]],
 ['04-new-experiences','新的持续生活经历',[
  ['2026-10-01T08:00:00+08:00','用户参与户外救援训练，学习在低可见度环境下判断方向，核对路线并带领同伴返回集合点。','检查装备，判断路线，和队友交叉核对，发现偏离后修正，返回集合点。','两周内四次训练，共约 8 小时；本条为最近一次过程。'],
  ['2026-10-10T09:00:00+08:00','训练中队友紧张，用户先稳定队伍，划定搜寻范围，发现遗漏区域后重新分工，完成模拟搜寻。','确认人员状态，划分区域，检查覆盖，纠正遗漏，重新分工，确认结果。','一次三小时模拟训练；一次明确分支纠错。'],
  ['2026-10-14T21:00:00+08:00','用户把训练笔记整理成图示，向新队员解释核对路线的方法，周末仍为朋友画了水彩卡片。','整理记录，画路线图，讲解判断依据，按提问补充说明，之后继续绘画。','本月两次方法讲解；水彩创作仍持续。']]]
];
const hash=b=>createHash('sha256').update(b).digest('hex'),files=[];
for(const [id,title,rows] of batches){const bytes=Buffer.from(JSON.stringify({id,title,records:rows.map((r,i)=>({id:id+'-'+(i+1),occurred_at:r[0],description:r[1],process:r[2],statistics:r[3]}))},null,2)+'\n');const filename='sessions/'+id+'.json';fs.writeFileSync(path.join(base,filename),bytes);files.push({path:filename,sha256:hash(bytes),batch_id:id});}
const manifest={schema_version:1,scenario_id:'egg_journey',dataset_version:'v001',provenance:'synthetic',record_count:batches.reduce((n,x)=>n+x[2].length,0),files,coverage:['egg selection','accumulation without mandatory change','individual hatchling','continued evolution','overall action compatibility','versioned action comparison'],expected_outcomes:'A demonstration target of hatching and two later changes; actual AI decisions remain authoritative.'};
const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(base,'manifest.json'),bytes);
const catalogPath=path.join(root,'demo_data/catalog.json'),catalog=JSON.parse(fs.readFileSync(catalogPath));catalog.datasets.push({scenario_id:'egg_journey',version:'v001',manifest:'scenarios/egg_journey/v001/manifest.json',sha256:hash(bytes)});fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');console.log('Created egg_journey/v001: '+manifest.record_count+' synthetic records in four batches.');
