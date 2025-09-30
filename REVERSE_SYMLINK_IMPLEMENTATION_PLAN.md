# PGit Reverse Symlink Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to migrate PGit from its current symlink-based approach to a reverse symlink architecture that addresses critical AI agent compatibility issues while enhancing safety and recovery capabilities.

## Problem Statement

### Current Issues with Symlink Approach

1. **AI Agent Incompatibility**: AI coding agents (OpenCode, Claude, Gemini CLI) cannot discover symlinked files due to security restrictions and conservative symlink handling
2. **Limited Recovery**: If `.private-storage/` is deleted, all private files are lost
3. **Project-Bound Storage**: Storage is tied to project directory, creating single point of failure
4. **Manual Change Tracking**: No real-time monitoring of file changes or automatic commit prevention

### User Requirements

1. **AI Discoverability**: Files must be discoverable by AI agents for code assistance
2. **Robust Recovery**: Must be able to recover files even if accidentally deleted from main repo
3. **Enhanced Safety**: Storage should be independent of project directory with remote backup capability
4. **Change Tracking**: Automatic tracking and prevention of accidental commits to main repository

## Proposed Solution: Enhanced Reverse Symlink Architecture

### Architecture Overview

```
Project Directory:
├── src/
│   ├── sensitive.key     // ← Original file (AI discoverable)
│   └── config.json       // ← Original file  
├── .git/
│   └── info/exclude      // ← Contains: src/sensitive.key, src/config.json
└── .pgit/
    └── config.json       // ← Project metadata only

Central Storage (~/.pgit/projects/<hash>/):
├── storage/
│   ├── src/sensitive.key // ← Backup copy + version history  
│   └── src/config.json   // ← Backup copy + version history
├── private-repo/         // ← Git repository for private files
│   └── .git/
└── metadata.json         // ← Project linking info
```

### Key Principles

1. **Files remain in original location** for AI agent compatibility
2. **Immediate git exclusion** before any other operations
3. **Central storage outside project** for enhanced safety
4. **Real-time file monitoring** for automatic sync and commit prevention
5. **Multiple backup layers** for robust recovery

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)

#### Central Storage Management
```typescript
// New service: src/core/central-storage.service.ts
class CentralStorageService {
  private getProjectHash(projectPath: string): string
  private getCentralStoragePath(projectPath: string): string
  private ensureCentralStorageExists(): Promise<void>
  private createProjectMetadata(): Promise<void>
}
```

**Storage Location Strategy:**
```bash
# Cross-platform unified approach
~/.pgit/projects/<project-hash>/storage/
~/.pgit/projects/<project-hash>/private-repo/
~/.pgit/projects/<project-hash>/metadata.json
```

#### Enhanced Git Exclude Service
```typescript
// Enhanced: src/core/git.service.ts
class GitService {
  async addToGitExcludeWithVerification(filePath: string): Promise<void>
  async verifyFileExcluded(filePath: string): Promise<boolean>
  async installPreCommitHook(): Promise<void>
  async batchVerifyExclusions(filePaths: string[]): Promise<VerificationResult>
}
```

### Phase 2: File Watching & Sync (Week 2-3)

#### Real-time File Monitoring
```typescript
// New service: src/core/file-watcher.service.ts
class FileWatcherService {
  async watchFile(filePath: string): Promise<void>
  async syncToBackup(filePath: string): Promise<void>
  async handleConflict(filePath: string): Promise<void>
  private detectChanges(filePath: string): Promise<ChangeInfo>
}
```

#### Bidirectional Sync Engine
```typescript
// New service: src/core/sync.service.ts
class SyncService {
  async syncOriginalToBackup(filePath: string): Promise<void>
  async syncBackupToOriginal(filePath: string): Promise<void>
  async resolveConflicts(filePath: string): Promise<ConflictResolution>
  async validateSyncIntegrity(): Promise<SyncReport>
}
```

### Phase 3: Migration & Commands (Week 3-4)

#### Migration Command
```bash
# New command: pgit migrate
pgit migrate --from-symlinks --verify-safety --interactive
pgit migrate --status  # Check migration progress
pgit migrate --rollback  # Rollback if needed
```

