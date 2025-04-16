"use strict";
/**
 * Created by user on 2020/6/9.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports._strip_sep = void 0;
exports._replace_sep = _replace_sep;
exports.getStatic = getStatic;
exports.defaults = defaults;
const path_is_network_drive_1 = require("path-is-network-drive");
const path_strip_sep_1 = require("path-strip-sep");
Object.defineProperty(exports, "_strip_sep", { enumerable: true, get: function () { return path_strip_sep_1.pathStripSep; } });
function _replace_sep(who, input) {
    let sep = who.sep;
    if (who.name !== 'posix' && (0, path_is_network_drive_1.pathIsNetworkDrive)(input)) {
        sep = '\\';
        input = sep + sep + input
            .slice(2)
            .replace(/[/\\]/g, sep);
    }
    else {
        input = input
            .replace(/[/\\]/g, sep);
    }
    //	if (/^\w:[/\\]$/.test(input))
    //	{
    //		return input
    //	}
    return input;
}
function getStatic(who) {
    return who.__proto__.constructor;
}
function defaults(destination, ...input) {
    destination = destination || {};
    input.forEach(defaults => {
        for (const key in defaults) {
            if (defaults.hasOwnProperty(key) && !destination.hasOwnProperty(key)) {
                destination[key] = defaults[key];
            }
        }
    });
    return destination;
}
//# sourceMappingURL=util.js.map