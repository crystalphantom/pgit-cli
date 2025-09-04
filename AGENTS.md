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
- **Module Tests**: `npx jest --testPathPattern=commands`
- **Coverage**: `npx jest --coverage --testPathPattern=add.command.test.ts`
- **Framework**: Jest with ts-jest preset, 90% coverage threshold

## Code Style Guidelines
- **TypeScript**: ES2020 target, CommonJS modules, strict mode enabled
- **Imports**: External libraries first, then internal modules grouped by type
- **Formatting**: Single quotes, semicolons, trailing commas, 100 char width, 2 space tabs
- **Naming**: PascalCase (classes/interfaces), camelCase (variables/functions), UPPER_CASE (constants)
- **Error Handling**: Custom error classes extending BaseError with type guards
- **File Structure**: commands/*.command.ts, core/*.service.ts, types/*.types.ts, utils/*.utils.ts

## Key Patterns
- Use Zod schemas for runtime validation
- Implement command pattern with async execute() methods
- Mock all external dependencies in tests
- Prefer readonly properties and explicit return types