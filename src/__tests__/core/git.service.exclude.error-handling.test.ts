import * as fs from 'fs-extra';
import * as path from 'path';
import { GitService } from '../../core/git.service.js';
import { FileSystemService } from '../../core/filesystem.service.js';
import { GitExcludeValidationError } from '../../errors/git.error.js';
import { PGIT_MARKER_COMMENT } from '../../types/config.types.js';

describe('GitService Exclude Error Handling', () => {
  let gitService: GitService;
  let fileSystem: FileSystemService;
  let testDir: string;
  let gitExcludePath: string;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'test-temp',
      `git-exclude-error-${Date.now()}`,
    );
    await fs.ensureDir(testDir);

    // Initialize git repository
    fileSystem = new FileSystemService();
    gitService = new GitService(testDir, fileSystem);

    // Initialize git repo
    await gitService.initRepository();

    gitExcludePath = path.join(testDir, '.git', 'info', 'exclude');

    // Spy on console.warn to capture warning messages
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleWarnSpy.mockRestore();

    // Clean up test directory
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
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
      // Create .git/info directory with restricted permissions
      const gitInfoDir = path.dirname(gitExcludePath);
      await fs.ensureDir(gitInfoDir);

      // Make directory read-only (simulate permission error)
      await fs.chmod(gitInfoDir, 0o444);

      // This should not throw but should log a warning
      await gitService.addToGitExclude('test-file.txt');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied during add operation'),
      );

      // Restore permissions for cleanup
      await fs.chmod(gitInfoDir, 0o755);
    });

    it('should handle permission errors in batch operations', async () => {
      const gitInfoDir = path.dirname(gitExcludePath);
      await fs.ensureDir(gitInfoDir);
      await fs.chmod(gitInfoDir, 0o444);

      const result = await gitService.addMultipleToGitExclude(['file1.txt', 'file2.txt']);

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(2);
      expect(consoleWarnSpy).toHaveBeenCalled();

      // Restore permissions for cleanup
      await fs.chmod(gitInfoDir, 0o755);
    });
  });

  describe('File Corruption Handling', () => {
    it('should handle corrupted exclude file gracefully', async () => {
      // Create a corrupted exclude file (binary data)
      await fs.ensureDir(path.dirname(gitExcludePath));
      const corruptedData = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0x03]);
      await fs.writeFile(gitExcludePath, corruptedData);

      // This should handle the corruption gracefully
      const result = await gitService.isInGitExclude('test-file.txt');
      expect(result).toBe(false);
    });

    it('should recover from exclude file corruption during write operations', async () => {
      // Create initial valid exclude file
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '# Valid exclude file\ntest-existing.txt\n');

      // Simulate corruption by writing binary data
      const corruptedData = Buffer.from([0xff, 0xfe, 0x00, 0x01]);
      await fs.writeFile(gitExcludePath, corruptedData);

      // Adding new exclusion should handle corruption gracefully
      await expect(gitService.addToGitExclude('new-file.txt')).resolves.not.toThrow();

      // The operation should complete without throwing, even if it encounters corruption
      // The new implementation handles this gracefully by logging warnings but not failing
      // The file may or may not be updated depending on the corruption severity
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue pgit workflow when exclude operations fail', async () => {
      // Simulate a scenario where exclude operations fail but git operations succeed
      const gitInfoDir = path.dirname(gitExcludePath);
      await fs.ensureDir(gitInfoDir);

      // Create a file that will cause write errors
      await fs.writeFile(gitExcludePath, 'initial content');
      await fs.chmod(gitExcludePath, 0o444); // Read-only

      // This should not throw, allowing the main pgit workflow to continue
      await gitService.addToGitExclude('test-file.txt');

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Warning:'));

      // Restore permissions for cleanup
      await fs.chmod(gitExcludePath, 0o644);
    });

    it('should handle missing .git/info directory gracefully', async () => {
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
      // Create exclude file with some existing content
      await fs.ensureDir(path.dirname(gitExcludePath));
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
      // Create exclude file with test content
      await fs.ensureDir(path.dirname(gitExcludePath));
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
      // Create exclude file
      await fs.ensureDir(path.dirname(gitExcludePath));
      await fs.writeFile(gitExcludePath, '# Initial content\n');

      // First operation should succeed
      await gitService.addToGitExclude('test-file1.txt');

      let content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('test-file1.txt');

      // Simulate temporary permission issue and recovery
      await fs.chmod(gitExcludePath, 0o444);
      await gitService.addToGitExclude('test-file2.txt'); // Should log warning

      // Restore permissions and try again
      await fs.chmod(gitExcludePath, 0o644);
      await gitService.addToGitExclude('test-file3.txt'); // Should succeed

      content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('test-file1.txt');
      expect(content).toContain('test-file3.txt');

      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('Warning Message Quality', () => {
    it('should provide informative warning messages', async () => {
      const gitInfoDir = path.dirname(gitExcludePath);
      await fs.ensureDir(gitInfoDir);
      await fs.chmod(gitInfoDir, 0o444);

      await gitService.addToGitExclude('test-file.txt');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Warning:.*Permission denied.*add operation/i),
      );

      // Restore permissions for cleanup
      await fs.chmod(gitInfoDir, 0o755);
    });

    it('should include affected paths in warning messages for batch operations', async () => {
      const gitInfoDir = path.dirname(gitExcludePath);
      await fs.ensureDir(gitInfoDir);
      await fs.chmod(gitInfoDir, 0o444);

      await gitService.addMultipleToGitExclude(['file1.txt', 'file2.txt']);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Warning:.*\(paths: file1\.txt, file2\.txt\)/i),
      );

      // Restore permissions for cleanup
      await fs.chmod(gitInfoDir, 0o755);
    });
  });

  describe('Non-Git Repository Handling', () => {
    it('should handle operations in non-git directories gracefully', async () => {
      // Create a new directory in /tmp to avoid parent git repositories
      const nonGitDir = path.join('/tmp', `non-git-test-${Date.now()}`);
      await fs.ensureDir(nonGitDir);

      const nonGitService = new GitService(nonGitDir, fileSystem);

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
