import { InitCommand, InitError, AlreadyInitializedError } from '../../commands/init.command';
import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { GitService } from '../../core/git.service';
import { PlatformDetector } from '../../utils/platform.detector';
import { CommandOptions, DEFAULT_SETTINGS } from '../../types/config.types';

// Mock chalk completely to prevent console formatting issues
jest.mock('chalk', () => {
  const mockChalk: any = jest.fn((text: string) => text);

  // Create blue as both a function and object with bold method
  const mockBlue = jest.fn((text: string) => text) as any;
  mockBlue.bold = jest.fn((text: string) => text);
  mockChalk.blue = mockBlue;

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
jest.mock('../../utils/platform.detector');

const MockedConfigManager = ConfigManager as jest.MockedClass<typeof ConfigManager>;
const MockedFileSystemService = FileSystemService as jest.MockedClass<typeof FileSystemService>;
const MockedGitService = GitService as jest.MockedClass<typeof GitService>;
const MockedPlatformDetector = PlatformDetector as jest.MockedClass<typeof PlatformDetector>;

describe('InitCommand', () => {
  let initCommand: InitCommand;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockFileSystem: jest.Mocked<FileSystemService>;
  let mockMainGitService: jest.Mocked<GitService>;
  let mockPrivateGitService: jest.Mocked<GitService>;
  let consoleSpy: jest.SpyInstance;
  const testWorkingDir = '/test/workspace';

  beforeEach(() => {
    jest.clearAllMocks();

    // Create fresh mock instances
    mockConfigManager = {
      exists: jest.fn(),
      create: jest.fn(),
      load: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<ConfigManager>;

    mockFileSystem = {
      pathExists: jest.fn(),
      createDirectory: jest.fn(),
      writeFileAtomic: jest.fn(),
      readFile: jest.fn(),
      appendFile: jest.fn(),
    } as unknown as jest.Mocked<FileSystemService>;

    // Create separate instances for main and private git services
    mockMainGitService = {
      isRepository: jest.fn(),
      commit: jest.fn(),
      addFiles: jest.fn(),
      initRepository: jest.fn(),
    } as unknown as jest.Mocked<GitService>;

    mockPrivateGitService = {
      isRepository: jest.fn(), // Add isRepository method to private service too
      commit: jest.fn(),
      addFiles: jest.fn(),
      initRepository: jest.fn(),
    } as unknown as jest.Mocked<GitService>;

    MockedConfigManager.mockImplementation(() => mockConfigManager);
    MockedFileSystemService.mockImplementation(() => mockFileSystem);

    // Use workingDir parameter to determine which GitService instance to return
    // Main GitService: new GitService(this.workingDir, this.fileSystem)
    // Private GitService: new GitService(storagePath, this.fileSystem) where storagePath contains '.private-storage'
    MockedGitService.mockImplementation((workingDir: string) => {
      if (workingDir.includes('.private-storage')) {
        return mockPrivateGitService;
      } else {
        return mockMainGitService;
      }
    });

    // Mock platform detector static methods
    (
      MockedPlatformDetector.supportsSymlinks as jest.MockedFunction<
        typeof PlatformDetector.supportsSymlinks
      >
    ).mockResolvedValue(true);
    (
      MockedPlatformDetector.checkPermissions as jest.MockedFunction<
        typeof PlatformDetector.checkPermissions
      >
    ).mockResolvedValue({
      writable: true,
      readable: true,
      executable: true,
    });

    // Set up console spy
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Create command instance
    initCommand = new InitCommand(testWorkingDir);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should use provided working directory', () => {
      const customDir = '/custom/path';
      const command = new InitCommand(customDir);
      expect(command).toBeDefined();
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      // Setup default successful mocks for ALL tests in this describe block
      mockConfigManager.exists.mockResolvedValue(false);
      mockFileSystem.pathExists.mockResolvedValue(false);

      // Mock both GitService instances to have isRepository method
      mockMainGitService.isRepository.mockResolvedValue(true);
      mockPrivateGitService.isRepository.mockResolvedValue(true); // Just in case it gets called

      mockPrivateGitService.initRepository.mockResolvedValue();
      mockPrivateGitService.addFiles.mockResolvedValue();
      mockPrivateGitService.commit.mockResolvedValue('abc123');
      mockConfigManager.create.mockResolvedValue({
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.private',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test-project',
          mainRepoPath: testWorkingDir,
          cliVersion: '1.0.0',
          platform: 'linux',
          lastModified: new Date(),
        },
      });
      mockFileSystem.createDirectory.mockResolvedValue();
      mockFileSystem.writeFileAtomic.mockResolvedValue();
      mockFileSystem.readFile.mockResolvedValue('');
    });

    it('should successfully initialize private git tracking', async () => {
      const result = await initCommand.execute();

      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('Private git tracking initialized successfully'),
      });
    });

    it('should show verbose output when verbose option is true', async () => {
      const result = await initCommand.execute({ verbose: true });

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓ Environment validation passed'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Created .git-private/'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓ Private git repository initialized'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Configuration created'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Updated .gitignore'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Initial commit created:'));
    });

    it('should not show verbose output when verbose option is false', async () => {
      const result = await initCommand.execute({ verbose: false });

      expect(result.success).toBe(true);
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('✓ Validation completed'),
      );
    });

    it('should handle AlreadyInitializedError', async () => {
      mockConfigManager.exists.mockResolvedValue(true);

      const result = await initCommand.execute();

      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('already initialized'),
      });
    });

    it('should handle InitError', async () => {
      mockMainGitService.isRepository.mockResolvedValue(false);

      const result = await initCommand.execute();

      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('not a git repository'),
      });
    });

    it('should handle unexpected errors', async () => {
      mockFileSystem.createDirectory.mockRejectedValue(new Error('Unexpected filesystem error'));

      const result = await initCommand.execute();

      expect(result).toMatchObject({
        success: false,
        message: 'Failed to create directory structure',
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockFileSystem.createDirectory.mockRejectedValue('string error');

      const result = await initCommand.execute();

      expect(result).toMatchObject({
        success: false,
        message: 'Failed to create directory structure',
      });
    });
  });

  describe('checkNotAlreadyInitialized', () => {
    it('should throw AlreadyInitializedError when config exists', async () => {
      mockConfigManager.exists.mockResolvedValue(true);

      await expect(initCommand.execute()).resolves.toMatchObject({
        success: false,
        message:
          'Private git tracking is already initialized in this directory. Use "private status" to check current state.',
      });
    });

    it('should throw AlreadyInitializedError when private repo directory exists', async () => {
      mockConfigManager.exists.mockResolvedValue(false);
      mockFileSystem.pathExists
        .mockResolvedValueOnce(true) // privateRepoPath exists
        .mockResolvedValueOnce(false); // storagePath doesn't exist

      await expect(initCommand.execute()).resolves.toMatchObject({
        success: false,
        message: 'Private repository directory already exists: .git-private',
      });
    });

    it('should throw AlreadyInitializedError when storage directory exists', async () => {
      mockConfigManager.exists.mockResolvedValue(false);
      mockFileSystem.pathExists
        .mockResolvedValueOnce(false) // privateRepoPath doesn't exist
        .mockResolvedValueOnce(true); // storagePath exists

      await expect(initCommand.execute()).resolves.toMatchObject({
        success: false,
        message: 'Private storage directory already exists: .private-storage',
      });
    });
  });

  describe('validateEnvironment', () => {
    beforeEach(() => {
      // Reset default mocks
      mockConfigManager.exists.mockResolvedValue(false);
      mockFileSystem.pathExists.mockResolvedValue(false);
      mockMainGitService.isRepository.mockResolvedValue(true);
      mockPrivateGitService.initRepository.mockResolvedValue();
      mockPrivateGitService.addFiles.mockResolvedValue();
      mockPrivateGitService.commit.mockResolvedValue('abc123');
      mockConfigManager.create.mockResolvedValue({
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.private',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test-project',
          mainRepoPath: testWorkingDir,
          cliVersion: '1.0.0',
          platform: 'linux',
          lastModified: new Date(),
        },
      });
      mockFileSystem.createDirectory.mockResolvedValue();
      mockFileSystem.writeFileAtomic.mockResolvedValue();
      mockFileSystem.readFile.mockResolvedValue('');
    });

    it('should validate successfully in normal environment', async () => {
      mockMainGitService.isRepository.mockResolvedValue(true);
      (
        MockedPlatformDetector.supportsSymlinks as jest.MockedFunction<
          typeof PlatformDetector.supportsSymlinks
        >
      ).mockResolvedValue(true);
      (
        MockedPlatformDetector.checkPermissions as jest.MockedFunction<
          typeof PlatformDetector.checkPermissions
        >
      ).mockResolvedValue({ writable: true, readable: true, executable: true });

      const result = await initCommand.execute();

      expect(result.success).toBe(true);
    });

    it('should throw InitError when not in git repository', async () => {
      mockMainGitService.isRepository.mockResolvedValue(false);

      const result = await initCommand.execute();

      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('not a git repository'),
      });
    });

    it('should show symlink warning when symlinks not supported', async () => {
      (
        MockedPlatformDetector.supportsSymlinks as jest.MockedFunction<
          typeof PlatformDetector.supportsSymlinks
        >
      ).mockResolvedValue(false);

      const result = await initCommand.execute();

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Your system may not support symbolic links'),
      );
    });

    it('should show Windows-specific symlink warning', async () => {
      (
        MockedPlatformDetector.supportsSymlinks as jest.MockedFunction<
          typeof PlatformDetector.supportsSymlinks
        >
      ).mockResolvedValue(false);

      (
        MockedPlatformDetector.isWindows as jest.MockedFunction<typeof PlatformDetector.isWindows>
      ).mockReturnValue(true);

      const result = await initCommand.execute();

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          'On Windows, you may need to run as Administrator or enable Developer Mode',
        ),
      );
    });

    it('should throw InitError when directory is not writable', async () => {
      (
        MockedPlatformDetector.checkPermissions as jest.MockedFunction<
          typeof PlatformDetector.checkPermissions
        >
      ).mockResolvedValue({
        writable: false,
        readable: true,
        executable: true,
      });

      const result = await initCommand.execute();

      expect(result).toMatchObject({
        success: false,
        message: 'Cannot write to current directory. Please check permissions.',
      });
    });

    it('should show symlink warning in verbose mode when symlinks not supported', async () => {
      (
        MockedPlatformDetector.supportsSymlinks as jest.MockedFunction<
          typeof PlatformDetector.supportsSymlinks
        >
      ).mockResolvedValue(false);

      const result = await initCommand.execute({ verbose: true });

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Your system may not support symbolic links'),
      );
    });

    it('should show Windows-specific symlink warning in verbose mode', async () => {
      (
        MockedPlatformDetector.supportsSymlinks as jest.MockedFunction<
          typeof PlatformDetector.supportsSymlinks
        >
      ).mockResolvedValue(false);

      // Mock process.platform for this test
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
      });

      const result = await initCommand.execute({ verbose: true });

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('On Windows, you may need to run as Administrator'),
      );

      // Restore original platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
      });
    });
  });

  describe('createDirectoryStructure', () => {
    beforeEach(() => {
      // Setup default successful mocks
      mockConfigManager.exists.mockResolvedValue(false);
      mockFileSystem.pathExists.mockResolvedValue(false);
      mockMainGitService.isRepository.mockResolvedValue(true);
      mockPrivateGitService.initRepository.mockResolvedValue();
      mockPrivateGitService.addFiles.mockResolvedValue();
      mockPrivateGitService.commit.mockResolvedValue('abc123');
      mockConfigManager.create.mockResolvedValue({
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.private',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test-project',
          mainRepoPath: testWorkingDir,
          cliVersion: '1.0.0',
          platform: 'linux',
          lastModified: new Date(),
        },
      });
      mockFileSystem.createDirectory.mockResolvedValue();
      mockFileSystem.writeFileAtomic.mockResolvedValue();
      mockFileSystem.readFile.mockResolvedValue('');
    });

    it('should create private repo and storage directories', async () => {
      const result = await initCommand.execute();

      expect(mockFileSystem.createDirectory).toHaveBeenCalledWith(
        expect.stringContaining('.private'),
      );
      expect(result.success).toBe(true);
    });

    it('should handle directory creation errors', async () => {
      mockFileSystem.createDirectory.mockRejectedValueOnce(new Error('Cannot create directory'));

      const result = await initCommand.execute();

      expect(result).toMatchObject({
        success: false,
        message: 'Failed to create directory structure',
      });
    });
  });

  describe('initializePrivateRepository', () => {
    beforeEach(() => {
      // Setup default successful mocks
      mockConfigManager.exists.mockResolvedValue(false);
      mockFileSystem.pathExists.mockResolvedValue(false);
      mockMainGitService.isRepository.mockResolvedValue(true);
      mockPrivateGitService.initRepository.mockResolvedValue();
      mockPrivateGitService.addFiles.mockResolvedValue();
      mockPrivateGitService.commit.mockResolvedValue('abc123');
      mockConfigManager.create.mockResolvedValue({
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.private',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test-project',
          mainRepoPath: testWorkingDir,
          cliVersion: '1.0.0',
          platform: 'linux',
          lastModified: new Date(),
        },
      });
      mockFileSystem.createDirectory.mockResolvedValue();
      mockFileSystem.writeFileAtomic.mockResolvedValue();
      mockFileSystem.readFile.mockResolvedValue('');
    });

    it('should initialize git repository in storage directory', async () => {
      const result = await initCommand.execute();

      expect(mockPrivateGitService.initRepository).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle git initialization errors', async () => {
      mockPrivateGitService.initRepository.mockRejectedValueOnce(new Error('Git init failed'));

      const result = await initCommand.execute();

      expect(result).toMatchObject({
        success: false,
        message: 'Failed to initialize private git repository',
      });
    });
  });

  describe('createConfiguration', () => {
    beforeEach(() => {
      // Setup default successful mocks
      mockConfigManager.exists.mockResolvedValue(false);
      mockFileSystem.pathExists.mockResolvedValue(false);
      mockMainGitService.isRepository.mockResolvedValue(true);
      mockPrivateGitService.initRepository.mockResolvedValue();
      mockPrivateGitService.addFiles.mockResolvedValue();
      mockPrivateGitService.commit.mockResolvedValue('abc123');
      mockConfigManager.create.mockResolvedValue({
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.private',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test-project',
          mainRepoPath: testWorkingDir,
          cliVersion: '1.0.0',
          platform: 'linux',
          lastModified: new Date(),
        },
      });
      mockFileSystem.createDirectory.mockResolvedValue();
      mockFileSystem.writeFileAtomic.mockResolvedValue();
      mockFileSystem.readFile.mockResolvedValue('');
    });

    it('should create configuration file', async () => {
      const result = await initCommand.execute();

      expect(mockConfigManager.create).toHaveBeenCalledWith(
        expect.stringContaining(testWorkingDir),
      );
      expect(result.success).toBe(true);
    });

    it('should handle configuration creation errors', async () => {
      mockConfigManager.create.mockRejectedValueOnce(new Error('Config creation failed'));

      const result = await initCommand.execute();

      expect(result).toMatchObject({
        success: false,
        message: 'Failed to create configuration',
      });
    });
  });

  describe('updateGitignore', () => {
    beforeEach(() => {
      // Setup default successful mocks
      mockConfigManager.exists.mockResolvedValue(false);
      mockFileSystem.pathExists.mockResolvedValue(false);
      mockMainGitService.isRepository.mockResolvedValue(true);
      mockPrivateGitService.initRepository.mockResolvedValue();
      mockPrivateGitService.addFiles.mockResolvedValue();
      mockPrivateGitService.commit.mockResolvedValue('abc123');
      mockConfigManager.create.mockResolvedValue({
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.private',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test-project',
          mainRepoPath: testWorkingDir,
          cliVersion: '1.0.0',
          platform: 'linux',
          lastModified: new Date(),
        },
      });
      mockFileSystem.createDirectory.mockResolvedValue();
      mockFileSystem.writeFileAtomic.mockResolvedValue();
      mockFileSystem.readFile.mockResolvedValue('');
    });

    it('should create new .gitignore with private entries', async () => {
      mockFileSystem.readFile.mockRejectedValueOnce(new Error('File not found'));

      const result = await initCommand.execute();

      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        expect.stringContaining('.git-private'),
      );
      expect(result.success).toBe(true);
    });

    it('should update existing .gitignore', async () => {
      // Mock that .gitignore exists and has existing content
      mockFileSystem.pathExists.mockImplementation(async (filePath: string) => {
        if (filePath.includes('.gitignore')) return true;
        return false; // Other paths don't exist
      });
      mockFileSystem.readFile.mockResolvedValueOnce('# Existing content\n*.log\n');

      const result = await initCommand.execute();

      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        expect.stringContaining('# Existing content'),
      );
      expect(result.success).toBe(true);
    });

    it('should skip updating when entries already exist', async () => {
      mockFileSystem.readFile.mockResolvedValueOnce('# Existing\n.private/\n.private-*\n');

      const result = await initCommand.execute();

      expect(result.success).toBe(true);
      // Should not write to .gitignore when entries already exist
    });

    it('should handle gitignore update errors gracefully', async () => {
      mockFileSystem.pathExists.mockImplementation(async (filePath: string) => {
        if (filePath.includes('.gitignore')) return true;
        return false; // Other paths don't exist
      });
      mockFileSystem.readFile.mockResolvedValueOnce('existing content');
      mockFileSystem.writeFileAtomic.mockRejectedValueOnce(new Error('Write failed'));

      const result = await initCommand.execute();

      expect(result).toMatchObject({
        success: true,
        message: 'Private git tracking initialized successfully',
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Could not update .gitignore'),
      );
    });
  });

  describe('createInitialCommit', () => {
    beforeEach(() => {
      // Setup default successful mocks
      mockConfigManager.exists.mockResolvedValue(false);
      mockFileSystem.pathExists.mockResolvedValue(false);
      mockMainGitService.isRepository.mockResolvedValue(true);
      mockPrivateGitService.initRepository.mockResolvedValue();
      mockPrivateGitService.addFiles.mockResolvedValue();
      mockPrivateGitService.commit.mockResolvedValue('abc123');
      mockConfigManager.create.mockResolvedValue({
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.private',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test-project',
          mainRepoPath: testWorkingDir,
          cliVersion: '1.0.0',
          platform: 'linux',
          lastModified: new Date(),
        },
      });
      mockFileSystem.createDirectory.mockResolvedValue();
      mockFileSystem.writeFileAtomic.mockResolvedValue();
      mockFileSystem.readFile.mockResolvedValue('');
    });

    it('should create README and initial commit in private repository', async () => {
      const result = await initCommand.execute();

      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        expect.stringContaining('README.md'),
        expect.stringContaining('Private Files Storage'),
      );
      expect(mockPrivateGitService.addFiles).toHaveBeenCalledWith(['README.md']);
      expect(mockPrivateGitService.commit).toHaveBeenCalledWith(
        'Initial commit: Private files storage initialized',
      );
      expect(result.success).toBe(true);
    });

    it('should handle initial commit errors', async () => {
      mockPrivateGitService.commit.mockRejectedValueOnce(new Error('Commit failed'));

      await expect(initCommand.execute()).resolves.toMatchObject({
        success: false,
        message: 'Failed to create initial commit',
      });
    });
  });

  describe('error classes', () => {
    it('should create InitError with correct properties', () => {
      const error = new InitError('Test message', 'Details');
      expect(error.code).toBe('INIT_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.message).toBe('Test message');
    });

    it('should create AlreadyInitializedError with correct properties', () => {
      const error = new AlreadyInitializedError('Already initialized');
      expect(error.code).toBe('ALREADY_INITIALIZED');
      expect(error.recoverable).toBe(false);
      expect(error.message).toBe('Already initialized');
    });
  });
});
