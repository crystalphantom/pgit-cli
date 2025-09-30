import chalk from 'chalk';
import { CommandResult, CommandOptions, Preset } from '../types/config.types';
import { ConfigManager } from '../core/config.manager';
import { FileSystemService } from '../core/filesystem.service';
import { PresetManager } from '../core/preset.manager';
import { AddCommand, BatchOperationError } from './add.command';
import { BaseError } from '../errors/base.error';
import { PresetNotFoundError, PresetValidationError } from '../core/preset.manager';
import { InputValidator } from '../utils/input.validator';
import { logger } from '../utils/logger.service';

/**
 * Preset command specific errors
 */
export class PresetCommandError extends BaseError {
  public readonly code = 'PRESET_COMMAND_ERROR';
  public readonly recoverable = true;
}

export class NotInitializedError extends BaseError {
  public readonly code = 'NOT_INITIALIZED';
  public readonly recoverable = false;
}

/**
 * Result interface for preset apply operation
 */
interface PresetApplyResult {
  added: string[];
  skipped: string[];
  failed: Array<{ path: string; error: string }>;
}

/**
 * Preset command for managing file and directory presets
 */
export class PresetCommand {
  private readonly workingDir: string;
  private readonly fileSystem: FileSystemService;
  private readonly configManager: ConfigManager;
  private readonly presetManager: PresetManager;
  private readonly addCommand: AddCommand;

  constructor(workingDir?: string) {
    this.workingDir = workingDir || process.cwd();
    this.fileSystem = new FileSystemService();
    this.configManager = new ConfigManager(this.workingDir, this.fileSystem);
    this.presetManager = new PresetManager(this.configManager);
    this.addCommand = new AddCommand(this.workingDir);
  }

