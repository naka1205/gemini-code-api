# 测试数据目录

本目录包含用于示例的测试数据文件。

## 📁 目录结构

```
test-data/
├── README.md              # 本文件
├── images/                # 测试图片
│   ├── sample-image.jpg   # 基础示例图片
│   ├── analysis-image.jpg # 分析测试图片
│   ├── qna-image.jpg      # 问答测试图片
│   ├── image1.jpg         # 比较测试图片1
│   ├── image2.jpg         # 比较测试图片2
│   ├── creative-image.jpg # 创意生成测试图片
│   └── technical-image.jpg # 技术分析测试图片
└── documents/             # 测试文档
    ├── sample.txt         # 示例文本文件
    ├── data.json          # 示例JSON文件
    └── report.md          # 示例Markdown文件
```

## 🖼️ 图片要求

### 支持的格式
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)
- GIF (.gif)

### 图片规格
- **最大尺寸**: 2048x2048 像素
- **最大文件大小**: 4MB
- **推荐格式**: JPEG 或 PNG

### 图片内容建议
- `sample-image.jpg`: 包含清晰物体的简单图片
- `analysis-image.jpg`: 包含多个元素和细节的复杂图片
- `qna-image.jpg`: 包含文字、图表或数据的图片
- `image1.jpg` & `image2.jpg`: 相似但有明显差异的图片
- `creative-image.jpg`: 具有艺术性或创意性的图片
- `technical-image.jpg`: 包含技术元素或专业内容的图片

## 📄 文档要求

### 支持的格式
- 文本文件 (.txt)
- JSON 文件 (.json)
- Markdown 文件 (.md)
- CSV 文件 (.csv)

### 文件规格
- **最大文件大小**: 1MB
- **编码**: UTF-8

## 🔧 使用说明

1. **添加测试图片**:
   ```bash
   # 将你的测试图片复制到 images 目录
   cp your-image.jpg examples/shared/test-data/images/
   ```

2. **添加测试文档**:
   ```bash
   # 将你的测试文档复制到 documents 目录
   cp your-document.txt examples/shared/test-data/documents/
   ```

3. **在示例中使用**:
   ```javascript
   const { readTestImage, readTestDocument } = require('../shared/utils');
   
   // 读取测试图片
   const imageData = await readTestImage('sample-image.jpg');
   
   // 读取测试文档
   const documentContent = await readTestDocument('sample.txt');
   ```

## ⚠️ 注意事项

1. **版权**: 确保你有权使用这些测试文件
2. **隐私**: 不要包含敏感信息或个人数据
3. **大小**: 保持文件大小在合理范围内
4. **格式**: 使用标准格式以确保兼容性

## 📝 示例文件

如果你没有合适的测试文件，可以使用以下占位符：

### 图片占位符
- 使用在线图片生成服务（如 Unsplash、Pexels）
- 创建简单的测试图片（如纯色背景加文字）
- 使用公开的示例图片

### 文档占位符
- 使用 Lorem Ipsum 文本
- 创建简单的 JSON 数据结构
- 使用公开的示例文档

## 🚀 快速开始

1. 准备测试文件
2. 将文件放入相应目录
3. 运行示例测试
4. 查看测试结果

---

**注意**: 这些测试文件仅用于开发和测试目的，请勿在生产环境中使用。
