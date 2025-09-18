import { AddCommand } from '../../commands/add.command';

describe('Enhanced Git State Detection Integration', () => {
  let addCommand: AddCommand;
  const testWorkingDir = '/test/workspace';

  beforeEach(() => {
    addCommand = new AddCommand(testWorkingDir);
  });

  describe('AddCommand enhanced git state methods', () => {
    it('should have enhanced git state methods available', () => {
      // Verify that both legacy and enhanced methods exist
      expect(typeof (addCommand as any).getFileGitState).toBe('function');
      expect(typeof (addCommand as any).getEnhancedFileGitState).toBe('function');
    });

    it('should return default state when git operations fail', async () => {
      // Test the enhanced method with a non-existent file
      const result = await (addCommand as any).getEnhancedFileGitState('non-existent-file.txt');

      expect(result).toEqual({
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: 'non-existent-file.txt',
        timestamp: expect.any(Date),
      });
    });

    it('should return legacy format for backward compatibility', async () => {
      // Test the legacy method with a non-existent file
      const result = await (addCommand as any).getFileGitState('non-existent-file.txt');

      expect(result).toEqual({
        isTracked: false,
        isStaged: false,
      });
    });
  });
});
