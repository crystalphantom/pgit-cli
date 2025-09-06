import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { PrivateConfig, DEFAULT_PATHS } from '../../types/config.types';
import * as path from 'path';

// Mock FileSystemService
jest.mock('../../core/filesystem.service');

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let mockFileSystem: jest.Mocked<FileSystemService>;
  const testWorkingDir = '/test/workspace';
  const configPath = path.join(testWorkingDir, DEFAULT_PATHS.config);

  beforeEach(() => {
    // Create mock FileSystemService with minimal required methods
    mockFileSystem = {
      pathExists: jest.fn(),
      readFile: jest.fn(),
      writeFileAtomic: jest.fn(),
      validatePathString: jest.fn(),
      getStats: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    configManager = new ConfigManager(testWorkingDir, mockFileSystem);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('exists', () => {
    it('should return true when config file exists', async () => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);

      const result = await configManager.exists();

      expect(result).toBe(true);
      expect(mockFileSystem.pathExists).toHaveBeenCalledWith(configPath);
    });

    it('should return false when config file does not exist', async () => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(false);

      const result = await configManager.exists();

      expect(result).toBe(false);
      expect(mockFileSystem.pathExists).toHaveBeenCalledWith(configPath);
    });
  });

  describe('load', () => {
    const validConfig: PrivateConfig = {
      version: '1.0.0-beta.1',
      privateRepoPath: DEFAULT_PATHS.privateRepo,
      storagePath: DEFAULT_PATHS.storage,
      trackedPaths: ['file1.txt', 'dir/file2.txt'],
      initialized: new Date('2024-01-01T00:00:00Z'),
      settings: {
        autoGitignore: true,
        autoCleanup: true,
        verboseOutput: false,
        createBackups: true,
        maxBackups: 5,
      },
      metadata: {
        projectName: 'test-project',
        mainRepoPath: '/test/workspace',
        cliVersion: '1.0.0-beta.1',
        platform: 'test',
        lastModified: new Date('2024-01-01T00:00:00Z'),
      },
    };

    it('should load valid configuration', async () => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      (mockFileSystem.readFile as jest.Mock).mockResolvedValue(JSON.stringify(validConfig));

      const result = await configManager.load();

      expect(result).toEqual(validConfig);
      expect(mockFileSystem.readFile).toHaveBeenCalledWith(configPath);
    });

    it('should throw error for invalid JSON', async () => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      (mockFileSystem.readFile as jest.Mock).mockResolvedValue('invalid json');

      await expect(configManager.load()).rejects.toThrow('Configuration file is corrupted');
    });

    it('should throw error for missing required fields', async () => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      const invalidConfig = { version: '1.0.0-beta.1' }; // missing required fields
      (mockFileSystem.readFile as jest.Mock).mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(configManager.load()).rejects.toThrow('Configuration file format is invalid');
    });

    it('should throw error when file read fails', async () => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      const error = new Error('File not found');
      (mockFileSystem.readFile as jest.Mock).mockRejectedValue(error);

      await expect(configManager.load()).rejects.toThrow('Failed to load configuration');
    });
  });

  describe('save', () => {
    const testConfig: PrivateConfig = {
      version: '1.0.0-beta.1',
      privateRepoPath: DEFAULT_PATHS.privateRepo,
      storagePath: DEFAULT_PATHS.storage,
      trackedPaths: ['file1.txt'],
      initialized: new Date('2024-01-01T00:00:00Z'),
      settings: {
        autoGitignore: true,
        autoCleanup: true,
        verboseOutput: false,
        createBackups: true,
        maxBackups: 5,
      },
      metadata: {
        projectName: 'test-project',
        mainRepoPath: '/test/workspace',
        cliVersion: '1.0.0-beta.1',
        platform: 'test',
        lastModified: new Date('2024-01-01T00:00:00Z'),
      },
    };

    it('should save configuration successfully', async () => {
      (mockFileSystem.writeFileAtomic as jest.Mock).mockResolvedValue(undefined);

      await configManager.save(testConfig);

      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('"version": "1.0.0-beta.1"'),
      );
    });

    it('should validate configuration before saving', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invalidConfig = { version: '1.0.0-beta.1' } as any; // missing required fields

      await expect(configManager.save(invalidConfig)).rejects.toThrow(
        'Configuration data is invalid',
      );
    });

    it('should throw error when file write fails', async () => {
      const error = new Error('Permission denied');
      mockFileSystem.writeFileAtomic.mockRejectedValue(error);

      await expect(configManager.save(testConfig)).rejects.toThrow('Failed to save configuration');
    });
  });

  describe('create', () => {
    it('should create new configuration', async () => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(false);
      (mockFileSystem.writeFileAtomic as jest.Mock).mockResolvedValue(undefined);

      const config = await configManager.create(testWorkingDir);

      expect(config).toEqual({
        version: '1.0.0-beta.1',
        privateRepoPath: DEFAULT_PATHS.privateRepo,
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: [],
        initialized: expect.any(Date),
        settings: {
          autoGitignore: true,
          autoCleanup: true,
          verboseOutput: false,
          createBackups: true,
          maxBackups: 5,
        },
        metadata: {
          projectName: 'workspace',
          mainRepoPath: testWorkingDir,
          cliVersion: '1.0.0-beta.1',
          platform: expect.any(String),
          lastModified: expect.any(Date),
        },
      });
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalled();
    });

    it('should overwrite config if it already exists', async () => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      (mockFileSystem.writeFileAtomic as jest.Mock).mockResolvedValue(undefined);

      const config = await configManager.create(testWorkingDir);

      expect(config.version).toBe('1.0.0-beta.1');
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalled();
    });
  });

  describe('addTrackedPath', () => {
    const initialConfig: PrivateConfig = {
      version: '1.0.0-beta.1',
      privateRepoPath: DEFAULT_PATHS.privateRepo,
      storagePath: DEFAULT_PATHS.storage,
      trackedPaths: ['existing.txt'],
      initialized: new Date('2024-01-01T00:00:00Z'),
      settings: {
        autoGitignore: true,
        autoCleanup: true,
        verboseOutput: false,
        createBackups: true,
        maxBackups: 5,
      },
      metadata: {
        projectName: 'test-project',
        mainRepoPath: '/test/workspace',
        cliVersion: '1.0.0-beta.1',
        platform: 'test',
        lastModified: new Date('2024-01-01T00:00:00Z'),
      },
    };

    beforeEach(() => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      (mockFileSystem.readFile as jest.Mock).mockResolvedValue(JSON.stringify(initialConfig));
      (mockFileSystem.writeFileAtomic as jest.Mock).mockResolvedValue(undefined);
    });

    it('should add new tracked path', async () => {
      await configManager.addTrackedPath('new-file.txt');

      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('"trackedPaths": [\n    "existing.txt",\n    "new-file.txt"\n  ]'),
      );
    });

    it('should not add duplicate paths', async () => {
      await expect(configManager.addTrackedPath('existing.txt')).rejects.toThrow(
        'Path is already tracked',
      );
    });

    it('should normalize paths before adding', async () => {
      await configManager.addTrackedPath('./new-file.txt');

      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('"trackedPaths": [\n    "existing.txt",\n    "new-file.txt"\n  ]'),
      );
    });
  });

  describe('removeTrackedPath', () => {
    const initialConfig: PrivateConfig = {
      version: '1.0.0-beta.1',
      privateRepoPath: DEFAULT_PATHS.privateRepo,
      storagePath: DEFAULT_PATHS.storage,
      trackedPaths: ['file1.txt', 'file2.txt', 'dir/file3.txt'],
      initialized: new Date('2024-01-01T00:00:00Z'),
      settings: {
        autoGitignore: true,
        autoCleanup: true,
        verboseOutput: false,
        createBackups: true,
        maxBackups: 5,
      },
      metadata: {
        projectName: 'test-project',
        mainRepoPath: '/test/workspace',
        cliVersion: '1.0.0-beta.1',
        platform: 'test',
        lastModified: new Date('2024-01-01T00:00:00Z'),
      },
    };

    beforeEach(() => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      (mockFileSystem.readFile as jest.Mock).mockResolvedValue(JSON.stringify(initialConfig));
      (mockFileSystem.writeFileAtomic as jest.Mock).mockResolvedValue(undefined);
    });

    it('should remove existing tracked path', async () => {
      await configManager.removeTrackedPath('file2.txt');

      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('"trackedPaths": [\n    "file1.txt",\n    "dir/file3.txt"\n  ]'),
      );
    });

    it('should throw error for non-existent paths', async () => {
      await expect(configManager.removeTrackedPath('nonexistent.txt')).rejects.toThrow(
        'Path is not tracked',
      );
    });
  });

  describe('getHealth', () => {
    it('should return healthy status for valid config', async () => {
      const validConfig: PrivateConfig = {
        version: '1.0.0-beta.1',
        privateRepoPath: DEFAULT_PATHS.privateRepo,
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: ['file1.txt'],
        initialized: new Date('2024-01-01T00:00:00Z'),
        settings: {
          autoGitignore: true,
          autoCleanup: true,
          verboseOutput: false,
          createBackups: true,
          maxBackups: 5,
        },
        metadata: {
          projectName: 'test-project',
          mainRepoPath: '/test/workspace',
          cliVersion: '1.0.0-beta.1',
          platform: 'test',
          lastModified: new Date('2024-01-01T00:00:00Z'),
        },
      };
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      (mockFileSystem.readFile as jest.Mock).mockResolvedValue(JSON.stringify(validConfig));
      (mockFileSystem.getStats as jest.Mock).mockResolvedValue({
        isSymbolicLink: jest.fn().mockReturnValue(true),
      });

      const health = await configManager.getHealth();

      expect(health.valid).toBe(true);
      expect(health.exists).toBe(true);
      expect(health.currentVersion).toBe('1.0.0-beta.1');
      expect(health.needsMigration).toBe(false);
    });

    it('should return unhealthy status for missing config', async () => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(false);

      const health = await configManager.getHealth();

      expect(health.valid).toBe(false);
      expect(health.exists).toBe(false);
      expect(health.errors).toContain('Configuration file does not exist');
    });

    it('should return unhealthy status for invalid config', async () => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      (mockFileSystem.readFile as jest.Mock).mockResolvedValue('invalid json');

      const health = await configManager.getHealth();

      expect(health.valid).toBe(false);
      expect(health.errors).toContain('Configuration file is corrupted (invalid JSON)');
    });

    it('should detect version mismatch', async () => {
      const oldConfig: PrivateConfig = {
        version: '0.9.0',
        privateRepoPath: DEFAULT_PATHS.privateRepo,
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: [],
        initialized: new Date('2024-01-01T00:00:00Z'),
        settings: {
          autoGitignore: true,
          autoCleanup: true,
          verboseOutput: false,
          createBackups: true,
          maxBackups: 5,
        },
        metadata: {
          projectName: 'test-project',
          mainRepoPath: '/test/workspace',
          cliVersion: '0.9.0',
          platform: 'test',
          lastModified: new Date('2024-01-01T00:00:00Z'),
        },
      };
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      (mockFileSystem.readFile as jest.Mock).mockResolvedValue(JSON.stringify(oldConfig));

      const health = await configManager.getHealth();

      expect(health.needsMigration).toBe(true);
      expect(health.currentVersion).toBe('0.9.0');
      expect(health.targetVersion).toBe('1.0.0-beta.1');
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      const error = new Error('Disk full') as NodeJS.ErrnoException;
      error.code = 'ENOSPC';
      (mockFileSystem.writeFileAtomic as jest.Mock).mockRejectedValue(error);

      const config: PrivateConfig = {
        version: '1.0.0-beta.1',
        privateRepoPath: DEFAULT_PATHS.privateRepo,
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: [],
        initialized: new Date(),
        settings: {
          autoGitignore: true,
          autoCleanup: true,
          verboseOutput: false,
          createBackups: true,
          maxBackups: 5,
        },
        metadata: {
          projectName: 'test-project',
          mainRepoPath: '/test/workspace',
          cliVersion: '1.0.0-beta.1',
          platform: 'test',
          lastModified: new Date(),
        },
      };

      await expect(configManager.save(config)).rejects.toThrow('Failed to save configuration');
    });

    it('should handle permission errors', async () => {
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      (mockFileSystem.readFile as jest.Mock).mockRejectedValue(error);

      await expect(configManager.load()).rejects.toThrow('Failed to load configuration');
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent read operations', async () => {
      const validConfig: PrivateConfig = {
        version: '1.0.0-beta.1',
        privateRepoPath: DEFAULT_PATHS.privateRepo,
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: [],
        initialized: new Date('2024-01-01T00:00:00Z'),
        settings: {
          autoGitignore: true,
          autoCleanup: true,
          verboseOutput: false,
          createBackups: true,
          maxBackups: 5,
        },
        metadata: {
          projectName: 'test-project',
          mainRepoPath: '/test/workspace',
          cliVersion: '1.0.0-beta.1',
          platform: 'test',
          lastModified: new Date('2024-01-01T00:00:00Z'),
        },
      };
      (mockFileSystem.pathExists as jest.Mock).mockResolvedValue(true);
      (mockFileSystem.readFile as jest.Mock).mockResolvedValue(JSON.stringify(validConfig));

      const promises = Array.from({ length: 5 }, () => configManager.load());

      await expect(Promise.all(promises)).resolves.toHaveLength(5);
    });

    it('should handle concurrent write operations', async () => {
      const config: PrivateConfig = {
        version: '1.0.0-beta.1',
        privateRepoPath: DEFAULT_PATHS.privateRepo,
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: [],
        initialized: new Date(),
        settings: {
          autoGitignore: true,
          autoCleanup: true,
          verboseOutput: false,
          createBackups: true,
          maxBackups: 5,
        },
        metadata: {
          projectName: 'test-project',
          mainRepoPath: '/test/workspace',
          cliVersion: '1.0.0-beta.1',
          platform: 'test',
          lastModified: new Date(),
        },
      };
      (mockFileSystem.writeFileAtomic as jest.Mock).mockResolvedValue(undefined);

      const promises = Array.from({ length: 3 }, () => configManager.save(config));

      await expect(Promise.all(promises)).resolves.toHaveLength(3);
    });
  });
});
