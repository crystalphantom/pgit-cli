import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'fs-extra';
import { BaseError } from '../errors/base.error';

const execFileAsync = promisify(execFile);

export class PrivateConfigSyncError extends BaseError {
  public readonly code = 'PRIVATE_CONFIG_SYNC_ERROR';
  public readonly recoverable = true;
}

export class PrivateConfigConflictError extends BaseError {
  public readonly code = 'PRIVATE_CONFIG_CONFLICT';
  public readonly recoverable = true;
}

export type PrivateConfigEntryType = 'file' | 'directory';
export type PrivateConfigSyncDirection = 'pull' | 'push';
export type PrivateConfigEntryState =
  | 'up-to-date'
  | 'modified-locally'
  | 'modified-private'
  | 'missing-repo'
  | 'missing-private';

export interface PrivateConfigEntry {
  repoPath: string;
  type: PrivateConfigEntryType;
  privatePath: string;
  lastSyncedHash?: string;
  files?: Record<string, string>;
}

export interface PrivateConfigManifest {
  version: string;
  projectId: string;
  identityHash: string;
  repoName: string;
  identitySource: string;
  createdAt: string;
  updatedAt: string;
  entries: PrivateConfigEntry[];
}

export interface PrivateConfigStatusEntry {
  repoPath: string;
  type: PrivateConfigEntryType;
  state: PrivateConfigEntryState;
}

export interface PrivateConfigProjectInfo {
  projectId: string;
  projectDir: string;
  manifestPath: string;
  privateRoot: string;
}

interface PrivateConfigCheckoutState {
  checkoutId: string;
  worktreePath: string;
  updatedAt: string;
  entries: Record<string, Record<string, string>>;
}

export interface PrivateConfigSyncOptions {
  force?: boolean;
}

export interface PrivateConfigSyncResult {
  projectId: string;
  entries: PrivateConfigStatusEntry[];
  backups: string[];
}

export interface PrivateConfigAddResult {
  projectId: string;
  entries: PrivateConfigEntry[];
  untrackedPaths: string[];
  untrackedFromMainGit: string[];
  commitHash?: string;
}

export interface PrivateConfigRemoveResult {
  projectId: string;
  entries: PrivateConfigEntry[];
  removedPrivatePaths: string[];
}

export interface PrivateConfigAddOptions {
  noCommit?: boolean;
}

interface PrivateConfigAddCandidate {
  repoPath: string;
  absoluteRepoPath: string;
  type: PrivateConfigEntryType;
}

interface GitIdentity {
  repoName: string;
  identitySource: string;
  hashBase: string;
}

export class PrivateConfigSyncManager {
  private readonly workingDir: string;
  private readonly homeDir: string;
  private readonly baseDir: string;

  constructor(workingDir: string = process.cwd(), homeDir: string = os.homedir()) {
    this.workingDir = path.resolve(workingDir);
    this.homeDir = homeDir;
    this.baseDir = path.join(this.homeDir, '.pgit', 'private-config');
  }

  public async getProjectInfo(): Promise<PrivateConfigProjectInfo> {
    const manifest = await this.loadOrCreateManifest();
    const projectDir = path.join(this.baseDir, manifest.projectId);

    return {
      projectId: manifest.projectId,
      projectDir,
      manifestPath: path.join(projectDir, 'manifest.json'),
      privateRoot: path.join(projectDir, 'files'),
    };
  }

