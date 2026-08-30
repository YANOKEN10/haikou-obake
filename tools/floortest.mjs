import assert from "node:assert/strict";
import { nearOnFloor } from "../src/util.js";

assert.equal(nearOnFloor(5, 5, 3.6, 5.8, 5.8, 3.6, 1.6), true, "同じ2階で近ければ近すぎる");
assert.equal(nearOnFloor(5, 5, 3.6, 5, 5, 0, 1.6), false, "真下の1階は近すぎない");
assert.equal(nearOnFloor(5, 5, 3.6, 5, 5, 7.2, 3.4), false, "真上の3階は回収できない");
assert.equal(nearOnFloor(5, 5, 7.2, 6, 5, 7.2, 3.4), true, "同じ3階の近い仕掛けは回収できる");
assert.equal(nearOnFloor(5, 5, 0, 9, 5, 0, 3.4), false, "同じ階でも遠ければ回収できない");
assert.equal(nearOnFloor(5, 5, undefined, 5, 5, 0, 1.6), true, "古いセーブは1階として扱う");

console.log("floor-aware placement test: 6 cases passed");
