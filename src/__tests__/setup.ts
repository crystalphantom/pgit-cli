// Global test setup
import 'jest';

// Set CI environment variable for tests that need to simulate CI behavior
process.env['CI'] = 'true';

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

// Removed global console mocking to allow individual tests to spy on console methods
// Tests that need to suppress console output should do so individually

afterEach(() => {
  // Individual tests should restore their own mocks
  // jest.restoreAllMocks(); // Commented out to avoid interfering with individual test spies
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
