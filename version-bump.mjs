import { readFileSync, writeFileSync } from 'fs';

// Runs from the npm "version" lifecycle script (`npm version patch|minor|major`),
// after package.json has been bumped and before the version commit + tag.
const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  console.error('version-bump.mjs must be run via `npm version` (npm_package_version is not set).');
  process.exit(1);
}

// Keep each file's existing indentation so the version commit stays minimal.
function writeJson(path, data, original) {
  const indent = original.match(/^[ \t]+(?=")/m)?.[0] ?? '\t';
  writeFileSync(path, JSON.stringify(data, null, indent) + (original.endsWith('\n') ? '\n' : ''));
}

// read minAppVersion from manifest.json and bump version to target version
const manifestRaw = readFileSync('manifest.json', 'utf8');
const manifest = JSON.parse(manifestRaw);
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeJson('manifest.json', manifest, manifestRaw);

// update versions.json with target version and minAppVersion from manifest.json
const versionsRaw = readFileSync('versions.json', 'utf8');
const versions = JSON.parse(versionsRaw);
versions[targetVersion] = minAppVersion;
writeJson('versions.json', versions, versionsRaw);

console.log(`Bumped manifest.json and versions.json to ${targetVersion} (minAppVersion ${minAppVersion})`);
