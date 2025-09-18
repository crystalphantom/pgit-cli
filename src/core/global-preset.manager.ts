import path from 'path';
import os from 'os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { Preset } from '../types/config.types.js';
import { BaseError } from '../errors/base.error.js';
import { logger } from '../utils/logger.service.js';

/**
 * Global preset management errors
 */
export class GlobalPresetError extends BaseError {
  public readonly code = 'GLOBAL_PRESET_ERROR';
  public readonly recoverable = true;
}

export class GlobalPresetNotFoundError extends BaseError {
  public readonly code = 'GLOBAL_PRESET_NOT_FOUND';
  public readonly recoverable = false;
}

export class GlobalPresetValidationError extends BaseError {
  public readonly code = 'GLOBAL_PRESET_VALIDATION_ERROR';
  public readonly recoverable = true;
}

/**
 * Global user presets structure
 */
interface GlobalUserPresets {
  version: string;
  presets: Record<string, Preset>;
}

/**
 * Manager for handling global user-defined presets
 * These presets are stored in the user's home directory and are available globally
 */
export class GlobalPresetManager {
  private readonly globalConfigDir: string;
  private readonly globalPresetsFile: string;
  private cachedPresets: GlobalUserPresets | null = null;

  constructor() {
    // Store global presets in ~/.pgit/presets.json
    this.globalConfigDir = path.join(os.homedir(), '.pgit');
    this.globalPresetsFile = path.join(this.globalConfigDir, 'presets.json');
  }

  /**
   * Get a specific global user preset by name
   */
  public getPreset(name: string): Preset | undefined {
    const presets = this.loadGlobalPresets();
    return presets.presets[name];
  }

  /**
   * Get all global user presets
   */
  public getAllPresets(): Record<string, Preset> {
    const presets = this.loadGlobalPresets();
    return presets.presets;
  }

  /**
   * Save a global user-defined preset
   */
  public savePreset(name: string, preset: Preset): void {
    try {
      // Validate preset name
      if (!name || name.trim().length === 0) {
        throw new GlobalPresetValidationError('Preset name cannot be empty');
      }

      if (name.length > 50) {
        throw new GlobalPresetValidationError('Preset name too long (max 50 characters)');
      }

      // Ensure global config directory exists
      this.ensureGlobalConfigDir();

      // Load existing presets
      const globalPresets = this.loadGlobalPresets();

      // Add created timestamp if not present
      const presetToSave: Preset = {
        ...preset,
        created: preset.created || new Date(),
      };

      // Save the preset
      globalPresets.presets[name] = presetToSave;

      // Write to file
      this.saveGlobalPresets(globalPresets);

      // Clear cache
      this.cachedPresets = null;

      logger.debug(`Global preset '${name}' saved to ${this.globalPresetsFile}`);
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw new GlobalPresetError(`Failed to save global preset '${name}': ${error}`);
    }
  }

  /**
   * Remove a global user-defined preset
   */
  public removePreset(name: string): boolean {
    try {
      const globalPresets = this.loadGlobalPresets();

      if (!globalPresets.presets[name]) {
        return false;
      }

      delete globalPresets.presets[name];

      // Write to file
      this.saveGlobalPresets(globalPresets);

      // Clear cache
      this.cachedPresets = null;

      logger.debug(`Global preset '${name}' removed from ${this.globalPresetsFile}`);
      return true;
    } catch (error) {
      throw new GlobalPresetError(`Failed to remove global preset '${name}': ${error}`);
    }
  }

  /**
   * Check if a global preset exists
   */
  public presetExists(name: string): boolean {
    const presets = this.loadGlobalPresets();
    return presets.presets[name] !== undefined;
  }

  /**
   * Update last used timestamp for a global preset
   */
  public markPresetUsed(name: string): void {
    try {
      const globalPresets = this.loadGlobalPresets();

      if (globalPresets.presets[name]) {
        globalPresets.presets[name].lastUsed = new Date();
        this.saveGlobalPresets(globalPresets);

        // Clear cache
        this.cachedPresets = null;
      }
    } catch (error) {
      // Don't throw error for timestamp update failures
      logger.warn(`Failed to update last used timestamp for global preset '${name}': ${error}`);
    }
  }

  /**
   * Get the global presets file path
   */
  public getPresetsFilePath(): string {
    return this.globalPresetsFile;
  }

  /**
   * Load global presets from file
   */
  private loadGlobalPresets(): GlobalUserPresets {
    if (this.cachedPresets) {
      return this.cachedPresets;
    }

    try {
      if (!existsSync(this.globalPresetsFile)) {
        // Return empty preset structure if file doesn't exist
        const emptyPresets: GlobalUserPresets = {
          version: '1.0.0',
          presets: {},
        };
        this.cachedPresets = emptyPresets;
        return emptyPresets;
      }

      const content = readFileSync(this.globalPresetsFile, 'utf-8');
      const presets = JSON.parse(content) as GlobalUserPresets;

      // Validate structure
      if (!presets.version || !presets.presets) {
        throw new Error('Invalid global presets file structure');
      }

      // Convert date strings back to Date objects
      for (const preset of Object.values(presets.presets)) {
        if (preset.created && typeof preset.created === 'string') {
          preset.created = new Date(preset.created);
        }
        if (preset.lastUsed && typeof preset.lastUsed === 'string') {
          preset.lastUsed = new Date(preset.lastUsed);
        }
      }

      this.cachedPresets = presets;
      return presets;
    } catch (error) {
      logger.warn(`Failed to load global presets from ${this.globalPresetsFile}: ${error}`);
      // Return empty preset structure on error
      const emptyPresets: GlobalUserPresets = {
        version: '1.0.0',
        presets: {},
      };
      this.cachedPresets = emptyPresets;
      return emptyPresets;
    }
  }

  /**
   * Save global presets to file
   */
  private saveGlobalPresets(presets: GlobalUserPresets): void {
    try {
      this.ensureGlobalConfigDir();
      const content = JSON.stringify(presets, null, 2);
      writeFileSync(this.globalPresetsFile, content, 'utf-8');
    } catch (error) {
      throw new GlobalPresetError(
        `Failed to save global presets to ${this.globalPresetsFile}: ${error}`,
      );
    }
  }

  /**
   * Ensure global config directory exists
   */
  private ensureGlobalConfigDir(): void {
    try {
      if (!existsSync(this.globalConfigDir)) {
        mkdirSync(this.globalConfigDir, { recursive: true });
        logger.debug(`Created global config directory: ${this.globalConfigDir}`);
      }
    } catch (error) {
      throw new GlobalPresetError(
        `Failed to create global config directory ${this.globalConfigDir}: ${error}`,
      );
    }
  }
}
