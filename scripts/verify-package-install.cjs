#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distCli = path.join(projectRoot, 'dist', 'cli.js');

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: {
      ...process.env,
      npm_config_update_notifier: 'false',
      npm_config_fund: 'false',
      npm_config_audit: 'false',
      HOME: tempHome,
      USERPROFILE: tempHome,
    },
  });
}

if (!fs.existsSync(distCli)) {
  console.error('dist/cli.js not found. Run npm run build before npm run test:package.');
  process.exit(1);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgit-package-smoke-'));
const packDir = path.join(tempDir, 'pack');
const installPrefix = path.join(tempDir, 'prefix');
const tempHome = path.join(tempDir, 'home');

try {
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(installPrefix, { recursive: true });
  fs.mkdirSync(tempHome, { recursive: true });

  const packOutput = run('npm', ['pack', '--pack-destination', packDir]).trim();
  const tarballName = packOutput.split('\n').filter(Boolean).pop();

  if (!tarballName) {
    throw new Error('npm pack did not return a tarball name');
  }

  const tarballPath = path.join(packDir, tarballName);
  const installOutput = run('npm', ['install', '--global', '--prefix', installPrefix, tarballPath]);
  process.stdout.write(installOutput);

  const binaryName = process.platform === 'win32' ? 'pgit.cmd' : 'pgit';
  const pgitBinary = path.join(installPrefix, 'bin', binaryName);
  const versionOutput = execFileSync(pgitBinary, ['-v'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome },
  }).trim();

  if (!versionOutput) {
    throw new Error('pgit -v returned empty output');
  }

  console.log(`Package install smoke passed: ${versionOutput}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