#### Enhanced Add Command
```typescript
// Modified: src/commands/add.command.ts
async executeReverseSymlinkAddOperation(relativePaths: string[]): Promise<void> {
  // 1. IMMEDIATE git exclusion (critical first step)
  await this.immediateGitExclusion(relativePaths);
  
  // 2. Verify exclusion worked
  await this.verifyExclusions(relativePaths);
  
  // 3. Create central storage backups
  await this.createBackups(relativePaths);
  
  // 4. Setup file watchers
  await this.setupWatchers(relativePaths);
  
  // 5. Initial commit to private repo
  await this.commitToPrivateRepo(relativePaths);
}
```

### Phase 4: Safety & Recovery (Week 4-5)

#### Recovery Commands
```bash
pgit recover <file>           # Recover from backup
pgit recover --all            # Recover all tracked files
pgit verify                   # Verify all exclusions
pgit status --detailed        # Show sync status
pgit backup --push-remote     # Push private repo
pgit backup --pull-remote     # Pull from private repo
```

#### Integrity Checks
```typescript
// New service: src/core/integrity.service.ts
class IntegrityService {
  async verifyAllExclusions(): Promise<IntegrityReport>
  async detectOrphanedFiles(): Promise<string[]>
  async validateBackupConsistency(): Promise<boolean>
  async performHealthCheck(): Promise<HealthReport>
}
```

## Safety Mechanisms

### 1. Critical Operation Ordering
```typescript
// ALWAYS execute in this exact order:
async function safeAddOperation(filePath: string) {
  // Step 1: IMMEDIATE git exclusion (highest priority)
  await gitService.addToGitExclude(filePath);
  
  // Step 2: Verify exclusion worked
  const isExcluded = await gitService.verifyFileExcluded(filePath);
  if (!isExcluded) {
    throw new SafetyError('Failed to exclude file from git');
  }
  
  // Step 3: ONLY THEN proceed with other operations
  await createBackup(filePath);
  await setupWatcher(filePath);
}
```

### 2. Rollback Capabilities
```typescript
class RollbackManager {
  async rollbackAddOperation(filePath: string) {
    try {
      await this.removeFromGitExclude(filePath);
      await this.deleteBackup(filePath);
      await this.stopFileWatcher(filePath);
      await this.removeFromTrackedPaths(filePath);
    } catch (error) {
      console.error('Rollback failed:', error);
      // Log for manual intervention
    }
  }
}
```

### 3. Pre-commit Protection
```bash
#!/bin/bash
# .git/hooks/pre-commit
echo "Checking for private files in commit..."

for file in $(git diff --cached --name-only); do
  if pgit is-tracked "$file"; then
    echo "ERROR: Attempting to commit private file: $file"
    echo "Use 'git reset HEAD $file' to unstage"
    exit 1
  fi
done

echo "No private files detected in commit."
```

### 4. File Watcher Safety
```typescript
// Debounced file watching to prevent infinite loops
class SafeFileWatcher {
  private debounceTimeout = 1000; // 1 second
  private processingFiles = new Set<string>();
  
  async onFileChange(filePath: string) {
    if (this.processingFiles.has(filePath)) {
      return; // Prevent infinite loops
    }
    
    this.processingFiles.add(filePath);
    
    try {
      // Always verify exclusion first
      await this.ensureFileExcluded(filePath);
      
      // Then sync
      await this.syncToBackup(filePath);
      
      // Auto-commit to private repo
      await this.autoCommitToPrivateRepo(filePath);
    } finally {
      setTimeout(() => {
        this.processingFiles.delete(filePath);
      }, this.debounceTimeout);
    }
  }
}
```

## Migration Strategy

### Backward Compatibility
```typescript
// Support both approaches during transition
class PGitCompatibilityLayer {
  async addFile(filePath: string, options: AddOptions) {
    if (options.mode === 'symlink' || !options.mode) {
      return this.executeSymlinkAdd(filePath);
    } else if (options.mode === 'reverse') {
      return this.executeReverseSymlinkAdd(filePath);
    }
  }
}
```

