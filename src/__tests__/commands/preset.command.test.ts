import { PresetCommand } from '../../commands/preset.command';
import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { PresetManager } from '../../core/preset.manager';
import { AddCommand } from '../../commands/add.command';

// Mock dependencies
jest.mock('../../core/config.manager');
jest.mock('../../core/filesystem.service');
jest.mock('../../core/preset.manager');
jest.mock('../../commands/add.command');

describe('PresetCommand', () => {
  let presetCommand: PresetCommand;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockPresetManager: jest.Mocked<PresetManager>;
  let mockAddCommand: jest.Mocked<AddCommand>;

  beforeEach(() => {
    mockConfigManager = new ConfigManager(
      'test',
      new FileSystemService(),
    ) as jest.Mocked<ConfigManager>;
    mockPresetManager = new PresetManager(mockConfigManager) as jest.Mocked<PresetManager>;
    mockAddCommand = new AddCommand() as jest.Mocked<AddCommand>;

    presetCommand = new PresetCommand('test');

    // Replace the private instances with our mocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (presetCommand as any).configManager = mockConfigManager;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (presetCommand as any).presetManager = mockPresetManager;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (presetCommand as any).addCommand = mockAddCommand;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('apply', () => {
    it('should apply preset successfully', async () => {
      const mockPreset = {
        description: 'Test preset',
        paths: ['path1', 'path2'],
      };

      mockConfigManager.exists.mockResolvedValue(true);
      mockPresetManager.getPreset.mockResolvedValue(mockPreset);
      mockPresetManager.markPresetUsed.mockResolvedValue();
      mockAddCommand.execute
        .mockResolvedValueOnce({ success: true, exitCode: 0 })
        .mockResolvedValueOnce({ success: true, exitCode: 0 });

      const result = await presetCommand.apply('test-preset');

      expect(result.success).toBe(true);
      expect(mockPresetManager.getPreset).toHaveBeenCalledWith('test-preset');
      expect(mockPresetManager.markPresetUsed).toHaveBeenCalledWith('test-preset');
      expect(mockAddCommand.execute).toHaveBeenCalledTimes(2);
    });

    it('should fail when pgit is not initialized', async () => {
      mockConfigManager.exists.mockResolvedValue(false);

      const result = await presetCommand.apply('test-preset');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not initialized');
    });

    it('should fail when preset not found', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockPresetManager.getPreset.mockResolvedValue(undefined);
      mockPresetManager.getAllPresets.mockResolvedValue({
        builtin: {},
        localUser: {},
        globalUser: {},
        merged: { 'available-preset': { description: 'Available', paths: [] } },
      });

      const result = await presetCommand.apply('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should handle partial failures gracefully', async () => {
      const mockPreset = {
        description: 'Test preset',
        paths: ['path1', 'path2', 'path3'],
      };

      mockConfigManager.exists.mockResolvedValue(true);
      mockPresetManager.getPreset.mockResolvedValue(mockPreset);
      mockPresetManager.markPresetUsed.mockResolvedValue();
      mockAddCommand.execute
        .mockResolvedValueOnce({ success: true, exitCode: 0 })
        .mockResolvedValueOnce({
          success: false,
          error: new Error('already tracked'),
          exitCode: 1,
        })
        .mockResolvedValueOnce({
          success: false,
          error: new Error('does not exist'),
          exitCode: 1,
        });

      const result = await presetCommand.apply('test-preset');

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.data as any).added).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.data as any).skipped).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.data as any).failed).toHaveLength(1);
    });
  });

  describe('define', () => {
    it('should define preset successfully', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockPresetManager.getPresetSource.mockResolvedValue('none');
      mockPresetManager.saveUserPreset.mockResolvedValue();

      const result = await presetCommand.define('new-preset', ['path1', 'path2']);

      expect(result.success).toBe(true);
      expect(mockPresetManager.saveUserPreset).toHaveBeenCalledWith(
        'new-preset',
        expect.objectContaining({
          description: expect.stringContaining('2 paths'),
          paths: ['path1', 'path2'],
          created: expect.any(Date),
        }),
      );
    });

    it('should fail when pgit is not initialized', async () => {
      mockConfigManager.exists.mockResolvedValue(false);

      const result = await presetCommand.define('new-preset', ['path1']);

      expect(result.success).toBe(false);
      expect(result.message).toContain('not initialized');
    });

    it('should fail with invalid preset name', async () => {
      mockConfigManager.exists.mockResolvedValue(true);

      const result = await presetCommand.define('', ['path1']);

      expect(result.success).toBe(false);
      expect(result.message).toContain('cannot be empty');
    });

    it('should fail with no paths', async () => {
      mockConfigManager.exists.mockResolvedValue(true);

      const result = await presetCommand.define('new-preset', []);

      expect(result.success).toBe(false);
      expect(result.message).toContain('At least one path');
    });

    it('should warn when overriding built-in preset', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockPresetManager.getPresetSource.mockResolvedValue('builtin');
      mockPresetManager.saveUserPreset.mockResolvedValue();

      const result = await presetCommand.define('builtin-preset', ['path1']);

      expect(result.success).toBe(true);
      expect(mockPresetManager.saveUserPreset).toHaveBeenCalled();
    });
  });

  describe('undefine', () => {
    it('should remove user preset successfully', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockPresetManager.getPresetSource.mockResolvedValue('localUser');
      mockPresetManager.removeUserPreset.mockResolvedValue(true);

      const result = await presetCommand.undefine('user-preset');

      expect(result.success).toBe(true);
      expect(mockPresetManager.removeUserPreset).toHaveBeenCalledWith('user-preset');
    });

    it('should fail when trying to remove built-in preset', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockPresetManager.getPresetSource.mockResolvedValue('builtin');

      const result = await presetCommand.undefine('builtin-preset');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot remove built-in preset');
    });

    it('should fail when preset not found', async () => {
      mockConfigManager.exists.mockResolvedValue(true);
      mockPresetManager.getPresetSource.mockResolvedValue('none');

      const result = await presetCommand.undefine('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('list', () => {
    it('should list presets successfully', async () => {
      const mockPresets = {
        builtin: {
          'builtin-preset': {
            description: 'Built-in preset',
            category: 'test',
            paths: ['builtin/path'],
          },
        },
        localUser: {
          'user-preset': {
            description: 'User preset',
            paths: ['user/path'],
            created: new Date(),
          },
        },
        globalUser: {},
        merged: {
          'builtin-preset': {
            description: 'Built-in preset',
            category: 'test',
            paths: ['builtin/path'],
          },
          'user-preset': {
            description: 'User preset',
            paths: ['user/path'],
            created: new Date(),
          },
        },
      };

      mockPresetManager.getAllPresets.mockResolvedValue(mockPresets);

      const result = await presetCommand.list();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockPresets);
    });

    it('should handle empty preset list', async () => {
      mockPresetManager.getAllPresets.mockResolvedValue({
        builtin: {},
        localUser: {},
        globalUser: {},
        merged: {},
      });

      const result = await presetCommand.list();

      expect(result.success).toBe(true);
    });
  });

  describe('show', () => {
    it('should show preset details successfully', async () => {
      const mockPreset = {
        description: 'Test preset',
        category: 'test',
        paths: ['path1', 'path2'],
        created: new Date(),
      };

      mockPresetManager.getPreset.mockResolvedValue(mockPreset);
      mockPresetManager.getPresetSource.mockResolvedValue('localUser');

      const result = await presetCommand.show('test-preset');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        preset: mockPreset,
        source: 'localUser',
      });
    });

    it('should fail when preset not found', async () => {
      mockPresetManager.getPreset.mockResolvedValue(undefined);
      mockPresetManager.getAllPresets.mockResolvedValue({
        builtin: {},
        localUser: {},
        globalUser: {},
        merged: { 'available-preset': { description: 'Available', paths: [] } },
      });

      const result = await presetCommand.show('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });
});
