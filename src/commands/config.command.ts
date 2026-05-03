import { Command } from 'commander';
import fs from 'fs-extra';
import { CentralizedConfigManager } from '../core/centralized-config.manager';
import { PrivateConfigSyncManager } from '../core/private-config-sync.manager';
import { CommandResult } from '../types/config.types';
import { logger } from '../utils/logger.service';

/**
 * Configuration management command
 */
export class ConfigCommand {
  private readonly centralizedConfigManager: CentralizedConfigManager;
  private readonly privateConfigSyncManager: PrivateConfigSyncManager;

  constructor(workingDir: string = process.cwd()) {
    this.centralizedConfigManager = new CentralizedConfigManager(workingDir);
    this.privateConfigSyncManager = new PrivateConfigSyncManager(workingDir);
  }

  /**
   * Register the config command with commander
   */
  public register(program: Command): void {
    const configCmd = program.command('config').description('Manage global pgit configuration');

    // Initialize global configuration
    configCmd
      .command('init')
      .description('Initialize global configuration directory')
      .action(async () => {
        const result = await this.executeInit();
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });

    // Show configuration location
    configCmd
      .command('location')
      .description('Show global configuration directory path')
      .action(async () => {
        const result = await this.executeLocation();
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });

    // Edit configuration
    configCmd
      .command('edit')
      .description('Open global presets configuration in default editor')
      .action(async () => {
        const result = await this.executeEdit();
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });

    // Reset configuration
    configCmd
      .command('reset')
      .description('Reset global configuration to package defaults')
      .option('-f, --force', 'Force reset without confirmation')
      .action(async options => {
        const result = await this.executeReset(options.force);
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });

    // Show configuration info
    configCmd
      .command('info')
      .description('Show configuration information and status')
      .action(async () => {
        const result = await this.executeInfo();
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });

    // Backup configuration
    configCmd
      .command('backup')
      .description('Create a backup of global configuration')
      .action(async () => {
        const result = await this.executeBackup();
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });

    program
      .command('add <paths...>')
      .description('Add root-path private config files or directories')
      .option('--no-commit', 'Do not auto-commit removal of already-tracked main Git paths')
      .option('-f, --force', 'Overwrite existing private config entries before re-adding')
      .option('--no-sync-push', 'Do not automatically push private config changes after add')
      .action(async (targetPaths, options) => {
        const result = await this.executePrivateAdd(
          targetPaths,
          options.commit === false,
          options.syncPush,
          options.force,
        );
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });

    program
      .command('remove <paths...>')
      .description('Remove root-path private config files or directories from pgit tracking')
      .action(async targetPaths => {
        const result = await this.executePrivateRemove(targetPaths);
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });

    program
      .command('drop <paths...>')
      .description(
        'Drop repo-local private config files or directories without removing private store entries',
      )
      .option('-f, --force', 'Drop local copies even when they differ from private store')
      .action(async (targetPaths, options) => {
        const result = await this.executePrivateDrop(targetPaths, options.force);
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });

    program
      .command('pull')
      .description('Copy private config from private store into repo paths')
      .option('-f, --force', 'Overwrite local conflicts after creating backups')
      .action(async options => {
        const result = await this.executePrivateSyncPull(options.force);
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });

    program
      .command('push')
      .description('Copy private config from repo paths into private store')
      .option('-f, --force', 'Overwrite private-store conflicts after creating backups')
      .action(async options => {
        const result = await this.executePrivateSyncPush(options.force);
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });

    program
      .command('status')
      .description('Show private config status')
      .action(async () => {
        const result = await this.executePrivateSyncStatus();
        if (!result.success) {
          process.exit(result.exitCode);
        }
      });
  }

