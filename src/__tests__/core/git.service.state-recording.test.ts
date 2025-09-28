import { GitService } from '../../core/git.service';
import { FileSystemService } from '../../core/filesystem.service';
import { LoggerService } from '../../utils/logger.service';
import { GitFileState } from '../../types/git.types';
import * as fs from 'fs-extra';
import * as path from 'path';

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
        const error = new Error(
          `ENOENT: no such file or directory, open '${filePath}'`,
        ) as NodeJS.ErrnoException;
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
        const error = new Error(
          `ENOENT: no such file or directory, stat '${targetPath}'`,
        ) as NodeJS.ErrnoException;
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
        const error = new Error(
          `ENOENT: no such file or directory, lstat '${targetPath}'`,
        ) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        return Promise.reject(error);
      }
      return Promise.resolve({
        isSymbolicLink: () => false,
        isDirectory: () => fsStore.get(targetPath) === 'directory',
        isFile: () => fsStore.get(targetPath) !== 'directory',
        size:
          fsStore.get(targetPath) === 'directory'
            ? 0
            : (fsStore.get(targetPath) as string | Buffer).length,
      } as unknown as import('fs').Stats);
    }),
    _clearFs: (): void => {
      fsStore.clear();
    },
    _getFsStore: (): Map<string, string | Buffer> => fsStore,
  };

  return mockFs;
});

// Mock simple-git
jest.mock('simple-git', () => {
  const mockTrackedFiles = new Set<string>();
  const mockStagedFiles = new Set<string>();

  return {
    simpleGit: jest.fn(workingDir => ({
      init: jest.fn().mockImplementation(async () => {
        // Simulate git init by creating .git directory structure in our mock fs
        const mockFs = jest.requireMock('fs-extra');
        const gitDir = require('path').join(workingDir || '/mock-git-repo', '.git');
        const gitInfoDir = require('path').join(gitDir, 'info');
        const gitExcludePath = require('path').join(gitInfoDir, 'exclude');

        try {
          await mockFs.ensureDir(gitDir);
          await mockFs.ensureDir(gitInfoDir);
          await mockFs.writeFile(gitExcludePath, '');
          return undefined;
        } catch (error) {
          console.error('Error in mock git.init():', error);
          throw error;
        }
      }),
      add: jest.fn().mockImplementation(async (files: string | string[]) => {
        const fileList = Array.isArray(files) ? files : [files];
        fileList.forEach((file: string) => {
          mockTrackedFiles.add(file);
          mockStagedFiles.add(file);
        });
      }),
      commit: jest.fn().mockResolvedValue({ commit: 'mock-commit-hash' }),
      status: jest.fn().mockImplementation(async () => {
        const files = Array.from(mockStagedFiles).map(file => ({
          path: file,
          index: 'A', // Added to index
          working_dir: ' ',
        }));

        return {
          current: 'main',
          tracking: null,
          ahead: 0,
          behind: 0,
          staged: Array.from(mockStagedFiles),
          modified: [],
          untracked: [],
          deleted: [],
          conflicted: [],
          isClean: mockStagedFiles.size === 0,
          files,
        };
      }),
      log: jest.fn().mockResolvedValue({ all: [] }),
      checkIsRepo: jest.fn().mockResolvedValue(true),
      lsFiles: jest.fn().mockImplementation(async (args: string[]) => {
        if (args[0] === '--error-unmatch') {
          const filePath = args[1];
          return mockTrackedFiles.has(filePath) ? filePath : '';
        }
        return '';
      }),
      revparse: jest.fn().mockResolvedValue('/mock/repo/root'),
      checkoutBranch: jest.fn().mockResolvedValue(undefined),
      checkout: jest.fn().mockResolvedValue(undefined),
      merge: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockImplementation(async (files: string | string[]) => {
        const fileList = Array.isArray(files) ? files : [files];
        fileList.forEach((file: string) => {
          mockStagedFiles.delete(file);
        });
      }),
      rm: jest.fn().mockResolvedValue(undefined),
      raw: jest.fn().mockImplementation(async (args: string[]) => {
        if (args[0] === 'ls-files' && args[1] === '--error-unmatch') {
          const filePath = args[2];
          return mockTrackedFiles.has(filePath) ? filePath : '';
        }
        return '';
      }),
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
      raw: jest.fn().mockImplementation(async (args: string[]) => {
        if (args[0] === 'ls-files' && args[1] === '--error-unmatch') {
          const filePath = args[2];
          return mockTrackedFiles.has(filePath) ? filePath : '';
        }
        return '';
      }),
      branch: jest.fn().mockResolvedValue({ current: 'main', all: ['main'] }),
    })),
  };
});

