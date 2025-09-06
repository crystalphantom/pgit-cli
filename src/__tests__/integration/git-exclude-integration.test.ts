import { GitService } from '../../core/git.service';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('GitService - Exclude Integration Tests', () => {
  let gitService: GitService;
  let tempDir: string;
  let gitExcludePath: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pgit-integration-'));
    
    // Initialize git repository structure
    await fs.ensureDir(path.join(tempDir, '.git', 'info'));
    gitExcludePath = path.join(tempDir, '.git', 'info', 'exclude');
    
    gitService = new GitService(tempDir);
    
    // Mock isRepository to return true for our test directory
    jest.spyOn(gitService, 'isRepository').mockResolvedValue(true);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
    jest.restoreAllMocks();
  });

  it('should handle complete exclude lifecycle', async () => {
    const testFiles = ['config.json', 'secrets.env', 'private/data.txt'];
    
    // Add all files to exclude
    for (const file of testFiles) {
      await gitService.addToGitExclude(file);
    }
    
    // Verify all files are excluded
    for (const file of testFiles) {
      expect(await gitService.isInGitExclude(file)).toBe(true);
    }
    
    // Verify exclude file structure
    const content = await fs.readFile(gitExcludePath, 'utf8');
    expect(content).toContain('# pgit-cli managed exclusions');
    for (const file of testFiles) {
      expect(content).toContain(file);
    }
    
    // Remove one file
    await gitService.removeFromGitExclude(testFiles[1]);
    
    // Verify partial removal
    expect(await gitService.isInGitExclude(testFiles[0])).toBe(true);
    expect(await gitService.isInGitExclude(testFiles[1])).toBe(false);
    expect(await gitService.isInGitExclude(testFiles[2])).toBe(true);
    
    // Remove remaining files
    await gitService.removeFromGitExclude(testFiles[0]);
    await gitService.removeFromGitExclude(testFiles[2]);
    
    // Verify complete cleanup
    expect(await fs.pathExists(gitExcludePath)).toBe(false);
  });

  it('should work correctly with existing exclude entries', async () => {
    // Create exclude file with existing entries
    const existingEntries = [
      '# IDE files',
      '.vscode/',
      '.idea/',
      '',
      '# Build artifacts', 
      'dist/',
      'node_modules/',
      ''
    ];
    await fs.writeFile(gitExcludePath, existingEntries.join('\n'));
    
    const pgitFiles = ['secret.key', 'config.local.json'];
    
    // Add pgit files
    for (const file of pgitFiles) {
      await gitService.addToGitExclude(file);
    }
    
    // Verify pgit files are added
    for (const file of pgitFiles) {
      expect(await gitService.isInGitExclude(file)).toBe(true);
    }
    
    // Verify existing entries are preserved
    const content = await fs.readFile(gitExcludePath, 'utf8');
    expect(content).toContain('.vscode/');
    expect(content).toContain('node_modules/');
    expect(content).toContain('# pgit-cli managed exclusions');
    
    // Remove pgit files
    for (const file of pgitFiles) {
      await gitService.removeFromGitExclude(file);
    }
    
    // Verify pgit files are removed but existing entries remain
    const finalContent = await fs.readFile(gitExcludePath, 'utf8');
    expect(finalContent).toContain('.vscode/');
    expect(finalContent).toContain('node_modules/');
    expect(finalContent).not.toContain('# pgit-cli managed exclusions');
    for (const file of pgitFiles) {
      expect(finalContent).not.toContain(file);
    }
  });
});