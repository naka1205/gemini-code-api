/*
 * 生成占位图片到 examples/data/images 目录
 * 生成 1x1 白色 JPEG（占位用），文件仅用于示例跑通
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'images');
const FILENAMES = [
  'sample-image.png',
  'analysis-image.png',
  'qna-image.png',
  'creative-image.png',
  'technical-image.png',
];

// 1x1 透明 PNG（base64）
const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB' +
  'A9fF8eQAAAAASUVORK5CYII=';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeIfMissing(filepath, buffer) {
  if (fs.existsSync(filepath)) return false;
  fs.writeFileSync(filepath, buffer);
  return true;
}

function main() {
  ensureDir(OUT_DIR);
  const pngBuffer = Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64');
  let created = 0;
  for (const name of FILENAMES) {
    const out = path.join(OUT_DIR, name);
    const ok = writeIfMissing(out, pngBuffer);
    if (ok) {
      console.log(`✅ 创建占位图片: ${out}`);
      created++;
    } else {
      console.log(`ℹ️  已存在: ${out}`);
    }
  }
  console.log(`完成。新建: ${created} 张，目录: ${OUT_DIR}`);
}

if (require.main === module) {
  try {
    main();
    process.exit(0);
  } catch (e) {
    console.error('生成失败:', e);
    process.exit(1);
  }
}

module.exports = { main };


