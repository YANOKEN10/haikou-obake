import assert from 'node:assert/strict';
import {fixture} from './battletest.mjs';
const API=process.argv[2]||'https://haikou-obake-daisakusen.vercel.app/api/room';
const call=async body=>{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
// 実際の部屋APIで4人の得点・結果・再戦を確認する。テスト部屋は必ず閉じる。
const players=[];let code;
try{
 const first=await call({action:'create',name:'確認テスト1'});code=first.code;players.push(first.pid);
 for(let i=2;i<=4;i++){const r=await call({action:'join',code,name:'確認テスト'+i});players.push(r.pid);}
 const all=players.map((pid,i)=>fixture(pid,i===0)),host=all[0];host.g.net.peers=new Map(players.slice(1).map(pid=>[pid,{name:pid}]));host.b.start(1);host.b.update(3);
 const sync=async(i,extra={})=>call({action:'sync',code,pid:players[i],g:{x:0,y:1,z:0,h:i===0?1:0,bt:i===0?host.b.netState():undefined},...extra});
 await sync(0);
 for(let i=1;i<4;i++){const r=await sync(i);all[i].b.applyRemote(r.room.others.find(p=>p.pid===players[0]).g.bt);assert.equal(all[i].b.phase,'play');}
 for(let i=1;i<4;i++)await sync(i,{acts:[{i:1,k:'scare',hid:i,a:100,w:'direct',b:host.b.id}]});
 const r=await sync(0);assert.equal(r.room.acts.length,3);
 for(const a of r.room.acts){assert.equal(a.b,host.b.id);assert(players.slice(1).includes(a.q));const h={hid:a.hid,fear:100,maxFear:100,out:false};host.b.claim(h,a.q,100,false,a.b);h.out=true;host.b.countEscape(h);}
 assert.deepEqual(Object.values(host.b.scores),[0,1,1,1]);host.b.update(60);await sync(0);
 for(let i=1;i<4;i++){const r=await sync(i);all[i].b.applyRemote(r.room.others.find(p=>p.pid===players[0]).g.bt);assert.equal(all[i].b.phase,'over');assert.deepEqual(all[i].b.scores,host.b.scores);assert.equal(all[i].calls.results,1);}
 host.b.start(3);await sync(0);for(let i=1;i<4;i++){const r=await sync(i);all[i].b.applyRemote(r.room.others.find(p=>p.pid===players[0]).g.bt);assert.equal(all[i].b.phase,'count');assert.equal(all[i].b.score,0);}
 console.log('公開API: 4人参加・送り主/試合ID・追い出し得点・全員同じ最終順位・再戦 成功');
}finally{for(const pid of [...players].reverse())await call({action:'leave',code,pid});}
