import { GitService } from '../../core/git.service';
import { FileSystemService } from '../../core/filesystem.service';
import { GitOperationError } from '../../errors/git.error';
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
      expect(content).toContain('# pgit-cli managed exclusions');
      expect(content).toContain(testPath);
    });

    it('should add path to existing exclude file', async () => {
      const existingContent = '# Existing exclusions\n*.log\n';
      await fs.writeFile(gitExcludePath, existingContent);
      
      const testPath = 'test-file.txt';
      await gitService.addToGitExclude(testPath);
      
      const content = await fs.readFile(gitExcludePath, 'utf8');
      expect(content).toContain('*.log'); // Preserve existing content
      expect(content).toContain('# pgit-cli managed exclusions');
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
      const markerOccurrences = (content.match(/# pgit-cli managed exclusions/g) || []).length;
      expect(markerOccurrences).toBe(1);
    });

    it('should throw error for empty path', async () => {
      await expect(gitService.addToGitExclude('')).rejects.toThrow(GitOperationError);
      await expect(gitService.addToGitExclude('   ')).rejects.toThrow(GitOperationError);
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
      expect(content).not.toContain('# pgit-cli managed exclusions');
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
      await expect(gitService.removeFromGitExclude('')).rejects.toThrow(GitOperationError);
      await expect(gitService.removeFromGitExclude('   ')).rejects.toThrow(GitOperationError);
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
      expect(finalContent).not.toContain('# pgit-cli managed exclusions');
    });
  });
});