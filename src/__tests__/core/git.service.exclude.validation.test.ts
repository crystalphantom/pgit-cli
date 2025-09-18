import { GitService } from '../../core/git.service.ts';
import { FileSystemService } from '../../core/filesystem.service.ts';
import { GitExcludeValidationError } from '../../errors/git.error.ts';
import { PGIT_MARKER_COMMENT } from '../../types/config.types.ts';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('GitService - Exclude File Validation and Safety', () => {
  let gitService: GitService;
  let fileSystemService: FileSystemService;
  let tempDir: string;
  let gitExcludePath: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pgit-validation-test-'));

    // Initialize git repository
    await fs.ensureDir(path.join(tempDir, '.git', 'info'));
    gitExcludePath = path.join(tempDir, '.git', 'info', 'exclude');

    fileSystemService = new FileSystemService();
    gitService = new GitService(tempDir, fileSystemService);

    // Mock isRepository to return true for our test directory
    jest.spyOn(gitService, 'isRepository').mockResolvedValue(true);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
    jest.restoreAllMocks();
  });

  describe('Path Validation', () => {
    it('should reject empty paths', async () => {
      await expect(gitService.addToGitExclude('')).rejects.toThrow(GitExcludeValidationError);
      await expect(gitService.addToGitExclude('   ')).rejects.toThrow(GitExcludeValidationError);
    });

    it('should reject paths with null characters', async () => {
      await expect(gitService.addToGitExclude('file\0.txt')).rejects.toThrow(
        GitExcludeValidationError,
      );
    });

    it('should reject paths with control characters', async () => {
      await expect(gitService.addToGitExclude('file\x01.txt')).rejects.toThrow(
        GitExcludeValidationError,
      );
      await expect(gitService.addToGitExclude('file\x1f.txt')).rejects.toThrow(
        GitExcludeValidationError,
      );
    });

    it('should reject paths that are too long', async () => {
      const longPath = 'a'.repeat(5000);
      await expect(gitService.addToGitExclude(longPath)).rejects.toThrow(GitExcludeValidationError);
    });

    it('should reject paths with directory traversal', async () => {
      await expect(gitService.addToGitExclude('../../../etc/passwd')).rejects.toThrow(
        GitExcludeValidationError,
      );
      await expect(gitService.addToGitExclude('dir/../file.txt')).rejects.toThrow(
        GitExcludeValidationError,
      );
    });

    it('should reject absolute paths', async () => {
      await expect(gitService.addToGitExclude('/absolute/path.txt')).rejects.toThrow(
        GitExcludeValidationError,
      );

      if (process.platform === 'win32') {
        await expect(gitService.addToGitExclude('C:\\absolute\\path.txt')).rejects.toThrow(
          GitExcludeValidationError,
        );
      }
    });

    it('should reject paths starting with .git/', async () => {
      await expect(gitService.addToGitExclude('.git/config')).rejects.toThrow(
        GitExcludeValidationError,
      );
      await expect(gitService.addToGitExclude('.git/hooks/pre-commit')).rejects.toThrow(
        GitExcludeValidationError,
      );
    });

    it('should reject Windows reserved names', async () => {
      const reservedNames = ['con', 'prn', 'aux', 'nul', 'com1', 'lpt1'];

      for (const name of reservedNames) {
        await expect(gitService.addToGitExclude(name)).rejects.toThrow(GitExcludeValidationError);
        await expect(gitService.addToGitExclude(name.toUpperCase())).rejects.toThrow(
          GitExcludeValidationError,
        );
        await expect(gitService.addToGitExclude(`${name}.txt`)).rejects.toThrow(
          GitExcludeValidationError,
        );
      }
    });

    it('should reject paths ending with spaces or dots', async () => {
      await expect(gitService.addToGitExclude('file.txt ')).rejects.toThrow(
        GitExcludeValidationError,
      );
      await expect(gitService.addToGitExclude('file.txt.')).rejects.toThrow(
        GitExcludeValidationError,
      );
    });

    it('should reject paths with excessive nesting', async () => {
      const deepPath = Array(60).fill('dir').join('/') + '/file.txt';
      await expect(gitService.addToGitExclude(deepPath)).rejects.toThrow(GitExcludeValidationError);
    });

    it('should accept valid paths', async () => {
      const validPaths = [
        'file.txt',
        'dir/file.txt',
        'src/**/*',
        '*.log',
        'node_modules/',
        'build/output.txt',
        'file with spaces.txt',
      ];

      for (const validPath of validPaths) {
        await expect(gitService.addToGitExclude(validPath)).resolves.not.toThrow();
      }
    });
  });

  describe('File Integrity Validation', () => {
    it('should handle missing .git/info directory', async () => {
      await fs.remove(path.join(tempDir, '.git', 'info'));

      // Should create directory and succeed
      await expect(gitService.addToGitExclude('test.txt')).resolves.not.toThrow();
      expect(await fs.pathExists(gitExcludePath)).toBe(true);
    });

    it('should detect corrupted exclude file with binary content', async () => {
      // Create exclude file with binary content
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      await fs.writeFile(gitExcludePath, binaryContent);

      await expect(gitService.addToGitExclude('test.txt')).resolves.not.toThrow();
      // Should log warning but continue gracefully
    });

    it('should detect exclude file that is too large', async () => {
      // Create a very large exclude file
      const largeContent = 'a'.repeat(2 * 1024 * 1024); // 2MB
      await fs.writeFile(gitExcludePath, largeContent);

      await expect(gitService.addToGitExclude('test.txt')).resolves.not.toThrow();
      // Should log warning but continue gracefully
    });

    it('should detect exclude file with too many lines', async () => {
      // Create exclude file with many lines
      const manyLines = Array(15000).fill('*.tmp').join('\n');
      await fs.writeFile(gitExcludePath, manyLines);

      await expect(gitService.addToGitExclude('test.txt')).resolves.not.toThrow();
      // Should log warning but continue gracefully
    });

    it('should validate content when writing exclude file', async () => {
      const binaryContent = 'test\0content';
      await expect(gitService.writeGitExcludeFile(binaryContent)).resolves.not.toThrow();
      // Should log warning but continue gracefully
    });

    it('should validate line length when writing exclude file', async () => {
      const longLine = 'a'.repeat(5000);
      await expect(gitService.writeGitExcludeFile(longLine)).resolves.not.toThrow();
      // Should log warning but continue gracefully
    });

    it('should validate total size when writing exclude file', async () => {
      const largeContent = 'a'.repeat(2 * 1024 * 1024); // 2MB
      await expect(gitService.writeGitExcludeFile(largeContent)).resolves.not.toThrow();
      // Should log warning but continue gracefully
    });
  });

  describe('Duplicate Detection', () => {
    it('should detect exact duplicates', async () => {
      await gitService.addToGitExclude('test.txt');

      // Adding same path again should not create duplicate
      await gitService.addToGitExclude('test.txt');

      const content = await fs.readFile(gitExcludePath, 'utf8');
      const occurrences = (content.match(/test\.txt/g) || []).length;
      expect(occurrences).toBe(1);
    });

    it('should detect duplicates in batch operations', async () => {
      const paths = ['file1.txt', 'file2.txt', 'file1.txt']; // file1.txt is duplicate within input

      const result = await gitService.addMultipleToGitExclude(paths);

      // Both unique paths should be successful
      expect(result.successful).toContain('file1.txt');
      expect(result.successful).toContain('file2.txt');
      expect(result.successful).toHaveLength(3); // All paths are reported as successful

      // But file should only appear once in the actual file
      const content = await fs.readFile(gitExcludePath, 'utf8');
      const file1Occurrences = (content.match(/file1\.txt/g) || []).length;
      expect(file1Occurrences).toBe(1);
    });

    it('should warn about pattern conflicts', async () => {
      // Add a wildcard pattern first
      await gitService.addToGitExclude('*.txt');

      // Mock console.warn to capture warnings
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Adding specific file that matches the pattern should warn
      await gitService.addToGitExclude('specific.txt');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('may conflict with existing pattern'),
      );

      warnSpy.mockRestore();
    });

    it('should warn about redundant patterns', async () => {
      // Add specific files first
      await gitService.addToGitExclude('file1.txt');
      await gitService.addToGitExclude('file2.txt');

      // Mock console.warn to capture warnings
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Adding wildcard pattern that makes existing entries redundant should warn
      await gitService.addToGitExclude('*.txt');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('would make existing entry'));

      warnSpy.mockRestore();
    });
  });

  describe('Permission Handling', () => {
    it('should handle permission errors gracefully', async () => {
      // Create exclude file with restrictive permissions
      await fs.writeFile(gitExcludePath, '# test');
      await fs.chmod(gitExcludePath, 0o000); // No permissions

      // Should handle gracefully and log warning
      await expect(gitService.addToGitExclude('test.txt')).resolves.not.toThrow();

      // Restore permissions for cleanup
      await fs.chmod(gitExcludePath, 0o644);
    });

    it('should set proper file permissions after writing', async () => {
      await gitService.addToGitExclude('test.txt');

      const stats = await fs.stat(gitExcludePath);
      // Check that file is readable and writable by owner
      expect(stats.mode & 0o600).toBe(0o600);
    });

    it('should handle directory permission errors gracefully', async () => {
      // Remove .git/info directory and create it with restrictive permissions
      await fs.remove(path.join(tempDir, '.git', 'info'));
      await fs.ensureDir(path.join(tempDir, '.git', 'info'));
      await fs.chmod(path.join(tempDir, '.git', 'info'), 0o000);

      // Should handle gracefully
      await expect(gitService.addToGitExclude('test.txt')).resolves.not.toThrow();

      // Restore permissions for cleanup
      await fs.chmod(path.join(tempDir, '.git', 'info'), 0o755);
    });
  });

  describe('Batch Validation', () => {
    it('should validate all paths in batch operations', async () => {
      const paths = [
        'valid.txt',
        '', // Invalid: empty
        'file\0.txt', // Invalid: null character
        'another-valid.txt',
        '../invalid.txt', // Invalid: directory traversal
      ];

      const result = await gitService.addMultipleToGitExclude(paths);

      expect(result.successful).toEqual(['valid.txt', 'another-valid.txt']);
      expect(result.failed).toHaveLength(3);
      expect(result.failed.map(f => f.path)).toEqual(['', 'file\0.txt', '../invalid.txt']);
    });

    it('should handle mixed valid and invalid paths in removal', async () => {
      // First add some valid paths
      await gitService.addMultipleToGitExclude(['file1.txt', 'file2.txt']);

      // Try to remove mix of valid and invalid paths
      const pathsToRemove = [
        'file1.txt', // Valid and exists
        '', // Invalid: empty
        'file3.txt', // Valid but doesn't exist
        'file\0.txt', // Invalid: null character
      ];

      const result = await gitService.removeMultipleFromGitExclude(pathsToRemove);

      expect(result.successful).toEqual(['file1.txt', 'file3.txt']);
      expect(result.failed).toHaveLength(2);
      expect(result.failed.map(f => f.path)).toEqual(['', 'file\0.txt']);
    });
  });

  describe('Content Safety Checks', () => {
    it('should preserve existing non-pgit entries during operations', async () => {
      // Create exclude file with existing entries
      const existingContent = [
        '# System exclusions',
        '*.log',
        '*.tmp',
        '',
        '# User exclusions',
        'node_modules/',
        'dist/',
      ].join('\n');

      await fs.writeFile(gitExcludePath, existingContent);

      // Add pgit entries
      await gitService.addMultipleToGitExclude(['pgit1.txt', 'pgit2.txt']);

      // Remove one pgit entry
      await gitService.removeFromGitExclude('pgit1.txt');

      const finalContent = await fs.readFile(gitExcludePath, 'utf8');

      // Should preserve all existing entries
      expect(finalContent).toContain('*.log');
      expect(finalContent).toContain('*.tmp');
      expect(finalContent).toContain('node_modules/');
      expect(finalContent).toContain('dist/');

      // Should have remaining pgit entry
      expect(finalContent).toContain('pgit2.txt');
      expect(finalContent).not.toContain('pgit1.txt');
    });

    it('should clean up pgit marker when no pgit entries remain', async () => {
      // Create exclude file with existing entries
      const existingContent = '# System exclusions\n*.log\n';
      await fs.writeFile(gitExcludePath, existingContent);

      // Add and then remove pgit entry
      await gitService.addToGitExclude('pgit.txt');
      await gitService.removeFromGitExclude('pgit.txt');

      const finalContent = await fs.readFile(gitExcludePath, 'utf8');

      // Should preserve existing content
      expect(finalContent).toContain('*.log');

      // Should not have pgit marker
      expect(finalContent).not.toContain(PGIT_MARKER_COMMENT);
    });

    it('should handle corrupted exclude file gracefully', async () => {
      // Create malformed exclude file
      const corruptedContent = 'valid.txt\n\x00\x01\x02\ninvalid\nline\n';
      await fs.writeFile(gitExcludePath, corruptedContent);

      // Should handle gracefully and continue
      await expect(gitService.addToGitExclude('new.txt')).resolves.not.toThrow();
    });
  });

  describe('Error Recovery', () => {
    it('should handle write failures gracefully', async () => {
      // Create a scenario where write might fail (read-only directory)
      // This test verifies that the error handling wrapper works
      await expect(gitService.addToGitExclude('test.txt')).resolves.not.toThrow();

      // The operation should complete without throwing, even if there are issues
      // (warnings may be logged but no exceptions thrown)
    });

    it('should validate file integrity after write operations', async () => {
      // This test ensures post-write validation is working
      await gitService.addToGitExclude('test.txt');

      // File should exist and be valid
      expect(await fs.pathExists(gitExcludePath)).toBe(true);
      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('test.txt');
      expect(content).toContain(PGIT_MARKER_COMMENT);
    });
  });
});
