/**
 * Tests for SDKCompactBoundaryMessage type
 */

import { describe, test, expect } from 'bun:test';
import type {
  SDKCompactBoundaryMessage,
  SDKMessage,
  UUID,
} from '../../src/types/messages';
import { createCompactBoundaryMessage } from '../../src/types/messages';

describe('SDKCompactBoundaryMessage', () => {
  const mockUUID = 'test-uuid-123' as UUID;
  const mockSessionId = 'session-456';

  test('should create compact boundary message with correct structure', () => {
    const message = createCompactBoundaryMessage(
      mockSessionId,
      mockUUID,
      'manual',
      5000
    );

    expect(message.type).toBe('system');
    expect(message.subtype).toBe('compact_boundary');
    expect(message.uuid).toBe(mockUUID);
    expect(message.session_id).toBe(mockSessionId);
    expect(message.compact_metadata).toEqual({
      trigger: 'manual',
      pre_tokens: 5000,
    });
  });

  test('should support auto trigger type', () => {
    const message = createCompactBoundaryMessage(
      mockSessionId,
      mockUUID,
      'auto',
      10000
    );

    expect(message.compact_metadata.trigger).toBe('auto');
    expect(message.compact_metadata.pre_tokens).toBe(10000);
  });

  test('should be assignable to SDKMessage union type', () => {
    const message: SDKCompactBoundaryMessage = {
      type: 'system',
      subtype: 'compact_boundary',
      uuid: mockUUID,
      session_id: mockSessionId,
      compact_metadata: {
        trigger: 'manual',
        pre_tokens: 5000,
      },
    };

    // This should compile without error
    const sdkMessage: SDKMessage = message;
    expect(sdkMessage.type).toBe('system');
  });

  test('should have all required fields', () => {
    const message = createCompactBoundaryMessage(
      mockSessionId,
      mockUUID,
      'manual',
      5000
    );

    // Verify all required fields exist
    expect(message).toHaveProperty('type');
    expect(message).toHaveProperty('subtype');
    expect(message).toHaveProperty('uuid');
    expect(message).toHaveProperty('session_id');
    expect(message).toHaveProperty('compact_metadata');
    expect(message.compact_metadata).toHaveProperty('trigger');
    expect(message.compact_metadata).toHaveProperty('pre_tokens');
  });

  test('should only accept valid trigger types', () => {
    // Type-level test: manual and auto should be valid
    const manualMessage = createCompactBoundaryMessage(
      mockSessionId,
      mockUUID,
      'manual',
      1000
    );
    const autoMessage = createCompactBoundaryMessage(
      mockSessionId,
      mockUUID,
      'auto',
      1000
    );

    expect(manualMessage.compact_metadata.trigger).toBe('manual');
    expect(autoMessage.compact_metadata.trigger).toBe('auto');
  });
});
