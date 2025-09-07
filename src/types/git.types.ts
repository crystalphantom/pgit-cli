/**
 * Git file state information for comprehensive tracking
 */
export interface GitFileState {
  /** File is tracked in git index */
  isTracked: boolean;
  /** File has staged changes */
  isStaged: boolean;
  /** File has unstaged changes */
  isModified: boolean;
  /** File is not tracked by git */
  isUntracked: boolean;
  /** File is in .git/info/exclude */
  isExcluded: boolean;
  /** Original file path */
  originalPath: string;
  /** When state was recorded */
  timestamp: Date;
}

/**
 * Legacy git file state for backward compatibility
 */
export interface LegacyGitFileState {
  isTracked: boolean;
  isStaged: boolean;
}
