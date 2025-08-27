# 示例响应文件汇总

本目录包含了运行所有示例后保存的API响应结果，用于分析和验证项目功能。

## 📁 文件结构

```
examples/responses/
├── README.md                    # 本文件
├── images/                      # 生成的图片文件
│   └── qna-image.png           # 图片问答生成的图片
├── gemini-*.json               # Gemini API 响应文件 (16个)
└── claude-*.json               # Claude API 响应文件 (9个)
```

## 📊 响应文件统计

### Gemini 响应文件 (16个)
- **基础对话**: `gemini-基础对话.json` - 基础文本对话响应
- **图片描述**: `gemini-图片描述.json` - 图片内容描述响应
- **图片分析**: `gemini-图片分析.json` - 图片技术分析响应
- **图片问答**: `gemini-图片问答.json` - 图片问答响应
- **多图片比较**: `gemini-多图片比较.json` - 多图片对比分析响应
- **创意生成**: `gemini-创意生成.json` - 创意图片生成响应
- **技术分析**: `gemini-技术分析.json` - 技术图片分析响应
- **网页访问**: `gemini-网页访问.json` - 网页内容访问响应
- **天气查询**: `gemini-天气查询.json` - 工具调用响应
- **计算器**: `gemini-计算器.json` - 数学计算工具调用响应
- **多工具调用**: `gemini-多工具调用.json` - 多工具调用响应
- **强制工具使用**: `gemini-强制工具使用.json` - 强制工具使用响应
- **多轮对话**: `gemini-多轮对话.json` - 多轮对话历史响应
- **结构化输出**: `gemini-结构化输出.json` - 结构化输出响应
- **长上下文**: `gemini-长上下文处理.json` - 长上下文处理响应
- **流式响应**: `gemini-流式响应.json` - 流式响应处理

### Claude 响应文件 (9个)
- **基础消息**: `claude-基础消息.json` - 基础消息响应
- **图片理解**: `claude-图片理解.json` - 图片理解响应
- **工具使用**: `claude-工具使用.json` - 基础工具调用响应 
- **多工具调用**: `claude-多工具调用.json` - 多工具调用响应 
- **强制工具使用**: `claude-强制工具使用.json` - 强制工具使用响应
- **多轮对话**: `claude-多轮对话.json` - 多轮对话响应
- **系统消息**: `claude-系统消息.json` - 系统消息响应
- **流式响应**: `claude-流式响应.json` - 流式响应处理
- **深度思考**: `claude-深度思考.json` - 深度思考推理 

**注意**: 所有响应文件都使用简洁的文件名，不包含时间戳，每次运行都会覆盖之前的文件，只保留最新数据

## 📋 响应文件格式

每个响应文件都包含以下结构：

```json
{
  "timestamp": "2025-08-26T01:14:04.446Z",
  "example": "gemini-基础对话",
  "request": {
    "model": "gemini-2.5-flash",
    "testType": "基础对话"
  },
  "response": {
    // 实际的API响应内容
    "candidates": [...],
    "usageMetadata": {...}
  },
  "metadata": {
    "responseSize": 2100,
    "hasError": false
  }
}
```

### 字段说明

- **timestamp**: 响应生成时间
- **example**: 示例名称
- **request**: 请求信息（模型、测试类型等）
- **response**: 实际的API响应内容
- **metadata**: 元数据信息
  - **responseSize**: 响应大小（字节）
  - **hasError**: 是否有错误

## 🔗 相关文档

- [示例运行报告](../docs/EXAMPLES_RUN_REPORT.md)
- [优化建议](../docs/OPTIMIZATION_SUMMARY.md)
- [API文档](https://ai.google.dev/api/generate-content)
- [Claude工具使用文档](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)

---
