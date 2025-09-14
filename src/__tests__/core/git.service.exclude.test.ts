import { GitService } from '../../core/git.service';
import { FileSystemService } from '../../core/filesystem.service';
import { GitOperationError, GitExcludeValidationError } from '../../errors/git.error';
import { PGIT_MARKER_COMMENT } from '../../types/config.types';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('GitService - Exclude File Management', () => {
  let gitService: GitService;
  let fileSystemService: FileSystemService;
  let tempDir: string;
  let gitExcludePath: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pgit-test-'));

    // Initialize git repository
    await fs.ensureDir(path.join(tempDir, '.git', 'info'));
    gitExcludePath = path.join(tempDir, '.git', 'info', 'exclude');

    fileSystemService = new FileSystemService();
    gitService = new GitService(tempDir, fileSystemService);

    // Mock isRepository to return true for our test directory
    jest.spyOn(gitService, 'isRepository').mockResolvedValue(true);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
    jest.restoreAllMocks();
  });

  describe('addToGitExclude', () => {
    it('should create exclude file and add path when file does not exist', async () => {
      const testPath = 'test-file.txt';

      await gitService.addToGitExclude(testPath);

      expect(await fs.pathExists(gitExcludePath)).toBe(true);
      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain(PGIT_MARKER_COMMENT);
      expect(content).toContain(testPath);
    });

    it('should add path to existing exclude file', async () => {
      const existingContent = '# Existing exclusions\n*.log\n';
      await fs.writeFile(gitExcludePath, existingContent);

      const testPath = 'test-file.txt';
      await gitService.addToGitExclude(testPath);

      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('*.log'); // Preserve existing content
      expect(content).toContain(PGIT_MARKER_COMMENT);
      expect(content).toContain(testPath);
    });

    it('should not add duplicate paths', async () => {
      const testPath = 'test-file.txt';

      // Add path twice
      await gitService.addToGitExclude(testPath);
      await gitService.addToGitExclude(testPath);

      const content = await fs.readFile(gitExcludePath, 'utf8');
      const occurrences = (content.match(new RegExp(testPath, 'g')) || []).length;
      expect(occurrences).toBe(1);
    });

    it('should not add duplicate pgit marker', async () => {
      const testPath1 = 'test-file1.txt';
      const testPath2 = 'test-file2.txt';

      await gitService.addToGitExclude(testPath1);
      await gitService.addToGitExclude(testPath2);

      const content = await fs.readFile(gitExcludePath, 'utf8');
      const markerOccurrences = (
        content.match(
          new RegExp(PGIT_MARKER_COMMENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        ) || []
      ).length;
      expect(markerOccurrences).toBe(1);
    });

    it('should throw error for empty path', async () => {
      await expect(gitService.addToGitExclude('')).rejects.toThrow(GitExcludeValidationError);
      await expect(gitService.addToGitExclude('   ')).rejects.toThrow(GitExcludeValidationError);
    });

    it('should throw error when not in git repository', async () => {
      jest.spyOn(gitService, 'isRepository').mockResolvedValue(false);

      await expect(gitService.addToGitExclude('test-file.txt')).rejects.toThrow();
    });
  });

  describe('removeFromGitExclude', () => {
    it('should remove path from exclude file', async () => {
      const testPath = 'test-file.txt';

      // First add the path
      await gitService.addToGitExclude(testPath);
      expect(await gitService.isInGitExclude(testPath)).toBe(true);

      // Then remove it
      await gitService.removeFromGitExclude(testPath);
      expect(await gitService.isInGitExclude(testPath)).toBe(false);
    });

    it('should preserve other entries when removing path', async () => {
      const existingContent = '# Existing exclusions\n*.log\n';
      await fs.writeFile(gitExcludePath, existingContent);

      const testPath = 'test-file.txt';
      await gitService.addToGitExclude(testPath);
      await gitService.removeFromGitExclude(testPath);

      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('*.log'); // Should preserve existing content
      expect(content).not.toContain(testPath);
    });

    it('should remove pgit marker when no pgit entries remain', async () => {
      // Create exclude file with existing entries
      const existingContent = '# Existing exclusions\n*.log\n';
      await fs.writeFile(gitExcludePath, existingContent);

      const testPath = 'test-file.txt';
      await gitService.addToGitExclude(testPath);
      await gitService.removeFromGitExclude(testPath);

      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('*.log'); // Should preserve existing content
      expect(content).not.toContain(PGIT_MARKER_COMMENT);
      expect(content).not.toContain(testPath);
    });

    it('should handle non-existent exclude file gracefully', async () => {
      const testPath = 'test-file.txt';

      // Should not throw error when exclude file doesn't exist
      await expect(gitService.removeFromGitExclude(testPath)).resolves.not.toThrow();
    });

    it('should handle non-existent path gracefully', async () => {
      const existingPath = 'existing-file.txt';
      const nonExistentPath = 'non-existent-file.txt';

      await gitService.addToGitExclude(existingPath);

      // Should not throw error when path doesn't exist in exclude file
      await expect(gitService.removeFromGitExclude(nonExistentPath)).resolves.not.toThrow();

      // Should still contain the existing path
      expect(await gitService.isInGitExclude(existingPath)).toBe(true);
    });

    it('should delete exclude file when it becomes empty', async () => {
      const testPath = 'test-file.txt';

      await gitService.addToGitExclude(testPath);
      expect(await fs.pathExists(gitExcludePath)).toBe(true);

      await gitService.removeFromGitExclude(testPath);
      expect(await fs.pathExists(gitExcludePath)).toBe(false);
    });

    it('should throw error for empty path', async () => {
      await expect(gitService.removeFromGitExclude('')).rejects.toThrow(GitExcludeValidationError);
      await expect(gitService.removeFromGitExclude('   ')).rejects.toThrow(
        GitExcludeValidationError,
      );
    });
  });

  describe('isInGitExclude', () => {
    it('should return true for paths in exclude file', async () => {
      const testPath = 'test-file.txt';

      await gitService.addToGitExclude(testPath);
      expect(await gitService.isInGitExclude(testPath)).toBe(true);
    });

    it('should return false for paths not in exclude file', async () => {
      const testPath = 'test-file.txt';
      const otherPath = 'other-file.txt';

      await gitService.addToGitExclude(testPath);
      expect(await gitService.isInGitExclude(otherPath)).toBe(false);
    });

    it('should return false when exclude file does not exist', async () => {
      const testPath = 'test-file.txt';

      expect(await gitService.isInGitExclude(testPath)).toBe(false);
    });

    it('should return false for empty path', async () => {
      expect(await gitService.isInGitExclude('')).toBe(false);
      expect(await gitService.isInGitExclude('   ')).toBe(false);
    });

    it('should handle paths with special characters', async () => {
      const testPath = 'test file with spaces.txt';

      await gitService.addToGitExclude(testPath);
      expect(await gitService.isInGitExclude(testPath)).toBe(true);
    });
  });

  describe('addMultipleToGitExclude', () => {
    it('should add multiple paths in a single operation', async () => {
      const testPaths = ['file1.txt', 'file2.txt', 'file3.txt'];

      await gitService.addMultipleToGitExclude(testPaths);

      expect(await fs.pathExists(gitExcludePath)).toBe(true);
      const content = await fs.readFile(gitExcludePath, 'utf8');

      expect(content).toContain(PGIT_MARKER_COMMENT);
      for (const path of testPaths) {
        expect(content).toContain(path);
      }

      // Should only have one marker
      const markerOccurrences = (
        content.match(
          new RegExp(PGIT_MARKER_COMMENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        ) || []
      ).length;
      expect(markerOccurrences).toBe(1);
    });

    it('should handle empty array gracefully', async () => {
      await expect(gitService.addMultipleToGitExclude([])).resolves.not.toThrow();
      expect(await fs.pathExists(gitExcludePath)).toBe(false);
    });

    it('should not add duplicate paths in batch operation', async () => {
      const testPaths = ['file1.txt', 'file2.txt', 'file1.txt']; // file1.txt is duplicate

      await gitService.addMultipleToGitExclude(testPaths);

      const content = await fs.readFile(gitExcludePath, 'utf8');
      const file1Occurrences = (content.match(/file1\.txt/g) || []).length;
      expect(file1Occurrences).toBe(1);
    });

    it('should preserve existing entries when adding multiple paths', async () => {
      const existingContent = '# Existing exclusions\n*.log\n';
      await fs.writeFile(gitExcludePath, existingContent);

      const testPaths = ['file1.txt', 'file2.txt'];
      await gitService.addMultipleToGitExclude(testPaths);

      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('*.log'); // Preserve existing content
      expect(content).toContain(PGIT_MARKER_COMMENT);
      for (const path of testPaths) {
        expect(content).toContain(path);
      }
    });

    it('should handle empty paths in array gracefully', async () => {
      const testPaths = ['file1.txt', '', 'file2.txt'];

      const result = await gitService.addMultipleToGitExclude(testPaths);

      expect(result.successful).toEqual(['file1.txt', 'file2.txt']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].path).toBe('');
      expect(result.failed[0].error).toContain('Path must be a non-empty string');
    });

    it('should skip paths that already exist', async () => {
      // First add some paths
      await gitService.addToGitExclude('file1.txt');
      await gitService.addToGitExclude('file2.txt');

      // Try to add overlapping paths
      const testPaths = ['file1.txt', 'file3.txt', 'file2.txt']; // file1 and file2 already exist
      await gitService.addMultipleToGitExclude(testPaths);

      const content = await fs.readFile(gitExcludePath, 'utf8');

      // Should only have one occurrence of each file
      expect((content.match(/file1\.txt/g) || []).length).toBe(1);
      expect((content.match(/file2\.txt/g) || []).length).toBe(1);
      expect((content.match(/file3\.txt/g) || []).length).toBe(1);
    });
  });

  describe('removeMultipleFromGitExclude', () => {
    it('should remove multiple paths in a single operation', async () => {
      const testPaths = ['file1.txt', 'file2.txt', 'file3.txt'];

      // First add the paths
      await gitService.addMultipleToGitExclude(testPaths);

      // Verify they exist
      for (const path of testPaths) {
        expect(await gitService.isInGitExclude(path)).toBe(true);
      }

      // Remove first two paths
      await gitService.removeMultipleFromGitExclude(['file1.txt', 'file2.txt']);

      // Verify removal
      expect(await gitService.isInGitExclude('file1.txt')).toBe(false);
      expect(await gitService.isInGitExclude('file2.txt')).toBe(false);
      expect(await gitService.isInGitExclude('file3.txt')).toBe(true);
    });

    it('should handle empty array gracefully', async () => {
      await gitService.addToGitExclude('file1.txt');

      await expect(gitService.removeMultipleFromGitExclude([])).resolves.not.toThrow();
      expect(await gitService.isInGitExclude('file1.txt')).toBe(true);
    });

    it('should preserve existing entries when removing multiple paths', async () => {
      const existingContent = '# Existing exclusions\n*.log\n';
      await fs.writeFile(gitExcludePath, existingContent);

      const testPaths = ['file1.txt', 'file2.txt'];
      await gitService.addMultipleToGitExclude(testPaths);
      await gitService.removeMultipleFromGitExclude(testPaths);

      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('*.log'); // Should preserve existing content
      expect(content).not.toContain('file1.txt');
      expect(content).not.toContain('file2.txt');
      expect(content).not.toContain(PGIT_MARKER_COMMENT);
    });

    it('should handle non-existent paths gracefully', async () => {
      await gitService.addToGitExclude('existing-file.txt');

      const pathsToRemove = ['non-existent1.txt', 'non-existent2.txt'];
      await expect(gitService.removeMultipleFromGitExclude(pathsToRemove)).resolves.not.toThrow();

      // Should still contain the existing file
      expect(await gitService.isInGitExclude('existing-file.txt')).toBe(true);
    });

    it('should remove pgit marker when all pgit entries are removed', async () => {
      const existingContent = '# Existing exclusions\n*.log\n';
      await fs.writeFile(gitExcludePath, existingContent);

      const testPaths = ['file1.txt', 'file2.txt'];
      await gitService.addMultipleToGitExclude(testPaths);
      await gitService.removeMultipleFromGitExclude(testPaths);

      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('*.log');
      expect(content).not.toContain(PGIT_MARKER_COMMENT);
    });

    it('should handle empty paths in array gracefully', async () => {
      const testPaths = ['file1.txt', '', 'file2.txt'];

      const result = await gitService.removeMultipleFromGitExclude(testPaths);

      expect(result.successful).toEqual(['file1.txt', 'file2.txt']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].path).toBe('');
      expect(result.failed[0].error).toContain('Path must be a non-empty string');
    });
  });

  describe('readGitExcludeFile', () => {
    it('should return empty string when exclude file does not exist', async () => {
      const result = await gitService.readGitExcludeFile();
      expect(result).toBe('');
    });

    it('should return file content when exclude file exists', async () => {
      const testContent = '# Test exclusions\n*.log\n*.tmp\n';
      await fs.writeFile(gitExcludePath, testContent);

      const result = await gitService.readGitExcludeFile();
      expect(result).toBe(testContent);
    });

    it('should throw error when not in git repository', async () => {
      jest.spyOn(gitService, 'isRepository').mockResolvedValue(false);

      await expect(gitService.readGitExcludeFile()).rejects.toThrow();
    });
  });

  describe('writeGitExcludeFile', () => {
    it('should create exclude file with provided content', async () => {
      const testContent = '# Test exclusions\n*.log\n*.tmp\n';

      await gitService.writeGitExcludeFile(testContent);

      expect(await fs.pathExists(gitExcludePath)).toBe(true);
      const writtenContent = await fs.readFile(gitExcludePath, 'utf8');
      expect(writtenContent).toBe(testContent);
    });

    it('should overwrite existing exclude file', async () => {
      const initialContent = '# Initial content\n*.old\n';
      const newContent = '# New content\n*.new\n';

      await fs.writeFile(gitExcludePath, initialContent);
      await gitService.writeGitExcludeFile(newContent);

      const writtenContent = await fs.readFile(gitExcludePath, 'utf8');
      expect(writtenContent).toBe(newContent);
      expect(writtenContent).not.toContain('*.old');
    });

    it('should create .git/info directory if it does not exist', async () => {
      // Remove the .git/info directory
      await fs.remove(path.dirname(gitExcludePath));

      const testContent = '# Test content\n';
      await gitService.writeGitExcludeFile(testContent);

      expect(await fs.pathExists(gitExcludePath)).toBe(true);
      const writtenContent = await fs.readFile(gitExcludePath, 'utf8');
      expect(writtenContent).toBe(testContent);
    });

    it('should throw error when not in git repository', async () => {
      jest.spyOn(gitService, 'isRepository').mockResolvedValue(false);

      await expect(gitService.writeGitExcludeFile('test')).rejects.toThrow();
    });
  });

  describe('getPgitManagedExcludes', () => {
    it('should return empty array when exclude file does not exist', async () => {
      const result = await gitService.getPgitManagedExcludes();
      expect(result).toEqual([]);
    });

    it('should return empty array when no pgit marker exists', async () => {
      const existingContent = '# Other exclusions\n*.log\n*.tmp\n';
      await fs.writeFile(gitExcludePath, existingContent);

      const result = await gitService.getPgitManagedExcludes();
      expect(result).toEqual([]);
    });

    it('should return pgit-managed entries only', async () => {
      const existingContent = '# Other exclusions\n*.log\n';
      await fs.writeFile(gitExcludePath, existingContent);

      const testPaths = ['file1.txt', 'file2.txt'];
      await gitService.addMultipleToGitExclude(testPaths);

      const result = await gitService.getPgitManagedExcludes();
      expect(result).toEqual(expect.arrayContaining(testPaths));
      expect(result).toHaveLength(2);
    });

    it('should stop at next comment section', async () => {
      // Create exclude file with multiple sections
      const content = [
        '# Other exclusions',
        '*.log',
        PGIT_MARKER_COMMENT,
        'file1.txt',
        'file2.txt',
        '# Another section',
        'other-file.txt',
      ].join('\n');

      await fs.writeFile(gitExcludePath, content);

      const result = await gitService.getPgitManagedExcludes();
      expect(result).toEqual(['file1.txt', 'file2.txt']);
      expect(result).not.toContain('other-file.txt');
    });

    it('should handle empty lines in pgit section', async () => {
      const content = [PGIT_MARKER_COMMENT, 'file1.txt', '', 'file2.txt', ''].join('\n');

      await fs.writeFile(gitExcludePath, content);

      const result = await gitService.getPgitManagedExcludes();
      expect(result).toEqual(['file1.txt', 'file2.txt']);
    });
  });

  describe('integration tests', () => {
    it('should handle multiple files correctly', async () => {
      const files = ['file1.txt', 'file2.txt', 'file3.txt'];

      // Add all files
      for (const file of files) {
        await gitService.addToGitExclude(file);
      }

      // Verify all files are in exclude
      for (const file of files) {
        expect(await gitService.isInGitExclude(file)).toBe(true);
      }

      // Remove middle file
      await gitService.removeFromGitExclude(files[1]);

      // Verify correct files remain
      expect(await gitService.isInGitExclude(files[0])).toBe(true);
      expect(await gitService.isInGitExclude(files[1])).toBe(false);
      expect(await gitService.isInGitExclude(files[2])).toBe(true);
    });

    it('should preserve existing exclude entries', async () => {
      const existingEntries = ['*.log', '*.tmp', 'node_modules/'];
      const pgitEntry = 'pgit-managed-file.txt';

      // Create exclude file with existing entries
      const existingContent = existingEntries.join('\n') + '\n';
      await fs.writeFile(gitExcludePath, existingContent);

      // Add pgit entry
      await gitService.addToGitExclude(pgitEntry);

      // Verify all entries exist
      const content = await fs.readFile(gitExcludePath, 'utf8');
      for (const entry of existingEntries) {
        expect(content).toContain(entry);
      }
      expect(content).toContain(pgitEntry);

      // Remove pgit entry
      await gitService.removeFromGitExclude(pgitEntry);

      // Verify existing entries are preserved
      const finalContent = await fs.readFile(gitExcludePath, 'utf8');
      for (const entry of existingEntries) {
        expect(finalContent).toContain(entry);
      }
      expect(finalContent).not.toContain(pgitEntry);
      expect(finalContent).not.toContain(PGIT_MARKER_COMMENT);
    });

    it('should handle batch operations efficiently', async () => {
      const existingEntries = ['*.log', '*.tmp'];
      const batchFiles = ['batch1.txt', 'batch2.txt', 'batch3.txt'];

      // Create exclude file with existing entries
      const existingContent = existingEntries.join('\n') + '\n';
      await fs.writeFile(gitExcludePath, existingContent);

      // Add batch files
      await gitService.addMultipleToGitExclude(batchFiles);

      // Verify all entries exist
      const content = await fs.readFile(gitExcludePath, 'utf8');
      for (const entry of existingEntries) {
        expect(content).toContain(entry);
      }
      for (const file of batchFiles) {
        expect(content).toContain(file);
      }
      expect(content).toContain(PGIT_MARKER_COMMENT);

      // Get pgit-managed entries
      const pgitEntries = await gitService.getPgitManagedExcludes();
      expect(pgitEntries).toEqual(expect.arrayContaining(batchFiles));
      expect(pgitEntries).toHaveLength(3);

      // Remove batch files
      await gitService.removeMultipleFromGitExclude(batchFiles);

      // Verify existing entries are preserved and pgit entries are removed
      const finalContent = await fs.readFile(gitExcludePath, 'utf8');
      for (const entry of existingEntries) {
        expect(finalContent).toContain(entry);
      }
      for (const file of batchFiles) {
        expect(finalContent).not.toContain(file);
      }
      expect(finalContent).not.toContain(PGIT_MARKER_COMMENT);
    });

    it('should handle mixed single and batch operations', async () => {
      const singleFile = 'single-file.txt';
      const batchFiles = ['batch1.txt', 'batch2.txt'];

      // Add single file first
      await gitService.addToGitExclude(singleFile);

      // Add batch files
      await gitService.addMultipleToGitExclude(batchFiles);

      // Verify all files are present
      expect(await gitService.isInGitExclude(singleFile)).toBe(true);
      for (const file of batchFiles) {
        expect(await gitService.isInGitExclude(file)).toBe(true);
      }

      // Get all pgit-managed entries
      const pgitEntries = await gitService.getPgitManagedExcludes();
      expect(pgitEntries).toEqual(expect.arrayContaining([singleFile, ...batchFiles]));
      expect(pgitEntries).toHaveLength(3);

      // Remove batch files only
      await gitService.removeMultipleFromGitExclude(batchFiles);

      // Verify single file remains
      expect(await gitService.isInGitExclude(singleFile)).toBe(true);
      for (const file of batchFiles) {
        expect(await gitService.isInGitExclude(file)).toBe(false);
      }

      // Pgit marker should still exist since single file remains
      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain(PGIT_MARKER_COMMENT);
    });
  });
});
describe('GitService - Enhanced Git State Detection', () => {
  let gitService: GitService;
  let fileSystemService: FileSystemService;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pgit-git-state-test-'));
    testFilePath = path.join(tempDir, 'test-file.txt');

    // Initialize git repository structure
    await fs.ensureDir(path.join(tempDir, '.git', 'info'));

    fileSystemService = new FileSystemService();
    gitService = new GitService(tempDir, fileSystemService);

    // Mock isRepository to return true for our test directory
    jest.spyOn(gitService, 'isRepository').mockResolvedValue(true);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
    jest.restoreAllMocks();
  });

  describe('getFileGitState', () => {
    it('should return default state for non-git repository', async () => {
      jest.spyOn(gitService, 'isRepository').mockResolvedValue(false);

      const state = await gitService.getFileGitState('test-file.txt');

      expect(state).toEqual({
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: 'test-file.txt',
        timestamp: expect.any(Date),
      });
    });

    it('should throw error for empty file path', async () => {
      await expect(gitService.getFileGitState('')).rejects.toThrow(GitOperationError);
      await expect(gitService.getFileGitState('   ')).rejects.toThrow(GitOperationError);
    });

    it('should detect untracked file state', async () => {
      // Create a test file
      await fs.writeFile(testFilePath, 'test content');

      // Mock git status to show file as untracked
      jest.spyOn(gitService, 'getStatus').mockResolvedValue({
        current: 'main',
        tracking: null,
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        untracked: ['test-file.txt'],
        deleted: [],
        conflicted: [],
        isClean: false,
        files: [{ path: 'test-file.txt', index: '?', working_dir: '?' }],
      });

      jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(false);

      const state = await gitService.getFileGitState('test-file.txt');

      expect(state.isUntracked).toBe(true);
      expect(state.isTracked).toBe(false);
      expect(state.isStaged).toBe(false);
      expect(state.isModified).toBe(false);
      expect(state.isExcluded).toBe(false);
      expect(state.originalPath).toBe('test-file.txt');
    });

    it('should detect tracked and staged file state', async () => {
      // Mock git status to show file as staged
      jest.spyOn(gitService, 'getStatus').mockResolvedValue({
        current: 'main',
        tracking: null,
        ahead: 0,
        behind: 0,
        staged: ['test-file.txt'],
        modified: [],
        untracked: [],
        deleted: [],
        conflicted: [],
        isClean: false,
        files: [{ path: 'test-file.txt', index: 'A', working_dir: ' ' }],
      });

      jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(false);

      const state = await gitService.getFileGitState('test-file.txt');

      expect(state.isTracked).toBe(true);
      expect(state.isStaged).toBe(true);
      expect(state.isUntracked).toBe(false);
      expect(state.isModified).toBe(false);
      expect(state.isExcluded).toBe(false);
    });

    it('should detect tracked and modified file state', async () => {
      // Mock git status to show file as modified
      jest.spyOn(gitService, 'getStatus').mockResolvedValue({
        current: 'main',
        tracking: null,
        ahead: 0,
        behind: 0,
        staged: [],
        modified: ['test-file.txt'],
        untracked: [],
        deleted: [],
        conflicted: [],
        isClean: false,
        files: [{ path: 'test-file.txt', index: ' ', working_dir: 'M' }],
      });

      jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(false);

      const state = await gitService.getFileGitState('test-file.txt');

      expect(state.isTracked).toBe(true);
      expect(state.isStaged).toBe(false);
      expect(state.isUntracked).toBe(false);
      expect(state.isModified).toBe(true);
      expect(state.isExcluded).toBe(false);
    });

    it('should detect excluded file state', async () => {
      // Mock git status to show no file status (clean or excluded)
      jest.spyOn(gitService, 'getStatus').mockResolvedValue({
        current: 'main',
        tracking: null,
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        untracked: [],
        deleted: [],
        conflicted: [],
        isClean: true,
        files: [],
      });

      jest.spyOn(gitService, 'isTracked').mockResolvedValue(false);
      jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(true);

      const state = await gitService.getFileGitState('test-file.txt');

      expect(state.isExcluded).toBe(true);
      expect(state.isUntracked).toBe(false);
      expect(state.isTracked).toBe(false);
      expect(state.isStaged).toBe(false);
      expect(state.isModified).toBe(false);
    });

    it('should detect clean tracked file state', async () => {
      // Mock git status to show no file status (clean tracked file)
      jest.spyOn(gitService, 'getStatus').mockResolvedValue({
        current: 'main',
        tracking: null,
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        untracked: [],
        deleted: [],
        conflicted: [],
        isClean: true,
        files: [],
      });

      jest.spyOn(gitService, 'isTracked').mockResolvedValue(true);
      jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(false);

      const state = await gitService.getFileGitState('test-file.txt');

      expect(state.isTracked).toBe(true);
      expect(state.isStaged).toBe(false);
      expect(state.isUntracked).toBe(false);
      expect(state.isModified).toBe(false);
      expect(state.isExcluded).toBe(false);
    });

    it('should detect staged and modified file state', async () => {
      // Mock git status to show file as both staged and modified
      jest.spyOn(gitService, 'getStatus').mockResolvedValue({
        current: 'main',
        tracking: null,
        ahead: 0,
        behind: 0,
        staged: ['test-file.txt'],
        modified: ['test-file.txt'],
        untracked: [],
        deleted: [],
        conflicted: [],
        isClean: false,
        files: [{ path: 'test-file.txt', index: 'M', working_dir: 'M' }],
      });

      jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(false);

      const state = await gitService.getFileGitState('test-file.txt');

      expect(state.isTracked).toBe(true);
      expect(state.isStaged).toBe(true);
      expect(state.isUntracked).toBe(false);
      expect(state.isModified).toBe(true);
      expect(state.isExcluded).toBe(false);
    });

    it('should handle git status errors gracefully', async () => {
      jest.spyOn(gitService, 'getStatus').mockRejectedValue(new Error('Git status failed'));

      await expect(gitService.getFileGitState('test-file.txt')).rejects.toThrow(GitOperationError);
    });

    it('should include timestamp in state', async () => {
      const beforeTime = new Date();

      jest.spyOn(gitService, 'getStatus').mockResolvedValue({
        current: 'main',
        tracking: null,
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        untracked: [],
        deleted: [],
        conflicted: [],
        isClean: true,
        files: [],
      });

      jest.spyOn(gitService, 'isTracked').mockResolvedValue(false);
      jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(false);

      const state = await gitService.getFileGitState('test-file.txt');
      const afterTime = new Date();

      expect(state.timestamp).toBeInstanceOf(Date);
      expect(state.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(state.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should normalize file paths', async () => {
      const pathWithSpaces = '  test-file.txt  ';

      jest.spyOn(gitService, 'getStatus').mockResolvedValue({
        current: 'main',
        tracking: null,
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        untracked: [],
        deleted: [],
        conflicted: [],
        isClean: true,
        files: [],
      });

      jest.spyOn(gitService, 'isTracked').mockResolvedValue(false);
      jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(false);

      const state = await gitService.getFileGitState(pathWithSpaces);

      expect(state.originalPath).toBe('test-file.txt');
    });
  });

  describe('integration with exclude functionality', () => {
    it('should correctly detect state changes after adding to exclude', async () => {
      const testPath = 'test-file.txt';

      // Initially file is untracked
      jest.spyOn(gitService, 'getStatus').mockResolvedValue({
        current: 'main',
        tracking: null,
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        untracked: [testPath],
        deleted: [],
        conflicted: [],
        isClean: false,
        files: [{ path: testPath, index: '?', working_dir: '?' }],
      });

      // Mock exclude check to return false initially
      const isInGitExcludeSpy = jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(false);

      let state = await gitService.getFileGitState(testPath);
      expect(state.isUntracked).toBe(true);
      expect(state.isExcluded).toBe(false);

      // Add to exclude file
      isInGitExcludeSpy.mockResolvedValue(true);

      // After adding to exclude, file should show as excluded
      state = await gitService.getFileGitState(testPath);
      expect(state.isUntracked).toBe(true);
      expect(state.isExcluded).toBe(true);
    });

    it('should handle multiple state combinations correctly', async () => {
      const testCases = [
        {
          name: 'untracked and excluded',
          gitStatus: { path: 'file.txt', index: '?', working_dir: '?' },
          isTracked: false,
          isExcluded: true,
          expected: { isUntracked: true, isTracked: false, isExcluded: true },
        },
        {
          name: 'tracked and excluded',
          gitStatus: null, // Not in git status (clean)
          isTracked: true,
          isExcluded: true,
          expected: { isUntracked: false, isTracked: true, isExcluded: true },
        },
        {
          name: 'staged and excluded',
          gitStatus: { path: 'file.txt', index: 'A', working_dir: ' ' },
          isTracked: true,
          isExcluded: true,
          expected: { isUntracked: false, isTracked: true, isStaged: true, isExcluded: true },
        },
      ];

      for (const testCase of testCases) {
        const files = testCase.gitStatus ? [testCase.gitStatus] : [];

        jest.spyOn(gitService, 'getStatus').mockResolvedValue({
          current: 'main',
          tracking: null,
          ahead: 0,
          behind: 0,
          staged: [],
          modified: [],
          untracked: [],
          deleted: [],
          conflicted: [],
          isClean: files.length === 0,
          files,
        });

        jest.spyOn(gitService, 'isTracked').mockResolvedValue(testCase.isTracked);
        jest.spyOn(gitService, 'isInGitExclude').mockResolvedValue(testCase.isExcluded);

        const state = await gitService.getFileGitState('file.txt');

        for (const [key, value] of Object.entries(testCase.expected)) {
          expect(state[key as keyof typeof state]).toBe(value);
        }
      }
    });
  });
});
