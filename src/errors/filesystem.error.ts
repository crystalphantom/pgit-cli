import { BaseError } from './base.error.ts';

/**
 * File system related errors
 */
export class FileSystemError extends BaseError {
  public readonly code = 'FILESYSTEM_ERROR';
  public readonly recoverable = true;
}

/**
 * Path validation errors
 */
export class InvalidPathError extends BaseError {
  public readonly code = 'INVALID_PATH';
  public readonly recoverable = true;
}

/**
 * Permission denied errors
 */
export class PermissionError extends BaseError {
  public readonly code = 'PERMISSION_DENIED';
  public readonly recoverable = true;
}

/**
 * File not found errors
 */
export class FileNotFoundError extends BaseError {
  public readonly code = 'FILE_NOT_FOUND';
  public readonly recoverable = true;
}

/**
 * Atomic operation failure
 */
export class AtomicOperationError extends BaseError {
  public readonly code = 'ATOMIC_OPERATION_FAILED';
  public readonly recoverable = true;
}
