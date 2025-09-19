import { FileSystemService } from '../../core/filesystem.service';
import * as fs from 'fs-extra';

// Mock fs-extra for testing
jest.mock('fs-extra');

describe('FileSystemService - CI Integration Tests', () => {
  let fileSystemService: FileSystemService;

  beforeEach(() => {
    fileSystemService = new FileSystemService();
    jest.clearAllMocks();
  });

  it('should handle directory creation errors gracefully in CI', async () => {
    // Simulate CI environment
    const originalCI = process.env['CI'];
    process.env['CI'] = 'true';

    try {
      const mockedFs = jest.mocked(fs);
      mockedFs.mkdir.mockImplementationOnce(() => {
        throw new Error('Disk full');
      });

      // In CI mode, errors should be logged but not thrown
      await expect(fileSystemService.createDirectory('/test/dir')).resolves.toBeUndefined();

    } finally {
      // Restore original CI environment
      process.env['CI'] = originalCI;
    }
  });

  it('should work normally in non-CI environment', async () => {
    // Ensure we're not in CI mode
    const originalCI = process.env['CI'];
    delete process.env['CI'];

    try {
      const mockedFs = jest.mocked(fs);
      mockedFs.mkdir.mockImplementation(() => Promise.resolve());
      mockedFs.pathExists.mockImplementation(() => Promise.resolve(true));

      // In non-CI mode, should work normally
      await expect(fileSystemService.createDirectory('/test/dir')).resolves.toBeUndefined();

    } finally {
      // Restore original CI environment
      process.env['CI'] = originalCI;
    }
  });
});