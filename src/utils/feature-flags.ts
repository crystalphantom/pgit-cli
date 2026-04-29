import { z } from 'zod';

export type FeatureFlag = 'legacy' | 'agentConfigSync' | 'betaCommands';
export type FeatureFlagScope = 'global' | 'command';

export interface FeatureFlagMetadata {
  readonly scope: FeatureFlagScope;
  readonly defaultEnabled: boolean;
  readonly description: string;
  readonly envVariable: `PGIT_FEATURE_${string}`;
  readonly aliases: readonly string[];
}

export interface FeatureCommandGateDecision {
  readonly commandPath: string;
  readonly feature?: FeatureFlag;
  readonly enabled: boolean;
  readonly blocked: boolean;
  readonly envKeys: readonly string[];
}

const TRUE_VALUES = ['1', 'true', 'yes', 'on', 'enabled'] as const;
const FALSE_VALUES = ['0', 'false', 'no', 'off', 'disabled'] as const;
const ALL_VALUES = [...TRUE_VALUES, ...FALSE_VALUES] as const;
const VALUE_SCHEMA = z
  .string()
  .trim()
  .transform(value => value.toLowerCase())
  .pipe(z.enum(ALL_VALUES));

const TRUE_VALUE_SET = new Set<string>(TRUE_VALUES);

export const FEATURE_DEFINITIONS: Record<FeatureFlag, FeatureFlagMetadata> = {
  legacy: {
    scope: 'command',
    defaultEnabled: false,
    description: 'Enable legacy root flow commands (`init`, `add`) in standard CLI mode.',
    envVariable: 'PGIT_FEATURE_LEGACY',
    aliases: ['PGIT_LEGACY'],
  },
  agentConfigSync: {
    scope: 'command',
    defaultEnabled: false,
    description: 'Enable agent-visible private config sync beta command flow.',
    envVariable: 'PGIT_FEATURE_AGENT_CONFIG_SYNC',
    aliases: [],
  },
  betaCommands: {
    scope: 'global',
    defaultEnabled: false,
    description: 'Enable experimental beta command groups.',
    envVariable: 'PGIT_FEATURE_BETA_COMMANDS',
    aliases: [],
  },
} as const;

const toEnvKey = (flag: FeatureFlag): string =>
  flag.replace(/[A-Z]/g, match => `_${match}`).toUpperCase();

export const getFeatureEnvKeys = (flag: FeatureFlag): readonly string[] => {
  const metadata = FEATURE_DEFINITIONS[flag];
  const envKey = toEnvKey(flag);
  return Array.from(new Set([metadata.envVariable, `PGIT_${envKey}`, ...metadata.aliases]));
};

export const parseFeatureValue = (value: string): boolean | undefined => {
  const parsed = VALUE_SCHEMA.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }

  return TRUE_VALUE_SET.has(parsed.data);
};

export const isEnabled = (flag: FeatureFlag, env: NodeJS.ProcessEnv = process.env): boolean => {
  const metadata = FEATURE_DEFINITIONS[flag];
  for (const envKey of getFeatureEnvKeys(flag)) {
    const value = env[envKey];
    if (value === undefined) {
      continue;
    }
    const parsed = parseFeatureValue(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return metadata.defaultEnabled;
};

export const evaluateFeatureGate = (
  commandPath: string,
  featureMap: Readonly<Record<string, FeatureFlag>>,
  env: NodeJS.ProcessEnv = process.env,
): FeatureCommandGateDecision => {
  const feature = featureMap[commandPath];
  if (!feature) {
    return { commandPath, feature: undefined, enabled: true, blocked: false, envKeys: [] };
  }

  const enabled = isEnabled(feature, env);
  return {
    commandPath,
    feature,
    enabled,
    blocked: !enabled,
    envKeys: getFeatureEnvKeys(feature),
  };
};

export class FeatureDisabledError extends Error {
  public readonly flag: FeatureFlag;
  public readonly commandPath: string;

  public constructor(flag: FeatureFlag, commandPath: string) {
    super(`Feature '${flag}' is disabled for command '${commandPath}'.`);
    this.name = 'FeatureDisabledError';
    this.flag = flag;
    this.commandPath = commandPath;
  }
}

export const withFeatureGuard =
  <TArgs extends readonly unknown[], TResult>(
    flag: FeatureFlag,
    commandPath: string,
    handler: (..._args: TArgs) => Promise<TResult>,
  ): ((..._args: TArgs) => Promise<TResult>) =>
  async (..._args: TArgs): Promise<TResult> => {
    if (!isEnabled(flag)) {
      throw new FeatureDisabledError(flag, commandPath);
    }

    return handler(..._args);
  };
