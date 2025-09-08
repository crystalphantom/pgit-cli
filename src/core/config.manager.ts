import path from 'path';
import {
  PrivateConfig,
  ConfigSettings,
  GitExcludeSettings,
  DEFAULT_SETTINGS,
  DEFAULT_GIT_EXCLUDE_SETTINGS,
  DEFAULT_PATHS,
  CURRENT_CONFIG_VERSION,
} from '../types/config.types';
import { PrivateConfigSchema, PrivateConfigJsonSchema } from '../types/config.schema';
import { ZodError, ZodIssue } from 'zod';
import type { ConfigHealth } from '../types/config.types';
import { FileSystemService } from './filesystem.service';
import { PlatformDetector } from '../utils/platform.detector';
import { BaseError } from '../errors/base.error';

/**
 * Configuration management errors
 */
export class ConfigError extends BaseError {
  public readonly code = 'CONFIG_ERROR';
  public readonly recoverable = true;
}

export class ConfigValidationError extends BaseError {
  public readonly code = 'CONFIG_VALIDATION_ERROR';
  public readonly recoverable = true;
}

export class ConfigMigrationError extends BaseError {
  public readonly code = 'CONFIG_MIGRATION_ERROR';
  public readonly recoverable = false;
}

/**
 * Configuration manager for private git CLI
 */
export class ConfigManager {
  private readonly configPath: string;
  private readonly fileSystem: FileSystemService;
  private cachedConfig?: PrivateConfig | undefined;

  constructor(workingDir: string, fileSystem?: FileSystemService) {
    this.configPath = path.join(workingDir, DEFAULT_PATHS.config);
    this.fileSystem = fileSystem || new FileSystemService();
  }

  /**
   * Create initial configuration
   */
  public async create(
    projectPath: string,
    options: Partial<ConfigSettings> = {},
  ): Promise<PrivateConfig> {
    const now = new Date();
    const projectName = path.basename(projectPath);

    const config: PrivateConfig = {
      version: CURRENT_CONFIG_VERSION,
      privateRepoPath: DEFAULT_PATHS.privateRepo,
      storagePath: DEFAULT_PATHS.storage,
      trackedPaths: [],
      initialized: now,
      settings: {
        ...DEFAULT_SETTINGS,
        ...options,
      },
      metadata: {
        projectName,
        mainRepoPath: projectPath,
        cliVersion: CURRENT_CONFIG_VERSION,
        platform: PlatformDetector.getPlatformName(),
        lastModified: now,
      },
    };

    await this.save(config);
    return config;
  }

