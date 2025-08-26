/**
 * 兼容 README 的流式示例入口（包装器）
 */
const { main } = require('./streaming-chat');
if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
module.exports = { main };
