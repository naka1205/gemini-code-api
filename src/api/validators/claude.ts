
// src/api/validators/claude.validator.ts

import { z } from 'zod';

// Claude消息内容验证 - 支持完整的Claude内容类型
const ClaudeContentSchema = z.union([
  // 文本内容
  z.object({
    type: z.literal('text'),
    text: z.string()
  }),
  // 图片内容
  z.object({
    type: z.literal('image'),
    source: z.object({
      type: z.enum(['base64', 'url']),
      media_type: z.string(),
      data: z.string()
    })
  }),
  // 工具调用内容
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.any()
  }),
  // 工具结果内容
  z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    content: z.union([z.string(), z.array(z.any())]).optional(),
    is_error: z.boolean().optional()
  }),
  // 思考内容（扩展思考功能）
  z.object({
    type: z.literal('thinking'),
    thinking: z.string()
  })
]);

// Claude消息验证 - 支持字符串和数组两种格式
const ClaudeMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([
    z.string(), // 支持字符串格式
    z.array(ClaudeContentSchema) // 支持数组格式
  ])
});

// Claude思考配置验证
const ClaudeThinkingConfigSchema = z.object({
  type: z.enum(['enabled', 'disabled']),
  budget_tokens: z.number().min(1).max(8192).optional()
});

// Claude工具定义验证
const ClaudeToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  input_schema: z.any()
});

// Claude工具选择验证
const ClaudeToolChoiceSchema = z.union([
  z.literal('auto'),
  z.literal('none'),
  z.object({
    type: z.literal('tool'),
    name: z.string()
  })
]);

// Claude请求验证
export const ClaudeRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ClaudeMessageSchema).min(1),
  max_tokens: z.number().min(1).max(131072).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().min(1).max(40).optional(),
  stream: z.boolean().optional(),
  thinking: ClaudeThinkingConfigSchema.optional(),
  tools: z.array(ClaudeToolSchema).optional(),
  tool_choice: ClaudeToolChoiceSchema.optional()
});

export class ClaudeValidator {
  /**
   * 验证Claude请求
   * 按照BAK原版逻辑实现
   */
  static async validate(request: Request): Promise<any> {
    try {
      const body: any = await request.json();
      
      // 添加调试日志来查看失败的消息
      console.log('[CLAUDE VALIDATION DEBUG] Validating request with', body.messages?.length, 'messages');
      if (body.messages && body.messages.length > 0) {
        body.messages.forEach((msg: any, index: number) => {
          console.log(`[CLAUDE VALIDATION DEBUG] Message ${index}:`, {
            role: msg.role,
            contentType: typeof msg.content,
            contentIsArray: Array.isArray(msg.content),
            contentPreview: Array.isArray(msg.content) 
              ? msg.content.map((c: any) => ({ type: c.type, hasText: !!c.text, hasId: !!c.id, hasToolUseId: !!c.tool_use_id }))
              : typeof msg.content === 'string' ? msg.content.substring(0, 100) + '...' : msg.content
          });
        });
      }
      
      // 基础验证
      const validatedData = ClaudeRequestSchema.parse(body);
      
      // 按照BAK原版逻辑进行额外验证
      this.validateClaudeRequest(validatedData);
      
      return validatedData;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        console.log('[CLAUDE VALIDATION ERROR]', errorMessage);
        console.log('[CLAUDE VALIDATION ERROR] Issues:', error.errors);
        throw new Error(`Validation failed: ${errorMessage}`);
      }
      throw error;
    }
  }

  /**
   * 按照BAK原版逻辑验证Claude请求
   */
  private static validateClaudeRequest(data: any): void {
    // 验证必需字段
    if (!data.model || !data.messages || !Array.isArray(data.messages)) {
      throw new Error('Fields "model" and "messages" are required');
    }

    // 验证消息格式
    if (data.messages.length === 0) {
      throw new Error('At least one message is required');
    }

    // 验证流式请求的max_tokens（流式请求时max_tokens是可选的）
    if (!data.stream && !data.max_tokens) {
      throw new Error('max_tokens is required for non-streaming requests');
    }

    // 验证思考配置
    if (data.thinking) {
      if (data.thinking.type === 'enabled' && data.thinking.budget_tokens) {
        if (data.thinking.budget_tokens < 1 || data.thinking.budget_tokens > 8192) {
          throw new Error('thinking.budget_tokens must be between 1 and 8192');
        }
      }
    }

    // 验证工具配置
    if (data.tools && data.tools.length > 0) {
      if (data.tools.length > 128) {
        throw new Error('Maximum 128 tools allowed');
      }
      
      for (const tool of data.tools) {
        if (!tool.name || typeof tool.name !== 'string') {
          throw new Error('Tool name is required and must be a string');
        }
      }
    }

    // 验证工具选择
    if (data.tool_choice && data.tool_choice !== 'auto' && data.tool_choice !== 'none') {
      if (data.tool_choice.type === 'tool' && !data.tool_choice.name) {
        throw new Error('Tool choice name is required when type is "tool"');
      }
    }

    // 验证流式配置
    if (data.stream === true) {
      // 流式请求的特殊验证
      if (data.max_tokens && (data.max_tokens < 1 || data.max_tokens > 131072)) {
        throw new Error('max_tokens must be between 1 and 131072 for streaming requests');
      }
    }
  }
}
