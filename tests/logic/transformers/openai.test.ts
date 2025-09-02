// src/logic/transformers/openai.test.ts
import { describe, it, expect } from 'vitest';
import { OpenAITransformer } from '../../../src/logic/transformers/openai';

describe('OpenAITransformer', () => {
  const transformer = new OpenAITransformer();

  describe('transformRequest', () => {
    it('should transform OpenAI request to Gemini format', () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' }
        ],
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.9,
        stream: false
      };

      const result = transformer.transformRequest(openaiRequest);

      expect(result).toEqual({
        model: 'gemini-2.5-flash',
        body: {
          contents: [
            { role: 'user', parts: [{ text: 'Hello' }] },
            { role: 'model', parts: [{ text: 'Hi there!' }] },
            { role: 'user', parts: [{ text: 'How are you?' }] }
          ],
          generationConfig: {
            maxOutputTokens: 100,
            temperature: 0.7,
            topP: 0.9
          }
        },
        isStreaming: false
      });
    });

    it('should filter out system messages', () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' }
        ],
        max_tokens: 100
      };

      const result = transformer.transformRequest(openaiRequest);

      expect(result.body.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] }
      ]);
    });

    it('should handle streaming requests', () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      const result = transformer.transformRequest(openaiRequest);

      expect(result.isStreaming).toBe(true);
    });
  });
});