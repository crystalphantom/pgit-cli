import { GitService } from '../../core/git.service';
import { FileSystemService } from '../../core/filesystem.service';
import { GitFileState } from '../../types/git.types';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('GitService - State Recording Methods', () => {
  let gitService: GitService;
  let tempDir: string;
  let fileSystem: FileSystemService;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pgit-test-'));
    fileSystem = new FileSystemService();
    gitService = new GitService(tempDir, fileSystem);

    // Initialize git repository
    await gitService.initRepository();
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
  });

  describe('recordOriginalState', () => {
    it('should record original state including exclude status', async () => {
      const testFile = 'test-file.txt';
      const testFilePath = path.join(tempDir, testFile);
      
      // Create test file
      await fs.writeFile(testFilePath, 'test content');
      
      // Add file to git exclude
      await gitService.addToGitExclude(testFile);
      
      // Record original state
      const state = await gitService.recordOriginalState(testFile);
      
      expect(state.isExcluded).toBe(true);
      expect(state.isTracked).toBe(false);
      // Note: isUntracked might be false when file is excluded
      expect(state.originalPath).toBe(testFile);
      expect(state.timestamp).toBeInstanceOf(Date);
    });

    it('should record state for tracked file', async () => {
      const testFile = 'tracked-file.txt';
      const testFilePath = path.join(tempDir, testFile);
      
      // Create and track file
      await fs.writeFile(testFilePath, 'test content');
      await gitService.addFiles([testFile]);
      
      // Record original state
      const state = await gitService.recordOriginalState(testFile);
      
      expect(state.isExcluded).toBe(false);
      expect(state.isTracked).toBe(true);
      expect(state.isStaged).toBe(true);
      expect(state.originalPath).toBe(testFile);
    });

    it('should throw error for empty path', async () => {
      await expect(gitService.recordOriginalState('')).rejects.toThrow('File path cannot be empty');
    });
  });

  describe('restoreOriginalState', () => {
    it('should restore exclude status correctly', async () => {
      const testFile = 'test-file.txt';
      const testFilePath = path.join(tempDir, testFile);
      
      // Create test file
      await fs.writeFile(testFilePath, 'test content');
      
      // Create original state with exclude status
      const originalState: GitFileState = {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: true,
        originalPath: testFile,
        timestamp: new Date(),
      };
      
      // Restore original state
      await gitService.restoreOriginalState(testFile, originalState);
      
      // Verify file is in exclude
      const isExcluded = await gitService.isInGitExclude(testFile);
      expect(isExcluded).toBe(true);
    });

    it('should restore tracked and staged state', async () => {
      const testFile = 'test-file.txt';
      const testFilePath = path.join(tempDir, testFile);
      
      // Create test file
      await fs.writeFile(testFilePath, 'test content');
      
      // Create original state for tracked and staged file
      const originalState: GitFileState = {
        isTracked: true,
        isStaged: true,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: testFile,
        timestamp: new Date(),
      };
      
      // Restore original state
      await gitService.restoreOriginalState(testFile, originalState);
      
      // Verify file is staged
      const status = await gitService.getStatus();
      const fileStatus = status.files.find(f => f.path === testFile);
      expect(fileStatus?.index).toBe('A'); // Added to index
    });

    it('should remove from exclude when not originally excluded', async () => {
      const testFile = 'test-file.txt';
      const testFilePath = path.join(tempDir, testFile);
      
      // Create test file and add to exclude
      await fs.writeFile(testFilePath, 'test content');
      await gitService.addToGitExclude(testFile);
      
      // Create original state without exclude status
      const originalState: GitFileState = {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: false,
        originalPath: testFile,
        timestamp: new Date(),
      };
      
      // Restore original state
      await gitService.restoreOriginalState(testFile, originalState);
      
      // Verify file is not in exclude
      const isExcluded = await gitService.isInGitExclude(testFile);
      expect(isExcluded).toBe(false);
    });

    it('should throw error for empty path', async () => {
      const state: GitFileState = {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: true,
        isExcluded: false,
        originalPath: 'test.txt',
        timestamp: new Date(),
      };
      
      await expect(gitService.restoreOriginalState('', state)).rejects.toThrow('File path cannot be empty');
    });

    it('should throw error for null state', async () => {
      await expect(gitService.restoreOriginalState('test.txt', null as any)).rejects.toThrow('Git state cannot be null or undefined');
    });
  });

  describe('integration with existing methods', () => {
    it('should work seamlessly with getFileGitState', async () => {
      const testFile = 'integration-test.txt';
      const testFilePath = path.join(tempDir, testFile);
      
      // Create test file and add to exclude
      await fs.writeFile(testFilePath, 'test content');
      await gitService.addToGitExclude(testFile);
      
      // Record state using new method
      const recordedState = await gitService.recordOriginalState(testFile);
      
      // Get state using existing method
      const currentState = await gitService.getFileGitState(testFile);
      
      // They should match
      expect(recordedState.isExcluded).toBe(currentState.isExcluded);
      expect(recordedState.isTracked).toBe(currentState.isTracked);
      expect(recordedState.isStaged).toBe(currentState.isStaged);
      expect(recordedState.isUntracked).toBe(currentState.isUntracked);
    });
  });
});