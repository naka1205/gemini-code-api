/**
 * Gemini 长上下文示例
 * 展示处理大量文本数据的能力
 */

const { makeGeminiRequest, saveResponse, withPerformanceMonitoring, delay, Logger } = require('../utils');
const { config } = require('../config');

const logger = new Logger('gemini-long-context');

/**
 * 长文档摘要
 */
async function testLongDocumentSummarization() {
  logger.info('开始测试长文档摘要');
  
  try {
    const model = config.models.gemini.pro;
    const longDocument = `
    人工智能（Artificial Intelligence，AI）是计算机科学的一个分支，它企图了解智能的实质，
    并生产出一种新的能以人类智能相似的方式做出反应的智能机器。该领域的研究包括机器人、
    语言识别、图像识别、自然语言处理和专家系统等。

    人工智能从诞生以来，理论和技术日益成熟，应用领域也不断扩大，可以设想，未来人工智能
    带来的科技产品，将会是人类智慧的"容器"。人工智能可以对人的意识、思维的信息过程的模拟。
    人工智能不是人的智能，但能像人那样思考、也可能超过人的智能。

    机器学习是人工智能的一个重要分支，它使计算机能够在没有明确编程的情况下学习和改进。
    机器学习算法通过分析数据来识别模式，并使用这些模式来做出预测或决策。机器学习的主要类型
    包括监督学习、无监督学习和强化学习。

    深度学习是机器学习的一个子集，它使用人工神经网络来模拟人脑的工作方式。深度学习算法能够
    自动学习数据的特征，这使得它们在图像识别、自然语言处理和语音识别等任务中表现出色。

    自然语言处理（NLP）是人工智能的另一个重要领域，它使计算机能够理解、解释和生成人类语言。
    NLP 技术被广泛应用于机器翻译、情感分析、问答系统和聊天机器人等应用中。

    计算机视觉是人工智能的一个分支，它使计算机能够从图像和视频中提取信息。计算机视觉技术
    被用于面部识别、物体检测、医学图像分析和自动驾驶汽车等应用。

    人工智能的发展经历了几个重要阶段。1950年代，人工智能作为一个研究领域正式诞生，图灵测试
    的提出为人工智能研究奠定了基础。1960年代和1970年代，专家系统得到了发展，但计算能力的
    限制限制了人工智能的进展。

    1980年代，机器学习开始兴起，神经网络重新受到关注。1990年代，统计学习方法在机器学习中
    占据主导地位。2000年代，深度学习开始崭露头角，特别是在图像识别和语音识别领域。

    2010年代，深度学习取得了突破性进展，深度神经网络在多个领域超越了传统方法。2012年，
    AlexNet 在 ImageNet 竞赛中的成功标志着深度学习时代的到来。2016年，AlphaGo 战胜李世石
    展示了人工智能在复杂决策任务中的潜力。

    2020年代，大型语言模型（LLM）成为人工智能领域的热点。GPT、BERT、T5 等模型在自然语言
    处理任务中取得了显著进展。2022年，ChatGPT 的发布引发了全球对生成式人工智能的关注。

    人工智能在各个行业都有广泛的应用。在医疗保健领域，人工智能被用于疾病诊断、药物发现、
    个性化医疗和医疗图像分析。在金融领域，人工智能被用于风险评估、欺诈检测、算法交易和
    客户服务。

    在教育领域，人工智能被用于个性化学习、智能辅导、自动评分和教育内容生成。在制造业，
    人工智能被用于质量控制、预测性维护、供应链优化和机器人自动化。

    在交通运输领域，人工智能被用于自动驾驶汽车、交通流量优化、智能交通系统和物流优化。
    在娱乐领域，人工智能被用于游戏开发、内容推荐、虚拟现实和增强现实应用。

    人工智能的发展也带来了一些挑战和担忧。就业问题是人们最关心的问题之一，自动化可能
    导致某些工作岗位的消失。然而，历史表明，技术革命通常会创造新的就业机会，尽管可能
    需要工人学习新的技能。

    隐私和安全是另一个重要问题。人工智能系统需要大量数据来训练，这引发了关于数据隐私
    的担忧。此外，人工智能系统可能被恶意使用，例如用于深度伪造、网络攻击或自动化武器。

    偏见和公平性是人工智能面临的另一个挑战。如果训练数据包含偏见，人工智能系统可能会
    放大这些偏见，导致不公平的结果。确保人工智能系统的公平性和透明度是一个重要的研究
    方向。

    人工智能的可解释性也是一个重要问题。许多人工智能系统，特别是深度学习模型，往往被
    称为"黑盒"，因为它们的决策过程难以理解。开发可解释的人工智能系统对于建立信任和
    确保负责任的使用至关重要。

    人工智能的伦理问题也引起了广泛关注。如何确保人工智能系统做出符合人类价值观的决策？
    如何分配人工智能带来的收益？如何防止人工智能被滥用？这些问题需要技术专家、政策
    制定者、伦理学家和社会各界的共同努力来解决。

    人工智能的未来发展前景广阔。随着计算能力的提升、算法的改进和数据量的增长，人工
    智能的能力将继续增强。我们可能会看到更智能的虚拟助手、更准确的医疗诊断、更高效
    的能源管理、更环保的交通系统等。

    通用人工智能（AGI）是人工智能研究的一个长期目标，它指的是能够执行任何人类智能
    任务的人工智能系统。虽然 AGI 的实现仍然是一个遥远的梦想，但研究人员正在朝着这个
    目标努力。

    人工智能与人类的协作将是未来的一个重要趋势。人工智能不会取代人类，而是会增强人类
    的能力。人类和人工智能的协作将创造出新的可能性，解决人类单独无法解决的复杂问题。

    为了确保人工智能的健康发展，需要建立适当的监管框架。这些框架应该平衡创新和风险，
    确保人工智能的发展符合社会利益。国际合作在制定人工智能标准和规范方面也起着重要
    作用。

    人工智能教育也变得越来越重要。随着人工智能在各个领域的应用，人们需要了解人工智能
    的基本概念、能力和局限性。这将帮助他们做出明智的决策，并充分利用人工智能带来的
    机会。

    总之，人工智能是一个快速发展的领域，它正在改变我们的世界。虽然人工智能带来了挑战，
    但它也提供了巨大的机会来改善人类生活。通过负责任的发展和部署，人工智能可以为人类
    社会带来积极的影响。
    `;

    const contents = [{
      role: 'user',
      parts: [{
        text: `请对以下长文档进行详细摘要，要求：
        1. 提取主要观点和关键信息
        2. 按主题分类整理
        3. 总结发展趋势和未来展望
        4. 分析面临的挑战和机遇
        
        文档内容：
        ${longDocument}`
      }]
    }];

    const response = await makeGeminiRequest(model, contents, {
      maxOutputTokens: 2000,
      temperature: 0.3
    });

    logger.info('长文档摘要完成');
    await saveResponse('gemini-long-context-summary', {
      originalLength: longDocument.length,
      summary: response.text,
      summaryLength: response.text.length
    }, {
      // 请求详情
    });

    return { 
      success: true, 
      originalLength: longDocument.length,
      summaryLength: response.text.length,
      compressionRatio: (response.text.length / longDocument.length * 100).toFixed(2) + '%'
    };
  } catch (error) {
    logger.error('长文档摘要测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 长对话历史分析
 */
async function testLongConversationAnalysis() {
  logger.info('开始测试长对话历史分析');
  
  try {
    const model = config.models.gemini.pro;
    
    // 构建一个长对话历史
    const conversationHistory = [
      { role: 'user', content: '你好，我想了解机器学习的基本概念。' },
      { role: 'assistant', content: '机器学习是人工智能的一个分支，它使计算机能够在没有明确编程的情况下学习和改进。主要类型包括监督学习、无监督学习和强化学习。' },
      { role: 'user', content: '能详细解释一下监督学习吗？' },
      { role: 'assistant', content: '监督学习使用标记的训练数据来学习输入和输出之间的映射关系。例如，给定一组带有标签的图片，模型学习识别图片中的对象。' },
      { role: 'user', content: '那无监督学习呢？' },
      { role: 'assistant', content: '无监督学习处理没有标签的数据，目标是发现数据中的隐藏模式或结构。常见的应用包括聚类分析和降维。' },
      { role: 'user', content: '强化学习是什么？' },
      { role: 'assistant', content: '强化学习通过与环境交互来学习最优策略。智能体通过试错来学习，根据奖励信号调整行为。' },
      { role: 'user', content: '深度学习与传统机器学习有什么区别？' },
      { role: 'assistant', content: '深度学习使用多层神经网络，能够自动学习特征表示。传统机器学习通常需要手工特征工程。深度学习在图像、语音和自然语言处理方面表现优异。' },
      { role: 'user', content: '神经网络的基本原理是什么？' },
      { role: 'assistant', content: '神经网络模拟人脑神经元的工作方式，由输入层、隐藏层和输出层组成。每个神经元接收输入，应用激活函数，产生输出传递给下一层。' },
      { role: 'user', content: '什么是反向传播？' },
      { role: 'assistant', content: '反向传播是训练神经网络的核心算法，通过计算损失函数对权重的梯度来更新网络参数，使网络输出逐渐接近目标值。' },
      { role: 'user', content: '过拟合是什么问题？' },
      { role: 'assistant', content: '过拟合指模型在训练数据上表现很好，但在新数据上泛化能力差。解决方法包括正则化、数据增强、早停等。' },
      { role: 'user', content: '如何评估机器学习模型？' },
      { role: 'assistant', content: '常用指标包括准确率、精确率、召回率、F1分数等。对于回归问题，使用均方误差、平均绝对误差等。交叉验证是重要的评估方法。' },
      { role: 'user', content: '特征工程的重要性是什么？' },
      { role: 'assistant', content: '特征工程是机器学习成功的关键，包括特征选择、特征变换、特征创建等。好的特征能显著提升模型性能。' },
      { role: 'user', content: '数据预处理包括哪些步骤？' },
      { role: 'assistant', content: '数据预处理包括数据清洗、缺失值处理、异常值检测、数据标准化、编码分类变量等。这些步骤对模型性能有重要影响。' },
      { role: 'user', content: '机器学习在哪些领域应用广泛？' },
      { role: 'assistant', content: '机器学习广泛应用于推荐系统、自然语言处理、计算机视觉、医疗诊断、金融风控、自动驾驶、智能客服等领域。' },
      { role: 'user', content: '什么是迁移学习？' },
      { role: 'assistant', content: '迁移学习利用预训练模型的知识来解决新任务，减少数据需求和训练时间。在深度学习中被广泛使用。' },
      { role: 'user', content: '模型部署的挑战有哪些？' },
      { role: 'assistant', content: '模型部署面临延迟、吞吐量、资源消耗、模型更新、监控等挑战。需要选择合适的部署策略和基础设施。' },
      { role: 'user', content: '机器学习的发展趋势是什么？' },
      { role: 'assistant', content: '发展趋势包括自动化机器学习、联邦学习、可解释AI、边缘计算、多模态学习等。这些技术正在推动机器学习的发展。' }
    ];

    // 将对话历史转换为 Gemini 格式
    const contents = conversationHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // 添加分析请求
    contents.push({
      role: 'user',
      parts: [{
        text: `请分析以上对话历史，提供以下信息：
        1. 对话主题和主要讨论内容
        2. 用户的学习进度和知识掌握情况
        3. 对话中的关键概念和术语
        4. 用户可能存在的疑问或需要进一步解释的地方
        5. 建议的后续学习方向
        6. 对话质量和教学效果评估`
      }]
    });

    const response = await makeGeminiRequest(model, contents, {
      maxOutputTokens: 1500,
      temperature: 0.4
    });

    logger.info('长对话历史分析完成');
    await saveResponse('gemini-long-context-conversation', {
      conversationLength: conversationHistory.length,
      analysis: response.text,
      analysisLength: response.text.length
    }, {
      // 请求详情
    });

    return { 
      success: true, 
      conversationTurns: conversationHistory.length,
      analysisLength: response.text.length
    };
  } catch (error) {
    logger.error('长对话历史分析测试失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  logger.info('=== Gemini 长上下文示例开始 ===');
  
  const results = [];
  
  // 运行所有测试
  const tests = [
    { name: '长文档摘要', fn: testLongDocumentSummarization },
    { name: '长对话历史分析', fn: testLongConversationAnalysis }
  ];

  for (const test of tests) {
    logger.info(`\n--- 开始测试: ${test.name} ---`);
    const result = await withPerformanceMonitoring(test.fn, test.name);
    results.push({ name: test.name, ...result });
    
    // 测试间隔
    await delay(3000);
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
  testLongDocumentSummarization,
  testLongConversationAnalysis,
  main
};
