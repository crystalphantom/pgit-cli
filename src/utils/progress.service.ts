import chalk from 'chalk';

/**
 * Progress indicator types
 */
export type ProgressType = 'spinner' | 'bar' | 'dots' | 'simple';

/**
 * Progress step interface
 */
export interface ProgressStep {
  id: string;
  message: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  details?: string;
  startTime?: Date;
  endTime?: Date;
}

/**
 * Progress service for enhanced user experience
 */
export class ProgressService {
  private readonly steps: Map<string, ProgressStep> = new Map();
  private currentStep?: string;
  // eslint-disable-next-line @typescript-eslint/prefer-readonly
  private verbose = false;

  private intervalId?: NodeJS.Timeout;
  private spinnerFrame = 0;

  // Spinner frames
  private static readonly SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  /**
   * Add a step to the progress tracker
   */
  public addStep(id: string, message: string): void {
    this.steps.set(id, {
      id,
      message,
      status: 'pending',
    });
  }

  /**
   * Add multiple steps at once
   */
  public addSteps(steps: Array<{ id: string; message: string }>): void {
    steps.forEach(step => this.addStep(step.id, step.message));
  }

  /**
   * Start a step
   */
  public startStep(id: string): void {
    const step = this.steps.get(id);
    if (!step) {
      throw new Error(`Step ${id} not found`);
    }

    step.status = 'running';
    step.startTime = new Date();
    this.currentStep = id;

    if (this.verbose) {
      console.log(chalk.blue(`⏳ ${step.message}...`));
    } else {
      this.startSpinner(step.message);
    }
  }

  /**
   * Complete a step with success
   */
  public completeStep(id: string, details?: string): void {
    const step = this.steps.get(id);
    if (!step) {
      throw new Error(`Step ${id} not found`);
    }

    step.status = 'success';
    step.endTime = new Date();
    step.details = details;

    if (this.currentStep === id) {
      this.stopSpinner();
      this.currentStep = undefined;
    }

    if (this.verbose) {
      const duration = step.startTime
        ? ` (${this.getDuration(step.startTime, step.endTime!)})`
        : '';
      console.log(chalk.green(`✓ ${step.message}${duration}`));
      if (details) {
        console.log(chalk.gray(`  ${details}`));
      }
    } else {
      console.log(chalk.green(`✓ ${step.message}`));
    }
  }

  /**
   * Fail a step with error
   */
  public failStep(id: string, error: string): void {
    const step = this.steps.get(id);
    if (!step) {
      throw new Error(`Step ${id} not found`);
    }

    step.status = 'error';
    step.endTime = new Date();
    step.details = error;

    if (this.currentStep === id) {
      this.stopSpinner();
      this.currentStep = undefined;
    }

    if (this.verbose) {
      const duration = step.startTime
        ? ` (${this.getDuration(step.startTime, step.endTime!)})`
        : '';
      console.log(chalk.red(`✗ ${step.message}${duration}`));
      console.log(chalk.gray(`  ${error}`));
    } else {
      console.log(chalk.red(`✗ ${step.message}`));
    }
  }

  /**
   * Skip a step
   */
  public skipStep(id: string, reason?: string): void {
    const step = this.steps.get(id);
    if (!step) {
      throw new Error(`Step ${id} not found`);
    }

    step.status = 'skipped';
    step.details = reason;

    if (this.verbose) {
      console.log(chalk.yellow(`⊝ ${step.message} (skipped)`));
      if (reason) {
        console.log(chalk.gray(`  ${reason}`));
      }
    } else {
      console.log(chalk.yellow(`⊝ ${step.message}`));
    }
  }

  /**
   * Update step message during execution
   */
  public updateStep(id: string, message: string): void {
    const step = this.steps.get(id);
    if (!step) {
      throw new Error(`Step ${id} not found`);
    }

    step.message = message;

    if (this.currentStep === id && !this.verbose) {
      // Update spinner message
      this.stopSpinner();
      this.startSpinner(message);
    }
  }

