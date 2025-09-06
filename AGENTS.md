# Agent Guidelines for PGit CLI

## Build & Development Commands
- **Build**: `npm run build` - Compile TypeScript to dist/
- **Dev**: `npm run dev -- <command>` - Run CLI in development mode
- **Lint**: `npm run lint` - ESLint TypeScript files
- **Lint Fix**: `npm run lint:fix` - Auto-fix ESLint issues
- **Format**: `npm run format` - Format with Prettier
- **Format Check**: `npm run format:check` - Check Prettier formatting
- **Clean**: `npm run clean` - Remove dist/ directory

## Testing Commands
- **Single Test**: `npx jest src/__tests__/commands/add.command.test.ts`
- **Single Test File**: `npx jest src/__tests__/core/config.manager.test.ts`
- **Module Tests**: `npx jest --testPathPattern=commands`
- **Coverage**: `npm run test:coverage` or `npx jest --coverage`
- **Watch Mode**: `npm run test:watch`
- **Framework**: Jest with ts-jest preset, 90% coverage threshold

## Code Style Guidelines
- **TypeScript**: ES2020 target, CommonJS modules, strict mode enabled
- **Imports**: External libs first, then internal modules (types, core, utils, errors)
- **Formatting**: Single quotes, semicolons, trailing commas, 100 char width, 2 spaces
- **Naming**: PascalCase (classes/interfaces), camelCase (methods/vars), UPPER_CASE (constants)
- **Error Handling**: Custom error classes extending BaseError with readonly properties
- **File Structure**: commands/*.command.ts, core/*.service.ts, types/*.types.ts, utils/*.utils.ts
- **Documentation**: JSDoc comments for public methods, interfaces with descriptions
- **Async**: Use async/await consistently, avoid Promises directly
- **ESLint**: No console, prefer const, no var, explicit return types, no any, prefer readonly

## Key Patterns
- Use Zod schemas for runtime validation with parse() method
- Implement command pattern with async execute() returning CommandResult
- Mock all external dependencies in tests with jest.mock()
- Prefer readonly properties, explicit return types, and type guards
- Use path.join() for cross-platform path handling
- Implement atomic operations with rollback support for multi-step processes