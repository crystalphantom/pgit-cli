import path from 'path';
import { readFileSync, existsSync, realpathSync } from 'fs';
import { fileURLToPath } from 'url';
import { Preset, BuiltinPresets } from '../types/config.types';
import { BuiltinPresetsSchema } from '../types/config.schema';
import { ConfigManager } from './config.manager';
import { GlobalPresetManager } from './global-preset.manager';
import { CentralizedConfigManager } from './centralized-config.manager';
import { BaseError } from '../errors/base.error';
import { logger } from '../utils/logger.service';

// Determine the current file's directory in a cross-environment way
const getModuleDirname = (): string => {
  // In CommonJS environments (Jest, ts-node), use __dirname
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }

  // In ES module environments, try to use import.meta.url
  try {
    const meta = new Function('return import.meta')();
    if (meta && meta.url) {
      return path.dirname(fileURLToPath(meta.url));
    }
  } catch {
    // Continue to fallback
  }

  // For global installs, use the CLI path to find the module directory
  try {
    const cliPath = process.argv[1] || '';
    if (cliPath) {
      const realCliPath = realpathSync(cliPath);
      // For global install structure like:
      // /usr/local/lib/node_modules/pgit-cli/dist/cli.js (main entry)
      // We need to find /usr/local/lib/node_modules/pgit-cli/dist/core/
      const cliDir = path.dirname(realCliPath);
      if (cliDir.includes('node_modules') && cliDir.includes('pgit-cli')) {
        // Extract the package root, then add dist/core
        const pgitIndex = cliDir.indexOf('pgit-cli');
        if (pgitIndex !== -1) {
          const packageRoot = cliDir.substring(0, pgitIndex + 'pgit-cli'.length);
          return path.join(packageRoot, 'dist', 'core');
        }
      }
    }
  } catch {
    // Continue to fallback
  }

  // Fallback: Use require.resolve if available
  try {
    const thisModulePath = require.resolve('../core/preset.manager');
    return path.dirname(thisModulePath);
  } catch {
    // Continue to next fallback
  }

  // Last resort fallback
  return process.cwd();
};

const getModuleFilename = (): string => {
  // In CommonJS environments (Jest, ts-node), use __filename
  if (typeof __filename !== 'undefined') {
    return __filename;
  }

  // In ES module environments, try to use import.meta.url
  try {
    const meta = new Function('return import.meta')();
    if (meta && meta.url) {
      return fileURLToPath(meta.url);
    }
  } catch {
    // Continue to fallback
  }

  // For global installs, use the CLI path to find the module file
  try {
    const cliPath = process.argv[1] || '';
    if (cliPath) {
      const realCliPath = realpathSync(cliPath);
      const cliDir = path.dirname(realCliPath);
      if (cliDir.includes('node_modules') && cliDir.includes('pgit-cli')) {
        // Extract the package root, then add dist/core/preset.manager.js
        const pgitIndex = cliDir.indexOf('pgit-cli');
        if (pgitIndex !== -1) {
          const packageRoot = cliDir.substring(0, pgitIndex + 'pgit-cli'.length);
          return path.join(packageRoot, 'dist', 'core', 'preset.manager.js');
        }
      }
    }
  } catch {
    // Continue to fallback
  }

  // Fallback: Use require.resolve if available
  try {
    const thisModulePath = require.resolve('../core/preset.manager');
    return thisModulePath;
  } catch {
    // Continue to next fallback
  }

  // Last resort fallback
  return path.join(process.cwd(), 'preset.manager.js');
};

/**
 * Preset management errors
 */
export class PresetError extends BaseError {
  public readonly code = 'PRESET_ERROR';
  public readonly recoverable = true;
}

export class PresetNotFoundError extends BaseError {
  public readonly code = 'PRESET_NOT_FOUND';
  public readonly recoverable = false;
}

export class PresetValidationError extends BaseError {
  public readonly code = 'PRESET_VALIDATION_ERROR';
  public readonly recoverable = true;
}

/**
 * Manager for handling built-in and user-defined presets
 */
export class PresetManager {
  private readonly configManager: ConfigManager;
  private readonly globalPresetManager: GlobalPresetManager;
  private readonly centralizedConfigManager: CentralizedConfigManager;
  private readonly workingDirectory: string;

