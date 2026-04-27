import { StatusCommand, StatusError, NotInitializedError } from '../../commands/status.command';
import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { GitService, GitStatus } from '../../core/git.service';
import {
  SystemStatus,
  RepositoryStatus,
  SymlinkHealth,
  ConfigHealth,
  PrivateConfig,
  CommandOptions,
} from '../../types/config.types';

// Mock chalk completely to prevent console formatting issues
jest.mock('chalk', () => {
  const mockChalk: any = jest.fn((text: string) => text);
  mockChalk.blue = {
    bold: jest.fn((text: string) => text),
  };
  mockChalk.green = jest.fn((text: string) => text);
  mockChalk.red = jest.fn((text: string) => text);
  mockChalk.yellow = jest.fn((text: string) => text);
  mockChalk.cyan = jest.fn((text: string) => text);
  mockChalk.gray = jest.fn((text: string) => text);

  return mockChalk;
});

// Mock dependencies
jest.mock('../../core/config.manager');
jest.mock('../../core/filesystem.service');
jest.mock('../../core/git.service');

const MockedConfigManager = ConfigManager as jest.MockedClass<typeof ConfigManager>;
const MockedFileSystemService = FileSystemService as jest.MockedClass<typeof FileSystemService>;
const MockedGitService = GitService as jest.MockedClass<typeof GitService>;

