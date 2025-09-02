import { simpleGit, SimpleGit, StatusResult, LogResult } from 'simple-git';
import * as path from 'path';
import { FileSystemService } from './filesystem.service';
import { 
  RepositoryNotFoundError, 
  GitOperationError, 
  GitIndexError 
} from '../errors/git.error';

/**
 * Git repository status information
 */
export interface GitStatus {
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
  conflicted: string[];
  isClean: boolean;
  files: Array<{ path: string; index?: string; working_dir?: string }>;
}

/**
 * Git log entry
 */
export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  author: string;
  email: string;
}

/**
 * Git service wrapper with TypeScript support
 */
export class GitService {
  private readonly git: SimpleGit;
  private readonly workingDir: string;
  private readonly fileSystem: FileSystemService;

  constructor(workingDir: string, fileSystem?: FileSystemService) {
    this.workingDir = path.resolve(workingDir);
    this.git = simpleGit(this.workingDir);
    this.fileSystem = fileSystem || new FileSystemService();
  }

  /**
   * Check if directory is a git repository
   */
  public async isRepository(): Promise<boolean> {
    try {
      const isRepo = await this.git.checkIsRepo();
      return isRepo;
    } catch {
      return false;
    }
  }

  /**
   * Initialize a new git repository
   */
  public async initRepository(): Promise<void> {
    try {
      await this.git.init();
    } catch (error) {
      throw new GitOperationError(
        'Failed to initialize git repository',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get repository status
   */
  public async getStatus(): Promise<GitStatus> {
    await this.ensureRepository();

    try {
      const status: StatusResult = await this.git.status();
      
      return {
        current: status.current,
        tracking: status.tracking,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        untracked: status.not_added,
        deleted: status.deleted,
        conflicted: status.conflicted,
        isClean: status.isClean(),
        files: status.files.map(file => ({
          path: file.path,
          index: file.index,
          working_dir: file.working_dir,
        })),
      };
    } catch (error) {
      throw new GitOperationError(
        'Failed to get repository status',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Add files to staging area
   */
  public async addFiles(files: string[]): Promise<void> {
    await this.ensureRepository();

    try {
      if (files.length === 0) {
        return;
      }
      
      // Validate all files exist
      for (const file of files) {
        const fullPath = path.resolve(this.workingDir, file);
        if (!await this.fileSystem.pathExists(fullPath)) {
          throw new GitOperationError(`File not found: ${file}`);
        }
      }

      await this.git.add(files);
    } catch (error) {
      throw new GitOperationError(
        `Failed to add files: ${files.join(', ')}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Add all files to staging area
   */
  public async addAll(): Promise<void> {
    await this.ensureRepository();

    try {
      await this.git.add('.');
    } catch (error) {
      throw new GitOperationError(
        'Failed to add all files',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Remove files from staging area
   */
  public async removeFromIndex(files: string | string[], keepWorkingCopy = false): Promise<void> {
    await this.ensureRepository();

    try {
      const fileList = Array.isArray(files) ? files : [files];
      
      if (fileList.length === 0) {
        return;
      }

      if (keepWorkingCopy) {
        // Remove from index but keep working copy
        await this.git.reset(fileList);
      } else {
        // Remove from index and working copy
        await this.git.rm(fileList);
      }
    } catch (error) {
      throw new GitIndexError(
        `Failed to remove files from index: ${Array.isArray(files) ? files.join(', ') : files}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Commit changes
   */
  public async commit(message: string): Promise<string> {
    await this.ensureRepository();

    if (!message || !message.trim()) {
      throw new GitOperationError('Commit message cannot be empty');
    }

    try {
      const result = await this.git.commit(message.trim());
      return result.commit;
    } catch (error) {
      throw new GitOperationError(
        'Failed to commit changes',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get commit log
   */
  public async getLog(options?: { maxCount?: number; oneline?: boolean }): Promise<GitLogEntry[]> {
    await this.ensureRepository();

    try {
      const logOptions: Record<string, unknown> = {};
      
      if (options?.maxCount) {
        logOptions['maxCount'] = options.maxCount;
      }
      
      if (options?.oneline) {
        logOptions['format'] = {
          hash: '%H',
          date: '%ai',
          message: '%s',
          author: '%an',
          email: '%ae'
        };
      }

      const log: LogResult = await this.git.log(logOptions);
      
      return log.all.map(entry => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        author: entry.author_name,
        email: entry.author_email,
      }));
    } catch (error) {
      throw new GitOperationError(
        'Failed to get commit log',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get diff information
   */
  public async getDiff(options?: { cached?: boolean; nameOnly?: boolean }): Promise<string> {
    await this.ensureRepository();

    try {
      const diffOptions: string[] = [];
      
      if (options?.cached) {
        diffOptions.push('--cached');
      }
      
      if (options?.nameOnly) {
        diffOptions.push('--name-only');
      }

      const diff = await this.git.diff(diffOptions);
      return diff;
    } catch (error) {
      throw new GitOperationError(
        'Failed to get diff',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * List branches
   */
  public async getBranches(): Promise<{ current: string; all: string[] }> {
    await this.ensureRepository();

    try {
      const branches = await this.git.branch();
      return {
        current: branches.current,
        all: branches.all,
      };
    } catch (error) {
      throw new GitOperationError(
        'Failed to get branches',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Create new branch
   */
  public async createBranch(branchName: string): Promise<void> {
    await this.ensureRepository();

    if (!branchName || !branchName.trim()) {
      throw new GitOperationError('Branch name cannot be empty');
    }

    try {
      await this.git.checkoutBranch(branchName, 'HEAD');
    } catch (error) {
      throw new GitOperationError(
        `Failed to create branch ${branchName}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Switch to branch
   */
  public async checkout(branchName: string): Promise<void> {
    await this.ensureRepository();

    if (!branchName || !branchName.trim()) {
      throw new GitOperationError('Branch name cannot be empty');
    }

    try {
      await this.git.checkout(branchName);
    } catch (error) {
      throw new GitOperationError(
        `Failed to checkout branch ${branchName}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Merge branch
   */
  public async merge(branchName: string): Promise<void> {
    await this.ensureRepository();

    if (!branchName || !branchName.trim()) {
      throw new GitOperationError('Branch name cannot be empty');
    }

    try {
      await this.git.merge([branchName]);
    } catch (error) {
      throw new GitOperationError(
        `Failed to merge branch ${branchName}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Reset repository state
   */
  public async reset(mode: 'soft' | 'hard' = 'soft', commit = 'HEAD'): Promise<void> {
    await this.ensureRepository();

    try {
      const resetMode = mode === 'hard' ? ['--hard'] : ['--soft'];
      await this.git.reset([...resetMode, commit]);
    } catch (error) {
      throw new GitOperationError(
        `Failed to reset repository to ${commit}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Check if working directory has uncommitted changes
   */
  public async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.getStatus();
    return !status.isClean;
  }

  /**
   * Get repository root directory
   */
  public async getRepositoryRoot(): Promise<string> {
    await this.ensureRepository();

    try {
      const root = await this.git.revparse(['--show-toplevel']);
      return root.trim();
    } catch (error) {
      throw new GitOperationError(
        'Failed to get repository root',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Check if file is tracked by git
   */
  public async isTracked(filePath: string): Promise<boolean> {
    await this.ensureRepository();

    try {
      const result = await this.git.raw(['ls-files', '--error-unmatch', filePath]);
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get current branch name
   */
  public async getCurrentBranch(): Promise<string> {
    await this.ensureRepository();

    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch (error) {
      throw new GitOperationError(
        'Failed to get current branch',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Check repository health
   */
  public async checkRepositoryHealth(): Promise<{
    isHealthy: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check if .git directory exists
      const gitDir = path.join(this.workingDir, '.git');
      if (!await this.fileSystem.pathExists(gitDir)) {
        issues.push('Git directory not found');
        return { isHealthy: false, issues };
      }

      // Check if repository is accessible
      if (!await this.isRepository()) {
        issues.push('Directory is not a valid git repository');
      }

      // Check for corrupted index
      try {
        await this.getStatus();
      } catch (error) {
        issues.push(`Git index may be corrupted: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Check HEAD reference
      try {
        await this.git.revparse(['HEAD']);
      } catch (error) {
        issues.push(`HEAD reference is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }

    } catch (error) {
      issues.push(`Repository health check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      isHealthy: issues.length === 0,
      issues,
    };
  }

  /**
   * Ensure repository exists and is accessible
   */
  private async ensureRepository(): Promise<void> {
    if (!await this.isRepository()) {
      throw new RepositoryNotFoundError(`Not a git repository: ${this.workingDir}`);
    }
  }

  /**
   * Get working directory
   */
  public getWorkingDirectory(): string {
    return this.workingDir;
  }

  /**
   * Create git service for different directory
   */
  public static create(workingDir: string): GitService {
    return new GitService(workingDir);
  }
}