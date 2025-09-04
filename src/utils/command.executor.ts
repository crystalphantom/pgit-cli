import { exec } from 'child_process';
import * as util from 'util';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execAsync = (util as any).promisify(exec);

/**
 * Command execution error with additional properties
 */
interface ExecutionError extends Error {
  code?: number;
  stdout?: string;
  stderr?: string;
}

/**
 * Command execution result
 */
export interface CommandResult {
  /** Exit code of the command */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error output */
  stderr: string;
  /** Command that was executed */
  command: string;
}

/**
 * Execute a shell command and return the result
 */
export async function run_in_terminal(command: string): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execAsync(command);

    return {
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      command,
    };
  } catch (error) {
    // Handle execution errors
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'stdout' in error &&
      'stderr' in error
    ) {
      const execError = error as ExecutionError;
      return {
        exitCode: execError.code || 1,
        stdout: execError.stdout?.trim() || '',
        stderr: execError.stderr?.trim() || '',
        command,
      };
    }

    return {
      exitCode: 1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      command,
    };
  }
}
