// OpenAI模型列表适配器模块
// 处理模型列表获取和格式化

import { OpenAICore } from './core';

export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  permission?: any[];
  root?: string;
  parent?: string | null;
}

export interface ModelsResponse {
  object: string;
  data: ModelInfo[];
}

export class OpenAIModelsAdapter extends OpenAICore {
  
  // 获取模型列表
  async list(): Promise<Response> {
    try {
      const response = await this.makeRequest('models', {
        method: 'GET'
      });

      let responseBody: string;
      if (response.ok) {
        const data = await response.text();
        const parsedData = JSON.parse(data);
        responseBody = this.transformModelsResponse(parsedData);
      } else {
        responseBody = await response.text();
      }

      return new Response(responseBody, this.fixCors(response));
    } catch (err: any) {
      return this.handleError(err);
    }
  }

  // 获取特定模型信息
  async retrieve(modelId: string): Promise<Response> {
    try {
      if (!modelId) {
        throw new Error("Model ID is required");
      }

      // 首先获取所有模型
      const modelsResponse = await this.list();
      if (!modelsResponse.ok) {
        return modelsResponse;
      }

      const modelsData = await modelsResponse.text();
      const parsedModels: ModelsResponse = JSON.parse(modelsData);
      
      // 查找特定模型
      const model = parsedModels.data.find(m => m.id === modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      return new Response(JSON.stringify(model, null, 2), {
        status: 200,
        headers: this.fixCors({ headers: new Headers({ 'Content-Type': 'application/json' }) }).headers
      });
    } catch (err: any) {
      return this.handleError(err);
    }
  }

  // 转换模型响应格式
  private transformModelsResponse(data: any): string {
    const { models } = data;
    
    if (!models || !Array.isArray(models)) {
      throw new Error("Invalid models response format");
    }

    const transformedModels = models.map(({ name }: { name: string }) => ({
      id: name.replace("models/", ""),
      object: "model",
      created: 0,
      owned_by: "google",
      permission: [],
      root: name.replace("models/", ""),
      parent: null
    }));

    const response: ModelsResponse = {
      object: "list",
      data: transformedModels
    };

    return JSON.stringify(response, null, 2);
  }

  // 获取支持的模型类别
  getSupportedModelCategories(): string[] {
    return [
      'gemini',
      'gemma', 
      'learnlm',
      'text-embedding'
    ];
  }

  // 检查模型是否支持
  isModelSupported(modelId: string): boolean {
    const supportedPrefixes = this.getSupportedModelCategories();
    return supportedPrefixes.some(prefix => modelId.startsWith(prefix));
  }

  // 获取模型能力信息
  getModelCapabilities(modelId: string): any {
    const capabilities: Record<string, any> = {
      'gemini-2.5-flash': {
        supports_chat: true,
        supports_embeddings: false,
        supports_functions: true,
        supports_vision: true,
        supports_audio: true,
        max_tokens: 8192,
        context_window: 1000000
      },
      'gemini-2.5-pro': {
        supports_chat: true,
        supports_embeddings: false,
        supports_functions: true,
        supports_vision: true,
        supports_audio: true,
        max_tokens: 8192,
        context_window: 2000000
      },
      'gemini-2.0-flash': {
        supports_chat: true,
        supports_embeddings: false,
        supports_functions: true,
        supports_vision: true,
        supports_audio: true,
        max_tokens: 8192,
        context_window: 1000000
      },
      'text-embedding-004': {
        supports_chat: false,
        supports_embeddings: true,
        supports_functions: false,
        supports_vision: false,
        supports_audio: false,
        max_dimensions: 768,
        context_window: 2048
      }
    };

    return capabilities[modelId] || {
      supports_chat: true,
      supports_embeddings: false,
      supports_functions: false,
      supports_vision: false,
      supports_audio: false,
      max_tokens: 4096,
      context_window: 32768
    };
  }

  // 获取模型详细信息（包含能力）
  async getModelDetails(modelId: string): Promise<Response> {
    try {
      const modelResponse = await this.retrieve(modelId);
      if (!modelResponse.ok) {
        return modelResponse;
      }

      const modelData = await modelResponse.text();
      const model = JSON.parse(modelData);
      
      // 添加能力信息
      const capabilities = this.getModelCapabilities(modelId);
      const detailedModel = {
        ...model,
        capabilities
      };

      return new Response(JSON.stringify(detailedModel, null, 2), {
        status: 200,
        headers: this.fixCors({ headers: new Headers({ 'Content-Type': 'application/json' }) }).headers
      });
    } catch (err: any) {
      return this.handleError(err);
    }
  }

  // 按类别过滤模型
  async listByCategory(category: string): Promise<Response> {
    try {
      const modelsResponse = await this.list();
      if (!modelsResponse.ok) {
        return modelsResponse;
      }

      const modelsData = await modelsResponse.text();
      const parsedModels: ModelsResponse = JSON.parse(modelsData);
      
      const filteredModels = parsedModels.data.filter(model => 
        model.id.startsWith(category)
      );

      const response: ModelsResponse = {
        object: "list",
        data: filteredModels
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: 200,
        headers: this.fixCors({ headers: new Headers({ 'Content-Type': 'application/json' }) }).headers
      });
    } catch (err: any) {
      return this.handleError(err);
    }
  }

  // 获取推荐模型
  getRecommendedModels(): ModelInfo[] {
    return [
      {
        id: "gemini-2.5-flash",
        object: "model",
        created: 0,
        owned_by: "google",
        permission: [],
        root: "gemini-2.5-flash",
        parent: null
      },
      {
        id: "gemini-2.5-pro", 
        object: "model",
        created: 0,
        owned_by: "google",
        permission: [],
        root: "gemini-2.5-pro",
        parent: null
      },
      {
        id: "text-embedding-004",
        object: "model", 
        created: 0,
        owned_by: "google",
        permission: [],
        root: "text-embedding-004",
        parent: null
      }
    ];
  }

  // 获取推荐模型列表
  async listRecommended(): Promise<Response> {
    try {
      const recommendedModels = this.getRecommendedModels();
      
      const response: ModelsResponse = {
        object: "list",
        data: recommendedModels
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: 200,
        headers: this.fixCors({ headers: new Headers({ 'Content-Type': 'application/json' }) }).headers
      });
    } catch (err: any) {
      return this.handleError(err);
    }
  }
}