  constructor(configManager: ConfigManager, workingDirectory?: string) {
    this.configManager = configManager;
    this.globalPresetManager = new GlobalPresetManager();
    this.workingDirectory = workingDirectory || process.cwd();
    this.centralizedConfigManager = new CentralizedConfigManager(this.workingDirectory);
  }

  /**
   * Get a specific preset by name
   * Priority: Project-specific > Global user > Package built-in
   */
  public async getPreset(name: string): Promise<Preset | undefined> {
    try {
      await this.centralizedConfigManager.initializeGlobalConfig();
      return await this.centralizedConfigManager.getPreset(name);
    } catch (error) {
      logger.warn(`Failed to get preset from centralized config, falling back to legacy: ${error}`);
      return this.getLegacyPreset(name);
    }
  }

  /**
   * Get all available presets from all sources
   * Priority: Project-specific > Global user > Package built-in
   */
  public async getAllPresets(): Promise<{
    builtin: Record<string, Preset>;
    localUser: Record<string, Preset>;
    globalUser: Record<string, Preset>;
    merged: Record<string, Preset>;
  }> {
    try {
      await this.centralizedConfigManager.initializeGlobalConfig();
      const allPresets = await this.centralizedConfigManager.getAllPresets();

      return {
        builtin: allPresets.package || {},
        localUser: allPresets.project || {},
        globalUser: allPresets.global || {},
        merged: allPresets.merged || {},
      };
    } catch (error) {
      logger.warn(
        `Failed to get all presets from centralized config, falling back to legacy: ${error}`,
      );
      return this.getLegacyAllPresets();
    }
  }

  /**
   * Save a user-defined preset (project-specific or global)
   */
  public async saveUserPreset(
    name: string,
    preset: Preset,
    global: boolean = false,
  ): Promise<void> {
    try {
      await this.centralizedConfigManager.initializeGlobalConfig();
      const scope = global ? 'global' : 'project';
      await this.centralizedConfigManager.savePreset(name, preset, scope);
    } catch (error) {
      logger.warn(`Failed to save preset via centralized config, falling back to legacy: ${error}`);
      if (global) {
        return this.saveGlobalUserPreset(name, preset);
      } else {
        return this.saveLocalUserPreset(name, preset);
      }
    }
  }

  /**
   * Save a project-specific user-defined preset
   */
  public async saveLocalUserPreset(name: string, preset: Preset): Promise<void> {
    try {
      await this.centralizedConfigManager.initializeGlobalConfig();
      await this.centralizedConfigManager.savePreset(name, preset, 'project');
    } catch (error) {
      logger.warn(
        `Failed to save project preset via centralized config, falling back to legacy: ${error}`,
      );
      return this.saveLegacyLocalUserPreset(name, preset);
    }
  }

  /**
   * Save a global user-defined preset
   */
  public async saveGlobalUserPreset(name: string, preset: Preset): Promise<void> {
    try {
      await this.centralizedConfigManager.initializeGlobalConfig();
      await this.centralizedConfigManager.savePreset(name, preset, 'global');
    } catch (error) {
      logger.warn(
        `Failed to save global preset via centralized config, falling back to legacy: ${error}`,
      );
      this.globalPresetManager.savePreset(name, preset);
    }
  }

  /**
   * Remove a user-defined preset (project-specific or global)
   */
  public async removeUserPreset(name: string, global: boolean = false): Promise<boolean> {
    try {
      await this.centralizedConfigManager.initializeGlobalConfig();
      const scope = global ? 'global' : 'project';
      await this.centralizedConfigManager.removePreset(name, scope);
      return true;
    } catch (error) {
      logger.warn(
        `Failed to remove preset via centralized config, falling back to legacy: ${error}`,
      );
      if (global) {
        return this.removeGlobalUserPreset(name);
      } else {
        return this.removeLocalUserPreset(name);
      }
    }
  }

  /**
   * Remove a project-specific user-defined preset
   */
  public async removeLocalUserPreset(name: string): Promise<boolean> {
    try {
      await this.centralizedConfigManager.initializeGlobalConfig();
      await this.centralizedConfigManager.removePreset(name, 'project');
      return true;
    } catch (error) {
      logger.warn(
        `Failed to remove project preset via centralized config, falling back to legacy: ${error}`,
      );
      return this.removeLegacyLocalUserPreset(name);
    }
  }

