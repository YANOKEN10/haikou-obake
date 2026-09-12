const assert=require('node:assert/strict');
const I=require('../api/_inventory');
const a={payload:{profile:{inv:{hokori:8,chalk:1}}}},b={payload:{profile:{inv:{hokori:1,chalk:7}}}};
const staleA=structuredClone(a.payload),staleB=structuredClone(b.payload);
I.change(a,'hokori',-3);I.change(b,'chalk',-2);I.change(b,'hokori',3);I.change(a,'chalk',2);
assert.deepEqual(a.payload.profile.inv,{hokori:5,chalk:3});assert.deepEqual(b.payload.profile.inv,{hokori:4,chalk:5});
// 交換前のセーブが後から届いても、交換結果は消えない。
a.payload=I.merge(a,staleA);b.payload=I.merge(b,staleB);
assert.deepEqual(a.payload.profile.inv,{hokori:5,chalk:3});assert.deepEqual(b.payload.profile.inv,{hokori:4,chalk:5});
// 確認済みのセーブを繰り返しても二重加算しない。新しく拾った材料は保つ。
b.payload.profile.inv.hokori+=6;b.payload=I.merge(b,structuredClone(b.payload));b.payload=I.merge(b,structuredClone(b.payload));assert.equal(b.payload.profile.inv.hokori,10);
I.change(a,'hokori',-2);I.change(a,'hokori',2);assert.equal(a.payload.profile.inv.hokori,5);
console.log('交換在庫: 双方の増減・古い保存・重複保存・プレイ中の獲得・返却 成功');