describe('StatusCommand', () => {
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockFileSystem: jest.Mocked<FileSystemService>;
  let mockGitService: jest.Mocked<GitService>;
  let statusCommand: StatusCommand;
  let consoleSpy: jest.SpyInstance;

  const mockConfig: PrivateConfig = {
    version: '1.0.0',
    privateRepoPath: '.private',
    storagePath: '.private',
    trackedPaths: ['secret.txt', 'config/private.env'],
    initialized: new Date(),
    settings: {
      autoGitignore: true,
      autoCleanup: true,
      verboseOutput: false,
      createBackups: true,
      maxBackups: 5,
      gitExclude: {
        enabled: true,
        markerComment: 'pgit-managed',
        fallbackBehavior: 'warn',
        validateOperations: true,
      },
    },
    metadata: {
      projectName: 'test-project',
      mainRepoPath: '/test/dir',
      cliVersion: '1.0.0',
      platform: 'linux',
      lastModified: new Date(),
    },
  };

  const mockGitStatus: GitStatus = {
    current: 'main',
    tracking: null,
    ahead: 0,
    behind: 0,
    staged: ['file1.txt'],
    modified: ['file2.txt'],
    untracked: ['file3.txt'],
    deleted: [],
    conflicted: [],
    isClean: false,
    files: [],
  };

  const mockCleanGitStatus: GitStatus = {
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

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup console spy
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Mock FileSystemService
    mockFileSystem = new MockedFileSystemService() as jest.Mocked<FileSystemService>;
    mockFileSystem.pathExists = jest.fn().mockResolvedValue(true);
    mockFileSystem.getStats = jest.fn().mockResolvedValue({
      isSymbolicLink: () => true,
    } as any);

    // Mock ConfigManager
    mockConfigManager = new MockedConfigManager('', mockFileSystem) as jest.Mocked<ConfigManager>;
    mockConfigManager.exists = jest.fn().mockResolvedValue(true);
    mockConfigManager.load = jest.fn().mockResolvedValue({
      version: '1.0.0',
      privateRepoPath: '.pgit',
      storagePath: '.pgit',
      trackedPaths: ['config.json', 'secrets.txt'],
      initialized: new Date(),
      settings: {
        autoGitignore: true,
        autoCleanup: true,
        verboseOutput: false,
        createBackups: true,
        maxBackups: 5,
        gitExclude: {
          enabled: true,
          patterns: [],
        },
      },
      metadata: {
        projectName: 'test-project',
        mainRepoPath: '/test/dir',
        createdAt: new Date(),
        lastModified: new Date(),
      },
    });
    mockConfigManager.getHealth = jest.fn().mockResolvedValue({
      valid: true,
      exists: true,
      errors: [],
      needsMigration: false,
      currentVersion: '1.0.0',
    });

    // Create mockGitService first
    mockGitService = {
      isRepository: jest.fn().mockResolvedValue(true),
      getStatus: jest.fn().mockResolvedValue(mockCleanGitStatus),
    } as any;

    // Mock GitService constructor to return our mock
    MockedGitService.mockImplementation(() => mockGitService);

    // Mock FileSystemService constructor to return our mock
    MockedFileSystemService.mockImplementation(() => mockFileSystem);

    // Mock ConfigManager constructor to return our mock
    MockedConfigManager.mockImplementation(() => mockConfigManager);

    statusCommand = new StatusCommand('/test/dir');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with provided working directory', () => {
      const command = new StatusCommand('/custom/dir');
      expect(command).toBeInstanceOf(StatusCommand);
    });

    it('should initialize with current working directory when none provided', () => {
      const command = new StatusCommand();
      expect(command).toBeInstanceOf(StatusCommand);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      // Default successful setup
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);
      mockConfigManager.getHealth.mockResolvedValue({
        exists: true,
        valid: true,
        errors: [],
        needsMigration: false,
        currentVersion: '1.0.0',
      });
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.getStatus.mockResolvedValue(mockCleanGitStatus);
      mockFileSystem.getStats.mockResolvedValue({
        isSymbolicLink: () => true,
      } as any);
    });

    it('should successfully execute and return system status', async () => {
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Status retrieved successfully');
      expect(result.exitCode).toBe(0);
      expect(result.data).toBeDefined();
      expect(displaySpy).toHaveBeenCalled();

      displaySpy.mockRestore();
    });

    it('should execute with verbose option', async () => {
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const options: CommandOptions = { verbose: true };
      const result = await statusCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      displaySpy.mockRestore();
    });

    it('should throw NotInitializedError when not initialized', async () => {
      mockConfigManager.exists.mockResolvedValue(false);

      const result = await statusCommand.execute();

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Private git tracking is not initialized. Run "private init" first.',
      );
      expect(result.error).toBeInstanceOf(NotInitializedError);
      expect(result.exitCode).toBe(1);
    });

    it('should handle BaseError instances', async () => {
      const error = new StatusError('Test status error');
      mockConfigManager.exists.mockRejectedValue(error);

      const result = await statusCommand.execute();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Test status error');
      expect(result.error).toBe(error);
      expect(result.exitCode).toBe(1);
    });

    it('should handle non-BaseError instances', async () => {
      const error = new Error('Generic error');
      mockConfigManager.exists.mockRejectedValue(error);

      const result = await statusCommand.execute();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to get status');
      expect(result.error).toBe(error);
      expect(result.exitCode).toBe(1);
    });

    it('should handle non-Error instances', async () => {
      mockConfigManager.exists.mockRejectedValue('string error');

      const result = await statusCommand.execute();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to get status');
      expect(result.error).toBeInstanceOf(Error);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('executePrivateOnly', () => {
    beforeEach(() => {
      // Default successful setup
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);
      mockConfigManager.getHealth.mockResolvedValue({
        exists: true,
        valid: true,
        errors: [],
        needsMigration: false,
        currentVersion: '1.0.0',
      });
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.getStatus.mockResolvedValue(mockCleanGitStatus);
      mockFileSystem.getStats.mockResolvedValue({
        isSymbolicLink: () => true,
      } as any);
    });

    it('should successfully execute private-only status', async () => {
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayPrivateStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.executePrivateOnly();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Private status retrieved successfully');
      expect(result.exitCode).toBe(0);
      expect(result.data).toBeDefined();

      displaySpy.mockRestore();
    });

    it('should execute with verbose option', async () => {
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const options: CommandOptions = { verbose: true };
      const result = await statusCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      displaySpy.mockRestore();
    });

    it('should throw NotInitializedError when not initialized', async () => {
      mockConfigManager.exists.mockResolvedValue(false);

      const result = await statusCommand.executePrivateOnly();

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Private git tracking is not initialized. Run "private init" first.',
      );
      expect(result.error).toBeInstanceOf(NotInitializedError);
      expect(result.exitCode).toBe(1);
    });

    it('should handle BaseError instances', async () => {
      const error = new StatusError('Test private status error');
      mockConfigManager.exists.mockRejectedValue(error);

      const result = await statusCommand.executePrivateOnly();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Test private status error');
      expect(result.error).toBe(error);
      expect(result.exitCode).toBe(1);
    });

    it('should handle non-BaseError instances', async () => {
      const error = new Error('Generic private error');
      mockConfigManager.exists.mockRejectedValue(error);

      const result = await statusCommand.executePrivateOnly();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to get private status');
      expect(result.error).toBe(error);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('getSystemStatus', () => {
    beforeEach(() => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);
      mockConfigManager.getHealth.mockResolvedValue({
        exists: true,
        valid: true,
        errors: [],
        needsMigration: false,
        currentVersion: '1.0.0',
      });
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.getStatus.mockResolvedValue(mockCleanGitStatus);
      mockFileSystem.getStats.mockResolvedValue({
        isSymbolicLink: () => true,
      } as any);
    });

    it('should return complete system status when healthy', async () => {
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.initialized).toBe(true);
      expect(systemStatus.isHealthy).toBe(true);
      expect(systemStatus.mainRepo).toBeDefined();
      expect(systemStatus.privateRepo).toBeDefined();
      expect(systemStatus.symlinks).toBeDefined();
      expect(systemStatus.config).toBeDefined();
      expect(systemStatus.issues).toEqual([]);

      displaySpy.mockRestore();
    });

    it('should detect unhealthy system with issues', async () => {
      mockGitService.isRepository.mockResolvedValueOnce(false); // Main repo issue
      mockFileSystem.pathExists.mockResolvedValueOnce(false); // Private storage issue

      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.initialized).toBe(true);
      expect(systemStatus.isHealthy).toBe(false);
      expect(systemStatus.issues.length).toBeGreaterThan(0);

      displaySpy.mockRestore();
    });
  });

  describe('main repository status', () => {
    it('should get main repository status when repository exists', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.getStatus.mockResolvedValue(mockGitStatus);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.mainRepo.exists).toBe(true);
      expect(systemStatus.mainRepo.branch).toBe('main');
      expect(systemStatus.mainRepo.isClean).toBe(false);
      expect(systemStatus.mainRepo.stagedFiles).toBe(1);
      expect(systemStatus.mainRepo.modifiedFiles).toBe(1);
      expect(systemStatus.mainRepo.untrackedFiles).toBe(1);
      expect(systemStatus.mainRepo.deletedFiles).toBe(0);
    });

    it('should handle main repository not being a git repository', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(false);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.mainRepo.exists).toBe(false);
      expect(systemStatus.mainRepo.issues).toContain('Directory is not a git repository');
    });

    it('should handle main repository git service errors', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockGitService.isRepository.mockRejectedValue(new Error('Git service error'));
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.mainRepo.issues).toContain(
        'Failed to get main repository status: Git service error',
      );
    });
  });

  describe('private repository status', () => {
    it('should get private repository status when repository exists', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.getStatus.mockResolvedValue(mockGitStatus);

      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();
      const systemStatus = result.data as SystemStatus;

      displaySpy.mockRestore();

      expect(systemStatus.privateRepo.exists).toBe(true);
      expect(systemStatus.privateRepo.branch).toBe('main');
      expect(systemStatus.privateRepo.type).toBe('private');
    });

    it('should handle private git tracking not initialized', async () => {
      mockConfigManager.exists.mockResolvedValue(false);

      const result = await statusCommand.execute();

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(NotInitializedError);
    });

    it('should handle private storage directory not existing', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(false);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.privateRepo.issues).toContain('Private storage directory does not exist');
    });

    it('should handle private storage not being a git repository', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(false);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.privateRepo.issues).toContain('Private storage is not a git repository');
    });

    it('should handle private repository git service errors', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.getStatus.mockRejectedValue(new Error('Private git error'));
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.privateRepo.issues).toContain(
        'Failed to get private repository status: Private git error',
      );
    });
  });

  describe('symlink health', () => {
    beforeEach(() => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);
    });

    it('should report healthy symlinks when all links are valid', async () => {
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockFileSystem.getStats.mockResolvedValue({
        isSymbolicLink: () => true,
      } as any);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.symlinks.total).toBe(2);
      expect(systemStatus.symlinks.healthy).toBe(2);
      expect(systemStatus.symlinks.broken).toBe(0);
      expect(systemStatus.symlinks.brokenLinks).toEqual([]);
    });

    it('should detect broken symlinks when target does not exist', async () => {
      // We have 2 tracked paths: ['config.json', 'secrets.txt']
      // Call sequence: pathExists(storagePath), then for each tracked path: pathExists(fullPath), pathExists(targetPath)
      mockFileSystem.pathExists
        .mockResolvedValueOnce(true) // storagePath exists (from getPrivateRepositoryStatus)
        .mockResolvedValueOnce(true) // config.json link exists
        .mockResolvedValueOnce(false) // config.json target doesn't exist
        .mockResolvedValueOnce(true) // secrets.txt link exists
        .mockResolvedValueOnce(true); // secrets.txt target exists

      mockFileSystem.getStats.mockResolvedValue({
        isSymbolicLink: () => true,
      } as any);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.symlinks.total).toBe(2);
      expect(systemStatus.symlinks.healthy).toBe(1);
      expect(systemStatus.symlinks.broken).toBe(1);
      expect(systemStatus.symlinks.brokenLinks).toHaveLength(1);
      expect(systemStatus.symlinks.brokenLinks[0].reason).toBe('Target file does not exist');
      expect(systemStatus.symlinks.brokenLinks[0].repairable).toBe(false);
    });

    it('should detect when path exists but is not a symbolic link', async () => {
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockFileSystem.getStats.mockResolvedValue({
        isSymbolicLink: () => false,
      } as any);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.symlinks.broken).toBe(2);
      expect(systemStatus.symlinks.brokenLinks[0].reason).toBe(
        'Path exists but is not a symbolic link',
      );
      expect(systemStatus.symlinks.brokenLinks[0].repairable).toBe(true);
    });

    it('should detect when symbolic link does not exist', async () => {
      // We have 2 tracked paths: ['config.json', 'secrets.txt']
      // Call sequence: pathExists(storagePath), then for each tracked path: pathExists(fullPath), pathExists(targetPath if needed)
      mockFileSystem.pathExists
        .mockResolvedValueOnce(true) // storagePath exists (from getPrivateRepositoryStatus)
        .mockResolvedValueOnce(false) // config.json link doesn't exist
        .mockResolvedValueOnce(true) // config.json target exists (repairable check)
        .mockResolvedValueOnce(true) // secrets.txt link exists
        .mockResolvedValueOnce(true); // secrets.txt target exists

      mockFileSystem.getStats.mockResolvedValue({
        isSymbolicLink: () => true,
      } as any);

      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.symlinks.total).toBe(2);
      expect(systemStatus.symlinks.healthy).toBe(1);
      expect(systemStatus.symlinks.broken).toBe(1);
      expect(systemStatus.symlinks.brokenLinks).toHaveLength(1);
      expect(systemStatus.symlinks.brokenLinks[0].reason).toBe('Symbolic link does not exist');
      expect(systemStatus.symlinks.brokenLinks[0].repairable).toBe(true);
    });

    it('should handle symlink checking errors', async () => {
      mockFileSystem.pathExists.mockRejectedValue(new Error('Permission denied'));
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.symlinks.brokenLinks[0].reason).toContain(
        'Error checking symbolic link: Permission denied',
      );
      expect(systemStatus.symlinks.brokenLinks[0].repairable).toBe(false);
    });

    it('should return empty health when config cannot be loaded', async () => {
      mockConfigManager.exists.mockResolvedValue(false);

      const result = await statusCommand.execute();

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(NotInitializedError);
    });
  });

  describe('config health', () => {
    it('should delegate to config manager for health check', async () => {
      const mockHealth: ConfigHealth = {
        exists: true,
        valid: true,
        errors: [],
        needsMigration: false,
        currentVersion: '1.0.0',
      };

      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.getHealth.mockResolvedValue(mockHealth);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(mockConfigManager.getHealth).toHaveBeenCalled();
      expect(systemStatus.config).toEqual(mockHealth);
    });
  });

  describe('overall health determination', () => {
    beforeEach(() => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);
      mockConfigManager.getHealth.mockResolvedValue({
        exists: true,
        valid: true,
        errors: [],
        needsMigration: false,
        currentVersion: '1.0.0',
      });
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.getStatus.mockResolvedValue(mockCleanGitStatus);
      mockFileSystem.getStats.mockResolvedValue({
        isSymbolicLink: () => true,
      } as any);
    });

    it('should be healthy when all components are healthy', async () => {
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.isHealthy).toBe(true);
    });

    it('should be unhealthy when not initialized', async () => {
      mockConfigManager.exists.mockResolvedValue(false);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(NotInitializedError);
    });

    it('should be unhealthy when main repo does not exist', async () => {
      mockGitService.isRepository.mockResolvedValueOnce(false);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.isHealthy).toBe(false);
    });

    it('should be unhealthy when config is invalid', async () => {
      mockConfigManager.getHealth.mockResolvedValue({
        exists: true,
        valid: false,
        errors: ['Invalid config'],
        needsMigration: false,
        currentVersion: '1.0.0',
      });
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.isHealthy).toBe(false);
    });

    it('should be unhealthy when symlinks are broken', async () => {
      mockFileSystem.pathExists
        .mockResolvedValueOnce(true) // Link exists
        .mockResolvedValueOnce(false); // Target doesn't exist

      mockFileSystem.getStats.mockResolvedValue({
        isSymbolicLink: () => true,
      } as any);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.isHealthy).toBe(false);
    });
  });

  describe('system issues collection', () => {
    it('should collect all system issues', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.getHealth.mockResolvedValue({
        exists: true,
        valid: false,
        errors: ['Config error 1', 'Config error 2'],
        needsMigration: false,
        currentVersion: '1.0.0',
      });
      mockGitService.isRepository.mockResolvedValue(false);
      mockFileSystem.pathExists.mockResolvedValue(false);
      const displaySpy = jest
        .spyOn(statusCommand as any, 'displayCombinedStatus')
        .mockImplementation(() => {});

      const result = await statusCommand.execute();

      displaySpy.mockRestore();
      const systemStatus = result.data as SystemStatus;

      expect(systemStatus.issues).toContain('Main repository not found');
      expect(systemStatus.issues).toContain('Private repository not found');
      expect(systemStatus.issues).toContain('Configuration is invalid');
      expect(systemStatus.issues).toContain('Config error 1');
      expect(systemStatus.issues).toContain('Config error 2');
    });
  });

  describe('display methods', () => {
    beforeEach(() => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockConfigManager.load.mockResolvedValue(mockConfig);
      mockConfigManager.getHealth.mockResolvedValue({
        exists: true,
        valid: true,
        errors: [],
        needsMigration: false,
        currentVersion: '1.0.0',
      });
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.getStatus.mockResolvedValue(mockGitStatus);
      mockFileSystem.getStats.mockResolvedValue({
        isSymbolicLink: () => true,
      } as any);

      // For display tests, we need real console calls, so restore the console spy
      consoleSpy.mockRestore();
      consoleSpy = jest.spyOn(console, 'log'); // Track calls but don't mock them
    });

    afterEach(() => {
      // Restore the original mockImplementation for other tests
      consoleSpy.mockRestore();
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    it('should display combined status', async () => {
      await statusCommand.execute();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Private Git Tracking Status'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Main Repository'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Private Repository'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Symbolic Links'));
    });

    it('should display private-only status', async () => {
      await statusCommand.executePrivateOnly();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Private Repository Status'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tracked Files Summary'));
    });

    it('should display verbose information when requested', async () => {
      await statusCommand.execute({ verbose: true });

      // Should display more detailed information in verbose mode
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should display tracked files in private-only verbose mode', async () => {
      await statusCommand.executePrivateOnly({ verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tracked Files'));
    });

    it('should handle empty tracked paths', async () => {
      const emptyConfig = { ...mockConfig, trackedPaths: [] };
      mockConfigManager.load.mockResolvedValue(emptyConfig);

      await statusCommand.executePrivateOnly({ verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No files are currently tracked'),
      );
    });

    it('should handle tracked files display errors', async () => {
      mockConfigManager.load.mockRejectedValue(new Error('Config load error'));

      await statusCommand.executePrivateOnly({ verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load tracked files information'),
      );
    });
  });

  describe('error classes', () => {
    it('should create StatusError with correct properties', () => {
      const error = new StatusError('Test status error');

      expect(error.message).toBe('Test status error');
      expect(error.code).toBe('STATUS_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error).toBeInstanceOf(Error);
    });

    it('should create NotInitializedError with correct properties', () => {
      const error = new NotInitializedError('Not initialized');

      expect(error.message).toBe('Not initialized');
      expect(error.code).toBe('NOT_INITIALIZED');
      expect(error.recoverable).toBe(false);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
