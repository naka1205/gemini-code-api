# API 参考文档

本文档提供了 Gemini Code API 的完整 API 参考信息，包括 Gemini 和 Claude 集成的请求参数、响应结构和使用示例。

## 目录

- [概述](#概述)
- [身份验证](#身份验证)
- [通用请求结构](#通用请求结构)
- [Gemini API 集成](#gemini-api-集成)
- [Claude API 集成](#claude-api-集成)
- [错误处理](#错误处理)
- [速率限制](#速率限制)
- [响应格式](#响应格式)

## 概述

Gemini Code API 提供了一个统一的接口，通过单一网关与多个 AI 模型进行交互。它支持 Google 的 Gemini API 和 Anthropic 的 Claude API，具有智能负载均衡和速率限制管理功能。

## 身份验证

所有 API 请求都需要使用 API 密钥进行身份验证。您可以通过两种方式提供密钥：

### 方法 1：Authorization 请求头（推荐）
```http
Authorization: Bearer YOUR_API_KEY
```

### 方法 2：查询参数
```
https://your-api.com/v1/chat/completions?api_key=YOUR_API_KEY
```

### 多个 API 密钥
对于负载均衡场景，您可以提供多个用逗号分隔的 API 密钥：

```http
Authorization: Bearer KEY1,KEY2,KEY3
```

## 通用请求结构

所有 API 端点都遵循一致的请求结构：

```json
{
  "model": "string",
  "messages": [
    {
      "role": "string",
      "content": "string"
    }
  ],
  "max_tokens": "number",
  "temperature": "number",
  "stream": "boolean"
}
```

## Gemini API 集成

### 支持的模型

| 客户端模型 | Gemini 模型 | 描述 |
|------------|-------------|------|
| `gpt-4` | `gemini-2.5-flash` | 中级模型，平衡性能和效率 |
| `gpt-3.5-turbo` | `gemini-2.0-flash` | 低级模型，快速高效 |
| `gpt-4o` | `gemini-2.5-pro` | 高级模型，最强推理能力 |
| `gpt-4o-mini` | `gemini-2.5-flash` | 中级模型，平衡性能和效率 |

### 聊天完成

**端点：** `POST /v1/chat/completions`

**请求示例：**
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "你是一个有用的编程助手。"
    },
    {
      "role": "user",
      "content": "编写一个计算斐波那契数的 Python 函数。"
    }
  ],
  "max_tokens": 1000,
  "temperature": 0.7,
  "stream": false
}
```

**响应结构：**
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "这是一个计算斐波那契数的 Python 函数..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 56,
    "completion_tokens": 31,
    "total_tokens": 87
  }
}
```

### 图像理解

**带图像的请求示例：**
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "这张图片里有什么？"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ..."
          }
        }
      ]
    }
  ],
  "max_tokens": 500
}
```

### 流式响应

**请求示例：**
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "用简单的术语解释量子计算。"
    }
  ],
  "stream": true
}
```

**流式响应：**
```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"量子"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"计算"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"是一种革命性的..."},"finish_reason":null}]}

data: [DONE]
```

## Claude API 集成

### 支持的模型

| 客户端模型 | Gemini 模型 | 描述 |
|------------|-------------|------|
| `claude-opus-4-20250514` | `gemini-2.5-pro` | 功能最强大的 Claude 模型 |
| `claude-sonnet-4-20250514` | `gemini-2.5-flash` | 性能和速度平衡的模型 |
| `claude-3-5-haiku-20241022` | `gemini-2.0-flash` | 最快且最经济的模型 |

### 聊天完成

**请求示例：**
```json
{
  "model": "claude-opus-4-20250514",
  "messages": [
    {
      "role": "user",
      "content": "解释机器学习的概念。"
    }
  ],
  "max_tokens": 1000,
  "temperature": 0.7
}
```

**响应结构：**
```json
{
  "id": "msg_01ABC123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "机器学习是人工智能的一个子集..."
    }
  ],
  "model": "claude-sonnet-4-20250514",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 15,
    "output_tokens": 150
  }
}
```

### 工具使用

**请求示例：**
```json
{
  "model": "claude-sonnet-4-20250514",
  "messages": [
    {
      "role": "user",
      "content": "纽约现在的天气怎么样？"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取指定位置的当前天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "城市名称"
            }
          },
          "required": ["location"]
        }
      }
    }
  ]
}
```

**工具调用响应：**
```json
{
  "id": "msg_01ABC123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_01ABC123",
      "name": "get_weather",
      "input": {
        "location": "New York"
      }
    }
  ],
  "model": "claude-sonnet-4-20250514",
  "stop_reason": "tool_use",
  "usage": {
    "input_tokens": 15,
    "output_tokens": 25
  }
}
```

## 错误处理

### 错误响应结构

```json
{
  "error": {
    "message": "string",
    "type": "string",
    "param": "string",
    "code": "string"
  }
}
```

### 常见错误代码

| 代码 | 描述 | HTTP 状态码 |
|------|------|-------------|
| `invalid_api_key` | 无效或缺失的 API 密钥 | 401 |
| `rate_limit_exceeded` | 超出速率限制 | 429 |
| `quota_exceeded` | 超出每日配额 | 429 |
| `invalid_model` | 不支持的模型 | 400 |
| `invalid_request` | 格式错误的请求 | 400 |
| `server_error` | 内部服务器错误 | 500 |

### 错误处理示例

```javascript
try {
  const response = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  const result = await response.json();
  console.log(result);
} catch (error) {
  console.error('API 错误：', error.message);
}
```

## 速率限制

### Gemini API 免费层级限制

| 模型 | 等级 | RPM | TPM | RPD |
|------|------|-----|-----|-----|
| `gemini-2.0-flash` | 低级 | 15 | 1,000,000 | 200 |
| `gemini-2.5-flash` | 中级 | 10 | 250,000 | 250 |
| `gemini-2.5-pro` | 高级 | 5 | 250,000 | 100 |


### 速率限制响应头

API 在响应头中包含速率限制信息：

```http
X-RateLimit-Limit: 15
X-RateLimit-Remaining: 14
X-RateLimit-Reset: 1640995200
X-RateLimit-ResetTime: 2022-01-01T00:00:00Z
```

## SDK 示例

```bash
curl -X POST https://your-api.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```


如需额外支持，请参考官方文档：
- [Gemini API 文档](https://ai.google.dev/gemini-api/docs)
- [Claude API 文档](https://docs.anthropic.com/en/docs/get-started)
