
// src/config/limits.config.ts

export const FREE_TIER_LIMITS = {
  'gemini-2.5-pro': { rpm: 5, tpm: 250000, rpd: 100 },    // 高级模型
  'gemini-2.5-flash': { rpm: 10, tpm: 250000, rpd: 250 }, // 中级模型
  'gemini-2.0-flash': { rpm: 15, tpm: 1000000, rpd: 200 }, // 低级模型 - 已修正为官方文档标准
  'text-embedding-004': { rpm: 100, tpm: 1000000, rpd: 1000 },
} as const;