// rules-core.js —— 规则管理共享核心（/rules 命令 与 设置页服务 共用）
// 职责：解析 AGENTS.md、备份、写入、增删改操作。不依赖 Cordis/UI，纯 Node。
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { join } from "node:path";
import { readFile, writeFile, copyFile, mkdir, readdir, unlink } from "node:fs/promises";

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
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const sec = line.match(/^##\s+(.+?)\s*$/);
		if (sec) {
			if (current) rules.push(current);
			currentSection = sec[1].trim();
			current = null;
			continue;
		}
		const rule = line.match(/^###\s*\[规则\s*(\d+)\]\s*(.+?)\s*(?:（来源[^）]*）)?\s*$/);
		if (rule) {
			if (current) rules.push(current);
			current = {
				index: Number(rule[1]),
				title: rule[2].trim(),
				section: currentSection,
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

/** 备份 AGENTS.md 到 ~/.dsh/.backups/，保留最近 MAX_BACKUPS 份，返回备份路径 */
async function backupAgents(file) {
	const dir = join(resolveDshHome(), ".backups");
	await mkdir(dir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const dest = join(dir, `AGENTS.md-${stamp}.bak`);
	await copyFile(file, dest);
	const files = (await readdir(dir))
		.filter((f) => f.startsWith("AGENTS.md-") && f.endsWith(".bak"))
		.sort();
	while (files.length > MAX_BACKUPS) {
		await unlink(join(dir, files.shift()));
	}
	return dest;
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
		body: lines.slice(rule.startLine + 1, rule.endLine).join("\n").trim()
	};
}

/** 新增规则：返回新行数组与规则信息，或 { error } */
export function addRuleOp(lines, rules, title, body) {
	if (!title.trim()) return { error: "标题不能为空" };
	if (!body.trim()) return { error: "正文不能为空" };
	const maxIndex = rules.reduce((m, r) => Math.max(m, r.index), 0);
	const next = maxIndex + 1;
	const header = `### [规则 ${next}] ${title.trim()}（来源：/rules 命令 ${today()}）`;
	const bodyLines = body.trimEnd().split("\n");
	const nextLines = [...lines];
	if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push("");
	nextLines.push(header, ...bodyLines);
	return {
		lines: nextLines,
		rule: { index: next, title: title.trim() }
	};
}

/** 修改规则正文：返回新行数组与规则信息，或 { error } */
export function editRuleOp(lines, rules, index, body) {
	if (!body.trim()) return { error: "正文不能为空" };
	const rule = rules.find((r) => r.index === index);
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
	const rule = rules.find((r) => r.index === index);
	if (!rule) return { error: `没有编号 ${index} 的规则` };
	const nextLines = [...lines];
	nextLines.splice(rule.startLine, rule.endLine - rule.startLine);
	return {
		lines: nextLines,
		rule: { index: rule.index, title: rule.title }
	};
}
