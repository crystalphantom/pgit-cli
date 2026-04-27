import { CleanupCommand, CleanupError, NotInitializedError } from '../../commands/cleanup.command';
import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { GitService } from '../../core/git.service';
import { SymlinkService } from '../../core/symlink.service';
import { PrivateConfig } from '../../types/config.types';

// Mock dependencies
jest.mock('../../core/config.manager');
jest.mock('../../core/filesystem.service');
jest.mock('../../core/git.service');
jest.mock('../../core/symlink.service');
jest.mock('chalk', () => {
  const mockChalk = (text: string) => text;
  const mockChalkWithBold = Object.assign(mockChalk, {
    bold: jest.fn((text: string) => text),
  });

  return {
    blue: mockChalkWithBold,
    green: mockChalk,
    yellow: mockChalkWithBold,
    red: mockChalkWithBold,
    gray: mockChalk,
  };
});

const MockedConfigManager = ConfigManager as jest.MockedClass<typeof ConfigManager>;
const MockedFileSystemService = FileSystemService as jest.MockedClass<typeof FileSystemService>;
const MockedGitService = GitService as jest.MockedClass<typeof GitService>;
const MockedSymlinkService = SymlinkService as jest.MockedClass<typeof SymlinkService>;

describe('CleanupCommand', () => {
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockFileSystem: jest.Mocked<FileSystemService>;
  let mockGitService: jest.Mocked<GitService>;
  let mockSymlinkService: jest.Mocked<SymlinkService>;
  let cleanupCommand: CleanupCommand;
  let consoleSpy: jest.SpyInstance;

  const mockConfig: PrivateConfig = {
    version: '1.0.0',
    privateRepoPath: '/test/workspace/.private-storage',
    metadata: {
      projectName: 'test-project',
      mainRepoPath: '/test/workspace',
      cliVersion: '1.0.0',
      platform: 'linux',
      lastModified: new Date('2025-01-01T00:00:00.000Z'),
    },
    settings: {
      autoGitignore: true,
      autoCleanup: true,
      verboseOutput: false,
      createBackups: true,
      maxBackups: 5,
      gitExclude: {
        enabled: true,
        markerComment: '# PGIT_EXCLUDE',
        fallbackBehavior: 'error' as const,
        validateOperations: true,
      },
    },
    storagePath: '.private-storage',
    trackedPaths: ['file1.txt', 'file2.txt'],
    initialized: new Date('2025-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup console spy
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Mock FileSystemService
    mockFileSystem = new MockedFileSystemService() as jest.Mocked<FileSystemService>;
    mockFileSystem.pathExists = jest.fn();
    mockFileSystem.readFile = jest.fn();
    mockFileSystem.writeFileAtomic = jest.fn();

    // Mock ConfigManager
    mockConfigManager = new MockedConfigManager('', mockFileSystem) as jest.Mocked<ConfigManager>;
    mockConfigManager.exists = jest.fn();
    mockConfigManager.load = jest.fn();
    mockConfigManager.getHealth = jest.fn();

    // Mock GitService
    mockGitService = new MockedGitService('', mockFileSystem) as jest.Mocked<GitService>;
    mockGitService.isRepository = jest.fn();
    mockGitService.isTracked = jest.fn();
    mockGitService.removeFromIndex = jest.fn();
    mockGitService.checkRepositoryHealth = jest.fn();

    // Mock SymlinkService
    mockSymlinkService = new MockedSymlinkService(mockFileSystem) as jest.Mocked<SymlinkService>;
    mockSymlinkService.validate = jest.fn();
    mockSymlinkService.repair = jest.fn();

    // Mock constructors to return our mocked instances
    MockedConfigManager.mockImplementation(() => mockConfigManager);
    MockedFileSystemService.mockImplementation(() => mockFileSystem);
    MockedGitService.mockImplementation(() => mockGitService);
    MockedSymlinkService.mockImplementation(() => mockSymlinkService);

    cleanupCommand = new CleanupCommand('/test/workspace');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with default working directory when none provided', () => {
      const originalCwd = process.cwd;
      process.cwd = jest.fn().mockReturnValue('/default/dir');

      const command = new CleanupCommand();
      expect(command).toBeInstanceOf(CleanupCommand);

      process.cwd = originalCwd;
    });

    it('should initialize with provided working directory', () => {
      const command = new CleanupCommand('/custom/dir');
      expect(command).toBeInstanceOf(CleanupCommand);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      // Default successful mocks
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);
      mockConfigManager.getHealth.mockResolvedValue({
        exists: true,
        valid: true,
        errors: [],
        needsMigration: false,
        currentVersion: '1.0.0',
        targetVersion: '1.0.0',
      });

      // Mock both main repo and private repo as healthy git repositories
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.isTracked.mockResolvedValue(false);
      mockGitService.checkRepositoryHealth.mockResolvedValue({
        isHealthy: true,
        issues: [],
      });

      mockSymlinkService.validate.mockResolvedValue({
        linkPath: '/test/workspace/file1.txt',
        targetPath: '/test/workspace/.private-storage/file1.txt',
        exists: true,
        isValid: true,
        isHealthy: true,
        issues: [],
      });

      // Mock pathExists to simulate existing private storage directory
      mockFileSystem.pathExists.mockImplementation((path: string) => {
        if (path.includes('.private-storage')) return Promise.resolve(true);
        if (path.includes('.gitignore')) return Promise.resolve(true);
        return Promise.resolve(false);
      });

      mockFileSystem.readFile.mockResolvedValue(`
# Private Git Tracking (auto-generated)
.git-private
.private-storage
.private-config.json
`);
    });

    describe('successful cleanup', () => {
      it('should complete cleanup successfully with no issues', async () => {
        const result = await cleanupCommand.execute(false, { verbose: false });

        expect(result.success).toBe(true);
        expect(result.message).toBe('Cleanup completed successfully');
        expect(result.exitCode).toBe(0);
        expect((result.data as any).repairedSymlinks).toBe(0);
      });

      it('should complete cleanup with verbose output', async () => {
        const result = await cleanupCommand.execute(false, { verbose: true });

        expect(result.success).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Starting system cleanup'));
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Validating configuration'),
        );
      });

      it('should repair broken symbolic links', async () => {
        mockSymlinkService.validate.mockResolvedValue({
          linkPath: '/test/workspace/file1.txt',
          targetPath: '/test/workspace/.private-storage/file1.txt',
          exists: false,
          isValid: false,
          isHealthy: false,
          issues: ['Link is broken'],
        });

        const result = await cleanupCommand.execute(false, { verbose: false });

        expect(result.success).toBe(true);
        expect((result.data as any).repairedSymlinks).toBe(2); // Both files are repaired
        expect(mockSymlinkService.repair).toHaveBeenCalledWith(
          '/test/workspace/file1.txt',
          '/test/workspace/.private-storage/file1.txt',
        );
      });

      it('should clean git index entries when force is true', async () => {
        mockGitService.isTracked.mockResolvedValue(true);

        const result = await cleanupCommand.execute(true, { verbose: false });

        expect(result.success).toBe(true);
        expect((result.data as any).cleanedIndexEntries).toBe(2);
        expect(mockGitService.removeFromIndex).toHaveBeenCalledWith(
          ['file1.txt', 'file2.txt'],
          true,
        );
      });

      it('should warn about git index entries when force is false', async () => {
        mockGitService.isTracked.mockResolvedValue(true);

        const result = await cleanupCommand.execute(false, { verbose: false });

        expect(result.success).toBe(true);
        expect((result.data as any).warnings).toContain(
          'Found 2 private file(s) in git index. Use --force to remove them.',
        );
      });

      it('should update .gitignore when needed', async () => {
        mockFileSystem.readFile.mockResolvedValue('# Some content');

        const result = await cleanupCommand.execute(false, { verbose: false });

        expect(result.success).toBe(true);
        expect((result.data as any).updatedGitignore).toBe(true);
        expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
          '/test/workspace/.gitignore',
          expect.stringContaining('# Private Git Tracking'),
        );
      });

      it('should skip .gitignore update when already up to date', async () => {
        const result = await cleanupCommand.execute(false, { verbose: false });

        expect(result.success).toBe(true);
        expect((result.data as any).updatedGitignore).toBe(false);
        expect(mockFileSystem.writeFileAtomic).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should throw NotInitializedError when config does not exist', async () => {
        mockConfigManager.exists.mockResolvedValue(false);

        const result = await cleanupCommand.execute();

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(NotInitializedError);
        expect(result.message).toContain('not initialized');
      });

      it('should handle configuration validation errors', async () => {
        mockConfigManager.getHealth.mockResolvedValue({
          exists: true,
          valid: false,
          errors: ['Config file is corrupted'],
          needsMigration: false,
          currentVersion: '1.0.0',
          targetVersion: '1.0.0',
        });

        const result = await cleanupCommand.execute();

        expect(result.success).toBe(false);
        expect((result.data as any).issues).toContain('Configuration validation failed');
        expect((result.data as any).issues).toContain('Config file is corrupted');
      });

      it('should handle repository validation failures', async () => {
        // Mock private storage directory not existing
        mockFileSystem.pathExists.mockImplementation((path: string) => {
          if (path.includes('.private-storage')) return Promise.resolve(false);
          if (path.includes('.gitignore')) return Promise.resolve(true);
          return Promise.resolve(false);
        });

        const result = await cleanupCommand.execute();

        expect(result.success).toBe(false);
        expect((result.data as any).issues).toContain('Private storage directory does not exist');
      });

      it('should handle unexpected errors gracefully', async () => {
        mockConfigManager.load.mockRejectedValue(new Error('Unexpected error'));

        const result = await cleanupCommand.execute();

        expect(result.success).toBe(false);
        expect(result.message).toContain('issue(s)');
        expect(result.exitCode).toBe(1);
        expect((result.data as any).issues).toEqual(
          expect.arrayContaining([expect.stringContaining('Unexpected error')]),
        );
      });
    });

    describe('migration warnings', () => {
      it('should show migration warning when needed', async () => {
        mockConfigManager.getHealth.mockResolvedValue({
          exists: true,
          valid: true,
          errors: [],
          needsMigration: true,
          currentVersion: '0.9.0',
          targetVersion: '1.0.0',
        });

        const result = await cleanupCommand.execute();

        expect(result.success).toBe(true);
        expect((result.data as any).warnings).toContain(
          'Configuration needs migration from 0.9.0 to 1.0.0',
        );
      });
    });
  });

  describe('CleanupError', () => {
    it('should create CleanupError with correct properties', () => {
      const error = new CleanupError('Test cleanup error');
      expect(error.code).toBe('CLEANUP_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.message).toBe('Test cleanup error');
    });
  });

  describe('NotInitializedError', () => {
    it('should create NotInitializedError with correct properties', () => {
      const error = new NotInitializedError('Not initialized');
      expect(error.code).toBe('NOT_INITIALIZED');
      expect(error.recoverable).toBe(false);
      expect(error.message).toBe('Not initialized');
    });
  });
});
