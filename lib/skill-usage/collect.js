/**
 * skill 使用采集（件 1，完整移植：自采自存）。
 *
 * 照搬 `dsh-skill-scoreboard` 的采集语义：
 * - 触发：`ctx.on('tools/result')`；
 * - 判据：`exec.name === 'skill'`（参数里取技能名）或 `exec.name === 'read'`（命中技能文件路径）；
 * - 去重：`callId`（跨会话，按 skill 记 `callIds[]`）；
 * - 计数：`count` 按会话去重、`loads` 每次 +1（由 `store.js` 的 record 函数实现）。
 *
 * 写入串行化（同一时刻只有一次写盘），写失败只记日志、不打断主链路。
 *
 * @module dsh-rules-manager/lib/skill-usage/collect
 */

import { loadData, saveData, recordSkillUse, recordSessionUse } from './store.js';
import { makeSkillPathIndex, skillNameFromReadArgs } from './skillpath.js';
import { DEFAULT_DATA_FILE } from './read.js';

/**
 * 从 `skill` 工具参数取技能名（照搬 scoreboard 的同名局部函数）。
 * @param {object|string} args 工具参数
 * @returns {string} 技能名或空串
 */
function skillNameFromArgs(args) {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    return parsed?.name ?? '';
  } catch {
    return '';
  }
}

/**
 * 判断一次工具调用是否应记分，返回要记的 skill 名（不该记分返回空串）。
 * @param {object} exec 工具调用记录
 * @param {object|null} pathIndex 技能路径索引（read 工具用）
 * @returns {string} skill 名或空串
 */
function skillNameOfCall(exec, pathIndex) {
  if (exec?.name === 'skill') return skillNameFromArgs(exec.arguments);
  if (exec?.name === 'read') return skillNameFromReadArgs(exec.arguments, pathIndex);
  return '';
}

/**
 * 安装采集器：读既有数据 → 挂 `tools/result` → 串行写盘。
 * @param {object} ctx 插件上下文
 * @param {{file?:string, log?:(msg:string)=>void}} [options] 选项
 * @returns {Promise<{file:string, store:object, dispose:() => void}>} 采集句柄
 */
export async function installCollector(ctx, options = {}) {
  const file = options.file || DEFAULT_DATA_FILE;
  const log = options.log || (() => {});
  let store = await loadData(file);
  if (!store.sessions) store.sessions = {};

  const pathIndex = makeSkillPathIndex(
    () => Object.keys(store.skills || {}),
    typeof ctx.get === 'function' ? ctx.get('skills') : null,
  );

  let queue = Promise.resolve();
  const onResult = (exec) => {
    queue = queue
      .then(async () => {
        const skillName = skillNameOfCall(exec, pathIndex);
        if (!skillName) return;
        const sessionId = exec.agent?.session?.id || exec.agent?.id || 'unknown';
        const callId = exec.callId || '';
        const record = store.skills[skillName];
        if (callId && record?.callIds?.includes(callId)) return;
        recordSkillUse(store, skillName, sessionId, callId);
        recordSessionUse(store, sessionId, skillName);
        try {
          await saveData(file, store);
        } catch (error) {
          log(`[rules-manager] ⚠️ 写 skill 数据失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      })
      .catch((error) => {
        log(`[rules-manager] ⚠️ 记分失败: ${error instanceof Error ? error.message : String(error)}`);
      });
    return queue;
  };

  ctx.on('tools/result', onResult);
  return {
    file,
    get store() {
      return store;
    },
    dispose() {
      // 事件监听随插件卸载自动释放；此处保留接口对称性。
    },
  };
}