  /**
   * Show summary of all steps
   */
  public showSummary(): void {
    const allSteps = Array.from(this.steps.values());
    const successful = allSteps.filter(s => s.status === 'success').length;
    const failed = allSteps.filter(s => s.status === 'error').length;
    const skipped = allSteps.filter(s => s.status === 'skipped').length;
    const total = allSteps.length;

    console.log();
    console.log(chalk.blue.bold('📊 Summary'));

    if (failed === 0) {
      console.log(chalk.green(`✓ All operations completed successfully (${successful}/${total})`));
    } else {
      console.log(
        chalk.red(`✗ ${failed} operation(s) failed, ${successful} successful, ${skipped} skipped`),
      );
    }

    if (this.verbose && allSteps.some(s => s.startTime && s.endTime)) {
      const totalTime = this.getTotalDuration(allSteps);
      console.log(chalk.gray(`Total time: ${totalTime}`));
    }
  }

  /**
   * Start spinner animation
   */
  private startSpinner(message: string): void {
    process.stdout.write(`${ProgressService.SPINNER_FRAMES[0]} ${message}...`);

    this.intervalId = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % ProgressService.SPINNER_FRAMES.length;
      process.stdout.write(`\r${ProgressService.SPINNER_FRAMES[this.spinnerFrame]} ${message}...`);
    }, 100);
  }

  /**
   * Stop spinner animation
   */
  private stopSpinner(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    process.stdout.write('\r');
  }

  /**
   * Get duration between two dates
   */
  private getDuration(start: Date, end: Date): string {
    const ms = end.getTime() - start.getTime();
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  }

  /**
   * Get total duration for all steps
   */
  private getTotalDuration(steps: ProgressStep[]): string {
    const stepsWithTime = steps.filter(s => s.startTime && s.endTime);
    if (stepsWithTime.length === 0) {
      return '0ms';
    }

    const totalMs = stepsWithTime.reduce((sum, step) => {
      return sum + (step.endTime!.getTime() - step.startTime!.getTime());
    }, 0);

    if (totalMs < 1000) {
      return `${totalMs}ms`;
    }
    return `${(totalMs / 1000).toFixed(1)}s`;
  }

  /**
   * Display inline success message
   */
  public static success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  /**
   * Display inline error message
   */
  public static error(message: string): void {
    console.log(chalk.red(`✗ ${message}`));
  }

  /**
   * Display inline warning message
   */
  public static warning(message: string): void {
    console.log(chalk.yellow(`⚠ ${message}`));
  }

  /**
   * Display inline info message
   */
  public static info(message: string): void {
    console.log(chalk.blue(`ℹ ${message}`));
  }

  /**
   * Create a simple progress tracker for a single operation
   */
  public static async withProgress<T>(
    message: string,
    operation: () => Promise<T>,
    verbose = false,
  ): Promise<T> {
    const progress = new ProgressService(verbose);
    progress.addStep('main', message);
    progress.startStep('main');

    try {
      const result = await operation();
      progress.completeStep('main');
      return result;
    } catch (error) {
      progress.failStep('main', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Create progress for multiple sequential operations
   */
  public static async withSequentialProgress<T>(
    operations: Array<{ message: string; operation: () => Promise<T> }>,
    verbose = false,
  ): Promise<T[]> {
    const progress = new ProgressService(verbose);
    const results: T[] = [];

    // Add all steps
    operations.forEach((op, index) => {
      progress.addStep(`step_${index}`, op.message);
    });

    // Execute operations sequentially
    for (let i = 0; i < operations.length; i++) {
      const stepId = `step_${i}`;
      progress.startStep(stepId);

      try {
        const result = await operations[i].operation();
        progress.completeStep(stepId);
        results.push(result);
      } catch (error) {
        progress.failStep(stepId, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }

    return results;
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    this.stopSpinner();
    this.steps.clear();
  }
}

/**
 * Simple progress bar for file operations
 */
export class SimpleProgressBar {
  private readonly total: number;
  private current = 0;
  private readonly width = 40;

  constructor(total: number) {
    this.total = total;
  }

  /**
   * Update progress
   */
  public update(current: number): void {
    this.current = Math.min(current, this.total);
    this.render();
  }

  /**
   * Increment progress
   */
  public increment(): void {
    this.update(this.current + 1);
  }

  /**
   * Complete progress
   */
  public complete(): void {
    this.update(this.total);
    console.log(); // New line after completion
  }

  /**
   * Render the progress bar
   */
  private render(): void {
    const percentage = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.round(this.width * percentage);
    const empty = this.width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percent = Math.round(percentage * 100);

    process.stdout.write(`\r${chalk.blue(bar)} ${percent}% (${this.current}/${this.total})`);
  }
}
