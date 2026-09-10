import assert from 'node:assert/strict';
import {Battle} from '../src/battle.js';
import {Net} from '../src/net.js';
export function fixture(pid,host=false){
 const calls={results:0,saves:0};const noop=()=>{};
 const g={net:{on:true,isHost:host,pid,name:pid,peers:new Map()},inv:{},shards:{},setPaused:noop,saveNow:()=>calls.saves++,audio:{rankUp:noop,tone:noop},ui:{closeRoom:noop,closeCraft:noop,hideResult:noop,setBattle:noop,showCount:noop,toast:noop,setBag:noop,setShards:noop,showResult:()=>calls.results++}};
 g.battle=new Battle(g);return {g,b:g.battle,calls};
}
export function run(){
 const all=['a','b','c','d'].map((id,i)=>fixture(id,i===0));const {g,b}=all[0];g.net.peers=new Map(all.slice(1).map(f=>[f.g.net.pid,{name:f.g.net.pid}]));
 assert.equal(b.start(2),false);assert.equal(all[1].b.start(1),false);assert.equal(b.start(1),true);assert.equal(b.start(1),false);
 let state=b.netState();for(const f of all.slice(1))f.b.applyRemote(state);
 b.update(3);assert.equal(b.phase,'play');assert.equal(b.left,60);
 const h={hid:1,maxFear:100,fear:50,out:false};b.claim(h,'b',50,false);h.out=true;b.countEscape(h);assert.equal(b.score,0);assert.equal(b.scores.b,0);
 h.out=false;h.fear=100;b.claim(h,'b',50,false);b.claim(h,'c',20,true);b.countEscape(h);assert.equal(b.scores.b,0);h.out=true;b.countEscape(h);b.countEscape(h);assert.equal(b.scores.b,1);
 const exit=(id,pid,match=b.id)=>{const h={hid:id,maxFear:100,fear:100,out:false};b.claim(h,pid,100,false,match);h.out=true;b.countEscape(h);};
 exit(2,'a');exit(3,'b');exit(4,'c');exit(5,'d','old');assert.deepEqual(b.scores,{a:1,b:2,c:1,d:0});
 g.net.peers.delete('c');b.update(60);assert.equal(b.phase,'over');exit(6,'a');assert.equal(b.scores.a,1);
 const final=b.netState();for(const f of all.slice(1)){f.b.applyRemote(final);f.b.applyRemote(b.netState());assert.equal(f.calls.results,1);assert.equal(f.calls.saves,1);assert.deepEqual(f.b.rows().map(({pid,score,place})=>({pid,score,place})),b.rows().map(({pid,score,place})=>({pid,score,place})));}
 assert.deepEqual(b.rows().map(r=>r.place),[1,2,2,4]);assert.equal(all[0].calls.results,1);
 const spectator=fixture('extra');spectator.b.applyRemote(final);assert.equal(spectator.calls.results,0);
 assert.equal(b.start(3),true);const next=b.netState();for(const f of all.slice(1)){f.b.applyRemote(next);assert.equal(f.b.score,0);assert.equal(f.b.phase,'count');f.b.applyRemote(final);assert.equal(f.b.id,next.id);}
 const late=fixture('b');late.b.applyRemote(next);late.b.applyRemote(final);assert.equal(late.b.id,next.id);
 b.update(184);assert.equal(b.phase,'over');assert.equal(all[0].calls.results,2);
 b.start(1);g.net.on=false;b.update(1);assert.equal(b.phase,'off');
 const n=new Net();n.on=true;n.isHost=true;n.reportScare(1,40,'direct','round');assert.deepEqual(n.takeActs(),[]);
 n.peers.set('guest',{name:'guest',x:0,y:0,z:0,yaw:0});n.takeDirect('guest',{q:1,g:{x:0,y:0,z:0},acts:[{i:1,k:'scare',hid:1,a:40,b:'round',q:'forged'}]});const acts=n.takeActs();assert.equal(acts[0].q,'guest');assert.equal(acts[0].b,'round');n.takeDirect('guest',{q:2,g:{x:0,y:0,z:0},acts:[{i:1,k:'scare',hid:1,a:40,b:'round'}]});assert.equal(n.takeActs().length,0);
 console.log('追い出しバトル: 得点・4人順位・重複・時間切れ・再戦・途中参加・通信の確認 成功');
}
if(process.argv[1]?.endsWith('battletest.mjs'))run();