  /**
   * Initialize global configuration
   */
  public async executeInit(): Promise<CommandResult> {
    try {
      await this.centralizedConfigManager.initializeGlobalConfig();

      const configLocation = this.centralizedConfigManager.getConfigLocation();
      const presetsFile = this.centralizedConfigManager.getGlobalPresetsFile();

      console.log('✅ Global configuration initialized successfully!');
      console.log(`📁 Config directory: ${configLocation}`);
      console.log(`📝 Presets file: ${presetsFile}`);
      console.log('💡 Edit presets: pgit config edit');
      console.log('📍 Show location: pgit config location');

      return {
        success: true,
        message: 'Global configuration initialized',
        exitCode: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize global configuration: ${errorMessage}`);
      console.error(`❌ Error: ${errorMessage}`);

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Show configuration location
   */
  public async executeLocation(): Promise<CommandResult> {
    try {
      const configLocation = this.centralizedConfigManager.getConfigLocation();
      const presetsFile = this.centralizedConfigManager.getGlobalPresetsFile();
      const projectPresetsFile = this.centralizedConfigManager.getProjectPresetsFile();

      const isInitialized = await this.centralizedConfigManager.isGlobalConfigInitialized();

      console.log('📁 Configuration Locations:');
      console.log(
        `   Global config: ${configLocation} ${isInitialized ? '✅' : '❌ (not initialized)'}`,
      );
      console.log(`   Global presets: ${presetsFile}`);
      console.log(`   Project presets: ${projectPresetsFile}`);

      if (!isInitialized) {
        console.log('💡 Initialize with: pgit config init');
      }

      return {
        success: true,
        message: 'Configuration location displayed',
        exitCode: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to show configuration location: ${errorMessage}`);
      console.error(`❌ Error: ${errorMessage}`);

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Edit configuration in editor
   */
  public async executeEdit(): Promise<CommandResult> {
    try {
      const isInitialized = await this.centralizedConfigManager.isGlobalConfigInitialized();

      if (!isInitialized) {
        console.log('🔧 Global configuration not initialized. Initializing now...');
        await this.centralizedConfigManager.initializeGlobalConfig();
      }

      console.log('📝 Opening configuration in editor...');
      await this.centralizedConfigManager.openConfigInEditor();

      console.log('✅ Configuration editor closed');

      return {
        success: true,
        message: 'Configuration edited',
        exitCode: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to edit configuration: ${errorMessage}`);
      console.error(`❌ Error: ${errorMessage}`);

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Reset configuration to defaults
   */
  public async executeReset(force: boolean = false): Promise<CommandResult> {
    try {
      if (!force) {
        console.log('⚠️  This will reset your global configuration to package defaults.');
        console.log('   All custom global presets will be lost.');
        console.log('   Use --force to confirm.');

        return {
          success: false,
          message: 'Reset cancelled - use --force to confirm',
          exitCode: 1,
        };
      }

      await this.centralizedConfigManager.resetGlobalConfig();

      console.log('✅ Global configuration reset to package defaults');
      console.log('📝 Edit presets: pgit config edit');

      return {
        success: true,
        message: 'Configuration reset',
        exitCode: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to reset configuration: ${errorMessage}`);
      console.error(`❌ Error: ${errorMessage}`);

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Show configuration information
   */
  public async executeInfo(): Promise<CommandResult> {
    try {
      const isInitialized = await this.centralizedConfigManager.isGlobalConfigInitialized();
      const configLocation = this.centralizedConfigManager.getConfigLocation();

      console.log('ℹ️  Configuration Information:');
      console.log(`   Status: ${isInitialized ? 'Initialized ✅' : 'Not initialized ❌'}`);
      console.log(`   Location: ${configLocation}`);

      if (isInitialized) {
        const allPresets = await this.centralizedConfigManager.getAllPresets();

        console.log(`   Package presets: ${Object.keys(allPresets.package).length}`);
        console.log(`   Global presets: ${Object.keys(allPresets.global).length}`);
        console.log(`   Project presets: ${Object.keys(allPresets.project).length}`);
        console.log(`   Total merged: ${Object.keys(allPresets.merged).length}`);

        if (Object.keys(allPresets.merged).length > 0) {
          console.log('');
          console.log('📋 Available Presets:');
          for (const [name, preset] of Object.entries(allPresets.merged)) {
            const source = await this.centralizedConfigManager.getPresetSource(name);
            const sourceIcon = source === 'package' ? '📦' : source === 'global' ? '🌍' : '📁';
            console.log(`   ${sourceIcon} ${name}: ${preset.description}`);
          }
        }
      } else {
        console.log('💡 Initialize with: pgit config init');
      }

      return {
        success: true,
        message: 'Configuration information displayed',
        exitCode: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to show configuration info: ${errorMessage}`);
      console.error(`❌ Error: ${errorMessage}`);

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  public async executePrivateAdd(
    targetPaths: string | string[],
    noCommit: boolean = false,
    syncPush: boolean = true,
    force: boolean = false,
  ): Promise<CommandResult> {
    try {
      const addOptions: { noCommit: boolean; force?: boolean } = { noCommit };
      if (force) {
        addOptions.force = true;
      }

      const result = await this.privateConfigSyncManager.add(targetPaths, addOptions);

      console.log(
        `✅ Private config added: ${result.entries.map(entry => entry.repoPath).join(', ')}`,
      );
      console.log(`📁 Project ID: ${result.projectId}`);
      console.log('🛡️  Hooks installed: pre-commit, pre-push');

      if (result.untrackedFromMainGit.length > 0) {
        console.log(
          `🧹 Removed ${result.untrackedFromMainGit.length} already-tracked path${result.untrackedFromMainGit.length === 1 ? '' : 's'} from main Git index`,
        );
        if (result.commitHash) {
          console.log(`📝 Removal committed: ${result.commitHash}`);
        } else {
          console.log('⚠️  Removal not committed because --no-commit was used.');
          console.log('Next steps:');
          console.log('   1. Do not run git add . before committing the staged deletions.');
          console.log('   2. Commit the staged removals:');
          console.log('      git commit -m "Remove private config from shared Git"');
          console.log('   3. If you accidentally run git add ., rerun:');
          console.log(`      git rm --cached -r -- ${result.untrackedPaths.join(' ')}`);
        }
      }

      if (syncPush) {
        try {
          const syncResult = await this.privateConfigSyncManager.syncPush();
          console.log(
            `✅ Private config pushed: ${syncResult.entries.length} entr${syncResult.entries.length === 1 ? 'y' : 'ies'}`,
          );
          this.printBackups(syncResult.backups);
        } catch (syncError) {
          const syncMessage = syncError instanceof Error ? syncError.message : String(syncError);
          logger.error(`Failed to auto-push private config after add: ${syncMessage}`);
          console.error(
            `❌ Error: Private config was added, but automatic sync push failed: ${syncMessage}`,
          );
          console.error('Resolve the conflict or run: pgit push --force');

          return {
            success: false,
            message: `Private config added, but sync push failed: ${syncMessage}`,
            data: result,
            error: syncError instanceof Error ? syncError : new Error(String(syncError)),
            exitCode: 1,
          };
        }
      }

      return {
        success: true,
        message: `Private config added: ${result.entries.map(entry => entry.repoPath).join(', ')}`,
        data: result,
        exitCode: 0,
      };
    } catch (error) {
      return this.handleConfigError(error, 'Failed to add private config');
    }
  }

  public async executePrivateRemove(targetPaths: string | string[]): Promise<CommandResult> {
    try {
      const result = await this.privateConfigSyncManager.remove(targetPaths);

      console.log(
        `✅ Private config removed: ${result.entries.map(entry => entry.repoPath).join(', ')}`,
      );
      console.log(`📁 Project ID: ${result.projectId}`);
      console.log('🛡️  Hooks updated: pre-commit, pre-push');
      console.log(
        'Repository files were left untouched and are no longer protected by pgit hooks.',
      );

      return {
        success: true,
        message: `Private config removed: ${result.entries.map(entry => entry.repoPath).join(', ')}`,
        data: result,
        exitCode: 0,
      };
    } catch (error) {
      return this.handleConfigError(error, 'Failed to remove private config');
    }
  }

  public async executePrivateDrop(
    targetPaths: string | string[],
    force: boolean = false,
  ): Promise<CommandResult> {
    try {
      const result = await this.privateConfigSyncManager.drop(targetPaths, { force });

      console.log(
        `✅ Private config dropped locally: ${result.entries.map(entry => entry.repoPath).join(', ')}`,
      );
      console.log(`📁 Project ID: ${result.projectId}`);
      console.log(
        `🧹 Removed ${result.droppedRepoPaths.length} repo-local entr${result.droppedRepoPaths.length === 1 ? 'y' : 'ies'}`,
      );
      console.log('Restore with: pgit pull');

      return {
        success: true,
        message: `Private config dropped locally: ${result.entries.map(entry => entry.repoPath).join(', ')}`,
        data: result,
        exitCode: 0,
      };
    } catch (error) {
      return this.handleConfigError(error, 'Failed to drop local private config');
    }
  }

  public async executePrivateSyncPull(force: boolean = false): Promise<CommandResult> {
    try {
      const result = await this.privateConfigSyncManager.syncPull({ force });
      console.log(
        `✅ Private config pulled: ${result.entries.length} entr${result.entries.length === 1 ? 'y' : 'ies'}`,
      );
      this.printBackups(result.backups);

      return {
        success: true,
        message: 'Private config pulled',
        data: result,
        exitCode: 0,
      };
    } catch (error) {
      return this.handleConfigError(error, 'Failed to pull private config');
    }
  }

  public async executePrivateSyncPush(force: boolean = false): Promise<CommandResult> {
    try {
      const result = await this.privateConfigSyncManager.syncPush({ force });
      console.log(
        `✅ Private config pushed: ${result.entries.length} entr${result.entries.length === 1 ? 'y' : 'ies'}`,
      );
      this.printBackups(result.backups);

      return {
        success: true,
        message: 'Private config pushed',
        data: result,
        exitCode: 0,
      };
    } catch (error) {
      return this.handleConfigError(error, 'Failed to push private config');
    }
  }

  public async executePrivateSyncStatus(): Promise<CommandResult> {
    try {
      const statuses = await this.privateConfigSyncManager.getStatus();
      console.log('📋 Private config status:');
      for (const status of statuses) {
        console.log(`   ${status.repoPath} ${status.state}`);
      }

      return {
        success: true,
        message: 'Private config status displayed',
        data: statuses,
        exitCode: 0,
      };
    } catch (error) {
      return this.handleConfigError(error, 'Failed to show private config status');
    }
  }

  private printBackups(backups: string[]): void {
    for (const backup of backups) {
      console.log(`📦 Backup: ${backup}`);
    }
  }

  private handleConfigError(error: unknown, fallbackMessage: string): CommandResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`${fallbackMessage}: ${errorMessage}`);
    console.error(`❌ Error: ${errorMessage}`);

    return {
      success: false,
      message: errorMessage,
      error: error instanceof Error ? error : new Error(String(error)),
      exitCode: 1,
    };
  }

  /**
   * Backup configuration
   */
  public async executeBackup(): Promise<CommandResult> {
    try {
      const isInitialized = await this.centralizedConfigManager.isGlobalConfigInitialized();

      if (!isInitialized) {
        console.log('❌ Global configuration not initialized');
        console.log('💡 Initialize with: pgit config init');

        return {
          success: false,
          message: 'Configuration not initialized',
          exitCode: 1,
        };
      }

      const configLocation = this.centralizedConfigManager.getConfigLocation();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = `${configLocation}-backup-${timestamp}`;

      // Copy the entire config directory
      await fs.copy(configLocation, backupDir);

      console.log('✅ Configuration backup created');
      console.log(`📁 Backup location: ${backupDir}`);

      return {
        success: true,
        message: 'Configuration backed up',
        data: { backupLocation: backupDir },
        exitCode: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to backup configuration: ${errorMessage}`);
      console.error(`❌ Error: ${errorMessage}`);

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }
}
