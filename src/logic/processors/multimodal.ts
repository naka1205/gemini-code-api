/// src/processors/multimodal.ts

import {
  IProcessor,
  ProcessContext,
  ValidationResult,
  ContentItem,
  GeminiPart
} from './types';

export interface ImageContent {
  mimeType: string;
  data: string;
}

export class MultimodalProcessor implements IProcessor<ContentItem[], GeminiPart[]> {
  /**
   * 处理多模态内容，转换为Gemini格式
   */
  process(input: ContentItem[], context?: ProcessContext): GeminiPart[] {
    if (!input?.length || !context?.features?.multimodal) {
      return [];
    }

    return input.map(item => {
      switch (item.type) {
        case 'text':
          return { text: item.text || '' };
        case 'image':
          return this.processClaudeImage(item.image, context);
        default:
          throw new Error(`Unsupported content type: ${item.type}`);
      }
    });
  }

  /**
   * 验证多模态内容格式
   */
  validate(input: ContentItem[]): ValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(input)) {
      errors.push('Content must be an array');
      return { isValid: false, errors };
    }

    input.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        errors.push(`Content item at index ${index} must be an object`);
        return;
      }

      if (!item.type || !['text', 'image'].includes(item.type)) {
        errors.push(`Content item at index ${index} has invalid type: ${item.type}`);
        return;
      }

      if (item.type === 'text' && typeof item.text !== 'string') {
        errors.push(`Text content at index ${index} must be a string`);
      }

      if (item.type === 'image' && !item.image) {
        errors.push(`Image content at index ${index} is missing image data`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 处理Claude格式的图片
   */
  private processClaudeImage(claudeImage: any, _context: ProcessContext): GeminiPart {
    if (!claudeImage || claudeImage.type !== 'image') {
      throw new Error('Invalid Claude image format');
    }

    const source = claudeImage.source;
    if (!source || !source.data) {
      throw new Error('Missing image data in Claude image');
    }

    // 验证图片大小
    this.validateImageSize(source.data);

    return {
      inlineData: {
        mimeType: this.normalizeMimeType(source.media_type || source.type),
        data: this.validateBase64Data(source.data)
      }
    };
  }

  /**
   * Normalize MIME type to supported formats
   */
  private normalizeMimeType(mimeType?: string): string {
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
   * 静态方法：向后兼容性支持
   */
  static normalizeMimeType(mimeType?: string): string {
    const processor = new MultimodalProcessor();
    return processor.normalizeMimeType(mimeType);
  }

  /**
   * Validate and clean base64 data
   */
  private validateBase64Data(data?: string): string {
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
   * 静态方法：向后兼容性支持
   */
  static validateBase64Data(data?: string): string {
    const processor = new MultimodalProcessor();
    return processor.validateBase64Data(data);
  }


  /**
   * Get image size estimation for caching/memory management
   */
  private estimateImageSize(base64Data: string): number {
    // Base64 encoding adds ~33% overhead, so actual size is roughly 3/4 of base64 length
    const actualBytes = Math.floor(base64Data.length * 0.75);
    return actualBytes;
  }

  /**
   * 静态方法：向后兼容性支持
   */
  static estimateImageSize(base64Data: string): number {
    const processor = new MultimodalProcessor();
    return processor.estimateImageSize(base64Data);
  }

  /**
   * Check if image size is within acceptable limits
   */
  private validateImageSize(base64Data: string, maxSizeMB: number = 20): void {
    const sizeBytes = this.estimateImageSize(base64Data);
    const sizeMB = sizeBytes / (1024 * 1024);
    
    if (sizeMB > maxSizeMB) {
      throw new Error(`Image size (${sizeMB.toFixed(1)}MB) exceeds maximum allowed size (${maxSizeMB}MB)`);
    }
  }

  /**
   * 静态方法：向后兼容性支持
   */
  static validateImageSize(base64Data: string, maxSizeMB: number = 20): void {
    const processor = new MultimodalProcessor();
    return processor.validateImageSize(base64Data, maxSizeMB);
  }

  /**
   * 静态方法：向后兼容性支持 - 处理Claude内容
   */
  static processClaudeContent(content: any[]): any[] {
    const processor = new MultimodalProcessor();
    return processor.processClaudeContent(content);
  }

  /**
   * 静态方法：向后兼容性支持 - 处理OpenAI内容
   */
  static processOpenAIContent(content: any[]): any[] {
    const processor = new MultimodalProcessor();
    return processor.processOpenAIContent(content);
  }

  /**
   * 静态方法：向后兼容性支持 - 转换Claude图片
   */
  static convertClaudeImageToGemini(claudeImage: any): any {
    const processor = new MultimodalProcessor();
    return processor.convertClaudeImageToGemini(claudeImage);
  }

  /**
   * 静态方法：向后兼容性支持 - 转换OpenAI图片
   */
  static convertOpenAIImageToGemini(openaiImage: any): any {
    const processor = new MultimodalProcessor();
    return processor.convertOpenAIImageToGemini(openaiImage);
  }

  /**
   * 静态方法：向后兼容性支持 - 提取MIME类型
   */
  static extractMimeTypeFromDataUrl(dataUrl: string): string | null {
    const match = dataUrl.match(/^data:([^;]+);base64,/);
    return match ? match[1] : null;
  }

  /**
   * 处理Claude内容（私有方法）
   */
  private processClaudeContent(content: any[]): any[] {
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
            return { 
              text: `[Image processing failed: ${imageError instanceof Error ? imageError.message : 'Unknown error'}]` 
            };
          }
        }
        const textContent = item.text || item.content || item.value || '';
        if (textContent) {
          return { text: textContent };
        }
        console.warn(`Unknown content type at index ${index}:`, item);
        return { text: '[Unknown content type]' };
      } catch (error) {
        console.warn(`Error processing content item at index ${index}:`, error);
        return { text: '[Content processing error]' };
      }
    }).filter(item => item.text !== '[Content processing error]');
  }

  /**
   * 处理OpenAI内容（私有方法）
   */
  private processOpenAIContent(content: any[]): any[] {
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
            return { 
              text: `[Image processing failed: ${imageError instanceof Error ? imageError.message : 'Unknown error'}]` 
            };
          }
        }
        const textContent = item.text || item.content || item.value || '';
        if (textContent) {
          return { text: textContent };
        }
        console.warn(`Unknown OpenAI content type at index ${index}:`, item);
        return { text: '[Unknown content type]' };
      } catch (error) {
        console.warn(`Error processing OpenAI content item at index ${index}:`, error);
        return { text: '[Content processing error]' };
      }
    }).filter(item => item.text !== '[Content processing error]');
  }

  /**
   * 转换Claude图片到Gemini格式（私有方法）
   */
  private convertClaudeImageToGemini(claudeImage: any): any {
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
   * 转换OpenAI图片到Gemini格式（私有方法）
   */
  private convertOpenAIImageToGemini(openaiImage: any): any {
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
    
    if (imageUrl.url.startsWith('data:')) {
      try {
        const mimeType = MultimodalProcessor.extractMimeTypeFromDataUrl(imageUrl.url) || 'image/jpeg';
        const normalizedMimeType = this.normalizeMimeType(mimeType);
        
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
    
    throw new Error('HTTP image URLs are not supported. Please use base64 data URLs instead.');
  }
}

/**
 * 向后兼容性：保持原有的Multimodal类名
 */
export const Multimodal = MultimodalProcessor;