// Helper type for loosely-typed fs wrappers used only in tests
type FsAnyFn = (..._args: unknown[]) => unknown;

// Mock fs-extra early so its methods are configurable for jest spies in tests
jest.mock('fs-extra', () => {
  const actual = jest.requireActual('fs-extra');
  return {
    ...actual,
    // Expose key functions as jest.fn so tests can mock implementations safely
    writeFile: jest.fn((...args: unknown[]) => (actual.writeFile as FsAnyFn)(...args)),
    readFile: jest.fn((...args: unknown[]) => (actual.readFile as FsAnyFn)(...args)),
    ensureDir: jest.fn((...args: unknown[]) => (actual.ensureDir as FsAnyFn)(...args)),
    chmod: jest.fn((...args: unknown[]) => (actual.chmod as FsAnyFn)(...args)),
    pathExists: jest.fn((...args: unknown[]) => (actual.pathExists as FsAnyFn)(...args)),
    remove: jest.fn((...args: unknown[]) => (actual.remove as FsAnyFn)(...args)),
    stat: jest.fn((...args: unknown[]) => (actual.stat as FsAnyFn)(...args)),
    mkdtemp: jest.fn((...args: unknown[]) => (actual.mkdtemp as FsAnyFn)(...args)),
  };
});

// Mock native fs module's promises
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      writeFile: jest.fn((...args: unknown[]) => (actual.promises.writeFile as FsAnyFn)(...args)),
      readFile: jest.fn((...args: unknown[]) => (actual.promises.readFile as FsAnyFn)(...args)),
      chmod: jest.fn((...args: unknown[]) => (actual.promises.chmod as FsAnyFn)(...args)),
      stat: jest.fn((...args: unknown[]) => (actual.promises.stat as FsAnyFn)(...args)),
      lstat: jest.fn((...args: unknown[]) => (actual.promises.lstat as FsAnyFn)(...args)),
    },
  };
});

