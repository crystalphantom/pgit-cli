import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

describe('private config sync smoke test', () => {
  let tempRoot: string;
  let repoDir: string;
  let homeDir: string;
  const cliPath = path.resolve(__dirname, '../../../dist/cli.js');

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pgit-private-sync-smoke-'));
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

  it('adds multiple paths, pushes, pulls, and blocks commit for real repo-path private config', async () => {
    await fs.writeFile(path.join(repoDir, 'agent-rules.md'), 'rules v1');
    await fs.ensureDir(path.join(repoDir, 'research'));
    await fs.writeFile(path.join(repoDir, 'research', 'notes.md'), 'notes v1');

    execFileSync('node', [cliPath, 'config', 'add', 'agent-rules.md', 'research'], {
      cwd: repoDir,
      env: { ...process.env, HOME: homeDir },
      encoding: 'utf8',
    });

    expect((await fs.lstat(path.join(repoDir, 'agent-rules.md'))).isSymbolicLink()).toBe(false);
    expect((await fs.lstat(path.join(repoDir, 'research'))).isDirectory()).toBe(true);

    await fs.writeFile(path.join(repoDir, 'agent-rules.md'), 'rules v2');
    execFileSync('node', [cliPath, 'config', 'sync', 'push'], {
      cwd: repoDir,
      env: { ...process.env, HOME: homeDir },
      encoding: 'utf8',
    });

    await fs.writeFile(path.join(repoDir, 'agent-rules.md'), 'local drift');
    execFileSync('node', [cliPath, 'config', 'sync', 'pull', '--force'], {
      cwd: repoDir,
      env: { ...process.env, HOME: homeDir },
      encoding: 'utf8',
    });

    expect(await fs.readFile(path.join(repoDir, 'agent-rules.md'), 'utf8')).toBe('rules v2');

    execFileSync('git', ['add', 'agent-rules.md'], { cwd: repoDir });
    expect(() => {
      execFileSync('git', ['commit', '-m', 'try leak'], {
        cwd: repoDir,
        env: { ...process.env, HOME: homeDir },
        stdio: 'pipe',
      });
    }).toThrow(/Blocked commit: private config paths staged/);
  });
});
