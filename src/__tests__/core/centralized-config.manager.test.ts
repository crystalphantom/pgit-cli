import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  CentralizedConfigManager,
  CentralizedConfigError,
  CentralizedConfigValidationError,
} from '../../core/centralized-config.manager';
import { Preset, BuiltinPresets, CURRENT_PRESET_VERSION } from '../../types/config.types';

// Mock dependencies
jest.mock('fs-extra');
jest.mock('os');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

// Define GlobalSettings inline for tests
interface GlobalSettings {
  autoCommit: boolean;
  verboseOutput: boolean;
  editorCommand?: string;
}

describe('CentralizedConfigManager', () => {
  let configManager: CentralizedConfigManager;

  // Mock data
  const mockWorkingDir = '/test/project';
  const mockHomeDir = '/home/user';
  const mockBuiltinPresets: BuiltinPresets = {
    version: '1.0.0',
    presets: {
      'nodejs-dev': {
        description: 'Node.js development files',
        category: 'development',
        paths: ['node_modules/', '.env', 'dist/'],
      },
      'python-dev': {
        description: 'Python development files',
        category: 'development',
        paths: ['__pycache__/', '*.pyc', '.venv/'],
      },
    },
  };

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
      '/test/project': {
        name: 'test-project',
        path: '/test/project',
        lastUsed: new Date('2023-01-02'),
        preset: 'nodejs-dev',
      },
    },
  };

  const mockProjectPresets = {
    'project-preset': {
      description: 'Project-specific preset',
      paths: ['project/path'],
      created: new Date('2023-01-03'),
    },
  };

  const mockGlobalSettings: GlobalSettings = {
    autoCommit: false,
    verboseOutput: false,
  };

  beforeEach(() => {
    // Clear all mocks and reset implementations
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Mock fs-extra with proper types - these are the GLOBAL defaults that should ALWAYS work
    mockFs.existsSync = jest.fn().mockImplementation(filePath => {
      const pathStr = filePath.toString();
      // ALWAYS return true for ANY presets.json file - be more permissive
      if (pathStr.includes('presets.json')) {
        return true;
      }
      // Handle settings files
      if (pathStr.includes('settings.json')) {
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
      // Handle ANY package presets file path - be more permissive
      if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
        return JSON.stringify(mockBuiltinPresets);
      }
      if (pathStr.includes('settings.json')) {
        return JSON.stringify(mockGlobalSettings);
      }
      throw new Error('File not found');
    });

    mockFs.writeFileSync = jest.fn();
    mockFs.ensureDirSync = jest.fn();

    // Mock os
    mockOs.homedir = jest.fn().mockReturnValue(mockHomeDir);

    // Create instance
    configManager = new CentralizedConfigManager(mockWorkingDir);

    // Mock console.warn to suppress expected warnings during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initializeGlobalConfig', () => {
    it('should create global config directory and files when they do not exist', async () => {
      // Override only the global config files to not exist for this specific test
      const originalExistsSync = mockFs.existsSync;
      mockFs.existsSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        // ALWAYS return true for package presets file (from project root) - this is critical
        if (pathStr === path.join(process.cwd(), 'presets.json')) {
          return true;
        }
        // Only global config files don't exist for this test
        if (pathStr.includes('.pgit/config/')) {
          return false;
        }
        return false;
      });

      await configManager.initializeGlobalConfig();

      expect(mockFs.ensureDirSync).toHaveBeenCalledWith(path.join(mockHomeDir, '.pgit', 'config'));
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockHomeDir, '.pgit', 'config', 'presets.json'),
        expect.stringContaining('"version"'),
        'utf-8',
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockHomeDir, '.pgit', 'config', 'settings.json'),
        expect.stringContaining('"autoCommit"'),
        'utf-8',
      );

      // Restore original mock for next test
      mockFs.existsSync = originalExistsSync;
    });

    it('should not overwrite existing config files', async () => {
      // All files exist for this test - use global defaults
      await configManager.initializeGlobalConfig();

      expect(mockFs.ensureDirSync).toHaveBeenCalledWith(path.join(mockHomeDir, '.pgit', 'config'));
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle directory creation errors gracefully', async () => {
      // Override only the global config files to not exist for this specific test
      const originalExistsSync = mockFs.existsSync;
      const originalEnsureDirSync = mockFs.ensureDirSync;

      mockFs.existsSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        // ALWAYS return true for package presets file (from project root) - this is critical
        if (pathStr === path.join(process.cwd(), 'presets.json')) {
          return true;
        }
        return false;
      });

      mockFs.ensureDirSync = jest.fn().mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(configManager.initializeGlobalConfig()).rejects.toThrow(CentralizedConfigError);

      // Restore original mocks for next test
      mockFs.existsSync = originalExistsSync;
      mockFs.ensureDirSync = originalEnsureDirSync;
    });
  });

  describe('getPreset', () => {
    // No beforeEach needed - use global defaults

    it('should return project preset with highest priority', async () => {
      const preset = await configManager.getPreset('project-preset');

      expect(preset).toEqual({
        description: 'Project-specific preset',
        paths: ['project/path'],
        created: new Date('2023-01-03'),
      });
    });

    it('should return global preset when project preset not found', async () => {
      const preset = await configManager.getPreset('global-preset');

      expect(preset).toEqual({
        description: 'Global user preset',
        paths: ['global/path'],
        created: new Date('2023-01-01'),
      });
    });

    it('should return package preset when user presets not found', async () => {
      const preset = await configManager.getPreset('nodejs-dev');

      expect(preset).toEqual({
        description: 'Node.js development files',
        category: 'development',
        paths: ['node_modules/', '.env', 'dist/'],
      });
    });

    it('should return undefined when preset not found in any source', async () => {
      const preset = await configManager.getPreset('nonexistent-preset');

      expect(preset).toBeUndefined();
    });
  });

  describe('getAllPresets', () => {
    // No beforeEach needed - use global defaults

    it('should return all presets from all sources', async () => {
      const allPresets = await configManager.getAllPresets();

      expect(allPresets).toEqual({
        project: mockProjectPresets,
        global: mockGlobalConfig.presets,
        package: mockBuiltinPresets.presets,
        merged: {
          ...mockBuiltinPresets.presets,
          ...mockGlobalConfig.presets,
          ...mockProjectPresets,
        },
      });
    });

    it('should handle missing project presets gracefully', async () => {
      // Override just the project presets file to not exist for this specific test
      const originalExistsSync = mockFs.existsSync;
      mockFs.existsSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        // ALWAYS return true for package presets file
        if (pathStr === path.join(process.cwd(), 'presets.json')) {
          return true;
        }
        // Project presets don't exist for this test
        return !pathStr.includes('.pgit/presets.json');
      });

      const allPresets = await configManager.getAllPresets();

      expect(allPresets.project).toEqual({});
      expect(allPresets.global).toEqual(mockGlobalConfig.presets);
      expect(allPresets.package).toEqual(mockBuiltinPresets.presets);

      // Restore original mock for next test
      mockFs.existsSync = originalExistsSync;
    });
  });

  describe('savePreset', () => {
    const testPreset: Preset = {
      description: 'Test preset',
      paths: ['test/path'],
      created: new Date(),
    };

    // No beforeEach needed - use global defaults

    it('should save global preset', async () => {
      await configManager.savePreset('new-global-preset', testPreset, 'global');

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockHomeDir, '.pgit', 'config', 'presets.json'),
        expect.stringContaining('new-global-preset'),
        'utf-8',
      );
    });

    it('should save project preset', async () => {
      // Override project preset file to not exist for this specific test
      const originalExistsSync = mockFs.existsSync;
      mockFs.existsSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        // Handle package presets file (from project root)
        if (pathStr === path.join(process.cwd(), 'presets.json')) {
          return true;
        }
        // Return false for project preset file so it gets created
        if (pathStr.includes('.pgit/presets.json')) {
          return false;
        }
        return pathStr.includes('.pgit/config');
      });

      await configManager.savePreset('new-project-preset', testPreset, 'project');

      expect(mockFs.ensureDirSync).toHaveBeenCalledWith(path.join(mockWorkingDir, '.pgit'));
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockWorkingDir, '.pgit', 'presets.json'),
        expect.stringContaining('new-project-preset'),
        'utf-8',
      );

      // Restore original mock for next test
      mockFs.existsSync = originalExistsSync;
    });

    it('should throw error for invalid preset name', async () => {
      await expect(configManager.savePreset('', testPreset, 'global')).rejects.toThrow(
        CentralizedConfigValidationError,
      );
      await expect(configManager.savePreset('a'.repeat(51), testPreset, 'global')).rejects.toThrow(
        CentralizedConfigValidationError,
      );
    });
  });

  describe('removePreset', () => {
    // No beforeEach needed - use global defaults

    it('should remove global preset', async () => {
      await configManager.removePreset('global-preset', 'global');

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockHomeDir, '.pgit', 'config', 'presets.json'),
        expect.not.stringContaining('global-preset'),
        'utf-8',
      );
    });

    it('should remove project preset', async () => {
      await configManager.removePreset('project-preset', 'project');

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockWorkingDir, '.pgit', 'presets.json'),
        expect.not.stringContaining('project-preset'),
        'utf-8',
      );
    });
  });

  describe('getPresetSource', () => {
    // No beforeEach needed - use global defaults

    it('should return correct source for each preset type', async () => {
      expect(await configManager.getPresetSource('project-preset')).toBe('project');
      expect(await configManager.getPresetSource('global-preset')).toBe('global');
      expect(await configManager.getPresetSource('nodejs-dev')).toBe('package');
      expect(await configManager.getPresetSource('nonexistent')).toBe('none');
    });
  });

  describe('markPresetUsed', () => {
    const currentDate = new Date();

    // Keep this beforeEach - it has timer mocking which is unique
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(currentDate);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should update lastUsed timestamp for project preset', async () => {
      await configManager.markPresetUsed('project-preset');

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockWorkingDir, '.pgit', 'presets.json'),
        expect.stringContaining(currentDate.toISOString()),
        'utf-8',
      );
    });

    it('should update lastUsed timestamp for global preset', async () => {
      await configManager.markPresetUsed('global-preset');

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockHomeDir, '.pgit', 'config', 'presets.json'),
        expect.stringContaining(currentDate.toISOString()),
        'utf-8',
      );
    });
  });

  describe('getGlobalSettings', () => {
    // No beforeEach needed - use global defaults with settings override

    it('should return global settings', () => {
      const settings = configManager.getGlobalSettings();

      expect(settings).toEqual({
        autoCommit: false,
        verboseOutput: false,
      });
    });

    it('should return default settings when file not found', () => {
      mockFs.existsSync = jest.fn().mockReturnValue(false);

      const settings = configManager.getGlobalSettings();

      expect(settings).toEqual({
        autoCommit: false,
        verboseOutput: false,
      });
    });
  });

  describe('updateGlobalSettings', () => {
    // No beforeEach needed - use global defaults

    it('should update global settings', async () => {
      const newSettings: GlobalSettings = {
        autoCommit: true,
        verboseOutput: false,
        editorCommand: 'vim',
      };

      await configManager.updateGlobalSettings(newSettings);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockHomeDir, '.pgit', 'config', 'settings.json'),
        JSON.stringify(newSettings, null, 2),
        'utf-8',
      );
    });
  });

  describe('Package presets loading', () => {
    it('should handle package presets not found error with debug info', async () => {
      // Override package presets file to not exist for this specific test
      const originalExistsSync = mockFs.existsSync;
      mockFs.existsSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        // Return false specifically for package presets file
        if (pathStr === path.join(process.cwd(), 'presets.json')) {
          return false;
        }
        return false;
      });

      await expect(configManager.getPreset('test')).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('Debug:'),
        }),
      );

      // Restore original mock for next test
      mockFs.existsSync = originalExistsSync;
    });

    it('should handle invalid package presets JSON', async () => {
      // Override package presets file to return invalid JSON for this specific test
      const originalExistsSync = mockFs.existsSync;
      const originalReadFileSync = mockFs.readFileSync;

      mockFs.existsSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        // Handle package presets file (from project root)
        if (pathStr === path.join(process.cwd(), 'presets.json')) {
          return true;
        }
        return true;
      });
      mockFs.readFileSync = jest.fn().mockImplementation(filePath => {
        const pathStr = filePath.toString();
        // Handle package presets file (from project root)
        if (pathStr === path.join(process.cwd(), 'presets.json')) {
          return 'invalid json';
        }
        if (pathStr.includes('presets.json') && !pathStr.includes('.pgit')) {
          return 'invalid json';
        }
        return JSON.stringify({});
      });

      await expect(configManager.getPreset('test')).rejects.toThrow(CentralizedConfigError);

      // Restore original mocks for next test
      mockFs.existsSync = originalExistsSync;
      mockFs.readFileSync = originalReadFileSync;
    });
  });
});
