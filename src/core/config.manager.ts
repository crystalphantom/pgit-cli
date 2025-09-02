import * as path from 'path';
import { 
  PrivateConfig, 
  ConfigSettings, 
  DEFAULT_SETTINGS, 
  DEFAULT_PATHS, 
  CURRENT_CONFIG_VERSION,
  ValidationResult,
  MigrationInfo,
  ConfigHealth
} from '../types/config.types';
import { 
  PrivateConfigSchema, 
  PrivateConfigJsonSchema
} from '../types/config.schema';
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
   * Load configuration from file
   */
  public async load(): Promise<PrivateConfig> {
    try {
      // Check if config exists
      if (!await this.exists()) {
        throw new ConfigError('Configuration file not found. Run "private init" first.');
      }

      // Read configuration file
      const configContent = await this.fileSystem.readFile(this.configPath);
      const configData = JSON.parse(configContent);

      // Validate and transform configuration
      const validatedConfig = PrivateConfigJsonSchema.parse(configData);
      const config = this.transformFromJson(validatedConfig);

      // Validate with full schema
      const finalConfig = PrivateConfigSchema.parse(config);

      // Cache the configuration
      this.cachedConfig = finalConfig;

      return finalConfig;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ConfigValidationError(
          'Configuration file is corrupted (invalid JSON)',
          error.message
        );
      }
      
      if (error instanceof Error && error.name === 'ZodError') {
        throw new ConfigValidationError(
          'Configuration file format is invalid',
          error.message
        );
      }

      if (error instanceof ConfigError) {
        throw error;
      }

      throw new ConfigError(
        'Failed to load configuration',
        error instanceof Error ? error.message : String(error)
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
      if (error instanceof Error && error.name === 'ZodError') {
        throw new ConfigValidationError(
          'Configuration data is invalid',
          error.message
        );
      }

      throw new ConfigError(
        'Failed to save configuration',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Create initial configuration
   */
  public async create(projectPath: string, options: Partial<ConfigSettings> = {}): Promise<PrivateConfig> {
    const projectName = path.basename(path.resolve(projectPath));
    const now = new Date();

    const config: PrivateConfig = {
      version: CURRENT_CONFIG_VERSION,
      privateRepoPath: DEFAULT_PATHS.privateRepo,
      storagePath: DEFAULT_PATHS.storage,
      trackedPaths: [],
      initialized: now,
      settings: { ...DEFAULT_SETTINGS, ...options },
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
   * Update configuration settings
   */
  public async updateSettings(newSettings: Partial<ConfigSettings>): Promise<PrivateConfig> {
    const config = await this.load();
    config.settings = { ...config.settings, ...newSettings };
    await this.save(config);
    return config;
  }

  /**
   * Add tracked path
   */
  public async addTrackedPath(filePath: string): Promise<PrivateConfig> {
    const config = await this.load();
    
    // Normalize path
    const normalizedPath = path.normalize(filePath);
    
    // Check if already tracked
    if (config.trackedPaths.includes(normalizedPath)) {
      throw new ConfigError(`Path is already tracked: ${normalizedPath}`);
    }

    config.trackedPaths.push(normalizedPath);
    await this.save(config);
    return config;
  }

  /**
   * Remove tracked path
   */
  public async removeTrackedPath(filePath: string): Promise<PrivateConfig> {
    const config = await this.load();
    
    // Normalize path
    const normalizedPath = path.normalize(filePath);
    
    // Find and remove path
    const index = config.trackedPaths.indexOf(normalizedPath);
    if (index === -1) {
      throw new ConfigError(`Path is not tracked: ${normalizedPath}`);
    }

    config.trackedPaths.splice(index, 1);
    await this.save(config);
    return config;
  }

  /**
   * Check if configuration file exists
   */
  public async exists(): Promise<boolean> {
    return this.fileSystem.pathExists(this.configPath);
  }

  /**
   * Validate configuration
   */
  public async validate(): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      if (!await this.exists()) {
        result.valid = false;
        result.errors.push('Configuration file does not exist');
        return result;
      }

      const config = await this.load();

      // Check version compatibility
      if (config.version !== CURRENT_CONFIG_VERSION) {
        result.warnings.push(`Configuration version ${config.version} differs from current version ${CURRENT_CONFIG_VERSION}`);
      }

      // Check paths exist
      const workingDir = path.dirname(this.configPath);
      const privateRepoPath = path.join(workingDir, config.privateRepoPath);
      const storagePath = path.join(workingDir, config.storagePath);

      if (!await this.fileSystem.pathExists(privateRepoPath)) {
        result.errors.push(`Private repository path does not exist: ${privateRepoPath}`);
        result.valid = false;
      }

      if (!await this.fileSystem.pathExists(storagePath)) {
        result.errors.push(`Storage path does not exist: ${storagePath}`);
        result.valid = false;
      }

      // Validate tracked paths
      for (const trackedPath of config.trackedPaths) {
        const fullPath = path.join(workingDir, trackedPath);
        const storagePath = path.join(workingDir, config.storagePath, trackedPath);
        
        if (!await this.fileSystem.pathExists(storagePath)) {
          result.warnings.push(`Tracked file missing in storage: ${trackedPath}`);
        }

        // Check if symbolic link exists and is valid
        if (await this.fileSystem.pathExists(fullPath)) {
          const stats = await this.fileSystem.getStats(fullPath);
          if (!stats.isSymbolicLink()) {
            result.warnings.push(`Tracked path is not a symbolic link: ${trackedPath}`);
          }
        } else {
          result.warnings.push(`Tracked symbolic link does not exist: ${trackedPath}`);
        }
      }

    } catch (error) {
      result.valid = false;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Get configuration health information
   */
  public async getHealth(): Promise<ConfigHealth> {
    const health: ConfigHealth = {
      exists: await this.exists(),
      valid: false,
      errors: [],
      needsMigration: false,
      currentVersion: '0.0.0',
    };

    if (!health.exists) {
      health.errors.push('Configuration file does not exist');
      return health;
    }

    try {
      const config = await this.load();
      health.currentVersion = config.version;
      health.needsMigration = config.version !== CURRENT_CONFIG_VERSION;
      
      if (health.needsMigration) {
        health.targetVersion = CURRENT_CONFIG_VERSION;
      }

      const validation = await this.validate();
      health.valid = validation.valid;
      health.errors = validation.errors;

    } catch (error) {
      health.errors.push(error instanceof Error ? error.message : String(error));
    }

    return health;
  }

  /**
   * Get migration information
   */
  public async getMigrationInfo(): Promise<MigrationInfo | null> {
    if (!await this.exists()) {
      return null;
    }

    try {
      const config = await this.load();
      
      if (config.version === CURRENT_CONFIG_VERSION) {
        return null; // No migration needed
      }

      return {
        fromVersion: config.version,
        toVersion: CURRENT_CONFIG_VERSION,
        steps: this.getMigrationSteps(config.version, CURRENT_CONFIG_VERSION),
        required: true,
        safe: this.isMigrationSafe(config.version, CURRENT_CONFIG_VERSION),
      };
    } catch (error) {
      throw new ConfigMigrationError(
        'Failed to get migration information',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Perform configuration migration
   */
  public async migrate(): Promise<PrivateConfig> {
    const migrationInfo = await this.getMigrationInfo();
    
    if (!migrationInfo) {
      throw new ConfigMigrationError('No migration needed or configuration not found');
    }

    if (!migrationInfo.safe) {
      throw new ConfigMigrationError('Migration is not safe to perform automatically');
    }

    try {
      // Create backup
      const backupPath = `${this.configPath}.backup.${Date.now()}`;
      const originalContent = await this.fileSystem.readFile(this.configPath);
      await this.fileSystem.writeFileAtomic(backupPath, originalContent);

      // Execute migration steps
      for (const step of migrationInfo.steps) {
        try {
          await step.execute();
        } catch (error) {
          // Restore backup on failure
          await this.fileSystem.writeFileAtomic(this.configPath, originalContent);
          throw new ConfigMigrationError(
            `Migration step '${step.id}' failed`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      // Reload and return migrated configuration
      this.cachedConfig = undefined; // Clear cache
      return await this.load();

    } catch (error) {
      if (error instanceof ConfigMigrationError) {
        throw error;
      }
      
      throw new ConfigMigrationError(
        'Migration failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get cached configuration (if available)
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
   * Transform configuration from JSON format
   */
  private transformFromJson(jsonConfig: any): PrivateConfig {
    return {
      ...jsonConfig,
      initialized: new Date(jsonConfig.initialized),
      lastCleanup: jsonConfig.lastCleanup ? new Date(jsonConfig.lastCleanup) : undefined,
      metadata: {
        ...jsonConfig.metadata,
        lastModified: new Date(jsonConfig.metadata.lastModified),
      },
    };
  }

  /**
   * Transform configuration to JSON format
   */
  private transformToJson(config: PrivateConfig): any {
    return {
      ...config,
      initialized: config.initialized.toISOString(),
      lastCleanup: config.lastCleanup?.toISOString(),
      metadata: {
        ...config.metadata,
        lastModified: config.metadata.lastModified.toISOString(),
      },
    };
  }

  /**
   * Get migration steps for version upgrade
   */
  private getMigrationSteps(fromVersion: string, toVersion: string): Array<{
    id: string;
    description: string;
    destructive: boolean;
    execute: () => Promise<void>;
  }> {
    // For now, we only have one version, but this would contain migration logic
    // for future version upgrades
    return [
      {
        id: 'update-version',
        description: `Update configuration version from ${fromVersion} to ${toVersion}`,
        destructive: false,
        execute: async () => {
          const config = await this.load();
          config.version = toVersion;
          await this.save(config);
        },
      },
    ];
  }

  /**
   * Check if migration is safe to perform automatically
   */
  private isMigrationSafe(_fromVersion: string, _toVersion: string): boolean {
    // For now, all migrations are considered safe
    // In the future, this would check for breaking changes
    return true;
  }
}