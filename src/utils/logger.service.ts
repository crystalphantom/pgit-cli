import chalk from 'chalk';

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

class LoggerService {
  private level: LogLevel = LogLevel.INFO;

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  public error(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.ERROR) {
      console.error(chalk.red('❌ Error:'), message, ...args);
    }
  }

  public warn(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.WARN) {
      console.warn(chalk.yellow('⚠️ Warn:'), message, ...args);
    }
  }

  public info(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.INFO) {
      console.log(message, ...args);
    }
  }

  public debug(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.DEBUG) {
      console.log(chalk.gray('🔍 Debug:'), message, ...args);
    }
  }

  public success(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.INFO) {
      console.log(chalk.green('✅ Success:'), message, ...args);
    }
  }
}

export const logger = new LoggerService();
