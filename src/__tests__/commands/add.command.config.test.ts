import { AddCommand } from '../../commands/add.command';
import { ConfigManager } from '../../core/config.manager';
import { FileSystemService } from '../../core/filesystem.service';
import { GitExcludeSettings } from '../../types/config.types';
import * as path from 'path';
import * as fs from 'fs-extra';
import { simpleGit } from 'simple-git';

describe('AddCommand - Configuration Integration', () => {
  let addCommand: AddCommand;
  let configManager: ConfigManager;
  let fileSystem: FileSystemService;
  let tempDir: string;
  let git: any;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(__dirname, '../../../test-temp/add-config-'));
    fileSystem = new FileSystemService();
    
    // Initialize git repository
    git = simpleGit(tempDir);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Create initial commit
    await fs.writeFile(path.join(tempDir, 'README.md'), '# Test Repository');
    await git.add('README.md');
    await git.commit('Initial commit');

    // Initialize pgit
    addCommand = new AddCommand(tempDir);
    configManager = new ConfigManager(tempDir, fileSystem);
    await configManager.create(tempDir);

    // Create private storage and initialize private git
    const privateStoragePath = path.join(tempDir, '.private-storage');
    await fs.ensureDir(privateStoragePath);
    const privateGit = simpleGit(privateStoragePath);
    await privateGit.init();
    await privateGit.addConfig('user.name', 'Test User');
    await privateGit.addConfig('user.email', 'test@example.com');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('exclude operations with default configuration', () => {
    it('should use default exclude settings', async () => {
      const testFile = path.join(tempDir, 'test-file.txt');
      await fs.writeFile(testFile, 'test content');

      await addCommand.execute('test-file.txt', { verbose: false });

      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      const content = await fs.readFile(excludePath, 'utf8');

      expect(content).toContain('# pgit-cli managed exclusions');
      expect(content).toContain('test-file.txt');
    });

    it('should handle multiple files with default settings', async () => {
      const testFiles = ['file1.txt', 'file2.txt', 'file3.txt'];
      
      for (const fileName of testFiles) {
        const filePath = path.join(tempDir, fileName);
        await fs.writeFile(filePath, `content of ${fileName}`);
      }

      await addCommand.execute(testFiles, { verbose: false });

      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      const content = await fs.readFile(excludePath, 'utf8');

      expect(content).toContain('# pgit-cli managed exclusions');
      for (const fileName of testFiles) {
        expect(content).toContain(fileName);
      }
    });
  });

  describe('exclude operations with custom configuration', () => {

    it('should use custom marker comment', async () => {
      // Update configuration using AddCommand's configManager
      const customExcludeSettings: Partial<GitExcludeSettings> = {
        markerComment: '# custom test marker for pgit',
        fallbackBehavior: 'warn',
      };
      await (addCommand as any).configManager.updateGitExcludeSettings(customExcludeSettings);
      
      // Verify the configuration was updated
      const updatedConfig = await (addCommand as any).configManager.load();
      console.log('Updated config marker:', updatedConfig.settings.gitExclude.markerComment);
      
      // Test GitService creation
      const testGitService = await (addCommand as any).createGitService();
      const testExcludeSettings = (testGitService as any).excludeSettings;
      console.log('GitService marker:', testExcludeSettings.markerComment);
      
      const testFile = path.join(tempDir, 'custom-test.txt');
      await fs.writeFile(testFile, 'test content');

      await addCommand.execute('custom-test.txt', { verbose: false });

      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      const content = await fs.readFile(excludePath, 'utf8');
      console.log('Exclude file content:', content);

      expect(content).toContain('# custom test marker for pgit');
      expect(content).toContain('custom-test.txt');
      expect(content).not.toContain('# pgit-cli managed exclusions');
    });

    it('should persist custom settings across multiple operations', async () => {
      // Update configuration using AddCommand's configManager
      const customExcludeSettings: Partial<GitExcludeSettings> = {
        markerComment: '# custom test marker for pgit',
        fallbackBehavior: 'warn',
      };
      await (addCommand as any).configManager.updateGitExcludeSettings(customExcludeSettings);
      
      const testFile1 = path.join(tempDir, 'persistent-test1.txt');
      const testFile2 = path.join(tempDir, 'persistent-test2.txt');
      
      await fs.writeFile(testFile1, 'test content 1');
      await fs.writeFile(testFile2, 'test content 2');

      await addCommand.execute('persistent-test1.txt', { verbose: false });
      await addCommand.execute('persistent-test2.txt', { verbose: false });

      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      const content = await fs.readFile(excludePath, 'utf8');

      // Should only have one instance of the custom marker
      const markerCount = (content.match(/# custom test marker for pgit/g) || []).length;
      expect(markerCount).toBe(1);

      expect(content).toContain('persistent-test1.txt');
      expect(content).toContain('persistent-test2.txt');
    });
  });

  describe('exclude operations with disabled configuration', () => {

    it('should skip exclude operations when disabled', async () => {
      // Update configuration using AddCommand's configManager
      const disabledExcludeSettings: Partial<GitExcludeSettings> = {
        enabled: false,
        fallbackBehavior: 'warn',
      };
      await (addCommand as any).configManager.updateGitExcludeSettings(disabledExcludeSettings);
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const testFile = path.join(tempDir, 'disabled-test.txt');
      await fs.writeFile(testFile, 'test content');

      await addCommand.execute('disabled-test.txt', { verbose: false });

      // Should still create symlink and add to private git
      const symlinkPath = path.join(tempDir, 'disabled-test.txt');
      const stats = await fs.lstat(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);

      // But should not create exclude file
      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      if (await fs.pathExists(excludePath)) {
        const content = await fs.readFile(excludePath, 'utf8');
        expect(content).not.toContain('disabled-test.txt');
      }

      // Should have logged warnings about skipped operations
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Git exclude operation 'add' for 'disabled-test.txt' skipped")
      );

      consoleSpy.mockRestore();
    });

    it('should handle batch operations with disabled exclude', async () => {
      // Update configuration using AddCommand's configManager
      const disabledExcludeSettings: Partial<GitExcludeSettings> = {
        enabled: false,
        fallbackBehavior: 'warn',
      };
      await (addCommand as any).configManager.updateGitExcludeSettings(disabledExcludeSettings);
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const testFiles = ['batch1.txt', 'batch2.txt'];
      
      for (const fileName of testFiles) {
        const filePath = path.join(tempDir, fileName);
        await fs.writeFile(filePath, `content of ${fileName}`);
      }

      await addCommand.execute(testFiles, { verbose: false });

      // All files should be processed but exclude operations skipped
      for (const fileName of testFiles) {
        const symlinkPath = path.join(tempDir, fileName);
        const stats = await fs.lstat(symlinkPath);
        expect(stats.isSymbolicLink()).toBe(true);
      }

      // Should have logged warnings for each file
      expect(consoleSpy).toHaveBeenCalledTimes(testFiles.length);

      consoleSpy.mockRestore();
    });
  });

  describe('exclude operations with error fallback', () => {
    it('should throw error when exclude operations are disabled with error fallback', async () => {
      // Update configuration using AddCommand's configManager
      const errorExcludeSettings: Partial<GitExcludeSettings> = {
        enabled: false,
        fallbackBehavior: 'error',
      };
      await (addCommand as any).configManager.updateGitExcludeSettings(errorExcludeSettings);
      
      const testFile = path.join(tempDir, 'error-test.txt');
      await fs.writeFile(testFile, 'test content');

      await expect(addCommand.execute('error-test.txt', { verbose: false }))
        .rejects.toThrow('Exclude operations are disabled');
    });
  });

  describe('exclude operations with silent fallback', () => {
    it('should silently skip exclude operations', async () => {
      // Update configuration using AddCommand's configManager
      const silentExcludeSettings: Partial<GitExcludeSettings> = {
        enabled: false,
        fallbackBehavior: 'silent',
      };
      await (addCommand as any).configManager.updateGitExcludeSettings(silentExcludeSettings);
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const testFile = path.join(tempDir, 'silent-test.txt');
      await fs.writeFile(testFile, 'test content');

      await addCommand.execute('silent-test.txt', { verbose: false });

      // Should not log any warnings
      expect(consoleSpy).not.toHaveBeenCalled();

      // Should still create symlink
      const symlinkPath = path.join(tempDir, 'silent-test.txt');
      const stats = await fs.lstat(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('configuration loading fallback', () => {
    it('should use default settings when config loading fails', async () => {
      // Corrupt the config file
      const configPath = path.join(tempDir, '.private-config.json');
      await fs.writeFile(configPath, 'invalid json');

      const testFile = path.join(tempDir, 'fallback-test.txt');
      await fs.writeFile(testFile, 'test content');

      // Should not throw error and use default settings
      await addCommand.execute('fallback-test.txt', { verbose: false });

      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      const content = await fs.readFile(excludePath, 'utf8');

      // Should use default marker comment
      expect(content).toContain('# pgit-cli managed exclusions');
      expect(content).toContain('fallback-test.txt');
    });

    it('should handle missing config file gracefully', async () => {
      // Remove config file
      const configPath = path.join(tempDir, '.private-config.json');
      await fs.remove(configPath);

      const testFile = path.join(tempDir, 'missing-config-test.txt');
      await fs.writeFile(testFile, 'test content');

      // Should not throw error and use default settings
      await addCommand.execute('missing-config-test.txt', { verbose: false });

      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      const content = await fs.readFile(excludePath, 'utf8');

      // Should use default marker comment
      expect(content).toContain('# pgit-cli managed exclusions');
      expect(content).toContain('missing-config-test.txt');
    });
  });

  describe('rollback with configuration', () => {
    it('should respect configuration during rollback operations', async () => {
      // Update configuration using AddCommand's configManager
      const customExcludeSettings: Partial<GitExcludeSettings> = {
        markerComment: '# rollback test marker',
      };
      await (addCommand as any).configManager.updateGitExcludeSettings(customExcludeSettings);

      const testFile = path.join(tempDir, 'rollback-test.txt');
      await fs.writeFile(testFile, 'test content');

      // Add file successfully
      await addCommand.execute('rollback-test.txt', { verbose: false });

      // Verify exclude file has custom marker
      const excludePath = path.join(tempDir, '.git', 'info', 'exclude');
      let content = await fs.readFile(excludePath, 'utf8');
      expect(content).toContain('# rollback test marker');
      expect(content).toContain('rollback-test.txt');

      // Simulate rollback by manually calling restore methods
      // (This would normally happen during error scenarios)
      const gitService = (addCommand as any).createGitService();
      await (await gitService).removeFromGitExclude('rollback-test.txt');

      // Verify file was removed from exclude
      content = await fs.readFile(excludePath, 'utf8');
      expect(content).not.toContain('rollback-test.txt');
      expect(content).toContain('# rollback test marker'); // Marker should remain
    });
  });
});