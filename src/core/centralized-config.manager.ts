import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { Preset, BuiltinPresets, CURRENT_PRESET_VERSION } from '../types/config.types';
import { BuiltinPresetsSchema, PresetSchema } from '../types/config.schema';
import { BaseError } from '../errors/base.error';
import { logger } from '../utils/logger.service';

export class CentralizedConfigError extends BaseError {
  public readonly code = 'CENTRALIZED_CONFIG_ERROR';
  public readonly recoverable = true;
}

export class CentralizedConfigNotFoundError extends BaseError {
  public readonly code = 'CENTRALIZED_CONFIG_NOT_FOUND';
  public readonly recoverable = false;
}

export class CentralizedConfigValidationError extends BaseError {
  public readonly code = 'CENTRALIZED_CONFIG_VALIDATION_ERROR';
  public readonly recoverable = true;
}

interface ConfigPaths {
  globalConfigDir: string;
  globalPresetsFile: string;
  globalSettingsFile: string;
  projectConfigDir: string;
  projectPresetsFile: string;
  packagePresetsFile: string;
}

interface GlobalSettings {
  defaultPreset?: string;
  autoCommit: boolean;
  verboseOutput: boolean;
  editorCommand?: string;
}

interface ProjectInfo {
  name: string;
  path: string;
  lastUsed: Date;
  preset?: string;
}

interface GlobalConfig {
  version: string;
  presets: Record<string, Preset>;
  settings: GlobalSettings;
  projects: Record<string, ProjectInfo>;
}

export class CentralizedConfigManager {
  private readonly configPaths: ConfigPaths;
  private cachedGlobalConfig?: GlobalConfig;
  private cachedProjectPresets?: Record<string, Preset>;
  private cachedPackagePresets?: BuiltinPresets;

  constructor(workingDir: string = process.cwd()) {
    this.configPaths = this.initializeConfigPaths(workingDir);
  }

  private initializeConfigPaths(workingDir: string): ConfigPaths {
    const homeDir = os.homedir();
    const globalConfigDir = path.join(homeDir, '.pgit', 'config');
    const projectConfigDir = path.join(workingDir, '.pgit');

    return {
      globalConfigDir,
      globalPresetsFile: path.join(globalConfigDir, 'presets.json'),
      globalSettingsFile: path.join(globalConfigDir, 'settings.json'),
      projectConfigDir,
      projectPresetsFile: path.join(projectConfigDir, 'presets.json'),
      packagePresetsFile: this.findPackagePresetsFile(),
    };
  }

  private findPackagePresetsFile(): string {
    return path.join(process.cwd(), 'presets.json');
  }

  private getModuleDirname(): string {
    if (typeof __dirname !== 'undefined') return __dirname;
    try {
      const meta = new Function('return import.meta')();
      if (meta && meta.url) return path.dirname(fileURLToPath(meta.url));
    } catch {
      // Fallback to process.cwd()
    }
    return process.cwd();
  }

  private getModuleFilename(): string {
    if (typeof __filename !== 'undefined') return __filename;
    try {
      const meta = new Function('return import.meta')();
      if (meta && meta.url) return fileURLToPath(meta.url);
    } catch {
      // Fallback to process.cwd() file
    }
    return path.join(process.cwd(), 'centralized-config.manager.js');
  }