  /**
   * Remove a global user-defined preset
   */
  public removeGlobalUserPreset(name: string): boolean {
    try {
      this.centralizedConfigManager
        .initializeGlobalConfig()
        .then(() => {
          return this.centralizedConfigManager.removePreset(name, 'global');
        })
        .catch(error => {
          logger.warn(
            `Failed to remove global preset via centralized config, falling back to legacy: ${error}`,
          );
          return this.globalPresetManager.removePreset(name);
        });
      return true;
    } catch (error) {
      logger.warn(
        `Failed to remove global preset via centralized config, falling back to legacy: ${error}`,
      );
      return this.globalPresetManager.removePreset(name);
    }
  }

  /**
   * Check if a preset exists
   */
  public async presetExists(name: string): Promise<boolean> {
    const preset = await this.getPreset(name);
    return preset !== undefined;
  }

  /**
   * Get preset source type
   */
  public async getPresetSource(
    name: string,
  ): Promise<'localUser' | 'globalUser' | 'builtin' | 'none'> {
    try {
      await this.centralizedConfigManager.initializeGlobalConfig();
      const source = await this.centralizedConfigManager.getPresetSource(name);

      // Map centralized config sources to legacy names
      switch (source) {
        case 'project':
          return 'localUser';
        case 'global':
          return 'globalUser';
        case 'package':
          return 'builtin';
        case 'none':
          return 'none';
        default:
          return 'none';
      }
    } catch (error) {
      logger.warn(
        `Failed to get preset source from centralized config, falling back to legacy: ${error}`,
      );
      return this.getLegacyPresetSource(name);
    }
  }

  /**
   * Update last used timestamp for a preset
   */
  public async markPresetUsed(name: string): Promise<void> {
    try {
      await this.centralizedConfigManager.initializeGlobalConfig();
      await this.centralizedConfigManager.markPresetUsed(name);
    } catch (error) {
      logger.warn(
        `Failed to mark preset used via centralized config, falling back to legacy: ${error}`,
      );
      return this.markLegacyPresetUsed(name);
    }
  }

  // Legacy fallback methods for backward compatibility

  private async getLegacyPreset(name: string): Promise<Preset | undefined> {
    const localUserPresets = await this.getLegacyLocalUserPresets();
    if (localUserPresets[name]) {
      logger.debug(`Found local user preset: ${name}`);
      return localUserPresets[name];
    }

    const globalPreset = this.globalPresetManager.getPreset(name);
    if (globalPreset) {
      logger.debug(`Found global user preset: ${name}`);
      return globalPreset;
    }

    const builtinPresets = this.getBuiltinPresets();
    if (builtinPresets.presets[name]) {
      logger.debug(`Found built-in preset: ${name}`);
      return builtinPresets.presets[name];
    }

    return undefined;
  }

  private async getLegacyAllPresets(): Promise<{
    builtin: Record<string, Preset>;
    localUser: Record<string, Preset>;
    globalUser: Record<string, Preset>;
    merged: Record<string, Preset>;
  }> {
    const builtinPresets = this.getBuiltinPresets();
    const localUserPresets = await this.getLegacyLocalUserPresets();
    const globalUserPresets = this.globalPresetManager.getAllPresets();

    const merged = {
      ...builtinPresets.presets,
      ...globalUserPresets,
      ...localUserPresets,
    };

    return {
      builtin: builtinPresets.presets,
      localUser: localUserPresets,
      globalUser: globalUserPresets,
      merged,
    };
  }

  private async saveLegacyLocalUserPreset(name: string, preset: Preset): Promise<void> {
    try {
      if (!name || name.trim().length === 0) {
        throw new PresetValidationError('Preset name cannot be empty');
      }

      if (name.length > 50) {
        throw new PresetValidationError('Preset name too long (max 50 characters)');
      }

      const presetToSave: Preset = {
        ...preset,
        created: preset.created || new Date(),
      };

      const config = await this.configManager.load();

      if (!config.presets) {
        config.presets = {};
      }

      config.presets[name] = presetToSave;
      await this.configManager.save(config);

      logger.debug(`Local user preset '${name}' saved to project configuration`);
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw new PresetError(`Failed to save local user preset '${name}': ${error}`);
    }
  }

