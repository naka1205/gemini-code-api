/**
 * Gemini 结构化输出示例
 * 展示生成特定格式响应的能力
 */

const { makeGeminiRequest, saveResponse, withPerformanceMonitoring, delay, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('gemini-structured-output');

/**
 * JSON 格式输出
 */
async function testJsonOutput() {
  logger.info('开始测试 JSON 格式输出');
  
  try {
    const model = config.models.gemini.default;
    const contents = [{
      role: 'user',
      parts: [{
        text: `请分析以下公司数据并生成 JSON 格式的报告：

        公司名称：TechCorp Solutions
        成立时间：2018年
        员工数量：150人
        年收入：$2.5M
        主要产品：企业软件解决方案
        客户数量：45家
        融资轮次：A轮，$5M
        技术栈：Python, React, AWS, Docker
        市场定位：中小企业数字化转型服务商

        请生成包含以下字段的 JSON 报告：
        - company_info (基本信息)
        - financial_metrics (财务指标)
        - market_analysis (市场分析)
        - risk_assessment (风险评估)
        - growth_potential (增长潜力)
        - recommendations (建议)

        要求：
        1. 严格按照 JSON 格式输出
        2. 包含数值计算和分析
        3. 提供具体的建议和预测
        4. 使用中文输出`
      }]
    }];

    const response = await makeGeminiRequest(model, contents, {
      maxOutputTokens: 1500,
      temperature: 0.3
    });

    logger.info('JSON 格式输出完成');
    
    // 尝试解析 JSON 验证格式
    let jsonData = null;
    try {
      jsonData = JSON.parse(response.text);
      logger.info('JSON 格式验证成功');
    } catch (e) {
      logger.warn('JSON 格式验证失败，可能包含非 JSON 内容');
    }

    await saveResponse('gemini-结构化输出', {
      response: response.text,
      jsonData,
      isValidJson: jsonData !== null
    }, {
      // 请求详情
    });

    return { 
      success: true, 
      responseLength: response.text.length,
      isValidJson: jsonData !== null
    };
  } catch (error) {
    logger.error('JSON 格式输出测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 表格格式输出
 */
async function testTableOutput() {
  logger.info('开始测试表格格式输出');
  
  try {
    const model = config.models.gemini.default;
    const contents = [{
      role: 'user',
      parts: [{
        text: `请分析以下电商平台的销售数据并生成 Markdown 表格格式的报告：

        平台A：月销售额 $150K，用户数 12K，转化率 3.2%，客单价 $125
        平台B：月销售额 $220K，用户数 18K，转化率 2.8%，客单价 $98
        平台C：月销售额 $95K，用户数 8K，转化率 4.1%，客单价 $145
        平台D：月销售额 $180K，用户数 15K，转化率 3.5%，客单价 $120
        平台E：月销售额 $110K，用户数 10K，转化率 2.9%，客单价 $95

        请生成包含以下内容的表格：
        1. 基础数据对比表
        2. 性能指标排名表
        3. 效率分析表（每用户收入、每订单成本等）
        4. 改进建议表

        要求：
        1. 使用 Markdown 表格格式
        2. 包含计算得出的指标
        3. 提供排名和分析
        4. 表格要清晰易读`
      }]
    }];

    const response = await makeGeminiRequest(model, contents, {
      maxOutputTokens: 2000,
      temperature: 0.2
    });

    logger.info('表格格式输出完成');
    await saveResponse('gemini-structured-table', {
      response: response.text,
      responseLength: response.text.length
    }, {
      // 请求详情
    });

    return { 
      success: true, 
      responseLength: response.text.length
    };
  } catch (error) {
    logger.error('表格格式输出测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * XML 格式输出
 */
async function testXmlOutput() {
  logger.info('开始测试 XML 格式输出');
  
  try {
    const model = config.models.gemini.default;
    const contents = [{
      role: 'user',
      parts: [{
        text: `请根据以下产品信息生成 XML 格式的产品目录：

        产品1：智能手机 Galaxy X1，价格 $899，品牌 Samsung，颜色 黑色/白色/蓝色，库存 150台
        产品2：笔记本电脑 ThinkPad Pro，价格 $1299，品牌 Lenovo，颜色 银色/灰色，库存 75台
        产品3：无线耳机 AirPods Max，价格 $549，品牌 Apple，颜色 白色/黑色/蓝色，库存 200台
        产品4：智能手表 Watch Series 8，价格 $399，品牌 Apple，颜色 银色/金色/黑色，库存 120台
        产品5：平板电脑 iPad Air，价格 $599，品牌 Apple，颜色 银色/灰色/玫瑰金，库存 90台

        请生成包含以下结构的 XML：
        - 产品目录根节点
        - 每个产品的详细信息
        - 分类信息
        - 价格范围统计
        - 库存状态

        要求：
        1. 严格按照 XML 格式输出
        2. 包含适当的属性
        3. 结构清晰合理
        4. 包含计算得出的统计信息`
      }]
    }];

    const response = await makeGeminiRequest(model, contents, {
      maxOutputTokens: 1800,
      temperature: 0.3
    });

    logger.info('XML 格式输出完成');
    await saveResponse('gemini-structured-xml', {
      response: response.text,
      responseLength: response.text.length
    }, {
      // 请求详情
    });

    return { 
      success: true, 
      responseLength: response.text.length
    };
  } catch (error) {
    logger.error('XML 格式输出测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * CSV 格式输出
 */
async function testCsvOutput() {
  logger.info('开始测试 CSV 格式输出');
  
  try {
    const model = config.models.gemini.default;
    const contents = [{
      role: 'user',
      parts: [{
        text: `请分析以下学生成绩数据并生成 CSV 格式的报告：

        学生A：数学 85，英语 92，物理 78，化学 88，生物 90
        学生B：数学 92，英语 85，物理 90，化学 82，生物 88
        学生C：数学 78，英语 88，物理 85，化学 90，生物 85
        学生D：数学 90，英语 90，物理 88，化学 85，生物 92
        学生E：数学 85，英语 85，物理 92，化学 88，生物 88

        请生成包含以下内容的 CSV：
        1. 学生成绩表
        2. 各科平均分统计
        3. 学生总分排名
        4. 各科成绩分布
        5. 成绩分析报告

        要求：
        1. 使用标准 CSV 格式
        2. 包含表头
        3. 数值计算准确
        4. 格式规范，便于导入 Excel`
      }]
    }];

    const response = await makeGeminiRequest(model, contents, {
      maxOutputTokens: 1600,
      temperature: 0.2
    });

    logger.info('CSV 格式输出完成');
    await saveResponse('gemini-structured-csv', {
      response: response.text,
      responseLength: response.text.length
    }, {
      // 请求详情
    });

    return { 
      success: true, 
      responseLength: response.text.length
    };
  } catch (error) {
    logger.error('CSV 格式输出测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * YAML 格式输出
 */
async function testYamlOutput() {
  logger.info('开始测试 YAML 格式输出');
  
  try {
    const model = config.models.gemini.default;
    const contents = [{
      role: 'user',
      parts: [{
        text: `请根据以下项目信息生成 YAML 格式的项目配置文件：

        项目名称：AI 助手开发项目
        项目类型：软件开发
        开始日期：2024-01-15
        预计结束：2024-06-30
        预算：$500K
        项目经理：张三
        技术负责人：李四
        团队成员：王五（前端），赵六（后端），钱七（AI），孙八（测试）
        
        技术栈：
        - 前端：React, TypeScript, Tailwind CSS
        - 后端：Node.js, Express, MongoDB
        - AI：Python, TensorFlow, OpenAI API
        - 部署：Docker, AWS, CI/CD
        
        里程碑：
        - 需求分析：2024-01-15 到 2024-02-15
        - 原型设计：2024-02-16 到 2024-03-15
        - 开发阶段：2024-03-16 到 2024-05-15
        - 测试阶段：2024-05-16 到 2024-06-15
        - 部署上线：2024-06-16 到 2024-06-30

        请生成包含以下结构的 YAML：
        - 项目基本信息
        - 团队配置
        - 技术配置
        - 里程碑计划
        - 风险评估
        - 资源配置

        要求：
        1. 严格按照 YAML 格式输出
        2. 缩进正确
        3. 结构清晰
        4. 包含配置项说明`
      }]
    }];

    const response = await makeGeminiRequest(model, contents, {
      maxOutputTokens: 2000,
      temperature: 0.3
    });

    logger.info('YAML 格式输出完成');
    await saveResponse('gemini-structured-yaml', {
      response: response.text,
      responseLength: response.text.length
    }, {
      // 请求详情
    });

    return { 
      success: true, 
      responseLength: response.text.length
    };
  } catch (error) {
    logger.error('YAML 格式输出测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 自定义格式输出
 */
async function testCustomFormatOutput() {
  logger.info('开始测试自定义格式输出');
  
  try {
    const model = config.models.gemini.default;
    const contents = [{
      role: 'user',
      parts: [{
        text: `请根据以下餐厅评价数据生成自定义格式的报告：

        餐厅A：评分 4.5/5，价格 $$，菜系 中餐，位置 市中心，特色 川菜
        餐厅B：评分 4.2/5，价格 $$$，菜系 西餐，位置 商业区，特色 牛排
        餐厅C：评分 4.8/5，价格 $$，菜系 日料，位置 住宅区，特色 寿司
        餐厅D：评分 3.9/5，价格 $，菜系 快餐，位置 地铁站，特色 汉堡
        餐厅E：评分 4.6/5，价格 $$$，菜系 法餐，位置 景区，特色 红酒

        请使用以下自定义格式输出：

        ===== 餐厅推荐报告 =====
        📊 总体统计
        [统计信息]

        🏆 推荐榜单
        [排名列表]

        💰 价格分析
        [价格分布]

        📍 位置分析
        [位置分布]

        ⭐ 评分分析
        [评分统计]

        🍽️ 菜系分析
        [菜系分布]

        💡 个性化建议
        [建议内容]

        要求：
        1. 使用指定的格式模板
        2. 包含 emoji 图标
        3. 数据准确完整
        4. 格式美观易读`
      }]
    }];

    const response = await makeGeminiRequest(model, contents, {
      maxOutputTokens: 1800,
      temperature: 0.4
    });

    logger.info('自定义格式输出完成');
    await saveResponse('gemini-structured-custom', {
      response: response.text,
      responseLength: response.text.length
    }, {
      // 请求详情
    });

    return { 
      success: true, 
      responseLength: response.text.length
    };
  } catch (error) {
    logger.error('自定义格式输出测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  logger.info('=== Gemini 结构化输出示例开始 ===');
  
  const results = [];
  
  // 运行所有测试
  const tests = [
    { name: 'JSON 格式输出', fn: testJsonOutput },
    { name: '表格格式输出', fn: testTableOutput },
    { name: 'XML 格式输出', fn: testXmlOutput },
    { name: 'CSV 格式输出', fn: testCsvOutput },
    { name: 'YAML 格式输出', fn: testYamlOutput },
    { name: '自定义格式输出', fn: testCustomFormatOutput }
  ];

  for (const test of tests) {
    logger.info(`\n--- 开始测试: ${test.name} ---`);
    const result = await withPerformanceMonitoring(test.fn, test.name)();
    results.push({ name: test.name, ...result });
    
    // 测试间隔
    await delay(2000);
  }

  // 输出结果摘要
  logger.info('\n=== 测试结果摘要 ===');
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    logger.info(`${status} ${result.name}: ${result.success ? '成功' : result.error}`);
  });

  logger.info(`\n总结: ${successCount}/${totalCount} 个测试成功`);
  
  return results;
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(error => {
    logger.error('示例运行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  testJsonOutput,
  testTableOutput,
  testXmlOutput,
  testCsvOutput,
  testYamlOutput,
  testCustomFormatOutput,
  main
};