  public async add(
    repoPathInput: string | string[],
    options: PrivateConfigAddOptions = {},
  ): Promise<PrivateConfigAddResult> {
    const candidates = await this.validateAddCandidates(repoPathInput);
    const manifest = await this.loadOrCreateManifest();
    const entries: PrivateConfigEntry[] = [];
    const untrackedFromMainGit: string[] = [];

    for (const candidate of candidates) {
      const privatePath = this.getPrivatePath(manifest.projectId, candidate.repoPath);

      await fs.ensureDir(path.dirname(privatePath));
      await fs.copy(candidate.absoluteRepoPath, privatePath, {
        overwrite: true,
        errorOnExist: false,
      });

      const removedPaths = await this.removeTrackedPathsFromMainGit(candidate.repoPath);
      untrackedFromMainGit.push(...removedPaths);

      const entry = await this.buildEntry(manifest.projectId, candidate.repoPath, candidate.type);
      const existingIndex = manifest.entries.findIndex(
        item => item.repoPath === candidate.repoPath,
      );

      if (existingIndex >= 0) {
        manifest.entries[existingIndex] = entry;
      } else {
        manifest.entries.push(entry);
        manifest.entries.sort((left, right) => left.repoPath.localeCompare(right.repoPath));
      }
      entries.push(entry);
    }

    await this.saveManifest(manifest);
    await this.saveCheckoutState(manifest);
    await this.installHooks();

    let commitHash: string | undefined;
    if (untrackedFromMainGit.length > 0 && !options.noCommit) {
      commitHash = await this.commitMainGitRemoval([...new Set(untrackedFromMainGit)]);
    }

    return {
      projectId: manifest.projectId,
      entries,
      untrackedPaths: candidates.map(candidate => candidate.repoPath),
      untrackedFromMainGit: [...new Set(untrackedFromMainGit)],
      commitHash,
    };
  }

  public async remove(repoPathInput: string | string[]): Promise<PrivateConfigRemoveResult> {
    const manifest = await this.loadManifest();
    const repoPaths = this.normalizeRepoPathInputs(repoPathInput);
    const entries = repoPaths
      .map(repoPath => manifest.entries.find(entry => entry.repoPath === repoPath))
      .filter((entry): entry is PrivateConfigEntry => Boolean(entry));
    const missing = repoPaths.filter(
      repoPath => !entries.some(entry => entry.repoPath === repoPath),
    );

    if (missing.length > 0) {
      throw new PrivateConfigSyncError(`Private config path is not tracked: ${missing.join(', ')}`);
    }

    manifest.entries = manifest.entries.filter(entry => !repoPaths.includes(entry.repoPath));
    for (const entry of entries) {
      await fs.remove(entry.privatePath);
    }

    await this.saveManifest(manifest);
    await this.saveCheckoutState(manifest);
    await this.installHooks();

    return {
      projectId: manifest.projectId,
      entries,
      removedPrivatePaths: entries.map(entry => entry.privatePath),
    };
  }

  public async syncPull(options: PrivateConfigSyncOptions = {}): Promise<PrivateConfigSyncResult> {
    return this.sync('pull', options);
  }

  public async syncPush(options: PrivateConfigSyncOptions = {}): Promise<PrivateConfigSyncResult> {
    return this.sync('push', options);
  }

  public async getStatus(): Promise<PrivateConfigStatusEntry[]> {
    const manifest = await this.loadManifest();

    return Promise.all(
      manifest.entries.map(async entry => {
        const repoPath = path.join(this.workingDir, entry.repoPath);
        const privatePath = entry.privatePath;
        const repoExists = await fs.pathExists(repoPath);
        const privateExists = await fs.pathExists(privatePath);

        if (!repoExists) {
          return { repoPath: entry.repoPath, type: entry.type, state: 'missing-repo' };
        }
        if (!privateExists) {
          return { repoPath: entry.repoPath, type: entry.type, state: 'missing-private' };
        }

        const repoHashes = await this.hashPath(repoPath, entry.type);
        const privateHashes = await this.hashPath(privatePath, entry.type);
        const syncedHashes = this.entryHashes(entry);

        const repoChanged = !this.hashesEqual(repoHashes, syncedHashes);
        const privateChanged = !this.hashesEqual(privateHashes, syncedHashes);

        if (repoChanged) {
          return { repoPath: entry.repoPath, type: entry.type, state: 'modified-locally' };
        }
        if (privateChanged) {
          return { repoPath: entry.repoPath, type: entry.type, state: 'modified-private' };
        }
        return { repoPath: entry.repoPath, type: entry.type, state: 'up-to-date' };
      }),
    );
  }

  public async installHooks(): Promise<void> {
    const manifest = await this.loadOrCreateManifest();
    const hooksDir = await this.getHooksDir();
    await fs.ensureDir(hooksDir);

    await fs.writeFile(path.join(hooksDir, 'pre-commit'), this.preCommitHook(manifest.projectId), {
      encoding: 'utf8',
      mode: 0o755,
    });
    await fs.writeFile(path.join(hooksDir, 'pre-push'), this.prePushHook(manifest.projectId), {
      encoding: 'utf8',
      mode: 0o755,
    });
    await fs.chmod(path.join(hooksDir, 'pre-commit'), 0o755);
    await fs.chmod(path.join(hooksDir, 'pre-push'), 0o755);
  }

