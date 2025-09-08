/**
 * Configuration settings for the private git CLI
 */
export interface ConfigSettings {
  /** Automatically update .gitignore to exclude private files */
  autoGitignore: boolean;
  /** Automatically run cleanup operations */
  autoCleanup: boolean;
  /** Show verbose output in commands */
  verboseOutput: boolean;
  /** Backup configuration before making changes */
  createBackups: boolean;
  /** Maximum number of backup files to keep */
  maxBackups: number;
  /** Git exclude file management settings */
  gitExclude: GitExcludeSettings;
}

/**
 * Git exclude file management configuration
 */
export interface GitExcludeSettings {
  /** Enable/disable exclude file management */
  enabled: boolean;
  /** Custom marker comment for pgit-managed entries */
  markerComment: string;
  /** Fallback behavior when exclude operations are disabled */
  fallbackBehavior: 'warn' | 'silent' | 'error';
  /** Validate exclude file operations */
  validateOperations: boolean;
}

/**
 * Main configuration for private git tracking
 */
export interface PrivateConfig {
  /** Configuration version for migration support */
  version: string;
  /** Path to private repository metadata */
  privateRepoPath: string;
  /** Path to private files storage */
  storagePath: string;
  /** List of paths being tracked privately */
  trackedPaths: string[];
  /** When the system was initialized */
  initialized: Date;
  /** Last time cleanup was performed */
  lastCleanup?: Date;
  /** Configuration settings */
  settings: ConfigSettings;
  /** Project metadata */
  metadata: ProjectMetadata;
}

/**
 * Project metadata for tracking
 */
export interface ProjectMetadata {
  /** Project name (derived from directory name) */
  projectName: string;
  /** Main repository root path */
  mainRepoPath: string;
  /** CLI version that created this configuration */
  cliVersion: string;
  /** Platform this was created on */
  platform: string;
  /** Last modification time */
  lastModified: Date;
}

/**
 * Command execution result
 */
export interface CommandResult {
  /** Whether command succeeded */
  success: boolean;
  /** Success or error message */
  message?: string;
  /** Additional data from command execution */
  data?: unknown;
  /** Error details if command failed */
  error?: Error;
  /** Exit code for CLI */
  exitCode: number;
}

/**
 * Command options that can be passed to most commands
 */
export interface CommandOptions {
  /** Show verbose output */
  verbose?: boolean;
  /** Force operation without confirmations */
  force?: boolean;
  /** Commit message for git operations */
  message?: string;
  /** Dry run - show what would be done without doing it */
  dryRun?: boolean;
}

/**
 * Status information for repositories
 */
export interface RepositoryStatus {
  /** Repository type */
  type: 'main' | 'private';
  /** Current branch */
  branch: string;
  /** Whether repository is clean */
  isClean: boolean;
  /** Number of staged files */
  stagedFiles: number;
  /** Number of modified files */
  modifiedFiles: number;
  /** Number of untracked files */
  untrackedFiles: number;
  /** Number of deleted files */
  deletedFiles: number;
  /** Whether repository exists and is valid */
  exists: boolean;
  /** Any issues found with repository */
  issues: string[];
}

/**
 * Complete system status
 */
export interface SystemStatus {
  /** Is private git system initialized */
  initialized: boolean;
  /** Main repository status */
  mainRepo: RepositoryStatus;
  /** Private repository status */
  privateRepo: RepositoryStatus;
  /** Symbolic links health */
  symlinks: SymlinkHealth;
  /** Configuration health */
  config: ConfigHealth;
  /** Overall system health */
  isHealthy: boolean;
  /** System issues */
  issues: string[];
}

/**
 * Symbolic link health information
 */
export interface SymlinkHealth {
  /** Total number of tracked symbolic links */
  total: number;
  /** Number of healthy symbolic links */
  healthy: number;
  /** Number of broken symbolic links */
  broken: number;
  /** Details of broken links */
  brokenLinks: BrokenLink[];
}

/**
 * Information about a broken symbolic link
 */
export interface BrokenLink {
  /** Path to the symbolic link */
  linkPath: string;
  /** Target path that the link should point to */
  targetPath: string;
  /** Why the link is broken */
  reason: string;
  /** Whether this can be automatically repaired */
  repairable: boolean;
}

/**
 * Configuration health information
 */
export interface ConfigHealth {
  /** Whether configuration file exists */
  exists: boolean;
  /** Whether configuration is valid */
  valid: boolean;
  /** Configuration validation errors */
  errors: string[];
  /** Whether configuration needs migration */
  needsMigration: boolean;
  /** Current version */
  currentVersion: string;
  /** Target version for migration */
  targetVersion?: string;
}

/**
 * File tracking information
 */
export interface TrackedFile {
  /** Original path in project */
  originalPath: string;
  /** Path in private storage */
  storagePath: string;
  /** Whether file is currently a symbolic link */
  isSymlink: boolean;
  /** Whether the symbolic link is healthy */
  symlinkHealthy: boolean;
  /** When file was added to tracking */
  addedDate: Date;
  /** File size in bytes */
  size: number;
  /** Whether file is a directory */
  isDirectory: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

/**
 * Migration information
 */
export interface MigrationInfo {
  /** Source version */
  fromVersion: string;
  /** Target version */
  toVersion: string;
  /** Migration steps required */
  steps: MigrationStep[];
  /** Whether migration is required */
  required: boolean;
  /** Whether migration is safe to perform */
  safe: boolean;
}

/**
 * Individual migration step
 */
export interface MigrationStep {
  /** Step identifier */
  id: string;
  /** Human readable description */
  description: string;
  /** Whether step is destructive */
  destructive: boolean;
  /** Function to execute the step */
  execute: () => Promise<void>;
}

/**
 * Error information for better error reporting
 */
export interface ErrorInfo {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional details */
  details?: string;
  /** Recovery suggestion */
  suggestion?: string;
  /** Whether error is recoverable */
  recoverable: boolean;
  /** Stack trace */
  stack?: string;
}

/**
 * Default git exclude settings
 */
export const DEFAULT_GIT_EXCLUDE_SETTINGS: GitExcludeSettings = {
  enabled: true,
  markerComment: '# pgit-cli managed exclusions',
  fallbackBehavior: 'warn',
  validateOperations: true,
};

/**
 * Default configuration settings
 */
export const DEFAULT_SETTINGS: ConfigSettings = {
  autoGitignore: true,
  autoCleanup: true,
  verboseOutput: false,
  createBackups: true,
  maxBackups: 5,
  gitExclude: DEFAULT_GIT_EXCLUDE_SETTINGS,
};

/**
 * Default paths
 */
export const DEFAULT_PATHS = {
  privateRepo: '.git-private',
  storage: '.private-storage',
  config: '.private-config.json',
  gitignore: '.gitignore',
} as const;

/**
 * Current configuration version
 */
export const CURRENT_CONFIG_VERSION = '1.2.0';

/**
 * Supported file extensions for tracking
 */
export const SUPPORTED_EXTENSIONS = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.secrets',
  '.config',
  '.private',
] as const;

/**
 * Paths that should never be tracked
 */
export const EXCLUDED_PATHS = [
  '.git',
  '.git-private',
  '.private-storage',
  '.private-config.json',
  'node_modules',
  '.npm',
  '.cache',
  'dist',
  'build',
  'coverage',
] as const;
