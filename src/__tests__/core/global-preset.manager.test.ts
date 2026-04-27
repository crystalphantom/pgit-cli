import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  GlobalPresetManager,
  GlobalPresetError,
  GlobalPresetNotFoundError,
  GlobalPresetValidationError,
} from '../../core/global-preset.manager';
import { Preset, CURRENT_PRESET_VERSION } from '../../types/config.types';

// Mock dependencies
jest.mock('fs-extra');
jest.mock('os');
jest.mock('path');
jest.mock('../../utils/logger.service', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;
const mockPath = path as jest.Mocked<typeof path>;

describe('GlobalPresetManager', () => {
  let globalPresetManager: GlobalPresetManager;
  let mockHomedir: string;
  let mockGlobalConfigDir: string;
  let mockGlobalPresetsFile: string;

  const samplePreset: Preset = {
    description: 'Test preset description',
    category: 'test',
    paths: ['src/', 'test/'],
    created: new Date('2024-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockHomedir = '/home/user';
    mockGlobalConfigDir = '/home/user/.pgit';
    mockGlobalPresetsFile = '/home/user/.pgit/presets.tson';

    // Mock path.join to return our expected paths
    mockPath.join
      .mockReturnValueOnce(mockGlobalConfigDir) // homedir + '.pgit'
      .mockReturnValueOnce(mockGlobalPresetsFile); // configDir + 'presets.tson'

    mockOs.homedir.mockReturnValue(mockHomedir);
    mockFs.existsSync.mockReturnValue(false);

    globalPresetManager = new GlobalPresetManager();
  });

  describe('constructor', () => {
    it('should initialize with correct paths', () => {
      expect(mockOs.homedir).toHaveBeenCalled();
      expect(mockPath.join).toHaveBeenCalledWith(mockHomedir, '.pgit');
      expect(mockPath.join).toHaveBeenCalledWith(mockGlobalConfigDir, 'presets.tson');
    });
  });

  describe('getPreset', () => {
    it('should return undefined when preset does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = globalPresetManager.getPreset('non-existent');

      expect(result).toBeUndefined();
    });

    it('should return preset when it exists', () => {
      const mockPresets = {
        version: CURRENT_PRESET_VERSION,
        presets: {
          'test-preset': samplePreset,
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPresets));

      const result = globalPresetManager.getPreset('test-preset');

      expect(result).toEqual(samplePreset);
    });
  });

  describe('getAllPresets', () => {
    it('should return empty object when no presets exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = globalPresetManager.getAllPresets();

      expect(result).toEqual({});
    });

    it('should return all presets when they exist', () => {
      const mockPresets = {
        version: CURRENT_PRESET_VERSION,
        presets: {
          preset1: { ...samplePreset, description: 'Preset 1 description' },
          preset2: { ...samplePreset, description: 'Preset 2 description' },
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPresets));

      const result = globalPresetManager.getAllPresets();

      expect(result).toEqual(mockPresets.presets);
    });
  });

  describe('savePreset', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.ensureDirSync.mockImplementation();
      mockFs.writeFileSync.mockImplementation();
    });

    it('should save a new preset successfully', () => {
      globalPresetManager.savePreset('new-preset', samplePreset);

      expect(mockFs.ensureDirSync).toHaveBeenCalledWith(mockGlobalConfigDir);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockGlobalPresetsFile,
        expect.stringContaining('"new-preset"'),
        'utf-8',
      );
    });

    it('should add created timestamp if not present', () => {
      const presetWithoutCreated = { ...samplePreset };
      delete presetWithoutCreated.created;

      globalPresetManager.savePreset('new-preset', presetWithoutCreated);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockGlobalPresetsFile,
        expect.stringContaining('"created"'),
        'utf-8',
      );
    });

    it('should preserve existing created timestamp', () => {
      const fixedDate = new Date('2024-01-01');
      const presetWithCreated = { ...samplePreset, created: fixedDate };

      globalPresetManager.savePreset('new-preset', presetWithCreated);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);
      expect(writtenContent.presets['new-preset'].created).toBe(fixedDate.toISOString());
    });

    it('should throw error for empty preset name', () => {
      expect(() => {
        globalPresetManager.savePreset('', samplePreset);
      }).toThrow(GlobalPresetValidationError);

      expect(() => {
        globalPresetManager.savePreset('   ', samplePreset);
      }).toThrow(GlobalPresetValidationError);
    });

    it('should throw error for preset name too long', () => {
      const longName = 'a'.repeat(51);

      expect(() => {
        globalPresetManager.savePreset(longName, samplePreset);
      }).toThrow(GlobalPresetValidationError);
    });

    it('should throw GlobalPresetError on file system errors', () => {
      mockFs.ensureDirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => {
        globalPresetManager.savePreset('test-preset', samplePreset);
      }).toThrow(GlobalPresetError);
    });

    it('should rethrow BaseError instances', () => {
      const validationError = new GlobalPresetValidationError('Custom validation error');

      // Mock the validation by making the preset name empty after the first check
      jest.spyOn(globalPresetManager as any, 'loadGlobalPresets').mockImplementation(() => {
        throw validationError;
      });

      expect(() => {
        globalPresetManager.savePreset('valid-name', samplePreset);
      }).toThrow(validationError);
    });
  });

  describe('removePreset', () => {
    it('should return false when preset does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = globalPresetManager.removePreset('non-existent');

      expect(result).toBe(false);
    });

    it('should remove existing preset and return true', () => {
      const mockPresets = {
        version: CURRENT_PRESET_VERSION,
        presets: {
          'preset-to-remove': samplePreset,
          'other-preset': { ...samplePreset, description: 'Other preset description' },
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPresets));
      mockFs.writeFileSync.mockImplementation();

      const result = globalPresetManager.removePreset('preset-to-remove');

      expect(result).toBe(true);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);
      expect(writtenContent.presets).not.toHaveProperty('preset-to-remove');
      expect(writtenContent.presets).toHaveProperty('other-preset');
    });

    it('should throw GlobalPresetError on file system errors', () => {
      const mockPresets = {
        version: CURRENT_PRESET_VERSION,
        presets: {
          'test-preset': samplePreset,
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPresets));
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      expect(() => {
        globalPresetManager.removePreset('test-preset');
      }).toThrow(GlobalPresetError);
    });
  });

  describe('presetExists', () => {
    it('should return false when preset does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = globalPresetManager.presetExists('non-existent');

      expect(result).toBe(false);
    });

    it('should return true when preset exists', () => {
      const mockPresets = {
        version: CURRENT_PRESET_VERSION,
        presets: {
          'existing-preset': samplePreset,
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPresets));

      const result = globalPresetManager.presetExists('existing-preset');

      expect(result).toBe(true);
    });
  });

  describe('markPresetUsed', () => {
    it('should update lastUsed timestamp for existing preset', () => {
      const mockPresets = {
        version: CURRENT_PRESET_VERSION,
        presets: {
          'test-preset': { ...samplePreset },
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPresets));
      mockFs.writeFileSync.mockImplementation();

      globalPresetManager.markPresetUsed('test-preset');

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);
      expect(writtenContent.presets['test-preset']).toHaveProperty('lastUsed');
    });

    it('should not throw error for non-existent preset', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => {
        globalPresetManager.markPresetUsed('non-existent');
      }).not.toThrow();
    });

    it('should not throw error on file system errors', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read failed');
      });

      expect(() => {
        globalPresetManager.markPresetUsed('test-preset');
      }).not.toThrow();
    });
  });

  describe('getPresetsFilePath', () => {
    it('should return the global presets file path', () => {
      const result = globalPresetManager.getPresetsFilePath();

      expect(result).toBe(mockGlobalPresetsFile);
    });
  });

  describe('loadGlobalPresets', () => {
    it('should return cached presets if available', () => {
      const mockPresets = {
        version: CURRENT_PRESET_VERSION,
        presets: { test: samplePreset },
      };

      // First call to populate cache
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPresets));

      globalPresetManager.getAllPresets();

      // Clear mock calls
      jest.clearAllMocks();

      // Second call should use cache
      const result = globalPresetManager.getAllPresets();

      expect(mockFs.readFileSync).not.toHaveBeenCalled();
      expect(result).toEqual(mockPresets.presets);
    });

    it('should return empty structure when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = globalPresetManager.getAllPresets();

      expect(result).toEqual({});
    });

    it('should convert date strings back to Date objects', () => {
      const mockPresetsWithStringDates = {
        version: CURRENT_PRESET_VERSION,
        presets: {
          'test-preset': {
            ...samplePreset,
            created: '2024-01-01T00:00:00.000Z',
            lastUsed: '2024-01-02T00:00:00.000Z',
          },
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPresetsWithStringDates));

      const result = globalPresetManager.getAllPresets();

      expect(result['test-preset'].created).toBeInstanceOf(Date);
      expect(result['test-preset'].lastUsed).toBeInstanceOf(Date);
    });

    it('should return empty structure on invalid JSON', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      const result = globalPresetManager.getAllPresets();

      expect(result).toEqual({});
    });

    it('should return empty structure on invalid file structure', () => {
      const invalidStructure = { invalidField: 'value' };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidStructure));

      const result = globalPresetManager.getAllPresets();

      expect(result).toEqual({});
    });

    it('should return empty structure on read errors', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read failed');
      });

      const result = globalPresetManager.getAllPresets();

      expect(result).toEqual({});
    });
  });

  describe('saveGlobalPresets', () => {
    it('should create directory and save presets', () => {
      const mockPresets = {
        version: CURRENT_PRESET_VERSION,
        presets: { test: samplePreset },
      };

      mockFs.existsSync.mockReturnValue(false);
      mockFs.ensureDirSync.mockImplementation();
      mockFs.writeFileSync.mockImplementation();

      globalPresetManager.savePreset('test', samplePreset);

      expect(mockFs.ensureDirSync).toHaveBeenCalledWith(mockGlobalConfigDir);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        mockGlobalPresetsFile,
        expect.any(String),
        'utf-8',
      );
    });

    it('should throw GlobalPresetError on write failures', () => {
      mockFs.ensureDirSync.mockImplementation();
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      expect(() => {
        globalPresetManager.savePreset('test', samplePreset);
      }).toThrow(GlobalPresetError);
    });
  });

  describe('ensureGlobalConfigDir', () => {
    it('should create directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.ensureDirSync.mockImplementation();
      mockFs.writeFileSync.mockImplementation();

      globalPresetManager.savePreset('test', samplePreset);

      expect(mockFs.ensureDirSync).toHaveBeenCalledWith(mockGlobalConfigDir);
    });

    it('should not create directory if it already exists', () => {
      // Mock fs.existsSync to return true when checking for the config directory
      // and false when checking for the presets file
      mockFs.existsSync.mockImplementation(path => {
        const pathStr = path.toString();
        if (pathStr === mockGlobalConfigDir) return true; // directory exists
        if (pathStr === mockGlobalPresetsFile) return false; // file doesn't exist
        return false;
      });
      mockFs.writeFileSync.mockImplementation();

      globalPresetManager.savePreset('test', samplePreset);

      expect(mockFs.ensureDirSync).not.toHaveBeenCalled();
    });

    it('should throw GlobalPresetError on directory creation failure', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.ensureDirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => {
        globalPresetManager.savePreset('test', samplePreset);
      }).toThrow(GlobalPresetError);
    });
  });
});

describe('GlobalPresetError classes', () => {
  describe('GlobalPresetError', () => {
    it('should have correct properties', () => {
      const error = new GlobalPresetError('Test error');

      expect(error.code).toBe('GLOBAL_PRESET_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.message).toBe('Test error');
    });
  });

  describe('GlobalPresetNotFoundError', () => {
    it('should have correct properties', () => {
      const error = new GlobalPresetNotFoundError('Not found');

      expect(error.code).toBe('GLOBAL_PRESET_NOT_FOUND');
      expect(error.recoverable).toBe(false);
      expect(error.message).toBe('Not found');
    });
  });

  describe('GlobalPresetValidationError', () => {
    it('should have correct properties', () => {
      const error = new GlobalPresetValidationError('Validation failed');

      expect(error.code).toBe('GLOBAL_PRESET_VALIDATION_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.message).toBe('Validation failed');
    });
  });
});
