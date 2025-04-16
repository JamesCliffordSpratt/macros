"use strict";
/**
 * Created by user on 2017/12/10/010.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.vaildNameEntry = vaildNameEntry;
exports.filterNameEntry = filterNameEntry;
const core_1 = require("../core");
let r_vaild = /[\\\?\/\!'"\:\<\>\*\|]+/g;
function vaildNameEntry(name) {
    return r_vaild.test(name.toString()) ? void 0 : name;
}
function filterNameEntry(name) {
    return name.toString().replace(r_vaild, '');
}
core_1.fn.vaildNameEntry = vaildNameEntry;
core_1.fn.filterNameEntry = filterNameEntry;
// @ts-ignore
//console.log(upath.vaildNameEntry('a/b.test'), upath.filterNameEntry('a/b.test'));
//# sourceMappingURL=fs.js.map