/**
 * 精简多KEY智能负载均衡器
 * 统一导出接口
 */

import { SmartLoadBalancer } from './selector.js';
export { SmartLoadBalancer } from './selector.js';
export { QuotaManager } from './manager.js';

// 重新导出类型
export type { LoadBalancerResult } from '../../types/services.js';

// 全局负载均衡器实例
let globalLoadBalancer: SmartLoadBalancer | null = null;

/**
 * 初始化全局负载均衡器
 */
export function initializeGlobalLoadBalancer(kv: KVNamespace, db: D1Database): void {
  globalLoadBalancer = new SmartLoadBalancer(kv, db);
}

/**
 * 获取全局负载均衡器实例
 */
export function getGlobalLoadBalancer(): SmartLoadBalancer | null {
  return globalLoadBalancer;
}
