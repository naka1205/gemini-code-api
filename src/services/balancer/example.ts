/**
 * 精简多KEY智能负载均衡器使用示例
 * 展示如何在现有代码中集成
 */

import { SmartLoadBalancer } from './selector.js';
import type { D1Database } from '@cloudflare/workers-types';

// 在Worker环境中的使用示例
export async function exampleUsage(
  apiKeys: string[],
  model: string,
  kv: KVNamespace,
  db: D1Database
) {
  // 1. 创建智能负载均衡器实例
  const loadBalancer = new SmartLoadBalancer(kv, db);
  let result: any = null;

  try {
    // 2. 选择最优API密钥
    result = await loadBalancer.selectOptimalKey(
      apiKeys,
      model,
      1000 // 预估token数
    );

    console.log('Selected API key:', {
      keyHash: result.selectedKeyHash.substring(0, 8) + '...',
      reason: result.reason,
      availableKeys: result.availableKeys,
      healthyKeys: result.healthyKeys,
    });

    // 3. 使用选中的密钥调用API
    const apiResponse = await callGeminiAPI(result.selectedKey, model);

    // 4. 记录使用情况
    await loadBalancer.recordUsage(
      result.selectedKey,
      model,
      apiResponse.inputTokens || 0,
      apiResponse.outputTokens || 0
    );

    return apiResponse;

  } catch (error) {
    // 5. 处理API错误
    if (result?.selectedKey) {
      await loadBalancer.handleApiError(result.selectedKey, model, error);
    }
    throw error;
  }
}

// 模拟API调用
async function callGeminiAPI(_apiKey: string, _model: string) {
  // 这里应该是实际的Gemini API调用
  return {
    inputTokens: 100,
    outputTokens: 50,
    response: 'Mock response',
  };
}

// 在现有路由中的集成示例
export async function integrateWithExistingRoute(
  request: Request,
  env: { KV: KVNamespace; DB: D1Database }
) {
  // 从请求中提取API密钥
  const apiKeys = extractApiKeysFromRequest(request);
  const model = extractModelFromRequest(request);

  if (!apiKeys || apiKeys.length === 0) {
    return new Response('No API keys provided', { status: 400 });
  }

  // 使用智能负载均衡器
  const loadBalancer = new SmartLoadBalancer(env.KV, env.DB);
  let result: any = null;
  
  try {
    result = await loadBalancer.selectOptimalKey(apiKeys, model);
    
    // 使用选中的密钥处理请求
    const response = await processRequestWithKey(result.selectedKey, request);
    
    // 记录使用情况
    await loadBalancer.recordUsage(
      result.selectedKey,
      model,
      response.inputTokens,
      response.outputTokens
    );
    
    return response;
    
  } catch (error) {
    // 处理错误
    if (result?.selectedKey) {
      await loadBalancer.handleApiError(result.selectedKey, model, error);
    }
    throw error;
  }
}

// 辅助函数
function extractApiKeysFromRequest(request: Request): string[] {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const keys = authHeader.substring(7).split(',');
    return keys.map(key => key.trim()).filter(key => key.length > 0);
  }
  return [];
}

function extractModelFromRequest(_request: Request): string {
  // 从请求体中提取模型信息
  return 'gemini-2.5-flash'; // 简化示例
}

async function processRequestWithKey(_apiKey: string, _request: Request) {
  // 使用选中的API密钥处理请求
  return {
    inputTokens: 100,
    outputTokens: 50,
    response: 'Processed response',
  };
}
