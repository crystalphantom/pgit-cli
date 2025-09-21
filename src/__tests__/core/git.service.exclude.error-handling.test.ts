// Helper type for loosely-typed fs wrappers used only in tests
type FsAnyFn = (..._args: unknown[]) => unknown;

// Mock fs-extra early so its methods are configurable for jest spies in tests
jest.mock('fs-extra', () => {
  const fsStore = new Map<string, string | Buffer>();

  const mockFs = {
    mkdtemp: jest.fn((prefix: string) => {
      const dir = require('path').join('/tmp', `${prefix}${Date.now()}`);
      fsStore.set(dir, 'directory');
      return Promise.resolve(dir);
    }),
    ensureDir: jest.fn((dirPath: string) => {
      const pathMod = require('path');
      let currentPath = '';
      dirPath.split(pathMod.sep).forEach(part => {
        currentPath = currentPath ? pathMod.join(currentPath, part) : part;
        if (currentPath) {
          fsStore.set(currentPath, 'directory');
        }
      });
      return Promise.resolve();
    }),
    pathExists: jest.fn((filePath: string) => Promise.resolve(fsStore.has(filePath))),
    writeFile: jest.fn((filePath: string, content: string | Buffer) => {
      const pathMod = require('path');
      const parentDir = pathMod.dirname(filePath);
      if (!fsStore.has(parentDir)) {
        mockFs.ensureDir(parentDir);
      }
      fsStore.set(filePath, content);
      return Promise.resolve();
    }),
  readFile: jest.fn((filePath: string, encoding: NodeJS.BufferEncoding) => {
      const content = fsStore.get(filePath);
      if (content === undefined || content === 'directory') {
        const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        return Promise.reject(error);
      }
      if (Buffer.isBuffer(content)) {
        return Promise.resolve(content.toString(encoding));
      }
      return Promise.resolve(content as string);
    }),
    remove: jest.fn((targetPath: string) => {
      const pathMod = require('path');
      fsStore.delete(targetPath);
      for (const key of Array.from(fsStore.keys())) {
        if (key.startsWith(targetPath + pathMod.sep)) {
          fsStore.delete(key);
        }
      }
      return Promise.resolve();
    }),
    chmod: jest.fn((_target: string, _mode: number) => Promise.resolve()),
    stat: jest.fn((targetPath: string) => {
      if (!fsStore.has(targetPath)) {
        const error = new Error(`ENOENT: no such file or directory, stat '${targetPath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        return Promise.reject(error);
      }
      const isDirectory = fsStore.get(targetPath) === 'directory';
      return Promise.resolve({
        isDirectory: () => isDirectory,
        isFile: () => !isDirectory,
        size: isDirectory ? 0 : (fsStore.get(targetPath) as string | Buffer).length,
      } as unknown as import('fs').Stats);
    }),
    lstat: jest.fn((targetPath: string) => {
      if (!fsStore.has(targetPath)) {
        const error = new Error(`ENOENT: no such file or directory, lstat '${targetPath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        return Promise.reject(error);
      }
      return Promise.resolve({
        isSymbolicLink: () => false,
        isDirectory: () => fsStore.get(targetPath) === 'directory',
        isFile: () => fsStore.get(targetPath) !== 'directory',
        size: fsStore.get(targetPath) === 'directory' ? 0 : (fsStore.get(targetPath) as string | Buffer).length,
      } as unknown as import('fs').Stats);
    }),
    _clearFs: (): void => {
      fsStore.clear();
    },
    _getFsStore: (): Map<string, string | Buffer> => fsStore,
  };

  return mockFs;
});

import { GitService } from '../../core/git.service';
import { FileSystemService } from '../../core/filesystem.service';
import { GitExcludeValidationError } from '../../errors/git.error';
import { PGIT_MARKER_COMMENT } from '../../types/config.types';
import * as fs from 'fs-extra';
import * as path from 'path';
import { LoggerService } from '../../utils/logger.service';

// Mock simple-git
jest.mock('simple-git', () => ({
  simpleGit: jest.fn(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue({ commit: 'mock-commit-hash' }),
    status: jest.fn().mockResolvedValue({
      current: 'main',
      tracking: null,
      ahead: 0,
      behind: 0,
      staged: [],
      modified: [],
      untracked: [],
      deleted: [],
      conflicted: [],
      isClean: true,
      files: [],
    }),
    log: jest.fn().mockResolvedValue({ all: [] }),
    checkIsRepo: jest.fn().mockResolvedValue(true),
    revparse: jest.fn().mockResolvedValue('/mock/repo/root'),
    checkoutBranch: jest.fn().mockResolvedValue(undefined),
    checkout: jest.fn().mockResolvedValue(undefined),
    merge: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    rm: jest.fn().mockResolvedValue(undefined),
    raw: jest.fn().mockResolvedValue(''),
    branch: jest.fn().mockResolvedValue({ current: 'main', all: ['main'] }),
  })),
  SimpleGit: jest.fn(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue({ commit: 'mock-commit-hash' }),
    status: jest.fn().mockResolvedValue({
      current: 'main',
      tracking: null,
      ahead: 0,
      behind: 0,
      staged: [],
      modified: [],
      untracked: [],
      deleted: [],
      conflicted: [],
      isClean: true,
      files: [],
    }),
    log: jest.fn().mockResolvedValue({ all: [] }),
    checkIsRepo: jest.fn().mockResolvedValue(true),
    revparse: jest.fn().mockResolvedValue('/mock/repo/root'),
    checkoutBranch: jest.fn().mockResolvedValue(undefined),
    checkout: jest.fn().mockResolvedValue(undefined),
    merge: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    rm: jest.fn().mockResolvedValue(undefined),
    raw: jest.fn().mockResolvedValue(''),
    branch: jest.fn().mockResolvedValue({ current: 'main', all: ['main'] }),
  })),
}));
// (Duplicate imports removed above)

