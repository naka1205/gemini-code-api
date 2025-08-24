/**
 * Claude 流式响应转换器 (最小化实现)
 * 暂时只提供一个能通过编译的空实现。
 */
import type { AdapterContext } from '../base/adapter.js';

export function createClaudeStreamTransform(_context: AdapterContext): TransformStream {
  // 待办: 在后续步骤中完整实现此流转换逻辑
  return new TransformStream({
    transform(chunk, controller) {
      // 暂时直接传递原始 chunk
      controller.enqueue(chunk);
    },
  });
}