  private async sync(
    direction: PrivateConfigSyncDirection,
    options: PrivateConfigSyncOptions,
  ): Promise<PrivateConfigSyncResult> {
    const manifest = await this.loadManifest();
    const backups: string[] = [];
    const statuses: PrivateConfigStatusEntry[] = [];

    for (const entry of manifest.entries) {
      const repoPath = path.join(this.workingDir, entry.repoPath);
      const privatePath = entry.privatePath;
      const source = direction === 'pull' ? privatePath : repoPath;
      const target = direction === 'pull' ? repoPath : privatePath;

      if (!(await fs.pathExists(source))) {
        throw new PrivateConfigSyncError(`Sync source missing for ${entry.repoPath}: ${source}`);
      }

      const targetChanged = await this.hasChangedSinceLastSync(target, entry);
      if (targetChanged && !options.force) {
        throw new PrivateConfigConflictError(
          `Sync conflict for ${entry.repoPath}. Use --force to overwrite ${direction === 'pull' ? 'repo-local' : 'private-store'} copy.`,
        );
      }

      if (targetChanged && options.force && (await fs.pathExists(target))) {
        backups.push(await this.backupPath(manifest.projectId, direction, entry.repoPath, target));
      }

      await fs.ensureDir(path.dirname(target));
      await fs.copy(source, target, { overwrite: true, errorOnExist: false });

      const updatedEntry = await this.buildEntry(manifest.projectId, entry.repoPath, entry.type);
      Object.assign(entry, updatedEntry);
      statuses.push({ repoPath: entry.repoPath, type: entry.type, state: 'up-to-date' });
    }

    await this.saveManifest(manifest);
    await this.saveCheckoutState(manifest);
    await this.installHooks();
    await this.pruneBackups(manifest.projectId, 20);

    return {
      projectId: manifest.projectId,
      entries: statuses,
      backups,
    };
  }

  private async loadManifest(): Promise<PrivateConfigManifest> {
    const info = await this.resolveProjectManifestPath();

    if (!(await fs.pathExists(info.manifestPath))) {
      throw new PrivateConfigSyncError(
        'Private config not initialized. Run pgit config add <path> first.',
      );
    }

    return (await fs.readJson(info.manifestPath)) as PrivateConfigManifest;
  }

  private async loadOrCreateManifest(): Promise<PrivateConfigManifest> {
    const identity = await this.getGitIdentity();
    const projectId = await this.resolveProjectId(identity);
    const projectDir = path.join(this.baseDir, projectId);
    const manifestPath = path.join(projectDir, 'manifest.json');

    if (await fs.pathExists(manifestPath)) {
      return (await fs.readJson(manifestPath)) as PrivateConfigManifest;
    }

    const now = new Date().toISOString();
    const manifest: PrivateConfigManifest = {
      version: '1.0.0',
      projectId,
      identityHash: this.identityHash(identity.hashBase),
      repoName: identity.repoName,
      identitySource: identity.identitySource,
      createdAt: now,
      updatedAt: now,
      entries: [],
    };

    await fs.ensureDir(path.join(projectDir, 'files'));
    await this.saveManifest(manifest);
    return manifest;
  }

  private async saveManifest(manifest: PrivateConfigManifest): Promise<void> {
    manifest.updatedAt = new Date().toISOString();
    const projectDir = path.join(this.baseDir, manifest.projectId);
    await fs.ensureDir(projectDir);
    await fs.writeJson(path.join(projectDir, 'manifest.json'), manifest, { spaces: 2 });
  }

  private async saveCheckoutState(manifest: PrivateConfigManifest): Promise<void> {
    const checkoutId = this.checkoutId();
    const state: PrivateConfigCheckoutState = {
      checkoutId,
      worktreePath: this.workingDir,
      updatedAt: new Date().toISOString(),
      entries: Object.fromEntries(
        manifest.entries.map(entry => [entry.repoPath, this.entryHashes(entry)]),
      ),
    };

    const checkoutsDir = path.join(this.baseDir, manifest.projectId, 'checkouts');
    await fs.ensureDir(checkoutsDir);
    await fs.writeJson(path.join(checkoutsDir, `${checkoutId}.json`), state, { spaces: 2 });
  }

