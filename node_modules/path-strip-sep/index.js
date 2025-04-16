"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathStripSep = pathStripSep;
function pathStripSep(input) {
    return input
        .replace(/([^/\\:])[/\\]+$/, '$1')
        .replace(/(^[/\\])[/\\]{2,}$/, '$1');
}
exports.default = pathStripSep;
//# sourceMappingURL=index.js.map