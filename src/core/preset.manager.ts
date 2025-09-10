import path from 'path';
import { readFileSync } from 'fs';
import { Preset, BuiltinPresets } from '../types/config.types';
import { BuiltinPresetsSchema } from '../types/config.schema';
import { ConfigManager } from './config.manager';
import { GlobalPresetManager } from './global-preset.manager';
import { BaseError } from '../errors/base.error';
import { logger } from '../utils/logger.service';

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
  private builtinPresets: BuiltinPresets | null = null;
  private readonly configManager: ConfigManager;
  private readonly globalPresetManager: GlobalPresetManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.globalPresetManager = new GlobalPresetManager();
  }

  /**
   * Get a specific preset by name
   * Priority: Local user presets > Global user presets > Built-in presets
   */
  public async getPreset(name: string): Promise<Preset | undefined> {
    // First check local user presets (project-specific)
    const localUserPresets = await this.getLocalUserPresets();
    if (localUserPresets[name]) {
      logger.debug(`Found local user preset: ${name}`);
      return localUserPresets[name];
    }

    // Then check global user presets
    const globalPreset = this.globalPresetManager.getPreset(name);
    if (globalPreset) {
      logger.debug(`Found global user preset: ${name}`);
      return globalPreset;
    }

    // Finally check built-in presets
    const builtinPresets = this.getBuiltinPresets();
    if (builtinPresets.presets[name]) {
      logger.debug(`Found built-in preset: ${name}`);
      return builtinPresets.presets[name];
    }

    return undefined;
  }

  /**
   * Get all available presets (local user, global user, and built-in)
   * Priority: Local user presets > Global user presets > Built-in presets
   */
  public async getAllPresets(): Promise<{
    builtin: Record<string, Preset>;
    localUser: Record<string, Preset>;
    globalUser: Record<string, Preset>;
    merged: Record<string, Preset>;
  }> {
    const builtinPresets = this.getBuiltinPresets();
    const localUserPresets = await this.getLocalUserPresets();
    const globalUserPresets = this.globalPresetManager.getAllPresets();

    // Merge presets with local user presets taking highest precedence
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

  /**
   * Save a user-defined preset (local or global)
   */
  public async saveUserPreset(
    name: string,
    preset: Preset,
    global: boolean = false,
  ): Promise<void> {
    if (global) {
      return this.saveGlobalUserPreset(name, preset);
    } else {
      return this.saveLocalUserPreset(name, preset);
    }
  }

  /**
   * Save a local user-defined preset (project-specific)
   */
  public async saveLocalUserPreset(name: string, preset: Preset): Promise<void> {
    try {
      // Validate preset name
      if (!name || name.trim().length === 0) {
        throw new PresetValidationError('Preset name cannot be empty');
      }

      if (name.length > 50) {
        throw new PresetValidationError('Preset name too long (max 50 characters)');
      }

      // Add created timestamp if not present
      const presetToSave: Preset = {
        ...preset,
        created: preset.created || new Date(),
      };

      // Get current config
      const config = await this.configManager.load();

      // Initialize presets if not exists
      if (!config.presets) {
        config.presets = {};
      }

      // Save the preset
      config.presets[name] = presetToSave;

      // Save config
      await this.configManager.save(config);

      logger.debug(`Local user preset '${name}' saved to project configuration`);
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw new PresetError(`Failed to save local user preset '${name}': ${error}`);
    }
  }

  /**
   * Save a global user-defined preset
   */
  public saveGlobalUserPreset(name: string, preset: Preset): void {
    return this.globalPresetManager.savePreset(name, preset);
  }

  /**
   * Remove a user-defined preset (local or global)
   */
  public async removeUserPreset(name: string, global: boolean = false): Promise<boolean> {
    if (global) {
      return this.removeGlobalUserPreset(name);
    } else {
      return this.removeLocalUserPreset(name);
    }
  }

  /**
   * Remove a local user-defined preset
   */
  public async removeLocalUserPreset(name: string): Promise<boolean> {
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

  /**
   * Remove a global user-defined preset
   */
  public removeGlobalUserPreset(name: string): boolean {
    return this.globalPresetManager.removePreset(name);
  }

  /**
   * Check if a preset exists (local user, global user, or built-in)
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
    const localUserPresets = await this.getLocalUserPresets();
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

  /**
   * Update last used timestamp for a preset
   */
  public async markPresetUsed(name: string): Promise<void> {
    const source = await this.getPresetSource(name);

    // Update timestamp for user presets
    if (source === 'localUser') {
      try {
        const config = await this.configManager.load();
        if (config.presets && config.presets[name]) {
          config.presets[name].lastUsed = new Date();
          await this.configManager.save(config);
        }
      } catch (error) {
        // Don't throw error for timestamp update failures
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
      // Find presets.json relative to this module
      const presetsPath = path.join(__dirname, '../../presets.json');
      const presetsContent = readFileSync(presetsPath, 'utf-8');
      const presetsJson = JSON.parse(presetsContent);

      // Validate the structure
      this.builtinPresets = BuiltinPresetsSchema.parse(presetsJson);

      logger.debug(`Loaded ${Object.keys(this.builtinPresets.presets).length} built-in presets`);
      return this.builtinPresets;
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        throw new PresetValidationError('Built-in presets file is invalid');
      }
      throw new PresetError(`Failed to load built-in presets: ${error}`);
    }
  }

  /**
   * Load local user-defined presets from config
   */
  private async getLocalUserPresets(): Promise<Record<string, Preset>> {
    try {
      const config = await this.configManager.load();
      return config.presets || {};
    } catch (error) {
      // If config doesn't exist, return empty presets
      logger.debug('No local user presets available (config not found)');
      return {};
    }
  }
}
