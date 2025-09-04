/**
 * Base error class for all private git CLI errors
 */
export abstract class BaseError extends Error {
  public abstract readonly code: string;
  public abstract readonly recoverable: boolean;

  constructor(
    message: string,
    // eslint-disable-next-line no-unused-vars
    public readonly details?: string,
  ) {
    super(message);
    this.name = this.constructor.name;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON representation
   */
  public toJSON(): Record<string, unknown> {
    return {
      error: true,
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      recoverable: this.recoverable,
      stack: this.stack,
    };
  }
}
