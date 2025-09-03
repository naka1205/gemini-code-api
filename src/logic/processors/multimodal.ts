// src/processors/multimodal.ts

export interface ImageContent {
  mimeType: string;
  data: string;
}

export class Multimodal {
  /**
   * Normalize MIME type to supported formats
   */
  static normalizeMimeType(mimeType?: string): string {
    if (!mimeType) return 'image/jpeg';
    
    const validTypes = [
      'image/jpeg',
      'image/png', 
      'image/webp',
      'image/gif',
      'image/bmp'
    ];
    
    // Normalize common variations
    const normalized = mimeType.toLowerCase();
    const typeMap: Record<string, string> = {
      'image/jpg': 'image/jpeg',
      'image/jpe': 'image/jpeg',
      'image/pjpeg': 'image/jpeg',
      'image/x-png': 'image/png',
      'image/x-webp': 'image/webp'
    };
    
    const mappedType = typeMap[normalized] || normalized;
    return validTypes.includes(mappedType) ? mappedType : 'image/jpeg';
  }

  /**
   * Validate and clean base64 data
   */
  static validateBase64Data(data?: string): string {
    if (!data) {
      throw new Error('Image data is required');
    }
    
    // Remove data URL prefix if present
    let cleanData = data;
    if (data.startsWith('data:')) {
      const commaIndex = data.indexOf(',');
      if (commaIndex > -1) {
        cleanData = data.substring(commaIndex + 1);
      }
    }
    
    // Remove whitespace and newlines
    cleanData = cleanData.replace(/\\s+/g, '');
    
    // Validate base64 format
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(cleanData)) {
      throw new Error('Invalid base64 image data format');
    }
    
    // Check minimum size (should be at least a few hundred bytes for a real image)
    if (cleanData.length < 100) {
      throw new Error('Image data appears to be too small');
    }
    
    return cleanData;
  }

  /**
   * Extract MIME type from base64 data URL
   */
  static extractMimeTypeFromDataUrl(dataUrl: string): string | null {
    const match = dataUrl.match(/^data:([^;]+);base64,/);
    return match ? match[1] : null;
  }

  /**
   * Convert Claude image format to Gemini format with enhanced error handling
   */
  static convertClaudeImageToGemini(claudeImage: any): any {
    if (!claudeImage || claudeImage.type !== 'image') {
      throw new Error('Invalid Claude image format: missing type or not an image');
    }
    
    const source = claudeImage.source;
    if (!source) {
      throw new Error('Missing image source in Claude image format');
    }
    
    if (!source.data) {
      throw new Error('Missing image data in Claude image source');
    }
    
    try {
      // Validate image size before processing
      this.validateImageSize(source.data);
      
      const mimeType = this.normalizeMimeType(source.media_type || source.type);
      const data = this.validateBase64Data(source.data);
      
      return {
        inlineData: {
          mimeType,
          data
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      throw new Error(`Failed to convert Claude image: ${errorMessage}`);
    }
  }

  /**
   * Convert OpenAI image format to Gemini format with enhanced error handling
   */
  static convertOpenAIImageToGemini(openaiImage: any): any {
    if (!openaiImage || openaiImage.type !== 'image_url') {
      throw new Error('Invalid OpenAI image format: missing type or not an image_url');
    }
    
    const imageUrl = openaiImage.image_url;
    if (!imageUrl) {
      throw new Error('Missing image_url in OpenAI image format');
    }
    
    if (!imageUrl.url) {
      throw new Error('Missing url in OpenAI image_url object');
    }
    
    // Handle base64 data URLs
    if (imageUrl.url.startsWith('data:')) {
      try {
        const mimeType = this.extractMimeTypeFromDataUrl(imageUrl.url) || 'image/jpeg';
        const normalizedMimeType = this.normalizeMimeType(mimeType);
        
        // Validate image size before processing
        this.validateImageSize(imageUrl.url);
        
        const data = this.validateBase64Data(imageUrl.url);
        
        return {
          inlineData: {
            mimeType: normalizedMimeType,
            data
          }
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
        throw new Error(`Failed to process OpenAI base64 image: ${errorMessage}`);
      }
    }
    
    // Handle HTTP URLs (would need to fetch and convert)
    throw new Error('HTTP image URLs are not supported. Please use base64 data URLs instead.');
  }

  /**
   * Process mixed content array (text + images) for Claude format with enhanced error tolerance
   */
  static processClaudeContent(content: any[]): any[] {
    return content.map((item: any, index: number) => {
      try {
        if (typeof item === 'string') {
          return { text: item };
        } else if (item.type === 'text') {
          return { text: item.text || '' };
        } else if (item.type === 'image') {
          try {
            return this.convertClaudeImageToGemini(item);
          } catch (imageError) {
            console.warn(`Failed to process image at index ${index}:`, imageError);
            // Return text fallback for failed image processing
            return { 
              text: `[Image processing failed: ${imageError instanceof Error ? imageError.message : 'Unknown error'}]` 
            };
          }
        }
        // Enhanced fallback for unknown content types
        const textContent = item.text || item.content || item.value || '';
        if (textContent) {
          return { text: textContent };
        }
        // If no text content found, return placeholder
        console.warn(`Unknown content type at index ${index}:`, item);
        return { text: '[Unknown content type]' };
      } catch (error) {
        console.warn(`Error processing content item at index ${index}:`, error);
        return { text: '[Content processing error]' };
      }
    }).filter(item => item.text !== '[Content processing error]'); // Remove failed items
  }

  /**
   * Process mixed content array (text + images) for OpenAI format with enhanced error tolerance
   */
  static processOpenAIContent(content: any[]): any[] {
    return content.map((item: any, index: number) => {
      try {
        if (typeof item === 'string') {
          return { text: item };
        } else if (item.type === 'text') {
          return { text: item.text || '' };
        } else if (item.type === 'image_url') {
          try {
            return this.convertOpenAIImageToGemini(item);
          } catch (imageError) {
            console.warn(`Failed to process OpenAI image at index ${index}:`, imageError);
            // Return text fallback for failed image processing
            return { 
              text: `[Image processing failed: ${imageError instanceof Error ? imageError.message : 'Unknown error'}]` 
            };
          }
        }
        // Enhanced fallback for unknown content types
        const textContent = item.text || item.content || item.value || '';
        if (textContent) {
          return { text: textContent };
        }
        // If no text content found, return placeholder
        console.warn(`Unknown OpenAI content type at index ${index}:`, item);
        return { text: '[Unknown content type]' };
      } catch (error) {
        console.warn(`Error processing OpenAI content item at index ${index}:`, error);
        return { text: '[Content processing error]' };
      }
    }).filter(item => item.text !== '[Content processing error]'); // Remove failed items
  }

  /**
   * Get image size estimation for caching/memory management
   */
  static estimateImageSize(base64Data: string): number {
    // Base64 encoding adds ~33% overhead, so actual size is roughly 3/4 of base64 length
    const actualBytes = Math.floor(base64Data.length * 0.75);
    return actualBytes;
  }

  /**
   * Check if image size is within acceptable limits
   */
  static validateImageSize(base64Data: string, maxSizeMB: number = 20): void {
    const sizeBytes = this.estimateImageSize(base64Data);
    const sizeMB = sizeBytes / (1024 * 1024);
    
    if (sizeMB > maxSizeMB) {
      throw new Error(`Image size (${sizeMB.toFixed(1)}MB) exceeds maximum allowed size (${maxSizeMB}MB)`);
    }
  }
}