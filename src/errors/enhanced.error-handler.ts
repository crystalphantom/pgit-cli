import chalk from 'chalk';
import { BaseError } from './base.error';

/**
 * Recovery suggestion interface
 */
export interface RecoverySuggestion {
  action: string;
  command?: string;
  description: string;
  automated?: boolean;
}

/**
 * Error context interface
 */
export interface ErrorContext {
  command?: string;
  workingDir?: string;
  args?: string[];
  timestamp?: Date;
  environment?: Record<string, string>;
}

/**
 * Enhanced error handler with recovery suggestions and user guidance
 */
export class EnhancedErrorHandler {
  /**
   * Handle error with enhanced output and recovery suggestions
   */
  public static handleError(error: unknown, context?: ErrorContext): void {
    console.log(); // Add spacing

    if (error instanceof BaseError) {
      this.handleBaseError(error, context);
    } else if (error instanceof Error) {
      this.handleGenericError(error, context);
    } else {
      this.handleUnknownError(error, context);
    }

    this.displayTroubleshootingTips(context);
  }

  /**
   * Handle BaseError instances with specific recovery suggestions
   */
  private static handleBaseError(error: BaseError, context?: ErrorContext): void {
    console.error(chalk.red.bold('❌ Error'));
    console.error(chalk.red(`   ${error.message}`));

    if (error.details) {
      console.error(chalk.gray(`   Details: ${error.details}`));
    }

    if (context?.command) {
      console.error(chalk.gray(`   Command: ${context.command}`));
    }

    // Get recovery suggestions based on error type
    const suggestions = this.getRecoverySuggestions(error, context);
    if (suggestions.length > 0) {
      console.log();
      console.log(chalk.yellow.bold('💡 Recovery Suggestions:'));
      suggestions.forEach((suggestion, index) => {
        console.log(`   ${index + 1}. ${chalk.cyan(suggestion.action)}`);
        console.log(`      ${chalk.gray(suggestion.description)}`);
        if (suggestion.command) {
          console.log(`      ${chalk.green('Run:')} ${chalk.white(suggestion.command)}`);
        }
      });
    }

    if (error.recoverable) {
      console.log();
      console.log(chalk.yellow('⚠️  This error might be recoverable. Try the suggestions above.'));
    }

    if (process.env['NODE_ENV'] === 'development' && error.stack) {
      console.log();
      console.log(chalk.gray('Debug Stack Trace:'));
      console.error(chalk.gray(error.stack));
    }
  }

  /**
   * Handle generic Error instances
   */
  private static handleGenericError(error: Error, context?: ErrorContext): void {
    console.error(chalk.red.bold('❌ Unexpected Error'));
    console.error(chalk.red(`   ${error.message}`));

    if (context?.command) {
      console.error(chalk.gray(`   Command: ${context.command}`));
    }

    // Provide generic recovery suggestions
    const suggestions = this.getGenericRecoverySuggestions(error, context);
    if (suggestions.length > 0) {
      console.log();
      console.log(chalk.yellow.bold('💡 General Suggestions:'));
      suggestions.forEach((suggestion, index) => {
        console.log(`   ${index + 1}. ${chalk.cyan(suggestion.action)}`);
        console.log(`      ${chalk.gray(suggestion.description)}`);
        if (suggestion.command) {
          console.log(`      ${chalk.green('Run:')} ${chalk.white(suggestion.command)}`);
        }
      });
    }

    if (process.env['NODE_ENV'] === 'development' && error.stack) {
      console.log();
      console.log(chalk.gray('Debug Stack Trace:'));
      console.error(chalk.gray(error.stack));
    }
  }

  /**
   * Handle unknown error types
   */
  private static handleUnknownError(error: unknown, context?: ErrorContext): void {
    console.error(chalk.red.bold('❌ Unknown Error'));
    console.error(chalk.red(`   ${String(error)}`));

    if (context?.command) {
      console.error(chalk.gray(`   Command: ${context.command}`));
    }

    console.log();
    console.log(chalk.yellow.bold('💡 General Suggestions:'));
    console.log(`   1. ${chalk.cyan('Check your input parameters')}`);
    console.log(`      ${chalk.gray('Ensure all required arguments are provided correctly')}`);
    console.log(`   2. ${chalk.cyan('Verify system requirements')}`);
    console.log(
      `      ${chalk.gray('Make sure Node.ts version is >= 18.0.0 and git is available')}`,
    );
    console.log(`   3. ${chalk.cyan('Run system diagnostics')}`);
    console.log(`      ${chalk.green('Run:')} ${chalk.white('private status -v')}`);
  }