  private checkoutId(): string {
    return crypto.createHash('sha256').update(this.workingDir).digest('hex').slice(0, 12);
  }

  private async resolveProjectManifestPath(): Promise<{ projectId: string; manifestPath: string }> {
    const identity = await this.getGitIdentity();
    const projectId = await this.resolveProjectId(identity);
    return {
      projectId,
      manifestPath: path.join(this.baseDir, projectId, 'manifest.json'),
    };
  }

  private async resolveProjectId(identity: GitIdentity): Promise<string> {
    const identityHash = this.identityHash(identity.hashBase);
    await fs.ensureDir(this.baseDir);
    const dirs = await fs.readdir(this.baseDir).catch(() => [] as string[]);
    const existing = dirs.find(name => name.endsWith(`-${identityHash}`));

    if (existing) {
      return existing;
    }

    return `${this.safeSegment(identity.repoName)}-${identityHash}`;
  }

  private async getGitIdentity(): Promise<GitIdentity> {
    const repoRoot = await this.gitOutput(['rev-parse', '--show-toplevel']).catch(
      () => this.workingDir,
    );
    const commonDirRaw = await this.gitOutput(['rev-parse', '--git-common-dir']).catch(
      () => '.git',
    );
    const remoteUrl = await this.gitOutput(['config', '--get', 'remote.origin.url']).catch(
      () => '',
    );
    const normalizedRemote = this.normalizeRemoteUrl(remoteUrl.trim());
    const commonDir = path.isAbsolute(commonDirRaw)
      ? commonDirRaw
      : path.resolve(repoRoot.trim(), commonDirRaw.trim());
    const repoName = path.basename(repoRoot.trim());

    if (normalizedRemote) {
      return {
        repoName,
        identitySource: 'remote.origin.url',
        hashBase: normalizedRemote,
      };
    }

    return {
      repoName,
      identitySource: 'git-common-dir',
      hashBase: commonDir,
    };
  }

  private normalizeRemoteUrl(remoteUrl: string): string {
    if (!remoteUrl) return '';

    return remoteUrl
      .trim()
      .replace(/^git@([^:]+):/, 'ssh://git@$1/')
      .replace(/\.git$/, '')
      .toLowerCase();
  }

