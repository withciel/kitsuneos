import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isAgentMcpConnected,
  ONBOARDING_STEPS,
  type OnboardingProgress,
  onboardingStepTitle,
} from './onboarding.ts';

const baseProgress = (): OnboardingProgress => ({
  'create-database': false,
  'add-page': false,
  'connect-agent': false,
  'review-changes': false,
  firstCollection: null,
  hasAgents: false,
});

describe('onboarding connect-agent heuristic', () => {
  it('does not treat agent row alone as connected', () => {
    assert.equal(
      isAgentMcpConnected({
        agents: [{ hasUsedKey: false }],
        mcpUsed: false,
      }),
      false,
    );
  });

  it('marks connected when an agent key was used', () => {
    assert.equal(
      isAgentMcpConnected({
        agents: [{ hasUsedKey: true }],
        mcpUsed: false,
      }),
      true,
    );
  });

  it('marks connected when remote MCP OAuth traffic was recorded', () => {
    assert.equal(isAgentMcpConnected({ agents: [], mcpUsed: true }), true);
  });
});

describe('onboardingStepTitle', () => {
  const connectStep = ONBOARDING_STEPS.find((s) => s.id === 'connect-agent');
  assert.ok(connectStep);

  it('labels create before any agent exists', () => {
    const progress = baseProgress();
    assert.equal(
      onboardingStepTitle(connectStep!, progress),
      'Create an agent',
    );
  });

  it('labels connect MCP when agent exists but is unused', () => {
    const progress = { ...baseProgress(), hasAgents: true };
    assert.equal(onboardingStepTitle(connectStep!, progress), 'Connect MCP');
  });

  it('labels connected only after MCP activity', () => {
    const progress = {
      ...baseProgress(),
      hasAgents: true,
      'connect-agent': true,
    };
    assert.equal(
      onboardingStepTitle(connectStep!, progress),
      'Connected to MCP',
    );
  });
});