import { GitService } from '../../core/git.service';
import { FileSystemService } from '../../core/filesystem.service';
import { GitExcludeValidationError } from '../../errors/git.error';
import { PGIT_MARKER_COMMENT } from '../../types/config.types';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('GitService - Git Exclude Unit Tests', () => {
  let gitService: GitService;
  let fileSystemService: FileSystemService;
  let tempDir: string;
  let gitExcludePath: string;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pgit-exclude-unit-test-'));

    // Initialize git repository structure
    await fs.ensureDir(path.join(tempDir, '.git', 'info'));
    gitExcludePath = path.join(tempDir, '.git', 'info', 'exclude');

    fileSystemService = new FileSystemService();
    gitService = new GitService(tempDir, fileSystemService);

    // Mock isRepository to return true for our test directory
    jest.spyOn(gitService, 'isRepository').mockResolvedValue(true);

    // Spy on console methods to capture output
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Clear spy call history from previous tests
    consoleWarnSpy.mockClear();
    consoleLogSpy.mockClear();
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
    jest.restoreAllMocks();
  });

  describe('addToGitExclude method', () => {
    describe('basic functionality', () => {
      it('should create exclude file when it does not exist', async () => {
        const testPath = 'test-file.txt';

        expect(await fs.pathExists(gitExcludePath)).toBe(false);

        await gitService.addToGitExclude(testPath);

        expect(await fs.pathExists(gitExcludePath)).toBe(true);
        const content = await fs.readFile(gitExcludePath, 'utf8');
        expect(content).toContain(PGIT_MARKER_COMMENT);
        expect(content).toContain(testPath);
      });

      it('should add path to existing exclude file', async () => {
        const existingContent = '# Existing exclusions\n*.log\n*.tmp\n';
        await fs.writeFile(gitExcludePath, existingContent);

        const testPath = 'new-file.txt';
        await gitService.addToGitExclude(testPath);

        const content = await fs.readFile(gitExcludePath, 'utf8');
        expect(content).toContain('*.log'); // Preserve existing
        expect(content).toContain('*.tmp'); // Preserve existing
        expect(content).toContain(PGIT_MARKER_COMMENT);
        expect(content).toContain(testPath);
      });

      it('should create .git/info directory if it does not exist', async () => {
        await fs.remove(path.join(tempDir, '.git', 'info'));

        const testPath = 'test-file.txt';
        await gitService.addToGitExclude(testPath);

        expect(await fs.pathExists(gitExcludePath)).toBe(true);
        const content = await fs.readFile(gitExcludePath, 'utf8');
        expect(content).toContain(testPath);
      });

      it('should set proper file permissions on created exclude file', async () => {
        const testPath = 'test-file.txt';
        await gitService.addToGitExclude(testPath);

        const stats = await fs.stat(gitExcludePath);
        // Check that file is readable and writable by owner
        expect(stats.mode & 0o600).toBe(0o600);
      });
    });

    describe('duplicate prevention', () => {
      it('should not add duplicate entries', async () => {
        const testPath = 'duplicate-test.txt';

        // Add path twice
        await gitService.addToGitExclude(testPath);
        await gitService.addToGitExclude(testPath);

        const content = await fs.readFile(gitExcludePath, 'utf8');
        const occurrences = (content.match(new RegExp(testPath.replace('.', '\\.'), 'g')) || [])
          .length;
        expect(occurrences).toBe(1);

        // Should log that path already exists
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(`Path '${testPath}' is already in exclude file`),
        );
      });

      it('should not add duplicate pgit marker', async () => {
        const testPath1 = 'file1.txt';
        const testPath2 = 'file2.txt';

        await gitService.addToGitExclude(testPath1);
        await gitService.addToGitExclude(testPath2);

        const content = await fs.readFile(gitExcludePath, 'utf8');
        const markerOccurrences = (
          content.match(
            new RegExp(PGIT_MARKER_COMMENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          ) || []
        ).length;
        expect(markerOccurrences).toBe(1);
      });

      it('should detect existing entries in exclude file', async () => {
        const existingContent = `# Existing exclusions
*.log
${PGIT_MARKER_COMMENT}
existing-pgit-file.txt
`;
        await fs.writeFile(gitExcludePath, existingContent);

        // Try to add existing pgit-managed file
        await gitService.addToGitExclude('existing-pgit-file.txt');

        const content = await fs.readFile(gitExcludePath, 'utf8');
        const occurrences = (content.match(/existing-pgit-file\.txt/g) || []).length;
        expect(occurrences).toBe(1);
      });
    });

    describe('input validation', () => {
      it('should throw GitExcludeValidationError for empty path', async () => {
        await expect(gitService.addToGitExclude('')).rejects.toThrow(GitExcludeValidationError);
        await expect(gitService.addToGitExclude('   ')).rejects.toThrow(GitExcludeValidationError);
      });

      it('should throw GitExcludeValidationError for invalid characters', async () => {
        await expect(gitService.addToGitExclude('file\0.txt')).rejects.toThrow(
          GitExcludeValidationError,
        );
        await expect(gitService.addToGitExclude('file\x01.txt')).rejects.toThrow(
          GitExcludeValidationError,
        );
      });

      it('should throw GitExcludeValidationError for paths that are too long', async () => {
        const longPath = 'a'.repeat(5000);
        await expect(gitService.addToGitExclude(longPath)).rejects.toThrow(
          GitExcludeValidationError,
        );
      });

      it('should throw GitExcludeValidationError for directory traversal', async () => {
        await expect(gitService.addToGitExclude('../../../etc/passwd')).rejects.toThrow(
          GitExcludeValidationError,
        );
      });

      it('should throw GitExcludeValidationError for absolute paths', async () => {
        await expect(gitService.addToGitExclude('/absolute/path.txt')).rejects.toThrow(
          GitExcludeValidationError,
        );
      });
    });

    describe('error handling', () => {
      it('should handle permission errors gracefully', async () => {
        // Create exclude file
        await fs.writeFile(gitExcludePath, '# test');

        // Mock both fs-extra and native fs.promises writeFile to simulate permission error
        const actualFs = jest.requireActual('fs-extra');
        const actualFsNative = jest.requireActual('fs');
        const originalWrite = actualFs.writeFile.bind(actualFs) as unknown as FsAnyFn;
        const originalNativeWrite = actualFsNative.promises.writeFile.bind(actualFsNative.promises) as unknown as FsAnyFn;
        
        // Mock fs-extra writeFile
        (fs.writeFile as unknown as jest.Mock).mockImplementation((..._args: unknown[]) => {
          const target = String(_args[0]);
          if (target.endsWith('.git/info/exclude')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalWrite(..._args);
        });
        
        // Mock native fs.promises writeFile 
        const nativeFsPromises = jest.requireMock('fs').promises;
        (nativeFsPromises.writeFile as jest.Mock).mockImplementation((..._args: unknown[]) => {
          const target = String(_args[0]);
          if (target.endsWith('.git/info/exclude')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalNativeWrite(..._args);
        });

        try {
          // Should not throw but should log warning
          await expect(gitService.addToGitExclude('test.txt')).resolves.not.toThrow();

          // Check for either the scaffold warning or the exclude operation warning
          expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringMatching(/(Warning:|Scaffold warning:)/),
          );
        } finally {
          // Restore original implementations for both fs-extra and native fs
          (fs.writeFile as unknown as jest.Mock).mockImplementation(originalWrite as FsAnyFn);
          const nativeFsPromises = jest.requireMock('fs').promises;
          (nativeFsPromises.writeFile as jest.Mock).mockImplementation(originalNativeWrite as FsAnyFn);
        }
      });

      it('should handle directory permission errors gracefully', async () => {
        // Mock fs.ensureDir to simulate permission error when creating .git/info
        const actualFs2 = jest.requireActual('fs-extra');
        const originalEnsureDir = actualFs2.ensureDir.bind(actualFs2) as unknown as FsAnyFn;
        (fs.ensureDir as unknown as jest.Mock).mockImplementation((..._args: unknown[]) => {
          const target = String(_args[0]);
          if (target.endsWith('.git/info')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalEnsureDir(..._args);
        });

        try {
          await expect(gitService.addToGitExclude('test.txt')).resolves.not.toThrow();

          expect(consoleWarnSpy).toHaveBeenCalled();
        } finally {
          (fs.ensureDir as unknown as jest.Mock).mockImplementation(originalEnsureDir as FsAnyFn);
        }
      });

      it('should handle corrupted exclude file gracefully', async () => {
        // Create corrupted exclude file with binary content
        const binaryContent = Buffer.from([0xff, 0xfe, 0x00, 0x01]);
        await fs.writeFile(gitExcludePath, binaryContent);

        // Mock fs.readFile to throw when reading the exclude file to simulate corruption
        const actualFs3 = jest.requireActual('fs-extra');
        const originalRead = actualFs3.readFile.bind(actualFs3) as unknown as FsAnyFn;
        (fs.readFile as unknown as jest.Mock).mockImplementation((..._args: unknown[]) => {
          const target = String(_args[0]);
          if (target.endsWith('.git/info/exclude')) {
            const err = new Error('Invalid data: malformed content') as NodeJS.ErrnoException;
            err.code = 'EILSEQ';
            return Promise.reject(err);
          }
          return originalRead(..._args);
        });

        try {
          await expect(gitService.addToGitExclude('test.txt')).resolves.not.toThrow();

          // Should handle corruption gracefully
          expect(consoleWarnSpy).toHaveBeenCalled();
        } finally {
          (fs.readFile as unknown as jest.Mock).mockImplementation(originalRead as FsAnyFn);
        }
      });
    });
  });

  describe('removeFromGitExclude method', () => {
    describe('basic functionality', () => {
      it('should remove path from exclude file', async () => {
        const testPath = 'remove-test.txt';

        // First add the path
        await gitService.addToGitExclude(testPath);
        expect(await gitService.isInGitExclude(testPath)).toBe(true);

        // Then remove it
        await gitService.removeFromGitExclude(testPath);
        expect(await gitService.isInGitExclude(testPath)).toBe(false);

        // Check if file still exists (it might be deleted if empty)
        if (await fs.pathExists(gitExcludePath)) {
          const content = await fs.readFile(gitExcludePath, 'utf8');
          expect(content).not.toContain(testPath);
        }
      });

      it('should preserve other entries when removing path', async () => {
        const existingContent = '# Existing exclusions\n*.log\n*.tmp\n';
        await fs.writeFile(gitExcludePath, existingContent);

        const testPath = 'remove-me.txt';
        await gitService.addToGitExclude(testPath);
        await gitService.removeFromGitExclude(testPath);

        const content = await fs.readFile(gitExcludePath, 'utf8');
        expect(content).toContain('*.log'); // Should preserve existing
        expect(content).toContain('*.tmp'); // Should preserve existing
        expect(content).not.toContain(testPath);
      });

      it('should remove pgit marker when no pgit entries remain', async () => {
        const existingContent = '# Existing exclusions\n*.log\n';
        await fs.writeFile(gitExcludePath, existingContent);

        const testPath = 'temporary.txt';
        await gitService.addToGitExclude(testPath);
        await gitService.removeFromGitExclude(testPath);

        const content = await fs.readFile(gitExcludePath, 'utf8');
        expect(content).toContain('*.log'); // Should preserve existing
        expect(content).not.toContain(PGIT_MARKER_COMMENT);
        expect(content).not.toContain(testPath);
      });

      it('should keep pgit marker when other pgit entries remain', async () => {
        const testPath1 = 'keep-me.txt';
        const testPath2 = 'remove-me.txt';

        await gitService.addToGitExclude(testPath1);
        await gitService.addToGitExclude(testPath2);
        await gitService.removeFromGitExclude(testPath2);

        const content = await fs.readFile(gitExcludePath, 'utf8');
        expect(content).toContain(PGIT_MARKER_COMMENT);
        expect(content).toContain(testPath1);
        expect(content).not.toContain(testPath2);
      });

      it('should delete exclude file when it becomes empty', async () => {
        const testPath = 'only-entry.txt';

        await gitService.addToGitExclude(testPath);
        expect(await fs.pathExists(gitExcludePath)).toBe(true);

        await gitService.removeFromGitExclude(testPath);
        expect(await fs.pathExists(gitExcludePath)).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle non-existent exclude file gracefully', async () => {
        const testPath = 'non-existent.txt';

        expect(await fs.pathExists(gitExcludePath)).toBe(false);

        // Should not throw error when exclude file doesn't exist
        await expect(gitService.removeFromGitExclude(testPath)).resolves.not.toThrow();
      });

      it('should handle non-existent path gracefully', async () => {
        const existingPath = 'existing.txt';
        const nonExistentPath = 'non-existent.txt';

        await gitService.addToGitExclude(existingPath);

        // Should not throw error when path doesn't exist in exclude file
        await expect(gitService.removeFromGitExclude(nonExistentPath)).resolves.not.toThrow();

        // Should still contain the existing path
        expect(await gitService.isInGitExclude(existingPath)).toBe(true);
      });

      it('should handle exclude file with only comments', async () => {
        const commentOnlyContent = '# Only comments\n# No actual exclusions\n';
        await fs.writeFile(gitExcludePath, commentOnlyContent);

        await expect(gitService.removeFromGitExclude('non-existent.txt')).resolves.not.toThrow();

        // File should still exist with comments
        expect(await fs.pathExists(gitExcludePath)).toBe(true);
        const content = await fs.readFile(gitExcludePath, 'utf8');
        expect(content).toContain('# Only comments');
      });
    });

    describe('input validation', () => {
      it('should throw GitExcludeValidationError for empty path', async () => {
        await expect(gitService.removeFromGitExclude('')).rejects.toThrow(
          GitExcludeValidationError,
        );
        await expect(gitService.removeFromGitExclude('   ')).rejects.toThrow(
          GitExcludeValidationError,
        );
      });

      it('should throw GitExcludeValidationError for invalid characters', async () => {
        await expect(gitService.removeFromGitExclude('file\0.txt')).rejects.toThrow(
          GitExcludeValidationError,
        );
      });
    });

    describe('error handling', () => {
      it('should handle permission errors gracefully', async () => {
        const testPath = 'permission-test.txt';

        // Add path first
        await gitService.addToGitExclude(testPath);

        // Mock both fs-extra and native fs.promises operations to simulate permission error
        const actualFs = jest.requireActual('fs-extra');
        const actualFsNative = jest.requireActual('fs');
        const originalWrite = actualFs.writeFile.bind(actualFs) as unknown as FsAnyFn;
        const originalRead = actualFs.readFile.bind(actualFs) as unknown as FsAnyFn;
        const originalNativeWrite = actualFsNative.promises.writeFile.bind(actualFsNative.promises) as unknown as FsAnyFn;
        const originalNativeRead = actualFsNative.promises.readFile.bind(actualFsNative.promises) as unknown as FsAnyFn;

        // Mock fs-extra operations
        (fs.writeFile as unknown as jest.Mock).mockImplementation((..._args: unknown[]) => {
          const target = String(_args[0]);
          if (target.endsWith('.git/info/exclude')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalWrite(..._args);
        });

        (fs.readFile as unknown as jest.Mock).mockImplementation((..._args: unknown[]) => {
          const target = String(_args[0]);
          if (target.endsWith('.git/info/exclude')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalRead(..._args);
        });
        
        // Mock native fs.promises operations
        const nativeFsPromises = jest.requireMock('fs').promises;
        (nativeFsPromises.writeFile as jest.Mock).mockImplementation((..._args: unknown[]) => {
          const target = String(_args[0]);
          if (target.endsWith('.git/info/exclude')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalNativeWrite(..._args);
        });
        
        (nativeFsPromises.readFile as jest.Mock).mockImplementation((..._args: unknown[]) => {
          const target = String(_args[0]);
          if (target.endsWith('.git/info/exclude')) {
            const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            return Promise.reject(err);
          }
          return originalNativeRead(..._args);
        });

        try {
          // Should not throw but should log warning
          await expect(gitService.removeFromGitExclude(testPath)).resolves.not.toThrow();

          // Check for either the scaffold warning or the exclude operation warning
          expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringMatching(/(Warning:|Scaffold warning:)/),
          );
        } finally {
          // Restore original implementations for both fs-extra and native fs
          (fs.writeFile as unknown as jest.Mock).mockImplementation(originalWrite as FsAnyFn);
          (fs.readFile as unknown as jest.Mock).mockImplementation(originalRead as FsAnyFn);
          const nativeFsPromises = jest.requireMock('fs').promises;
          (nativeFsPromises.writeFile as jest.Mock).mockImplementation(originalNativeWrite as FsAnyFn);
          (nativeFsPromises.readFile as jest.Mock).mockImplementation(originalNativeRead as FsAnyFn);
        }
      });

      it('should handle corrupted exclude file gracefully', async () => {
        // Create corrupted exclude file
        const binaryContent = Buffer.from([0xff, 0xfe, 0x00, 0x01]);
        await fs.writeFile(gitExcludePath, binaryContent);

        await expect(gitService.removeFromGitExclude('test.txt')).resolves.not.toThrow();

        // Should handle corruption gracefully
        expect(consoleWarnSpy).toHaveBeenCalled();
      });
    });
  });

  describe('exclude file creation and modification scenarios', () => {
    it('should create exclude file with proper structure', async () => {
      const testPath = 'structure-test.txt';

      await gitService.addToGitExclude(testPath);

      const content = await fs.readFile(gitExcludePath, 'utf8');
      const lines = content.split('\n');

      // Should have pgit marker
      expect(lines).toContain(PGIT_MARKER_COMMENT);

      // Should have the test path
      expect(lines).toContain(testPath);

      // Should end with newline
      expect(content.endsWith('\n')).toBe(true);
    });

    it('should maintain proper file structure during modifications', async () => {
      const existingContent = `# System exclusions
*.log
*.tmp

# User exclusions
node_modules/
dist/
`;
      await fs.writeFile(gitExcludePath, existingContent);

      // Add pgit entries
      await gitService.addToGitExclude('pgit1.txt');
      await gitService.addToGitExclude('pgit2.txt');

      const afterAddContent = await fs.readFile(gitExcludePath, 'utf8');

      // Should preserve existing structure
      expect(afterAddContent).toContain('# System exclusions');
      expect(afterAddContent).toContain('# User exclusions');
      expect(afterAddContent).toContain('*.log');
      expect(afterAddContent).toContain('node_modules/');

      // Should add pgit section
      expect(afterAddContent).toContain(PGIT_MARKER_COMMENT);
      expect(afterAddContent).toContain('pgit1.txt');
      expect(afterAddContent).toContain('pgit2.txt');

      // Remove one pgit entry
      await gitService.removeFromGitExclude('pgit1.txt');

      const afterRemoveContent = await fs.readFile(gitExcludePath, 'utf8');

      // Should still preserve existing structure
      expect(afterRemoveContent).toContain('# System exclusions');
      expect(afterRemoveContent).toContain('*.log');
      expect(afterRemoveContent).toContain('node_modules/');

      // Should keep remaining pgit entry
      expect(afterRemoveContent).toContain(PGIT_MARKER_COMMENT);
      expect(afterRemoveContent).toContain('pgit2.txt');
      expect(afterRemoveContent).not.toContain('pgit1.txt');
    });

    it('should handle multiple consecutive modifications correctly', async () => {
      const paths = ['file1.txt', 'file2.txt', 'file3.txt', 'file4.txt'];

      // Add all paths
      for (const filePath of paths) {
        await gitService.addToGitExclude(filePath);
      }

      let content = await fs.readFile(gitExcludePath, 'utf8');
      for (const filePath of paths) {
        expect(content).toContain(filePath);
      }

      // Remove every other path
      await gitService.removeFromGitExclude(paths[1]);
      await gitService.removeFromGitExclude(paths[3]);

      content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain(paths[0]);
      expect(content).not.toContain(paths[1]);
      expect(content).toContain(paths[2]);
      expect(content).not.toContain(paths[3]);

      // Should still have pgit marker since entries remain
      expect(content).toContain(PGIT_MARKER_COMMENT);
    });

    it('should handle empty exclude file creation and cleanup', async () => {
      const testPath = 'cleanup-test.txt';

      // Start with no exclude file
      expect(await fs.pathExists(gitExcludePath)).toBe(false);

      // Add entry (creates file)
      await gitService.addToGitExclude(testPath);
      expect(await fs.pathExists(gitExcludePath)).toBe(true);

      // Remove entry (should delete file since it becomes empty)
      await gitService.removeFromGitExclude(testPath);
      expect(await fs.pathExists(gitExcludePath)).toBe(false);
    });
  });

  describe('existing entry preservation', () => {
    it('should preserve all types of existing entries', async () => {
      const complexExistingContent = `# Generated by IDE
.idea/
.vscode/

# OS generated files
.DS_Store
Thumbs.db

# Build outputs
*.o
*.so
*.dylib

# Logs
*.log
logs/

# Temporary files
*.tmp
*.swp
*~

# Package manager
node_modules/
vendor/

# Custom patterns
src/**/*.backup
test/fixtures/*
!test/fixtures/important.txt
`;

      await fs.writeFile(gitExcludePath, complexExistingContent);

      // Add pgit entries
      const pgitPaths = ['pgit-file1.txt', 'pgit-file2.txt'];
      for (const pgitPath of pgitPaths) {
        await gitService.addToGitExclude(pgitPath);
      }

      const afterAddContent = await fs.readFile(gitExcludePath, 'utf8');

      // Should preserve all existing entries
      expect(afterAddContent).toContain('.idea/');
      expect(afterAddContent).toContain('.DS_Store');
      expect(afterAddContent).toContain('*.log');
      expect(afterAddContent).toContain('node_modules/');
      expect(afterAddContent).toContain('src/**/*.backup');
      expect(afterAddContent).toContain('!test/fixtures/important.txt');

      // Should add pgit entries
      expect(afterAddContent).toContain(PGIT_MARKER_COMMENT);
      for (const pgitPath of pgitPaths) {
        expect(afterAddContent).toContain(pgitPath);
      }

      // Remove pgit entries
      for (const pgitPath of pgitPaths) {
        await gitService.removeFromGitExclude(pgitPath);
      }

      const afterRemoveContent = await fs.readFile(gitExcludePath, 'utf8');

      // Should still preserve all existing entries
      expect(afterRemoveContent).toContain('.idea/');
      expect(afterRemoveContent).toContain('.DS_Store');
      expect(afterRemoveContent).toContain('*.log');
      expect(afterRemoveContent).toContain('node_modules/');
      expect(afterRemoveContent).toContain('src/**/*.backup');
      expect(afterRemoveContent).toContain('!test/fixtures/important.txt');

      // Should not have pgit marker or entries
      expect(afterRemoveContent).not.toContain(PGIT_MARKER_COMMENT);
      for (const pgitPath of pgitPaths) {
        expect(afterRemoveContent).not.toContain(pgitPath);
      }
    });

    it('should preserve entry order and formatting', async () => {
      const formattedContent = `# System files
.DS_Store

# IDE files
.idea/
.vscode/

# Build files
dist/
build/
`;

      await fs.writeFile(gitExcludePath, formattedContent);

      // Add and remove pgit entry
      await gitService.addToGitExclude('pgit-temp.txt');
      await gitService.removeFromGitExclude('pgit-temp.txt');

      const finalContent = await fs.readFile(gitExcludePath, 'utf8');

      // Should preserve original formatting and order
      expect(finalContent).toBe(formattedContent);
    });

    it('should handle mixed comment styles', async () => {
      const mixedComments = `# Standard comment
## Double hash comment
### Triple hash comment
# Comment with special chars: !@#$%^&*()
# Comment with unicode: 测试 🚀
*.log
`;

      await fs.writeFile(gitExcludePath, mixedComments);

      await gitService.addToGitExclude('test.txt');
      await gitService.removeFromGitExclude('test.txt');

      const finalContent = await fs.readFile(gitExcludePath, 'utf8');

      // Should preserve all comment styles
      expect(finalContent).toContain('# Standard comment');
      expect(finalContent).toContain('## Double hash comment');
      expect(finalContent).toContain('### Triple hash comment');
      expect(finalContent).toContain('# Comment with special chars: !@#$%^&*()');
      expect(finalContent).toContain('# Comment with unicode: 测试 🚀');
      expect(finalContent).toContain('*.log');
    });
  });
});
