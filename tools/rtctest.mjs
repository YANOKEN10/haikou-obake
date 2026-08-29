import assert from "node:assert/strict";
import { Net } from "../src/net.js";
import { Rtc } from "../src/rtc.js";

let passed = 0;
function ok(name) { passed++; console.log("✓ " + name); }

// 順番を待たない DataChannel では、2番のあとに1番が来ることがある。
// 古い位置を当てて、おばけや人間がうしろへ戻らないことを確かめる。
const net = new Net();
net.peers.set("mate", {
  name: "ともだち", x: 0, y: 1, z: 0, yaw: 0,
  tx: 0, ty: 1, tz: 0, tyaw: 0, vx: 0, vy: 0, vz: 0,
  placed: [], got: [],
});
net.takeDirect("mate", { q: 2, g: { x: 20, y: 1, z: 3, yaw: 1, vx: 2, vz: 0 } });
net.takeDirect("mate", { q: 1, g: { x: 4, y: 1, z: 3, yaw: 1, vx: 2, vz: 0 } });
assert.equal(net.peers.get("mate").tx, 20);
assert.equal(net.peers.get("mate").directSeq, 2);
ok("遅れて来た古い位置を捨てる");

// 以前の版（番号なし）から来たデータは、互換性のため受け取る。
net.takeDirect("mate", { g: { x: 21, y: 1, z: 3, yaw: 1, vx: 2, vz: 0 } });
assert.equal(net.peers.get("mate").tx, 21);
ok("番号がない以前の版とも遊べる");

// 送信待ちが積み上がった相手には古い画面を追加せず、空いている相手には送る。
const rtc = new Rtc({ pid: "me", sigOut: [] });
let sent = 0;
const channel = (bufferedAmount) => ({
  readyState: "open", bufferedAmount,
  send() { sent++; }, close() {},
});
const pc = { signalingState: "stable", iceConnectionState: "connected", close() {} };
rtc.links.set("slow", { ready: true, ch: channel(128 * 1024), pc, born: Date.now() });
rtc.links.set("fast", { ready: true, ch: channel(0), pc, born: Date.now() });
rtc.lastSend = -1000;
rtc.send({ q: 1, g: { x: 1 } });
assert.equal(sent, 1);
ok("送信が詰まった相手には古い画面をためない");

console.log(`WebRTC 回帰テスト: ${passed}件 成功`);
