// Global test setup
import 'jest';

// Mock chalk to avoid ESM issues
jest.mock('chalk', () => ({
  default: {
    green: jest.fn(str => str),
    red: jest.fn(str => str),
    yellow: jest.fn(str => str),
    blue: jest.fn(str => str),
    cyan: jest.fn(str => str),
    magenta: jest.fn(str => str),
    white: jest.fn(str => str),
    gray: jest.fn(str => str),
    black: jest.fn(str => str),
    bold: jest.fn(str => str),
    dim: jest.fn(str => str),
    italic: jest.fn(str => str),
    underline: jest.fn(str => str),
    inverse: jest.fn(str => str),
    strikethrough: jest.fn(str => str),
    reset: jest.fn(str => str),
  },
  green: jest.fn(str => str),
  red: jest.fn(str => str),
  yellow: jest.fn(str => str),
  blue: jest.fn(str => str),
  cyan: jest.fn(str => str),
  magenta: jest.fn(str => str),
  white: jest.fn(str => str),
  gray: jest.fn(str => str),
  black: jest.fn(str => str),
  bold: jest.fn(str => str),
  dim: jest.fn(str => str),
  italic: jest.fn(str => str),
  underline: jest.fn(str => str),
  inverse: jest.fn(str => str),
  strikethrough: jest.fn(str => str),
  reset: jest.fn(str => str),
}));

// Mock console methods to keep test output clean

beforeEach(() => {
  // Suppress console output during tests unless explicitly needed
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  // Restore console methods
  jest.restoreAllMocks();
});

// Global test timeout
jest.setTimeout(30000);

// Mock process.exit to prevent tests from actually exiting
jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
  throw new Error(`Process.exit called with code: ${code}`);
});

// Mock process.cwd to return a consistent value
jest.spyOn(process, 'cwd').mockReturnValue('/test/workspace');

export {};
