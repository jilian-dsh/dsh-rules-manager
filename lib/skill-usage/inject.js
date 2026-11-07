/**
 * skill 路径注入（件 3，方案 B：只读）。
 *
 * 内容只含「一句说明 + 每个 skill 的 名字 → 实际文件路径」；
 * **不注入**次数／排行／总数统计（判据要求：不得出现 `×\d`、`会话去重`、`加载累计`、`loads=`）。
 *
 * 四道控制（默认值）：
 * 1. `INJECT_ENABLED`＝true（总开关）
 * 2. `INJECT_TOP_N`＝25（最多注入多少个 skill）
 * 3. 每 agent 仅注入一次（由调用方用 `injectedAgents` 集合控制）
 * 4. `INJECT_MAX_CHARS`＝4000（逐行累加，超限即停；末行补「其余 N 个 skill…」）
 *
 * 行数上限 25（含首行说明与末行），无数据返回空串。
 *
 * @module dsh-rules-manager/lib/skill-usage/inject
 */

import { statSync } from 'node:fs';
import { readScoreboard, skillRankRows, resolveSkillPath, DEFAULT_DATA_FILE } from './read.js';

/** 只接受真实文件路径（skillpath 的兜底在未命中时会返回目录本身，必须过滤）。 */
function isFile(p) {
  try {
    return !!p && statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 注入总开关（默认开）。 */
export const INJECT_ENABLED = true;
/** 最多注入的 skill 数（默认 25）。 */
export const INJECT_TOP_N = 25;
/** 注入正文最大字符数（默认 4000）。 */
export const INJECT_MAX_CHARS = 4000;
/** 注入正文最大行数（含首行说明与末行）。 */
export const INJECT_MAX_LINES = 25;

const HEADER = '【rules-manager 注入·skill 路径】下列 skill 名称 → 实际文件路径（仅路径，不含次数/排行）；按需读取，避免重复查找：';

/** 末行提示（只说明省略数量，不指向任何其它页面）。 */
function tailOf(remaining) {
  return `（其余 ${remaining} 个 skill 已省略）`;
}

/**
 * 组装注入文本（只读；失败或空数据返回空串）。
 * @param {{file?:string, topN?:number, maxChars?:number, skillsSvc?:object|null}} [options] 选项
 * @returns {Promise<string>} 注入正文；空串表示不注入
 */
export async function buildSkillPathInjection(options = {}) {
  const file = options.file || DEFAULT_DATA_FILE;
  const topN = Number.isFinite(options.topN) ? options.topN : INJECT_TOP_N;
  const maxChars = Number.isFinite(options.maxChars) ? options.maxChars : INJECT_MAX_CHARS;
  const skillsSvc = options.skillsSvc || null;

  let data;
  try {
    data = await readScoreboard(file);
  } catch {
    return '';
  }
  const rows = skillRankRows(data);
  if (!rows.length) return '';

  // 行预算：首行说明 + 末行提示各占 1 行
  const skillLineBudget = Math.max(1, INJECT_MAX_LINES - 2);
  const targets = rows.slice(0, Math.min(topN, skillLineBudget));
  const lines = [];
  let used = HEADER.length;
  let skipped = 0;

  for (const row of targets) {
    let path = '';
    try {
      path = await resolveSkillPath(row.name, skillsSvc);
    } catch {
      path = '';
    }
    if (!path) {
      skipped += 1;
      continue;
    }
    // 解析到目录视为未命中（skillpath 兜底会返回 skills 根目录）
    if (!isFile(path)) {
      skipped += 1;
      continue;
    }
    const line = `- ${row.name} → ${path}`;
    // 预留末行空间（约 40 字符）
    if (used + 1 + line.length + 40 > maxChars) break;
    lines.push(line);
    used += 1 + line.length;
    if (lines.length >= skillLineBudget) break;
  }

  if (!lines.length) return '';

  const remaining = rows.length - lines.length;
  const tail = remaining > 0 ? tailOf(remaining) : '';
  const parts = [HEADER, ...lines, ...(tail ? [tail] : [])];
  const text = parts.join('\n');

  // 超限兜底：去掉末行提示再判一次
  if (text.length > maxChars) {
    const withoutTail = [HEADER, ...lines].join('\n');
    return withoutTail.length <= maxChars ? withoutTail : '';
  }
  return text;
}