  private async removeLegacyLocalUserPreset(name: string): Promise<boolean> {
    try {
      const config = await this.configManager.load();

      if (!config.presets || !config.presets[name]) {
        return false;
      }

      delete config.presets[name];
      await this.configManager.save(config);

      logger.debug(`Local user preset '${name}' removed from project configuration`);
      return true;
    } catch (error) {
      throw new PresetError(`Failed to remove local user preset '${name}': ${error}`);
    }
  }

  private async getLegacyLocalUserPresets(): Promise<Record<string, Preset>> {
    try {
      const config = await this.configManager.load();
      return config.presets || {};
    } catch {
      logger.debug('No local user presets available (config not found)');
      return {};
    }
  }

  private async getLegacyPresetSource(
    name: string,
  ): Promise<'localUser' | 'globalUser' | 'builtin' | 'none'> {
    const localUserPresets = await this.getLegacyLocalUserPresets();
    if (localUserPresets[name]) {
      return 'localUser';
    }

    const globalUserPreset = this.globalPresetManager.getPreset(name);
    if (globalUserPreset) {
      return 'globalUser';
    }

    const builtinPresets = this.getBuiltinPresets();
    if (builtinPresets.presets[name]) {
      return 'builtin';
    }

    return 'none';
  }

  private async markLegacyPresetUsed(name: string): Promise<void> {
    const source = await this.getLegacyPresetSource(name);

    if (source === 'localUser') {
      try {
        const config = await this.configManager.load();
        if (config.presets && config.presets[name]) {
          config.presets[name].lastUsed = new Date();
          await this.configManager.save(config);
        }
      } catch (error) {
        logger.warn(`Failed to update last used timestamp for local preset '${name}': ${error}`);
      }
    } else if (source === 'globalUser') {
      this.globalPresetManager.markPresetUsed(name);
    }
  }

  /**
   * Load built-in presets from presets.json
   */
  private getBuiltinPresets(): BuiltinPresets {
    if (this.builtinPresets) {
      return this.builtinPresets;
    }

    try {
      let presetsPath: string;
      let packageRoot: string;

      if (
        process.env['NODE_ENV'] === 'development' ||
        existsSync(path.join(process.cwd(), 'src')) ||
        getModuleFilename().includes('/src/') ||
        process.env['JEST_WORKER_ID']
      ) {
        presetsPath = path.join(process.cwd(), 'presets.json');
        packageRoot = process.cwd();
      } else {
        // Try to resolve the pgit-cli package location using module resolution
        try {
          const moduleDir = getModuleDirname();
          packageRoot = path.dirname(path.dirname(moduleDir)); // Go up two levels from dist/core to package root
          presetsPath = path.join(packageRoot, 'presets.json');
        } catch {
          const cliPath = process.argv[1] || '';
          try {
            const realCliPath = realpathSync(cliPath);
            const cliDir = path.dirname(realCliPath);
            if (cliDir.includes('node_modules') && cliDir.includes('pgit-cli')) {
              const pgitIndex = cliDir.indexOf('pgit-cli');
              if (pgitIndex !== -1) {
                packageRoot = cliDir.substring(0, pgitIndex + 'pgit-cli'.length);
              } else {
                packageRoot = path.resolve(cliDir, '..');
              }
            } else {
              packageRoot = path.resolve(cliDir, '..');
            }
          } catch {
            packageRoot = path.dirname(cliPath);
          }
          presetsPath = path.join(packageRoot, 'presets.json');
        }
      }

      if (!existsSync(presetsPath)) {
        const currentDirname = getModuleDirname();
        const currentFilename = getModuleFilename();
        const debugInfo = `currentDirname: ${currentDirname}, currentFilename: ${currentFilename}, cwd: ${process.cwd()}, argv[1]: ${process.argv[1]}, packageRoot: ${packageRoot}, presetsPath: ${presetsPath}`;
        throw new PresetError(`Could not find presets.json at ${presetsPath}. Debug: ${debugInfo}`);
      }

      const presetsContent = readFileSync(presetsPath, 'utf-8');
      const presetsJson = JSON.parse(presetsContent);

      this.builtinPresets = BuiltinPresetsSchema.parse(presetsJson);

      logger.debug(
        `Loaded ${Object.keys(this.builtinPresets.presets).length} built-in presets from ${presetsPath}`,
      );
      return this.builtinPresets;
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        throw new PresetValidationError('Built-in presets file is invalid');
      }
      throw new PresetError(`Failed to load built-in presets: ${error}`);
    }
  }

  private builtinPresets: BuiltinPresets | null = null;
}