  /**
   * Apply a preset by adding all its paths to private tracking
   */
  public async apply(presetName: string, options: CommandOptions = {}): Promise<CommandResult> {
    try {
      // Check if pgit is initialized
      if (!(await this.configManager.exists())) {
        throw new NotInitializedError(
          'Private git tracking is not initialized. Run "pgit init" first.',
        );
      }

      // Get the preset
      const preset = await this.presetManager.getPreset(presetName);
      if (!preset) {
        return this.handlePresetNotFound(presetName);
      }

      // Mark preset as used
      await this.presetManager.markPresetUsed(presetName);

      logger.info(`Applying preset '${presetName}'...`);
      if (options.verbose) {
        const source = await this.presetManager.getPresetSource(presetName);
        logger.info(`Source: ${source} preset`);
        logger.info(`Description: ${preset.description}`);
      }

      // Apply all paths in the preset using bulk operation (single atomic commit)
      const result = await this.applyPresetPathsBulk(preset.paths, options);

      // Display results
      this.displayApplyResults(presetName, result);

      return {
        success: true,
        message: `Preset '${presetName}' applied successfully`,
        data: result,
        exitCode: 0,
      };
    } catch (error) {
      if (error instanceof BaseError) {
        return {
          success: false,
          message: error.message,
          error,
          exitCode: 1,
        };
      }

      return {
        success: false,
        message: `Failed to apply preset '${presetName}'`,
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Define a new user preset
   */
  /**
   * Define a new user preset
   */
  public async define(
    presetName: string,
    paths: string[],
    options: CommandOptions & { global?: boolean } = {},
  ): Promise<CommandResult> {
    try {
      // Global presets don't require pgit initialization - they are stored in ~/.pgit/presets.json
      // Local presets require initialization since they are stored in the project
      if (!options.global) {
        // Check if pgit is initialized for local presets
        if (!(await this.configManager.exists())) {
          // For local presets, we need pgit to be initialized
          // But we can provide better guidance by suggesting global presets
          throw new NotInitializedError(
            'Private git tracking is not initialized. Run "pgit init" first, or use --global flag to create a global preset that works across all projects.',
          );
        }
      }

      // Validate preset name
      if (!presetName || presetName.trim().length === 0) {
        throw new PresetValidationError('Preset name cannot be empty');
      }

      if (presetName.length > 50) {
        throw new PresetValidationError('Preset name too long (max 50 characters)');
      }

      // Validate paths
      if (!paths || paths.length === 0) {
        throw new PresetValidationError('At least one path is required');
      }

      if (paths.length > 50) {
        throw new PresetValidationError('Too many paths in preset (max 50)');
      }

      // Validate each path
      const validatedPaths: string[] = [];
      for (const path of paths) {
        const trimmedPath = path.trim();
        if (trimmedPath.length === 0) {
          throw new PresetValidationError('Path cannot be empty');
        }

        // Basic path validation
        try {
          InputValidator.validatePath(trimmedPath);
        } catch {
          throw new PresetValidationError(`Invalid path: ${trimmedPath}`);
        }

        validatedPaths.push(trimmedPath);
      }

      // Check if preset already exists and warn user
      const existingSource = await this.presetManager.getPresetSource(presetName);
      if (existingSource === 'builtin') {
        logger.warn(
          `Warning: Preset '${presetName}' exists as a built-in preset. Your custom preset will override it.`,
        );
      } else if (existingSource === 'localUser' || existingSource === 'globalUser') {
        const sourceType = existingSource === 'localUser' ? 'local' : 'global';
        logger.warn(
          `Warning: ${sourceType} user preset '${presetName}' already exists. It will be updated.`,
        );
      }

      // Create preset object
      const preset: Preset = {
        description: `Custom preset with ${validatedPaths.length} path${validatedPaths.length === 1 ? '' : 's'}`,
        paths: validatedPaths,
        created: new Date(),
      };

      // Save the preset (global or local)
      await this.presetManager.saveUserPreset(presetName, preset, options.global);

      const presetType = options.global ? 'global' : 'local';
      logger.success(`✔ ${presetType} preset '${presetName}' saved.`);
      logger.info(`Use 'pgit preset apply ${presetName}' to apply this preset.`);

      if (options.verbose) {
        logger.info(`Preset type: ${presetType}`);
        logger.info('Paths in preset:');
        validatedPaths.forEach(path => logger.info(`  • ${path}`));
      }

      return {
        success: true,
        message: `Preset '${presetName}' defined successfully`,
        data: preset,
        exitCode: 0,
      };
    } catch (error) {
      if (error instanceof BaseError) {
        return {
          success: false,
          message: error.message,
          error,
          exitCode: 1,
        };
      }

      return {
        success: false,
        message: `Failed to define preset '${presetName}'`,
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Remove a user-defined preset
   */
  public async undefine(
    presetName: string,
    options: CommandOptions & { global?: boolean } = {},
  ): Promise<CommandResult> {
    try {
      // Check what type of preset exists
      const source = await this.presetManager.getPresetSource(presetName);

      if (source === 'builtin') {
        return {
          success: false,
          message: `Cannot remove built-in preset '${presetName}'. Built-in presets are read-only.`,
          exitCode: 1,
        };
      }

      if (source === 'none') {
        return {
          success: false,
          message: `Preset '${presetName}' not found.`,
          exitCode: 1,
        };
      }

      let removed = false;
      let removedType = '';

      // If global flag is specified, only remove global preset
      if (options.global) {
        if (source === 'globalUser') {
          removed = await this.presetManager.removeUserPreset(presetName, true);
          removedType = 'global';
        } else {
          return {
            success: false,
            message: `Global preset '${presetName}' not found.`,
            exitCode: 1,
          };
        }
      } else {
        // Remove from the appropriate location
        if (source === 'localUser') {
          removed = await this.presetManager.removeUserPreset(presetName, false);
          removedType = 'local';
        } else if (source === 'globalUser') {
          removed = await this.presetManager.removeUserPreset(presetName, true);
          removedType = 'global';
        }
      }

      if (removed) {
        logger.success(`✔ ${removedType} preset '${presetName}' removed successfully.`);
        return {
          success: true,
          message: `Preset '${presetName}' removed successfully`,
          exitCode: 0,
        };
      } else {
        return {
          success: false,
          message: `Failed to remove preset '${presetName}'.`,
          exitCode: 1,
        };
      }
    } catch (error) {
      if (error instanceof BaseError) {
        return {
          success: false,
          message: error.message,
          error,
          exitCode: 1,
        };
      }

      return {
        success: false,
        message: `Failed to remove preset '${presetName}'`,
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Add a new user preset (alias for define)
   */
  public async add(
    presetName: string,
    paths: string[],
    options: CommandOptions & { global?: boolean } = {},
  ): Promise<CommandResult> {
    return this.define(presetName, paths, options);
  }

  /**
   * Remove a user-defined preset (alias for undefine)
   */
  public async remove(
    presetName: string,
    options: CommandOptions & { global?: boolean } = {},
  ): Promise<CommandResult> {
    return this.undefine(presetName, options);
  }

  /**
   * List all available presets
   */
  public async list(options: CommandOptions = {}): Promise<CommandResult> {
    try {
      const allPresets = await this.presetManager.getAllPresets();

      logger.info('Available Presets:\n');

      // Display built-in presets
      const builtinNames = Object.keys(allPresets.builtin);
      if (builtinNames.length > 0) {
        logger.info(chalk.bold('Built-in:'));
        for (const name of builtinNames.sort()) {
          const preset = allPresets.builtin[name];
          const category = preset.category ? `[${preset.category}]` : '[general]';

          if (options.verbose) {
            logger.info(
              `  ${chalk.cyan(name.padEnd(15))} ${chalk.gray(category.padEnd(15))} ${preset.description}`,
            );
            logger.info(
              `    Paths: ${preset.paths.length} item${preset.paths.length === 1 ? '' : 's'}`,
            );
          } else {
            logger.info(
              `  ${chalk.cyan(name.padEnd(15))} ${chalk.gray(category.padEnd(15))} ${preset.description}`,
            );
          }
        }
        logger.info('');
      }

      // Display user-defined presets
      const localUserNames = Object.keys(allPresets.localUser);
      const globalUserNames = Object.keys(allPresets.globalUser);

      if (localUserNames.length > 0) {
        logger.info(chalk.bold('Local User-defined:'));
        for (const name of localUserNames.sort()) {
          const preset = allPresets.localUser[name];
          const pathCount = `(${preset.paths.length} path${preset.paths.length === 1 ? '' : 's'})`;

          if (options.verbose) {
            logger.info(
              `  ${chalk.green(name.padEnd(15))} ${chalk.gray('[local]'.padEnd(15))} ${preset.description || pathCount}`,
            );
            if (preset.created) {
              logger.info(`    Created: ${preset.created.toLocaleDateString()}`);
            }
            if (preset.lastUsed) {
              logger.info(`    Last used: ${preset.lastUsed.toLocaleDateString()}`);
            }
          } else {
            logger.info(
              `  ${chalk.green(name.padEnd(15))} ${chalk.gray('[local]'.padEnd(15))} ${preset.description || pathCount}`,
            );
          }
        }
        logger.info('');
      }

      if (globalUserNames.length > 0) {
        logger.info(chalk.bold('Global User-defined:'));
        for (const name of globalUserNames.sort()) {
          const preset = allPresets.globalUser[name];
          const pathCount = `(${preset.paths.length} path${preset.paths.length === 1 ? '' : 's'})`;

          if (options.verbose) {
            logger.info(
              `  ${chalk.yellow(name.padEnd(15))} ${chalk.gray('[global]'.padEnd(15))} ${preset.description || pathCount}`,
            );
            if (preset.created) {
              logger.info(`    Created: ${preset.created.toLocaleDateString()}`);
            }
            if (preset.lastUsed) {
              logger.info(`    Last used: ${preset.lastUsed.toLocaleDateString()}`);
            }
          } else {
            logger.info(
              `  ${chalk.yellow(name.padEnd(15))} ${chalk.gray('[global]'.padEnd(15))} ${preset.description || pathCount}`,
            );
          }
        }
        logger.info('');
      }

      if (
        builtinNames.length === 0 &&
        localUserNames.length === 0 &&
        globalUserNames.length === 0
      ) {
        logger.info('No presets available.');
        logger.info('Use "pgit preset define <name> <path1> [path2]..." to create a local preset.');
        logger.info(
          'Use "pgit preset define --global <name> <path1> [path2]..." to create a global preset.',
        );
      } else {
        const totalUser = localUserNames.length + globalUserNames.length;
        logger.info(
          `Total: ${builtinNames.length} built-in, ${totalUser} user-defined (${localUserNames.length} local, ${globalUserNames.length} global)`,
        );
        logger.info('Use "pgit preset show <name>" to see details about a specific preset.');
      }

      return {
        success: true,
        message: 'Presets listed successfully',
        data: allPresets,
        exitCode: 0,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to list presets',
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Show details about a specific preset
   */
  public async show(presetName: string, _options: CommandOptions = {}): Promise<CommandResult> {
    try {
      const preset = await this.presetManager.getPreset(presetName);
      if (!preset) {
        return this.handlePresetNotFound(presetName);
      }

      const source = await this.presetManager.getPresetSource(presetName);
      const sourceLabel = source === 'builtin' ? 'Built-in' : 'User-defined';

      logger.info(`Preset: ${chalk.bold(presetName)} ${chalk.gray(`[${sourceLabel}]`)}`);

      if (preset.category) {
        logger.info(`Category: ${preset.category}`);
      }

      logger.info(`Description: ${preset.description}`);

      if (preset.created) {
        logger.info(`Created: ${preset.created.toLocaleDateString()}`);
      }

      if (preset.lastUsed) {
        logger.info(`Last used: ${preset.lastUsed.toLocaleDateString()}`);
      }

      logger.info(`\nPaths (${preset.paths.length}):`);
      preset.paths.forEach(path => {
        logger.info(`  • ${path}`);
      });

      return {
        success: true,
        message: `Preset '${presetName}' details shown`,
        data: { preset, source },
        exitCode: 0,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to show preset '${presetName}'`,
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Apply preset paths using bulk add command for atomic commit
   */
  private async applyPresetPathsBulk(
    paths: string[],
    options: CommandOptions,
  ): Promise<PresetApplyResult> {
    const result: PresetApplyResult = {
      added: [],
      skipped: [],
      failed: [],
    };

    if (paths.length === 0) {
      return result;
    }

    try {
      // Use AddCommand's bulk processing which handles atomic commits
      const addResult = await this.addCommand.execute(paths, options);

      if (addResult.success) {
        // All paths were added successfully
        result.added = [...paths];
      } else {
        // Handle different types of errors
        if (addResult.error instanceof Error) {
          const errorMessage = addResult.error.message;

          // Check for batch operation errors which contain detailed path information
          if (addResult.error instanceof BatchOperationError) {
            const batchError = addResult.error;
            result.added = batchError.successfulPaths;
            result.failed = batchError.failedPaths.map((path: string) => ({
              path,
              error: 'Batch operation failed',
            }));
          } else if (errorMessage.includes('already tracked')) {
            // All paths are already tracked
            result.skipped = [...paths];
          } else if (
            errorMessage.includes('does not exist') ||
            errorMessage.includes('not found')
          ) {
            // Some or all paths don't exist
            result.failed = paths.map(path => ({
              path,
              error: 'Path does not exist',
            }));
          } else {
            // Other errors - fallback to individual processing for better error reporting
            return this.fallbackToIndividualProcessing(paths, options);
          }
        } else {
          // Unknown error - fallback to individual processing
          return this.fallbackToIndividualProcessing(paths, options);
        }
      }
    } catch {
      // If bulk operation fails, fallback to individual processing for better error reporting
      return this.fallbackToIndividualProcessing(paths, options);
    }

    return result;
  }

  /**
   * Fallback to individual file processing when bulk operation fails
   */
  private async fallbackToIndividualProcessing(
    paths: string[],
    options: CommandOptions,
  ): Promise<PresetApplyResult> {
    const result: PresetApplyResult = {
      added: [],
      skipped: [],
      failed: [],
    };

    if (options.verbose) {
      logger.info('Falling back to individual file processing...');
    }

    for (const path of paths) {
      try {
        const addResult = await this.addCommand.execute([path], options);

        if (addResult.success) {
          result.added.push(path);
        } else {
          // Check if it was skipped (already tracked)
          if (
            addResult.error?.message.includes('already tracked') ||
            addResult.error?.message.includes('already being tracked')
          ) {
            result.skipped.push(path);
          } else {
            result.failed.push({
              path,
              error: addResult.error?.message || 'Unknown error',
            });
          }
        }
      } catch (error) {
        result.failed.push({
          path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Display the results of applying a preset
   */
  private displayApplyResults(presetName: string, result: PresetApplyResult): void {
    // Show successes
    result.added.forEach(path => {
      logger.success(`✔ Added '${path}' to private tracking.`);
    });

    // Show skipped items
    result.skipped.forEach(path => {
      logger.warn(`⚠ '${path}' is already tracked, skipping.`);
    });

    // Show failures
    result.failed.forEach(({ path, error }) => {
      if (error.includes('does not exist') || error.includes('not found')) {
        logger.warn(`⚠ '${path}' does not exist, skipping.`);
      } else {
        logger.error(`✗ Failed to add '${path}': ${error}`);
      }
    });

    // Summary
    const total = result.added.length + result.skipped.length + result.failed.length;
    logger.info(`\nPreset '${presetName}' applied.`);
    logger.info(
      `${result.added.length} added, ${result.skipped.length} skipped, ${result.failed.length} failed (${total} total).`,
    );
  }

  /**
   * Handle preset not found error with helpful suggestions
   */
  private async handlePresetNotFound(presetName: string): Promise<CommandResult> {
    const allPresets = await this.presetManager.getAllPresets();
    const availableNames = Object.keys(allPresets.merged);

    let message = `Preset '${presetName}' not found.`;

    if (availableNames.length > 0) {
      message += `\n\nAvailable presets: ${availableNames.sort().join(', ')}`;
    }

    message += "\nUse 'pgit preset list' to see all available presets.";

    return {
      success: false,
      message,
      error: new PresetNotFoundError(message),
      exitCode: 1,
    };
  }
}
