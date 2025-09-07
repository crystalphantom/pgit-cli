import { BaseError } from './base.error';

/**
 * Git repository related errors
 */
export class GitError extends BaseError {
  public readonly code = 'GIT_ERROR';
  public readonly recoverable = true;
}

/**
 * Repository not found errors
 */
export class RepositoryNotFoundError extends BaseError {
  public readonly code = 'REPOSITORY_NOT_FOUND';
  public readonly recoverable = false;
}

/**
 * Git operation failed errors
 */
export class GitOperationError extends BaseError {
  public readonly code = 'GIT_OPERATION_FAILED';
  public readonly recoverable = true;
}

/**
 * Repository corruption errors
 */
export class RepositoryCorruptionError extends BaseError {
  public readonly code = 'REPOSITORY_CORRUPTION';
  public readonly recoverable = false;
}

/**
 * Git index errors
 */
export class GitIndexError extends BaseError {
  public readonly code = 'GIT_INDEX_ERROR';
  public readonly recoverable = true;
}

/**
 * Git exclude file operation errors
 */
export class GitExcludeError extends BaseError {
  public readonly code: string;
  public readonly recoverable: boolean;
  public readonly affectedPaths: string[];
  public readonly operation: 'add' | 'remove' | 'read' | 'write';

  constructor(
    message: string,
    operation: 'add' | 'remove' | 'read' | 'write',
    affectedPaths: string[] = [],
    cause?: string,
    code = 'GIT_EXCLUDE_ERROR',
    recoverable = true,
  ) {
    super(message, cause);
    this.operation = operation;
    this.affectedPaths = affectedPaths;
    this.code = code;
    this.recoverable = recoverable;
  }
}

/**
 * Git exclude file access errors (permissions, file system issues)
 */
export class GitExcludeAccessError extends GitExcludeError {
  constructor(
    message: string,
    operation: 'add' | 'remove' | 'read' | 'write',
    affectedPaths: string[] = [],
    cause?: string,
  ) {
    super(message, operation, affectedPaths, cause, 'GIT_EXCLUDE_ACCESS_ERROR', false);
  }
}

/**
 * Git exclude file corruption errors
 */
export class GitExcludeCorruptionError extends GitExcludeError {
  constructor(
    message: string,
    operation: 'add' | 'remove' | 'read' | 'write',
    affectedPaths: string[] = [],
    cause?: string,
  ) {
    super(message, operation, affectedPaths, cause, 'GIT_EXCLUDE_CORRUPTION_ERROR', true);
  }
}

/**
 * Git exclude validation errors (invalid paths, duplicate entries)
 */
export class GitExcludeValidationError extends GitExcludeError {
  constructor(
    message: string,
    operation: 'add' | 'remove' | 'read' | 'write',
    affectedPaths: string[] = [],
    cause?: string,
  ) {
    super(message, operation, affectedPaths, cause, 'GIT_EXCLUDE_VALIDATION_ERROR', true);
  }
}
