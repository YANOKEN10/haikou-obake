import assert from 'node:assert/strict';
const base='https://haikou-obake-daisakusen.vercel.app',accounts=[];let trade;
async function call(path,account,body,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(account?{Authorization:'Bearer '+account.token}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
try{
 for(let i=0;i<2;i++){const id='確認'+Math.random().toString(36).slice(2,10),pw='test-'+crypto.randomUUID();const d=await call('/api/auth',null,{action:'signup',id,pw});accounts.push({id:d.user.id,token:d.token,pw});}
 const [a,b]=accounts,oldA={v:1,profile:{name:a.id,inv:{hokori:8,chalk:1}}},oldB={v:1,profile:{name:b.id,inv:{hokori:1,chalk:7}}};
 await call('/api/save',a,{payload:oldA});await call('/api/save',b,{payload:oldB});await call('/api/friends',a,{action:'request',id:b.id});await call('/api/friends',b,{action:'accept',id:a.id});
 const offered=await call('/api/friends',a,{action:'tradeCreate',id:b.id,giveKind:'hokori',giveN:3,wantKind:'chalk',wantN:2});trade=offered.tradesOut[0].id;
 const accepted=await call('/api/friends',b,{action:'tradeAccept',tradeId:trade});trade=null;assert.equal(accepted.tradeLedger.hokori,3);
 await call('/api/save',a,{payload:oldA});await call('/api/save',b,{payload:oldB});
 const aa=await call('/api/save',a),bb=await call('/api/save',b);assert.deepEqual(aa.payload.profile.inv,{hokori:5,chalk:3});assert.deepEqual(bb.payload.profile.inv,{hokori:4,chalk:5});console.log('公開API: テスト用2アカウントの交換・旧セーブ・再読み込み後の素材数 成功');
}finally{
 if(trade&&accounts[0])await call('/api/friends',accounts[0],{action:'tradeCancel',tradeId:trade}).catch(()=>{});
 for(const a of accounts)await call('/api/save',a,{pw:a.pw},'DELETE');
}
