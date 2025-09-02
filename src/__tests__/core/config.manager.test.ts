import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { PrivateGitConfig, DEFAULT_PATHS } from '../../types/config.types';
import * as path from 'path';

// Mock FileSystemService
jest.mock('../../core/filesystem.service');
const MockedFileSystemService = jest.mocked(FileSystemService);

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let mockFileSystem: jest.Mocked<FileSystemService>;
  const testWorkingDir = '/test/workspace';
  const configPath = path.join(testWorkingDir, DEFAULT_PATHS.config);

  beforeEach(() => {
    mockFileSystem = new MockedFileSystemService() as jest.Mocked<FileSystemService>;
    configManager = new ConfigManager(testWorkingDir, mockFileSystem);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('exists', () => {
    it('should return true when config file exists', async () => {
      mockFileSystem.pathExists.mockResolvedValue(true);
      
      const result = await configManager.exists();
      
      expect(result).toBe(true);
      expect(mockFileSystem.pathExists).toHaveBeenCalledWith(configPath);
    });

    it('should return false when config file does not exist', async () => {
      mockFileSystem.pathExists.mockResolvedValue(false);
      
      const result = await configManager.exists();
      
      expect(result).toBe(false);
      expect(mockFileSystem.pathExists).toHaveBeenCalledWith(configPath);
    });
  });

  describe('load', () => {
    const validConfig: PrivateGitConfig = {
      version: '1.0.0',
      storagePath: DEFAULT_PATHS.storage,
      trackedPaths: ['file1.txt', 'dir/file2.txt'],
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    };

    it('should load valid configuration', async () => {
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify(validConfig));
      
      const result = await configManager.load();
      
      expect(result).toEqual({
        ...validConfig,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(mockFileSystem.readFile).toHaveBeenCalledWith(configPath);
    });

    it('should throw error for invalid JSON', async () => {
      mockFileSystem.readFile.mockResolvedValue('invalid json');
      
      await expect(configManager.load()).rejects.toThrow('Invalid configuration file format');
    });

    it('should throw error for missing required fields', async () => {
      const invalidConfig = { version: '1.0.0' }; // missing required fields
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify(invalidConfig));
      
      await expect(configManager.load()).rejects.toThrow('Configuration validation failed');
    });

    it('should throw error when file read fails', async () => {
      const error = new Error('File not found');
      mockFileSystem.readFile.mockRejectedValue(error);
      
      await expect(configManager.load()).rejects.toThrow('Failed to load configuration');
    });
  });

  describe('save', () => {
    const testConfig: PrivateGitConfig = {
      version: '1.0.0',
      storagePath: DEFAULT_PATHS.storage,
      trackedPaths: ['file1.txt'],
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    };

    it('should save configuration successfully', async () => {
      mockFileSystem.writeFileAtomic.mockResolvedValue(undefined);
      
      await configManager.save(testConfig);
      
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('"version":"1.0.0"')
      );
    });

    it('should validate configuration before saving', async () => {
      const invalidConfig = { version: '1.0.0' } as any; // missing required fields
      
      await expect(configManager.save(invalidConfig)).rejects.toThrow('Configuration validation failed');
    });

    it('should throw error when file write fails', async () => {
      const error = new Error('Permission denied');
      mockFileSystem.writeFileAtomic.mockRejectedValue(error);
      
      await expect(configManager.save(testConfig)).rejects.toThrow('Failed to save configuration');
    });
  });

  describe('create', () => {
    it('should create new configuration', async () => {
      mockFileSystem.pathExists.mockResolvedValue(false);
      mockFileSystem.writeFileAtomic.mockResolvedValue(undefined);
      
      const config = await configManager.create(testWorkingDir);
      
      expect(config).toEqual({
        version: '1.0.0',
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: [],
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalled();
    });

    it('should throw error if config already exists', async () => {
      mockFileSystem.pathExists.mockResolvedValue(true);
      
      await expect(configManager.create(testWorkingDir)).rejects.toThrow('Configuration already exists');
    });
  });

  describe('addTrackedPath', () => {
    const initialConfig: PrivateGitConfig = {
      version: '1.0.0',
      storagePath: DEFAULT_PATHS.storage,
      trackedPaths: ['existing.txt'],
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    };

    beforeEach(() => {
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify(initialConfig));
      mockFileSystem.writeFileAtomic.mockResolvedValue(undefined);
    });

    it('should add new tracked path', async () => {
      await configManager.addTrackedPath('new-file.txt');
      
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('"trackedPaths":["existing.txt","new-file.txt"]')
      );
    });

    it('should not add duplicate paths', async () => {
      await configManager.addTrackedPath('existing.txt');
      
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('"trackedPaths":["existing.txt"]')
      );
    });

    it('should normalize paths before adding', async () => {
      await configManager.addTrackedPath('./new-file.txt');
      
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('"trackedPaths":["existing.txt","new-file.txt"]')
      );
    });
  });

  describe('removeTrackedPath', () => {
    const initialConfig: PrivateGitConfig = {
      version: '1.0.0',
      storagePath: DEFAULT_PATHS.storage,
      trackedPaths: ['file1.txt', 'file2.txt', 'dir/file3.txt'],
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    };

    beforeEach(() => {
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify(initialConfig));
      mockFileSystem.writeFileAtomic.mockResolvedValue(undefined);
    });

    it('should remove existing tracked path', async () => {
      await configManager.removeTrackedPath('file2.txt');
      
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('"trackedPaths":["file1.txt","dir/file3.txt"]')
      );
    });

    it('should ignore non-existent paths', async () => {
      await configManager.removeTrackedPath('nonexistent.txt');
      
      expect(mockFileSystem.writeFileAtomic).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('"trackedPaths":["file1.txt","file2.txt","dir/file3.txt"]')
      );
    });
  });

  describe('getHealth', () => {
    it('should return healthy status for valid config', async () => {
      const validConfig: PrivateGitConfig = {
        version: '1.0.0',
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: ['file1.txt'],
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify(validConfig));
      
      const health = await configManager.getHealth();
      
      expect(health).toEqual({
        valid: true,
        exists: true,
        readable: true,
        currentVersion: '1.0.0',
        targetVersion: '1.0.0',
        needsMigration: false,
        errors: [],
      });
    });

    it('should return unhealthy status for missing config', async () => {
      mockFileSystem.pathExists.mockResolvedValue(false);
      
      const health = await configManager.getHealth();
      
      expect(health).toEqual({
        valid: false,
        exists: false,
        readable: false,
        currentVersion: undefined,
        targetVersion: '1.0.0',
        needsMigration: false,
        errors: ['Configuration file does not exist'],
      });
    });

    it('should return unhealthy status for invalid config', async () => {
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('invalid json');
      
      const health = await configManager.getHealth();
      
      expect(health.valid).toBe(false);
      expect(health.errors).toContain(expect.stringContaining('Invalid JSON format'));
    });

    it('should detect version mismatch', async () => {
      const oldConfig = {
        version: '0.9.0',
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: [],
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };
      mockFileSystem.pathExists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify(oldConfig));
      
      const health = await configManager.getHealth();
      
      expect(health.needsMigration).toBe(true);
      expect(health.currentVersion).toBe('0.9.0');
      expect(health.targetVersion).toBe('1.0.0');
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      const error = new Error('Disk full') as NodeJS.ErrnoException;
      error.code = 'ENOSPC';
      mockFileSystem.writeFileAtomic.mockRejectedValue(error);
      
      const config: PrivateGitConfig = {
        version: '1.0.0',
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(configManager.save(config)).rejects.toThrow('Failed to save configuration');
    });

    it('should handle permission errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockFileSystem.readFile.mockRejectedValue(error);
      
      await expect(configManager.load()).rejects.toThrow('Failed to load configuration');
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent read operations', async () => {
      const validConfig: PrivateGitConfig = {
        version: '1.0.0',
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: [],
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify(validConfig));
      
      const promises = Array.from({ length: 5 }, () => configManager.load());
      
      await expect(Promise.all(promises)).resolves.toHaveLength(5);
    });

    it('should handle concurrent write operations', async () => {
      const config: PrivateGitConfig = {
        version: '1.0.0',
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockFileSystem.writeFileAtomic.mockResolvedValue(undefined);
      
      const promises = Array.from({ length: 3 }, () => configManager.save(config));
      
      await expect(Promise.all(promises)).resolves.toHaveLength(3);
    });
  });
});