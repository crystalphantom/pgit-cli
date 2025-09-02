import { FileSystemService } from '../../core/filesystem.service';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// Mock fs-extra
jest.mock('fs-extra');
const mockedFs = jest.mocked(fs);

describe('FileSystemService', () => {
  let fileSystemService: FileSystemService;
  let tempDir: string;

  beforeEach(() => {
    fileSystemService = new FileSystemService();
    tempDir = path.join(os.tmpdir(), 'pgit-test-' + Date.now());
    
    // Reset all mocks
    jest.clearAllMocks();
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
      
      await expect(fileSystemService.pathExists('/test/path')).rejects.toThrow('Permission denied');
    });
  });

  describe('readFile', () => {
    it('should read file content successfully', async () => {
      const content = 'test file content';
      mockedFs.readFile.mockResolvedValue(Buffer.from(content));
      
      const result = await fileSystemService.readFile('/test/file.txt');
      
      expect(result).toBe(content);
      expect(mockedFs.readFile).toHaveBeenCalledWith('/test/file.txt', 'utf8');
    });

    it('should throw error when file cannot be read', async () => {
      const error = new Error('File not found');
      mockedFs.readFile.mockRejectedValue(error);
      
      await expect(fileSystemService.readFile('/nonexistent.txt')).rejects.toThrow('File not found');
    });
  });

  describe('writeFile', () => {
    it('should write file content successfully', async () => {
      mockedFs.writeFile.mockResolvedValue(undefined);
      
      await fileSystemService.writeFile('/test/file.txt', 'content');
      
      expect(mockedFs.writeFile).toHaveBeenCalledWith('/test/file.txt', 'content', 'utf8');
    });

    it('should throw error when write fails', async () => {
      const error = new Error('Permission denied');
      mockedFs.writeFile.mockRejectedValue(error);
      
      await expect(fileSystemService.writeFile('/test/file.txt', 'content')).rejects.toThrow('Permission denied');
    });
  });

  describe('writeFileAtomic', () => {
    it('should write file atomically', async () => {
      mockedFs.writeFile.mockResolvedValue(undefined);
      mockedFs.move.mockResolvedValue(undefined);
      
      await fileSystemService.writeFileAtomic('/test/file.txt', 'content');
      
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/test/file.txt.tmp'),
        'content',
        'utf8'
      );
      expect(mockedFs.move).toHaveBeenCalledWith(
        expect.stringContaining('/test/file.txt.tmp'),
        '/test/file.txt',
        { overwrite: true }
      );
    });

    it('should cleanup temp file on error', async () => {
      const error = new Error('Write failed');
      mockedFs.writeFile.mockRejectedValue(error);
      mockedFs.remove.mockResolvedValue(undefined);
      
      await expect(fileSystemService.writeFileAtomic('/test/file.txt', 'content')).rejects.toThrow('Write failed');
      
      expect(mockedFs.remove).toHaveBeenCalledWith(
        expect.stringContaining('/test/file.txt.tmp')
      );
    });
  });

  describe('ensureDirectoryExists', () => {
    it('should create directory if it does not exist', async () => {
      mockedFs.ensureDir.mockResolvedValue(undefined);
      
      await fileSystemService.ensureDirectoryExists('/test/dir');
      
      expect(mockedFs.ensureDir).toHaveBeenCalledWith('/test/dir');
    });

    it('should throw error when directory creation fails', async () => {
      const error = new Error('Permission denied');
      mockedFs.ensureDir.mockRejectedValue(error);
      
      await expect(fileSystemService.ensureDirectoryExists('/test/dir')).rejects.toThrow('Permission denied');
    });
  });

  describe('createDirectory', () => {
    it('should create directory successfully', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      
      await fileSystemService.createDirectory('/test/newdir');
      
      expect(mockedFs.mkdir).toHaveBeenCalledWith('/test/newdir');
    });

    it('should throw error when directory creation fails', async () => {
      const error = new Error('Directory already exists');
      mockedFs.mkdir.mockRejectedValue(error);
      
      await expect(fileSystemService.createDirectory('/test/newdir')).rejects.toThrow('Directory already exists');
    });
  });

  describe('moveFileAtomic', () => {
    it('should move file atomically', async () => {
      mockedFs.copy.mockResolvedValue(undefined);
      mockedFs.remove.mockResolvedValue(undefined);
      
      await fileSystemService.moveFileAtomic('/source/file.txt', '/dest/file.txt');
      
      expect(mockedFs.copy).toHaveBeenCalledWith('/source/file.txt', '/dest/file.txt');
      expect(mockedFs.remove).toHaveBeenCalledWith('/source/file.txt');
    });

    it('should ensure destination directory exists', async () => {
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.copy.mockResolvedValue(undefined);
      mockedFs.remove.mockResolvedValue(undefined);
      
      await fileSystemService.moveFileAtomic('/source/file.txt', '/dest/subdir/file.txt');
      
      expect(mockedFs.ensureDir).toHaveBeenCalledWith('/dest/subdir');
    });

    it('should rollback on failure', async () => {
      const error = new Error('Copy failed');
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.copy.mockRejectedValue(error);
      
      await expect(fileSystemService.moveFileAtomic('/source/file.txt', '/dest/file.txt')).rejects.toThrow('Copy failed');
      
      expect(mockedFs.copy).toHaveBeenCalledWith('/source/file.txt', '/dest/file.txt');
      expect(mockedFs.remove).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return file stats', async () => {
      const mockStats = {
        isFile: jest.fn().mockReturnValue(true),
        isDirectory: jest.fn().mockReturnValue(false),
        isSymbolicLink: jest.fn().mockReturnValue(false),
        size: 1024,
        mtime: new Date(),
      };
      mockedFs.lstat.mockResolvedValue(mockStats as any);
      
      const result = await fileSystemService.getStats('/test/file.txt');
      
      expect(result).toBe(mockStats);
      expect(mockedFs.lstat).toHaveBeenCalledWith('/test/file.txt');
    });

    it('should throw error when stat fails', async () => {
      const error = new Error('File not found');
      mockedFs.lstat.mockRejectedValue(error);
      
      await expect(fileSystemService.getStats('/test/file.txt')).rejects.toThrow('File not found');
    });
  });

  describe('isDirectory', () => {
    it('should return true for directories', async () => {
      const mockStats = {
        isDirectory: jest.fn().mockReturnValue(true),
      };
      mockedFs.lstat.mockResolvedValue(mockStats as any);
      
      const result = await fileSystemService.isDirectory('/test/dir');
      
      expect(result).toBe(true);
    });

    it('should return false for files', async () => {
      const mockStats = {
        isDirectory: jest.fn().mockReturnValue(false),
      };
      mockedFs.lstat.mockResolvedValue(mockStats as any);
      
      const result = await fileSystemService.isDirectory('/test/file.txt');
      
      expect(result).toBe(false);
    });
  });

  describe('validatePathString', () => {
    it('should accept valid paths', () => {
      expect(() => fileSystemService.validatePathString('valid/path')).not.toThrow();
      expect(() => fileSystemService.validatePathString('./relative/path')).not.toThrow();
      expect(() => fileSystemService.validatePathString('file.txt')).not.toThrow();
    });

    it('should reject null or empty paths', () => {
      expect(() => fileSystemService.validatePathString('')).toThrow('Path cannot be empty');
      expect(() => fileSystemService.validatePathString(null as any)).toThrow('Path must be a string');
      expect(() => fileSystemService.validatePathString(undefined as any)).toThrow('Path must be a string');
    });

    it('should reject paths with null bytes', () => {
      expect(() => fileSystemService.validatePathString('path\x00with\x00null')).toThrow('Path contains invalid characters');
    });

    it('should reject excessively long paths', () => {
      const longPath = 'a'.repeat(5000);
      expect(() => fileSystemService.validatePathString(longPath)).toThrow('Path is too long');
    });
  });

  describe('error handling', () => {
    it('should handle ENOENT errors gracefully', async () => {
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockedFs.readFile.mockRejectedValue(enoentError);
      
      await expect(fileSystemService.readFile('/nonexistent.txt')).rejects.toThrow('ENOENT: no such file or directory');
    });

    it('should handle EACCES errors gracefully', async () => {
      const eaccesError = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      eaccesError.code = 'EACCES';
      mockedFs.writeFile.mockRejectedValue(eaccesError);
      
      await expect(fileSystemService.writeFile('/protected/file.txt', 'content')).rejects.toThrow('EACCES: permission denied');
    });

    it('should handle ENOSPC errors gracefully', async () => {
      const enospcError = new Error('ENOSPC: no space left on device') as NodeJS.ErrnoException;
      enospcError.code = 'ENOSPC';
      mockedFs.writeFile.mockRejectedValue(enospcError);
      
      await expect(fileSystemService.writeFile('/test/file.txt', 'content')).rejects.toThrow('ENOSPC: no space left on device');
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent file operations', async () => {
      mockedFs.writeFile.mockResolvedValue(undefined);
      
      const promises = Array.from({ length: 10 }, (_, i) =>
        fileSystemService.writeFile(`/test/file${i}.txt`, `content${i}`)
      );
      
      await expect(Promise.all(promises)).resolves.toHaveLength(10);
    });

    it('should handle concurrent atomic operations', async () => {
      mockedFs.writeFile.mockResolvedValue(undefined);
      mockedFs.move.mockResolvedValue(undefined);
      
      const promises = Array.from({ length: 5 }, (_, i) =>
        fileSystemService.writeFileAtomic(`/test/file${i}.txt`, `content${i}`)
      );
      
      await expect(Promise.all(promises)).resolves.toHaveLength(5);
    });
  });
});