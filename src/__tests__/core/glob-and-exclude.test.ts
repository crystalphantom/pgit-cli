import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PrivateConfigSyncManager,
  PrivateConfigSyncError,
} from '../../core/private-config-sync.manager';

describe('PrivateConfigSyncManager Glob and Exclude', () => {
  jest.setTimeout(120000);

  let tempRoot: string;
  let repoDir: string;
  let homeDir: string;
  let manager: PrivateConfigSyncManager;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pgit-private-sync-glob-'));
    repoDir = path.join(tempRoot, 'repo');
    homeDir = path.join(tempRoot, 'home');
    await fs.ensureDir(repoDir);
    await fs.ensureDir(homeDir);

    execFileSync('git', ['init'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });

    manager = new PrivateConfigSyncManager(repoDir, homeDir);
  });

  afterEach(async () => {
    await fs.remove(tempRoot);
  });

  const createFile = async (relativePath: string, content = 'content') => {
    const fullPath = path.join(repoDir, relativePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content);
  };

  describe('glob pattern expansion', () => {
    it('expands recursive glob (**/*.env) to match nested files', async () => {
      await createFile('app.env');
      await createFile('nested/secret.env');
      await createFile('deep/nested/test.env');

      const result = await manager.add('**/*.env');
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['app.env', 'deep/nested/test.env', 'nested/secret.env']);
    });

    it('expands brace expansion ({*.env,*.key}) to match multiple extensions', async () => {
      await createFile('app.env');
      await createFile('server.key');
      await createFile('debug.log');

      const result = await manager.add('{*.env,*.key}');
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['app.env', 'server.key']);
    });

    it('expands multi-extension glob (*.{env,key,pem}) to match files', async () => {
      await createFile('app.env');
      await createFile('server.key');
      await createFile('cert.pem');
      await createFile('readme.md');

      const result = await manager.add('*.{env,key,pem}');
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['app.env', 'cert.pem', 'server.key']);
    });

    it('expands directory glob (config/**) to match all entries in directory', async () => {
      await createFile('config/db.yml');
      await createFile('config/nested/app.yml');
      await createFile('src/main.ts');

      const result = await manager.add('config/**');
      const paths = result.entries.map(e => e.repoPath).sort();
      // Should match file descendants but exclude directory entries like config and config/nested
      expect(paths).toEqual(['config/db.yml', 'config/nested/app.yml']);
    });

    it('handles multiple glob inputs in a single add call', async () => {
      await createFile('app.env');
      await createFile('server.key');
      await createFile('debug.log');

      const result = await manager.add(['*.env', '*.key']);
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['app.env', 'server.key']);
    });

    it('combines explicit paths and glob patterns in one call', async () => {
      await createFile('readme.md');
      await createFile('app.env');
      await createFile('test.env');

      const result = await manager.add(['readme.md', '*.env']);
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['app.env', 'readme.md', 'test.env']);
    });

    it('deduplicates paths when glob and explicit path overlap', async () => {
      await createFile('app.env');
      await createFile('local.env');

      const result = await manager.add(['app.env', '*.env']);
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['app.env', 'local.env']);
    });

    it('matches dotfiles when glob uses dot option', async () => {
      await createFile('.env.local');
      await createFile('app.env');

      const result = await manager.add('.*');
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toContain('.env.local');
    });

    it('does not match .git directory contents with glob', async () => {
      await createFile('readme.md');
      // Create some fake files inside .git just in case
      await createFile('.git/config-fake');

      const result = await manager.add('**/*');
      const paths = result.entries.map(e => e.repoPath);
      expect(paths).toContain('readme.md');
      expect(paths.some(p => p.includes('.git'))).toBe(false);
    });
  });

  describe('exclusion patterns', () => {
    it('applies exclude pattern to glob-expanded results', async () => {
      await createFile('app.env');
      await createFile('local.env');

      const result = await manager.add('*.env', { excludePatterns: ['app.env'] });
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['local.env']);
    });

    it('applies exclude glob to explicit path additions', async () => {
      await createFile('app.env');
      await createFile('debug.log');

      const result = await manager.add(['app.env', 'debug.log'], { excludePatterns: ['*.log'] });
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['app.env']);
    });

    it('excludes nested paths with recursive exclude pattern', async () => {
      await createFile('root.md');
      await createFile('nested/notes.md');
      await createFile('nested/deep/spec.md');

      const result = await manager.add('.', { excludePatterns: ['nested/**'] });
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['root.md']);
    });

    it('basename-only exclude pattern matches nested files', async () => {
      await createFile('debug.log');
      await createFile('nested/trace.log');
      await createFile('app.env');

      const result = await manager.add('.', { excludePatterns: ['*.log'] });
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['app.env']);
    });

    it('multiple exclude patterns are applied cumulatively', async () => {
      await createFile('debug.log');
      await createFile('temp.tmp');
      await createFile('app.env');

      const result = await manager.add('.', { excludePatterns: ['*.log', '*.tmp'] });
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['app.env']);
    });

    it('throws when all paths are excluded', async () => {
      await createFile('app.env');
      await createFile('local.env');

      await expect(
        manager.add('*.env', { excludePatterns: ['*.env'] }),
      ).rejects.toThrow(PrivateConfigSyncError);
    });

    it('exclude does not affect non-matching paths', async () => {
      await createFile('app.env');
      await createFile('readme.md');
      await createFile('debug.log');

      const result = await manager.add('.', { excludePatterns: ['*.log'] });
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['app.env', 'readme.md']);
    });

    it('exclude with directory path pattern', async () => {
      await createFile('config/db.yml');
      await createFile('config/cache.yml');
      await createFile('src/main.ts');

      const result = await manager.add('.', { excludePatterns: ['config/**'] });
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['src/main.ts']);
    });
  });

  describe('glob and exclude edge cases', () => {
    it('glob pattern with no matches throws descriptive error', async () => {
      await expect(
        manager.add('*.xyz'),
      ).rejects.toThrow('No paths match glob pattern: *.xyz');
    });

    it('exclude pattern cannot be the repository root', async () => {
      await createFile('readme.md');
      await expect(
        manager.add('readme.md', { excludePatterns: ['.'] }),
      ).rejects.toThrow('Exclude pattern must not be the repository root');
    });

    it('absolute path in glob is rejected', async () => {
      await expect(
        manager.add('/tmp/*.env'),
      ).rejects.toThrow('Path must be inside repository');
    });

    it('parent directory traversal in glob is rejected', async () => {
      await expect(
        manager.add('../*.env'),
      ).rejects.toThrow('Path must be inside repository');
    });

    it('empty exclude patterns array has no effect', async () => {
      await createFile('app.env');
      await createFile('local.env');

      const result = await manager.add('*.env', { excludePatterns: [] });
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['app.env', 'local.env']);
    });

    it('exclude combined with recursive glob', async () => {
      await createFile('root.env');
      await createFile('nested/app.env');
      await createFile('nested/test.log');

      const result = await manager.add('**/*.env', { excludePatterns: ['nested/**'] });
      const paths = result.entries.map(e => e.repoPath).sort();
      expect(paths).toEqual(['root.env']);
    });

    it('does not leak excluded files during directory copy when tracking a directory', async () => {
      await createFile('secrets/keep.txt', 'keep content');
      await createFile('secrets/ignored.log', 'secret leak content');

      const result = await manager.add('secrets', { excludePatterns: ['secrets/ignored.log'] });

      // Verify manifest entry only tracks non-excluded files
      const entry = result.entries.find(e => e.repoPath === 'secrets');
      expect(entry).toBeDefined();
      expect(entry!.type).toBe('directory');
      expect(entry!.files).toBeDefined();
      expect(Object.keys(entry!.files!)).toEqual(['keep.txt']);

      // Verify that the excluded file was not copied to the private store
      const info = await manager.getProjectInfo();
      const privateIgnoredFile = path.join(info.privateRoot, 'secrets', 'ignored.log');
      const privateKeepFile = path.join(info.privateRoot, 'secrets', 'keep.txt');

      expect(await fs.pathExists(privateKeepFile)).toBe(true);
      expect(await fs.pathExists(privateIgnoredFile)).toBe(false);

      // Verify sync pull/push does not leak excluded files either
      await fs.writeFile(path.join(repoDir, 'secrets', 'ignored.log'), 'new leak content');
      const statusResult = await manager.getStatus();
      const secretsStatus = statusResult.find(s => s.repoPath === 'secrets');
      expect(secretsStatus).toBeDefined();
      // Should remain up-to-date because secrets/ignored.log is excluded!
      expect(secretsStatus!.state).toBe('up-to-date');

      // Verify sync pull works without copying or restoring ignored.log
      await fs.remove(path.join(repoDir, 'secrets', 'ignored.log'));
      await manager.syncPull({ repoPaths: ['secrets'], force: true });
      expect(await fs.pathExists(path.join(repoDir, 'secrets', 'ignored.log'))).toBe(false);
    });
  });
});
