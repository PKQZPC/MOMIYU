// Run only the reviewed, dependency-free animation module from the ignored cache.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
const out=path.join(root,'tools/m0/.local/pet-reuse');
const lock=JSON.parse(fs.readFileSync(path.join(root,'third-party/m0-pet-sources.lock.json'),'utf8'));
const source=lock.sources.find(s=>s.repository==='https://github.com/coglabss/deskcat');
const entry=source.files.find(f=>f.path==='src/renderer/animation-player.js');
const file=path.join(out,'deskcat',entry.path);
if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==entry.sha256)throw new Error('Unreviewed animation module.');
const {AnimationPlayer}=require(file);
const checks=[];
const player=new AnimationPlayer({'skill:synthetic-alpha':{frames:4,fps:8,loop:false},idle:{frames:3,fps:4,loop:true}});
player.play('skill:synthetic-alpha');player.update(.125);
checks.push({name:'arbitrary skill clip name and frame advance',passed:player.currentFrame()===1});
player.play('idle');player.update(1);
checks.push({name:'looping clips',passed:player.currentFrame()===1&&!player.isDone()});
player.play('skill:synthetic-alpha');player.update(.375);
checks.push({name:'full final-frame duration in unmodified upstream',passed:!player.isDone(),observed_done:player.isDone()});
// Isolated adaptation: last frame still has to remain visible for its interval.
class FullDurationPlayer extends AnimationPlayer {
  isDone(){const clip=this.clips[this.name];return !!clip&&!clip.loop&&this.elapsed>=clip.frames/clip.fps;}
}
const fixed=new FullDurationPlayer({'skill:synthetic-alpha':{frames:4,fps:8,loop:false}});
fixed.play('skill:synthetic-alpha');fixed.update(.375);
const holds=!fixed.isDone();fixed.update(.125);
checks.push({name:'adapted completion holds final frame and completes at clip duration',passed:holds&&fixed.isDone()});
const report={schema_version:'0.1.0',synthetic_only:true,status:'limited',source_commit:source.commit,checks,
  limits:['One reviewed animation module only; not a runnable integration of upstream app.',
    'Known upstream completion defect remains in cache; the isolated adaptation does not modify upstream.',
    'No original character artwork/audio or mood/affection rules imported.']};
fs.writeFileSync(path.join(out,'player-probe.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(!checks[0].passed||!checks[1].passed||checks[2].passed||!checks[3].passed)process.exitCode=1;
