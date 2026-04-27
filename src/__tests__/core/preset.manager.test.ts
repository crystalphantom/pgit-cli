import { PresetManager, PresetValidationError } from '../../core/preset.manager';
import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import {
  PrivateConfig,
  Preset,
  DEFAULT_SETTINGS,
  BuiltinPresets,
  CURRENT_PRESET_VERSION,
} from '../../types/config.types';
import fs from 'fs-extra';
import os from 'os';

// Mock dependencies
jest.mock('../../core/config.manager');
jest.mock('../../core/filesystem.service');
jest.mock('fs-extra');
jest.mock('os');
jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

describe('PresetManager', () => {
  let presetManager: PresetManager;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  const mockWorkingDir = '/test/project';
  const mockHomeDir = '/home/user';

  // Mock package presets (built-in)
  const mockBuiltinPresets: BuiltinPresets = {
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

  // Mock global config for centralized system
  const mockGlobalConfig = {
    version: CURRENT_PRESET_VERSION,
    presets: {
      'global-preset': {
        description: 'Global user preset',
        paths: ['global/path'],
        created: new Date('2023-01-01'),
      },
    },
    settings: {
      autoCommit: false,
      verboseOutput: false,
    },
    projects: {
      [mockWorkingDir]: {
        name: 'test-project',
        path: mockWorkingDir,
        lastUsed: new Date('2023-01-02'),
        preset: 'test-preset',
      },
    },
  };

  // Mock project presets for centralized system
  const mockProjectPresets = {
    'project-preset': {
      description: 'Project-specific preset',
      paths: ['project/path'],
      created: new Date('2023-01-03'),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Mock fs-extra for centralized config system
    mockFs.existsSync = jest.fn().mockImplementation(filePath => {
      const pathStr = filePath.toString();
      // Always return true for package presets file
      if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
        return true;
      }
      // Global config files exist
      if (pathStr.includes('.pgit/config/')) {
        return true;
      }
      // Project config files exist
      if (pathStr.includes('.pgit/presets.json')) {
        return true;
      }
      return false;
    });

    mockFs.readFileSync = jest.fn().mockImplementation(filePath => {
      const pathStr = filePath.toString();
      if (pathStr.includes('.pgit/config/presets.json')) {
        return JSON.stringify(mockGlobalConfig);
      }
      if (pathStr.includes('.pgit/presets.json')) {
        return JSON.stringify({ presets: mockProjectPresets });
      }
      // Handle package presets file
      if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
        return JSON.stringify(mockBuiltinPresets);
      }
      if (pathStr.includes('settings.json')) {
        return JSON.stringify({ autoCommit: false, verboseOutput: false });
      }
      throw new Error('File not found');
    });

    mockFs.writeFileSync = jest.fn();
    mockFs.ensureDirSync = jest.fn();

    // Mock os
    mockOs.homedir = jest.fn().mockReturnValue(mockHomeDir);

    // Mock fs for legacy fallback
    const fsNode = require('fs');
    fsNode.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockBuiltinPresets));
    fsNode.existsSync = jest.fn().mockReturnValue(true);

    mockConfigManager = new ConfigManager(
      'test',
      new FileSystemService(),
    ) as jest.Mocked<ConfigManager>;
    presetManager = new PresetManager(mockConfigManager, mockWorkingDir);

    // Mock console.warn to suppress expected warnings during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getPreset (centralized system working)', () => {
    it('should return project preset from centralized config when available', async () => {
      const preset = await presetManager.getPreset('project-preset');

      expect(preset).toEqual({
        description: 'Project-specific preset',
        paths: ['project/path'],
        created: expect.any(Date),
      });
    });

    it('should return global preset from centralized config when project preset not found', async () => {
      const preset = await presetManager.getPreset('global-preset');

      expect(preset).toEqual({
        description: 'Global user preset',
        paths: ['global/path'],
        created: expect.any(Date),
      });
    });

    it('should return package preset from centralized config when user presets not found', async () => {
      const preset = await presetManager.getPreset('test-preset');

      expect(preset).toEqual({
        description: 'Test preset',
        category: 'test',
        paths: ['test/path1', 'test/path2'],
      });
    });
  });

  describe('getPreset (fallback to legacy system)', () => {
    beforeEach(() => {
      // Mock centralized config to fail, forcing fallback
      mockFs.existsSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        // Package presets still work for legacy system
        if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
          return true;
        }
        // Centralized config files don't exist, forcing fallback
        return false;
      });

      mockFs.readFileSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
          return JSON.stringify(mockBuiltinPresets);
        }
        throw new Error('File not found');
      });
    });

    it('should return user preset from legacy system when centralized fails', async () => {
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

    it('should return built-in preset from legacy system when centralized fails', async () => {
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

    it('should return undefined when preset not found in legacy system', async () => {
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

  describe('getAllPresets (centralized system working)', () => {
    it('should return merged presets from centralized config', async () => {
      const result = await presetManager.getAllPresets();

      expect(result.builtin).toHaveProperty('test-preset');
      expect(result.builtin).toHaveProperty('another-preset');
      expect(result.localUser).toHaveProperty('project-preset');
      expect(result.globalUser).toHaveProperty('global-preset');
      expect(result.merged).toHaveProperty('test-preset');
      expect(result.merged).toHaveProperty('project-preset');
      expect(result.merged).toHaveProperty('global-preset');
    });
  });

  describe('getAllPresets (fallback to legacy system)', () => {
    beforeEach(() => {
      // Mock centralized config to fail
      mockFs.existsSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
          return true;
        }
        return false;
      });

      mockFs.readFileSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
          return JSON.stringify(mockBuiltinPresets);
        }
        throw new Error('File not found');
      });
    });

    it('should return merged presets from legacy system when centralized fails', async () => {
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

  describe('saveUserPreset (centralized system working)', () => {
    it('should save project preset via centralized config', async () => {
      const preset: Preset = {
        description: 'New preset',
        paths: ['new/path'],
      };

      await presetManager.saveUserPreset('new-preset', preset, false);

      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should save global preset via centralized config', async () => {
      const preset: Preset = {
        description: 'New global preset',
        paths: ['new/global/path'],
      };

      await presetManager.saveUserPreset('new-global-preset', preset, true);

      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('saveUserPreset (fallback to legacy system)', () => {
    beforeEach(() => {
      // Mock centralized config to fail
      mockFs.existsSync = jest.fn().mockReturnValue(false);
      mockFs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('File not found');
      });
    });

    it('should save project preset via legacy system when centralized fails', async () => {
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

      await presetManager.saveUserPreset('new-preset', preset, false);

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

  describe('removeUserPreset (centralized system working)', () => {
    it('should remove project preset via centralized config', async () => {
      const result = await presetManager.removeUserPreset('project-preset', false);

      expect(result).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should remove global preset via centralized config', async () => {
      const result = await presetManager.removeUserPreset('global-preset', true);

      expect(result).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('removeUserPreset (fallback to legacy system)', () => {
    beforeEach(() => {
      // Mock centralized config to fail
      mockFs.existsSync = jest.fn().mockReturnValue(false);
      mockFs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('File not found');
      });
    });

    it('should remove project preset via legacy system when centralized fails', async () => {
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

      const result = await presetManager.removeUserPreset('preset-to-remove', false);

      expect(result).toBe(true);
      expect(mockConfigManager.save).toHaveBeenCalledWith({
        ...mockConfig,
        presets: {},
      });
    });

    it('should return false when preset does not exist in legacy system', async () => {
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

      const result = await presetManager.removeUserPreset('nonexistent', false);

      expect(result).toBe(false);
      expect(mockConfigManager.save).not.toHaveBeenCalled();
    });
  });

  describe('getPresetSource (centralized system working)', () => {
    it('should return "localUser" for project-specific presets from centralized config', async () => {
      const source = await presetManager.getPresetSource('project-preset');

      expect(source).toBe('localUser');
    });

    it('should return "globalUser" for global presets from centralized config', async () => {
      const source = await presetManager.getPresetSource('global-preset');

      expect(source).toBe('globalUser');
    });

    it('should return "builtin" for package presets from centralized config', async () => {
      const source = await presetManager.getPresetSource('test-preset');

      expect(source).toBe('builtin');
    });
  });

  describe('getPresetSource (fallback to legacy system)', () => {
    beforeEach(() => {
      // Mock centralized config to fail
      mockFs.existsSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
          return true;
        }
        return false;
      });

      mockFs.readFileSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
          return JSON.stringify(mockBuiltinPresets);
        }
        throw new Error('File not found');
      });
    });

    it('should return "localUser" for user-defined presets from legacy system', async () => {
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

    it('should return "builtin" for built-in presets from legacy system', async () => {
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

    it('should return "none" for non-existent presets from legacy system', async () => {
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

  describe('markPresetUsed (centralized system working)', () => {
    it('should update lastUsed timestamp via centralized config', async () => {
      await presetManager.markPresetUsed('project-preset');

      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('markPresetUsed (fallback to legacy system)', () => {
    beforeEach(() => {
      // Mock centralized config to fail
      mockFs.existsSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
          return true;
        }
        return false;
      });

      mockFs.readFileSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
          return JSON.stringify(mockBuiltinPresets);
        }
        throw new Error('File not found');
      });
    });

    it('should update lastUsed timestamp for user presets in legacy system', async () => {
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

    it('should not update timestamp for built-in presets in legacy system', async () => {
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
