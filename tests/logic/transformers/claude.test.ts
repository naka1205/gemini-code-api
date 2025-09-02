// src/logic/transformers/claude.test.ts
import { describe, it, expect } from 'vitest';
import { ClaudeTransformer } from '../../../src/logic/transformers/claude';

describe('ClaudeTransformer', () => {
  const transformer = new ClaudeTransformer();

  describe('transformRequest', () => {
    it('should transform Claude request to Gemini format', () => {
      const claudeRequest = {
        model: 'claude-3-sonnet-20240229',
        messages: [
          { role: 'user', content: 'Hello Claude' },
          { role: 'assistant', content: 'Hello! How can I help you?' }
        ],
        max_tokens: 1024,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        system: 'You are Claude, an AI assistant.',
        stream: false
      };

      const result = transformer.transformRequest(claudeRequest);

      expect(result).toEqual({
        model: 'gemini-2.0-flash',
        body: {
          contents: [
            { role: 'user', parts: [{ text: 'Hello Claude' }] },
            { role: 'model', parts: [{ text: 'Hello! How can I help you?' }] }
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7,
            topP: 0.9,
            topK: 40
          },
          systemInstruction: { parts: [{ text: 'You are Claude, an AI assistant.' }] }
        },
        isStreaming: false
      });
    });

    it('should handle requests without system instruction', () => {
      const claudeRequest = {
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1024
      };

      const result = transformer.transformRequest(claudeRequest);

      expect(result.body.systemInstruction).toBeUndefined();
    });

    it('should handle streaming requests', () => {
      const claudeRequest = {
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1024,
        stream: true
      };

      const result = transformer.transformRequest(claudeRequest);

      expect(result.isStreaming).toBe(true);
    });
  });
});