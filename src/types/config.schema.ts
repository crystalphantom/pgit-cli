import { z } from 'zod';

/**
 * Zod schema for configuration settings
 */
export const ConfigSettingsSchema = z.object({
  autoGitignore: z.boolean(),
  autoCleanup: z.boolean(),
  verboseOutput: z.boolean(),
  createBackups: z.boolean(),
  maxBackups: z.number().int().min(1).max(20),
});

/**
 * Zod schema for project metadata
 */
export const ProjectMetadataSchema = z.object({
  projectName: z.string().min(1),
  mainRepoPath: z.string().min(1),
  cliVersion: z.string().regex(/^\d+\.\d+\.\d+(-[\w.-]+)?$/),
  platform: z.string().min(1),
  lastModified: z.date(),
});

/**
 * Zod schema for main private configuration
 */
export const PrivateConfigSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.-]+)?$/),
  privateRepoPath: z.string().min(1),
  storagePath: z.string().min(1),
  trackedPaths: z.array(z.string()).default([]),
  initialized: z.date(),
  lastCleanup: z.date().optional(),
  settings: ConfigSettingsSchema,
  metadata: ProjectMetadataSchema,
});

/**
 * Zod schema for command result
 */
export const CommandResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.unknown().optional(),
  error: z.instanceof(Error).optional(),
  exitCode: z.number().int().min(0).max(255),
});

/**
 * Zod schema for command options
 */
export const CommandOptionsSchema = z.object({
  verbose: z.boolean().optional(),
  force: z.boolean().optional(),
  message: z.string().optional(),
  dryRun: z.boolean().optional(),
});

/**
 * Zod schema for repository status
 */
export const RepositoryStatusSchema = z.object({
  type: z.enum(['main', 'private']),
  branch: z.string(),
  isClean: z.boolean(),
  stagedFiles: z.number().int().min(0),
  modifiedFiles: z.number().int().min(0),
  untrackedFiles: z.number().int().min(0),
  deletedFiles: z.number().int().min(0),
  exists: z.boolean(),
  issues: z.array(z.string()),
});

/**
 * Zod schema for broken link information
 */
export const BrokenLinkSchema = z.object({
  linkPath: z.string().min(1),
  targetPath: z.string().min(1),
  reason: z.string().min(1),
  repairable: z.boolean(),
});

/**
 * Zod schema for symbolic link health
 */
export const SymlinkHealthSchema = z.object({
  total: z.number().int().min(0),
  healthy: z.number().int().min(0),
  broken: z.number().int().min(0),
  brokenLinks: z.array(BrokenLinkSchema),
});

/**
 * Zod schema for configuration health
 */
export const ConfigHealthSchema = z.object({
  exists: z.boolean(),
  valid: z.boolean(),
  errors: z.array(z.string()),
  needsMigration: z.boolean(),
  currentVersion: z.string(),
  targetVersion: z.string().optional(),
});

/**
 * Zod schema for system status
 */
export const SystemStatusSchema = z.object({
  initialized: z.boolean(),
  mainRepo: RepositoryStatusSchema,
  privateRepo: RepositoryStatusSchema,
  symlinks: SymlinkHealthSchema,
  config: ConfigHealthSchema,
  isHealthy: z.boolean(),
  issues: z.array(z.string()),
});

/**
 * Zod schema for tracked file information
 */
export const TrackedFileSchema = z.object({
  originalPath: z.string().min(1),
  storagePath: z.string().min(1),
  isSymlink: z.boolean(),
  symlinkHealthy: z.boolean(),
  addedDate: z.date(),
  size: z.number().int().min(0),
  isDirectory: z.boolean(),
});

/**
 * Zod schema for validation result
 */
export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

/**
 * Zod schema for migration step
 */
export const MigrationStepSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  destructive: z.boolean(),
  execute: z.function(),
});

/**
 * Zod schema for migration information
 */
export const MigrationInfoSchema = z.object({
  fromVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  toVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  steps: z.array(MigrationStepSchema),
  required: z.boolean(),
  safe: z.boolean(),
});

/**
 * Zod schema for error information
 */
export const ErrorInfoSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.string().optional(),
  suggestion: z.string().optional(),
  recoverable: z.boolean(),
  stack: z.string().optional(),
});

/**
 * Schema for validating file paths
 */
export const FilePathSchema = z
  .string()
  .min(1)
  .refine(path => !path.includes('..'), { message: 'Path traversal not allowed' })
  .refine(path => !/[<>:"|?*]/.test(path), { message: 'Invalid characters in path' });

/**
 * Schema for validating git commit messages
 */
export const CommitMessageSchema = z
  .string()
  .min(1, 'Commit message cannot be empty')
  .max(100, 'Commit message too long')
  .refine(msg => msg.trim().length > 0, { message: 'Commit message cannot be only whitespace' });

/**
 * Schema for validating branch names
 */
export const BranchNameSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-zA-Z0-9._/-]+$/,
    'Branch name can only contain letters, numbers, dots, hyphens, underscores, and forward slashes',
  )
  .refine(name => !name.startsWith('.') && !name.endsWith('.'), {
    message: 'Branch name cannot start or end with a dot',
  })
  .refine(name => !name.includes('..'), { message: 'Branch name cannot contain consecutive dots' });

/**
 * Transform function to convert ISO date strings to Date objects
 */
export const dateTransform = z.string().transform(str => new Date(str));

/**
 * JSON serialization schema for configuration
 */
export const PrivateConfigJsonSchema = z.object({
  version: z.string(),
  privateRepoPath: z.string(),
  storagePath: z.string(),
  trackedPaths: z.array(z.string()),
  initialized: z.string().transform(str => new Date(str)),
  lastCleanup: z
    .string()
    .transform(str => new Date(str))
    .optional(),
  settings: ConfigSettingsSchema,
  metadata: z.object({
    projectName: z.string(),
    mainRepoPath: z.string(),
    cliVersion: z.string(),
    platform: z.string(),
    lastModified: z.string().transform(str => new Date(str)),
  }),
});

/**
 * Type definitions inferred from schemas
 */
export type ConfigSettingsType = z.infer<typeof ConfigSettingsSchema>;
export type ProjectMetadataType = z.infer<typeof ProjectMetadataSchema>;
export type PrivateConfigType = z.infer<typeof PrivateConfigSchema>;
export type CommandResultType = z.infer<typeof CommandResultSchema>;
export type CommandOptionsType = z.infer<typeof CommandOptionsSchema>;
export type RepositoryStatusType = z.infer<typeof RepositoryStatusSchema>;
export type BrokenLinkType = z.infer<typeof BrokenLinkSchema>;
export type SymlinkHealthType = z.infer<typeof SymlinkHealthSchema>;
export type ConfigHealthType = z.infer<typeof ConfigHealthSchema>;
export type SystemStatusType = z.infer<typeof SystemStatusSchema>;
export type TrackedFileType = z.infer<typeof TrackedFileSchema>;
export type ValidationResultType = z.infer<typeof ValidationResultSchema>;
export type MigrationStepType = z.infer<typeof MigrationStepSchema>;
export type MigrationInfoType = z.infer<typeof MigrationInfoSchema>;
export type ErrorInfoType = z.infer<typeof ErrorInfoSchema>;
