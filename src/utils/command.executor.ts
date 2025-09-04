import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
      return {
        exitCode: (error as any).code || 1,
        stdout: (error as any).stdout?.trim() || '',
        stderr: (error as any).stderr?.trim() || '',
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
