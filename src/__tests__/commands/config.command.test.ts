import { Command } from 'commander';
import { ConfigCommand } from '../../commands/config.command';
import { CentralizedConfigManager } from '../../core/centralized-config.manager';
import { PrivateConfigSyncManager } from '../../core/private-config-sync.manager';

// Mock dependencies
jest.mock('../../core/centralized-config.manager');
jest.mock('../../core/private-config-sync.manager');
jest.mock('../../utils/logger.service', () => ({
  logger: {
    error: jest.fn(),
  },
}));

// Mock fs-extra
jest.mock('fs-extra', () => ({
  copy: jest.fn(),
}));

const MockedCentralizedConfigManager = CentralizedConfigManager as jest.MockedClass<
  typeof CentralizedConfigManager
>;
const MockedPrivateConfigSyncManager = PrivateConfigSyncManager as jest.MockedClass<
  typeof PrivateConfigSyncManager
>;

describe('ConfigCommand', () => {
  let configCommand: ConfigCommand;
  let mockCentralizedConfigManager: jest.Mocked<CentralizedConfigManager>;
  let mockPrivateConfigSyncManager: jest.Mocked<PrivateConfigSyncManager>;
  let consoleSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup console spies
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock CentralizedConfigManager
    mockCentralizedConfigManager = new MockedCentralizedConfigManager(
      '',
    ) as jest.Mocked<CentralizedConfigManager>;
    mockCentralizedConfigManager.initializeGlobalConfig = jest.fn();
    mockCentralizedConfigManager.getConfigLocation = jest.fn();
    mockCentralizedConfigManager.getGlobalPresetsFile = jest.fn();
    mockCentralizedConfigManager.getProjectPresetsFile = jest.fn();
    mockCentralizedConfigManager.isGlobalConfigInitialized = jest.fn();
    mockCentralizedConfigManager.openConfigInEditor = jest.fn();
    mockCentralizedConfigManager.resetGlobalConfig = jest.fn();
    mockCentralizedConfigManager.getAllPresets = jest.fn();
    mockCentralizedConfigManager.getPresetSource = jest.fn();

    // Mock constructor to return our mocked instance
    MockedCentralizedConfigManager.mockImplementation(() => mockCentralizedConfigManager);

    mockPrivateConfigSyncManager = new MockedPrivateConfigSyncManager(
      '',
    ) as jest.Mocked<PrivateConfigSyncManager>;
    mockPrivateConfigSyncManager.add = jest.fn();
    mockPrivateConfigSyncManager.remove = jest.fn();
    mockPrivateConfigSyncManager.drop = jest.fn();
    mockPrivateConfigSyncManager.syncPull = jest.fn();
    mockPrivateConfigSyncManager.syncPush = jest.fn();
    mockPrivateConfigSyncManager.getStatus = jest.fn();
    MockedPrivateConfigSyncManager.mockImplementation(() => mockPrivateConfigSyncManager);

    configCommand = new ConfigCommand('/test/workspace');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with default working directory when none provided', () => {
      const originalCwd = process.cwd;
      process.cwd = jest.fn().mockReturnValue('/default/dir');

      const command = new ConfigCommand();
      expect(command).toBeInstanceOf(ConfigCommand);

      process.cwd = originalCwd;
    });

    it('should initialize with provided working directory', () => {
      const command = new ConfigCommand('/custom/dir');
      expect(command).toBeInstanceOf(ConfigCommand);
    });
  });

  describe('executeInit', () => {
    it('should initialize global configuration successfully', async () => {
      mockCentralizedConfigManager.getConfigLocation.mockReturnValue('/home/user/.config/pgit');
      mockCentralizedConfigManager.getGlobalPresetsFile.mockReturnValue(
        '/home/user/.config/pgit/presets.json',
      );

      const result = await configCommand.executeInit();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Global configuration initialized');
      expect(result.exitCode).toBe(0);
      expect(mockCentralizedConfigManager.initializeGlobalConfig).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('✅ Global configuration initialized successfully!');
      expect(consoleSpy).toHaveBeenCalledWith('📁 Config directory: /home/user/.config/pgit');
      expect(consoleSpy).toHaveBeenCalledWith(
        '📝 Presets file: /home/user/.config/pgit/presets.json',
      );
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Initialization failed');
      mockCentralizedConfigManager.initializeGlobalConfig.mockRejectedValue(error);

      const result = await configCommand.executeInit();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Initialization failed');
      expect(result.exitCode).toBe(1);
      expect(result.error).toBe(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error: Initialization failed');
    });

    it('should handle non-Error values in initialization', async () => {
      mockCentralizedConfigManager.initializeGlobalConfig.mockRejectedValue('String error');

      const result = await configCommand.executeInit();

      expect(result.success).toBe(false);
      expect(result.message).toBe('String error');
      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error: String error');
    });
  });

  describe('executeLocation', () => {
    it('should show configuration locations when initialized', async () => {
      mockCentralizedConfigManager.getConfigLocation.mockReturnValue('/home/user/.config/pgit');
      mockCentralizedConfigManager.getGlobalPresetsFile.mockReturnValue(
        '/home/user/.config/pgit/presets.json',
      );
      mockCentralizedConfigManager.getProjectPresetsFile.mockReturnValue(
        '/test/workspace/presets.json',
      );
      mockCentralizedConfigManager.isGlobalConfigInitialized.mockReturnValue(true);

      const result = await configCommand.executeLocation();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Configuration location displayed');
      expect(result.exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('📁 Configuration Locations:');
      expect(consoleSpy).toHaveBeenCalledWith('   Global config: /home/user/.config/pgit ✅');
    });

    it('should show not initialized status when config is not initialized', async () => {
      mockCentralizedConfigManager.getConfigLocation.mockReturnValue('/home/user/.config/pgit');
      mockCentralizedConfigManager.getGlobalPresetsFile.mockReturnValue(
        '/home/user/.config/pgit/presets.json',
      );
      mockCentralizedConfigManager.getProjectPresetsFile.mockReturnValue(
        '/test/workspace/presets.json',
      );
      mockCentralizedConfigManager.isGlobalConfigInitialized.mockReturnValue(false);

      const result = await configCommand.executeLocation();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Configuration location displayed');
      expect(result.exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        '   Global config: /home/user/.config/pgit ❌ (not initialized)',
      );
      expect(consoleSpy).toHaveBeenCalledWith('💡 Initialize with: pgit config init');
    });

    it('should handle errors when getting configuration location', async () => {
      const error = new Error('Location access failed');
      mockCentralizedConfigManager.getConfigLocation.mockImplementation(() => {
        throw error;
      });

      const result = await configCommand.executeLocation();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Location access failed');
      expect(result.exitCode).toBe(1);
      expect(result.error).toBe(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error: Location access failed');
    });
  });

  describe('executeEdit', () => {
    it('should open editor when configuration is initialized', async () => {
      mockCentralizedConfigManager.isGlobalConfigInitialized.mockReturnValue(true);

      const result = await configCommand.executeEdit();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Configuration edited');
      expect(result.exitCode).toBe(0);
      expect(mockCentralizedConfigManager.openConfigInEditor).toHaveBeenCalled();
    });

    it('should initialize configuration before opening editor when not initialized', async () => {
      mockCentralizedConfigManager.isGlobalConfigInitialized.mockReturnValue(false);

      const result = await configCommand.executeEdit();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Configuration edited');
      expect(result.exitCode).toBe(0);
      expect(mockCentralizedConfigManager.initializeGlobalConfig).toHaveBeenCalled();
      expect(mockCentralizedConfigManager.openConfigInEditor).toHaveBeenCalled();
    });

    it('should handle errors when opening editor', async () => {
      const error = new Error('Editor open failed');
      mockCentralizedConfigManager.isGlobalConfigInitialized.mockReturnValue(true);
      mockCentralizedConfigManager.openConfigInEditor.mockRejectedValue(error);

      const result = await configCommand.executeEdit();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Editor open failed');
      expect(result.exitCode).toBe(1);
      expect(result.error).toBe(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error: Editor open failed');
    });
  });

  describe('executeReset', () => {
    it('should require force flag for reset', async () => {
      const result = await configCommand.executeReset(false);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Reset cancelled - use --force to confirm');
      expect(result.exitCode).toBe(1);
      expect(mockCentralizedConfigManager.resetGlobalConfig).not.toHaveBeenCalled();
    });

    it('should reset configuration when force flag is provided', async () => {
      const result = await configCommand.executeReset(true);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Configuration reset');
      expect(result.exitCode).toBe(0);
      expect(mockCentralizedConfigManager.resetGlobalConfig).toHaveBeenCalled();
    });

    it('should handle errors during reset', async () => {
      const error = new Error('Reset failed');
      mockCentralizedConfigManager.resetGlobalConfig.mockRejectedValue(error);

      const result = await configCommand.executeReset(true);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Reset failed');
      expect(result.exitCode).toBe(1);
      expect(result.error).toBe(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error: Reset failed');
    });
  });

  describe('executeInfo', () => {
    it('should show configuration info when initialized', async () => {
      mockCentralizedConfigManager.isGlobalConfigInitialized.mockReturnValue(true);
      mockCentralizedConfigManager.getConfigLocation.mockReturnValue('/home/user/.config/pgit');
      mockCentralizedConfigManager.getAllPresets.mockResolvedValue({
        package: {
          preset1: { description: 'Package preset 1', paths: [] },
        },
        global: {
          preset2: { description: 'Global preset 2', paths: [] },
        },
        project: {
          preset3: { description: 'Project preset 3', paths: [] },
        },
        merged: {
          preset1: { description: 'Package preset 1', paths: [] },
          preset2: { description: 'Global preset 2', paths: [] },
          preset3: { description: 'Project preset 3', paths: [] },
        },
      });

      const result = await configCommand.executeInfo();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Configuration information displayed');
      expect(result.exitCode).toBe(0);
    });

    it('should show not initialized status', async () => {
      mockCentralizedConfigManager.isGlobalConfigInitialized.mockReturnValue(false);
      mockCentralizedConfigManager.getConfigLocation.mockReturnValue('/home/user/.config/pgit');

      const result = await configCommand.executeInfo();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Configuration information displayed');
      expect(result.exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('ℹ️  Configuration Information:');
      expect(consoleSpy).toHaveBeenCalledWith('   Status: Not initialized ❌');
      expect(consoleSpy).toHaveBeenCalledWith('   Location: /home/user/.config/pgit');
      expect(consoleSpy).toHaveBeenCalledWith('💡 Initialize with: pgit config init');
    });

    it('should handle errors when getting configuration info', async () => {
      const error = new Error('Info retrieval failed');
      mockCentralizedConfigManager.isGlobalConfigInitialized.mockReturnValue(true);
      mockCentralizedConfigManager.getConfigLocation.mockImplementation(() => {
        throw error;
      });

      const result = await configCommand.executeInfo();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Info retrieval failed');
      expect(result.exitCode).toBe(1);
      expect(result.error).toBe(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error: Info retrieval failed');
    });
  });

  describe('executePrivateAdd', () => {
    it('should add private config and sync push by default', async () => {
      mockPrivateConfigSyncManager.add.mockResolvedValue({
        projectId: 'project-123',
        entries: [
          {
            repoPath: 'rules.md',
            type: 'file',
            privatePath: '/private/rules.md',
            lastSyncedHash: 'hash',
          },
        ],
        untrackedPaths: ['rules.md'],
        untrackedFromMainGit: [],
      });
      mockPrivateConfigSyncManager.syncPush.mockResolvedValue({
        projectId: 'project-123',
        entries: [{ repoPath: 'rules.md', type: 'file', state: 'up-to-date' }],
        backups: [],
      });

      const result = await configCommand.executePrivateAdd('rules.md');

      expect(result.success).toBe(true);
      expect(mockPrivateConfigSyncManager.add).toHaveBeenCalledWith('rules.md', {
        noCommit: false,
      });
      expect(mockPrivateConfigSyncManager.syncPush).toHaveBeenCalled();
    });

    it('should forward force option to private config manager', async () => {
      mockPrivateConfigSyncManager.add.mockResolvedValue({
        projectId: 'project-123',
        entries: [
          {
            repoPath: 'rules.md',
            type: 'file',
            privatePath: '/private/rules.md',
            lastSyncedHash: 'hash',
          },
        ],
        untrackedPaths: ['rules.md'],
        untrackedFromMainGit: [],
      });
      mockPrivateConfigSyncManager.syncPush.mockResolvedValue({
        projectId: 'project-123',
        entries: [{ repoPath: 'rules.md', type: 'file', state: 'up-to-date' }],
        backups: [],
      });

      const result = await configCommand.executePrivateAdd('rules.md', false, true, true);

      expect(result.success).toBe(true);
      expect(mockPrivateConfigSyncManager.add).toHaveBeenCalledWith('rules.md', {
        noCommit: false,
        force: true,
      });
    });

    it('should skip sync push when disabled', async () => {
      mockPrivateConfigSyncManager.add.mockResolvedValue({
        projectId: 'project-123',
        entries: [
          {
            repoPath: 'rules.md',
            type: 'file',
            privatePath: '/private/rules.md',
            lastSyncedHash: 'hash',
          },
        ],
        untrackedPaths: ['rules.md'],
        untrackedFromMainGit: [],
      });

      const result = await configCommand.executePrivateAdd('rules.md', false, false);

      expect(result.success).toBe(true);
      expect(mockPrivateConfigSyncManager.syncPush).not.toHaveBeenCalled();
    });

    it('should fail clearly when sync push fails after add succeeds', async () => {
      const addResult = {
        projectId: 'project-123',
        entries: [
          {
            repoPath: 'rules.md',
            type: 'file' as const,
            privatePath: '/private/rules.md',
            lastSyncedHash: 'hash',
          },
        ],
        untrackedPaths: ['rules.md'],
        untrackedFromMainGit: [],
      };
      mockPrivateConfigSyncManager.add.mockResolvedValue(addResult);
      mockPrivateConfigSyncManager.syncPush.mockRejectedValue(new Error('Sync conflict'));

      const result = await configCommand.executePrivateAdd('rules.md');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Private config added, but sync push failed: Sync conflict');
      expect(result.data).toBe(addResult);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Error: Private config was added, but automatic sync push failed: Sync conflict',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith('Resolve the conflict or run: pgit push --force');
    });
  });

  describe('executePrivateRemove', () => {
    it('should remove private config tracking', async () => {
      mockPrivateConfigSyncManager.remove.mockResolvedValue({
        projectId: 'project-123',
        entries: [
          {
            repoPath: 'rules.md',
            type: 'file',
            privatePath: '/private/rules.md',
            lastSyncedHash: 'hash',
          },
        ],
        removedPrivatePaths: ['/private/rules.md'],
      });

      const result = await configCommand.executePrivateRemove('rules.md');

      expect(result.success).toBe(true);
      expect(mockPrivateConfigSyncManager.remove).toHaveBeenCalledWith('rules.md');
      expect(result.message).toBe('Private config removed: rules.md');
    });
  });

  describe('executePrivateDrop', () => {
    it('should drop local private config with force option forwarded', async () => {
      mockPrivateConfigSyncManager.drop.mockResolvedValue({
        projectId: 'project-123',
        entries: [
          {
            repoPath: 'rules.md',
            type: 'file',
            privatePath: '/private/rules.md',
            lastSyncedHash: 'hash',
          },
        ],
        droppedRepoPaths: ['rules.md'],
      });

      const result = await configCommand.executePrivateDrop('rules.md', true);

      expect(result.success).toBe(true);
      expect(mockPrivateConfigSyncManager.drop).toHaveBeenCalledWith('rules.md', { force: true });
      expect(result.message).toBe('Private config dropped locally: rules.md');
      expect(consoleSpy).toHaveBeenCalledWith('Restore with: pgit pull');
    });

    it('should handle drop errors', async () => {
      const error = new Error('Local copy changed');
      mockPrivateConfigSyncManager.drop.mockRejectedValue(error);

      const result = await configCommand.executePrivateDrop('.');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Local copy changed');
      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error: Local copy changed');
    });
  });

  describe('executeBackup', () => {
    const mockFs = require('fs-extra');

    it('should create backup when configuration is initialized', async () => {
      mockCentralizedConfigManager.isGlobalConfigInitialized.mockReturnValue(true);
      mockCentralizedConfigManager.getConfigLocation.mockReturnValue('/home/user/.config/pgit');

      const result = await configCommand.executeBackup();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Configuration backed up');
      expect(result.exitCode).toBe(0);
      expect(mockFs.copy).toHaveBeenCalled();
    });

    it('should fail when configuration is not initialized', async () => {
      mockCentralizedConfigManager.isGlobalConfigInitialized.mockReturnValue(false);

      const result = await configCommand.executeBackup();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Configuration not initialized');
      expect(result.exitCode).toBe(1);
      expect(mockFs.copy).not.toHaveBeenCalled();
    });

    it('should handle errors during backup', async () => {
      const error = new Error('Backup failed');
      mockCentralizedConfigManager.isGlobalConfigInitialized.mockReturnValue(true);
      mockCentralizedConfigManager.getConfigLocation.mockReturnValue('/home/user/.config/pgit');
      mockFs.copy.mockRejectedValue(error);

      const result = await configCommand.executeBackup();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Backup failed');
      expect(result.exitCode).toBe(1);
      expect(result.error).toBe(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error: Backup failed');
    });
  });

  describe('register', () => {
    it('should register only global config subcommands under config', () => {
      const program = new Command();
      configCommand.register(program);

      const configSubcommands =
        program.commands.find(command => command.name() === 'config')?.commands.map(command => command.name()) ??
        [];

      expect(configSubcommands).toEqual(
        expect.arrayContaining(['init', 'location', 'edit', 'reset', 'info', 'backup']),
      );
      expect(configSubcommands).not.toEqual(
        expect.arrayContaining(['add', 'remove', 'drop', 'sync', 'push', 'pull', 'status']),
      );
    });

    it('should honor --no-commit on top-level add', async () => {
      mockPrivateConfigSyncManager.add.mockResolvedValue({
        projectId: 'project-123',
        entries: [
          {
            repoPath: 'rules.md',
            type: 'file',
            privatePath: '/private/rules.md',
            lastSyncedHash: 'hash',
          },
        ],
        untrackedPaths: ['rules.md'],
        untrackedFromMainGit: [],
      });
      mockPrivateConfigSyncManager.syncPush.mockResolvedValue({
        projectId: 'project-123',
        entries: [{ repoPath: 'rules.md', type: 'file', state: 'up-to-date' }],
        backups: [],
      });
      const program = new Command();
      program.exitOverride();

      configCommand.register(program);
      await program.parseAsync(['node', 'pgit', 'add', '--no-commit', 'rules.md']);

      expect(mockPrivateConfigSyncManager.add).toHaveBeenCalledWith(['rules.md'], {
        noCommit: true,
      });
    });

    it.each([
      ['remove', ['node', 'pgit', 'remove', 'rules.md']],
      ['drop', ['node', 'pgit', 'drop', '--force', 'rules.md']],
      ['push', ['node', 'pgit', 'push', '--force']],
      ['pull', ['node', 'pgit', 'pull', '--force']],
      ['status', ['node', 'pgit', 'status']],
    ])('should parse top-level %s command', async (_commandName, argv) => {
      mockPrivateConfigSyncManager.remove.mockResolvedValue({
        projectId: 'project-123',
        entries: [
          {
            repoPath: 'rules.md',
            type: 'file',
            privatePath: '/private/rules.md',
            lastSyncedHash: 'hash',
          },
        ],
        removedPrivatePaths: ['/private/rules.md'],
      });
      mockPrivateConfigSyncManager.drop.mockResolvedValue({
        projectId: 'project-123',
        entries: [
          {
            repoPath: 'rules.md',
            type: 'file',
            privatePath: '/private/rules.md',
            lastSyncedHash: 'hash',
          },
        ],
        droppedRepoPaths: ['rules.md'],
      });
      mockPrivateConfigSyncManager.syncPush.mockResolvedValue({
        projectId: 'project-123',
        entries: [{ repoPath: 'rules.md', type: 'file', state: 'up-to-date' }],
        backups: [],
      });
      mockPrivateConfigSyncManager.syncPull.mockResolvedValue({
        projectId: 'project-123',
        entries: [{ repoPath: 'rules.md', type: 'file', state: 'up-to-date' }],
        backups: [],
      });
      mockPrivateConfigSyncManager.getStatus.mockResolvedValue([
        { repoPath: 'rules.md', type: 'file', state: 'up-to-date' },
      ]);

      const program = new Command();
      program.exitOverride();

      configCommand.register(program);
      await program.parseAsync(argv);

      if (argv[2] === 'remove') {
        expect(mockPrivateConfigSyncManager.remove).toHaveBeenCalledWith(['rules.md']);
      }

      if (argv[2] === 'drop') {
        expect(mockPrivateConfigSyncManager.drop).toHaveBeenCalledWith(['rules.md'], {
          force: true,
        });
      }

      if (argv[2] === 'push') {
        expect(mockPrivateConfigSyncManager.syncPush).toHaveBeenCalledWith({ force: true });
      }

      if (argv[2] === 'pull') {
        expect(mockPrivateConfigSyncManager.syncPull).toHaveBeenCalledWith({ force: true });
      }

      if (argv[2] === 'status') {
        expect(mockPrivateConfigSyncManager.getStatus).toHaveBeenCalled();
      }
    });

    it('should reject deprecated config add surface', async () => {
      mockPrivateConfigSyncManager.add.mockResolvedValue({
        projectId: 'project-123',
        entries: [
          {
            repoPath: 'rules.md',
            type: 'file',
            privatePath: '/private/rules.md',
            lastSyncedHash: 'hash',
          },
        ],
        untrackedPaths: ['rules.md'],
        untrackedFromMainGit: [],
      });

      const program = new Command();
      program.exitOverride();

      configCommand.register(program);

      await expect(
        program.parseAsync(['node', 'pgit', 'config', 'add', 'rules.md']),
      ).rejects.toMatchObject({
        code: 'commander.unknownCommand',
      });
    });
  });
});