  private identityHash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 8);
  }

  private safeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '') || 'project';
  }

  private async validateAddCandidates(
    repoPathInput: string | string[],
  ): Promise<PrivateConfigAddCandidate[]> {
    const repoPaths = this.normalizeRepoPathInputs(repoPathInput);
    const candidates: PrivateConfigAddCandidate[] = [];

    for (const repoPath of repoPaths) {
      const absoluteRepoPath = path.join(this.workingDir, ...repoPath.split('/'));

      if (!(await fs.pathExists(absoluteRepoPath))) {
        throw new PrivateConfigSyncError(`Path does not exist: ${repoPath}`);
      }

      const stats = await fs.stat(absoluteRepoPath);
      const type: PrivateConfigEntryType = stats.isDirectory() ? 'directory' : 'file';
      candidates.push({ repoPath, absoluteRepoPath, type });
    }

    return candidates;
  }

  private normalizeRepoPathInputs(repoPathInput: string | string[]): string[] {
    const inputs = Array.isArray(repoPathInput) ? repoPathInput : [repoPathInput];
    return [...new Set(inputs.map(input => this.normalizeRepoPath(input)))];
  }

  private normalizeRepoPath(repoPathInput: string): string {
    const absolute = path.resolve(this.workingDir, repoPathInput);
    const relative = path.relative(this.workingDir, absolute);

    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new PrivateConfigSyncError(`Path must be inside repository: ${repoPathInput}`);
    }

    return this.toPosix(relative);
  }

  private getPrivatePath(projectId: string, repoPath: string): string {
    return path.join(this.baseDir, projectId, 'files', ...repoPath.split('/'));
  }

  private async buildEntry(
    projectId: string,
    repoPath: string,
    type: PrivateConfigEntryType,
  ): Promise<PrivateConfigEntry> {
    const privatePath = this.getPrivatePath(projectId, repoPath);
    const hashes = await this.hashPath(privatePath, type);
    const entry: PrivateConfigEntry = {
      repoPath,
      type,
      privatePath,
    };

    if (type === 'file') {
      entry.lastSyncedHash = hashes['.'];
    } else {
      entry.files = hashes;
    }

    return entry;
  }

  private async hasChangedSinceLastSync(
    targetPath: string,
    entry: PrivateConfigEntry,
  ): Promise<boolean> {
    if (!(await fs.pathExists(targetPath))) {
      return false;
    }

    const current = await this.hashPath(targetPath, entry.type);
    return !this.hashesEqual(current, this.entryHashes(entry));
  }

  private entryHashes(entry: PrivateConfigEntry): Record<string, string> {
    if (entry.type === 'file') {
      return entry.lastSyncedHash ? { '.': entry.lastSyncedHash } : {};
    }
    return entry.files || {};
  }

  private async hashPath(
    targetPath: string,
    type: PrivateConfigEntryType,
  ): Promise<Record<string, string>> {
    if (type === 'file') {
      return { '.': await this.hashFile(targetPath) };
    }

    const files = await this.listFiles(targetPath);
    const hashes: Record<string, string> = {};
    for (const file of files) {
      hashes[file] = await this.hashFile(path.join(targetPath, ...file.split('/')));
    }
    return hashes;
  }

  private async hashFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async listFiles(dirPath: string): Promise<string[]> {
    const result: string[] = [];

    const walk = async (currentDir: string, prefix = ''): Promise<void> => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        const absolute = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(absolute, relative);
        } else if (entry.isFile()) {
          result.push(relative);
        }
      }
    };

    await walk(dirPath);
    return result.sort();
  }

  private hashesEqual(left: Record<string, string>, right: Record<string, string>): boolean {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
  }

  private async backupPath(
    projectId: string,
    direction: PrivateConfigSyncDirection,
    repoPath: string,
    sourcePath: string,
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      this.baseDir,
      projectId,
      '.backups',
      timestamp,
      direction,
      ...repoPath.split('/'),
    );
    await fs.ensureDir(path.dirname(backupPath));
    await fs.copy(sourcePath, backupPath, { overwrite: true, errorOnExist: false });
    return backupPath;
  }

  private async pruneBackups(projectId: string, keep: number): Promise<void> {
    const backupRoot = path.join(this.baseDir, projectId, '.backups');
    if (!(await fs.pathExists(backupRoot))) return;

    const entries = await fs.readdir(backupRoot);
    const sorted = entries.sort().reverse();
    for (const entry of sorted.slice(keep)) {
      await fs.remove(path.join(backupRoot, entry));
    }
  }

  private async removeTrackedPathsFromMainGit(repoPath: string): Promise<string[]> {
    const tracked = await this.gitOutput(['ls-files', repoPath]).catch(() => '');
    const trackedPaths = tracked.split(/\r?\n/).filter(Boolean);

    if (!trackedPaths.length) {
      return [];
    }

    await execFileAsync('git', ['rm', '--cached', '-r', '--', repoPath], { cwd: this.workingDir });
    return trackedPaths;
  }

  private async commitMainGitRemoval(removedPaths: string[]): Promise<string> {
    const uniquePaths = [...new Set(removedPaths)];
    if (!uniquePaths.length) {
      throw new PrivateConfigSyncError('No main Git paths to remove');
    }

    const subject =
      uniquePaths.length === 1
        ? `Remove private config from shared Git: ${uniquePaths[0]}`
        : `Remove ${uniquePaths.length} private config files from shared Git`;
    const { stdout } = await execFileAsync('git', ['commit', '-m', subject], {
      cwd: this.workingDir,
    });
    const match = stdout.match(/\[[^\]]+\s+([a-f0-9]+)\]/);
    return match?.[1] || '';
  }

  private async getHooksDir(): Promise<string> {
    const repoRoot = await this.gitOutput(['rev-parse', '--show-toplevel']);
    const hooksPath = await this.gitOutput(['config', '--get', 'core.hooksPath']).catch(() => '');

    if (hooksPath) {
      return path.isAbsolute(hooksPath) ? hooksPath : path.resolve(repoRoot, hooksPath);
    }

    const commonGitDir = await this.gitOutput(['rev-parse', '--git-common-dir']);
    const resolvedCommonGitDir = path.isAbsolute(commonGitDir)
      ? commonGitDir
      : path.resolve(repoRoot, commonGitDir);
    return path.join(resolvedCommonGitDir, 'hooks');
  }

  private async gitOutput(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd: this.workingDir });
    return stdout.trim();
  }

  private toPosix(value: string): string {
    return value.split(path.sep).join('/');
  }

  private preCommitHook(projectId: string): string {
    const manifestPath = path.join(this.baseDir, projectId, 'manifest.json').replace(/"/g, '\\"');
    return `#!/bin/sh
set -eu
MANIFEST="${manifestPath}"
[ -f "$MANIFEST" ] || exit 0
node - "$MANIFEST" <<'NODE'
const fs = require('fs');
const { execFileSync } = require('child_process');
const manifestPath = process.argv[2];
const staged = execFileSync('git', ['diff', '--cached', '--name-status'], { encoding: 'utf8' }).split(/\\r?\\n/).filter(Boolean);
if (!staged.length) process.exit(0);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const blocked = [];
for (const line of staged) {
  const [status, file] = line.split(/\t/);
  if (!file || status === 'D') continue;
  for (const entry of manifest.entries || []) {
    if (entry.type === 'directory') {
      if (file === entry.repoPath || file.startsWith(entry.repoPath + '/')) blocked.push(file);
    } else if (file === entry.repoPath) {
      blocked.push(file);
    }
  }
}
if (blocked.length) {
  console.error('Blocked commit: private config paths staged:');
  for (const file of [...new Set(blocked)]) console.error('  ' + file);
  console.error('Run: git restore --staged <path>');
  process.exit(1);
}
NODE
`;
  }

  private prePushHook(projectId: string): string {
    const manifestPath = path.join(this.baseDir, projectId, 'manifest.json').replace(/"/g, '\\"');
    return `#!/bin/sh
set -eu
MANIFEST="${manifestPath}"
[ -f "$MANIFEST" ] || exit 0
TMP=$(mktemp)
cat > "$TMP"
node - "$MANIFEST" "$TMP" <<'NODE'
const fs = require('fs');
const { execFileSync } = require('child_process');
const manifestPath = process.argv[2];
const refsPath = process.argv[3];
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const refs = fs.readFileSync(refsPath, 'utf8').split(/\\r?\\n/).filter(Boolean);
const zero = /^0+$/;
const blocked = new Set();
function privatePath(file) {
  return (manifest.entries || []).some(entry => {
    if (entry.type === 'directory') return file === entry.repoPath || file.startsWith(entry.repoPath + '/');
    return file === entry.repoPath;
  });
}
for (const line of refs) {
  const [localRef, localSha, remoteRef, remoteSha] = line.split(/\\s+/);
  if (!localSha || zero.test(localSha)) continue;
  let revArgs;
  if (remoteSha && !zero.test(remoteSha)) {
    revArgs = [remoteSha + '..' + localSha];
  } else {
    const remoteName = (remoteRef || '').split('/')[2];
    revArgs = remoteName ? [localSha, '--not', '--remotes=' + remoteName] : [localSha];
  }
  let commits;
  try {
    commits = execFileSync('git', ['rev-list', ...revArgs], { encoding: 'utf8' }).split(/\\r?\\n/).filter(Boolean);
  } catch {
    commits = execFileSync('git', ['rev-list', localSha], { encoding: 'utf8' }).split(/\\r?\\n/).filter(Boolean);
  }
  for (const commit of commits) {
    const files = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', commit], { encoding: 'utf8' })
      .split(/\\r?\\n/)
      .filter(Boolean);
    for (const file of files) {
      if (privatePath(file)) blocked.add(file);
    }
  }
}
if (blocked.size) {
  console.error('Blocked push: private config paths found in outgoing commits:');
  for (const file of blocked) console.error('  ' + file);
  process.exit(1);
}
NODE
rm -f "$TMP"
`;
  }
}
