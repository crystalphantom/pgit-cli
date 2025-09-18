import { GitService } from '../../core/git.service.ts';
import { FileSystemService } from '../../core/filesystem.service.ts';
import { GitExcludeSettings, DEFAULT_GIT_EXCLUDE_SETTINGS } from '../../types/config.types.ts';
import { GitExcludeError } from '../../errors/git.error.ts';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { simpleGit, SimpleGit } from 'simple-git';

describe('GitService - Configuration Support', () => {
  let gitService: GitService;
  let fileSystem: FileSystemService;
  let tempDir: string;
  let git: SimpleGit;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-config-'));
    fileSystem = new FileSystemService();

    // Initialize git repository
    git = simpleGit(tempDir);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Create initial commit
    await fs.writeFile(path.join(tempDir, 'README.md'), '# Test Repository');
    await git.add('README.md');
    await git.commit('Initial commit');
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  describe('constructor with exclude settings', () => {
    it('should use default settings when none provided', () => {
      gitService = new GitService(tempDir, fileSystem);

      // Access private property for testing
      const excludeSettings = gitService.excludeSettings;
      expect(excludeSettings).toEqual(DEFAULT_GIT_EXCLUDE_SETTINGS);
    });

    it('should use provided exclude settings', () => {
      const customSettings: GitExcludeSettings = {
        enabled: false,
        markerComment: '# custom test marker',
        fallbackBehavior: 'error',
        validateOperations: false,
      };

      gitService = new GitService(tempDir, fileSystem, customSettings);

      const excludeSettings = gitService.excludeSettings;
      expect(excludeSettings).toEqual(customSettings);
    });

    it('should create shallow copy of settings to prevent mutation', () => {
      const customSettings: GitExcludeSettings = {
        enabled: true,
        markerComment: '# original marker',
        fallbackBehavior: 'warn',
        validateOperations: true,
      };

      gitService = new GitService(tempDir, fileSystem, customSettings);

      // Modify original settings
      customSettings.enabled = false;
      customSettings.markerComment = '# modified marker';

      // GitService should still have original values
      const excludeSettings = gitService.excludeSettings;
      expect(excludeSettings.enabled).toBe(true);
      expect(excludeSettings.markerComment).toBe('# original marker');
    });
  });

  describe('static factory methods', () => {
    it('should create GitService with default settings using create()', () => {
      gitService = GitService.create(tempDir);

      const excludeSettings = gitService.excludeSettings;
      expect(excludeSettings).toEqual(DEFAULT_GIT_EXCLUDE_SETTINGS);
    });

    it('should create GitService with custom settings using createWithConfig()', () => {
      const customSettings: GitExcludeSettings = {
        enabled: false,
        markerComment: '# factory test marker',
        fallbackBehavior: 'silent',
        validateOperations: false,
      };

      gitService = GitService.createWithConfig(tempDir, customSettings);

      const excludeSettings = gitService.excludeSettings;
      expect(excludeSettings).toEqual(customSettings);
    });
  });

  describe('exclude operations with disabled settings', () => {
    beforeEach(() => {
      const disabledSettings: GitExcludeSettings = {
        enabled: false,
        markerComment: '# test marker',
        fallbackBehavior: 'warn',
        validateOperations: true,
      };

      gitService = new GitService(tempDir, fileSystem, disabledSettings);
    });

    it('should handle disabled exclude operations with warn behavior', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await gitService.addToGitExclude('test-file.txt');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Git exclude operation 'add' for 'test-file.txt' skipped"),
      );

      consoleSpy.mockRestore();
    });

    it('should handle disabled exclude operations with silent behavior', async () => {
      const silentSettings: GitExcludeSettings = {
        enabled: false,
        markerComment: '# test marker',
        fallbackBehavior: 'silent',
        validateOperations: true,
      };

      gitService = new GitService(tempDir, fileSystem, silentSettings);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await gitService.addToGitExclude('test-file.txt');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should throw error with error fallback behavior', async () => {
      const errorSettings: GitExcludeSettings = {
        enabled: false,
        markerComment: '# test marker',
        fallbackBehavior: 'error',
        validateOperations: true,
      };

      gitService = new GitService(tempDir, fileSystem, errorSettings);

      await expect(gitService.addToGitExclude('test-file.txt')).rejects.toThrow(GitExcludeError);

      await expect(gitService.addToGitExclude('test-file.txt')).rejects.toThrow(
        'Exclude operations are disabled',
      );
    });

    it('should handle removeFromGitExclude with disabled settings', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await gitService.removeFromGitExclude('test-file.txt');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Git exclude operation 'remove' for 'test-file.txt' skipped"),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('exclude operations with enabled settings', () => {
    beforeEach(() => {
      const customSettings: GitExcludeSettings = {
        enabled: true,
        markerComment: '# custom pgit marker',
        fallbackBehavior: 'warn',
        validateOperations: true,
      };

      gitService = new GitService(tempDir, fileSystem, customSettings);
    });

    it('should use custom marker comment in exclude file', async () => {
      await gitService.addToGitExclude('test-file.txt');

      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      const content = await fs.readFile(excludePath, 'utf8');

      expect(content).toContain('# custom pgit marker');
      expect(content).toContain('test-file.txt');
    });

    it('should not duplicate custom marker comment', async () => {
      await gitService.addToGitExclude('file1.txt');
      await gitService.addToGitExclude('file2.txt');

      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      const content = await fs.readFile(excludePath, 'utf8');

      const markerCount = (content.match(/# custom pgit marker/g) || []).length;
      expect(markerCount).toBe(1);
    });

    it('should preserve existing exclude entries with custom marker', async () => {
      // Create exclude file with existing content
      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      await fs.ensureDir(path.dirname(excludePath));
      await fs.writeFile(excludePath, '# Existing comment\nexisting-file.txt\n');

      await gitService.addToGitExclude('new-file.txt');

      const content = await fs.readFile(excludePath, 'utf8');
      expect(content).toContain('# Existing comment');
      expect(content).toContain('existing-file.txt');
      expect(content).toContain('# custom pgit marker');
      expect(content).toContain('new-file.txt');
    });
  });

  describe('configuration validation edge cases', () => {
    it('should handle undefined fallback behavior gracefully', async () => {
      const invalidSettings = {
        enabled: false,
        markerComment: '# test marker',
        fallbackBehavior: undefined,
        validateOperations: true,
      } as unknown as GitExcludeSettings;

      gitService = new GitService(tempDir, fileSystem, invalidSettings);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await gitService.addToGitExclude('test-file.txt');

      // Should default to warn behavior
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Git exclude operation 'add' for 'test-file.txt' skipped"),
      );

      consoleSpy.mockRestore();
    });

    it('should handle empty marker comment', async () => {
      const settingsWithEmptyMarker: GitExcludeSettings = {
        enabled: true,
        markerComment: '#',
        fallbackBehavior: 'warn',
        validateOperations: true,
      };

      gitService = new GitService(tempDir, fileSystem, settingsWithEmptyMarker);

      await gitService.addToGitExclude('test-file.txt');

      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      const content = await fs.readFile(excludePath, 'utf8');

      expect(content).toContain('#');
      expect(content).toContain('test-file.txt');
    });
  });

  describe('integration with existing functionality', () => {
    it('should not affect other GitService methods', async () => {
      const customSettings: GitExcludeSettings = {
        enabled: false,
        markerComment: '# test marker',
        fallbackBehavior: 'silent',
        validateOperations: true,
      };

      gitService = new GitService(tempDir, fileSystem, customSettings);

      // Test that other methods still work
      expect(await gitService.isRepository()).toBe(true);

      const status = await gitService.getStatus();
      expect(status).toBeDefined();
      expect(status.current).toBeDefined();
    });

    it('should work with file system operations', async () => {
      const customSettings: GitExcludeSettings = {
        enabled: true,
        markerComment: '# integration test marker',
        fallbackBehavior: 'warn',
        validateOperations: true,
      };

      gitService = new GitService(tempDir, fileSystem, customSettings);

      // Create a test file
      const testFile = path.join(tempDir, 'integration-test.txt');
      await fs.writeFile(testFile, 'test content');

      // Add to git and then to exclude
      await git.add('integration-test.txt');
      await gitService.addToGitExclude('integration-test.txt');

      // Verify exclude file was created correctly
      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      expect(await fs.pathExists(excludePath)).toBe(true);

      const content = await fs.readFile(excludePath, 'utf8');
      expect(content).toContain('# integration test marker');
      expect(content).toContain('integration-test.txt');
    });
  });
});
