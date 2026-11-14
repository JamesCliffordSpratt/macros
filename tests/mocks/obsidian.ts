/**
 * Mock for the `obsidian` package (type-definitions only, no runtime JS).
 * Provides the minimal surface used by DataManager and related modules.
 */

export class TFile {
  path: string;
  name: string;
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() ?? path;
  }
}

export class TFolder {
  path: string;
  constructor(path: string) {
    this.path = path;
  }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

export class App {
  vault = {
    create: jest.fn(),
    getFolderByPath: jest.fn().mockReturnValue(undefined),
    adapter: {
      read: jest.fn(),
      write: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
      mkdir: jest.fn().mockResolvedValue(undefined),
    },
  } as never;
  metadataCache = {
    getFileCache: jest.fn().mockReturnValue(null),
    cachedMetadata: new Map(),
  } as never;
}

export class Plugin {
  app = new App() as never;
  settings = {} as never;
  registerDomListener = jest.fn();
  registerEvent = jest.fn();
  registerInterval = jest.fn();
  registerTimeout = jest.fn();
  addCommand = jest.fn();
  addSettingTab = jest.fn();
  async onload() {}
  onunload() {}
}

export const normalize = normalizePath;

export default {
  App,
  TFile,
  TFolder,
  normalizePath,
  Plugin,
};
