import { simpleGit, SimpleGit, StatusResult, LogResult } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs-extra';
import { FileSystemService } from './filesystem.service';
import { 
  RepositoryNotFoundError, 
  GitOperationError, 
  GitIndexError,
  GitExcludeError,
  GitExcludeAccessError,
  GitExcludeCorruptionError,
  GitExcludeValidationError
} from '../errors/git.error';
import { GitFileState } from '../types/git.types';
import { GitExcludeSettings, DEFAULT_GIT_EXCLUDE_SETTINGS } from '../types/config.types';

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
  private readonly excludeSettings: GitExcludeSettings;

  constructor(workingDir: string, fileSystem?: FileSystemService, excludeSettings?: GitExcludeSettings) {
    this.workingDir = path.resolve(workingDir);
    this.git = simpleGit(this.workingDir);
    this.fileSystem = fileSystem || new FileSystemService();
    this.excludeSettings = excludeSettings ? { ...excludeSettings } : { ...DEFAULT_GIT_EXCLUDE_SETTINGS };
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
   * Execute exclude operation with comprehensive error handling
   */
  private async executeExcludeOperation<T>(
    operation: () => Promise<T>,
    operationType: 'add' | 'remove' | 'read' | 'write',
    affectedPaths: string[] = [],
    allowGracefulFailure = true
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorLower = errorMessage.toLowerCase();

      // Classify the error type
      let excludeError: GitExcludeError | GitExcludeAccessError | GitExcludeCorruptionError | GitExcludeValidationError;

      if (errorLower.includes('permission') || errorLower.includes('access') || errorLower.includes('eacces') || errorLower.includes('eperm')) {
        excludeError = new GitExcludeAccessError(
          `Permission denied during ${operationType} operation on .git/info/exclude`,
          operationType,
          affectedPaths,
          errorMessage
        );
      } else if (errorLower.includes('corrupt') || errorLower.includes('invalid') || errorLower.includes('malformed')) {
        excludeError = new GitExcludeCorruptionError(
          `Exclude file corruption detected during ${operationType} operation`,
          operationType,
          affectedPaths,
          errorMessage
        );
      } else if (errorLower.includes('path') && (errorLower.includes('invalid') || errorLower.includes('illegal'))) {
        excludeError = new GitExcludeValidationError(
          `Invalid path detected during ${operationType} operation`,
          operationType,
          affectedPaths,
          errorMessage
        );
      } else {
        excludeError = new GitExcludeError(
          `Exclude ${operationType} operation failed`,
          operationType,
          affectedPaths,
          errorMessage
        );
      }

      if (allowGracefulFailure) {
        // Log warning and return null to indicate graceful failure
        console.warn(`Warning: ${excludeError.message}${affectedPaths.length > 0 ? ` (paths: ${affectedPaths.join(', ')})` : ''}`);
        return null;
      } else {
        throw excludeError;
      }
    }
  }

  /**
   * Validate exclude file integrity and accessibility
   */
  private async validateExcludeFileIntegrity(): Promise<{ isValid: boolean; issues: string[] }> {
    const issues: string[] = [];
    const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
    const gitInfoDir = path.dirname(gitExcludePath);

    try {
      // Check if .git/info directory exists and is accessible
      if (!(await fs.pathExists(gitInfoDir))) {
        // Directory doesn't exist - this is fine, we can create it
        return { isValid: true, issues: [] };
      }

      // Check directory permissions
      try {
        await fs.access(gitInfoDir, fs.constants.R_OK | fs.constants.W_OK);
      } catch (error) {
        issues.push(`Cannot access .git/info directory: ${error instanceof Error ? error.message : String(error)}`);
        return { isValid: false, issues };
      }

      // If exclude file exists, validate it
      if (await fs.pathExists(gitExcludePath)) {
        try {
          // Check file permissions
          await fs.access(gitExcludePath, fs.constants.R_OK | fs.constants.W_OK);
        } catch (error) {
          issues.push(`Cannot access exclude file: ${error instanceof Error ? error.message : String(error)}`);
          return { isValid: false, issues };
        }

        // Check file size (reasonable limit to prevent abuse)
        const stats = await fs.stat(gitExcludePath);
        if (stats.size > 1024 * 1024) { // 1MB limit
          issues.push('Exclude file is too large (>1MB)');
        }

        // Validate file content integrity
        try {
          const content = await fs.readFile(gitExcludePath, 'utf8');
          
          // Check for binary content (should be text only)
          if (content.includes('\0')) {
            issues.push('Exclude file contains binary data');
          }

          // Check line count (reasonable limit)
          const lines = content.split('\n');
          if (lines.length > 10000) {
            issues.push('Exclude file has too many lines (>10000)');
          }

          // Validate each line for potential issues
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip empty lines and comments
            if (!line.trim() || line.trim().startsWith('#')) {
              continue;
            }

            // Check line length
            if (line.length > 4096) {
              issues.push(`Line ${i + 1} is too long (>4096 characters)`);
            }

            // Check for control characters
            if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(line)) {
              issues.push(`Line ${i + 1} contains control characters`);
            }
          }
        } catch (error) {
          issues.push(`Cannot read exclude file content: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return { isValid: issues.length === 0, issues };
    } catch (error) {
      issues.push(`Exclude file validation failed: ${error instanceof Error ? error.message : String(error)}`);
      return { isValid: false, issues };
    }
  }

  /**
   * Validate exclude file paths with comprehensive safety checks
   */
  private validateExcludePaths(paths: string[]): { valid: string[]; invalid: Array<{ path: string; reason: string }> } {
    const result = { valid: [] as string[], invalid: [] as Array<{ path: string; reason: string }> };

    for (const filePath of paths) {
      if (!filePath || typeof filePath !== 'string') {
        result.invalid.push({ path: filePath, reason: 'Path must be a non-empty string' });
        continue;
      }

      // Check for paths with trailing spaces or dots BEFORE trimming (problematic on Windows)
      if (filePath.endsWith(' ') || filePath.endsWith('.')) {
        result.invalid.push({ path: filePath, reason: 'Path ends with space or dot (problematic on Windows)' });
        continue;
      }

      const trimmedPath = filePath.trim();
      
      if (!trimmedPath) {
        result.invalid.push({ path: filePath, reason: 'Empty or whitespace-only path' });
        continue;
      }

      // Check for potentially problematic characters
      if (trimmedPath.includes('\0')) {
        result.invalid.push({ path: filePath, reason: 'Path contains null character' });
        continue;
      }

      // Check for control characters that could cause issues
      if (/[\x00-\x1f\x7f]/.test(trimmedPath)) {
        result.invalid.push({ path: filePath, reason: 'Path contains control characters' });
        continue;
      }

      // Check path length (reasonable limit)
      if (trimmedPath.length > 4096) {
        result.invalid.push({ path: filePath, reason: 'Path too long (>4096 characters)' });
        continue;
      }

      // Check for dangerous path patterns
      if (trimmedPath.includes('..')) {
        result.invalid.push({ path: filePath, reason: 'Path contains directory traversal sequence (..)' });
        continue;
      }

      // Check for absolute paths (exclude files should use relative paths)
      if (path.isAbsolute(trimmedPath)) {
        result.invalid.push({ path: filePath, reason: 'Absolute paths are not allowed in exclude files' });
        continue;
      }

      // Check for paths that could interfere with git operations
      if (trimmedPath.startsWith('.git/')) {
        result.invalid.push({ path: filePath, reason: 'Paths starting with .git/ are not allowed' });
        continue;
      }

      // Check for reserved names on Windows
      const basename = path.basename(trimmedPath).toLowerCase();
      const windowsReserved = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'];
      if (windowsReserved.includes(basename) || windowsReserved.includes(basename.split('.')[0])) {
        result.invalid.push({ path: filePath, reason: 'Path uses reserved Windows filename' });
        continue;
      }



      // Check for excessive nesting (could indicate malicious input)
      const pathDepth = trimmedPath.split('/').length;
      if (pathDepth > 50) {
        result.invalid.push({ path: filePath, reason: 'Path nesting too deep (>50 levels)' });
        continue;
      }

      result.valid.push(trimmedPath);
    }

    return result;
  }

  /**
   * Check for duplicate entries and validate exclude file content safety
   */
  private async validateExcludeFileContent(newPaths: string[]): Promise<{ 
    duplicates: string[]; 
    conflicts: Array<{ path: string; conflictsWith: string; reason: string }>; 
    safeToAdd: string[] 
  }> {
    const result = {
      duplicates: [] as string[],
      conflicts: [] as Array<{ path: string; conflictsWith: string; reason: string }>,
      safeToAdd: [] as string[]
    };

    try {
      const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
      
      let existingContent = '';
      if (await fs.pathExists(gitExcludePath)) {
        existingContent = await fs.readFile(gitExcludePath, 'utf8');
      }

      const existingLines = existingContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
      
      for (const newPath of newPaths) {
        const trimmedPath = newPath.trim();
        
        // Check for exact duplicates
        if (existingLines.includes(trimmedPath)) {
          result.duplicates.push(trimmedPath);
          continue;
        }

        // Check for pattern conflicts (e.g., adding 'file.txt' when '*.txt' already exists)
        const conflicts = this.findPatternConflicts(trimmedPath, existingLines);
        if (conflicts.length > 0) {
          for (const conflict of conflicts) {
            result.conflicts.push({
              path: trimmedPath,
              conflictsWith: conflict.pattern,
              reason: conflict.reason
            });
          }
          continue;
        }

        // Check for redundant patterns (e.g., adding '*.txt' when 'file.txt' already exists)
        const redundancies = this.findRedundantPatterns(trimmedPath, existingLines);
        if (redundancies.length > 0) {
          for (const redundancy of redundancies) {
            result.conflicts.push({
              path: trimmedPath,
              conflictsWith: redundancy.pattern,
              reason: redundancy.reason
            });
          }
          continue;
        }

        result.safeToAdd.push(trimmedPath);
      }

      return result;
    } catch (error) {
      // If validation fails, assume all paths are safe to add (graceful degradation)
      console.warn(`Warning: Could not validate exclude file content: ${error instanceof Error ? error.message : String(error)}`);
      return {
        duplicates: [],
        conflicts: [],
        safeToAdd: newPaths
      };
    }
  }

  /**
   * Find pattern conflicts between new path and existing patterns
   */
  private findPatternConflicts(newPath: string, existingPatterns: string[]): Array<{ pattern: string; reason: string }> {
    const conflicts: Array<{ pattern: string; reason: string }> = [];

    for (const pattern of existingPatterns) {
      // Check if new path would be matched by existing pattern
      if (this.matchesGitPattern(newPath, pattern)) {
        conflicts.push({
          pattern,
          reason: `Path would be matched by existing pattern '${pattern}'`
        });
      }
    }

    return conflicts;
  }

  /**
   * Find redundant patterns (new pattern would make existing entries redundant)
   */
  private findRedundantPatterns(newPattern: string, existingPatterns: string[]): Array<{ pattern: string; reason: string }> {
    const redundancies: Array<{ pattern: string; reason: string }> = [];

    // Only check if new pattern contains wildcards
    if (!newPattern.includes('*') && !newPattern.includes('?')) {
      return redundancies;
    }

    for (const existing of existingPatterns) {
      // Check if existing path would be matched by new pattern
      if (this.matchesGitPattern(existing, newPattern)) {
        redundancies.push({
          pattern: existing,
          reason: `New pattern '${newPattern}' would make existing entry '${existing}' redundant`
        });
      }
    }

    return redundancies;
  }

  /**
   * Simple git pattern matching (basic implementation for common cases)
   */
  private matchesGitPattern(filePath: string, pattern: string): boolean {
    // Handle simple cases - this is a basic implementation
    // Git patterns are more complex, but this covers common scenarios
    
    if (pattern === filePath) {
      return true;
    }

    // Convert git pattern to regex (simplified)
    let regexPattern = pattern
      .replace(/\./g, '\\.')  // Escape dots
      .replace(/\*/g, '.*')   // * matches any characters
      .replace(/\?/g, '.')    // ? matches single character
      .replace(/\[([^\]]+)\]/g, '[$1]'); // Character classes

    // Add anchors
    regexPattern = '^' + regexPattern + '$';

    try {
      const regex = new RegExp(regexPattern);
      return regex.test(filePath);
    } catch (error) {
      // If regex is invalid, assume no match
      return false;
    }
  }

  /**
   * Add file path to .git/info/exclude with comprehensive error handling
   */
  public async addToGitExclude(relativePath: string): Promise<void> {
    // Check if exclude operations are enabled
    if (!this.excludeSettings.enabled) {
      return this.handleDisabledExcludeOperation('add', relativePath);
    }

    await this.ensureRepository();

    // Validate input paths
    const validation = this.validateExcludePaths([relativePath]);
    if (validation.invalid.length > 0) {
      throw new GitExcludeValidationError(
        `Invalid path for exclude operation: ${validation.invalid[0].reason}`,
        'add',
        [relativePath]
      );
    }

    const normalizedPath = validation.valid[0];

    const result = await this.executeExcludeOperation(
      async () => {
        // Validate exclude file integrity before making changes
        const integrityCheck = await this.validateExcludeFileIntegrity();
        if (!integrityCheck.isValid) {
          throw new GitExcludeCorruptionError(
            `Exclude file integrity check failed: ${integrityCheck.issues.join(', ')}`,
            'add',
            [normalizedPath]
          );
        }

        // Check for duplicates and conflicts
        const contentValidation = await this.validateExcludeFileContent([normalizedPath]);
        
        if (contentValidation.duplicates.length > 0) {
          // Path already exists, no need to add (not an error)
          console.log(`Path '${normalizedPath}' is already in exclude file`);
          return;
        }

        if (contentValidation.conflicts.length > 0) {
          const conflict = contentValidation.conflicts[0];
          console.warn(`Warning: Adding '${normalizedPath}' may conflict with existing pattern '${conflict.conflictsWith}': ${conflict.reason}`);
          // Continue anyway but log the warning
        }

        const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
        
        // Ensure .git/info directory exists with proper permissions
        const gitInfoDir = path.dirname(gitExcludePath);
        await fs.ensureDir(gitInfoDir);
        
        // Set directory permissions (readable/writable by owner, readable by group)
        try {
          await fs.chmod(gitInfoDir, 0o755);
        } catch (error) {
          // Permission setting might fail on some systems, continue anyway
          console.warn(`Warning: Could not set directory permissions: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Read existing exclude file content
        let excludeContent = '';
        if (await fs.pathExists(gitExcludePath)) {
          excludeContent = await fs.readFile(gitExcludePath, 'utf8');
        }
        
        // Add pgit marker comment if not present
        const pgitMarker = this.excludeSettings.markerComment;
        const lines = excludeContent.split('\n').map(line => line.trim());
        
        if (!lines.includes(pgitMarker)) {
          if (excludeContent && !excludeContent.endsWith('\n')) {
            excludeContent += '\n';
          }
          excludeContent += `${pgitMarker}\n`;
        }
        
        // Add the file path
        excludeContent += `${normalizedPath}\n`;
        
        // Write back to exclude file with proper permissions
        await fs.writeFile(gitExcludePath, excludeContent, 'utf8');
        
        // Set file permissions (readable/writable by owner, readable by group)
        try {
          await fs.chmod(gitExcludePath, 0o644);
        } catch (error) {
          // Permission setting might fail on some systems, continue anyway
          console.warn(`Warning: Could not set file permissions: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Validate the file after writing to ensure it wasn't corrupted
        const postWriteCheck = await this.validateExcludeFileIntegrity();
        if (!postWriteCheck.isValid) {
          throw new GitExcludeCorruptionError(
            `Exclude file became corrupted after write: ${postWriteCheck.issues.join(', ')}`,
            'add',
            [normalizedPath]
          );
        }
      },
      'add',
      [normalizedPath],
      true // Allow graceful failure
    );

    // If operation failed gracefully, we don't throw but the warning was already logged
    if (result === null) {
      // Operation failed but was handled gracefully
      return;
    }
  }

  /**
   * Add multiple file paths to .git/info/exclude in a single operation with comprehensive error handling
   */
  public async addMultipleToGitExclude(relativePaths: string[]): Promise<{ successful: string[]; failed: Array<{ path: string; error: string }> }> {
    await this.ensureRepository();

    const result = { successful: [] as string[], failed: [] as Array<{ path: string; error: string }> };

    if (!relativePaths || relativePaths.length === 0) {
      return result; // Nothing to add
    }

    // Validate all paths
    const validation = this.validateExcludePaths(relativePaths);
    
    // Add validation failures to result
    for (const invalid of validation.invalid) {
      result.failed.push({ path: invalid.path, error: invalid.reason });
    }

    if (validation.valid.length === 0) {
      return result; // No valid paths to process
    }

    const operationResult = await this.executeExcludeOperation(
      async () => {
        // Validate exclude file integrity before making changes
        const integrityCheck = await this.validateExcludeFileIntegrity();
        if (!integrityCheck.isValid) {
          throw new GitExcludeCorruptionError(
            `Exclude file integrity check failed: ${integrityCheck.issues.join(', ')}`,
            'add',
            validation.valid
          );
        }

        // Check for duplicates and conflicts
        const contentValidation = await this.validateExcludeFileContent(validation.valid);
        
        // Log duplicates (not errors, just informational)
        if (contentValidation.duplicates.length > 0) {
          console.log(`Paths already in exclude file: ${contentValidation.duplicates.join(', ')}`);
        }

        // Log conflicts as warnings
        if (contentValidation.conflicts.length > 0) {
          for (const conflict of contentValidation.conflicts) {
            console.warn(`Warning: Adding '${conflict.path}' may conflict with existing pattern '${conflict.conflictsWith}': ${conflict.reason}`);
          }
        }

        const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
        
        // Ensure .git/info directory exists with proper permissions
        const gitInfoDir = path.dirname(gitExcludePath);
        await fs.ensureDir(gitInfoDir);
        
        // Set directory permissions
        try {
          await fs.chmod(gitInfoDir, 0o755);
        } catch (error) {
          console.warn(`Warning: Could not set directory permissions: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Read existing exclude file content
        let excludeContent = '';
        if (await fs.pathExists(gitExcludePath)) {
          excludeContent = await fs.readFile(gitExcludePath, 'utf8');
        }
        
        // Parse existing lines
        const lines = excludeContent.split('\n').map(line => line.trim());
        
        // Remove duplicates within the input array and filter out paths already in exclude file
        const uniquePaths = [...new Set(contentValidation.safeToAdd)];
        const pathsToAdd = uniquePaths.filter(path => !lines.includes(path));
        
        if (pathsToAdd.length === 0) {
          // Nothing new to add, but return all valid paths (including existing ones)
          return validation.valid;
        }
        
        // Add pgit marker comment if not present and we have paths to add
        const pgitMarker = '# pgit-cli managed exclusions';
        if (pathsToAdd.length > 0 && !lines.includes(pgitMarker)) {
          if (excludeContent && !excludeContent.endsWith('\n')) {
            excludeContent += '\n';
          }
          excludeContent += `${pgitMarker}\n`;
        }
        
        // Add all new file paths
        for (const pathToAdd of pathsToAdd) {
          excludeContent += `${pathToAdd}\n`;
        }
        
        // Write back to exclude file with proper permissions
        if (pathsToAdd.length > 0) {
          await fs.writeFile(gitExcludePath, excludeContent, 'utf8');
          
          // Set file permissions
          try {
            await fs.chmod(gitExcludePath, 0o644);
          } catch (error) {
            console.warn(`Warning: Could not set file permissions: ${error instanceof Error ? error.message : String(error)}`);
          }

          // Validate the file after writing
          const postWriteCheck = await this.validateExcludeFileIntegrity();
          if (!postWriteCheck.isValid) {
            throw new GitExcludeCorruptionError(
              `Exclude file became corrupted after write: ${postWriteCheck.issues.join(', ')}`,
              'add',
              validation.valid
            );
          }
        }
        
        return validation.valid;
      },
      'add',
      validation.valid,
      true // Allow graceful failure
    );

    if (operationResult === null) {
      // Operation failed gracefully, mark all valid paths as failed
      for (const path of validation.valid) {
        result.failed.push({ path, error: 'Exclude operation failed but was handled gracefully' });
      }
    } else {
      // Operation succeeded
      result.successful.push(...operationResult);
    }

    return result;
  }

  /**
   * Remove multiple file paths from .git/info/exclude in a single operation with comprehensive error handling
   */
  public async removeMultipleFromGitExclude(relativePaths: string[]): Promise<{ successful: string[]; failed: Array<{ path: string; error: string }> }> {
    await this.ensureRepository();

    const result = { successful: [] as string[], failed: [] as Array<{ path: string; error: string }> };

    if (!relativePaths || relativePaths.length === 0) {
      return result; // Nothing to remove
    }

    // Validate all paths
    const validation = this.validateExcludePaths(relativePaths);
    
    // Add validation failures to result
    for (const invalid of validation.invalid) {
      result.failed.push({ path: invalid.path, error: invalid.reason });
    }

    if (validation.valid.length === 0) {
      return result; // No valid paths to process
    }

    const operationResult = await this.executeExcludeOperation(
      async () => {
        const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
        
        if (!(await fs.pathExists(gitExcludePath))) {
          // Nothing to remove if exclude file doesn't exist, but mark as successful
          return validation.valid;
        }
        
        // Read existing exclude file content
        const excludeContent = await fs.readFile(gitExcludePath, 'utf8');
        const lines = excludeContent.split('\n');
        
        // Filter out all specified paths while preserving other entries
        const filteredLines = lines.filter(line => !validation.valid.includes(line.trim()));
        
        // Check if any changes were made
        if (filteredLines.length === lines.length) {
          // No paths were found in exclude file, but mark as successful
          return validation.valid;
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
        
        return validation.valid;
      },
      'remove',
      validation.valid,
      true // Allow graceful failure
    );

    if (operationResult === null) {
      // Operation failed gracefully, mark all valid paths as failed
      for (const path of validation.valid) {
        result.failed.push({ path, error: 'Exclude removal operation failed but was handled gracefully' });
      }
    } else {
      // Operation succeeded
      result.successful.push(...operationResult);
    }

    return result;
  }

  /**
   * Read the entire .git/info/exclude file content with comprehensive error handling
   */
  public async readGitExcludeFile(): Promise<string> {
    await this.ensureRepository();

    const result = await this.executeExcludeOperation(
      async () => {
        const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
        
        if (!(await fs.pathExists(gitExcludePath))) {
          return '';
        }
        
        return await fs.readFile(gitExcludePath, 'utf8');
      },
      'read',
      [],
      false // Don't allow graceful failure for read operations
    );

    return result || '';
  }

  /**
   * Write content to .git/info/exclude file with proper permissions and comprehensive error handling
   */
  public async writeGitExcludeFile(content: string): Promise<void> {
    await this.ensureRepository();

    const result = await this.executeExcludeOperation(
      async () => {
        // Validate content before writing
        if (content.includes('\0')) {
          throw new GitExcludeValidationError(
            'Exclude file content contains binary data (null characters)',
            'write',
            []
          );
        }

        // Check content size (reasonable limit)
        if (content.length > 1024 * 1024) { // 1MB limit
          throw new GitExcludeValidationError(
            'Exclude file content is too large (>1MB)',
            'write',
            []
          );
        }

        // Validate line count
        const lines = content.split('\n');
        if (lines.length > 10000) {
          throw new GitExcludeValidationError(
            'Exclude file content has too many lines (>10000)',
            'write',
            []
          );
        }

        // Validate each line
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Skip empty lines and comments
          if (!line.trim() || line.trim().startsWith('#')) {
            continue;
          }

          // Check line length
          if (line.length > 4096) {
            throw new GitExcludeValidationError(
              `Line ${i + 1} is too long (>4096 characters)`,
              'write',
              []
            );
          }

          // Check for control characters
          if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(line)) {
            throw new GitExcludeValidationError(
              `Line ${i + 1} contains control characters`,
              'write',
              []
            );
          }
        }

        const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
        
        // Ensure .git/info directory exists with proper permissions
        const gitInfoDir = path.dirname(gitExcludePath);
        await fs.ensureDir(gitInfoDir);
        
        // Set directory permissions
        try {
          await fs.chmod(gitInfoDir, 0o755);
        } catch (error) {
          console.warn(`Warning: Could not set directory permissions: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Write content to exclude file
        await fs.writeFile(gitExcludePath, content, 'utf8');
        
        // Set proper file permissions
        try {
          await fs.chmod(gitExcludePath, 0o644);
        } catch (error) {
          console.warn(`Warning: Could not set file permissions: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Validate the file after writing to ensure it wasn't corrupted
        const postWriteCheck = await this.validateExcludeFileIntegrity();
        if (!postWriteCheck.isValid) {
          throw new GitExcludeCorruptionError(
            `Exclude file became corrupted after write: ${postWriteCheck.issues.join(', ')}`,
            'write',
            []
          );
        }
      },
      'write',
      [],
      true // Allow graceful failure
    );

    // If operation failed gracefully, we don't throw but the warning was already logged
    if (result === null) {
      // Operation failed but was handled gracefully
      return;
    }
  }

  /**
   * Get all pgit-managed entries from .git/info/exclude
   */
  public async getPgitManagedExcludes(): Promise<string[]> {
    await this.ensureRepository();

    try {
      const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
      
      if (!(await fs.pathExists(gitExcludePath))) {
        return [];
      }
      
      // Read exclude file content
      const excludeContent = await fs.readFile(gitExcludePath, 'utf8');
      const lines = excludeContent.split('\n');
      
      // Find pgit marker
      const pgitMarker = '# pgit-cli managed exclusions';
      const pgitMarkerIndex = lines.findIndex(line => line.trim() === pgitMarker);
      
      if (pgitMarkerIndex === -1) {
        return []; // No pgit-managed entries
      }
      
      // Extract entries after the marker until next comment or end of file
      const pgitEntries: string[] = [];
      for (let i = pgitMarkerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
          continue; // Skip empty lines
        }
        if (line.startsWith('#')) {
          break; // Stop at next comment section
        }
        pgitEntries.push(line);
      }
      
      return pgitEntries;
    } catch (error) {
      throw new GitOperationError(
        'Failed to get pgit-managed excludes',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Remove file path from .git/info/exclude with comprehensive error handling
   */
  public async removeFromGitExclude(relativePath: string): Promise<void> {
    // Check if exclude operations are enabled
    if (!this.excludeSettings.enabled) {
      return this.handleDisabledExcludeOperation('remove', relativePath);
    }

    await this.ensureRepository();

    // Validate input
    const validation = this.validateExcludePaths([relativePath]);
    if (validation.invalid.length > 0) {
      throw new GitExcludeValidationError(
        `Invalid path for exclude removal: ${validation.invalid[0].reason}`,
        'remove',
        [relativePath]
      );
    }

    const normalizedPath = validation.valid[0];

    const result = await this.executeExcludeOperation(
      async () => {
        const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
        
        if (!(await fs.pathExists(gitExcludePath))) {
          // Nothing to remove if exclude file doesn't exist
          return;
        }

        // Validate exclude file integrity before making changes
        const integrityCheck = await this.validateExcludeFileIntegrity();
        if (!integrityCheck.isValid) {
          throw new GitExcludeCorruptionError(
            `Exclude file integrity check failed: ${integrityCheck.issues.join(', ')}`,
            'remove',
            [normalizedPath]
          );
        }
        
        // Read existing exclude file content
        const excludeContent = await fs.readFile(gitExcludePath, 'utf8');
        const lines = excludeContent.split('\n');
        
        // Filter out the specific path while preserving other entries
        const filteredLines = lines.filter(line => line.trim() !== normalizedPath);
        
        // Check if any changes were made
        if (filteredLines.length === lines.length) {
          // Path was not found in exclude file
          console.log(`Path '${normalizedPath}' was not found in exclude file`);
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
        
        // Write back to exclude file or remove it if empty
        const newContent = filteredLines.join('\n');
        if (newContent.trim()) {
          await fs.writeFile(gitExcludePath, newContent + '\n', 'utf8');
          
          // Set proper file permissions
          try {
            await fs.chmod(gitExcludePath, 0o644);
          } catch (error) {
            console.warn(`Warning: Could not set file permissions: ${error instanceof Error ? error.message : String(error)}`);
          }

          // Validate the file after writing
          const postWriteCheck = await this.validateExcludeFileIntegrity();
          if (!postWriteCheck.isValid) {
            throw new GitExcludeCorruptionError(
              `Exclude file became corrupted after write: ${postWriteCheck.issues.join(', ')}`,
              'remove',
              [normalizedPath]
            );
          }
        } else {
          // If file would be empty, remove it entirely
          await fs.remove(gitExcludePath);
        }
      },
      'remove',
      [normalizedPath],
      true // Allow graceful failure
    );

    // If operation failed gracefully, we don't throw but the warning was already logged
    if (result === null) {
      // Operation failed but was handled gracefully
      return;
    }
  }

  /**
   * Check if file path is in .git/info/exclude with comprehensive error handling
   */
  public async isInGitExclude(relativePath: string): Promise<boolean> {
    await this.ensureRepository();

    if (!relativePath || !relativePath.trim()) {
      return false;
    }

    // Validate input
    const validation = this.validateExcludePaths([relativePath]);
    if (validation.invalid.length > 0) {
      // For check operations, return false for invalid paths instead of throwing
      console.warn(`Warning: Invalid path for exclude check: ${validation.invalid[0].reason} (path: ${relativePath})`);
      return false;
    }

    const normalizedPath = validation.valid[0];

    const result = await this.executeExcludeOperation(
      async () => {
        const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
        
        if (!(await fs.pathExists(gitExcludePath))) {
          return false;
        }
        
        // Read exclude file content
        const excludeContent = await fs.readFile(gitExcludePath, 'utf8');
        const lines = excludeContent.split('\n').map(line => line.trim());
        
        // Check if the path exists in the exclude file
        return lines.includes(normalizedPath);
      },
      'read',
      [normalizedPath],
      true // Allow graceful failure
    );

    // If operation failed gracefully, return false (assume not excluded)
    return result || false;
  }

  /**
   * Get comprehensive git state for a file including exclude status
   */
  public async getFileGitState(relativePath: string): Promise<GitFileState> {
    if (!relativePath || !relativePath.trim()) {
      throw new GitOperationError('File path cannot be empty');
    }

    const normalizedPath = relativePath.trim();
    const timestamp = new Date();

    // If not a git repository, return default state
    if (!(await this.isRepository())) {
      return {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: normalizedPath,
        timestamp,
      };
    }

    try {
      // Get git status to determine file state
      const status = await this.getStatus();
      const fileStatus = status.files.find(file => file.path === normalizedPath);

      // Check if file is in .git/info/exclude
      const isExcluded = await this.isInGitExclude(normalizedPath);

      if (!fileStatus) {
        // File not in git status - could be untracked, clean tracked, or excluded
        const isTracked = await this.isTracked(normalizedPath);
        
        return {
          isTracked,
          isStaged: false,
          isModified: false,
          isUntracked: !isTracked && !isExcluded,
          isExcluded,
          originalPath: normalizedPath,
          timestamp,
        };
      }

      // Parse git status flags
      const indexFlag = fileStatus.index || ' ';
      const workingFlag = fileStatus.working_dir || ' ';

      // Determine file states based on git status flags
      const isUntracked = indexFlag === '?';
      const isTracked = !isUntracked;
      const isStaged = indexFlag !== ' ' && indexFlag !== '?' && indexFlag !== undefined;
      const isModified = workingFlag !== ' ' && workingFlag !== '?' && workingFlag !== undefined;

      return {
        isTracked,
        isStaged,
        isModified,
        isUntracked,
        isExcluded,
        originalPath: normalizedPath,
        timestamp,
      };
    } catch (error) {
      throw new GitOperationError(
        `Failed to get git state for ${normalizedPath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Record the original git state of a file for later restoration
   */
  public async recordOriginalState(relativePath: string): Promise<GitFileState> {
    if (!relativePath || !relativePath.trim()) {
      throw new GitOperationError('File path cannot be empty');
    }

    try {
      return await this.getFileGitState(relativePath);
    } catch (error) {
      throw new GitOperationError(
        `Failed to record original state for ${relativePath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Restore a file to its original git state
   */
  public async restoreOriginalState(relativePath: string, state: GitFileState): Promise<void> {
    if (!relativePath || !relativePath.trim()) {
      throw new GitOperationError('File path cannot be empty');
    }

    if (!state) {
      throw new GitOperationError('Git state cannot be null or undefined');
    }

    try {
      // If not a git repository, nothing to restore
      if (!(await this.isRepository())) {
        return;
      }

      // Restore git index state
      if (state.isTracked && state.isStaged) {
        // File was previously staged, add it back to staging
        await this.addFiles([relativePath]);
      } else if (state.isTracked && !state.isStaged) {
        // File was tracked but not staged, add then unstage to get it back in index but not staged
        await this.addFiles([relativePath]);
        await this.removeFromIndex(relativePath, true); // Remove from staging but keep in index
      }
      // If state.isTracked is false, file was untracked - do nothing (leave it untracked)

      // Restore exclude file state
      if (state.isExcluded) {
        // File was originally excluded, ensure it's back in exclude file
        await this.addToGitExclude(relativePath);
      } else {
        // File was not originally excluded, remove it from exclude file
        await this.removeFromGitExclude(relativePath);
      }
    } catch (error) {
      throw new GitOperationError(
        `Failed to restore original state for ${relativePath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Handle disabled exclude operations based on fallback behavior
   */
  private handleDisabledExcludeOperation(operation: 'add' | 'remove', relativePath: string): void {
    const message = `Git exclude operation '${operation}' for '${relativePath}' skipped (exclude management disabled)`;
    
    switch (this.excludeSettings.fallbackBehavior) {
      case 'error':
        throw new GitExcludeError(
          `Exclude operations are disabled: ${message}`,
          operation,
          [relativePath]
        );
      case 'warn':
        console.warn(`Warning: ${message}`);
        break;
      case 'silent':
        // Do nothing
        break;
      default:
        console.warn(`Warning: ${message}`);
        break;
    }
  }

  /**
   * Create git service for different directory
   */
  public static create(workingDir: string): GitService {
    return new GitService(workingDir);
  }

  /**
   * Create git service with configuration
   */
  public static createWithConfig(workingDir: string, excludeSettings: GitExcludeSettings): GitService {
    return new GitService(workingDir, undefined, excludeSettings);
  }
}
