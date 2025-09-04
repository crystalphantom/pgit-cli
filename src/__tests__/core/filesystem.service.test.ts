// @ts-nocheck - Jest mock typing issues
import { FileSystemService } from '../../core/filesystem.service';
import * as fs from 'fs-extra';
import { PlatformDetector } from '../../utils/platform.detector';
import { FileSystemError, InvalidPathError, FileNotFoundError, PermissionError } from '../../errors/filesystem.error';

// Mock fs-extra
jest.mock('fs-extra');
jest.mock('../../utils/platform.detector');

const mockedFs = jest.mocked(fs);
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
      mockedFs.readFile.mockResolvedValue(content);
      mockedFs.pathExists.mockResolvedValue(true);
      const result = await fileSystemService.readFile('/test/file.txt');
      expect(result).toBe(content);
      expect(mockedFs.readFile).toHaveBeenCalledWith('/test/file.txt', 'utf8');
    });

    it('should throw FileNotFoundError when file does not exist', async () => {
      mockedFs.pathExists.mockResolvedValue(false);
      await expect(fileSystemService.readFile('/nonexistent.txt')).rejects.toThrow(FileNotFoundError);
    });

    it('should throw PermissionError when file is not readable', async () => {
      mockedFs.pathExists.mockResolvedValue(true);
      mockedPlatformDetector.checkPermissions.mockResolvedValue({ readable: false, writable: true });
      await expect(fileSystemService.readFile('/test/file.txt')).rejects.toThrow(PermissionError);
    });
  });

  describe('writeFile', () => {
    it('should write file content successfully', async () => {
      mockedFs.writeFile.mockResolvedValue(undefined);
      await fileSystemService.writeFile('/test/file.txt', 'content');
      expect(mockedFs.writeFile).toHaveBeenCalledWith('/test/file.txt', 'content', 'utf8');
    });

    it('should throw FileSystemError when write fails', async () => {
      const error = new Error('Permission denied');
      mockedFs.writeFile.mockRejectedValue(error);
      await expect(fileSystemService.writeFile('/test/file.txt', 'content')).rejects.toThrow(FileSystemError);
    });
  });

  describe('createDirectory', () => {
    it('should create directory successfully', async () => {
      mockedFs.ensureDir.mockResolvedValue(undefined);
      mockedFs.chmod.mockResolvedValue(undefined);
      await fileSystemService.createDirectory('/test/newdir');
      expect(mockedFs.ensureDir).toHaveBeenCalledWith('/test/newdir');
    });

    it('should throw FileSystemError when directory creation fails', async () => {
      const error = new Error('Permission denied');
      mockedFs.ensureDir.mockRejectedValue(error);
      await expect(fileSystemService.createDirectory('/test/newdir')).rejects.toThrow(FileSystemError);
    });
  });

  describe('validatePathString', () => {
    it('should not throw for valid paths', () => {
      expect(() => fileSystemService.validatePathString('valid/path')).not.toThrow();
    });

    it('should throw InvalidPathError for empty paths', () => {
      expect(() => fileSystemService.validatePathString('')).toThrow(InvalidPathError);
    });

    it('should throw InvalidPathError for paths with null bytes', () => {
      expect(() => fileSystemService.validatePathString('path\0with\0null')).toThrow(InvalidPathError);
    });

    it('should throw InvalidPathError for excessively long paths', () => {
      const longPath = 'a'.repeat(4097);
      expect(() => fileSystemService.validatePathString(longPath)).toThrow(InvalidPathError);
    });
  });
});