### Interactive Migration
```bash
# Guided migration with safety checks
pgit migrate --interactive

# Output:
# Found 5 symlinked files:
# 1. src/api-keys.json -> .private-storage/src/api-keys.json
# 2. config/secrets.yml -> .private-storage/config/secrets.yml
# ...
# 
# Migrate to reverse symlink approach? [y/N]
# This will:
# ✓ Copy files back to original locations
# ✓ Add files to .git/info/exclude  
# ✓ Setup file watchers
# ✓ Create central storage backups
# 
# Continue? [y/N]
```

### Rollback Plan
```typescript
class MigrationManager {
  async rollbackMigration(migrationId: string) {
    const migrationLog = await this.loadMigrationLog(migrationId);
    
    for (const operation of migrationLog.operations.reverse()) {
      await this.reverseOperation(operation);
    }
    
    console.log('Migration successfully rolled back');
  }
}
```

## Alternative Approaches Considered

### 1. Hard Links + Git Exclude
**Approach**: Create hard links in central storage, keep originals in place
**Pros**: 
- Automatic sync (same inode)
- Normal file appearance
**Cons**: 
- Limited to same filesystem
- Files still appear in git (need exclusion)
- Windows compatibility issues
**Verdict**: Rejected due to filesystem limitations

### 2. Copy + Sync Strategy  
**Approach**: Copy files to central storage, sync bidirectionally
**Pros**: 
- Simple conceptually
- Cross-platform
**Cons**: 
- Complex conflict resolution
- Potential data loss during conflicts
- Manual sync triggers needed
**Verdict**: Partially adopted (used as backup mechanism)

### 3. Git Worktrees
**Approach**: Use git worktree for private storage
**Pros**: 
- Native git integration
- Cleaner git operations
**Cons**: 
- Complex setup
- Limited flexibility
- Still requires file exclusion
**Verdict**: Rejected due to complexity

### 4. AI Agent Configuration
**Approach**: Configure AI agents to follow symlinks
**Pros**: 
- No architecture changes needed
- Maintains current safety
**Cons**: 
- Requires changes to external tools
- Not under our control
- Inconsistent support
**Verdict**: Rejected as not feasible

### 5. Bind Mounts (Linux/macOS)
**Approach**: Use filesystem bind mounts for transparency
**Pros**: 
- Completely transparent
- Native OS support
**Cons**: 
- Platform-specific
- Requires elevated permissions
- Complex setup
**Verdict**: Rejected due to platform limitations

## Pros and Cons Analysis

### Reverse Symlink Approach

#### ✅ Pros
1. **AI Agent Compatibility**: Files appear as normal files, discoverable by all AI tools
2. **Enhanced Recovery**: Multiple backup layers (central storage + private repo + remote)
3. **Project Independence**: Central storage survives project deletion
4. **Real-time Monitoring**: Automatic change detection and sync
5. **Improved Safety**: Multiple verification layers prevent accidental commits
6. **Remote Backup**: Independent private repository can be pushed/pulled
7. **Better UX**: No symlink confusion for users
8. **Tool Ecosystem**: Works with all development tools that have symlink issues

#### ❌ Cons
1. **Implementation Complexity**: More complex than current approach
2. **Race Condition Risk**: Window between file creation and exclusion
3. **Conflict Resolution**: Need to handle conflicts between original and backup
4. **File Watcher Overhead**: Continuous monitoring uses system resources  
5. **Sync Complexity**: Bidirectional sync introduces potential data loss scenarios
6. **Migration Risk**: Moving from proven symlink approach introduces new failure modes
7. **Debugging Difficulty**: More components to troubleshoot when issues arise
8. **Storage Duplication**: Files exist in both locations (disk space usage)

### Current Symlink Approach

#### ✅ Pros
1. **Battle-tested**: Proven, stable implementation
2. **Simple Model**: Clear separation between main and private storage
3. **Atomic Operations**: File moves are atomic
4. **No Sync Issues**: Single source of truth
5. **Lower Resource Usage**: No file watchers needed
6. **Clear Semantics**: Physical separation is conceptually clean