  /**
   * Load configuration from file
   */
  public async load(): Promise<PrivateConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      const content = await this.fileSystem.readFile(this.configPath);
      const jsonConfig = JSON.parse(content);
      const validatedConfig = PrivateConfigJsonSchema.parse(jsonConfig);
      this.cachedConfig = validatedConfig;
      return validatedConfig;
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        throw new ConfigValidationError('Configuration data is invalid', error.message);
      }
      throw new ConfigError(
        'Failed to load configuration',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Save configuration to file
   */
  public async save(config: PrivateConfig): Promise<void> {
    try {
      // Validate configuration
      const validatedConfig = PrivateConfigSchema.parse(config);

      // Update last modified timestamp
      validatedConfig.metadata.lastModified = new Date();

      // Transform for JSON serialization
      const jsonConfig = this.transformToJson(validatedConfig);

      // Write to file
      const configContent = JSON.stringify(jsonConfig, null, 2);
      await this.fileSystem.writeFileAtomic(this.configPath, configContent);

      // Update cache
      this.cachedConfig = validatedConfig;
    } catch (error) {
      if (error instanceof ZodError) {
        // Extract specific validation error messages from ZodError
        const zodError = error as ZodError;
        const errors = zodError.issues || [];
        const errorMessages = errors.map((err: ZodIssue) => err.message);

        // If all errors are "Required", use generic message for better UX
        const allRequired =
          errors.length > 0 && errors.every((err: ZodIssue) => err.message === 'Required');
        const message = allRequired ? 'Configuration data is invalid' : errorMessages.join(', ');

        throw new ConfigValidationError(message, error.message);
      }

      throw new ConfigError(
        'Failed to save configuration',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Update git exclude settings
   */
  public async updateGitExcludeSettings(
    newSettings: Partial<GitExcludeSettings>,
  ): Promise<PrivateConfig> {
    const config = await this.load();
    config.settings.gitExclude = {
      ...config.settings.gitExclude,
      ...newSettings,
    };
    await this.save(config);
    return config;
  }

  /**
   * Get current git exclude settings
   */
  public async getGitExcludeSettings(): Promise<GitExcludeSettings> {
    const config = await this.load();
    return config.settings.gitExclude;
  }

  /**
   * Reset git exclude settings to defaults
   */
  public async resetGitExcludeSettings(): Promise<PrivateConfig> {
    const config = await this.load();
    config.settings.gitExclude = { ...DEFAULT_GIT_EXCLUDE_SETTINGS };
    await this.save(config);
    return config;
  }

  /**
   * Add a tracked path
   */
  public async addTrackedPath(filePath: string): Promise<void> {
    const config = await this.load();
    const normalizedPath = path.normalize(filePath);

    if (!config.trackedPaths.includes(normalizedPath)) {
      config.trackedPaths.push(normalizedPath);
      await this.save(config);
    }
  }

  /**
   * Remove a tracked path
   */
  public async removeTrackedPath(filePath: string): Promise<void> {
    const config = await this.load();
    const normalizedPath = path.normalize(filePath);
    const index = config.trackedPaths.indexOf(normalizedPath);

    if (index !== -1) {
      config.trackedPaths.splice(index, 1);
      await this.save(config);
    }
  }

  /**
   * Add multiple tracked paths
   */
  public async addMultipleTrackedPaths(filePaths: string[]): Promise<void> {
    const config = await this.load();
    const normalizedPaths = filePaths.map(fp => path.normalize(fp));
    const uniquePaths = normalizedPaths.filter(np => !config.trackedPaths.includes(np));

    if (uniquePaths.length > 0) {
      config.trackedPaths.push(...uniquePaths);
      await this.save(config);
    }
  }

  /**
   * Remove multiple tracked paths
   */
  public async removeMultipleTrackedPaths(filePaths: string[]): Promise<void> {
    const config = await this.load();
    const normalizedPaths = filePaths.map(fp => path.normalize(fp));
    const notTracked: string[] = [];

    for (const normalizedPath of normalizedPaths) {
      const index = config.trackedPaths.indexOf(normalizedPath);
      if (index !== -1) {
        config.trackedPaths.splice(index, 1);
      } else {
        notTracked.push(normalizedPath);
      }
    }

    if (notTracked.length > 0) {
      throw new ConfigError(`Some paths were not tracked: ${notTracked.join(', ')}`);
    }

    await this.save(config);
  }

  /**
   * Check if configuration exists
   */
  public async exists(): Promise<boolean> {
    return await this.fileSystem.isFile(this.configPath);
  }

  /**
   * Get cached configuration
   */
  public getCached(): PrivateConfig | undefined {
    return this.cachedConfig;
  }

  /**
   * Clear configuration cache
   */
  public clearCache(): void {
    this.cachedConfig = undefined;
  }

  /**
   * Get configuration file path
   */
  public getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Get configuration health status
   */
  public async getHealth(): Promise<ConfigHealth> {
    try {
      const exists = await this.exists();
      if (!exists) {
        return {
          exists: false,
          valid: false,
          errors: ['Configuration file does not exist'],
          needsMigration: false,
          currentVersion: '',
          targetVersion: CURRENT_CONFIG_VERSION,
        };
      }

      const config = await this.load();
      const needsMigration = config.version !== CURRENT_CONFIG_VERSION;
      return {
        exists: true,
        valid: true,
        errors: [],
        needsMigration,
        currentVersion: config.version,
        targetVersion: CURRENT_CONFIG_VERSION,
      };
    } catch (error) {
      return {
        exists: true,
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        needsMigration: false,
        currentVersion: '',
        targetVersion: CURRENT_CONFIG_VERSION,
      };
    }
  }

  /**
   * Transform configuration to JSON format
   */
  private transformToJson(config: PrivateConfig): Record<string, unknown> {
    return {
      version: config.version,
      privateRepoPath: config.privateRepoPath,
      storagePath: config.storagePath,
      trackedPaths: config.trackedPaths,
      initialized: config.initialized.toISOString(),
      lastCleanup: config.lastCleanup?.toISOString(),
      settings: config.settings,
      metadata: {
        projectName: config.metadata.projectName,
        mainRepoPath: config.metadata.mainRepoPath,
        cliVersion: config.metadata.cliVersion,
        platform: config.metadata.platform,
        lastModified: config.metadata.lastModified.toISOString(),
      },
    };
  }
}
