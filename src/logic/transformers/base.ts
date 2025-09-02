// src/logic/transformers/base.ts

/**
 * Defines the interface for a transformer.
 * Transformers are responsible for converting provider-specific request and response formats
 * to and from the unified Gemini format.
 */
export interface ITransformer {
  /**
   * Transforms an incoming provider-specific request into a format
   * that the Gemini API can understand.
   * @param data The original request data from the provider.
   * @returns An object containing the transformed model, body, and streaming flag.
   */
  transformRequest(data: any): {
    model: string;
    body: any;
    isStreaming: boolean;
  };

  /**
   * Transforms a response from the Gemini API into the format expected
   * by the original provider.
   * @param geminiResponse The raw response from the Gemini API.
   * @param originalRequest The original request data, for context.
   * @returns A Response object formatted for the provider.
   */
  transformResponse(geminiResponse: any, originalRequest: any): Promise<Response>;
}
