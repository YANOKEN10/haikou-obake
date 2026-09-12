// 交換による増減を累積して、交換前の端末の保存からも差分を復元する。
function change(user,kind,delta){
 const p=user.payload.profile;
 p.inv[kind]=Math.max(0,(p.inv[kind]||0)+delta);
 user.tradeLedger=user.tradeLedger||{};
 user.tradeLedger[kind]=(user.tradeLedger[kind]||0)+delta;
 user.tradeVersion=(user.tradeVersion||0)+1;
 p.tradeVersion=user.tradeVersion;p.tradeLedger={...user.tradeLedger};
}
function merge(user,payload){
 const p=payload.profile;
 if(!p)return payload;
 const ledger=user.tradeLedger||{},seen=p.tradeLedger||{};
 p.inv=p.inv||{};
 for(const kind of Object.keys(ledger))p.inv[kind]=Math.max(0,(Number(p.inv[kind])||0)+ledger[kind]-(Number(seen[kind])||0));
 p.tradeVersion=user.tradeVersion||0;p.tradeLedger={...ledger};return payload;
}
module.exports={change,merge};
