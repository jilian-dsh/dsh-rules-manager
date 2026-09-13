// skills-core.js —— 技能管理共享核心（仅设置页服务使用）
// 技能 = ~/.dsh/skills/<name>/ 目录（内含 SKILL.md）。
// 设计原则（防乱序，来源：规则禁用/恢复曾出现的乱序教训）：
//   技能以目录名为唯一标识，无编号、无分区 → 禁用 = 整目录移走，
//   启用 = 原样移回，不存在"插回排序"逻辑，天然不会乱序。
// 删除 = 整目录移入回收站 ~/.dsh/.backups/trash-<时间戳>/（可恢复，规则 13.4）。
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { join } from "node:path";
import { readdir, readFile, rename, mkdir, stat, writeFile, copyFile } from "node:fs/promises";

/** 技能目录 */
export function skillsDir() {
	return join(resolveDshHome(), "skills");
}

/** 已禁用技能目录 */
export function disabledSkillsDir() {
	return join(resolveDshHome(), "disabled-skills");
}

/** 备份根目录（回收站在其下） */
export function backupsDir() {
	return join(resolveDshHome(), ".backups");
}

/** 技能名规则：字母数字开头，只含字母数字、连字符、下划线（防路径穿越） */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

export function isValidSkillName(name) {
	return typeof name === "string" && NAME_RE.test(name);
}

/**
 * 解析 SKILL.md 的 YAML frontmatter（取 name/description/protected）。
 * 支持两种写法：
 *   1) 单行：description: 一句话
 *   2) YAML 块标量（多行）：description: |（或 >）后接缩进的多行文本
 *      ——实测本机 30 个技能中有 5 个用块标量写法，旧实现把它们读成 1 个字符（"|"），
 *        导致面板显示空白（2026-08-15 修复）。
 * 2026-09-14：字段白名单补 `protected`（核心资产自声明，供保护名单机制识别）——
 *   原实现只认 name|description，技能即便声明 `protected: true` 也被静默忽略
 *   （由 verify-protected.mjs 探针抓出：手册已声明而面板仍显示无保护）。
 */
export function parseFrontmatter(raw) {
	const m = raw.match(/^---\s*\n([\s\S]*?)\n---/u);
	if (!m) return {};
	const out = {};
	// 2026-09-14 修 CRLF 漏解析：原按 "\n" 切分后行尾残留 "\r"，而行正则的 (.*)$ **不匹配 \r**
	// → 该行被整行跳过。实测影响面：21 个技能中 11 个是 CRLF 文件，其中 **9 个的 description 在面板显示为空**
	// （含全机第三高频的 sansheng-distill，21 次调用）。
	// 注意：第一版改成 split(/\r?\n/) **只修好了非末行**（中间行的 \r 随 \r\n 一并切掉，末行的 \r 仍残留）——
	// dsh-benchmark-case 的 description 在中间故正常，plugin-test/sansheng-distill 的 description 恰是末行故仍为空。
	// 现改为**先整体归一化 EOL 再切分**，彻底消除行尾 \r。
	const lines = m[1].replace(/\r\n?/gu, "\n").split("\n");
	for (let i = 0; i < lines.length; i++) {
		const kv = lines[i].match(/^(name|description|protected)\s*:\s*(.*)$/u);
		if (!kv) continue;
		const key = kv[1];
		const rest = kv[2].trim();
		if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
			// 块标量：收集后续缩进行，直到下一个顶格 frontmatter 键或顶格非缩进行
			const parts = [];
			let j = i + 1;
			for (; j < lines.length; j++) {
				const next = lines[j];
				if (/^\S/u.test(next)) break; // 顶格行（下一键或空行之外的顶格内容）= 块结束
				const t = next.trim();
				if (t) parts.push(t);
			}
			out[key] = parts.join(" ");
			i = j - 1;
		} else if (rest !== "") {
			out[key] = rest.replace(/^["']|["']$/g, "");
		}
	}
	return out;
}

/** 列出已安装技能（按名称排序，含 frontmatter 描述） */
export async function listSkills() {
	const dir = skillsDir();
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (error && error.code === "ENOENT") return [];
		throw error;
	}
	const skills = [];
	for (const e of entries) {
		if (!e.isDirectory() || !isValidSkillName(e.name)) continue;
		const skillFile = join(dir, e.name, "SKILL.md");
		// 2026-09-14 过滤（用户拍板）：**无 SKILL.md 的目录不是技能**，跳过。
		// 背景：`$DSH_HOME/skills/` 下存在 git 源仓库目录（如 dsh-plugin-upgrade-skill，内含 9 个子技能、带 .git），
		// 此前"缺失也仍列入清单"会让它在技能页显示为可禁用/删除的条目——误操作会移动源仓库目录。
		// 判据＝SKILL.md 必须存在且可读（技能定义文件）。
		let raw;
		try {
			raw = await readFile(skillFile, "utf8");
		} catch {
			continue;
		}
		const fm = parseFrontmatter(raw);
		// 2026-09-14 保护标记（**通用机制——插件不预设任何名单**）：技能在自身 SKILL.md 的 frontmatter 里
		// 声明 `protected: true` 即视为核心资产。判据（写给技能作者）＝**该技能的缺失会破坏既有流程或工具链**
		// ——被规则/脚本/统一入口直接引用、承载核心工作流、或替代成本极高。由技能自己声明，插件只负责
		// 呈现（徽章）与确认加强（禁用/删除二次确认），不硬编码任何具体技能名，故对任何使用者都成立。
		const isProtected = String(fm.protected ?? "").trim().toLowerCase() === "true";
		skills.push({ name: e.name, title: fm.name ?? e.name, description: fm.description ?? "", isProtected });
	}
	skills.sort((a, b) => a.name.localeCompare(b.name));
	return skills;
}

