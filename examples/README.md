# Gemini Code API - 示例集合

本目录包含了 Gemini Code API 的各种使用示例，从基础对话到高级功能，帮助开发者了解和使用项目的各项功能。

## 📁 目录结构

```
examples/
├── README.md                    # 本文件
├── config.js                    # 示例配置（常量硬编码）
├── utils.js                     # 示例工具函数
├── run.js                       # 批量运行/基准脚本
├── data/                        # 测试数据
│   ├── images/                  # 测试图片
│   └── documents/               # 测试文档
├── gemini/                      # Gemini 原生 API 示例
│   ├── basic-chat.js           # 基础对话
│   ├── image-upload.js         # 图片上传和理解
│   ├── web-access.js           # 网页访问
│   ├── tool-calling.js         # 工具调用
│   ├── multi-turn-chat.js      # 多轮对话
│   ├── structured-output.js    # 结构化输出
│   ├── long-context.js         # 长上下文处理
│   └── streaming.js            # 流式响应
└── claude/                      # Claude API 示例
    ├── basic-messages.js       # 基础消息
    ├── image-understanding.js  # 图片理解
    ├── tool-use.js             # 工具使用
    ├── multi-turn.js           # 多轮对话
    ├── system-messages.js      # 系统消息
    └── streaming.js            # 流式响应
```

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装依赖
npm install
```

### 2. 运行示例

```bash
# 运行 Gemini 基础对话示例
node examples/gemini/basic-chat.js

# 运行 Claude 基础消息示例
node examples/claude/basic-messages.js

# 运行所有示例
npm run examples
```

## 📋 示例分类

### 🔵 Gemini 原生 API 示例

| 示例 | 功能描述 | 复杂度 |
|------|----------|--------|
| `basic-chat.js` | 基础文本对话 | ⭐ |
| `image-upload.js` | 图片上传和理解 | ⭐⭐ |
| `web-access.js` | 网页内容访问 | ⭐⭐ |
| `tool-calling.js` | 函数调用和工具使用 | ⭐⭐⭐ |
| `multi-turn-chat.js` | 多轮对话管理 | ⭐⭐ |
| `structured-output.js` | 结构化输出生成 | ⭐⭐ |
| `long-context.js` | 长上下文处理 | ⭐⭐⭐ |
| `streaming.js` | 流式响应处理 | ⭐⭐ |

### 🟣 Claude API 示例

| 示例 | 功能描述 | 复杂度 |
|------|----------|--------|
| `basic-messages.js` | 基础消息处理 | ⭐ |
| `image-understanding.js` | 图片理解 | ⭐⭐ |
| `tool-use.js` | 工具使用 | ⭐⭐⭐ |
| `multi-turn.js` | 多轮对话 | ⭐⭐ |
| `system-messages.js` | 系统消息处理 | ⭐⭐ |
| `streaming.js` | 流式响应 | ⭐⭐ |
| `extended-thinking.js` | Extended Thinking 功能 | ⭐⭐⭐ |

## 🔧 配置说明

### 配置文件

每个示例都可以通过配置文件自定义参数：

```javascript
// examples/config.js（常量硬编码示例）
const path = require('path');
module.exports = {
  api: {
    baseUrl: 'https://api.nkk.us.kg',
    apiKey: '你的API密钥',
    timeout: 30000,
    retries: 3,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'gemini-code-api-examples/1.0.0'
    },
  },
  models: {
    gemini: { default: 'gemini-2.5-flash', pro: 'gemini-2.5-pro', vision: 'gemini-2.5-flash' },
    claude: { default: 'claude-3-5-sonnet-20241022', haiku: 'claude-3-5-haiku-20241022', opus: 'claude-3-opus-20240229' }
  },
  test: { enableLogging: true, saveResponses: false, responseDir: path.join(__dirname, '../responses') },
};
```

## 📊 测试结果

运行示例后，测试结果将保存在以下位置：

- **控制台输出**: 实时显示请求和响应
- **日志文件**: `logs/examples.log`
- **响应文件**: `examples/responses/` (如果启用)

### 示例输出格式

```json
{
  "timestamp": "2024-12-19T10:30:00.000Z",
  "example": "gemini-basic-chat",
  "status": "success",
  "duration": 1250,
  "request": {
    "model": "gemini-2.5-flash",
    "contents": [...],
    "generationConfig": {...}
  },
  "response": {
    "candidates": [...],
    "usageMetadata": {...}
  },
  "metrics": {
    "tokenCount": 150,
    "responseTime": 1250,
    "success": true
  }
}
```

## 🐛 故障排除

### 常见问题

1. **API 密钥错误**
   ```bash
   Error: Invalid API key
   ```
   解决：检查 `examples/config.js` 中的 `api.apiKey` 是否正确

2. **网络连接问题**
   ```bash
   Error: Network error
   ```
   解决：检查网络连接和 API 端点配置

3. **模型不支持**
   ```bash
   Error: Model not supported
   ```
   解决：检查模型名称是否正确，确认模型可用性

### 调试模式

启用调试模式获取详细信息：

```bash
# 设置调试环境变量
DEBUG=gemini-code-api:* node examples/gemini/basic-chat.js

# 或者使用日志级别
LOG_LEVEL=debug node examples/gemini/basic-chat.js
```

## 📈 性能基准

运行性能测试：

```bash
# 运行所有示例的性能测试
npm run examples:benchmark

# 运行特定示例的性能测试
npm run examples:benchmark -- --example=gemini-basic-chat
```

性能测试将输出：
- 平均响应时间
- 成功率
- 错误率
- 吞吐量

## 🤝 贡献

欢迎提交新的示例或改进现有示例！

### 添加新示例

1. 在相应目录创建新的示例文件
2. 遵循命名规范：`功能描述.js`
3. 添加适当的注释和文档
4. 更新本 README 文件
5. 提交 Pull Request

### 示例模板

```javascript
/**
 * 示例名称
 * 功能描述
 * 
 * @author 作者名
 * @date 创建日期
 */

const { config } = require('../config');
const { makeRequest } = require('../utils');

async function main() {
  try {
    console.log('🚀 开始运行示例...');
    
    // 示例代码
    
    console.log('✅ 示例运行成功！');
  } catch (error) {
    console.error('❌ 示例运行失败:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
```

---

**最后更新**: 2024-12-19  
**维护者**: Gemini Code Team