  /**
   * Get recovery suggestions based on error type and code
   */
  private static getRecoverySuggestions(
    error: BaseError,
    _context?: ErrorContext,
  ): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];

    switch (error.code) {
      case 'NOT_INITIALIZED':
        suggestions.push({
          action: 'Initialize private git tracking',
          command: 'private init',
          description: 'Set up private file tracking in the current directory',
        });
        break;

      case 'PATH_NOT_FOUND':
        suggestions.push({
          action: 'Check file path',
          description: 'Verify the file or directory exists and the path is correct',
        });
        suggestions.push({
          action: 'List directory contents',
          command: 'ls -la',
          description: 'See all files and directories in the current location',
        });
        break;

      case 'ALREADY_TRACKED':
        suggestions.push({
          action: 'Check tracked files',
          command: 'private status',
          description: 'See which files are currently being tracked privately',
        });
        suggestions.push({
          action: 'Remove from tracking',
          command: 'private cleanup --force',
          description: 'Remove the file from private tracking if needed',
        });
        break;

      case 'SYMLINK_NOT_SUPPORTED':
        suggestions.push({
          action: 'Check platform support',
          description:
            'Symbolic links may not be supported on this platform or require elevated permissions',
        });
        if (process.platform === 'win32') {
          suggestions.push({
            action: 'Enable Developer Mode (Windows)',
            description: 'Go to Settings > Update & Security > For developers > Developer Mode',
          });
        }
        break;

      case 'GIT_OPERATION_FAILED':
        suggestions.push({
          action: 'Check git installation',
          command: 'git --version',
          description: 'Verify git is installed and accessible',
        });
        suggestions.push({
          action: 'Check repository health',
          command: 'private status -v',
          description: 'Diagnose potential repository issues',
        });
        suggestions.push({
          action: 'Run system repair',
          command: 'private cleanup -v',
          description: 'Attempt to repair any repository issues',
        });
        break;

      case 'FILESYSTEM_ERROR':
        suggestions.push({
          action: 'Check file permissions',
          description: 'Ensure you have read/write access to the files and directories',
        });
        suggestions.push({
          action: 'Check disk space',
          command: 'df -h .',
          description: 'Verify there is sufficient disk space available',
        });
        break;

      case 'CONFIG_VALIDATION_FAILED':
        suggestions.push({
          action: 'Reset configuration',
          command: 'private init --force',
          description: 'Reinitialize private git tracking with fresh configuration',
        });
        suggestions.push({
          action: 'Manual cleanup',
          description: 'Remove .private-config.tson and reinitialize',
        });
        break;

      default:
        // Generic suggestions for unknown error codes
        suggestions.push({
          action: 'Run diagnostics',
          command: 'private status -v',
          description: 'Check the overall health of your private git setup',
        });
        suggestions.push({
          action: 'Try system repair',
          command: 'private cleanup -v',
          description: 'Attempt automatic repair of common issues',
        });
        break;
    }

    return suggestions;
  }

  /**
   * Get generic recovery suggestions for non-BaseError instances
   */
  private static getGenericRecoverySuggestions(
    error: Error,
    _context?: ErrorContext,
  ): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];

    // Check for common error patterns
    if (error.message.includes('ENOENT')) {
      suggestions.push({
        action: 'Check file or directory exists',
        description: 'The specified path was not found',
      });
    } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
      suggestions.push({
        action: 'Check file permissions',
        description: 'You may not have sufficient permissions to access this file/directory',
      });
    } else if (error.message.includes('ENOSPC')) {
      suggestions.push({
        action: 'Free up disk space',
        description: 'The disk appears to be full',
      });
    } else if (error.message.includes('git')) {
      suggestions.push({
        action: 'Check git installation',
        command: 'git --version',
        description: 'Verify git is properly installed and configured',
      });
    }

    // Always add general suggestions
    suggestions.push({
      action: 'Run system diagnostics',
      command: 'private status -v',
      description: 'Check the health of your private git setup',
    });

    return suggestions;
  }

  /**
   * Display general troubleshooting tips
   */
  private static displayTroubleshootingTips(_context?: ErrorContext): void {
    console.log();
    console.log(chalk.blue.bold('🔧 General Troubleshooting Tips:'));
    console.log('   • Run ' + chalk.white('private status -v') + ' to check system health');
    console.log('   • Use ' + chalk.white('private cleanup -v') + ' to repair common issues');
    console.log('   • Check ' + chalk.white('private --help') + ' for command usage');
    console.log('   • Ensure you are in a git repository directory');
    console.log('   • Verify file paths are relative to the current directory');

    if (process.platform === 'win32') {
      console.log('   • On Windows, ensure Developer Mode is enabled for symbolic links');
    }

    console.log();
    console.log(chalk.gray('For more help, visit the documentation or file an issue.'));
  }

  /**
   * Create error context from command information
   */
  public static createContext(
    command?: string,
    args?: string[],
    workingDir?: string,
  ): ErrorContext {
    return {
      command,
      args,
      workingDir: workingDir || process.cwd(),
      timestamp: new Date(),
      environment: {
        NODE_ENV: process.env['NODE_ENV'] || 'production',
        PLATFORM: process.platform,
        NODE_VERSION: process.version,
      },
    };
  }

  /**
   * Format error for logging
   */
  public static formatForLog(error: unknown, context?: ErrorContext): string {
    const timestamp = new Date().toISOString();
    const errorInfo =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : { message: String(error) };

    return JSON.stringify(
      {
        timestamp,
        context,
        error: errorInfo,
      },
      null,
      2,
    );
  }
}
