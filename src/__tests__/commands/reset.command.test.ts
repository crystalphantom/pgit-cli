import { ResetCommand, NotInitializedError, ResetResult } from '../../commands/reset.command';
import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { SymlinkService } from '../../core/symlink.service';
import { GitService } from '../../core/git.service';
import { PrivateConfig } from '../../types/config.types';

// Mock all dependencies
jest.mock('../../core/config.manager');
jest.mock('../../core/filesystem.service');
jest.mock('../../core/git.service');
jest.mock('../../core/symlink.service');

const MockedConfigManager = jest.mocked(ConfigManager);
const MockedFileSystemService = jest.mocked(FileSystemService);
const MockedSymlinkService = jest.mocked(SymlinkService);
const MockedGitService = jest.mocked(GitService);

describe('ResetCommand', () => {
  let resetCommand: ResetCommand;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockFileSystem: jest.Mocked<FileSystemService>;
  let mockSymlinkService: jest.Mocked<SymlinkService>;
  let mockGitServiceInstance: jest.Mocked<GitService>;
  const testWorkingDir = '/test/workspace';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock constructor calls
    MockedConfigManager.mockImplementation(() => mockConfigManager);
    MockedFileSystemService.mockImplementation(() => mockFileSystem);
    MockedSymlinkService.mockImplementation(() => mockSymlinkService);
    MockedGitService.mockImplementation(() => mockGitServiceInstance);

    // Ensure GitService constructor returns the mocked instance
    MockedGitService.mockImplementation(() => mockGitServiceInstance);

    mockConfigManager = {
      exists: jest.fn(),
      load: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      addTrackedPath: jest.fn(),
      removeTrackedPath: jest.fn(),
      updateSettings: jest.fn(),
      validate: jest.fn(),
      getHealth: jest.fn(),
      getMigrationInfo: jest.fn(),
      migrate: jest.fn(),
      getCached: jest.fn(),
      clearCache: jest.fn(),
      getConfigPath: jest.fn(),
    } as unknown as jest.Mocked<ConfigManager>;

    mockFileSystem = {
      pathExists: jest.fn(),
      moveFileAtomic: jest.fn(),
      remove: jest.fn(),
      isDirectory: jest.fn(),
      getStats: jest.fn(),
      copyFileAtomic: jest.fn(),
      createDirectory: jest.fn(),
      writeFileAtomic: jest.fn(),
      writeFile: jest.fn(),
      readFile: jest.fn(),
      getLinkStats: jest.fn(),
      validatePath: jest.fn(),
      validatePathString: jest.fn(),
      clearRollbackActions: jest.fn(),
    } as unknown as jest.Mocked<FileSystemService>;

    mockSymlinkService = {
      create: jest.fn(),
      remove: jest.fn(),
      exists: jest.fn(),
      getTarget: jest.fn(),
      validate: jest.fn(),
      repair: jest.fn(),
    } as unknown as jest.Mocked<SymlinkService>;

    mockGitServiceInstance = {
      isRepository: jest.fn(),
      getStatus: jest.fn(),
      addFiles: jest.fn(),
      commit: jest.fn(),
      addFilesAndCommit: jest.fn(),
      initRepository: jest.fn(),
      addAll: jest.fn(),
      removeFromIndex: jest.fn(),
      getLog: jest.fn(),
      getDiff: jest.fn(),
      getBranches: jest.fn(),
      createBranch: jest.fn(),
      switchBranch: jest.fn(),
      checkout: jest.fn(),
      isTracked: jest.fn(),
      getGitDir: jest.fn(),
      getWorkingDir: jest.fn(),
      getRootDir: jest.fn(),
      addToGitExclude: jest.fn(),
      removeFromGitExclude: jest.fn(),
      getCurrentBranch: jest.fn(),
      hasUncommittedChanges: jest.fn(),
      stash: jest.fn(),
      stashPop: jest.fn(),
      reset: jest.fn(),
      clean: jest.fn(),
    } as unknown as jest.Mocked<GitService>;

    resetCommand = new ResetCommand(testWorkingDir);
  });

  describe('environment validation', () => {
    it('should throw NotInitializedError when pgit is not initialized', async () => {
      mockConfigManager.exists.mockResolvedValue(false);

      const result = await resetCommand.execute(false, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(NotInitializedError);
      expect(result.message).toContain('not initialized');
    });

    it('should proceed when pgit is initialized', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(createMockConfig());

      // Mock necessary filesystem calls to prevent errors
      mockSymlinkService.validate.mockResolvedValue({
        exists: false,
        isValid: false,
        isHealthy: false,
        linkPath: '',
        targetPath: '',
        issues: [],
      });

      mockFileSystem.pathExists.mockResolvedValue(false);

      const result = await resetCommand.execute(true, {}); // force to skip confirmation

      expect(mockConfigManager.exists).toHaveBeenCalled();
      expect(mockConfigManager.load).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('dry run mode', () => {
    it('should show what would be done without executing', async () => {
      const mockConfig = createMockConfig(['file1.txt', 'file2.txt']);
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);

      const result = await resetCommand.execute(false, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Dry run completed');
      expect(mockFileSystem.remove).not.toHaveBeenCalled();
      expect(mockFileSystem.moveFileAtomic).not.toHaveBeenCalled();
    });
  });

  describe('file restoration', () => {
    it('should restore tracked files from storage', async () => {
      const mockConfig = createMockConfig(['file1.txt', 'file2.txt']);
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);

      // Mock symlink validation
      mockSymlinkService.validate
        .mockResolvedValueOnce({
          exists: true,
          isValid: true,
          isHealthy: true,
          linkPath: '',
          targetPath: '',
          issues: [],
        })
        .mockResolvedValueOnce({
          exists: true,
          isValid: true,
          isHealthy: true,
          linkPath: '',
          targetPath: '',
          issues: [],
        });

      // Mock stored files exist
      mockFileSystem.pathExists
        .mockResolvedValueOnce(true) // file1.txt exists in storage
        .mockResolvedValueOnce(true) // file2.txt exists in storage
        .mockResolvedValueOnce(true) // private repo exists
        .mockResolvedValueOnce(true) // storage dir exists
        .mockResolvedValueOnce(true); // config file exists

      const result = await resetCommand.execute(true, {});

      expect(result.success).toBe(true);
      expect(mockFileSystem.remove).toHaveBeenCalledWith(`${testWorkingDir}/file1.txt`);
      expect(mockFileSystem.remove).toHaveBeenCalledWith(`${testWorkingDir}/file2.txt`);
      expect(mockFileSystem.moveFileAtomic).toHaveBeenCalledWith(
        `${testWorkingDir}/.private-storage/file1.txt`,
        `${testWorkingDir}/file1.txt`,
      );
      expect(mockFileSystem.moveFileAtomic).toHaveBeenCalledWith(
        `${testWorkingDir}/.private-storage/file2.txt`,
        `${testWorkingDir}/file2.txt`,
      );
    });

    it('should handle missing stored files gracefully', async () => {
      const mockConfig = createMockConfig(['missing-file.txt']);
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);

      // Mock symlink exists but stored file doesn't
      mockSymlinkService.validate.mockResolvedValue({
        exists: true,
        isValid: true,
        isHealthy: true,
        linkPath: '',
        targetPath: '',
        issues: [],
      });

      mockFileSystem.pathExists
        .mockResolvedValueOnce(false) // stored file doesn't exist
        .mockResolvedValueOnce(true) // private repo exists
        .mockResolvedValueOnce(true) // storage dir exists
        .mockResolvedValueOnce(true); // config file exists

      const result = await resetCommand.execute(true, {});

      expect(result.success).toBe(true);
      expect((result.data as ResetResult).warnings).toContain(
        'Stored file not found: missing-file.txt',
      );
    });

    it('should handle file restoration errors', async () => {
      const mockConfig = createMockConfig(['error-file.txt']);
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);

      mockSymlinkService.validate.mockResolvedValue({
        exists: true,
        isValid: true,
        isHealthy: true,
        linkPath: '',
        targetPath: '',
        issues: [],
      });

      mockFileSystem.pathExists
        .mockResolvedValueOnce(true) // stored file exists
        .mockResolvedValueOnce(true) // private repo exists
        .mockResolvedValueOnce(true) // storage dir exists
        .mockResolvedValueOnce(true); // config file exists

      mockFileSystem.moveFileAtomic.mockRejectedValue(new Error('Move failed'));

      const result = await resetCommand.execute(true, {});

      expect(result.success).toBe(false);
      expect((result.data as ResetResult).errors).toContain(
        'Failed to restore error-file.txt: Move failed',
      );
    });
  });

  describe('git exclude cleanup', () => {
    it('should remove git exclude entries for tracked files', async () => {
      const mockConfig = createMockConfig(['file1.txt', 'file2.txt']);
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);

      mockSymlinkService.validate.mockResolvedValue({
        exists: false,
        isValid: false,
        isHealthy: false,
        linkPath: '',
        targetPath: '',
        issues: [],
      });

      mockFileSystem.pathExists
        .mockResolvedValueOnce(false) // no stored files
        .mockResolvedValueOnce(false) // no stored files
        .mockResolvedValueOnce(true) // private repo exists
        .mockResolvedValueOnce(true) // storage dir exists
        .mockResolvedValueOnce(true); // config file exists

      mockGitServiceInstance.isRepository.mockResolvedValue(true);

      const result = await resetCommand.execute(true, {});

      expect(mockGitServiceInstance.removeFromGitExclude).toHaveBeenCalledWith('file1.txt');
      expect(mockGitServiceInstance.removeFromGitExclude).toHaveBeenCalledWith('file2.txt');
      expect((result.data as ResetResult).gitExcludesCleaned).toBe(true);
    });

    it('should handle git exclude cleanup errors gracefully', async () => {
      const mockConfig = createMockConfig(['file1.txt']);
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);

      mockSymlinkService.validate.mockResolvedValue({
        exists: false,
        isValid: false,
        isHealthy: false,
        linkPath: '',
        targetPath: '',
        issues: [],
      });

      mockFileSystem.pathExists
        .mockResolvedValueOnce(false) // no stored file
        .mockResolvedValueOnce(true) // private repo exists
        .mockResolvedValueOnce(true) // storage dir exists
        .mockResolvedValueOnce(true); // config file exists

      mockGitServiceInstance.isRepository.mockResolvedValue(true);
      mockGitServiceInstance.removeFromGitExclude.mockRejectedValue(
        new Error('Git exclude failed'),
      );

      const result = await resetCommand.execute(true, {});

      expect((result.data as ResetResult).warnings).toContain(
        'Failed to remove exclude entry for file1.txt',
      );
    });
  });

  describe('directory cleanup', () => {
    it('should remove pgit directories', async () => {
      const mockConfig = createMockConfig([]);
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);

      mockFileSystem.pathExists
        .mockResolvedValueOnce(true) // private repo exists
        .mockResolvedValueOnce(true) // storage dir exists
        .mockResolvedValueOnce(true); // config file exists

      const result = await resetCommand.execute(true, {});

      expect(mockFileSystem.remove).toHaveBeenCalledWith(`${testWorkingDir}/.git-private`);
      expect(mockFileSystem.remove).toHaveBeenCalledWith(`${testWorkingDir}/.private-storage`);
      expect(mockFileSystem.remove).toHaveBeenCalledWith(`${testWorkingDir}/.private-config.json`);
      expect((result.data as ResetResult).removedDirectories).toContain('.git-private');
      expect((result.data as ResetResult).removedDirectories).toContain('.private-storage');
      expect((result.data as ResetResult).configRemoved).toBe(true);
    });

    it('should handle directory removal errors', async () => {
      const mockConfig = createMockConfig([]);
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);

      mockFileSystem.pathExists
        .mockResolvedValueOnce(true) // private repo exists
        .mockResolvedValueOnce(true) // storage dir exists
        .mockResolvedValueOnce(true); // config file exists

      mockFileSystem.remove
        .mockRejectedValueOnce(new Error('Remove failed')) // private repo removal fails
        .mockResolvedValueOnce(undefined) // storage removal succeeds
        .mockResolvedValueOnce(undefined); // config removal succeeds

      const result = await resetCommand.execute(true, {});

      expect(result.success).toBe(false);
      expect((result.data as ResetResult).errors).toContain(
        'Failed to remove directory .git-private: Remove failed',
      );
    });
  });

  describe('confirmation handling', () => {
    it('should require confirmation when not forced', async () => {
      mockConfigManager.exists.mockResolvedValue(true);

      const result = await resetCommand.execute(false, {}); // no force flag

      expect(result.success).toBe(false);
      expect(result.message).toContain('cancelled by user');
      expect(result.exitCode).toBe(0);
    });

    it('should skip confirmation when forced', async () => {
      const mockConfig = createMockConfig([]);
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);

      mockFileSystem.pathExists.mockResolvedValue(false); // no directories exist

      const result = await resetCommand.execute(true, {}); // force flag

      expect(result.success).toBe(true);
      expect(mockConfigManager.load).toHaveBeenCalled();
    });
  });

  describe('verbose output', () => {
    it('should provide detailed output when verbose is enabled', async () => {
      const mockConfig = createMockConfig(['file1.txt']);
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);

      mockSymlinkService.validate.mockResolvedValue({
        exists: true,
        isValid: true,
        isHealthy: true,
        linkPath: '',
        targetPath: '',
        issues: [],
      });

      mockFileSystem.pathExists
        .mockResolvedValueOnce(true) // stored file exists
        .mockResolvedValueOnce(true) // private repo exists
        .mockResolvedValueOnce(true) // storage dir exists
        .mockResolvedValueOnce(true); // config file exists

      // Capture console.log calls
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await resetCommand.execute(true, { verbose: true });

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Starting complete pgit reset'),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      mockConfigManager.exists.mockRejectedValue(new Error('Unexpected error'));

      const result = await resetCommand.execute(true, {});

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to complete reset');
      expect(result.error).toBeInstanceOf(Error);
      expect(result.exitCode).toBe(1);
    });

    it('should handle BaseError properly', async () => {
      mockConfigManager.exists.mockResolvedValue(false);

      const result = await resetCommand.execute(true, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(NotInitializedError);
      expect(result.exitCode).toBe(1);
    });
  });
});

/**
 * Helper function to create mock configuration
 */
function createMockConfig(trackedPaths: string[] = []): PrivateConfig {
  return {
    version: '1.2.0',
    privateRepoPath: '.git-private',
    storagePath: '.private-storage',
    trackedPaths,
    initialized: new Date(),
    settings: {
      autoGitignore: true,
      autoCleanup: false,
      verboseOutput: false,
      createBackups: true,
      maxBackups: 5,
      gitExclude: {
        enabled: true,
        markerComment: '# pgit-managed',
        fallbackBehavior: 'warn',
        validateOperations: true,
      },
    },
    metadata: {
      projectName: 'test-project',
      mainRepoPath: '/test/workspace',
      cliVersion: '1.2.0',
      platform: 'test',
      lastModified: new Date(),
    },
  };
}