  public async initializeGlobalConfig(): Promise<void> {
    try {
      this.ensureGlobalConfigDir();

      if (!fs.existsSync(this.configPaths.globalPresetsFile)) {
        await this.initializeGlobalPresets();
      }

      if (!fs.existsSync(this.configPaths.globalSettingsFile)) {
        this.initializeGlobalSettings();
      }

      logger.debug(`Global configuration initialized at ${this.configPaths.globalConfigDir}`);
    } catch (error) {
      throw new CentralizedConfigError(
        `Failed to initialize global configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async initializeGlobalPresets(): Promise<void> {
    try {
      const packagePresets = await this.loadPackagePresets();

      const globalConfig: GlobalConfig = {
        version: CURRENT_PRESET_VERSION,
        presets: packagePresets.presets,
        settings: {
          autoCommit: false,
          verboseOutput: false,
        },
        projects: {},
      };

      this.saveGlobalConfig(globalConfig);

      logger.debug(
        `Global presets initialized with ${Object.keys(packagePresets.presets).length} built-in presets`,
      );
    } catch (error) {
      throw new CentralizedConfigError(
        `Failed to initialize global presets: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private initializeGlobalSettings(): void {
    const defaultSettings: GlobalSettings = {
      autoCommit: false,
      verboseOutput: false,
    };

    try {
      const settingsContent = JSON.stringify(defaultSettings, null, 2);
      fs.writeFileSync(this.configPaths.globalSettingsFile, settingsContent, 'utf-8');
      logger.debug('Global settings initialized with defaults');
    } catch (error) {
      throw new CentralizedConfigError(
        `Failed to initialize global settings: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async loadGlobalConfig(): Promise<GlobalConfig> {
    if (this.cachedGlobalConfig) {
      return this.cachedGlobalConfig;
    }

    try {
      await this.initializeGlobalConfig();

      if (!fs.existsSync(this.configPaths.globalPresetsFile)) {
        await this.initializeGlobalPresets();
      }

      const content = fs.readFileSync(this.configPaths.globalPresetsFile, 'utf-8');
      const config = JSON.parse(content) as GlobalConfig;

      // Convert date strings back to Date objects
      for (const presetName of Object.keys(config.presets)) {
        const preset = config.presets[presetName];
        if (preset.created && typeof preset.created === 'string') {
          preset.created = new Date(preset.created);
        }
        if (preset.lastUsed && typeof preset.lastUsed === 'string') {
          preset.lastUsed = new Date(preset.lastUsed);
        }
      }

      // Convert project date strings
      for (const projectName of Object.keys(config.projects || {})) {
        const project = config.projects[projectName];
        if (project.lastUsed && typeof project.lastUsed === 'string') {
          project.lastUsed = new Date(project.lastUsed);
        }
      }

      this.cachedGlobalConfig = config;
      return config;
    } catch (error) {
      throw new CentralizedConfigError(
        `Failed to load global config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private loadProjectPresets(): Record<string, Preset> {
    if (this.cachedProjectPresets) {
      return this.cachedProjectPresets;
    }

    try {
      if (!fs.existsSync(this.configPaths.projectPresetsFile)) {
        this.cachedProjectPresets = {};
        return {};
      }

      const content = fs.readFileSync(this.configPaths.projectPresetsFile, 'utf-8');
      const config = JSON.parse(content);
      const presets = config.presets || {};

      // Convert date strings back to Date objects
      for (const presetName of Object.keys(presets)) {
        const preset = presets[presetName];
        if (preset.created && typeof preset.created === 'string') {
          preset.created = new Date(preset.created);
        }
        if (preset.lastUsed && typeof preset.lastUsed === 'string') {
          preset.lastUsed = new Date(preset.lastUsed);
        }
      }

      this.cachedProjectPresets = presets;
      return presets;
    } catch (error) {
      logger.debug(`Failed to load project presets: ${error}`);
      this.cachedProjectPresets = {};
      return {};
    }
  }

  private loadPackagePresets(): BuiltinPresets {
    if (this.cachedPackagePresets) {
      return this.cachedPackagePresets;
    }

    try {
      if (!fs.existsSync(this.configPaths.packagePresetsFile)) {
        // Fallback: load from global presets if available
        if (fs.existsSync(this.configPaths.globalPresetsFile)) {
          try {
            const content = fs.readFileSync(this.configPaths.globalPresetsFile, 'utf-8');
            const config = JSON.parse(content);
            this.cachedPackagePresets = BuiltinPresetsSchema.parse({
              version: config.version || CURRENT_PRESET_VERSION,
              presets: config.presets,
            });
            logger.debug(
              `Loaded built-in presets from global config fallback at ${this.configPaths.globalPresetsFile}`,
            );
            return this.cachedPackagePresets;
          } catch (error) {
            throw new CentralizedConfigError(
              `Failed to load global presets fallback: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        const currentDirname = this.getModuleDirname();
        const currentFilename = this.getModuleFilename();
        const debugInfo = `currentDirname: ${currentDirname}, currentFilename: ${currentFilename}, cwd: ${process.cwd()}, argv[1]: ${process.argv[1]}, packagePresetsFile: ${this.configPaths.packagePresetsFile}`;
        throw new CentralizedConfigNotFoundError(
          `Package presets file not found at ${this.configPaths.packagePresetsFile}. Debug: ${debugInfo}`,
        );
      }

      const content = fs.readFileSync(this.configPaths.packagePresetsFile, 'utf-8');
      const presets = JSON.parse(content);

      // Validate structure using the same schema as PresetManager
      this.cachedPackagePresets = BuiltinPresetsSchema.parse(presets);

      logger.debug(
        `Loaded ${Object.keys(this.cachedPackagePresets.presets).length} built-in presets from ${this.configPaths.packagePresetsFile}`,
      );

      return this.cachedPackagePresets;
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        throw new CentralizedConfigValidationError('Built-in presets file is invalid');
      }
      if (error instanceof SyntaxError) {
        throw new CentralizedConfigError('Invalid JSON in built-in presets file');
      }
      throw new CentralizedConfigError(
        `Failed to load package presets: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private saveGlobalConfig(config: GlobalConfig): void {
    try {
      this.ensureGlobalConfigDir();
      const content = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configPaths.globalPresetsFile, content, 'utf-8');
    } catch (error) {
      throw new CentralizedConfigError(
        `Failed to save global config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private ensureGlobalConfigDir(): void {
    try {
      if (!fs.existsSync(this.configPaths.globalConfigDir)) {
        fs.ensureDirSync(this.configPaths.globalConfigDir);
        logger.debug(`Created global config directory: ${this.configPaths.globalConfigDir}`);
      }
    } catch (error) {
      throw new CentralizedConfigError(
        `Failed to create global config directory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public getConfigLocation(): string {
    return this.configPaths.globalConfigDir;
  }

  public getGlobalPresetsFile(): string {
    return this.configPaths.globalPresetsFile;
  }

  public getProjectPresetsFile(): string {
    return this.configPaths.projectPresetsFile;
  }

  public isGlobalConfigInitialized(): boolean {
    return fs.existsSync(this.configPaths.globalPresetsFile);
  }

  public async openConfigInEditor(): Promise<void> {
    try {
      await this.initializeGlobalConfig();

      const globalSettings = this.getGlobalSettings();
      const editorCommand = globalSettings.editorCommand || process.env['EDITOR'] || 'code';

      return new Promise((resolve, reject) => {
        const child = spawn(editorCommand, [this.configPaths.globalPresetsFile], {
          stdio: 'inherit',
          detached: true,
        });

        child.on('error', error => {
          reject(new CentralizedConfigError(`Failed to open editor: ${error.message}`));
        });

        child.on('exit', code => {
          if (code === 0) {
            resolve();
          } else {
            reject(new CentralizedConfigError(`Editor exited with code ${code}`));
          }
        });
      });
    } catch (error) {
      throw new CentralizedConfigError(
        `Failed to open config in editor: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public async resetGlobalConfig(): Promise<void> {
    try {
      const packagePresets = await this.loadPackagePresets();

      const globalConfig: GlobalConfig = {
        version: CURRENT_PRESET_VERSION,
        presets: packagePresets.presets,
        settings: {
          autoCommit: false,
          verboseOutput: false,
        },
        projects: {},
      };

      this.saveGlobalConfig(globalConfig);
      this.cachedGlobalConfig = undefined; // Clear cache

      logger.debug('Global config reset to package defaults');
    } catch (error) {
      throw new CentralizedConfigError(
        `Failed to reset global config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public async getPreset(name: string): Promise<Preset | undefined> {
    // Check project-specific presets first (highest priority)
    const projectPresets = this.loadProjectPresets();
    if (projectPresets[name]) {
      logger.debug(`Found project preset: ${name}`);
      return projectPresets[name];
    }

    // Check global presets
    const globalConfig = await this.loadGlobalConfig();
    if (globalConfig.presets[name]) {
      logger.debug(`Found global preset: ${name}`);
      return globalConfig.presets[name];
    }

    // Check package defaults
    const packagePresets = await this.loadPackagePresets();
    if (packagePresets.presets[name]) {
      logger.debug(`Found package preset: ${name}`);
      return packagePresets.presets[name];
    }

    return undefined;
  }

  public async getAllPresets(): Promise<{
    package: Record<string, Preset>;
    global: Record<string, Preset>;
    project: Record<string, Preset>;
    merged: Record<string, Preset>;
  }> {
    const packagePresets = await this.loadPackagePresets();
    const globalConfig = await this.loadGlobalConfig();
    const projectPresets = this.loadProjectPresets();

    // Merge with project taking highest precedence
    const merged = {
      ...packagePresets.presets,
      ...globalConfig.presets,
      ...projectPresets,
    };

    return {
      package: packagePresets.presets,
      global: globalConfig.presets,
      project: projectPresets,
      merged,
    };
  }

  public async savePreset(
    name: string,
    preset: Preset,
    scope: 'global' | 'project' = 'global',
  ): Promise<void> {
    // Validate preset name
    if (!name || name.trim().length === 0) {
      throw new CentralizedConfigValidationError('Preset name cannot be empty');
    }
    if (name.length > 50) {
      throw new CentralizedConfigValidationError('Preset name cannot exceed 50 characters');
    }

    // Validate preset
    const validatedPreset = PresetSchema.parse({
      ...preset,
      created: preset.created || new Date(),
    });

    if (scope === 'global') {
      const cfg = await this.loadGlobalConfig();
      cfg.presets[name] = validatedPreset;
      this.saveGlobalConfig(cfg);
    } else {
      // Ensure project config directory exists
      if (!fs.existsSync(this.configPaths.projectConfigDir)) {
        fs.ensureDirSync(this.configPaths.projectConfigDir);
      }
      const proj = this.loadProjectPresets();
      proj[name] = validatedPreset;
      fs.writeFileSync(
        this.configPaths.projectPresetsFile,
        JSON.stringify({ presets: proj }, null, 2),
        'utf-8',
      );
    }
  }

  public async removePreset(
    name: string,
    scope: 'global' | 'project' = 'global',
  ): Promise<boolean> {
    if (scope === 'global') {
      const cfg = await this.loadGlobalConfig();
      if (!cfg.presets[name]) return false;
      delete cfg.presets[name];
      this.saveGlobalConfig(cfg);
      return true;
    } else {
      const proj = this.loadProjectPresets();
      if (!proj[name]) return false;
      delete proj[name];
      fs.writeFileSync(
        this.configPaths.projectPresetsFile,
        JSON.stringify({ presets: proj }, null, 2),
        'utf-8',
      );
      return true;
    }
  }

  public async getPresetSource(name: string): Promise<'project' | 'global' | 'package' | 'none'> {
    const proj = this.loadProjectPresets();
    if (proj[name]) return 'project';
    const globalCfg = await this.loadGlobalConfig();
    if (globalCfg.presets[name]) return 'global';
    const pkg = this.loadPackagePresets();
    if (pkg.presets[name]) return 'package';
    return 'none';
  }

  public async markPresetUsed(name: string): Promise<void> {
    const src = await this.getPresetSource(name);
    if (src === 'global') {
      const cfg = await this.loadGlobalConfig();
      if (cfg.presets[name]) {
        cfg.presets[name].lastUsed = new Date();
        this.saveGlobalConfig(cfg);
      }
    } else if (src === 'project') {
      const proj = this.loadProjectPresets();
      if (proj[name]) {
        proj[name].lastUsed = new Date();
        fs.writeFileSync(
          this.configPaths.projectPresetsFile,
          JSON.stringify({ presets: proj }, null, 2),
          'utf-8',
        );
      }
    }
  }

  public getGlobalSettings(): GlobalSettings {
    try {
      if (!fs.existsSync(this.configPaths.globalSettingsFile)) {
        this.initializeGlobalSettings();
      }

      const content = fs.readFileSync(this.configPaths.globalSettingsFile, 'utf-8');
      return JSON.parse(content) as GlobalSettings;
    } catch (error) {
      logger.warn(`Failed to load global settings, using defaults: ${error}`);
      return {
        autoCommit: false,
        verboseOutput: false,
      };
    }
  }

  public updateGlobalSettings(settings: GlobalSettings): void {
    try {
      this.ensureGlobalConfigDir();
      fs.writeFileSync(
        this.configPaths.globalSettingsFile,
        JSON.stringify(settings, null, 2),
        'utf-8',
      );
    } catch (error) {
      throw new CentralizedConfigError(`Failed to update global settings: ${error}`);
    }
  }
}
