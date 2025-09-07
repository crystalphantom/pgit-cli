import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { GitExcludeSettings, DEFAULT_GIT_EXCLUDE_SETTINGS } from '../../types/config.types';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('ConfigManager - Git Exclude Settings', () => {
  let configManager: ConfigManager;
  let fileSystem: FileSystemService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(__dirname, '../../../test-temp/config-exclude-'));
    fileSystem = new FileSystemService();
    configManager = new ConfigManager(tempDir, fileSystem);

    // Create initial configuration
    await configManager.create(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('updateGitExcludeSettings', () => {
    it('should update git exclude settings', async () => {
      const newSettings: Partial<GitExcludeSettings> = {
        enabled: false,
        markerComment: '# custom marker',
        fallbackBehavior: 'error',
      };

      const config = await configManager.updateGitExcludeSettings(newSettings);

      expect(config.settings.gitExclude.enabled).toBe(false);
      expect(config.settings.gitExclude.markerComment).toBe('# custom marker');
      expect(config.settings.gitExclude.fallbackBehavior).toBe('error');
      expect(config.settings.gitExclude.validateOperations).toBe(true); // Should remain unchanged
    });

    it('should validate marker comment format', async () => {
      const invalidSettings: Partial<GitExcludeSettings> = {
        markerComment: 'invalid comment without hash',
      };

      await expect(configManager.updateGitExcludeSettings(invalidSettings)).rejects.toThrow(
        'Marker comment must start with #',
      );
    });

    it('should validate marker comment length', async () => {
      const invalidSettings: Partial<GitExcludeSettings> = {
        markerComment: '#' + 'a'.repeat(100), // Too long
      };

      await expect(configManager.updateGitExcludeSettings(invalidSettings)).rejects.toThrow(
        'Marker comment too long',
      );
    });

    it('should reject marker comments with newlines', async () => {
      const invalidSettings: Partial<GitExcludeSettings> = {
        markerComment: '# comment\nwith newline',
      };

      await expect(configManager.updateGitExcludeSettings(invalidSettings)).rejects.toThrow(
        'Marker comment cannot contain newlines',
      );
    });

    it('should validate fallback behavior values', async () => {
      const invalidSettings = {
        fallbackBehavior: 'invalid' as any,
      };

      await expect(configManager.updateGitExcludeSettings(invalidSettings)).rejects.toThrow(
        'Fallback behavior must be warn, silent, or error',
      );
    });
  });

  describe('getGitExcludeSettings', () => {
    it('should return current git exclude settings', async () => {
      const settings = await configManager.getGitExcludeSettings();

      expect(settings).toEqual(DEFAULT_GIT_EXCLUDE_SETTINGS);
    });

    it('should return updated settings after modification', async () => {
      const newSettings: Partial<GitExcludeSettings> = {
        enabled: false,
        fallbackBehavior: 'silent',
      };

      await configManager.updateGitExcludeSettings(newSettings);
      const settings = await configManager.getGitExcludeSettings();

      expect(settings.enabled).toBe(false);
      expect(settings.fallbackBehavior).toBe('silent');
      expect(settings.markerComment).toBe(DEFAULT_GIT_EXCLUDE_SETTINGS.markerComment);
      expect(settings.validateOperations).toBe(DEFAULT_GIT_EXCLUDE_SETTINGS.validateOperations);
    });
  });

  describe('resetGitExcludeSettings', () => {
    it('should reset git exclude settings to defaults', async () => {
      // First modify settings
      await configManager.updateGitExcludeSettings({
        enabled: false,
        markerComment: '# custom marker',
        fallbackBehavior: 'error',
        validateOperations: false,
      });

      // Then reset
      const config = await configManager.resetGitExcludeSettings();

      expect(config.settings.gitExclude).toEqual(DEFAULT_GIT_EXCLUDE_SETTINGS);
    });

    it('should persist reset settings to file', async () => {
      // Modify settings
      await configManager.updateGitExcludeSettings({
        enabled: false,
        fallbackBehavior: 'error',
      });

      // Reset settings
      await configManager.resetGitExcludeSettings();

      // Create new config manager to verify persistence
      const newConfigManager = new ConfigManager(tempDir, fileSystem);
      const settings = await newConfigManager.getGitExcludeSettings();

      expect(settings).toEqual(DEFAULT_GIT_EXCLUDE_SETTINGS);
    });
  });

  describe('configuration validation', () => {
    it('should validate exclude settings during config load', async () => {
      // Manually corrupt the config file with invalid exclude settings
      const configPath = path.join(tempDir, '.private-config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

      config.settings.gitExclude = {
        enabled: true,
        markerComment: 'invalid comment', // Missing #
        fallbackBehavior: 'warn',
        validateOperations: true,
      };

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Create new ConfigManager instance to avoid cache
      const newConfigManager = new ConfigManager(tempDir, fileSystem);

      // Should throw validation error when loading
      await expect(newConfigManager.load()).rejects.toThrow();
    });

    it('should handle missing exclude settings in legacy config', async () => {
      // Create config without exclude settings (legacy format)
      const configPath = path.join(tempDir, '.private-config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

      delete config.settings.gitExclude;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Create new ConfigManager instance to avoid cache
      const newConfigManager = new ConfigManager(tempDir, fileSystem);

      // Should throw validation error for missing required field
      await expect(newConfigManager.load()).rejects.toThrow();
    });
  });

  describe('default settings', () => {
    it('should create config with default exclude settings', async () => {
      const config = await configManager.load();

      expect(config.settings.gitExclude).toEqual(DEFAULT_GIT_EXCLUDE_SETTINGS);
    });

    it('should allow overriding exclude settings during creation', async () => {
      // Remove existing config
      await fs.remove(path.join(tempDir, '.private-config.json'));

      // Create new config manager
      const newConfigManager = new ConfigManager(tempDir, fileSystem);

      // Create config with custom settings
      const customSettings = {
        gitExclude: {
          enabled: false,
          markerComment: '# custom creation marker',
          fallbackBehavior: 'silent' as const,
          validateOperations: false,
        },
      };

      await newConfigManager.create(tempDir, customSettings);
      const config = await newConfigManager.load();

      expect(config.settings.gitExclude.enabled).toBe(false);
      expect(config.settings.gitExclude.markerComment).toBe('# custom creation marker');
      expect(config.settings.gitExclude.fallbackBehavior).toBe('silent');
      expect(config.settings.gitExclude.validateOperations).toBe(false);
    });
  });
});