/**
 * 开/关单个技能的核心保护（2026-09-14 用户拍板）——改写该技能 SKILL.md frontmatter 的 `protected` 字段。
 * 保护语义：该技能缺失会破坏既有流程/工具链（判据与技能页「⚠️ 核心」徽章一致）。
 * 这是本模块**唯一改写用户技能文件**的操作，属高风险 → **写前必做备份**到 .backups/（规则 13A），
 * 备份失败即中止、绝不裸写；幂等（目标状态与现状一致时直接返回 unchanged）。
 */
export async function setSkillProtected(name, value) {
	if (!isValidSkillName(name)) return { error: `技能名不合法：${name}` };
	const file = join(skillsDir(), name, "SKILL.md");
	let raw;
	try {
		raw = await readFile(file, "utf8");
	} catch {
		return { error: `读取失败（技能不存在或 SKILL.md 不可读）：${name}` };
	}
	const m = raw.match(/^---\s*\n([\s\S]*?)\n---/u);
	if (!m) return { error: "该技能的 SKILL.md 缺少 YAML frontmatter，无法设置保护标记" };
	const want = value === true;
	const fmText = m[1];
	const hasKey = /^protected\s*:/mu.test(fmText);
	const cur = String(parseFrontmatter(raw).protected ?? "").trim().toLowerCase() === "true";
	if (want === cur) return { ok: true, unchanged: true, isProtected: cur };
	let newFm;
	if (want) {
		newFm = hasKey ? fmText.replace(/^protected\s*:.*$/mu, "protected: true") : `${fmText}\nprotected: true`;
	} else {
		newFm = fmText.split("\n").filter((l) => !/^protected\s*:/u.test(l)).join("\n");
	}
	// 写前备份（规则 13A：改写用户技能文件必须可回滚）
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backup = join(backupsDir(), `${name}__SKILL.md-${stamp}.bak`);
	try {
		await mkdir(backupsDir(), { recursive: true });
		await copyFile(file, backup);
	} catch (error) {
		return { error: `备份失败，已中止（未改写任何文件）：${(error && error.message) || error}` };
	}
	const out = `${raw.slice(0, m.index)}---\n${newFm}\n---${raw.slice(m.index + m[0].length)}`;
	try {
		await writeFile(file, out, "utf8");
	} catch (error) {
		return { error: `写入失败（原文件已备份到 ${backup}）：${(error && error.message) || error}` };
	}
	return { ok: true, changed: true, isProtected: want, backup };
}

/** 读取某个已安装技能的 SKILL.md 全文 */
export async function getSkill(name) {
	if (!isValidSkillName(name)) return { error: `技能名不合法：${name}` };
	const file = join(skillsDir(), name, "SKILL.md");
	try {
		const raw = await readFile(file, "utf8");
		return { ok: true, name, content: raw };
	} catch (error) {
		if (error && error.code === "ENOENT") return { error: `技能不存在：${name}` };
		throw error;
	}
}

/** 目标路径是否已存在（stat 包装） */
async function exists(p) {
	try {
		await stat(p);
		return true;
	} catch (error) {
		if (error && error.code === "ENOENT") return false;
		throw error;
	}
}

/** 禁用：skills/<name> → disabled-skills/<name>（目标已存在则拒绝，防覆盖） */
export async function disableSkill(name) {
	if (!isValidSkillName(name)) return { error: `技能名不合法：${name}` };
	const src = join(skillsDir(), name);
	if (!(await exists(src))) return { error: `技能不存在：${name}` };
	const dstDir = disabledSkillsDir();
	await mkdir(dstDir, { recursive: true });
	const dst = join(dstDir, name);
	if (await exists(dst)) {
		return { error: `已存在同名已禁用技能：${name}。请先启用或删除它，再执行本操作。` };
	}
	await rename(src, dst);
	return { ok: true, name };
}

/** 启用：disabled-skills/<name> → skills/<name>（目标已存在则拒绝，防覆盖） */
export async function enableSkill(name) {
	if (!isValidSkillName(name)) return { error: `技能名不合法：${name}` };
	const src = join(disabledSkillsDir(), name);
	if (!(await exists(src))) return { error: `没有已禁用的技能：${name}` };
	const dst = join(skillsDir(), name);
	if (await exists(dst)) {
		return { error: `skills 目录下已存在同名技能：${name}。请先禁用或删除现有技能，再执行本操作。` };
	}
	await rename(src, dst);
	return { ok: true, name };
}

/** 列出已禁用技能 */
export async function listDisabledSkills() {
	const dir = disabledSkillsDir();
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (error && error.code === "ENOENT") return [];
		throw error;
	}
	return entries
		.filter((e) => e.isDirectory() && isValidSkillName(e.name))
		.map((e) => ({ name: e.name }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 删除技能（移入回收站，可恢复）：skills/<name> 或 disabled-skills/<name>
 * → ~/.dsh/.backups/trash-<时间戳>/<name>
 */
export async function deleteSkill(name) {
	if (!isValidSkillName(name)) return { error: `技能名不合法：${name}` };
	let src = join(skillsDir(), name);
	let fromDisabled = false;
	if (!(await exists(src))) {
		src = join(disabledSkillsDir(), name);
		fromDisabled = true;
		if (!(await exists(src))) return { error: `技能不存在：${name}` };
	}
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
	const trashRoot = join(backupsDir(), `trash-${stamp}`);
	await mkdir(trashRoot, { recursive: true });
	const dst = join(trashRoot, name);
	await rename(src, dst);
	return { ok: true, name, fromDisabled, trash: trashRoot };
}
