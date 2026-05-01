import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PrivateConfigConflictError,
  PrivateConfigSyncManager,
} from '../../core/private-config-sync.manager';

describe('PrivateConfigSyncManager', () => {
  jest.setTimeout(120000);

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
    expect(await fs.readFile(path.join(info.privateRoot, 'my-rules.md'), 'utf8')).toBe(
      'private rules',
    );
    expect(await fs.pathExists(path.join(repoDir, '.git', 'hooks', 'pre-commit'))).toBe(true);
    expect(await fs.pathExists(path.join(repoDir, '.git', 'hooks', 'pre-push'))).toBe(true);
    expect(await fs.readFile(path.join(repoDir, '.git', 'info', 'exclude'), 'utf8')).not.toContain(
      'my-rules.md',
    );
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

  it('mirrors directory deletions when syncing to the private store', async () => {
    await fs.ensureDir(path.join(repoDir, 'private-folder'));
    await fs.writeFile(path.join(repoDir, 'private-folder', 'keep.md'), 'keep');
    await fs.writeFile(path.join(repoDir, 'private-folder', 'remove.md'), 'remove');

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const addResult = await manager.add('private-folder');
    const privateDir = addResult.entries[0].privatePath;

    await fs.remove(path.join(repoDir, 'private-folder', 'remove.md'));
    await manager.syncPush();
    const status = await manager.getStatus();

    expect(await fs.pathExists(path.join(privateDir, 'keep.md'))).toBe(true);
    expect(await fs.pathExists(path.join(privateDir, 'remove.md'))).toBe(false);
    expect(status).toEqual([
      { repoPath: 'private-folder', type: 'directory', state: 'up-to-date' },
    ]);
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
    expect(await fs.readFile(path.join(repoDir, 'research', 'notes.md'), 'utf8')).toBe(
      'private research',
    );
  });

  it('auto-commits tracked path removals by default', async () => {
    await fs.writeFile(path.join(repoDir, 'secret.md'), 'private secret');
    execFileSync('git', ['add', 'secret.md'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'track secret before pgit'], { cwd: repoDir });

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const result = await manager.add('secret.md');
    const status = execFileSync('git', ['status', '--short'], { cwd: repoDir, encoding: 'utf8' });
    const lsFiles = execFileSync('git', ['ls-files', 'secret.md'], {
      cwd: repoDir,
      encoding: 'utf8',
    });

    expect(result.commitHash).toBeTruthy();
    expect(status).toBe('?? secret.md\n');
    expect(lsFiles).toBe('');
    expect(await fs.readFile(path.join(repoDir, 'secret.md'), 'utf8')).toBe('private secret');
  });

  it('does not include unrelated staged changes in automatic removal commits', async () => {
    await fs.writeFile(path.join(repoDir, 'secret.md'), 'private secret');
    execFileSync('git', ['add', 'secret.md'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'track secret before pgit'], { cwd: repoDir });
    await fs.writeFile(path.join(repoDir, 'unrelated.md'), 'unrelated');
    execFileSync('git', ['add', 'unrelated.md'], { cwd: repoDir });

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const result = await manager.add('secret.md');
    const committedFiles = execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], {
      cwd: repoDir,
      encoding: 'utf8',
    });
    const status = execFileSync('git', ['status', '--short'], {
      cwd: repoDir,
      encoding: 'utf8',
    });

    expect(result.commitHash).toBeTruthy();
    expect(committedFiles).toContain('secret.md');
    expect(committedFiles).not.toContain('unrelated.md');
    expect(status).toContain('A  unrelated.md');
    expect(status).toContain('?? secret.md');
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

  it('throws when adding an already tracked path without --force', async () => {
    await fs.writeFile(path.join(repoDir, 'rules.md'), 'rules');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add('rules.md');

    await expect(manager.add('rules.md')).rejects.toThrow(
      'Private config path is already tracked: rules.md. Use --force to overwrite.',
    );
  });

  it('overwrites existing file entry in private store when --force is set', async () => {
    const filePath = path.join(repoDir, 'rules.md');
    await fs.writeFile(filePath, 'v1');

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const first = await manager.add('rules.md');
    expect(first.entries[0].repoPath).toBe('rules.md');
    await fs.writeFile(filePath, 'v2');

    const second = await manager.add('rules.md', { force: true });

    expect(second.entries).toHaveLength(1);
    expect(second.entries[0].repoPath).toBe('rules.md');
    expect(await fs.readFile(first.entries[0].privatePath, 'utf8')).toBe('v2');
  });

  it('overwrites existing directory entry in private store when --force is set', async () => {
    const folder = path.join(repoDir, 'private-folder');
    await fs.ensureDir(folder);
    await fs.writeFile(path.join(folder, 'keep.md'), 'keep');

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const first = await manager.add('private-folder');
    const privateDir = first.entries[0].privatePath;
    expect(await fs.pathExists(path.join(privateDir, 'keep.md'))).toBe(true);

    await fs.remove(path.join(folder, 'keep.md'));
    await fs.writeFile(path.join(folder, 'new.md'), 'new');

    const second = await manager.add('private-folder', { force: true });

    expect(second.entries).toHaveLength(1);
    expect(second.entries[0].repoPath).toBe('private-folder');
    expect(await fs.pathExists(path.join(privateDir, 'keep.md'))).toBe(false);
    expect(await fs.pathExists(path.join(privateDir, 'new.md'))).toBe(true);
    expect(await fs.readFile(path.join(privateDir, 'new.md'), 'utf8')).toBe('new');
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

  it('drops a repo-local file without removing its private-store entry', async () => {
    const filePath = path.join(repoDir, 'rules.md');
    await fs.writeFile(filePath, 'rules');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    const addResult = await manager.add('rules.md');
    const privatePath = addResult.entries[0].privatePath;

    const dropResult = await manager.drop('rules.md');
    const statusAfterDrop = await manager.getStatus();

    expect(dropResult.entries.map(entry => entry.repoPath)).toEqual(['rules.md']);
    expect(dropResult.droppedRepoPaths).toEqual(['rules.md']);
    expect(await fs.pathExists(filePath)).toBe(false);
    expect(await fs.readFile(privatePath, 'utf8')).toBe('rules');
    expect(statusAfterDrop).toEqual([
      { repoPath: 'rules.md', type: 'file', state: 'missing-repo' },
    ]);

    await manager.syncPull();

    expect(await fs.readFile(filePath, 'utf8')).toBe('rules');
  });

  it('drops all tracked repo-local entries when the path is dot', async () => {
    await fs.writeFile(path.join(repoDir, 'rules.md'), 'rules');
    await fs.ensureDir(path.join(repoDir, 'research'));
    await fs.writeFile(path.join(repoDir, 'research', 'notes.md'), 'notes');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add(['rules.md', 'research']);

    const dropResult = await manager.drop('.');
    const statusAfterDrop = await manager.getStatus();

    expect(dropResult.entries.map(entry => entry.repoPath)).toEqual(['research', 'rules.md']);
    expect(dropResult.droppedRepoPaths).toEqual(['research', 'rules.md']);
    expect(await fs.pathExists(path.join(repoDir, 'rules.md'))).toBe(false);
    expect(await fs.pathExists(path.join(repoDir, 'research'))).toBe(false);
    expect(statusAfterDrop).toEqual([
      { repoPath: 'research', type: 'directory', state: 'missing-repo' },
      { repoPath: 'rules.md', type: 'file', state: 'missing-repo' },
    ]);
  });

  it('does not drop any requested paths when one local copy has unpushed changes', async () => {
    await fs.writeFile(path.join(repoDir, 'rules.md'), 'rules');
    await fs.ensureDir(path.join(repoDir, 'research'));
    await fs.writeFile(path.join(repoDir, 'research', 'notes.md'), 'notes');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add(['rules.md', 'research']);
    await fs.writeFile(path.join(repoDir, 'rules.md'), 'local-only');

    await expect(manager.drop(['research', 'rules.md'])).rejects.toThrow(
      PrivateConfigConflictError,
    );

    expect(await fs.readFile(path.join(repoDir, 'rules.md'), 'utf8')).toBe('local-only');
    expect(await fs.readFile(path.join(repoDir, 'research', 'notes.md'), 'utf8')).toBe('notes');
  });

  it('does not drop a directory with a local-only empty subdirectory', async () => {
    await fs.ensureDir(path.join(repoDir, 'research'));
    await fs.writeFile(path.join(repoDir, 'research', 'notes.md'), 'notes');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add('research');
    await fs.ensureDir(path.join(repoDir, 'research', 'drafts'));

    await expect(manager.drop('research')).rejects.toThrow(PrivateConfigConflictError);

    expect(await fs.pathExists(path.join(repoDir, 'research', 'drafts'))).toBe(true);
    expect(await fs.readFile(path.join(repoDir, 'research', 'notes.md'), 'utf8')).toBe('notes');
  });

  it('does not drop a directory with a local-only symlink', async () => {
    await fs.ensureDir(path.join(repoDir, 'research'));
    await fs.writeFile(path.join(repoDir, 'research', 'notes.md'), 'notes');
    await fs.writeFile(path.join(repoDir, 'outside.md'), 'outside');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add('research');
    await fs.symlink('../outside.md', path.join(repoDir, 'research', 'outside-link.md'));

    await expect(manager.drop('research')).rejects.toThrow(PrivateConfigConflictError);

    expect(await fs.pathExists(path.join(repoDir, 'research', 'outside-link.md'))).toBe(true);
    expect(await fs.readFile(path.join(repoDir, 'research', 'notes.md'), 'utf8')).toBe('notes');
  });

  it('force drops local copies even when they differ from private store', async () => {
    await fs.writeFile(path.join(repoDir, 'rules.md'), 'rules');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add('rules.md');
    await fs.writeFile(path.join(repoDir, 'rules.md'), 'local-only');

    const dropResult = await manager.drop('rules.md', { force: true });

    expect(dropResult.droppedRepoPaths).toEqual(['rules.md']);
    expect(await fs.pathExists(path.join(repoDir, 'rules.md'))).toBe(false);
  });

  it('does not drop anything when one requested private path is not tracked', async () => {
    await fs.writeFile(path.join(repoDir, 'rules.md'), 'rules');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add('rules.md');

    await expect(manager.drop(['rules.md', 'missing.md'])).rejects.toThrow(
      'Private config path is not tracked: missing.md',
    );

    expect(await fs.readFile(path.join(repoDir, 'rules.md'), 'utf8')).toBe('rules');
  });

  it('preserves existing shell hooks when installing pgit hooks', async () => {
    const hooksDir = path.join(repoDir, '.git', 'hooks');
    await fs.writeFile(
      path.join(hooksDir, 'pre-commit'),
      '#!/bin/sh\necho existing-pre-commit >> .git/hook.log\n',
      { mode: 0o755 },
    );
    await fs.writeFile(
      path.join(hooksDir, 'pre-push'),
      '#!/bin/sh\necho existing-pre-push >> .git/hook.log\n',
      { mode: 0o755 },
    );
    await fs.writeFile(path.join(repoDir, 'my-rules.md'), 'v1');
    const manager = new PrivateConfigSyncManager(repoDir, homeDir);

    await manager.add('my-rules.md');
    const preCommitHook = await fs.readFile(path.join(hooksDir, 'pre-commit'), 'utf8');
    const prePushHookBackup = await fs.readFile(
      path.join(hooksDir, 'pre-push.pgit-backup'),
      'utf8',
    );
    await fs.writeFile(path.join(repoDir, 'public.md'), 'public');
    execFileSync('git', ['add', 'public.md'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'public commit'], { cwd: repoDir });

    expect(preCommitHook).toContain('pgit private-config hook start');
    expect(preCommitHook).toContain('existing-pre-commit');
    expect(prePushHookBackup).toContain('existing-pre-push');
    expect(await fs.readFile(path.join(repoDir, '.git', 'hook.log'), 'utf8')).toContain(
      'existing-pre-commit',
    );
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

  it('pre-push hook allows deletion-only untracking commits', async () => {
    const remoteDir = path.join(tempRoot, 'remote.git');
    execFileSync('git', ['init', '--bare', remoteDir]);
    execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd: repoDir });

    await fs.writeFile(path.join(repoDir, 'my-rules.md'), 'v1');
    execFileSync('git', ['add', 'my-rules.md'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'track rules before pgit'], { cwd: repoDir });
    execFileSync('git', ['push', '-u', 'origin', 'HEAD:main'], { cwd: repoDir });

    const manager = new PrivateConfigSyncManager(repoDir, homeDir);
    await manager.add('my-rules.md');

    expect(() => {
      execFileSync('git', ['push', 'origin', 'HEAD:main'], {
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
