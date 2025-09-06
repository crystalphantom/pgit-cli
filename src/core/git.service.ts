import { simpleGit, SimpleGit, StatusResult, LogResult } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs-extra';
import { FileSystemService } from './filesystem.service';
import { RepositoryNotFoundError, GitOperationError, GitIndexError } from '../errors/git.error';

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
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
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
        if (!(await this.fileSystem.pathExists(fullPath))) {
          throw new GitOperationError(`File not found: ${file}`);
        }
      }

      await this.git.add(files);
    } catch (error) {
      throw new GitOperationError(
        `Failed to add files: ${files.join(', ')}`,
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Add multiple files and commit them in a single transaction
   */
  public async addFilesAndCommit(files: string[], baseMessage: string): Promise<string> {
    await this.ensureRepository();

    if (!baseMessage || !baseMessage.trim()) {
      throw new GitOperationError('Commit message cannot be empty');
    }

    if (files.length === 0) {
      throw new GitOperationError('No files provided for commit');
    }

    try {
      // Add all files first
      await this.addFiles(files);

      // Generate comprehensive commit message
      const commitMessage = this.generateMultiFileCommitMessage(files, baseMessage.trim());

      // Commit all changes
      const result = await this.git.commit(commitMessage);
      return result.commit;
    } catch (error) {
      throw new GitOperationError(
        `Failed to add and commit files: ${files.join(', ')}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Generate comprehensive commit message for multiple files
   */
  private generateMultiFileCommitMessage(files: string[], baseMessage: string): string {
    if (files.length === 1) {
      return `${baseMessage}: ${files[0]}`;
    }

    // Group files by directory to provide better structure
    const filesByDir = new Map<string, string[]>();
    files.forEach(file => {
      const dir = path.dirname(file);
      const fileName = path.basename(file);
      if (!filesByDir.has(dir)) {
        filesByDir.set(dir, []);
      }
      filesByDir.get(dir)!.push(fileName);
    });

    const lines = [baseMessage, ''];
    lines.push('Files added:');

    // Sort directories for consistent output
    const sortedDirs = Array.from(filesByDir.keys()).sort();

    for (const dir of sortedDirs) {
      const dirFiles = filesByDir.get(dir)!.sort();
      if (dir === '.') {
        // Root directory files
        dirFiles.forEach(file => {
          lines.push(`- ${file}`);
        });
      } else {
        // Subdirectory files
        dirFiles.forEach(file => {
          lines.push(`- ${dir}/${file}`);
        });
      }
    }

    // Add summary
    const totalDirs = filesByDir.size;
    lines.push('');
    lines.push(
      `Total: ${files.length} file${files.length === 1 ? '' : 's'}${totalDirs > 1 ? `, ${totalDirs} ${totalDirs === 1 ? 'directory' : 'directories'} affected` : ''}`,
    );

    return lines.join('\n');
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
          email: '%ae',
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
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
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
        error instanceof Error ? error.message : String(error),
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
      if (!(await this.fileSystem.pathExists(gitDir))) {
        issues.push('Git directory not found');
        return { isHealthy: false, issues };
      }

      // Check if repository is accessible
      if (!(await this.isRepository())) {
        issues.push('Directory is not a valid git repository');
      }

      // Check for corrupted index
      try {
        await this.getStatus();
      } catch (error) {
        issues.push(
          `Git index may be corrupted: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Check HEAD reference
      try {
        await this.git.revparse(['HEAD']);
      } catch (error) {
        issues.push(
          `HEAD reference is invalid: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } catch (error) {
      issues.push(
        `Repository health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
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
    if (!(await this.isRepository())) {
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
   * Add file path to .git/info/exclude
   */
  public async addToGitExclude(relativePath: string): Promise<void> {
    await this.ensureRepository();

    if (!relativePath || !relativePath.trim()) {
      throw new GitOperationError('File path cannot be empty');
    }

    try {
      const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
      
      // Ensure .git/info directory exists
      const gitInfoDir = path.dirname(gitExcludePath);
      await fs.ensureDir(gitInfoDir);
      
      // Read existing exclude file content
      let excludeContent = '';
      if (await fs.pathExists(gitExcludePath)) {
        excludeContent = await fs.readFile(gitExcludePath, 'utf8');
      }
      
      // Check if path is already excluded to prevent duplicates
      const lines = excludeContent.split('\n').map(line => line.trim());
      const normalizedPath = relativePath.trim();
      
      if (lines.includes(normalizedPath)) {
        // Path already exists, no need to add
        return;
      }
      
      // Add pgit marker comment if not present
      const pgitMarker = '# pgit-cli managed exclusions';
      if (!lines.includes(pgitMarker)) {
        if (excludeContent && !excludeContent.endsWith('\n')) {
          excludeContent += '\n';
        }
        excludeContent += `${pgitMarker}\n`;
      }
      
      // Add the file path
      excludeContent += `${normalizedPath}\n`;
      
      // Write back to exclude file
      await fs.writeFile(gitExcludePath, excludeContent, 'utf8');
    } catch (error) {
      throw new GitOperationError(
        `Failed to add ${relativePath} to .git/info/exclude`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Remove file path from .git/info/exclude
   */
  public async removeFromGitExclude(relativePath: string): Promise<void> {
    await this.ensureRepository();

    if (!relativePath || !relativePath.trim()) {
      throw new GitOperationError('File path cannot be empty');
    }

    try {
      const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
      
      if (!(await fs.pathExists(gitExcludePath))) {
        // Nothing to remove if exclude file doesn't exist
        return;
      }
      
      // Read existing exclude file content
      const excludeContent = await fs.readFile(gitExcludePath, 'utf8');
      const lines = excludeContent.split('\n');
      const normalizedPath = relativePath.trim();
      
      // Filter out the specific path while preserving other entries
      const filteredLines = lines.filter(line => line.trim() !== normalizedPath);
      
      // Check if any changes were made
      if (filteredLines.length === lines.length) {
        // Path was not found in exclude file
        return;
      }
      
      // Clean up empty pgit marker sections if no pgit-managed entries remain
      const pgitMarker = '# pgit-cli managed exclusions';
      const pgitMarkerIndex = filteredLines.findIndex(line => line.trim() === pgitMarker);
      
      if (pgitMarkerIndex !== -1) {
        // Check if there are any non-comment, non-empty lines after the marker
        const hasEntriesAfterMarker = filteredLines
          .slice(pgitMarkerIndex + 1)
          .some(line => line.trim() && !line.trim().startsWith('#'));
        
        if (!hasEntriesAfterMarker) {
          // Remove the marker and any empty lines that follow
          filteredLines.splice(pgitMarkerIndex, 1);
          
          // Remove trailing empty lines
          while (filteredLines.length > 0 && !filteredLines[filteredLines.length - 1].trim()) {
            filteredLines.pop();
          }
        }
      }
      
      // Write back to exclude file
      const newContent = filteredLines.join('\n');
      if (newContent.trim()) {
        await fs.writeFile(gitExcludePath, newContent + '\n', 'utf8');
      } else {
        // If file would be empty, remove it entirely
        await fs.remove(gitExcludePath);
      }
    } catch (error) {
      throw new GitOperationError(
        `Failed to remove ${relativePath} from .git/info/exclude`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Check if file path is in .git/info/exclude
   */
  public async isInGitExclude(relativePath: string): Promise<boolean> {
    await this.ensureRepository();

    if (!relativePath || !relativePath.trim()) {
      return false;
    }

    try {
      const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
      
      if (!(await fs.pathExists(gitExcludePath))) {
        return false;
      }
      
      // Read exclude file content
      const excludeContent = await fs.readFile(gitExcludePath, 'utf8');
      const lines = excludeContent.split('\n').map(line => line.trim());
      const normalizedPath = relativePath.trim();
      
      // Check if the path exists in the exclude file
      return lines.includes(normalizedPath);
    } catch (error) {
      throw new GitOperationError(
        `Failed to check if ${relativePath} is in .git/info/exclude`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Create git service for different directory
   */
  public static create(workingDir: string): GitService {
    return new GitService(workingDir);
  }
}
