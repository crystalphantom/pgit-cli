import { AddCommand } from '../../commands/add.command';
import { ConfigManager } from '../../core/config.manager';

import { GitService } from '../../core/git.service';
import { SymlinkService } from '../../core/symlink.service';
import { GitFileState } from '../../types/git.types';
import { PGIT_MARKER_COMMENT, CURRENT_CONFIG_VERSION } from '../../types/config.types';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('AddCommand - Enhanced Rollback Functionality', () => {
  let addCommand: AddCommand;
  let tempDir: string;
  let privateStorageDir: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pgit-rollback-test-'));
    privateStorageDir = path.join(tempDir, '.private');

    // Initialize git repository structure
    await fs.ensureDir(path.join(tempDir, '.git', 'info'));
    await fs.ensureDir(privateStorageDir);

    // Create AddCommand instance
    addCommand = new AddCommand(tempDir);

    // Mock GitService constructor to return our mocked instance
    jest.spyOn(GitService.prototype, 'isRepository').mockResolvedValue(true);
    jest.spyOn(GitService.prototype, 'addFiles').mockResolvedValue();
    jest.spyOn(GitService.prototype, 'removeFromIndex').mockResolvedValue();
    jest.spyOn(GitService.prototype, 'addToGitExclude').mockResolvedValue();
    jest.spyOn(GitService.prototype, 'removeFromGitExclude').mockResolvedValue();
    jest.spyOn(GitService.prototype, 'writeGitExcludeFile').mockResolvedValue();
    jest.spyOn(GitService.prototype, 'readGitExcludeFile').mockResolvedValue('');
    jest
      .spyOn(GitService.prototype, 'addMultipleToGitExclude')
      .mockResolvedValue({ successful: [], failed: [] });
    jest
      .spyOn(GitService.prototype, 'removeMultipleFromGitExclude')
      .mockResolvedValue({ successful: [], failed: [] });

    // Mock ConfigManager methods
    const mockConfig = {
      version: CURRENT_CONFIG_VERSION,
      privateRepoPath: path.join(privateStorageDir, '.git'),
      storagePath: privateStorageDir,
      trackedPaths: [],
      initialized: new Date(),
      settings: {
        autoGitignore: true,
        autoCleanup: true,
        verboseOutput: false,
        createBackups: true,
        maxBackups: 5,
        gitExclude: {
          enabled: true,
          markerComment: PGIT_MARKER_COMMENT,
          fallbackBehavior: 'warn' as const,
          validateOperations: true,
        },
      },
      metadata: {
        projectName: 'test-project',
        mainRepoPath: tempDir,
        cliVersion: CURRENT_CONFIG_VERSION,
        platform: 'test',
        lastModified: new Date(),
      },
    };
    jest.spyOn(ConfigManager.prototype, 'exists').mockResolvedValue(true);
    jest.spyOn(ConfigManager.prototype, 'load').mockResolvedValue(mockConfig);
    jest.spyOn(ConfigManager.prototype, 'addTrackedPath').mockResolvedValue(undefined);
    jest.spyOn(ConfigManager.prototype, 'removeTrackedPath').mockResolvedValue(undefined);
    jest.spyOn(ConfigManager.prototype, 'addMultipleTrackedPaths').mockResolvedValue(undefined);
    jest.spyOn(ConfigManager.prototype, 'removeMultipleTrackedPaths').mockResolvedValue(undefined);

    // Mock SymlinkService methods
    jest.spyOn(SymlinkService, 'supportsSymlinks').mockResolvedValue(true);
    jest.spyOn(SymlinkService.prototype, 'create').mockResolvedValue();
    jest.spyOn(SymlinkService.prototype, 'remove').mockResolvedValue();
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
    jest.restoreAllMocks();
  });

  describe('restoreToEnhancedGitState', () => {
    it('should restore tracked and staged file state', async () => {
      const testFile = 'test-file.txt';
      const testFilePath = path.join(tempDir, testFile);
      await fs.writeFile(testFilePath, 'test content');

      const originalState: GitFileState = {
        isTracked: true,
        isStaged: true,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: testFile,
        timestamp: new Date(),
      };

      // Mock GitService methods
      const addFilesSpy = jest.spyOn(GitService.prototype, 'addFiles');
      const removeFromGitExcludeSpy = jest.spyOn(GitService.prototype, 'removeFromGitExclude');

      // Access private method for testing
      const restoreMethod = (addCommand as any).restoreToEnhancedGitState.bind(addCommand);
      await restoreMethod(testFile, originalState);

      expect(addFilesSpy).toHaveBeenCalledWith([testFile]);
      expect(removeFromGitExcludeSpy).toHaveBeenCalledWith(testFile);
    });

    it('should restore tracked but unstaged file state', async () => {
      const testFile = 'test-file.txt';
      const testFilePath = path.join(tempDir, testFile);
      await fs.writeFile(testFilePath, 'test content');

      const originalState: GitFileState = {
        isTracked: true,
        isStaged: false,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: testFile,
        timestamp: new Date(),
      };

      // Mock GitService methods
      const addFilesSpy = jest.spyOn(GitService.prototype, 'addFiles');
      const removeFromIndexSpy = jest.spyOn(GitService.prototype, 'removeFromIndex');
      const removeFromGitExcludeSpy = jest.spyOn(GitService.prototype, 'removeFromGitExclude');

      // Access private method for testing
      const restoreMethod = (addCommand as any).restoreToEnhancedGitState.bind(addCommand);
      await restoreMethod(testFile, originalState);

      expect(addFilesSpy).toHaveBeenCalledWith([testFile]);
      expect(removeFromIndexSpy).toHaveBeenCalledWith(testFile, true);
      expect(removeFromGitExcludeSpy).toHaveBeenCalledWith(testFile);
    });

    it('should restore excluded file state', async () => {
      const testFile = 'test-file.txt';
      const testFilePath = path.join(tempDir, testFile);
      await fs.writeFile(testFilePath, 'test content');

      const originalState: GitFileState = {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: true,
        originalPath: testFile,
        timestamp: new Date(),
      };

      // Mock GitService methods
      const addToGitExcludeSpy = jest.spyOn(GitService.prototype, 'addToGitExclude');

      // Access private method for testing
      const restoreMethod = (addCommand as any).restoreToEnhancedGitState.bind(addCommand);
      await restoreMethod(testFile, originalState);

      expect(addToGitExcludeSpy).toHaveBeenCalledWith(testFile);
    });

    it('should handle git errors gracefully without throwing', async () => {
      const testFile = 'test-file.txt';
      const originalState: GitFileState = {
        isTracked: true,
        isStaged: true,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: testFile,
        timestamp: new Date(),
      };

      // Mock GitService methods to throw errors
      jest.spyOn(GitService.prototype, 'addFiles').mockRejectedValue(new Error('Git add failed'));
      jest
        .spyOn(GitService.prototype, 'removeFromGitExclude')
        .mockRejectedValue(new Error('Exclude remove failed'));

      // Mock console.warn to capture warnings
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Access private method for testing
      const restoreMethod = (addCommand as any).restoreToEnhancedGitState.bind(addCommand);

      // Should not throw despite errors
      await expect(restoreMethod(testFile, originalState)).resolves.not.toThrow();

      // Should log warnings
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('Warning:');
    });

    it('should handle exclude operations gracefully', async () => {
      const testFile = 'test-file.txt';
      const originalExcludeContent = '# Original content\n*.log\n';
      const originalState: GitFileState = {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: false,
        originalPath: testFile,
        timestamp: new Date(),
      };

      // Mock GitService methods - the new implementation handles errors gracefully
      const removeFromGitExcludeSpy = jest
        .spyOn(GitService.prototype, 'removeFromGitExclude')
        .mockResolvedValue(undefined);

      // Access private method for testing
      const restoreMethod = (addCommand as any).restoreToEnhancedGitState.bind(addCommand);
      await restoreMethod(testFile, originalState, originalExcludeContent);

      expect(removeFromGitExcludeSpy).toHaveBeenCalledWith(testFile);
    });

    it('should handle empty original exclude content', async () => {
      const testFile = 'test-file.txt';
      const originalExcludeContent = '';
      const originalState: GitFileState = {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: false,
        originalPath: testFile,
        timestamp: new Date(),
      };

      // Mock GitService methods - the new implementation handles errors gracefully
      const removeFromGitExcludeSpy = jest
        .spyOn(GitService.prototype, 'removeFromGitExclude')
        .mockResolvedValue(undefined);

      // Access private method for testing
      const restoreMethod = (addCommand as any).restoreToEnhancedGitState.bind(addCommand);
      await restoreMethod(testFile, originalState, originalExcludeContent);

      expect(removeFromGitExcludeSpy).toHaveBeenCalledWith(testFile);
    });
  });

  describe('batchRestoreToEnhancedGitState', () => {
    it('should restore multiple files with different git states', async () => {
      const testFiles = ['file1.txt', 'file2.txt', 'file3.txt'];
      const originalStates = new Map<string, GitFileState>();

      // Create test files with different states
      originalStates.set('file1.txt', {
        isTracked: true,
        isStaged: true,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: 'file1.txt',
        timestamp: new Date(),
      });

      originalStates.set('file2.txt', {
        isTracked: true,
        isStaged: false,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: 'file2.txt',
        timestamp: new Date(),
      });

      originalStates.set('file3.txt', {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: true,
        originalPath: 'file3.txt',
        timestamp: new Date(),
      });

      const originalExcludeContent = '# Original content\nfile3.txt\n';

      // Mock GitService methods
      const writeGitExcludeFileSpy = jest.spyOn(GitService.prototype, 'writeGitExcludeFile');
      const addFilesSpy = jest.spyOn(GitService.prototype, 'addFiles');
      const removeFromIndexSpy = jest.spyOn(GitService.prototype, 'removeFromIndex');

      // Access private method for testing
      const batchRestoreMethod = (addCommand as any).batchRestoreToEnhancedGitState.bind(
        addCommand,
      );
      const result = await batchRestoreMethod(originalStates, originalExcludeContent, {
        verbose: true,
      });

      expect(writeGitExcludeFileSpy).toHaveBeenCalledWith(originalExcludeContent);
      expect(addFilesSpy).toHaveBeenCalledWith(['file1.txt']); // Staged files
      expect(addFilesSpy).toHaveBeenCalledWith(['file2.txt']); // Tracked files (first add)
      expect(removeFromIndexSpy).toHaveBeenCalledWith(['file2.txt'], true); // Tracked files (then unstage)

      expect(result.successful).toEqual(expect.arrayContaining(testFiles));
      expect(result.failed).toHaveLength(0);
    });

    it('should handle batch operation failures gracefully', async () => {
      const testFiles = ['file1.txt', 'file2.txt'];
      const originalStates = new Map<string, GitFileState>();

      originalStates.set('file1.txt', {
        isTracked: true,
        isStaged: true,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: 'file1.txt',
        timestamp: new Date(),
      });

      originalStates.set('file2.txt', {
        isTracked: true,
        isStaged: true,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: 'file2.txt',
        timestamp: new Date(),
      });

      const originalExcludeContent = '';

      // Mock GitService methods to fail batch operations
      jest.spyOn(GitService.prototype, 'writeGitExcludeFile').mockResolvedValue();
      jest
        .spyOn(GitService.prototype, 'addFiles')
        .mockRejectedValueOnce(new Error('Batch add failed'))
        .mockResolvedValue(); // Individual calls succeed

      // Access private method for testing
      const batchRestoreMethod = (addCommand as any).batchRestoreToEnhancedGitState.bind(
        addCommand,
      );
      const result = await batchRestoreMethod(originalStates, originalExcludeContent, {
        verbose: true,
      });

      expect(result.successful).toEqual(expect.arrayContaining(testFiles));
      expect(result.failed).toHaveLength(0);
    });

    it('should handle exclude file restoration failure with individual fallback', async () => {
      const testFiles = ['file1.txt', 'file2.txt'];
      const originalStates = new Map<string, GitFileState>();

      originalStates.set('file1.txt', {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: true,
        originalPath: 'file1.txt',
        timestamp: new Date(),
      });

      originalStates.set('file2.txt', {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: false,
        originalPath: 'file2.txt',
        timestamp: new Date(),
      });

      const originalExcludeContent = '# Original content\nfile1.txt\n';

      // Mock GitService methods
      jest
        .spyOn(GitService.prototype, 'writeGitExcludeFile')
        .mockRejectedValue(new Error('Write failed'));
      const addMultipleToGitExcludeSpy = jest.spyOn(
        GitService.prototype,
        'addMultipleToGitExclude',
      );
      const removeMultipleFromGitExcludeSpy = jest.spyOn(
        GitService.prototype,
        'removeMultipleFromGitExclude',
      );

      // Access private method for testing
      const batchRestoreMethod = (addCommand as any).batchRestoreToEnhancedGitState.bind(
        addCommand,
      );
      const result = await batchRestoreMethod(originalStates, originalExcludeContent, {
        verbose: true,
      });

      expect(addMultipleToGitExcludeSpy).toHaveBeenCalledWith(['file1.txt']);
      expect(removeMultipleFromGitExcludeSpy).toHaveBeenCalledWith(['file2.txt']);
      expect(result.successful).toEqual(expect.arrayContaining(testFiles));
    });

    it('should handle non-git repository gracefully', async () => {
      const testFiles = ['file1.txt'];
      const originalStates = new Map<string, GitFileState>();

      originalStates.set('file1.txt', {
        isTracked: true,
        isStaged: true,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: 'file1.txt',
        timestamp: new Date(),
      });

      // Mock isRepository to return false
      jest.spyOn(GitService.prototype, 'isRepository').mockResolvedValue(false);

      // Access private method for testing
      const batchRestoreMethod = (addCommand as any).batchRestoreToEnhancedGitState.bind(
        addCommand,
      );
      const result = await batchRestoreMethod(originalStates, '', { verbose: true });

      expect(result.successful).toEqual(testFiles);
      expect(result.failed).toHaveLength(0);
    });

    it('should handle repository-level errors without throwing', async () => {
      const originalStates = new Map<string, GitFileState>();

      originalStates.set('file1.txt', {
        isTracked: true,
        isStaged: true,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: 'file1.txt',
        timestamp: new Date(),
      });

      // Mock GitService constructor to throw
      jest
        .spyOn(GitService.prototype, 'isRepository')
        .mockRejectedValue(new Error('Repository error'));

      // Mock console.warn to capture warnings
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Access private method for testing
      const batchRestoreMethod = (addCommand as any).batchRestoreToEnhancedGitState.bind(
        addCommand,
      );
      const result = await batchRestoreMethod(originalStates, '', { verbose: true });

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].path).toBe('file1.txt');
      expect(result.failed[0].error).toContain('Git repository error during rollback');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should ensure all files are accounted for in results', async () => {
      const testFiles = ['file1.txt', 'file2.txt', 'file3.txt'];
      const originalStates = new Map<string, GitFileState>();

      for (const file of testFiles) {
        originalStates.set(file, {
          isTracked: false,
          isStaged: false,
          isModified: false,
          isUntracked: true,
          isExcluded: false,
          originalPath: file,
          timestamp: new Date(),
        });
      }

      // Mock GitService methods
      jest.spyOn(GitService.prototype, 'writeGitExcludeFile').mockResolvedValue();

      // Access private method for testing
      const batchRestoreMethod = (addCommand as any).batchRestoreToEnhancedGitState.bind(
        addCommand,
      );
      const result = await batchRestoreMethod(originalStates, '', { verbose: false });

      const allProcessedFiles = [...result.successful, ...result.failed.map((f: any) => f.path)];
      expect(allProcessedFiles).toEqual(expect.arrayContaining(testFiles));
      expect(allProcessedFiles).toHaveLength(testFiles.length);
    });
  });

  describe('integration with rollback scenarios', () => {
    it('should have enhanced rollback methods available', () => {
      // Verify that the enhanced rollback methods exist
      expect(typeof (addCommand as any).restoreToEnhancedGitState).toBe('function');
      expect(typeof (addCommand as any).batchRestoreToEnhancedGitState).toBe('function');
    });
  });
});