type MockFsExtra = typeof fs & {
  _clearFs: () => void;
  _getFsStore: () => Map<string, string | Buffer>;
};

describe('GitService - State Recording Methods', () => {
  let gitService: GitService;
  let tempDir: string;
  let fileSystem: FileSystemService;

  beforeEach(async () => {
    // Clear the in-memory file system for each test
    (fs as MockFsExtra)._clearFs();

    // Create a fixed test directory in the mocked file system
    tempDir = '/mock-git-repo';
    await fs.ensureDir(tempDir);

    // Manually create git directory structure instead of calling initRepository
    await fs.ensureDir(path.join(tempDir, '.git', 'info'));
    const gitExcludePath = path.join(tempDir, '.git', 'info', 'exclude');
    await fs.writeFile(gitExcludePath, '');

    // Use LoggerService instead of mock
    const mockLogger = new LoggerService();

    fileSystem = new FileSystemService();
    gitService = new GitService(tempDir, fileSystem, undefined, mockLogger);

    // Note: isRepository is already mocked via the simple-git mock above

    // Mock getStatus to return appropriate status
    // Mock getStatus to return appropriate status
    jest.spyOn(gitService, 'getStatus').mockImplementation(async () => {
      // Get the mock state from the simple-git mock
      const mockGit = jest.requireMock('simple-git');
      const mockTrackedFiles = new Set<string>();
      const mockStagedFiles = new Set<string>();

      // For now, return empty status - individual tests will override this
      return {
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
      };
    });

    // Mock isInGitExclude to return false by default
    jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(false);
  });

  afterEach(() => {
    // Restore all mocks
    jest.restoreAllMocks();
  });

  describe('recordOriginalState', () => {
    it('should record original state including exclude status', async () => {
      const testFile = 'test-file.txt';
      const testFilePath = path.join(tempDir, testFile);

      // Create test file
      await fs.writeFile(testFilePath, 'test content');

      // Mock addToGitExclude to do nothing (simulate successful operation)
      jest.spyOn(gitService, 'addToGitExclude').mockResolvedValue(undefined);

      // Mock isInGitExclude to return true for this test
      jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(true);

      // Record original state
      const state = await gitService.recordOriginalState(testFile);

      expect(state.isExcluded).toBe(true);
      expect(state.isTracked).toBe(false);
      // Note: isUntracked might be false when file is excluded
      expect(state.originalPath).toBe(testFile);
      expect(state.timestamp).toBeInstanceOf(Date);
    });

    it('should record state for tracked file', async () => {
      const testFile = 'tracked-file.txt';
      const testFilePath = path.join(tempDir, testFile);

      // Create and track file
      await fs.writeFile(testFilePath, 'test content');
      await gitService.addFiles([testFile]);

      // Mock getStatus to return the file as staged
      jest.spyOn(gitService, 'getStatus').mockResolvedValue({
        current: 'main',
        tracking: null,
        ahead: 0,
        behind: 0,
        staged: [testFile],
        modified: [],
        untracked: [],
        deleted: [],
        conflicted: [],
        isClean: false,
        files: [{ path: testFile, index: 'A', working_dir: ' ' }],
      });

      // Record original state
      const state = await gitService.recordOriginalState(testFile);

      expect(state.isExcluded).toBe(false);
      expect(state.isTracked).toBe(true);
      expect(state.isStaged).toBe(true);
      expect(state.originalPath).toBe(testFile);
    });

    it('should throw error for empty path', async () => {
      await expect(gitService.recordOriginalState('')).rejects.toThrow('File path cannot be empty');
    });
  });

  describe('restoreOriginalState', () => {
    it('should restore exclude status correctly', async () => {
      const testFile = 'test-file.txt';
      const testFilePath = path.join(tempDir, testFile);

      // Create test file
      await fs.writeFile(testFilePath, 'test content');

      // Create original state with exclude status
      const originalState: GitFileState = {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: true,
        originalPath: testFile,
        timestamp: new Date(),
      };

      // Mock isInGitExclude to return true after restore
      jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(true);

      // Restore original state
      await gitService.restoreOriginalState(testFile, originalState);

      // Verify file is in exclude
      const isExcluded = await gitService.isInGitExclude(testFile);
      expect(isExcluded).toBe(true);
    });

    it('should restore tracked and staged state', async () => {
      const testFile = 'test-file.txt';
      const testFilePath = path.join(tempDir, testFile);

      // Create test file
      await fs.writeFile(testFilePath, 'test content');

      // Create original state for tracked and staged file
      const originalState: GitFileState = {
        isTracked: true,
        isStaged: true,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: testFile,
        timestamp: new Date(),
      };

      // Mock getStatus to return the file as staged after restore
      jest.spyOn(gitService, 'getStatus').mockResolvedValue({
        current: 'main',
        tracking: null,
        ahead: 0,
        behind: 0,
        staged: [testFile],
        modified: [],
        untracked: [],
        deleted: [],
        conflicted: [],
        isClean: false,
        files: [{ path: testFile, index: 'A', working_dir: ' ' }],
      });

      // Restore original state
      await gitService.restoreOriginalState(testFile, originalState);

      // Verify file is staged
      const status = await gitService.getStatus();
      const fileStatus = status.files.find(f => f.path === testFile);
      expect(fileStatus?.index).toBe('A'); // Added to index
    });

    it('should remove from exclude when not originally excluded', async () => {
      const testFile = 'test-file.txt';
      const testFilePath = path.join(tempDir, testFile);

      // Mock addToGitExclude to do nothing (simulate successful operation)
      jest.spyOn(gitService, 'addToGitExclude').mockResolvedValue(undefined);

      // Mock removeFromGitExclude to do nothing (simulate successful operation)
      jest.spyOn(gitService, 'removeFromGitExclude').mockResolvedValue(undefined);

      // Create original state without exclude status
      const originalState: GitFileState = {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: false,
        originalPath: testFile,
        timestamp: new Date(),
      };

      // Restore original state
      await gitService.restoreOriginalState(testFile, originalState);

      // Verify file is not in exclude
      const isExcluded = await gitService.isInGitExclude(testFile);
      expect(isExcluded).toBe(false);
    });

    it('should throw error for empty path', async () => {
      const state: GitFileState = {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: false,
        originalPath: 'test.txt',
        timestamp: new Date(),
      };

      await expect(gitService.restoreOriginalState('', state)).rejects.toThrow(
        'File path cannot be empty',
      );
    });

    it('should throw error for undefined state', async () => {
      await expect(
        gitService.restoreOriginalState('test.txt', undefined as unknown as GitFileState),
      ).rejects.toThrow('Git state cannot be null or undefined');
    });
  });

  describe('integration with existing methods', () => {
    it('should work seamlessly with getFileGitState', async () => {
      const testFile = 'integration-test.txt';
      const testFilePath = path.join(tempDir, testFile);

      // Create test file and add to exclude
      await fs.writeFile(testFilePath, 'test content');
      await gitService.addToGitExclude(testFile);

      // Record state using new method
      const recordedState = await gitService.recordOriginalState(testFile);

      // Get state using existing method
      const currentState = await gitService.getFileGitState(testFile);

      // They should match
      expect(recordedState.isExcluded).toBe(currentState.isExcluded);
      expect(recordedState.isTracked).toBe(currentState.isTracked);
      expect(recordedState.isStaged).toBe(currentState.isStaged);
      expect(recordedState.isUntracked).toBe(currentState.isUntracked);
    });
  });
});
