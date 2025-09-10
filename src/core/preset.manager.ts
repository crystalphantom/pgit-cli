import path from 'path';
import { readFileSync } from 'fs';
import {
  Preset,
  BuiltinPresets,
} from '../types/config.types';
import { BuiltinPresetsSchema } from '../types/config.schema';
import { ConfigManager } from './config.manager';
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

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * Get a specific preset by name
   * User presets override built-in presets with the same name
   */
  public async getPreset(name: string): Promise<Preset | undefined> {
    // First check user presets
    const userPresets = await this.getUserPresets();
    if (userPresets[name]) {
      logger.debug(`Found user preset: ${name}`);
      return userPresets[name];
    }

    // Then check built-in presets
    const builtinPresets = this.getBuiltinPresets();
    if (builtinPresets.presets[name]) {
      logger.debug(`Found built-in preset: ${name}`);
      return builtinPresets.presets[name];
    }

    return undefined;
  }

  /**
   * Get all available presets (user and built-in)
   * User presets override built-in presets with the same name
   */
  public async getAllPresets(): Promise<{
    builtin: Record<string, Preset>;
    user: Record<string, Preset>;
    merged: Record<string, Preset>;
  }> {
    const builtinPresets = this.getBuiltinPresets();
    const userPresets = await this.getUserPresets();

    // Merge presets with user presets taking precedence
    const merged = { ...builtinPresets.presets, ...userPresets };

    return {
      builtin: builtinPresets.presets,
      user: userPresets,
      merged,
    };
  }

  /**
   * Save a user-defined preset
   */
  public async saveUserPreset(name: string, preset: Preset): Promise<void> {
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

      // Load current config
      const config = await this.configManager.load();

      // Initialize presets object if it doesn't exist
      if (!config.presets) {
        config.presets = {};
      }

      // Save the preset
      config.presets[name] = presetToSave;

      // Save config back to file
      await this.configManager.save(config);

      logger.debug(`Saved user preset: ${name}`);
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw new PresetError(`Failed to save preset '${name}': ${error}`);
    }
  }

  /**
   * Remove a user-defined preset
   */
  public async removeUserPreset(name: string): Promise<boolean> {
    try {
      const config = await this.configManager.load();

      if (!config.presets || !config.presets[name]) {
        return false;
      }

      delete config.presets[name];
      await this.configManager.save(config);

      logger.debug(`Removed user preset: ${name}`);
      return true;
    } catch (error) {
      throw new PresetError(`Failed to remove preset '${name}': ${error}`);
    }
  }

  /**
   * Check if a preset exists (user or built-in)
   */
  public async presetExists(name: string): Promise<boolean> {
    const preset = await this.getPreset(name);
    return preset !== undefined;
  }

  /**
   * Get preset source type
   */
  public async getPresetSource(name: string): Promise<'user' | 'builtin' | 'none'> {
    const userPresets = await this.getUserPresets();
    if (userPresets[name]) {
      return 'user';
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
    
    // Only update timestamp for user presets
    if (source === 'user') {
      try {
        const config = await this.configManager.load();
        if (config.presets && config.presets[name]) {
          config.presets[name].lastUsed = new Date();
          await this.configManager.save(config);
        }
      } catch (error) {
        // Don't throw error for timestamp update failures
        logger.warn(`Failed to update last used timestamp for preset '${name}': ${error}`);
      }
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
   * Load user-defined presets from config
   */
  private async getUserPresets(): Promise<Record<string, Preset>> {
    try {
      const config = await this.configManager.load();
      return config.presets || {};
    } catch (error) {
      // If config doesn't exist, return empty presets
      logger.debug('No user presets available (config not found)');
      return {};
    }
  }
}
