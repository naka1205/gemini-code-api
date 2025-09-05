// src/logic/processors/index.ts
/**
 * 处理器统一导出
 * 提供所有处理器的统一访问入口
 */

// 导入处理器类
import { ThinkingProcessor } from './thinking';
import { ToolsProcessor } from './tools';
import { MultimodalProcessor } from './multimodal';
import { StreamingProcessor } from './streaming';
import { ConfigProcessor } from './config';

// 导出类型定义
export * from './types';

// 导出处理器
export { ThinkingProcessor } from './thinking';
export { ToolsProcessor } from './tools';
export { MultimodalProcessor } from './multimodal';
export { StreamingProcessor } from './streaming';
export { ConfigProcessor } from './config';

// 导出处理器工厂
export class ProcessorFactory {
  /**
   * 创建思考处理器实例
   */
  static createThinkingProcessor(): ThinkingProcessor {
    return new ThinkingProcessor();
  }

  /**
   * 创建工具处理器实例
   */
  static createToolsProcessor(): ToolsProcessor {
    return new ToolsProcessor();
  }

  /**
   * 创建多模态处理器实例
   */
  static createMultimodalProcessor(): MultimodalProcessor {
    return new MultimodalProcessor();
  }

  /**
   * 创建流式处理器实例
   */
  static createStreamingProcessor(): StreamingProcessor {
    return new StreamingProcessor();
  }

  /**
   * 创建配置处理器实例
   */
  static createConfigProcessor(): ConfigProcessor {
    return new ConfigProcessor();
  }
}
