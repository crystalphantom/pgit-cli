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