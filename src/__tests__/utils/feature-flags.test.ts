import {
  evaluateFeatureGate,
  getFeatureEnvKeys,
  isEnabled,
  withFeatureGuard,
} from '../../utils/feature-flags';

const FEATURE_BOUND_COMMANDS = {
  init: 'legacy',
  add: 'legacy',
} as const;

const legacyTruthy = ['1', 'true', 'yes', 'on', 'enabled', 'TRUE', ' 1 '];
const legacyFalsy = ['0', 'false', 'no', 'off', 'disabled', ' 0 '];

describe('Feature flag parsing', () => {
  it('parses legacy truthy values from PGIT_LEGACY', () => {
    for (const value of legacyTruthy) {
      const env = { PGIT_LEGACY: value } as NodeJS.ProcessEnv;
      expect(isEnabled('legacy', env)).toBe(true);
    }
  });

  it('parses legacy falsey values from PGIT_LEGACY', () => {
    for (const value of legacyFalsy) {
      const env = { PGIT_LEGACY: value } as NodeJS.ProcessEnv;
      expect(isEnabled('legacy', env)).toBe(false);
    }
  });

  it('uses PGIT_FEATURE_LEGACY when both feature and legacy alias are set', () => {
    const env = {
      PGIT_FEATURE_LEGACY: '1',
      PGIT_LEGACY: '0',
    } as NodeJS.ProcessEnv;
    expect(isEnabled('legacy', env)).toBe(true);
  });

  it('parses legacy values from PGIT_FEATURE_LEGACY', () => {
    const env = { PGIT_FEATURE_LEGACY: 'on' } as NodeJS.ProcessEnv;
    expect(isEnabled('legacy', env)).toBe(true);
  });

  it('falls back to default when value is invalid', () => {
    const env = { PGIT_LEGACY: 'maybe' } as NodeJS.ProcessEnv;
    expect(isEnabled('legacy', env)).toBe(false);
  });

  it('exposes canonical env keys for a feature', () => {
    expect(getFeatureEnvKeys('legacy')).toEqual(['PGIT_FEATURE_LEGACY', 'PGIT_LEGACY']);
  });
});

describe('withFeatureGuard', () => {
  const originalLegacyFlag = process.env.PGIT_LEGACY;
  const originalFeatureLegacyFlag = process.env.PGIT_FEATURE_LEGACY;

  beforeEach(() => {
    delete process.env.PGIT_FEATURE_LEGACY;
    delete process.env.PGIT_LEGACY;
  });

  afterEach(() => {
    if (originalLegacyFlag === undefined) {
      delete process.env.PGIT_LEGACY;
    } else {
      process.env.PGIT_LEGACY = originalLegacyFlag;
    }

    if (originalFeatureLegacyFlag === undefined) {
      delete process.env.PGIT_FEATURE_LEGACY;
    } else {
      process.env.PGIT_FEATURE_LEGACY = originalFeatureLegacyFlag;
    }
  });

  it('blocks execution when legacy flag is off', async () => {
    process.env.PGIT_LEGACY = '0';
    const guarded = withFeatureGuard('legacy', 'init', async () => 'allowed');
    await expect(guarded()).rejects.toThrow("Feature 'legacy' is disabled for command 'init'.");
  });

  it('allows execution when legacy flag is on', async () => {
    process.env.PGIT_LEGACY = '1';
    const guarded = withFeatureGuard('legacy', 'init', async () => 'allowed');
    await expect(guarded()).resolves.toBe('allowed');
  });
});

describe('CLI feature command gate', () => {
  it('blocks legacy root commands when flag is off', () => {
    const decision = evaluateFeatureGate(
      'init',
      FEATURE_BOUND_COMMANDS,
      {} as NodeJS.ProcessEnv,
    );

    expect(decision.blocked).toBe(true);
    expect(decision.feature).toBe('legacy');
  });

  it('allows legacy root commands when PGIT_LEGACY=1', () => {
    const decision = evaluateFeatureGate(
      'init',
      FEATURE_BOUND_COMMANDS,
      { PGIT_LEGACY: '1' } as NodeJS.ProcessEnv,
    );
    expect(decision.blocked).toBe(false);
    expect(decision.enabled).toBe(true);
  });

  it('allows legacy namespace commands with explicit path even when disabled', () => {
    const decision = evaluateFeatureGate('legacy init', FEATURE_BOUND_COMMANDS, {} as NodeJS.ProcessEnv);
    expect(decision.blocked).toBe(false);
    expect(decision.enabled).toBe(true);
    expect(decision.feature).toBeUndefined();
  });

  it('does not block non-legacy commands', () => {
    const decision = evaluateFeatureGate('status', FEATURE_BOUND_COMMANDS, {} as NodeJS.ProcessEnv);
    expect(decision.blocked).toBe(false);
    expect(decision.feature).toBeUndefined();
  });
});
