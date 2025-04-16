"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathIsNetworkDrive = pathIsNetworkDrive;
exports.matchNetworkDriveRoot = matchNetworkDriveRoot;
exports.matchNetworkDrive02 = matchNetworkDrive02;
function pathIsNetworkDrive(input) {
    return /^\\\\[^/\\]/.test(input);
}
function matchNetworkDriveRoot(input) {
    return input.match(/^\\\\([^\\/]+)[\\/]?$/);
}
function matchNetworkDrive02(input) {
    return input.match(/^\\\\([^\\/]+)[\\/]([^\\/]+)[\\/]?$/);
}
exports.default = pathIsNetworkDrive;
//# sourceMappingURL=index.js.map