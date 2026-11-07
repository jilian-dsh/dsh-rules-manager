/**
 * skill-usage 只读读取面（件 1，方案 B）。
 *
 * 设计边界：
 * - 本模块**只读**：仅调用 `store.js` 的 `loadData`（读文件 + v1→v2 内存态归一），
 *   **不调用** `saveData`／`recordSkillUse`／`recordSessionUse`（写盘留退役单）。
 * - 三件照搬：`store.js`／`skillpath.js`／`util.js` 与 `dsh-skill-scoreboard` 同版本内容一致，
 *   因同目录复制，`store.js` 的 `./util.js` 相对 import **无需改动**。
 * - 数据文件沿用现盘 `$DSH_HOME\.dsh\skill-scoreboard\skill-usage.json`（只读）。
 *
 * @module dsh-rules-manager/lib/skill-usage/read
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadData } from './store.js';

// 与 scoreboard 保持一致的路径归一：DSH_HOME 可能带或不带尾部 `.dsh`
const rawHome = process.env.DSH_HOME || homedir();
const normalizedHome = /[\\/]\.dsh$/.test(rawHome)
  ? rawHome.replace(/[\\/]\.dsh$/, '')
  : (rawHome.endsWith('.dsh') ? rawHome.replace(/\.dsh$/, '') : rawHome);

/** 本插件自有数据文件（自采自存；不再读写 scoreboard 的数据文件）。 */
export const DEFAULT_DATA_FILE = join(normalizedHome, '.dsh', 'rules-manager', 'skill-usage.json');

/** 旧数据文件（迁移源；迁移完成后仅作退役备份，不再读写）。 */
export const OLD_SCOREBOARD_FILE = join(normalizedHome, '.dsh', 'skill-scoreboard', 'skill-usage.json');

/** 接口单榜行数上限（与 scoreboard `routes.js` 的 `API_ROW_LIMIT` 一致）。 */
export const API_ROW_LIMIT = 200;

export { resolveSkillPath, makeSkillPathIndex, skillNameFromReadArgs } from './skillpath.js';

/**
 * 读记分数据（只读；缺文件返回空 v2 结构）。
 * @param {string} [file] 数据文件路径
 * @returns {Promise<{version:number, skills:object, sessions:object, updatedAt:string|null}>} v2 数据
 */
export async function readScoreboard(file = DEFAULT_DATA_FILE) {
  return loadData(file);
}

/**
 * skill 榜行：按会话去重次数降序（并列按名称）。
 * @param {object} current v2 数据
 * @returns {Array<{name:string,count:number,loads:number,lastUsedAt:string|null}>} 行数组
 */
export function skillRankRows(current) {
  return Object.entries(current?.skills || {})
    .map(([name, record]) => ({
      name,
      count: record?.count || 0,
      loads: record?.loads || record?.count || 0,
      lastUsedAt: record?.lastUsedAt || null,
    }))
    .sort((left, right) => right.count - left.count || String(left.name).localeCompare(String(right.name)));
}

/**
 * 会话表条目 → 排行行（distinct 缺失时按 skills 表长度兜底）。
 * @param {string} id 会话 id
 * @param {object} record 会话表条目
 * @returns {object} 排行行
 */
function sessionRowOf(id, record) {
  const skills = Object.keys(record?.skills || {});
  return {
    id,
    loads: record?.loads || 0,
    distinct: record?.distinct || skills.length,
    skills,
    firstUsedAt: record?.firstUsedAt || null,
    lastUsedAt: record?.lastUsedAt || null,
    loadsEstimated: !!record?.loadsEstimated,
  };
}

/**
 * 会话榜行：去重 skill 数降序 → 累计次数降序 → 最近使用时间降序。
 * @param {object} current v2 数据
 * @returns {Array<object>} 行数组
 */
export function sessionRankRows(current) {
  return Object.entries(current?.sessions || {})
    .map(([id, record]) => sessionRowOf(id, record))
    .sort((left, right) => right.distinct - left.distinct
      || right.loads - left.loads
      || String(right.lastUsedAt || '').localeCompare(String(left.lastUsedAt || '')));
}

/**
 * 组装只读接口载荷（形状与 scoreboard `GET /api/skill-scoreboard` 对齐：`skills` 为数组）。
 * @param {object} current v2 数据
 * @param {{file?:string, rowLimit?:number}} [options] 选项
 * @returns {object} 载荷
 */
export function buildSnapshotPayload(current, options = {}) {
  const rowLimit = Number.isFinite(options.rowLimit) ? options.rowLimit : API_ROW_LIMIT;
  const file = options.file || DEFAULT_DATA_FILE;
  const skills = skillRankRows(current).slice(0, rowLimit);
  const sessions = sessionRankRows(current).slice(0, rowLimit);
  const total = skills.reduce((sum, row) => sum + row.count, 0);
  const totalLoads = skills.reduce((sum, row) => sum + row.loads, 0);
  return {
    ok: true,
    total,
    totalLoads,
    recorded: skills.length,
    sessions,
    updatedAt: current?.updatedAt || null,
    dataFile: file,
    skills,
  };
}
