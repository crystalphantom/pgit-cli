import {
  GitOpsCommand,
  GitOpsError,
  NotInitializedError,
  LogOptions,
  DiffOptions,
} from '../../commands/gitops.command';
import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { GitService, GitLogEntry } from '../../core/git.service';

// Mock chalk to avoid formatting issues in tests
jest.mock('chalk', () => ({
  blue: jest.fn(str => str),
  green: jest.fn(str => str),
  yellow: jest.fn(str => str),
  bold: jest.fn(str => str),
  cyan: jest.fn(str => str),
  white: jest.fn(str => str),
}));

// Mock dependencies
jest.mock('../../core/config.manager');
jest.mock('../../core/filesystem.service');
jest.mock('../../core/git.service');

const MockedConfigManager = ConfigManager as jest.MockedClass<typeof ConfigManager>;
const MockedFileSystemService = FileSystemService as jest.MockedClass<typeof FileSystemService>;
const MockedGitService = GitService as jest.MockedClass<typeof GitService>;

describe('GitOpsCommand', () => {
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockFileSystem: jest.Mocked<FileSystemService>;
  let mockGitService: jest.Mocked<GitService>;
  let gitOpsCommand: GitOpsCommand;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup console spy
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Mock FileSystemService
    mockFileSystem = new MockedFileSystemService() as jest.Mocked<FileSystemService>;
    mockFileSystem.pathExists = jest.fn();

    // Mock ConfigManager
    mockConfigManager = new MockedConfigManager('', mockFileSystem) as jest.Mocked<ConfigManager>;
    mockConfigManager.exists = jest.fn();

    // Mock GitService
    mockGitService = new MockedGitService('', mockFileSystem) as jest.Mocked<GitService>;
    mockGitService.isRepository = jest.fn();
    mockGitService.getLog = jest.fn();
    mockGitService.getDiff = jest.fn();
    mockGitService.addAll = jest.fn();
    mockGitService.addFiles = jest.fn();
    mockGitService.getStatus = jest.fn();
    mockGitService.getBranches = jest.fn();
    mockGitService.createBranch = jest.fn();
    mockGitService.checkout = jest.fn();
    mockGitService.reset = jest.fn();
    mockGitService.getCurrentBranch = jest.fn();

    // Mock constructors to return our mocked instances
    MockedConfigManager.mockImplementation(() => mockConfigManager);
    MockedFileSystemService.mockImplementation(() => mockFileSystem);
    MockedGitService.mockImplementation(() => mockGitService);

    gitOpsCommand = new GitOpsCommand('/test/workspace');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with default working directory when none provided', () => {
      const originalCwd = process.cwd;
      process.cwd = jest.fn().mockReturnValue('/default/dir');

      const command = new GitOpsCommand();
      expect(command).toBeInstanceOf(GitOpsCommand);

      process.cwd = originalCwd;
    });

    it('should initialize with provided working directory', () => {
      const command = new GitOpsCommand('/custom/dir');
      expect(command).toBeInstanceOf(GitOpsCommand);
    });
  });

  describe('log', () => {
    beforeEach(() => {
      // Default successful setup
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
    });

    it('should retrieve and display commit history with default options', async () => {
      const mockLogEntries: GitLogEntry[] = [
        {
          hash: 'abc1234567890def',
          message: 'First commit',
          author: 'Test Author',
          email: 'test@example.com',
          date: '2023-01-01 12:00:00',
        },
        {
          hash: 'def9876543210abc',
          message: 'Second commit',
          author: 'Another Author',
          email: 'another@example.com',
          date: '2023-01-02 13:00:00',
        },
      ];

      mockGitService.getLog.mockResolvedValue(mockLogEntries);

      const result = await gitOpsCommand.log();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Retrieved 2 commit(s)');
      expect(result.data).toEqual(mockLogEntries);
      expect(result.exitCode).toBe(0);
      expect(mockGitService.getLog).toHaveBeenCalledWith({
        maxCount: 10,
        oneline: false,
      });
    });

    it('should handle custom log options', async () => {
      const mockLogEntries: GitLogEntry[] = [
        {
          hash: 'abc1234567890def',
          message: 'Only commit',
          author: 'Test Author',
          email: 'test@example.com',
          date: '2023-01-01 12:00:00',
        },
      ];

      mockGitService.getLog.mockResolvedValue(mockLogEntries);

      const logOptions: LogOptions = { maxCount: 5, oneline: true };
      const result = await gitOpsCommand.log(logOptions, { verbose: true });

      expect(result.success).toBe(true);
      expect(mockGitService.getLog).toHaveBeenCalledWith({
        maxCount: 5,
        oneline: true,
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Getting commit history from private repository'),
      );
    });

    it('should handle empty commit history', async () => {
      mockGitService.getLog.mockResolvedValue([]);

      const result = await gitOpsCommand.log();

      expect(result.success).toBe(true);
      expect(result.message).toBe('No commits found');
      expect(result.data).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No commits found in private repository'),
      );
    });

    it('should handle not initialized error', async () => {
      mockConfigManager.exists.mockResolvedValue(false);

      const result = await gitOpsCommand.log();

      expect(result.success).toBe(false);
      expect(result.message).toContain('not initialized');
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeInstanceOf(NotInitializedError);
    });

    it('should handle missing private storage directory', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(false);

      const result = await gitOpsCommand.log();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Private storage directory does not exist');
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeInstanceOf(GitOpsError);
    });

    it('should handle invalid git repository', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(false);

      const result = await gitOpsCommand.log();

      expect(result.success).toBe(false);
      expect(result.message).toContain('not a git repository');
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeInstanceOf(GitOpsError);
    });

    it('should handle git service errors', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.getLog.mockRejectedValue(new Error('Git error'));

      const result = await gitOpsCommand.log();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to get commit history');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('diff', () => {
    beforeEach(() => {
      // Default successful setup
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
    });

    it('should retrieve and display diff with default options', async () => {
      const mockDiffOutput = 'diff --git a/file1.txt b/file1.txt\n+added line';
      mockGitService.getDiff.mockResolvedValue(mockDiffOutput);

      const result = await gitOpsCommand.diff();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Differences retrieved successfully');
      expect(result.data).toBe(mockDiffOutput);
      expect(result.exitCode).toBe(0);
      expect(mockGitService.getDiff).toHaveBeenCalledWith({
        cached: false,
        nameOnly: false,
      });
      expect(consoleSpy).toHaveBeenCalledWith(mockDiffOutput);
    });

    it('should handle custom diff options', async () => {
      const mockDiffOutput = 'file1.txt\nfile2.txt';
      mockGitService.getDiff.mockResolvedValue(mockDiffOutput);

      const diffOptions: DiffOptions = { cached: true, nameOnly: true };
      const result = await gitOpsCommand.diff(diffOptions, { verbose: true });

      expect(result.success).toBe(true);
      expect(mockGitService.getDiff).toHaveBeenCalledWith({
        cached: true,
        nameOnly: true,
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Getting differences from private repository'),
      );
    });

    it('should handle empty diff output', async () => {
      mockGitService.getDiff.mockResolvedValue('   \n  ');

      const result = await gitOpsCommand.diff();

      expect(result.success).toBe(true);
      expect(result.message).toBe('No differences found');
      expect(result.data).toBe('');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No differences found'));
    });

    it('should handle git service errors', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.getDiff.mockRejectedValue(new Error('Diff error'));

      const result = await gitOpsCommand.diff();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to get differences');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('addChanges', () => {
    beforeEach(() => {
      // Default successful setup
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
    });

    it('should stage all changes when all=true', async () => {
      const result = await gitOpsCommand.addChanges(true, { verbose: true });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Changes staged successfully');
      expect(result.exitCode).toBe(0);
      expect(mockGitService.addAll).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Staging all changes in private repository'),
      );
    });

    it('should stage modified and untracked files when all=false', async () => {
      mockGitService.getStatus.mockResolvedValue({
        current: 'main',
        tracking: 'origin/main',
        ahead: 0,
        behind: 0,
        isClean: false,
        staged: [],
        modified: ['file1.txt', 'file2.txt'],
        untracked: ['file3.txt'],
        deleted: [],
        conflicted: [],
        files: [],
      });

      const result = await gitOpsCommand.addChanges(false, { verbose: true });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Changes staged successfully');
      expect(mockGitService.addFiles).toHaveBeenCalledWith(['file1.txt', 'file2.txt', 'file3.txt']);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Staging changes in private repository'),
      );
    });

    it('should handle no changes to stage', async () => {
      mockGitService.getStatus.mockResolvedValue({
        current: 'main',
        tracking: 'origin/main',
        ahead: 0,
        behind: 0,
        isClean: true,
        staged: [],
        modified: [],
        untracked: [],
        deleted: [],
        conflicted: [],
        files: [],
      });

      const result = await gitOpsCommand.addChanges(false);

      expect(result.success).toBe(true);
      expect(result.message).toBe('No changes to stage');
      expect(result.exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No changes to stage'));
    });

    it('should handle git service errors', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.addAll.mockRejectedValue(new Error('Add error'));

      const result = await gitOpsCommand.addChanges(true);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to stage changes');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('branch', () => {
    beforeEach(() => {
      // Default successful setup
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
    });

    it('should create new branch when create=true', async () => {
      const result = await gitOpsCommand.branch('feature-branch', true, { verbose: true });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Branch 'feature-branch' created successfully");
      expect(result.exitCode).toBe(0);
      expect(mockGitService.createBranch).toHaveBeenCalledWith('feature-branch');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Creating new branch 'feature-branch'"),
      );
    });

    it('should list branches when no branch name or create=false', async () => {
      const mockBranches = {
        all: ['main', 'feature-1', 'feature-2'],
        current: 'main',
      };
      mockGitService.getBranches.mockResolvedValue(mockBranches);

      const result = await gitOpsCommand.branch(undefined, false, { verbose: true });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Found 3 branch(es)');
      expect(result.data).toEqual(mockBranches);
      expect(result.exitCode).toBe(0);
      expect(mockGitService.getBranches).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Getting branches'));
    });

    it('should handle git service errors during branch creation', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.createBranch.mockRejectedValue(new Error('Branch error'));

      const result = await gitOpsCommand.branch('test-branch', true);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to perform branch operation');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('checkout', () => {
    beforeEach(() => {
      // Default successful setup
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
    });

    it('should checkout to target branch', async () => {
      const result = await gitOpsCommand.checkout('feature-branch', { verbose: true });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Switched to 'feature-branch' successfully");
      expect(result.exitCode).toBe(0);
      expect(mockGitService.checkout).toHaveBeenCalledWith('feature-branch');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Checking out 'feature-branch'"),
      );
    });

    it('should handle git service errors during checkout', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.checkout.mockRejectedValue(new Error('Checkout error'));

      const result = await gitOpsCommand.checkout('nonexistent-branch');

      expect(result.success).toBe(false);
      expect(result.message).toBe("Failed to checkout 'nonexistent-branch'");
      expect(result.exitCode).toBe(1);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      // Default successful setup
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
    });

    it('should reset with default options (soft, HEAD)', async () => {
      const result = await gitOpsCommand.reset(undefined, undefined, { verbose: true });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Reset to HEAD (soft) completed successfully');
      expect(result.exitCode).toBe(0);
      expect(mockGitService.reset).toHaveBeenCalledWith('soft', 'HEAD');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Resetting private repository (soft) to HEAD'),
      );
    });

    it('should reset with custom options', async () => {
      const result = await gitOpsCommand.reset('hard', 'abc1234');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Reset to abc1234 (hard) completed successfully');
      expect(result.exitCode).toBe(0);
      expect(mockGitService.reset).toHaveBeenCalledWith('hard', 'abc1234');
    });

    it('should handle git service errors during reset', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.reset.mockRejectedValue(new Error('Reset error'));

      const result = await gitOpsCommand.reset('hard', 'HEAD~1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to reset to HEAD~1');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('getCurrentBranch', () => {
    beforeEach(() => {
      // Default successful setup
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
    });

    it('should get current branch name', async () => {
      mockGitService.getCurrentBranch.mockResolvedValue('feature-branch');

      const result = await gitOpsCommand.getCurrentBranch({ verbose: true });

      expect(result.success).toBe(true);
      expect(result.message).toBe('feature-branch');
      expect(result.data).toBe('feature-branch');
      expect(result.exitCode).toBe(0);
      expect(mockGitService.getCurrentBranch).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Current branch: feature-branch'),
      );
    });

    it('should handle git service errors', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.getCurrentBranch.mockRejectedValue(new Error('Branch error'));

      const result = await gitOpsCommand.getCurrentBranch();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to get current branch');
      expect(result.exitCode).toBe(1);
    });
  });
});

describe('GitOpsError', () => {
  it('should have correct properties', () => {
    const error = new GitOpsError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('GIT_OPS_ERROR');
    expect(error.recoverable).toBe(true);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('NotInitializedError', () => {
  it('should have correct properties', () => {
    const error = new NotInitializedError('Not initialized');
    expect(error.message).toBe('Not initialized');
    expect(error.code).toBe('NOT_INITIALIZED');
    expect(error.recoverable).toBe(false);
    expect(error).toBeInstanceOf(Error);
  });
});
