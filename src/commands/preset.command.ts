import chalk from 'chalk';
import {
  CommandResult,
  CommandOptions,
  Preset,
} from '../types/config.types';
import { ConfigManager } from '../core/config.manager';
import { FileSystemService } from '../core/filesystem.service';
import { PresetManager } from '../core/preset.manager';
import { AddCommand } from './add.command';
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

      // Apply each path in the preset
      const result = await this.applyPresetPaths(preset.paths, options);

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
  public async define(
    presetName: string,
    paths: string[],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    try {
      // Check if pgit is initialized
      if (!(await this.configManager.exists())) {
        throw new NotInitializedError(
          'Private git tracking is not initialized. Run "pgit init" first.',
        );
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
        } catch (error) {
          throw new PresetValidationError(`Invalid path: ${trimmedPath}`);
        }

        validatedPaths.push(trimmedPath);
      }

      // Check if preset already exists and warn user
      const existingSource = await this.presetManager.getPresetSource(presetName);
      if (existingSource === 'builtin') {
        logger.warn(`Warning: Preset '${presetName}' exists as a built-in preset. Your custom preset will override it.`);
      } else if (existingSource === 'user') {
        logger.warn(`Warning: User preset '${presetName}' already exists. It will be updated.`);
      }

      // Create preset object
      const preset: Preset = {
        description: `Custom preset with ${validatedPaths.length} path${validatedPaths.length === 1 ? '' : 's'}`,
        paths: validatedPaths,
        created: new Date(),
      };

      // Save the preset
      await this.presetManager.saveUserPreset(presetName, preset);

      logger.success(`✔ Preset '${presetName}' saved to project configuration.`);
      logger.info(`Use 'pgit preset apply ${presetName}' to apply this preset.`);

      if (options.verbose) {
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
  public async undefine(presetName: string, _options: CommandOptions = {}): Promise<CommandResult> {
    try {
      // Check if pgit is initialized
      if (!(await this.configManager.exists())) {
        throw new NotInitializedError(
          'Private git tracking is not initialized. Run "pgit init" first.',
        );
      }

      // Check preset source
      const source = await this.presetManager.getPresetSource(presetName);
      
      if (source === 'none') {
        throw new PresetNotFoundError(`Preset '${presetName}' not found`);
      }

      if (source === 'builtin') {
        throw new PresetCommandError(
          `Cannot remove built-in preset '${presetName}'. Only user-defined presets can be removed.`,
        );
      }

      // Remove the preset
      const removed = await this.presetManager.removeUserPreset(presetName);
      
      if (!removed) {
        throw new PresetCommandError(`Failed to remove preset '${presetName}'`);
      }

      logger.success(`✔ Preset '${presetName}' removed from project configuration.`);

      return {
        success: true,
        message: `Preset '${presetName}' undefined successfully`,
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
        message: `Failed to undefine preset '${presetName}'`,
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
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
            logger.info(`  ${chalk.cyan(name.padEnd(15))} ${chalk.gray(category.padEnd(15))} ${preset.description}`);
            logger.info(`    Paths: ${preset.paths.length} item${preset.paths.length === 1 ? '' : 's'}`);
          } else {
            logger.info(`  ${chalk.cyan(name.padEnd(15))} ${chalk.gray(category.padEnd(15))} ${preset.description}`);
          }
        }
        logger.info('');
      }

      // Display user-defined presets
      const userNames = Object.keys(allPresets.user);
      if (userNames.length > 0) {
        logger.info(chalk.bold('User-defined:'));
        for (const name of userNames.sort()) {
          const preset = allPresets.user[name];
          const pathCount = `(${preset.paths.length} path${preset.paths.length === 1 ? '' : 's'})`;
          
          if (options.verbose) {
            logger.info(`  ${chalk.green(name.padEnd(15))} ${chalk.gray('[custom]'.padEnd(15))} ${preset.description || pathCount}`);
            if (preset.created) {
              logger.info(`    Created: ${preset.created.toLocaleDateString()}`);
            }
            if (preset.lastUsed) {
              logger.info(`    Last used: ${preset.lastUsed.toLocaleDateString()}`);
            }
          } else {
            logger.info(`  ${chalk.green(name.padEnd(15))} ${chalk.gray('[custom]'.padEnd(15))} ${preset.description || pathCount}`);
          }
        }
        logger.info('');
      }

      if (builtinNames.length === 0 && userNames.length === 0) {
        logger.info('No presets available.');
        logger.info('Use "pgit preset define <name> <path1> [path2]..." to create a custom preset.');
      } else {
        logger.info(`Total: ${builtinNames.length} built-in, ${userNames.length} user-defined`);
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
   * Apply preset paths using the add command
   */
  private async applyPresetPaths(paths: string[], options: CommandOptions): Promise<PresetApplyResult> {
    const result: PresetApplyResult = {
      added: [],
      skipped: [],
      failed: [],
    };

    for (const path of paths) {
      try {
        const addResult = await this.addCommand.execute([path], options);
        
        if (addResult.success) {
          result.added.push(path);
        } else {
          // Check if it was skipped (already tracked)
          if (addResult.error?.message.includes('already tracked') || 
              addResult.error?.message.includes('already being tracked')) {
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
    logger.info(`${result.added.length} added, ${result.skipped.length} skipped, ${result.failed.length} failed (${total} total).`);
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
    
    message += '\nUse \'pgit preset list\' to see all available presets.';

    return {
      success: false,
      message,
      error: new PresetNotFoundError(message),
      exitCode: 1,
    };
  }
}
