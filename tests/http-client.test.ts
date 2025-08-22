/**
 * HTTP客户端测试
 */
import { describe, it, expect, vi } from 'vitest';
import { HttpClientImpl } from '../src/services/http/client.js';
import { RetryStrategies } from '../src/services/http/retry.js';

// Mock fetch
global.fetch = vi.fn();

describe('HttpClientImpl', () => {
  let httpClient: HttpClientImpl;

  beforeEach(() => {
    httpClient = new HttpClientImpl();
    vi.clearAllMocks();
  });

  it('should create instance successfully', () => {
    expect(httpClient).toBeInstanceOf(HttpClientImpl);
  });

  it('should have all required methods', () => {
    expect(typeof httpClient.get).toBe('function');
    expect(typeof httpClient.post).toBe('function');
    expect(typeof httpClient.put).toBe('function');
    expect(typeof httpClient.delete).toBe('function');
    expect(typeof httpClient.patch).toBe('function');
    expect(typeof httpClient.stream).toBe('function');
    expect(typeof httpClient.request).toBe('function');
  });

  it('should handle successful GET request', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      url: 'https://example.com/api/test',
      redirected: false,
      text: () => Promise.resolve('{"message": "success"}'),
    };

    (global.fetch as any).mockResolvedValueOnce(mockResponse);

    const response = await httpClient.get('https://example.com/api/test');

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({ message: 'success' });
  });

  it('should handle POST request with JSON body', async () => {
    const mockResponse = {
      ok: true,
      status: 201,
      statusText: 'Created',
      headers: new Headers({ 'content-type': 'application/json' }),
      url: 'https://example.com/api/test',
      redirected: false,
      text: () => Promise.resolve('{"id": 1}'),
    };

    (global.fetch as any).mockResolvedValueOnce(mockResponse);

    const requestData = { name: 'test' };
    const response = await httpClient.post('https://example.com/api/test', requestData);

    expect(response.status).toBe(201);
    expect(response.data).toEqual({ id: 1 });
    
    // Verify fetch was called with correct parameters
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(requestData),
        headers: expect.any(Headers),
      })
    );
  });

  it('should handle HTTP errors correctly', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      url: 'https://example.com/api/test',
      redirected: false,
      text: () => Promise.resolve('{"error": "Not found"}'),
    };

    (global.fetch as any).mockResolvedValueOnce(mockResponse);

    try {
      await httpClient.get('https://example.com/api/test');
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.name).toBe('HttpError');
      expect(error.status).toBe(404);
    }
  });

  it('should handle network errors', async () => {
    (global.fetch as any).mockRejectedValueOnce(new TypeError('Network error'));

    try {
      await httpClient.get('https://example.com/api/test');
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.name).toBe('HttpError');
      expect(error.message).toContain('Network error');
    }
  });
});

describe('RetryStrategies', () => {
  it('should have predefined strategies', () => {
    expect(RetryStrategies.conservative).toBeDefined();
    expect(RetryStrategies.standard).toBeDefined();
    expect(RetryStrategies.aggressive).toBeDefined();
    expect(RetryStrategies.fastFail).toBeDefined();
  });

  it('should have different retry configurations', () => {
    const conservativeConfig = RetryStrategies.conservative.getConfig();
    const aggressiveConfig = RetryStrategies.aggressive.getConfig();

    expect(conservativeConfig.maxRetries).toBeLessThan(aggressiveConfig.maxRetries);
    expect(conservativeConfig.initialDelay).toBeGreaterThan(aggressiveConfig.initialDelay);
  });
});