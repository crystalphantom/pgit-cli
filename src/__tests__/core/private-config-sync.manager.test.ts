import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrivateConfigConflictError, PrivateConfigSyncManager } from '../../core/private-config-sync.manager';

describe('PrivateConfigSyncManager', () => {
  let tempRoot: string;
  let repoDir: string;
  let homeDir: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pgit-private-sync-'));
    repoDir = path.join(tempRoot, 'repo');
    homeDir = path.join(tempRoot, 'home');
    await fs.ensureDir(repoDir);
    await fs.ensureDir(homeDir);
    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });
  });

  afterEach(async () => {
    await fs.remove(tempRoot);
  });

  it('adds a real repo-path file to private store without creating a symlink or git exclude entry', async () => {
    const filePath = path.join(repoDir, 'my-rules.md');
    await fs.writeFile(filePath, 'private rules');

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const result = await manager.add('my-rules.md');
    const entry = result.entries[0];
    const info = await manager.getProjectInfo();

    expect(entry.repoPath).toBe('my-rules.md');
    expect(await fs.readFile(filePath, 'utf8')).toBe('private rules');
    expect((await fs.lstat(filePath)).isSymbolicLink()).toBe(false);
    expect(await fs.pathExists(path.join(info.privateRoot, 'my-rules.md'))).toBe(true);
    expect(await fs.readFile(path.join(info.privateRoot, 'my-rules.md'), 'utf8')).toBe('private rules');
    expect(await fs.pathExists(path.join(repoDir, '.git', 'hooks', 'pre-commit'))).toBe(true);
    expect(await fs.pathExists(path.join(repoDir, '.git', 'hooks', 'pre-push'))).toBe(true);
    expect(await fs.readFile(path.join(repoDir, '.git', 'info', 'exclude'), 'utf8')).not.toContain('my-rules.md');
  });

  it('syncs pull and push with conflict detection and force backups', async () => {
    await fs.writeFile(path.join(repoDir, 'my-rules.md'), 'v1');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add('my-rules.md');
    const info = await manager.getProjectInfo();
    const privateFile = path.join(info.privateRoot, 'my-rules.md');

    await fs.writeFile(privateFile, 'v2');
    await manager.syncPull();
    expect(await fs.readFile(path.join(repoDir, 'my-rules.md'), 'utf8')).toBe('v2');

    await fs.writeFile(path.join(repoDir, 'my-rules.md'), 'repo-change');
    await fs.writeFile(privateFile, 'private-change');
    await expect(manager.syncPull()).rejects.toThrow(PrivateConfigConflictError);

    const forced = await manager.syncPull({ force: true });
    expect(forced.backups).toHaveLength(1);
    expect(await fs.readFile(path.join(repoDir, 'my-rules.md'), 'utf8')).toBe('private-change');
    expect(await fs.pathExists(forced.backups[0])).toBe(true);
  });

  it('tracks directory entries with per-file hashes', async () => {
    await fs.ensureDir(path.join(repoDir, 'private-folder', 'nested'));
    await fs.writeFile(path.join(repoDir, 'private-folder', 'nested', 'config.md'), 'config');

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const result = await manager.add('private-folder');
    const entry = result.entries[0];

    expect(entry.type).toBe('directory');
    expect(entry.files).toEqual({ 'nested/config.md': expect.any(String) });
  });

  it('removes already-tracked paths from main git index when adding private config', async () => {
    await fs.ensureDir(path.join(repoDir, 'research'));
    await fs.writeFile(path.join(repoDir, 'research', 'notes.md'), 'private research');
    execFileSync('git', ['add', 'research/notes.md'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'track research before pgit'], { cwd: repoDir });

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const result = await manager.add('research', { noCommit: true });

    const lsFiles = execFileSync('git', ['ls-files', 'research'], {
      cwd: repoDir,
      encoding: 'utf8',
    });
    const status = execFileSync('git', ['diff', '--cached', '--name-status'], {
      cwd: repoDir,
      encoding: 'utf8',
    });

    expect(result.untrackedFromMainGit).toEqual(['research/notes.md']);
    expect(result.commitHash).toBeUndefined();
    expect(lsFiles).toBe('');
    expect(status).toContain('D\tresearch/notes.md');
    expect(await fs.readFile(path.join(repoDir, 'research', 'notes.md'), 'utf8')).toBe('private research');
  });

  it('auto-commits tracked path removals by default', async () => {
    await fs.writeFile(path.join(repoDir, 'secret.md'), 'private secret');
    execFileSync('git', ['add', 'secret.md'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'track secret before pgit'], { cwd: repoDir });

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const result = await manager.add('secret.md');
    const status = execFileSync('git', ['status', '--short'], { cwd: repoDir, encoding: 'utf8' });
    const lsFiles = execFileSync('git', ['ls-files', 'secret.md'], { cwd: repoDir, encoding: 'utf8' });

    expect(result.commitHash).toBeTruthy();
    expect(status).toBe('?? secret.md\n');
    expect(lsFiles).toBe('');
    expect(await fs.readFile(path.join(repoDir, 'secret.md'), 'utf8')).toBe('private secret');
  });

  it('adds multiple files and directories in one operation', async () => {
    await fs.writeFile(path.join(repoDir, 'rules.md'), 'rules');
    await fs.ensureDir(path.join(repoDir, 'research'));
    await fs.writeFile(path.join(repoDir, 'research', 'notes.md'), 'notes');

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const result = await manager.add(['rules.md', 'research']);

    expect(result.entries.map(entry => entry.repoPath)).toEqual(['rules.md', 'research']);
    expect(result.entries.map(entry => entry.type)).toEqual(['file', 'directory']);
  });

  it('does not mutate any path when one path in a multi-add is invalid', async () => {
    await fs.ensureDir(path.join(repoDir, 'research'));
    await fs.ensureDir(path.join(repoDir, 'docs'));
    await fs.writeFile(path.join(repoDir, 'research', 'notes.md'), 'notes');
    await fs.writeFile(path.join(repoDir, 'docs', 'spec.md'), 'spec');
    execFileSync('git', ['add', 'research/notes.md', 'docs/spec.md'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'track docs before pgit'], { cwd: repoDir });

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const info = await manager.getProjectInfo();

    await expect(manager.add(['research', 'docs', 'spec'])).rejects.toThrow(
      'Path does not exist: spec',
    );

    const staged = execFileSync('git', ['diff', '--cached', '--name-status'], {
      cwd: repoDir,
      encoding: 'utf8',
    });
    const tracked = execFileSync('git', ['ls-files', 'research', 'docs'], {
      cwd: repoDir,
      encoding: 'utf8',
    });

    expect(staged).toBe('');
    expect(tracked).toContain('research/notes.md');
    expect(tracked).toContain('docs/spec.md');
    expect(await fs.pathExists(path.join(info.privateRoot, 'research'))).toBe(false);
    expect(await fs.pathExists(path.join(info.privateRoot, 'docs'))).toBe(false);
  });

  it('removes a file entry from private tracking without deleting the repo file', async () => {
    const filePath = path.join(repoDir, 'my-rules.md');
    await fs.writeFile(filePath, 'private rules');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const addResult = await manager.add('my-rules.md');
    const privatePath = addResult.entries[0].privatePath;

    const removeResult = await manager.remove('my-rules.md');
    const status = await manager.getStatus();

    expect(removeResult.entries.map(entry => entry.repoPath)).toEqual(['my-rules.md']);
    expect(await fs.pathExists(privatePath)).toBe(false);
    expect(await fs.readFile(filePath, 'utf8')).toBe('private rules');
    expect(status).toEqual([]);
  });

  it('removes a directory entry from private tracking without deleting the repo directory', async () => {
    await fs.ensureDir(path.join(repoDir, 'research'));
    await fs.writeFile(path.join(repoDir, 'research', 'notes.md'), 'notes');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const addResult = await manager.add('research');
    const privatePath = addResult.entries[0].privatePath;

    const removeResult = await manager.remove('research');
    const status = await manager.getStatus();

    expect(removeResult.entries.map(entry => entry.repoPath)).toEqual(['research']);
    expect(await fs.pathExists(privatePath)).toBe(false);
    expect(await fs.readFile(path.join(repoDir, 'research', 'notes.md'), 'utf8')).toBe('notes');
    expect(status).toEqual([]);
  });

  it('does not remove any paths when one requested private path is not tracked', async () => {
    await fs.writeFile(path.join(repoDir, 'rules.md'), 'rules');
    await fs.ensureDir(path.join(repoDir, 'research'));
    await fs.writeFile(path.join(repoDir, 'research', 'notes.md'), 'notes');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add(['rules.md', 'research']);

    await expect(manager.remove(['rules.md', 'missing.md'])).rejects.toThrow(
      'Private config path is not tracked: missing.md',
    );

    const status = await manager.getStatus();
    expect(status.map(entry => entry.repoPath).sort()).toEqual(['research', 'rules.md']);
  });

  it('pre-commit hook allows deletion-only untracking commits', async () => {
    await fs.writeFile(path.join(repoDir, 'my-rules.md'), 'v1');
    execFileSync('git', ['add', 'my-rules.md'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'track rules before pgit'], { cwd: repoDir });
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add('my-rules.md', { noCommit: true });

    expect(() => {
      execFileSync('git', ['commit', '-m', 'untrack private rules'], {
        cwd: repoDir,
        stdio: 'pipe',
      });
    }).not.toThrow();
  });

  it('pre-commit hook blocks staged private paths', async () => {
    await fs.writeFile(path.join(repoDir, 'my-rules.md'), 'v1');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add('my-rules.md');

    execFileSync('git', ['add', 'my-rules.md'], { cwd: repoDir });

    expect(() => {
      execFileSync('git', ['commit', '-m', 'leak private file'], {
        cwd: repoDir,
        stdio: 'pipe',
      });
    }).toThrow(/Blocked commit: private config paths staged/);
  });

  it('installs hooks into the common hooks directory when run from a git worktree', async () => {
    await fs.writeFile(path.join(repoDir, 'README.md'), 'readme');
    execFileSync('git', ['add', 'README.md'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: repoDir });
    const worktreeDir = path.join(tempRoot, 'repo-worktree');
    execFileSync('git', ['worktree', 'add', worktreeDir, '-b', 'worktree-test'], {
      cwd: repoDir,
      env: { ...process.env, GIT_INDEX_FILE: undefined },
    });
    await fs.writeFile(path.join(worktreeDir, 'secret.md'), 'secret');

    const manager = new PrivateConfigSyncManager(worktreeDir, homeDir);
    await manager.add('secret.md');

    expect(await fs.pathExists(path.join(repoDir, '.git', 'hooks', 'pre-commit'))).toBe(true);
    execFileSync('git', ['add', 'secret.md'], {
      cwd: worktreeDir,
      env: { ...process.env, GIT_INDEX_FILE: undefined },
    });
    expect(() => {
      execFileSync('git', ['commit', '-m', 'leak private file'], {
        cwd: worktreeDir,
        env: { ...process.env, GIT_INDEX_FILE: undefined },
        stdio: 'pipe',
      });
    }).toThrow(/Blocked commit: private config paths staged/);
  });

  it('respects core.hooksPath when installing hooks', async () => {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: repoDir });
    await fs.writeFile(path.join(repoDir, 'my-rules.md'), 'v1');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);

    await manager.add('my-rules.md');

    expect(await fs.pathExists(path.join(repoDir, '.githooks', 'pre-commit'))).toBe(true);
    execFileSync('git', ['add', 'my-rules.md'], { cwd: repoDir });
    expect(() => {
      execFileSync('git', ['commit', '-m', 'leak private file'], {
        cwd: repoDir,
        stdio: 'pipe',
      });
    }).toThrow(/Blocked commit: private config paths staged/);
  });
});
