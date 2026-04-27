import {
  CommitCommand,
  CommitError,
  NotInitializedError,
  NoChangesToCommitError,
} from '../../commands/commit.command';
import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { GitService } from '../../core/git.service';
import { InputValidator } from '../../utils/input.validator';
import { InvalidArgumentError, SecurityError } from '../../errors/specific.errors';

// Mock dependencies
jest.mock('../../core/config.manager');
jest.mock('../../core/filesystem.service');
jest.mock('../../core/git.service');
jest.mock('../../utils/input.validator');

const MockedConfigManager = ConfigManager as jest.MockedClass<typeof ConfigManager>;
const MockedFileSystemService = FileSystemService as jest.MockedClass<typeof FileSystemService>;
const MockedGitService = GitService as jest.MockedClass<typeof GitService>;
const MockedInputValidator = InputValidator as jest.MockedClass<typeof InputValidator>;

describe('CommitCommand', () => {
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockFileSystem: jest.Mocked<FileSystemService>;
  let mockGitService: jest.Mocked<GitService>;
  let commitCommand: CommitCommand;
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
    mockGitService.getStatus = jest.fn();
    mockGitService.addAll = jest.fn();
    mockGitService.commit = jest.fn();

    // Mock constructors to return our mocked instances
    MockedConfigManager.mockImplementation(() => mockConfigManager);
    MockedFileSystemService.mockImplementation(() => mockFileSystem);
    MockedGitService.mockImplementation(() => mockGitService);

    // Mock InputValidator static methods
    MockedInputValidator.validateCommitMessage = jest.fn();
    MockedInputValidator.sanitizeString = jest.fn((str, maxLength) => str.substring(0, maxLength));

    commitCommand = new CommitCommand('/test/workspace');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with default working directory when none provided', () => {
      const originalCwd = process.cwd;
      process.cwd = jest.fn().mockReturnValue('/default/dir');

      const command = new CommitCommand();
      expect(command).toBeInstanceOf(CommitCommand);

      process.cwd = originalCwd;
    });

    it('should initialize with provided working directory', () => {
      const command = new CommitCommand('/custom/dir');
      expect(command).toBeInstanceOf(CommitCommand);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      // Default successful mocks
      mockConfigManager.exists.mockResolvedValue(true);
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockGitService.isRepository.mockResolvedValue(true);
      mockGitService.getStatus.mockResolvedValue({
        current: 'main',
        tracking: 'origin/main',
        ahead: 0,
        behind: 0,
        isClean: false,
        staged: [],
        modified: ['file1.txt'],
        untracked: [],
        deleted: [],
        conflicted: [],
        files: [{ path: 'file1.txt', working_dir: 'M' }],
      });
      mockGitService.addAll.mockResolvedValue();
      mockGitService.commit.mockResolvedValue('abc12345');
    });

    describe('successful commits', () => {
      it('should commit with provided message', async () => {
        const result = await commitCommand.execute('Test commit message', { verbose: false });

        expect(result.success).toBe(true);
        expect(result.message).toContain('Successfully committed changes');
        expect(result.message).toContain('abc12345'.substring(0, 8));
        expect(result.exitCode).toBe(0);
        expect((result.data as any).commitHash).toBe('abc12345');
        expect((result.data as any).message).toBe('Test commit message');
        expect(mockGitService.addAll).toHaveBeenCalled();
        expect(mockGitService.commit).toHaveBeenCalledWith('Test commit message');
      });

      it('should commit with auto-generated message when none provided', async () => {
        const result = await commitCommand.execute(undefined, { verbose: false });

        expect(result.success).toBe(true);
        expect(result.message).toContain('Successfully committed changes');
        expect((result.data as any).message).toMatch(
          /^Update private files \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)$/,
        );
        expect(mockGitService.commit).toHaveBeenCalledWith(
          expect.stringMatching(/^Update private files/),
        );
      });

      it('should commit with empty string message (auto-generated)', async () => {
        const result = await commitCommand.execute('   ', { verbose: false });

        expect(result.success).toBe(true);
        expect((result.data as any).message).toMatch(
          /^Update private files \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)$/,
        );
      });

      it('should show verbose output when enabled', async () => {
        const result = await commitCommand.execute('Test commit', { verbose: true });

        expect(result.success).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Committing changes to private repository'),
        );
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Changes detected'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Modified files: 1'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Staging all changes'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Creating commit'));
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Commit created: abc12345'),
        );
      });

      it('should show different file types in verbose mode', async () => {
        mockGitService.getStatus.mockResolvedValue({
          current: 'main',
          tracking: 'origin/main',
          ahead: 0,
          behind: 0,
          isClean: false,
          staged: [],
          modified: ['file1.txt'],
          untracked: ['file2.txt', 'file3.txt'],
          deleted: ['file4.txt'],
          conflicted: [],
          files: [
            { path: 'file1.txt', working_dir: 'M' },
            { path: 'file2.txt', working_dir: '?' },
            { path: 'file3.txt', working_dir: '?' },
            { path: 'file4.txt', working_dir: 'D' },
          ],
        });

        const result = await commitCommand.execute('Test commit', { verbose: true });

        expect(result.success).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Modified files: 1'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Untracked files: 2'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Deleted files: 1'));
      });

      it('should validate commit message when provided', async () => {
        await commitCommand.execute('Valid message', { verbose: false });

        expect(MockedInputValidator.validateCommitMessage).toHaveBeenCalledWith('Valid message');
        expect(MockedInputValidator.sanitizeString).toHaveBeenCalledWith('Valid message', 500);
      });
    });

    describe('error handling', () => {
      it('should throw NotInitializedError when config does not exist', async () => {
        mockConfigManager.exists.mockResolvedValue(false);

        const result = await commitCommand.execute('Test message');

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(NotInitializedError);
        expect(result.message).toContain('not initialized');
        expect(result.exitCode).toBe(1);
      });

      it('should throw CommitError when storage directory does not exist', async () => {
        mockFileSystem.pathExists.mockResolvedValue(false);

        const result = await commitCommand.execute('Test message');

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(CommitError);
        expect(result.message).toContain('Private storage directory does not exist');
        expect(result.exitCode).toBe(1);
      });

      it('should throw CommitError when storage is not a git repository', async () => {
        mockGitService.isRepository.mockResolvedValue(false);

        const result = await commitCommand.execute('Test message');

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(CommitError);
        expect(result.message).toContain('Private storage is not a git repository');
        expect(result.exitCode).toBe(1);
      });

      it('should throw NoChangesToCommitError when repository is clean', async () => {
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

        const result = await commitCommand.execute('Test message');

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(NoChangesToCommitError);
        expect(result.message).toBe('No changes to commit in private repository');
        expect(result.exitCode).toBe(1);
      });

      it('should show no changes message in verbose mode when repository is clean', async () => {
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

        const result = await commitCommand.execute('Test message', { verbose: true });

        expect(result.success).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No changes detected'));
      });

      it('should handle invalid commit message from validator', async () => {
        (MockedInputValidator.validateCommitMessage as jest.Mock).mockImplementation(() => {
          throw new InvalidArgumentError('Commit message is too short', 'commit');
        });

        const result = await commitCommand.execute('ab');

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(InvalidArgumentError);
        expect(result.message).toBe('Commit message is too short');
        expect(result.exitCode).toBe(1);
      });

      it('should handle security error from validator', async () => {
        (MockedInputValidator.validateCommitMessage as jest.Mock).mockImplementation(() => {
          throw new SecurityError('Commit message contains invalid characters', 'commit');
        });

        const result = await commitCommand.execute('Test\x00message');

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(CommitError);
        expect(result.message).toBe('Invalid commit message');
        expect(result.exitCode).toBe(1);
      });

      it('should handle git status check failure', async () => {
        mockGitService.getStatus.mockRejectedValue(new Error('Git status failed'));

        const result = await commitCommand.execute('Test message');

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(CommitError);
        expect(result.message).toBe('Failed to check repository status');
        expect(result.exitCode).toBe(1);
      });

      it('should handle git commit failure', async () => {
        mockGitService.commit.mockRejectedValue(new Error('Commit failed'));

        const result = await commitCommand.execute('Test message');

        expect(result.success).toBe(false);
        expect(result.message).toBe('Failed to commit changes to private repository');
        expect(result.exitCode).toBe(1);
      });

      it('should handle unexpected errors gracefully', async () => {
        mockConfigManager.exists.mockRejectedValue(new Error('Unexpected error'));

        const result = await commitCommand.execute('Test message');

        expect(result.success).toBe(false);
        expect(result.message).toBe('Failed to commit changes to private repository');
        expect(result.exitCode).toBe(1);
      });
    });
  });

  describe('CommitError', () => {
    it('should create CommitError with correct properties', () => {
      const error = new CommitError('Test commit error');
      expect(error.code).toBe('COMMIT_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.message).toBe('Test commit error');
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

  describe('NoChangesToCommitError', () => {
    it('should create NoChangesToCommitError with correct properties', () => {
      const error = new NoChangesToCommitError('No changes');
      expect(error.code).toBe('NO_CHANGES_TO_COMMIT');
      expect(error.recoverable).toBe(false);
      expect(error.message).toBe('No changes');
    });
  });
});