type MockFsExtra = typeof fs & { _clearFs: () => void; _getFsStore: () => Map<string, string | Buffer> };

describe('GitService Exclude Error Handling', () => {
  let gitService: GitService;
  let fileSystem: FileSystemService;
  let testDir: string;
  let gitExcludePath: string;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(async (): Promise<void> => {
    // Clear the in-memory file system for each test
    (fs as MockFsExtra)._clearFs();

    // Create a fixed test directory in the mocked file system
    testDir = '/mock-git-repo';
    await fs.ensureDir(testDir);

    // Manually create git directory structure instead of calling initRepository
    await fs.ensureDir(path.join(testDir, '.git', 'info'));
    gitExcludePath = path.join(testDir, '.git', 'info', 'exclude');
    await fs.writeFile(gitExcludePath, '');

    // Mock LoggerService
    const mockLogger = new LoggerService();
    jest.spyOn(mockLogger, 'info').mockImplementation(() => {});
    jest.spyOn(mockLogger, 'warn').mockImplementation(() => {});
    jest.spyOn(mockLogger, 'error').mockImplementation(() => {});
    jest.spyOn(mockLogger, 'success').mockImplementation(() => {});
    jest.spyOn(mockLogger, 'debug').mockImplementation(() => {});

    // Initialize git repository with the container-relative testDir as projectRoot
    fileSystem = new FileSystemService();
    gitService = new GitService(testDir, fileSystem, undefined, mockLogger);

    // Mock isRepository to return true for our test directory, but allow other instances to work normally
    jest.spyOn(gitService, 'isRepository').mockResolvedValue(true);

    // Spy on console.warn to capture warning messages
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Clear spy call history from previous tests
    consoleWarnSpy.mockClear();
  });

  afterEach((): void => {
    if (consoleWarnSpy) {
      consoleWarnSpy.mockRestore();
    }

    // Restore all mocks
    jest.restoreAllMocks();

    // No need to remove testDir explicitly, as fsStore is cleared in beforeEach
  });

  describe('Input Validation', () => {
    it('should handle empty paths gracefully in addToGitExclude', async () => {
      await expect(gitService.addToGitExclude('')).rejects.toThrow(GitExcludeValidationError);
      await expect(gitService.addToGitExclude('   ')).rejects.toThrow(GitExcludeValidationError);
    });

    it('should handle null characters in paths', async () => {
      await expect(gitService.addToGitExclude('test\0file')).rejects.toThrow(
        GitExcludeValidationError,
      );
    });

    it('should handle extremely long paths', async () => {
      const longPath = 'a'.repeat(5000);
      await expect(gitService.addToGitExclude(longPath)).rejects.toThrow(GitExcludeValidationError);
    });

    it('should validate multiple paths in batch operations', async () => {
      const result = await gitService.addMultipleToGitExclude([
        'valid-path',
        '',
        'test\0file',
        '   ',
      ]);

      expect(result.successful).toEqual(['valid-path']);
      expect(result.failed).toHaveLength(3);
      expect(result.failed[0].error).toContain('Path must be a non-empty string');
      expect(result.failed[1].error).toContain('null character');
      expect(result.failed[2].error).toContain(
        'Path ends with space or dot (problematic on Windows)',
      );
    });
  });

  describe('Permission Errors', () => {
    it('should handle permission denied errors gracefully', async () => {
      // Ensure exclude file exists
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      // Create .git/info directory
      const gitInfoDir = path.dirname(gitExcludePath);
      await fs.ensureDir(gitInfoDir);

      // Mock fs.ensureDir to simulate permission error for the directory
      const ensureSpy = jest
        .spyOn(fs, 'ensureDir')
        .mockImplementation((dirPath: string): Promise<void> => {
          if (dirPath === gitInfoDir || dirPath.endsWith('.git/info')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return (jest.requireActual('fs-extra') as typeof import('fs-extra')).ensureDir(dirPath);
        });

      try {
        // This should not throw but should log a warning
        await gitService.addToGitExclude('test-file.txt');

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Permission denied during add operation'),
        );
      } finally {
        ensureSpy.mockRestore();
      }
    });

    it('should handle permission errors in batch operations', async () => {
      // Ensure exclude file exists
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      const gitInfoDir = path.dirname(gitExcludePath);
      await fs.ensureDir(gitInfoDir);

      const ensureSpy = jest
        .spyOn(fs, 'ensureDir')
        .mockImplementation((dirPath: string): Promise<void> => {
          if (dirPath === gitInfoDir || dirPath.endsWith('.git/info')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
            return (jest.requireActual('fs-extra') as typeof import('fs-extra')).ensureDir(dirPath);
        });

      try {
        const result = await gitService.addMultipleToGitExclude(['file1.txt', 'file2.txt']);

        expect(result.successful).toHaveLength(0);
        expect(result.failed).toHaveLength(2);
        expect(consoleWarnSpy).toHaveBeenCalled();
      } finally {
        ensureSpy.mockRestore();
      }
    });
  });

  describe('File Corruption Handling', () => {
    it('should handle corrupted exclude file gracefully', async () => {
      // Ensure exclude file exists first
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      // Create a corrupted exclude file (binary data)
      const corruptedData = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0x03]);
      await fs.writeFile(gitExcludePath, corruptedData);

      // This should handle the corruption gracefully
      const result = await gitService.isInGitExclude('test-file.txt');
      expect(result).toBe(false);
    });

    it('should recover from exclude file corruption during write operations', async () => {
      // Ensure exclude file exists first
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      // Create initial valid exclude file
      await fs.writeFile(gitExcludePath, '# Valid exclude file\ntest-existing.txt\n');

      // Simulate corruption by making fs.writeFile reject once for the exclude path
      const originalWrite = fs.writeFile.bind(fs) as typeof fs.writeFile;
      const writeSpy = jest
        .spyOn(fs, 'writeFile')
        .mockImplementationOnce((..._args: Parameters<typeof fs.writeFile>) => {
          const target = String(_args[0]);
          if (target.endsWith('.git/info/exclude')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalWrite(..._args);
        });

      try {
        // Adding new exclusion should handle corruption gracefully
        await expect(gitService.addToGitExclude('new-file.txt')).resolves.not.toThrow();
      } finally {
        writeSpy.mockRestore();
      }
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue pgit workflow when exclude operations fail', async () => {
      // Ensure exclude file exists
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      // Simulate a scenario where exclude operations fail but git operations succeed
      const gitInfoDir = path.dirname(gitExcludePath);
      await fs.ensureDir(gitInfoDir);

      // Create a file that will cause write errors
      await fs.writeFile(gitExcludePath, 'initial content');

      // Mock fs.writeFile to reject for the exclude path
      const originalWrite2 = fs.writeFile.bind(fs) as typeof fs.writeFile;
      const writeSpy = jest
        .spyOn(fs, 'writeFile')
        .mockImplementation((..._args: Parameters<typeof fs.writeFile>) => {
          const target = String(_args[0]);
          if (target.endsWith('.git/info/exclude')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalWrite2(..._args);
        });

      try {
        // This should not throw, allowing the main pgit workflow to continue
        await gitService.addToGitExclude('test-file.txt');

        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Warning:'));
      } finally {
        writeSpy.mockRestore();
      }
    });

    it('should handle missing .git/info directory gracefully', async () => {
      // Ensure exclude file exists first
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      // Remove .git/info directory
      const gitInfoDir = path.dirname(gitExcludePath);
      if (await fs.pathExists(gitInfoDir)) {
        await fs.remove(gitInfoDir);
      }

      // This should create the directory and continue
      await gitService.addToGitExclude('test-file.txt');

      // Verify the directory was created and file was added
      expect(await fs.pathExists(gitExcludePath)).toBe(true);
      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('test-file.txt');
    });
  });

  describe('Batch Operation Error Handling', () => {
    it('should handle mixed success and failure in batch operations', async () => {
      // Ensure exclude file exists first
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      // Create exclude file with some existing content
      await fs.writeFile(gitExcludePath, '# Existing content\nexisting-file.txt\n');

      const paths = ['valid-file1.txt', '', 'valid-file2.txt', 'test\0invalid'];
      const result = await gitService.addMultipleToGitExclude(paths);

      expect(result.successful).toEqual(['valid-file1.txt', 'valid-file2.txt']);
      expect(result.failed).toHaveLength(2);

      // Verify successful files were added
      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('valid-file1.txt');
      expect(content).toContain('valid-file2.txt');
    });

    it('should handle batch removal with mixed results', async () => {
      // Ensure exclude file exists first
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      // Create exclude file with test content
      const initialContent = `${PGIT_MARKER_COMMENT}
 file1.txt
 file2.txt
 file3.txt
 `;
      await fs.writeFile(gitExcludePath, initialContent);

      const result = await gitService.removeMultipleFromGitExclude([
        'file1.txt',
        '',
        'file2.txt',
        'nonexistent.txt',
      ]);

      expect(result.successful).toEqual(['file1.txt', 'file2.txt', 'nonexistent.txt']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('Path must be a non-empty string');

      // Verify successful removals
      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).not.toContain('file1.txt');
      expect(content).not.toContain('file2.txt');
      expect(content).toContain('file3.txt');
    });
  });

  describe('Error Recovery', () => {
    it('should recover from temporary file system errors', async () => {
      // Ensure exclude file exists first
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      // Create exclude file
      await fs.writeFile(gitExcludePath, '# Initial content\n');

      // First operation should succeed
      await gitService.addToGitExclude('test-file1.txt');

      let content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('test-file1.txt');

      // Mock fs.writeFile to simulate permission error
      const actualFs = jest.requireActual('fs-extra') as typeof import('fs-extra');
      const originalWrite = actualFs.writeFile.bind(actualFs) as typeof fs.writeFile;
      (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mockImplementation(
        (..._args: Parameters<typeof fs.writeFile>) => {
          const target = String(_args[0]);
          if (target.endsWith('.git/info/exclude')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalWrite(..._args);
        },
      );

      try {
        await gitService.addToGitExclude('test-file2.txt'); // Should log warning
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Warning:'));
      } finally {
        // Restore original implementation
        (fs.writeFile as unknown as jest.Mock).mockImplementation(originalWrite as FsAnyFn);
      }

      // Restore permissions and try again
      await gitService.addToGitExclude('test-file3.txt'); // Should succeed

      content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('test-file1.txt');
      expect(content).toContain('test-file3.txt');
    });
  });

  describe('Warning Message Quality', () => {
    it('should provide informative warning messages', async () => {
      // Ensure exclude file exists
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      const gitInfoDir = path.dirname(gitExcludePath);
      await fs.ensureDir(gitInfoDir);

      const originalEnsure = fs.ensureDir.bind(fs) as typeof fs.ensureDir;
      const ensureSpy = jest
        .spyOn(fs, 'ensureDir')
        .mockImplementation((..._args: Parameters<typeof fs.ensureDir>) => {
          const target = String(_args[0]);
          if (target === gitInfoDir || target.endsWith('.git/info')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalEnsure(..._args);
        });

      try {
        await gitService.addToGitExclude('test-file.txt');

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/Warning:.*Permission denied.*add operation/i),
        );
      } finally {
        ensureSpy.mockRestore();
      }
    });

    it('should include affected paths in warning messages for batch operations', async () => {
      // Ensure exclude file exists
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      const gitInfoDir = path.dirname(gitExcludePath);
      await fs.ensureDir(gitInfoDir);

      const originalEnsure2 = fs.ensureDir.bind(fs) as typeof fs.ensureDir;
      const ensureSpy = jest
        .spyOn(fs, 'ensureDir')
        .mockImplementation((..._args: Parameters<typeof fs.ensureDir>) => {
          const target = String(_args[0]);
          if (target === gitInfoDir || target.endsWith('.git/info')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalEnsure2(..._args);
        });

      try {
        await gitService.addMultipleToGitExclude(['file1.txt', 'file2.txt']);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/Warning:.*\(paths: file1\.txt, file2\.txt\)/i),
        );
      } finally {
        ensureSpy.mockRestore();
      }
    });
  });

  describe('Non-Git Repository Handling', () => {
    it('should handle operations in non-git directories gracefully', async () => {
      // Ensure exclude file exists first
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '');

      // Create a new directory in /tmp to avoid parent git repositories
      const nonGitDir = path.join('/tmp', `non-git-test-${Date.now()}`);
      await fs.ensureDir(nonGitDir);

      const nonGitService = new GitService(nonGitDir, fileSystem);
      
      // Explicitly mock this instance to return false for isRepository
      jest.spyOn(nonGitService, 'isRepository').mockResolvedValue(false);

      // Check if it's actually detected as a non-git repository
      const isRepo = await nonGitService.isRepository();
      expect(isRepo).toBe(false);

      // These operations should throw RepositoryNotFoundError since ensureRepository() is called
      await expect(nonGitService.addToGitExclude('test.txt')).rejects.toThrow();

      // Clean up
      await fs.remove(nonGitDir);
    });
  });
});