#### ❌ Cons  
1. **AI Agent Incompatibility**: Major blocker for modern development workflows
2. **Recovery Risk**: Single point of failure in `.private-storage/`
3. **Project-bound Storage**: Risk of total loss if project deleted
4. **Manual Change Tracking**: No automatic monitoring
5. **Symlink Visibility**: Confusing UX with `ls -la` showing symlinks

## Caveats and Risk Mitigation

### Critical Caveats

#### 1. Git Exclusion Timing
**Risk**: Files could be accidentally committed if exclusion fails
**Mitigation**: 
- Always exclude FIRST before any other operations
- Verify exclusion worked before proceeding
- Install pre-commit hooks as backup
- Regular integrity checks

#### 2. File Synchronization Conflicts
**Risk**: Original and backup files modified simultaneously
**Mitigation**:
- Timestamp-based conflict detection
- User prompts for conflict resolution
- Backup conflicted versions
- Clear conflict resolution policies

#### 3. Central Storage Corruption
**Risk**: Central storage could become corrupted or inaccessible
**Mitigation**:
- Multiple backup locations
- Regular integrity checks
- Remote repository backup
- Recovery commands for restoration

#### 4. File Watcher Failures
**Risk**: File changes not detected, sync breaks
**Mitigation**:
- Fallback to periodic scanning
- Health checks for watcher status
- Manual sync commands
- Redundant change detection

#### 5. Migration Data Loss
**Risk**: Data loss during migration from symlinks
**Mitigation**:
- Complete backup before migration
- Incremental migration with verification
- Rollback capabilities
- Dry-run migration mode

### Performance Considerations

1. **File Watcher Overhead**: ~2-5MB RAM per watched file
2. **Sync Latency**: 100-500ms delay for file changes
3. **Storage Usage**: 2x disk space (original + backup)
4. **CPU Usage**: Minimal for file monitoring, higher during sync

### Platform-Specific Risks

#### Windows
- File locking issues during sync
- Path length limitations
- Case sensitivity problems
- Antivirus interference

#### macOS
- Spotlight indexing conflicts
- SIP (System Integrity Protection) restrictions
- File system events limitations

#### Linux
- inotify limits for file watchers
- Permission complexity
- Multiple filesystem types

## Success Metrics

### Phase 1 Success Criteria
- [ ] Central storage system functional
- [ ] Git exclusion with verification working
- [ ] Basic file watching implemented
- [ ] 100% test coverage for core services

### Phase 2 Success Criteria  
- [ ] Real-time sync operational
- [ ] Conflict resolution working
- [ ] Pre-commit hooks installed
- [ ] Performance within acceptable limits

### Phase 3 Success Criteria
- [ ] Migration command functional
- [ ] Backward compatibility maintained
- [ ] Interactive migration working
- [ ] Rollback capabilities tested

### Phase 4 Success Criteria
- [ ] Recovery commands working
- [ ] Integrity checks passing
- [ ] Remote backup functional
- [ ] Health monitoring operational

### Overall Success Metrics
- [ ] AI agents can discover 100% of PGit-managed files
- [ ] Zero accidental commits to main repository
- [ ] Sub-second sync latency for file changes
- [ ] 99.9% uptime for file watching
- [ ] Complete data recovery capability

## Timeline and Resources

### Estimated Timeline: 5-6 weeks

**Week 1-2**: Core infrastructure development
**Week 3**: File watching and sync implementation  
**Week 4**: Migration tools and commands
**Week 5**: Safety mechanisms and testing
**Week 6**: Documentation and final testing

### Required Resources
- 1 Senior Developer (full-time)
- 1 QA Engineer (part-time)
- Extensive testing across platforms
- User testing with AI agents

## Conclusion

The Enhanced Reverse Symlink Architecture addresses all identified issues with the current PGit implementation while providing significant safety and usability improvements. Despite increased complexity, the benefits for AI agent compatibility and enhanced recovery capabilities make this approach the optimal solution for modern development workflows.

The implementation plan provides a careful, phased approach with extensive safety mechanisms and rollback capabilities to ensure a smooth transition from the current proven symlink-based architecture.