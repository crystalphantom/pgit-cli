import * as path from 'node:path';
import chalk from 'chalk';
import { CommandResult, CommandOptions, DEFAULT_PATHS } from '../types/config.types.ts';
import { ConfigManager } from '../core/config.manager.ts';
import { FileSystemService } from '../core/filesystem.service.ts';
import { GitService } from '../core/git.service.ts';
import { PlatformDetector } from '../utils/platform.detector.ts';
import { BaseError } from '../errors/base.error.ts';

/**
 * Init command specific errors
 */
export class InitError extends BaseError {
  public readonly code = 'INIT_ERROR';
  public readonly recoverable = true;
}

export class AlreadyInitializedError extends BaseError {
  public readonly code = 'ALREADY_INITIALIZED';
  public readonly recoverable = false;
}

/**
 * Initialize private git tracking command
 */
export class InitCommand {
  private readonly workingDir: string;
  private readonly fileSystem: FileSystemService;
  private readonly configManager: ConfigManager;

  constructor(workingDir?: string) {
    this.workingDir = workingDir || process.cwd();
    this.fileSystem = new FileSystemService();
    this.configManager = new ConfigManager(this.workingDir, this.fileSystem);
  }

  /**
   * Execute the init command
   */
  public async execute(options: CommandOptions = {}): Promise<CommandResult> {
    try {
      if (options.verbose) {
        console.log(chalk.blue('🔧 Initializing private git tracking...'));
      }

      // Check if already initialized
      await this.checkNotAlreadyInitialized();

      // Validate environment
      await this.validateEnvironment(options.verbose);

      // Create directory structure
      await this.createDirectoryStructure(options.verbose);

      // Initialize private git repository
      await this.initializePrivateRepository(options.verbose);

      // Create configuration
      await this.createConfiguration(options.verbose);

      // Update .gitignore
      await this.updateGitignore(options.verbose);

      // Create initial commit in private repository
      await this.createInitialCommit(options.verbose);

      return {
        success: true,
        message: 'Private git tracking initialized successfully',
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
        message: 'Failed to initialize private git tracking',
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Check if private git tracking is already initialized
   */
  private async checkNotAlreadyInitialized(): Promise<void> {
    if (await this.configManager.exists()) {
      throw new AlreadyInitializedError(
        'Private git tracking is already initialized in this directory. Use "private status" to check current state.',
      );
    }

    // Check if directories already exist
    const privateRepoPath = path.join(this.workingDir, DEFAULT_PATHS.privateRepo);
    const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage);

    if (await this.fileSystem.pathExists(privateRepoPath)) {
      throw new AlreadyInitializedError(
        `Private repository directory already exists: ${DEFAULT_PATHS.privateRepo}`,
      );
    }

    if (await this.fileSystem.pathExists(storagePath)) {
      throw new AlreadyInitializedError(
        `Private storage directory already exists: ${DEFAULT_PATHS.storage}`,
      );
    }
  }

  /**
   * Validate the environment before initialization
   */
  private async validateEnvironment(verbose?: boolean): Promise<void> {
    if (verbose) {
      console.log(chalk.gray('   Validating environment...'));
    }

    // Check if current directory is a git repository
    const mainGitService = new GitService(this.workingDir, this.fileSystem);
    if (!(await mainGitService.isRepository())) {
      throw new InitError(
        'Current directory is not a git repository. Please run "git init" first or navigate to a git repository.',
      );
    }

    // Check symbolic link support
    const supportsSymlinks = await PlatformDetector.supportsSymlinks();
    if (!supportsSymlinks) {
      console.log(
        chalk.yellow(
          '⚠️  Warning: Your system may not support symbolic links. Some features may not work correctly.',
        ),
      );

      if (PlatformDetector.isWindows()) {
        console.log(
          chalk.yellow(
            '   On Windows, you may need to run as Administrator or enable Developer Mode.',
          ),
        );
      }
    }

    // Check write permissions
    const permissions = await PlatformDetector.checkPermissions(this.workingDir);
    if (!permissions.writable) {
      throw new InitError('Cannot write to current directory. Please check permissions.');
    }

    if (verbose) {
      console.log(chalk.green('   ✓ Environment validation passed'));
    }
  }

  /**
   * Create the directory structure for private git tracking
   */
  private async createDirectoryStructure(verbose?: boolean): Promise<void> {
    if (verbose) {
      console.log(chalk.gray('   Creating directory structure...'));
    }

    const privateRepoPath = path.join(this.workingDir, DEFAULT_PATHS.privateRepo);
    const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage);

    try {
      // Create private repository directory
      await this.fileSystem.createDirectory(privateRepoPath);
      if (verbose) {
        console.log(chalk.gray(`   ✓ Created ${DEFAULT_PATHS.privateRepo}/`));
      }

      // Create private storage directory
      await this.fileSystem.createDirectory(storagePath);
      if (verbose) {
        console.log(chalk.gray(`   ✓ Created ${DEFAULT_PATHS.storage}/`));
      }
    } catch (error) {
      throw new InitError(
        'Failed to create directory structure',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Initialize the private git repository
   */
  private async initializePrivateRepository(verbose?: boolean): Promise<void> {
    if (verbose) {
      console.log(chalk.gray('   Initializing private git repository...'));
    }

    try {
      const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
      const privateGitService = new GitService(storagePath, this.fileSystem);

      // Initialize git repository in storage directory
      await privateGitService.initRepository();

      if (verbose) {
        console.log(chalk.green('   ✓ Private git repository initialized'));
      }
    } catch (error) {
      throw new InitError(
        'Failed to initialize private git repository',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Create the initial configuration
   */
  private async createConfiguration(verbose?: boolean): Promise<void> {
    if (verbose) {
      console.log(chalk.gray('   Creating configuration...'));
    }

    try {
      await this.configManager.create(this.workingDir);

      if (verbose) {
        console.log(chalk.green(`   ✓ Configuration created: ${DEFAULT_PATHS.config}`));
      }
    } catch (error) {
      throw new InitError(
        'Failed to create configuration',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Update .gitignore to exclude private system files
   */
  private async updateGitignore(verbose?: boolean): Promise<void> {
    if (verbose) {
      console.log(chalk.gray('   Updating .gitignore...'));
    }

    try {
      const gitignorePath = path.join(this.workingDir, DEFAULT_PATHS.gitignore);

      // Read existing .gitignore or create empty content
      let gitignoreContent = '';
      if (await this.fileSystem.pathExists(gitignorePath)) {
        gitignoreContent = await this.fileSystem.readFile(gitignorePath);
      }

      // Define private git entries
      const privateEntries = [
        '',
        '# Private Git Tracking (auto-generated)',
        DEFAULT_PATHS.privateRepo,
        DEFAULT_PATHS.storage,
        DEFAULT_PATHS.config,
        '',
      ];

      // Check if entries already exist
      const entriesToAdd: string[] = [];
      for (const entry of privateEntries) {
        if (entry.trim() && !gitignoreContent.includes(entry)) {
          entriesToAdd.push(entry);
        }
      }

      // Add entries if needed
      if (entriesToAdd.length > 0) {
        if (gitignoreContent && !gitignoreContent.endsWith('\n')) {
          gitignoreContent += '\n';
        }
        gitignoreContent += entriesToAdd.join('\n');

        await this.fileSystem.writeFileAtomic(gitignorePath, gitignoreContent);

        if (verbose) {
          console.log(chalk.green('   ✓ Updated .gitignore with private git exclusions'));
        }
      } else if (verbose) {
        console.log(chalk.gray('   ✓ .gitignore already contains private git exclusions'));
      }
    } catch (error) {
      // This is not critical, so we log a warning but don't fail
      console.log(
        chalk.yellow(
          `   ⚠️  Warning: Could not update .gitignore: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Create initial commit in private repository
   */
  private async createInitialCommit(verbose?: boolean): Promise<void> {
    if (verbose) {
      console.log(chalk.gray('   Creating initial commit in private repository...'));
    }

    try {
      const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
      const privateGitService = new GitService(storagePath, this.fileSystem);

      // Create initial README file
      const readmePath = path.join(storagePath, 'README.md');
      const readmeContent = `# Private Files Storage

This directory contains private files that are excluded from the main repository.

- Initialized: ${new Date().toISOString()}
- Platform: ${PlatformDetector.getPlatformName()}
- CLI Version: 1.0.0

Do not modify this directory manually. Use the \`private\` CLI commands instead.
`;

      await this.fileSystem.writeFileAtomic(readmePath, readmeContent);

      // Add and commit the README
      await privateGitService.addFiles(['README.md']);
      const commitHash = await privateGitService.commit(
        'Initial commit: Private files storage initialized',
      );

      if (verbose) {
        console.log(chalk.green(`   ✓ Initial commit created: ${commitHash.substring(0, 8)}`));
      }
    } catch (error) {
      throw new InitError(
        'Failed to create initial commit',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
