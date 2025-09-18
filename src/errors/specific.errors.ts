import { BaseError } from './base.error.js';

/**
 * System initialization errors
 */
export class InitializationError extends BaseError {
  public readonly code = 'INITIALIZATION_ERROR';
  public readonly recoverable = true;
}

export class AlreadyInitializedError extends BaseError {
  public readonly code = 'ALREADY_INITIALIZED';
  public readonly recoverable = false;
}

/**
 * File system and path errors
 */
export class PathNotFoundError extends BaseError {
  public readonly code = 'PATH_NOT_FOUND';
  public readonly recoverable = false;
}

export class PathAccessError extends BaseError {
  public readonly code = 'PATH_ACCESS_ERROR';
  public readonly recoverable = true;
}

export class DiskSpaceError extends BaseError {
  public readonly code = 'DISK_SPACE_ERROR';
  public readonly recoverable = true;
}

export class FilePermissionError extends BaseError {
  public readonly code = 'FILE_PERMISSION_ERROR';
  public readonly recoverable = true;
}

/**
 * Git operation errors
 */
export class GitNotFoundError extends BaseError {
  public readonly code = 'GIT_NOT_FOUND';
  public readonly recoverable = true;
}

export class GitOperationFailedError extends BaseError {
  public readonly code = 'GIT_OPERATION_FAILED';
  public readonly recoverable = true;
}

export class GitRepositoryNotFoundError extends BaseError {
  public readonly code = 'GIT_REPOSITORY_NOT_FOUND';
  public readonly recoverable = true;
}

export class GitIndexCorruptedError extends BaseError {
  public readonly code = 'GIT_INDEX_CORRUPTED';
  public readonly recoverable = true;
}

/**
 * Configuration errors
 */
export class ConfigValidationFailedError extends BaseError {
  public readonly code = 'CONFIG_VALIDATION_FAILED';
  public readonly recoverable = true;
}

export class ConfigCorruptedError extends BaseError {
  public readonly code = 'CONFIG_CORRUPTED';
  public readonly recoverable = true;
}

export class ConfigMigrationError extends BaseError {
  public readonly code = 'CONFIG_MIGRATION_ERROR';
  public readonly recoverable = true;
}

/**
 * Symbolic link errors
 */
export class SymlinkNotSupportedError extends BaseError {
  public readonly code = 'SYMLINK_NOT_SUPPORTED';
  public readonly recoverable = false;
}

export class SymlinkCreationFailedError extends BaseError {
  public readonly code = 'SYMLINK_CREATION_FAILED';
  public readonly recoverable = true;
}

export class SymlinkBrokenError extends BaseError {
  public readonly code = 'SYMLINK_BROKEN';
  public readonly recoverable = true;
}

/**
 * Tracking errors
 */
export class AlreadyTrackedError extends BaseError {
  public readonly code = 'ALREADY_TRACKED';
  public readonly recoverable = false;
}

export class NotTrackedError extends BaseError {
  public readonly code = 'NOT_TRACKED';
  public readonly recoverable = false;
}

export class TrackingCorruptedError extends BaseError {
  public readonly code = 'TRACKING_CORRUPTED';
  public readonly recoverable = true;
}

/**
 * Platform and environment errors
 */
export class PlatformNotSupportedError extends BaseError {
  public readonly code = 'PLATFORM_NOT_SUPPORTED';
  public readonly recoverable = false;
}

export class NodeVersionError extends BaseError {
  public readonly code = 'NODE_VERSION_ERROR';
  public readonly recoverable = false;
}

export class EnvironmentError extends BaseError {
  public readonly code = 'ENVIRONMENT_ERROR';
  public readonly recoverable = true;
}

/**
 * Network and external errors
 */
export class NetworkError extends BaseError {
  public readonly code = 'NETWORK_ERROR';
  public readonly recoverable = true;
}

export class ExternalCommandError extends BaseError {
  public readonly code = 'EXTERNAL_COMMAND_ERROR';
  public readonly recoverable = true;
}

/**
 * User input errors
 */
export class InvalidInputError extends BaseError {
  public readonly code = 'INVALID_INPUT';
  public readonly recoverable = false;
}

export class MissingArgumentError extends BaseError {
  public readonly code = 'MISSING_ARGUMENT';
  public readonly recoverable = false;
}

export class InvalidArgumentError extends BaseError {
  public readonly code = 'INVALID_ARGUMENT';
  public readonly recoverable = false;
}

/**
 * Security errors
 */
export class SecurityError extends BaseError {
  public readonly code = 'SECURITY_ERROR';
  public readonly recoverable = false;
}

export class UnsafePathError extends BaseError {
  public readonly code = 'UNSAFE_PATH';
  public readonly recoverable = false;
}

/**
 * Operation timeout and resource errors
 */
export class OperationTimeoutError extends BaseError {
  public readonly code = 'OPERATION_TIMEOUT';
  public readonly recoverable = true;
}

export class ResourceBusyError extends BaseError {
  public readonly code = 'RESOURCE_BUSY';
  public readonly recoverable = true;
}

/**
 * Error factory for creating appropriate error types
 */
export class ErrorFactory {
  /**
   * Create error from system error codes
   */
  public static fromSystemError(error: NodeJS.ErrnoException, context?: string): BaseError {
    const message = error.message || 'Unknown system error';
    const details = context ? `Context: ${context}` : undefined;

    switch (error.code) {
      case 'ENOENT':
        return new PathNotFoundError(message, details);
      case 'EACCES':
      case 'EPERM':
        return new FilePermissionError(message, details);
      case 'ENOSPC':
        return new DiskSpaceError(message, details);
      case 'EBUSY':
        return new ResourceBusyError(message, details);
      case 'ETIMEDOUT':
        return new OperationTimeoutError(message, details);
      default:
        return new EnvironmentError(message, details);
    }
  }

  /**
   * Create error from git operation failures
   */
  public static fromGitError(error: Error, operation: string): BaseError {
    const message = `Git operation failed: ${operation}`;
    const details = error.message;

    if (error.message.includes('not a git repository')) {
      return new GitRepositoryNotFoundError(message, details);
    } else if (error.message.includes('git: command not found')) {
      return new GitNotFoundError('Git is not installed or not in PATH', details);
    } else if (error.message.includes('index')) {
      return new GitIndexCorruptedError(message, details);
    } else {
      return new GitOperationFailedError(message, details);
    }
  }

  /**
   * Create error for validation failures
   */
  public static fromValidationError(
    field: string,
    value: unknown,
    expectedType: string,
  ): BaseError {
    const message = `Invalid ${field}: expected ${expectedType}`;
    const details = `Received: ${typeof value} (${String(value)})`;
    return new InvalidInputError(message, details);
  }

  /**
   * Create error for missing required arguments
   */
  public static missingArgument(argumentName: string, command: string): BaseError {
    const message = `Missing required argument: ${argumentName}`;
    const details = `Command: ${command}`;
    return new MissingArgumentError(message, details);
  }

  /**
   * Create error for unsafe path operations
   */
  public static unsafePath(path: string, reason: string): BaseError {
    const message = `Unsafe path operation: ${path}`;
    const details = `Reason: ${reason}`;
    return new UnsafePathError(message, details);
  }
}
