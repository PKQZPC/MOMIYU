const dayMinutes=24*60;
const minuteOfDay=date=>date.getHours()*60+date.getMinutes();
const distance=(value,reference)=>(value-reference+dayMinutes*1.5)%dayMinutes-dayMinutes/2;
function median(values){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];}
function timeString(minutes){const value=(minutes+dayMinutes)%dayMinutes;return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
class RestRoutine{
  constructor(store){
    this.store=store;
    this.data=JSON.parse(store.db.prepare("SELECT value FROM meta WHERE key='rest_routine'").get()?.value||'{"periods":[]}');
    this.available=true;
  }
  observe(now,available){
    if(available===this.available)return;
    this.available=available;
    if(!available){this.unavailableAt=now;return;}
    const start=this.unavailableAt;this.unavailableAt=null;
    if(!start)return;
    const hours=(now-start)/3600000;
    if(hours<2||hours>14)return;
    const cutoff=now.getTime()-14*86400000;
    this.data.periods=this.data.periods.filter(p=>p.endedAt>=cutoff);
    this.data.periods.push({startedAt:start.getTime(),endedAt:now.getTime(),start:minuteOfDay(start),end:minuteOfDay(now)});
    this.data.periods=this.data.periods.slice(-28);
    // At most one representative long break per local day.
    const days=new Map();
    for(const period of this.data.periods){
      const date=new Date(period.startedAt).toDateString(),prior=days.get(date);
      if(!prior||period.endedAt-period.startedAt>prior.endedAt-prior.startedAt)days.set(date,period);
    }
    const periods=[...days.values()];
    if(periods.length>=3){
      const latest=periods.at(-1);
      const pick=key=>(latest[key]+median(periods.map(p=>distance(p[key],latest[key])))+dayMinutes)%dayMinutes;
      this.data.learned={start:timeString(pick('start')),end:timeString(pick('end')),days:periods.length,updatedAt:now.toISOString()};
    }
    this.store.db.prepare("INSERT OR REPLACE INTO meta VALUES('rest_routine',?)").run(JSON.stringify(this.data));
  }
  schedule(settings,now=new Date()){
    const learned=settings.adaptiveNapEnabled&&this.data.learned&&now.getTime()-Date.parse(this.data.learned.updatedAt)<14*86400000&&this.data.learned;
    return learned?{...learned,source:'routine'}:{start:settings.autoNapStart,end:settings.autoNapEnd,source:settings.adaptiveNapEnabled?'default':'manual'};
  }
}
module.exports={RestRoutine};
