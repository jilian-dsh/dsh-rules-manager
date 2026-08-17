// rules-core.js —— 规则管理共享核心（/rules 命令 与 设置页服务 共用）
// 职责：解析 AGENTS.md、备份、写入、增删改操作。不依赖 Cordis/UI，纯 Node。
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { join } from "node:path";
import { readFile, writeFile, copyFile, mkdir, readdir, rename, stat } from "node:fs/promises";

const MAX_BACKUPS = 5;

/** AGENTS.md 的绝对路径 */
export function agentsFilePath() {
	return join(resolveDshHome(), "AGENTS.md");
}

/** 本地时区的今天，形如 2026-08-14 */
export function today() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 读取并解析 AGENTS.md。
 * @returns {Promise<{lines: string[], rules: Array, bom: boolean, missing: boolean}>}
 * rules 每条含 index/title/section/startLine/endLine（endLine 不含）。
 * 自由区域（<!-- free-zone:start/end -->）内的 `### [规则 F<n>]` 同样解析为规则，
 * 供 UI 可见可管理，但标记 free: true（引擎侧不解析、不强制）。
 */
export async function loadRules() {
	const file = agentsFilePath();
	let raw;
	try {
		raw = await readFile(file, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return { lines: [], rules: [], bom: false, missing: true };
		throw error;
	}
	const bom = raw.charCodeAt(0) === 0xfeff;
	const text = bom ? raw.slice(1) : raw;
	const lines = text.split("\n");
	const rules = [];
	let currentSection = "未分区";
	let current = null;
	let inFreeZone = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^\s*<!--\s*free-zone:start\s*-->\s*$/.test(line)) {
			if (current) rules.push(current);
			currentSection = "自由区域";
			current = null;
			inFreeZone = true;
			continue;
		}
		if (/^\s*<!--\s*free-zone:end\s*-->\s*$/.test(line)) {
			if (current) rules.push(current);
			current = null;
			inFreeZone = false;
			continue;
		}
		const sec = line.match(/^##\s+(.+?)\s*$/);
		if (sec) {
			if (current) rules.push(current);
			currentSection = sec[1].trim();
			current = null;
			continue;
		}
		const rule = line.match(/^###\s*\[规则\s*([0-9A-Za-z]+)\]\s*(.+?)\s*(?:（来源[^）]*）)?\s*$/);
		if (rule) {
			if (current) rules.push(current);
			current = {
				index: /^\d+$/.test(rule[1]) ? Number(rule[1]) : rule[1],
				title: rule[2].trim(),
				section: currentSection,
				free: inFreeZone,
				startLine: i,
				endLine: i + 1
			};
		} else if (current) {
			current.endLine = i + 1;
		}
	}
	if (current) rules.push(current);
	return { lines, rules, bom, missing: false };
}

/** 备份 AGENTS.md 到 ~/.dsh/.backups/，超额部分移入回收站（保留最近 MAX_BACKUPS 份），返回备份路径 */
async function backupAgents(file) {
	const dir = join(resolveDshHome(), ".backups");
	await mkdir(dir, { recursive: true });
	// 时间戳含毫秒（slice 到 23）：避免同一秒内多次操作互相覆盖备份
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
	const dest = join(dir, `AGENTS.md-${stamp}.bak`);
	await copyFile(file, dest);
	// 超额清理：移入回收站（不永久删除，可恢复）
	await pruneBackups();
	return dest;
}

/**
 * 清理超额备份：按文件名升序（= 时间升序）只保留最近 MAX_BACKUPS 份，
 * 超出部分移入回收站 .backups/trash-<时间戳>/（不永久删除）。
 * @returns {{ok:true, pruned:number, kept:number, trash:string}}
 */
export async function pruneBackups() {
	const dir = backupsDir();
	await mkdir(dir, { recursive: true });
	const entries = await readdir(dir, { withFileTypes: true });
	const files = entries
		.filter((e) => e.isFile() && /^AGENTS\.md-.+\.bak$/u.test(e.name))
		.map((e) => e.name)
		.sort();
	if (files.length <= MAX_BACKUPS) {
		return { ok: true, pruned: 0, kept: files.length, trash: "" };
	}
	const excess = files.slice(0, files.length - MAX_BACKUPS);
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
	const trashRoot = join(dir, `trash-${stamp}`);
	await mkdir(trashRoot, { recursive: true });
	for (const name of excess) {
		await rename(join(dir, name), join(trashRoot, name));
	}
	return { ok: true, pruned: excess.length, kept: MAX_BACKUPS, trash: trashRoot };
}

/** 把修改后的行数组写回 AGENTS.md（先备份，保持原 BOM 状态），返回备份路径 */
export async function saveLines(lines, bom) {
	const file = agentsFilePath();
	const backup = await backupAgents(file);
	const content = (bom ? "\ufeff" : "") + lines.join("\n");
	await writeFile(file, content, "utf8");
	return backup;
}

/** 规则的展示视图（正文为纯文本，供 UI/命令渲染） */
export function ruleView(rule, lines) {
	return {
		index: rule.index,
		title: rule.title,
		section: rule.section,
		free: rule.free === true,
		body: lines.slice(rule.startLine + 1, rule.endLine).join("\n").trim()
	};
}

/** 新增规则：返回新行数组与规则信息，或 { error } */
export function addRuleOp(lines, rules, title, body) {
	if (!title.trim()) return { error: "标题不能为空" };
	if (!body.trim()) return { error: "正文不能为空" };
	const maxIndex = rules.reduce((m, r) => Math.max(m, parseInt(String(r.index), 10) || 0), 0);
	const next = maxIndex + 1;
	const header = `### [规则 ${next}] ${title.trim()}（来源：/rules 命令 ${today()}）`;
	const bodyLines = body.trimEnd().split("\n");
	const nextLines = [...lines];
	// 插入点：自由区域（free-zone:start）之前，防止新规则掉进自由区
	const zoneStart = lines.findIndex((l) => /^\s*<!--\s*free-zone:start\s*-->\s*$/.test(l));
	let insertAt = zoneStart >= 0 ? zoneStart : lines.length;
	if (insertAt > 0 && lines[insertAt - 1] !== "") {
		nextLines.splice(insertAt, 0, "");
		insertAt++;
	}
	nextLines.splice(insertAt, 0, header, ...bodyLines);
	return {
		lines: nextLines,
		rule: { index: next, title: title.trim() }
	};
}

/** 修改规则正文：返回新行数组与规则信息，或 { error } */
export function editRuleOp(lines, rules, index, body) {
	if (!body.trim()) return { error: "正文不能为空" };
	const rule = rules.find((r) => String(r.index) === String(index));
	if (!rule) return { error: `没有编号 ${index} 的规则` };
	const nextLines = [...lines];
	nextLines.splice(rule.startLine + 1, rule.endLine - rule.startLine - 1, ...body.trimEnd().split("\n"));
	return {
		lines: nextLines,
		rule: { index: rule.index, title: rule.title }
	};
}

/** 删除规则：返回新行数组与规则信息，或 { error } */
export function deleteRuleOp(lines, rules, index) {
	const rule = rules.find((r) => String(r.index) === String(index));
	if (!rule) return { error: `没有编号 ${index} 的规则` };
	const nextLines = [...lines];
	nextLines.splice(rule.startLine, rule.endLine - rule.startLine);
	return {
		lines: nextLines,
		rule: { index: rule.index, title: rule.title }
	};
}

/** 禁用规则：从 AGENTS.md 移除并原样记录（标题/分区/标题行/正文），供之后恢复 */
export function disableRuleOp(lines, rules, index) {
	const rule = rules.find((r) => String(r.index) === String(index));
	if (!rule) return { error: `没有编号 ${index} 的规则` };
	const removed = {
		index: rule.index,
		title: rule.title,
		section: rule.section,
		header: lines[rule.startLine],
		body: lines.slice(rule.startLine + 1, rule.endLine).join("\n").trim()
	};
	const nextLines = [...lines];
	nextLines.splice(rule.startLine, rule.endLine - rule.startLine);
	return {
		lines: nextLines,
		removed
	};
}

// ── 备份管理（迭代②：备份清单 + 一键恢复）──────────────────────────

/** 备份目录绝对路径 */
export function backupsDir() {
	return join(resolveDshHome(), ".backups");
}

/** 把备份文件名里的 UTC 时间戳转成本地时间字符串（兼容标准 ISO 与紧凑 YYYYMMDDTHHMM[SS] 两种命名） */
function backupTimeLocal(name) {
	const p = (n) => String(n).padStart(2, "0");
	const fmt = (d) => Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
	const base = String(name || "").replace(/^AGENTS\.md-/, "").replace(/\.bak$/, "");
	// 标准格式：YYYY-MM-DDTHH-MM-SS[-mmm]（可能在文件名开头，也可能带前缀）
	let m = base.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?/);
	if (m) return fmt(new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}${m[5] ? "." + m[5] : ""}Z`));
	// 紧凑格式：YYYYMMDDTHHMMSS（例如 before-rules-...-20260816T063650）
	m = base.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
	if (m) return fmt(new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`));
	// 紧凑格式：YYYYMMDDTHHMM（例如 20260816T0000-rule9-audit）
	m = base.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
	if (m) return fmt(new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`));
	return "";
}

/** 统计文本中的规则条数（宽松匹配标题行，与 loadRules 的正则口径一致） */
export function countRulesInText(raw) {
	const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
	let count = 0;
	for (const line of text.split("\n")) {
		if (/^###\s*\[规则\s*[0-9A-Za-z]+\]/u.test(line)) count++;
	}
	return count;
}

/** 列出全部备份（时间升序），每条含 name/本地时间/大小(字节)/规则条数 */
export async function listBackups() {
	const dir = backupsDir();
	await mkdir(dir, { recursive: true });
	const entries = await readdir(dir, { withFileTypes: true });
	const names = entries
		.filter((e) => e.isFile() && /^AGENTS\.md-.+\.bak$/u.test(e.name))
		.map((e) => e.name)
		.sort();
	const result = [];
	for (const name of names) {
		const file = join(dir, name);
		const s = await stat(file);
		const raw = await readFile(file, "utf8");
		result.push({
			name,
			time: backupTimeLocal(name),
			size: s.size,
			rulesCount: countRulesInText(raw)
		});
	}
	result.sort((a, b) => a.time.localeCompare(b.time));
	return result;
}

/**
 * 一键恢复备份：先把当前 AGENTS.md 再备份一份（双保险），再把备份内容写回。
 * @returns {{ok:true, safety:string} | {error:string}}
 */
export async function restoreBackupOp(name) {
	if (typeof name !== "string" || !/^AGENTS\.md-.+\.bak$/u.test(name)) {
		return { error: "备份文件名不合法" };
	}
	const file = join(backupsDir(), name);
	let raw;
	try {
		raw = await readFile(file, "utf8");
	} catch (error) {
		if (error && error.code === "ENOENT") return { error: `备份不存在：${name}` };
		throw error;
	}
	const current = agentsFilePath();
	const safety = await backupAgents(current); // 恢复前先备份当前状态
	await writeFile(current, raw, "utf8");
	return { ok: true, safety };
}


export function compareIndex(a, b) {
	const ma = /^(\d+)([A-Za-z]?)$/.exec(String(a));
	const mb = /^(\d+)([A-Za-z]?)$/.exec(String(b));
	if (!ma || !mb) return String(a).localeCompare(String(b));
	const na = Number(ma[1]);
	const nb = Number(mb[1]);
	if (na !== nb) return na - nb;
	return (ma[2] || '').localeCompare(mb[2] || '');
}
