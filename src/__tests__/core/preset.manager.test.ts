import { PresetManager, PresetValidationError } from '../../core/preset.manager';
import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { PrivateConfig, Preset, DEFAULT_SETTINGS } from '../../types/config.types';

// Mock dependencies
jest.mock('../../core/config.manager');
jest.mock('../../core/filesystem.service');
jest.mock('fs');

describe('PresetManager', () => {
  let presetManager: PresetManager;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  beforeEach(() => {
    mockConfigManager = new ConfigManager(
      'test',
      new FileSystemService(),
    ) as jest.Mocked<ConfigManager>;
    presetManager = new PresetManager(mockConfigManager);

    // Mock the ConfigManager.getConfigPath to return a test path
    mockConfigManager.getConfigPath = jest
      .fn()
      .mockReturnValue('/test/workspace/.pgit/config.json');

    // Mock built-in presets loading
    const mockBuiltinPresets = {
      version: '1.0.0',
      presets: {
        'test-preset': {
          description: 'Test preset',
          category: 'test',
          paths: ['test/path1', 'test/path2'],
        },
        'another-preset': {
          description: 'Another test preset',
          paths: ['another/path'],
        },
      },
    };

    // Mock fs.readFileSync and fs.existsSync
    const fs = require('fs');
    fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockBuiltinPresets));
    fs.existsSync = jest.fn().mockImplementation((filePath: string) => {
      // Mock existsSync to return true for the expected presets.json path
      return filePath.endsWith('presets.json');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPreset', () => {
    it('should return user preset when available', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {
          'user-preset': {
            description: 'User preset',
            paths: ['user/path'],
            created: new Date(),
          },
        },
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);

      const preset = await presetManager.getPreset('user-preset');

      expect(preset).toEqual({
        description: 'User preset',
        paths: ['user/path'],
        created: expect.any(Date),
      });
    });

    it('should return built-in preset when user preset not found', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {},
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);

      const preset = await presetManager.getPreset('test-preset');

      expect(preset).toEqual({
        description: 'Test preset',
        category: 'test',
        paths: ['test/path1', 'test/path2'],
      });
    });

    it('should return undefined when preset not found', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {},
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);

      const preset = await presetManager.getPreset('nonexistent');

      expect(preset).toBeUndefined();
    });
  });

  describe('getAllPresets', () => {
    it('should return merged presets with user presets taking precedence', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {
          'user-preset': {
            description: 'User preset',
            paths: ['user/path'],
          },
          'test-preset': {
            description: 'Overridden test preset',
            paths: ['overridden/path'],
          },
        },
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);

      const result = await presetManager.getAllPresets();

      expect(result.builtin).toHaveProperty('test-preset');
      expect(result.builtin).toHaveProperty('another-preset');
      expect(result.localUser).toHaveProperty('user-preset');
      expect(result.localUser).toHaveProperty('test-preset');
      expect(result.merged['test-preset'].description).toBe('Overridden test preset');
    });
  });

  describe('saveUserPreset', () => {
    it('should save user preset successfully', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {},
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);
      mockConfigManager.save.mockResolvedValue();

      const preset: Preset = {
        description: 'New preset',
        paths: ['new/path'],
      };

      await presetManager.saveUserPreset('new-preset', preset);

      expect(mockConfigManager.save).toHaveBeenCalledWith({
        ...mockConfig,
        presets: {
          'new-preset': {
            ...preset,
            created: expect.any(Date),
          },
        },
      });
    });

    it('should throw error for invalid preset name', async () => {
      await expect(presetManager.saveUserPreset('', {} as Preset)).rejects.toThrow(
        PresetValidationError,
      );

      await expect(presetManager.saveUserPreset('a'.repeat(51), {} as Preset)).rejects.toThrow(
        PresetValidationError,
      );
    });
  });

  describe('removeUserPreset', () => {
    it('should remove user preset successfully', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {
          'preset-to-remove': {
            description: 'Preset to remove',
            paths: ['path/to/remove'],
          },
        },
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);
      mockConfigManager.save.mockResolvedValue();

      const result = await presetManager.removeUserPreset('preset-to-remove');

      expect(result).toBe(true);
      expect(mockConfigManager.save).toHaveBeenCalledWith({
        ...mockConfig,
        presets: {},
      });
    });

    it('should return false when preset does not exist', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {},
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);

      const result = await presetManager.removeUserPreset('nonexistent');

      expect(result).toBe(false);
      expect(mockConfigManager.save).not.toHaveBeenCalled();
    });
  });

  describe('getPresetSource', () => {
    it('should return "user" for user-defined presets', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {
          'user-preset': {
            description: 'User preset',
            paths: ['user/path'],
          },
        },
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);

      const source = await presetManager.getPresetSource('user-preset');

      expect(source).toBe('localUser');
    });

    it('should return "builtin" for built-in presets', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {},
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);

      const source = await presetManager.getPresetSource('test-preset');

      expect(source).toBe('builtin');
    });

    it('should return "none" for non-existent presets', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {},
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);

      const source = await presetManager.getPresetSource('nonexistent');

      expect(source).toBe('none');
    });
  });

  describe('markPresetUsed', () => {
    it('should update lastUsed timestamp for user presets', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {
          'user-preset': {
            description: 'User preset',
            paths: ['user/path'],
            created: new Date(),
          },
        },
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);
      mockConfigManager.save.mockResolvedValue();

      await presetManager.markPresetUsed('user-preset');

      expect(mockConfigManager.save).toHaveBeenCalledWith({
        ...mockConfig,
        presets: {
          'user-preset': {
            description: 'User preset',
            paths: ['user/path'],
            created: expect.any(Date),
            lastUsed: expect.any(Date),
          },
        },
      });
    });

    it('should not update timestamp for built-in presets', async () => {
      const mockConfig: PrivateConfig = {
        version: '1.0.0',
        privateRepoPath: '.private',
        storagePath: '.storage',
        trackedPaths: [],
        initialized: new Date(),
        settings: DEFAULT_SETTINGS,
        metadata: {
          projectName: 'test',
          mainRepoPath: '/test',
          cliVersion: '1.0.0',
          platform: 'test',
          lastModified: new Date(),
        },
        presets: {},
      };

      mockConfigManager.load.mockResolvedValue(mockConfig);

      await presetManager.markPresetUsed('test-preset');

      expect(mockConfigManager.save).not.toHaveBeenCalled();
    });
  });
});
