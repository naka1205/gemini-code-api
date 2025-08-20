// OpenAI嵌入向量适配器模块
// 处理嵌入向量生成请求，包括批量处理

import { OpenAICore } from './core';
import type { OpenAIRequest } from '../../types/openai';

export class OpenAIEmbeddingsAdapter extends OpenAICore {
  private readonly DEFAULT_EMBEDDINGS_MODEL = "text-embedding-004";

  // 处理嵌入向量请求
  async create(req: OpenAIRequest): Promise<Response> {
    try {
      if (typeof req.model !== "string") {
        throw new Error("model is not specified");
      }

      const model = this.getEmbeddingModel(req.model);
      const input = this.normalizeInput(req.input);
      
      const requestBody = this.buildEmbeddingRequest(model, input, req.dimensions);
      
      const response = await this.makeRequest(`${model}:batchEmbedContents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      let responseBody: string;
      if (response.ok) {
        const data = await response.text();
        const parsedData = JSON.parse(data);
        responseBody = this.transformEmbeddingResponse(parsedData, req.model);
      } else {
        responseBody = await response.text();
      }

      return new Response(responseBody, this.fixCors(response));
    } catch (err: any) {
      return this.handleError(err);
    }
  }

  // 获取嵌入模型名称
  private getEmbeddingModel(model: string): string {
    if (model.startsWith("models/")) {
      return model;
    }
    
    // 如果不是Gemini模型，使用默认嵌入模型
    if (!model.startsWith("gemini-")) {
      model = this.DEFAULT_EMBEDDINGS_MODEL;
    }
    
    return "models/" + model;
  }

  // 标准化输入
  private normalizeInput(input: string | string[] | undefined): string[] {
    if (!input) {
      throw new Error("input is required");
    }
    
    return Array.isArray(input) ? input : [input];
  }

  // 构建嵌入请求
  private buildEmbeddingRequest(model: string, input: string[], dimensions?: number): any {
    return {
      requests: input.map((text: string) => ({
        model,
        content: { parts: [{ text }] },
        ...(dimensions && { outputDimensionality: dimensions }),
      }))
    };
  }

  // 转换嵌入响应
  private transformEmbeddingResponse(data: any, originalModel: string): string {
    const { embeddings } = data;
    
    if (!embeddings || !Array.isArray(embeddings)) {
      throw new Error("Invalid embedding response format");
    }

    const response = {
      object: "list",
      data: embeddings.map(({ values }: { values: number[] }, index: number) => ({
        object: "embedding",
        index,
        embedding: values,
      })),
      model: originalModel,
      usage: {
        prompt_tokens: this.calculatePromptTokens(embeddings.length),
        total_tokens: this.calculatePromptTokens(embeddings.length),
      }
    };

    return JSON.stringify(response, null, 2);
  }

  // 计算提示token数量（简单估算）
  private calculatePromptTokens(embeddingCount: number): number {
    // 简单估算：每个嵌入大约对应10个token
    return embeddingCount * 10;
  }

  // 批量处理嵌入请求
  async batchCreate(requests: OpenAIRequest[]): Promise<Response[]> {
    const promises = requests.map(req => this.create(req));
    return Promise.all(promises);
  }

  // 验证嵌入请求
  private validateEmbeddingRequest(req: OpenAIRequest): void {
    if (!req.input) {
      throw new Error("input parameter is required");
    }

    if (typeof req.input === 'string' && req.input.trim().length === 0) {
      throw new Error("input cannot be empty");
    }

    if (Array.isArray(req.input)) {
      if (req.input.length === 0) {
        throw new Error("input array cannot be empty");
      }
      
      if (req.input.some(item => typeof item !== 'string' || item.trim().length === 0)) {
        throw new Error("all input items must be non-empty strings");
      }

      // 检查批量大小限制
      if (req.input.length > 100) {
        throw new Error("batch size cannot exceed 100 items");
      }
    }

    if (req.dimensions && (req.dimensions < 1 || req.dimensions > 3072)) {
      throw new Error("dimensions must be between 1 and 3072");
    }
  }

  // 创建带验证的嵌入
  async createWithValidation(req: OpenAIRequest): Promise<Response> {
    try {
      this.validateEmbeddingRequest(req);
      return await this.create(req);
    } catch (err: any) {
      return this.handleError(err);
    }
  }
}