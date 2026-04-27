// @ts-nocheck - Jest mock typing issues
import { FileSystemService } from '../../core/filesystem.service';
import * as fs from 'fs-extra';
import { promises as fsPromises } from 'fs';
import { PlatformDetector } from '../../utils/platform.detector';
import {
  FileSystemError,
  InvalidPathError,
  FileNotFoundError,
  PermissionError,
  AtomicOperationError,
} from '../../errors/filesystem.error';

// Mock fs-extra and native fs.promises
jest.mock('fs-extra');
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    promises: {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      stat: jest.fn(),
      lstat: jest.fn(),
      chmod: jest.fn(),
    },
  };
});
jest.mock('../../utils/platform.detector');

const mockedFs = jest.mocked(fs);
const mockedFsPromises = jest.mocked(fsPromises);
const mockedPlatformDetector = jest.mocked(PlatformDetector);

describe('FileSystemService', () => {
  let fileSystemService: FileSystemService;

  beforeEach(() => {
    fileSystemService = new FileSystemService();
    jest.clearAllMocks();
    mockedPlatformDetector.checkPermissions.mockResolvedValue({ readable: true, writable: true });
  });

  describe('pathExists', () => {
    it('should return true when path exists', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      const result = await fileSystemService.pathExists('/test/path');
      expect(result).toBe(true);
      expect(mockedFs.pathExists).toHaveBeenCalledWith('/test/path');
    });

    it('should return false when path does not exist', async () => {
      mockedFs.pathExists.mockResolvedValue(false);
      const result = await fileSystemService.pathExists('/nonexistent/path');
      expect(result).toBe(false);
      expect(mockedFs.pathExists).toHaveBeenCalledWith('/nonexistent/path');
    });

    it('should throw error when fs operation fails', async () => {
      const error = new Error('Permission denied');
      mockedFs.pathExists.mockRejectedValue(error);
      await expect(fileSystemService.pathExists('/test/path')).rejects.toThrow(Error);
    });
  });

  describe('readFile', () => {
    it('should read file content successfully', async () => {
      const content = 'test file content';
      mockedFsPromises.readFile.mockResolvedValue(content);
      mockedFs.pathExists.mockResolvedValue(true);
      const result = await fileSystemService.readFile('/test/file.txt');
      expect(result).toBe(content);
      expect(mockedFsPromises.readFile).toHaveBeenCalledWith('/test/file.txt', 'utf8');
    });

    it('should throw FileNotFoundError when file does not exist', async () => {
      mockedFs.pathExists.mockResolvedValue(false);
      await expect(fileSystemService.readFile('/nonexistent.txt')).rejects.toThrow(
        FileNotFoundError,
      );
    });

    it('should throw PermissionError when file is not readable', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      mockedPlatformDetector.checkPermissions.mockResolvedValue({
        readable: false,
        writable: true,
      });
      await expect(fileSystemService.readFile('/test/file.txt')).rejects.toThrow(PermissionError);
    });

    it('should throw FileNotFoundError for ENOENT error', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      const error = new Error('ENOENT: no such file or directory');
      (error as any).code = 'ENOENT';
      mockedFsPromises.readFile.mockRejectedValue(error);
      await expect(fileSystemService.readFile('/test/file.txt')).rejects.toThrow(FileNotFoundError);
    });

    it('should throw FileSystemError for other read errors', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      const error = new Error('Permission denied');
      mockedFsPromises.readFile.mockRejectedValue(error);
      await expect(fileSystemService.readFile('/test/file.txt')).rejects.toThrow(FileSystemError);
    });
  });

  describe('writeFile', () => {
    it('should write file content successfully', async () => {
      mockedFsPromises.writeFile.mockResolvedValue(undefined);
      await fileSystemService.writeFile('/test/file.txt', 'content');
      expect(mockedFsPromises.writeFile).toHaveBeenCalledWith('/test/file.txt', 'content', 'utf8');
    });

    it('should throw FileSystemError when write fails', async () => {
      const error = new Error('Permission denied');
      mockedFsPromises.writeFile.mockRejectedValue(error);
      await expect(fileSystemService.writeFile('/test/file.txt', 'content')).rejects.toThrow(
        FileSystemError,
      );
    });
  });

  describe('createDirectory', () => {
    it('should create directory successfully', async () => {
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFsPromises.chmod.mockResolvedValue(undefined);
      mockedPlatformDetector.isUnix.mockReturnValue(true);
      await fileSystemService.createDirectory('/test/newdir');
      expect(mockedFs.ensureDir).toHaveBeenCalledWith('/test/newdir');
      // In CI mode, pathExists verification is skipped
      expect(mockedFs.pathExists).not.toHaveBeenCalled();
    });

    it('should handle directory creation errors gracefully in CI', async () => {
      const error = new Error('Permission denied');
      mockedFs.ensureDir.mockRejectedValue(error);
      // In CI mode, errors are logged but don't throw
      await expect(fileSystemService.createDirectory('/test/newdir')).resolves.toBeUndefined();
    });

    it('should skip verification in CI mode', async () => {
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.pathExists.mockResolvedValue(false);
      // In CI mode, verification is skipped so no error is thrown
      await expect(fileSystemService.createDirectory('/test/newdir')).resolves.toBeUndefined();
    });

    it('should warn but not fail when chmod fails', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFsPromises.chmod.mockRejectedValue(new Error('Permission denied'));
      mockedPlatformDetector.isUnix.mockReturnValue(true);

      await expect(fileSystemService.createDirectory('/test/newdir')).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Could not set permissions on /test/newdir'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('should throw FileSystemError in non-CI environment when directory creation fails', async () => {
      const originalCI = process.env.CI;
      process.env.CI = 'false';

      const error = new Error('Permission denied');
      mockedFs.ensureDir.mockRejectedValue(error);

      await expect(fileSystemService.createDirectory('/test/newdir')).rejects.toThrow(
        FileSystemError,
      );

      process.env.CI = originalCI;
    });

    it('should throw FileSystemError when directory does not exist after creation in non-CI', async () => {
      const originalCI = process.env.CI;
      process.env.CI = 'false';

      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.pathExists.mockResolvedValue(false);

      await expect(fileSystemService.createDirectory('/test/newdir')).rejects.toThrow(
        FileSystemError,
      );

      process.env.CI = originalCI;
    });

    it('should not set permissions on non-Unix systems', async () => {
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.pathExists.mockResolvedValue(true);
      mockedPlatformDetector.isUnix.mockReturnValue(false);

      await fileSystemService.createDirectory('/test/newdir');

      expect(mockedFsPromises.chmod).not.toHaveBeenCalled();
    });
  });

  describe('ensureDirectoryExists', () => {
    it('should call createDirectory', async () => {
      mockedFs.ensureDir.mockResolvedValue(undefined);
      const createDirectorySpy = jest.spyOn(fileSystemService, 'createDirectory');

      await fileSystemService.ensureDirectoryExists('/test/dir');

      expect(createDirectorySpy).toHaveBeenCalledWith('/test/dir');
    });
  });

  describe('writeFileAtomic', () => {
    it('should write file atomically with backup', async () => {
      mockedFs.pathExists.mockImplementation(path => {
        if (path.includes('.backup.')) return true;
        if (path.toString() === '/test/file.txt') return true;
        return false;
      });
      mockedFs.copy.mockResolvedValue(undefined);
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockResolvedValue(undefined);
      mockedFs.remove.mockResolvedValue(undefined);
      mockedFs.move.mockResolvedValue(undefined);
      mockedFsPromises.chmod.mockResolvedValue(undefined);
      mockedPlatformDetector.isUnix.mockReturnValue(true);

      await fileSystemService.writeFileAtomic('/test/file.txt', 'content');

      expect(mockedFsPromises.writeFile).toHaveBeenCalled();
      expect(mockedFs.move).toHaveBeenCalled();
    });

    it('should handle atomic write failure and rollback', async () => {
      mockedFs.pathExists.mockImplementation(path => {
        if (path.includes('.backup.')) return true;
        if (path.toString() === '/test/file.txt') return true;
        return false;
      });
      mockedFs.copy.mockResolvedValue(undefined);
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockRejectedValue(new Error('Write failed'));
      mockedFs.remove.mockResolvedValue(undefined);
      mockedFs.move.mockResolvedValue(undefined);

      await expect(fileSystemService.writeFileAtomic('/test/file.txt', 'content')).rejects.toThrow(
        AtomicOperationError,
      );
    });

    it('should handle file without existing backup', async () => {
      mockedFs.pathExists.mockImplementation(path => {
        if (path.toString() === '/test/newfile.txt') return false;
        if (path.includes('.tmp.')) return true;
        return false;
      });
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockResolvedValue(undefined);
      mockedFs.move.mockResolvedValue(undefined);
      mockedFsPromises.chmod.mockResolvedValue(undefined);
      mockedPlatformDetector.isUnix.mockReturnValue(true);

      await fileSystemService.writeFileAtomic('/test/newfile.txt', 'content');

      expect(mockedFsPromises.writeFile).toHaveBeenCalled();
    });

    it('should retry move operation on failure', async () => {
      mockedFs.pathExists.mockImplementation(path => {
        if (path.toString() === '/test/file.txt') return false;
        if (path.includes('.tmp.')) return true;
        return false;
      });
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockResolvedValue(undefined);
      mockedFs.remove.mockResolvedValue(undefined);
      mockedFs.move
        .mockRejectedValueOnce(new Error('Move failed'))
        .mockResolvedValueOnce(undefined);
      mockedFsPromises.chmod.mockResolvedValue(undefined);
      mockedPlatformDetector.isUnix.mockReturnValue(true);

      await fileSystemService.writeFileAtomic('/test/file.txt', 'content');

      expect(mockedFs.move).toHaveBeenCalledTimes(2);
    });
  });

  describe('copyFileAtomic', () => {
    it('should copy file atomically', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.copy.mockResolvedValue(undefined);

      await fileSystemService.copyFileAtomic('/test/source.txt', '/test/target.txt');

      expect(mockedFs.copy).toHaveBeenCalledWith('/test/source.txt', '/test/target.txt');
    });

    it('should throw AtomicOperationError on copy failure', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.copy.mockRejectedValue(new Error('Copy failed'));

      await expect(
        fileSystemService.copyFileAtomic('/test/source.txt', '/test/target.txt'),
      ).rejects.toThrow(AtomicOperationError);
    });
  });

  describe('moveFileAtomic', () => {
    it('should move file atomically with backup', async () => {
      mockedFs.pathExists.mockImplementation(path => {
        if (path.includes('.backup.')) return true;
        if (path.toString() === '/test/source.txt') return true;
        return false;
      });
      mockedFs.copy.mockResolvedValue(undefined);
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.remove.mockResolvedValue(undefined);
      mockedFs.move.mockResolvedValue(undefined);

      await fileSystemService.moveFileAtomic('/test/source.txt', '/test/target.txt');

      expect(mockedFs.move).toHaveBeenCalled();
    });

    it('should handle move failure and rollback', async () => {
      mockedFs.pathExists.mockImplementation(path => {
        if (path.includes('.backup.')) return true;
        if (path.toString() === '/test/source.txt') return true;
        return false;
      });
      mockedFs.copy.mockResolvedValue(undefined);
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.remove.mockResolvedValue(undefined);
      mockedFs.move.mockRejectedValue(new Error('Move failed'));

      await expect(
        fileSystemService.moveFileAtomic('/test/source.txt', '/test/target.txt'),
      ).rejects.toThrow(AtomicOperationError);
    });
  });

  describe('remove', () => {
    it('should remove file with backup', async () => {
      mockedFs.pathExists.mockImplementation(path => {
        if (path.includes('.backup.')) return true;
        if (path.toString() === '/test/file.txt') return true;
        return false;
      });
      mockedFs.copy.mockResolvedValue(undefined);
      mockedFs.remove.mockResolvedValue(undefined);

      await fileSystemService.remove('/test/file.txt');

      expect(mockedFs.remove).toHaveBeenCalledWith('/test/file.txt');
    });

    it('should handle remove failure and rollback', async () => {
      mockedFs.pathExists.mockImplementation(path => {
        if (path.includes('.backup.')) return true;
        if (path.toString() === '/test/file.txt') return true;
        return false;
      });
      mockedFs.copy.mockResolvedValue(undefined);
      mockedFs.remove.mockRejectedValue(new Error('Remove failed'));
      mockedFs.move.mockResolvedValue(undefined);

      await expect(fileSystemService.remove('/test/file.txt')).rejects.toThrow(FileSystemError);
    });
  });

  describe('getStats', () => {
    it('should return file stats', async () => {
      const mockStats = { isFile: () => true, isDirectory: () => false };
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFsPromises.stat.mockResolvedValue(mockStats as any);

      const result = await fileSystemService.getStats('/test/file.txt');

      expect(result).toBe(mockStats);
      expect(mockedFsPromises.stat).toHaveBeenCalledWith('/test/file.txt');
    });

    it('should throw FileNotFoundError for ENOENT', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      const error = new Error('ENOENT');
      (error as any).code = 'ENOENT';
      mockedFsPromises.stat.mockRejectedValue(error);

      await expect(fileSystemService.getStats('/test/file.txt')).rejects.toThrow(FileNotFoundError);
    });

    it('should throw FileSystemError for other errors', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFsPromises.stat.mockRejectedValue(new Error('Permission denied'));

      await expect(fileSystemService.getStats('/test/file.txt')).rejects.toThrow(FileSystemError);
    });
  });

  describe('getLinkStats', () => {
    it('should return link stats', async () => {
      const mockStats = { isSymbolicLink: () => true };
      mockedFsPromises.lstat.mockResolvedValue(mockStats as any);

      const result = await fileSystemService.getLinkStats('/test/link');

      expect(result).toBe(mockStats);
      expect(mockedFsPromises.lstat).toHaveBeenCalledWith('/test/link');
    });

    it('should throw FileNotFoundError for ENOENT', async () => {
      const error = new Error('ENOENT');
      (error as any).code = 'ENOENT';
      mockedFsPromises.lstat.mockRejectedValue(error);

      await expect(fileSystemService.getLinkStats('/test/link')).rejects.toThrow(FileNotFoundError);
    });

    it('should throw FileSystemError for other errors', async () => {
      mockedFsPromises.lstat.mockRejectedValue(new Error('Permission denied'));

      await expect(fileSystemService.getLinkStats('/test/link')).rejects.toThrow(FileSystemError);
    });
  });

  describe('isDirectory', () => {
    it('should return true for directories', async () => {
      const mockStats = { isDirectory: () => true };
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFsPromises.stat.mockResolvedValue(mockStats as any);

      const result = await fileSystemService.isDirectory('/test/dir');

      expect(result).toBe(true);
    });

    it('should return false for files', async () => {
      const mockStats = { isDirectory: () => false };
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFsPromises.stat.mockResolvedValue(mockStats as any);

      const result = await fileSystemService.isDirectory('/test/file.txt');

      expect(result).toBe(false);
    });

    it('should return false when path does not exist', async () => {
      mockedFs.pathExists.mockResolvedValue(false);

      const result = await fileSystemService.isDirectory('/nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('isFile', () => {
    it('should return true for files', async () => {
      const mockStats = { isFile: () => true };
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFsPromises.stat.mockResolvedValue(mockStats as any);

      const result = await fileSystemService.isFile('/test/file.txt');

      expect(result).toBe(true);
    });

    it('should return false for directories', async () => {
      const mockStats = { isFile: () => false };
      mockedFs.pathExists.mockResolvedValue(true);
      mockedFsPromises.stat.mockResolvedValue(mockStats as any);

      const result = await fileSystemService.isFile('/test/dir');

      expect(result).toBe(false);
    });

    it('should return false when path does not exist', async () => {
      mockedFs.pathExists.mockResolvedValue(false);

      const result = await fileSystemService.isFile('/nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('validatePath', () => {
    it('should validate existing readable path', async () => {
      mockedFs.pathExists.mockResolvedValue(true);

      await expect(fileSystemService.validatePath('/test/file.txt')).resolves.toBeUndefined();
    });

    it('should throw FileNotFoundError for non-existent path', async () => {
      mockedFs.pathExists.mockResolvedValue(false);

      await expect(fileSystemService.validatePath('/nonexistent')).rejects.toThrow(
        FileNotFoundError,
      );
    });

    it('should throw PermissionError for unreadable path', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      mockedPlatformDetector.checkPermissions.mockResolvedValue({
        readable: false,
        writable: true,
      });

      await expect(fileSystemService.validatePath('/test/file.txt')).rejects.toThrow(
        PermissionError,
      );
    });
  });

  describe('validatePathString', () => {
    it('should not throw for valid paths', () => {
      expect(() => fileSystemService.validatePathString('valid/path')).not.toThrow();
    });

    it('should throw InvalidPathError for empty paths', () => {
      expect(() => fileSystemService.validatePathString('')).toThrow(InvalidPathError);
    });

    it('should throw InvalidPathError for null/undefined paths', () => {
      expect(() => fileSystemService.validatePathString(null as any)).toThrow(InvalidPathError);
      expect(() => fileSystemService.validatePathString(undefined as any)).toThrow(
        InvalidPathError,
      );
    });

    it('should throw InvalidPathError for paths with null bytes', () => {
      expect(() => fileSystemService.validatePathString('path\0with\0null')).toThrow(
        InvalidPathError,
      );
    });

    it('should throw InvalidPathError for excessively long paths', () => {
      const longPath = 'a'.repeat(4097);
      expect(() => fileSystemService.validatePathString(longPath)).toThrow(InvalidPathError);
    });

    it('should throw InvalidPathError for path traversal attempts', () => {
      expect(() => fileSystemService.validatePathString('../../../etc/passwd')).toThrow(
        InvalidPathError,
      );
      expect(() => fileSystemService.validatePathString('valid/../../../etc/passwd')).toThrow(
        InvalidPathError,
      );
    });

    it('should throw InvalidPathError for system paths outside test environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(() => fileSystemService.validatePathString('.git/config')).toThrow(InvalidPathError);
      expect(() => fileSystemService.validatePathString('node_modules/package')).toThrow(
        InvalidPathError,
      );
      expect(() => fileSystemService.validatePathString('.npm/cache')).toThrow(InvalidPathError);
      expect(() => fileSystemService.validatePathString('.cache/data')).toThrow(InvalidPathError);

      process.env.NODE_ENV = originalEnv;
    });

    it('should allow .git paths in test environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      expect(() => fileSystemService.validatePathString('.git/config')).not.toThrow();

      process.env.NODE_ENV = originalEnv;
    });

    it('should allow system paths with .private-storage', () => {
      expect(() =>
        fileSystemService.validatePathString('.private-storage/.git/config'),
      ).not.toThrow();
    });
  });

  describe('clearRollbackActions', () => {
    it('should clear rollback actions', () => {
      // Add some actions first
      (fileSystemService as any).rollbackActions.push(() => Promise.resolve());
      expect((fileSystemService as any).rollbackActions.length).toBe(1);

      fileSystemService.clearRollbackActions();

      expect((fileSystemService as any).rollbackActions.length).toBe(0);
    });
  });

  describe('static methods', () => {
    describe('getSafeFileName', () => {
      it('should replace unsafe characters', () => {
        const result = FileSystemService.getSafeFileName('file<>:"/\\|?*name');
        expect(result).toBe('file_________name');
      });

      it('should truncate long names', () => {
        const longName = 'a'.repeat(300);
        const result = FileSystemService.getSafeFileName(longName);
        expect(result.length).toBe(255);
      });

      it('should handle empty names', () => {
        const result = FileSystemService.getSafeFileName('');
        expect(result).toBe('unnamed');
      });

      it('should handle whitespace-only names', () => {
        const result = FileSystemService.getSafeFileName('   ');
        expect(result).toBe('unnamed');
      });
    });

    describe('getRelativePath', () => {
      it('should return relative path', () => {
        const result = FileSystemService.getRelativePath('/test/from', '/test/to');
        expect(result).toBe('../to');
      });
    });

    describe('joinPaths', () => {
      it('should join paths correctly', () => {
        const result = FileSystemService.joinPaths('path', 'to', 'file.txt');
        expect(result).toBe('path/to/file.txt');
      });
    });

    describe('resolvePath', () => {
      it('should resolve path to absolute', () => {
        const result = FileSystemService.resolvePath('relative/path');
        expect(result).toContain('relative/path');
      });
    });
  });
});
