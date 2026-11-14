/**
 * Mock for the `obsidian` package (type-definitions only, no runtime JS).
 * Provides the minimal surface used by DataManager and related modules.
 */

class TFile {
  constructor(path) {
    this.path = path;
    this.name = path.split('/').pop() ?? path;
  }
}

class TFolder {
  constructor(path) {
    this.path = path;
  }
}

function normalizePath(path) {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

class App {
  constructor() {
    this.vault = {
      create: jest.fn(),
      getFolderByPath: jest.fn().mockReturnValue(undefined),
      adapter: {
        read: jest.fn(),
        write: jest.fn(),
        exists: jest.fn().mockResolvedValue(false),
        mkdir: jest.fn().mockResolvedValue(undefined),
      },
    };
    this.metadataCache = {
      getFileCache: jest.fn().mockReturnValue(null),
      cachedMetadata: new Map(),
    };
  }
}

class Plugin {
  constructor() {
    this.app = new App();
    this.settings = {};
  }
  registerDomListener() {}
  registerEvent() {}
  registerInterval() {}
  registerTimeout() {}
  addCommand() {}
  addSettingTab() {}
  async onload() {}
  onunload() {}
}

module.exports = {
  App,
  TFile,
  TFolder,
  normalizePath,
  Plugin,
  default: { App, TFile, TFolder, normalizePath, Plugin },
};
