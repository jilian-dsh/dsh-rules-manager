// service.js —— 规则管理服务（host 端 Remote 服务）
// 供设置页（client 插件）通过 ctx.remote.rulesManager.* 调用。
// 说明：Node 的 ESM 不支持装饰器语法，故 @Remote 用 typert-protocol 的
// 直接调用形态手动标记（Remote(method, fakeContext)，构造函数内执行）。
// C3：新增用户自定义命令（存储 $DSH_HOME/commands.json，动态注册为斜杠命令，
//     执行时把预设内容作为用户消息投递给 AI：agent.followup）。
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
	addRuleOp,
	deleteRuleOp,
	disableRuleOp,
	editRuleOp,
	loadRules,
	ruleView,
	saveLines
} from "./rules-core.js";

/** 需要暴露为 Remote 的方法名（顺序 = 声明顺序） */
const REMOTE_METHODS = [
	"listRules",
	"addRule",
	"editRule",
	"deleteRule",
	"disableRule",
	"enableRule",
	"listDisabledRules",
	"listCommands",
	"listUserCommands",
	"saveUserCommand",
	"deleteUserCommand"
];

/** 用户自定义命令存储文件 */
function userCommandsFile() {
	return join(resolveDshHome(), "commands.json");
}

/** 读取用户自定义命令（容错：文件不存在返回空列表；条目过滤） */
async function loadUserCommands() {
	try {
		const raw = await readFile(userCommandsFile(), "utf8");
		const list = JSON.parse(raw);
		if (!Array.isArray(list)) return [];
		return list.filter((c) => c && typeof c.name === "string" && typeof c.prompt === "string");
	} catch (error) {
		if (error && error.code === "ENOENT") return [];
		throw error;
	}
}

/** 写入用户自定义命令 */
async function saveUserCommands(list) {
	await writeFile(userCommandsFile(), JSON.stringify(list, null, 2), "utf8");
}

/** 已禁用规则存储文件 */
function disabledRulesFile() {
	return join(resolveDshHome(), "disabled-rules.json");
}

/** 读取已禁用规则（容错：文件不存在返回空列表） */
async function loadDisabledRules() {
	try {
		const raw = await readFile(disabledRulesFile(), "utf8");
		const list = JSON.parse(raw);
		return Array.isArray(list) ? list : [];
	} catch (error) {
		if (error && error.code === "ENOENT") return [];
		throw error;
	}
}

/** 写入已禁用规则 */
async function saveDisabledRules(list) {
	await writeFile(disabledRulesFile(), JSON.stringify(list, null, 2), "utf8");
}

class RulesManagerService extends TypertRemoteService {
	static inject = ["commands"];
	/** 已注册用户命令的 disposer（按命令名） */
	userCommandDisposers = new Map();
	/** 已注册用户命令名集合 */
	userCommandNames = new Set();

	constructor(ctx) {
		super(ctx, "rulesManager");
		// 手动模拟 @Remote 装饰器：context.addInitializer 立即以实例为 this 执行，
		// 使 typert-protocol 的内部 marker 表记录这些方法（gateway 据此暴露 RPC）。
		// 注意：Remote 第一参数必须是"非字符串"（字符串会被当作 exportName 装饰器工厂），
		// 传 null 触发直接调用分支 addMarkerInitializer(context, {kind:"direct"})。
		for (const name of REMOTE_METHODS) {
			Remote(null, {
				kind: "method",
				name,
				private: false,
				static: false,
				// 箭头函数：this 捕获构造函数作用域（= 实例）；普通函数 this 会是 context 对象，标记会写错原型
				addInitializer: (fn) => {
					fn.call(this);
				}
			});
		}
		// 启动时异步加载并注册用户自定义命令
		void this.ensureUserCommands();
	}

	/** 读取存储并把尚未注册的用户命令注册为斜杠命令 */
	async ensureUserCommands() {
		try {
			const list = await loadUserCommands();
			for (const cmd of list) {
				if (!this.userCommandNames.has(cmd.name)) this.registerUserCommand(cmd);
			}
		} catch (error) {
			this.ctx.logger?.warn?.("rules-manager: 加载用户命令失败: %s", error instanceof Error ? error.message : String(error));
		}
	}

	/** 注册一条用户命令（handler 把预设内容投递给 AI） */
	registerUserCommand(cmd) {
		if (this.userCommandNames.has(cmd.name)) return;
		const disposer = this.ctx.commands.register({
			name: cmd.name,
			description: `自定义命令：${cmd.prompt.slice(0, 40)}`,
			input: { hint: "无参数（发送预设内容给 AI）" },
			handler: (invocation) => {
				// 注意：message 必须有 id（randomUUID）！DSH 写入路径零校验、
				// 但加载历史时严格校验 message.id 非空——缺 id 会写坏会话日志，
				// 导致整个会话历史无法加载（2026-08-14 排查会话定位的 bug）。
				const message = {
					id: randomUUID(),
					role: "user",
					content: [{ type: "text", text: cmd.prompt }],
					source: { kind: "user" }
				};
				invocation.agent.followup(message);
				return { kind: "success", text: `已发送自定义命令「${cmd.name}」的预设内容给 AI。` };
			}
		});
		this.userCommandDisposers.set(cmd.name, disposer);
		this.userCommandNames.add(cmd.name);
	}

	/** 注销一条用户命令 */
	unregisterUserCommand(name) {
		const disposer = this.userCommandDisposers.get(name);
		if (disposer) {
			try {
				disposer();
			} catch {
				/* 注销失败不阻断 */
			}
		}
		this.userCommandDisposers.delete(name);
		this.userCommandNames.delete(name);
	}

	// ── Remote: 规则 ─────────────────────────────────────────────────────

	/** 规则清单（含分区/编号/标题/正文原文），供可视化编辑 */
	async listRules() {
		const { lines, rules, missing } = await loadRules();
		if (missing) return { ok: false, error: "未找到 AGENTS.md（$DSH_HOME/AGENTS.md）" };
		return {
			ok: true,
			rules: rules.map((r) => ruleView(r, lines))
		};
	}
	/** 新增规则（自动编号 + 来源标注 + 自动备份） */
	async addRule(title, body) {
		const { lines, rules, bom, missing } = await loadRules();
		if (missing) return { ok: false, error: "未找到 AGENTS.md（$DSH_HOME/AGENTS.md）" };
		const op = addRuleOp(lines, rules, title, body);
		if (op.error) return { ok: false, error: op.error };
		const backup = await saveLines(op.lines, bom);
		return { ok: true, rule: op.rule, backup };
	}
	/** 修改规则正文（标题与来源保持不变） */
	async editRule(index, body) {
		const { lines, rules, bom, missing } = await loadRules();
		if (missing) return { ok: false, error: "未找到 AGENTS.md（$DSH_HOME/AGENTS.md）" };
		const op = editRuleOp(lines, rules, Number(index), body);
		if (op.error) return { ok: false, error: op.error };
		const backup = await saveLines(op.lines, bom);
		return { ok: true, rule: op.rule, backup };
	}
	/** 删除规则（编号不复用） */
	async deleteRule(index) {
		const { lines, rules, bom, missing } = await loadRules();
		if (missing) return { ok: false, error: "未找到 AGENTS.md（$DSH_HOME/AGENTS.md）" };
		const op = deleteRuleOp(lines, rules, Number(index));
		if (op.error) return { ok: false, error: op.error };
		const backup = await saveLines(op.lines, bom);
		return { ok: true, rule: op.rule, backup };
	}
	/** 禁用规则：从 AGENTS.md 移除并原样保存到 disabled-rules.json（可恢复） */
	async disableRule(index) {
		const { lines, rules, bom, missing } = await loadRules();
		if (missing) return { ok: false, error: "未找到 AGENTS.md（$DSH_HOME/AGENTS.md）" };
		const op = disableRuleOp(lines, rules, Number(index));
		if (op.error) return { ok: false, error: op.error };
		const backup = await saveLines(op.lines, bom);
		const disabled = await loadDisabledRules();
		disabled.push({ ...op.removed, disabledAt: new Date().toISOString() });
		await saveDisabledRules(disabled);
		return { ok: true, rule: { index: op.removed.index, title: op.removed.title }, backup };
	}
	/** 启用规则：从 disabled-rules.json 取回并重新写入 AGENTS.md（自动分配新编号） */
	async enableRule(index) {
		const disabled = await loadDisabledRules();
		const entry = disabled.find((d) => d.index === Number(index));
		if (!entry) return { ok: false, error: `没有已禁用的规则 ${index}` };
		const { lines, rules, bom, missing } = await loadRules();
		if (missing) return { ok: false, error: "未找到 AGENTS.md（$DSH_HOME/AGENTS.md）" };
		const nextLines = [...lines];
		const taken = rules.some((r) => r.index === entry.index);
		const bodyLines = (entry.body || "").split("\n");
		let ruleIndex;
		if (!taken) {
			// 原编号可用：回原分区（分区标题行之后）；原分区已不存在则追加末尾
			ruleIndex = entry.index;
			const header = entry.header || `### [规则 ${entry.index}] ${entry.title}（来源：/rules 命令 ${today()}）`;
			const secIdx = nextLines.findIndex((l) => l.trim() === `## ${entry.section}`);
			if (secIdx >= 0) {
				// 按编号升序插回分区：找分区内第一个编号 > entry.index 的规则，插到它之前
				// （分区内没有更大编号则插到分区末尾），保持规则顺序与恢复前一致
				let sectionEnd = nextLines.length;
				for (let i = secIdx + 1; i < nextLines.length; i++) {
					if (/^##\s+/u.test(nextLines[i])) { sectionEnd = i; break; }
				}
				let insertAt = sectionEnd;
				for (let i = secIdx + 1; i < sectionEnd; i++) {
					const rm = nextLines[i].match(/^###\s*\[规则\s*(\d+)\]/u);
					if (rm && Number(rm[1]) > entry.index) { insertAt = i; break; }
				}
				const block = [header, ...bodyLines];
				if (insertAt > 0 && nextLines[insertAt - 1].trim() !== "") block.unshift("");
				nextLines.splice(insertAt, 0, ...block);
			} else {
				if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push("");
				nextLines.push(header, ...bodyLines);
			}
		} else {
			// 原编号被占用：新编号追加末尾
			const op = addRuleOp(nextLines, rules, entry.title, entry.body);
			if (op.error) return { ok: false, error: op.error };
			ruleIndex = op.rule.index;
			nextLines.length = 0;
			nextLines.push(...op.lines);
		}
		const backup = await saveLines(nextLines, bom);
		await saveDisabledRules(disabled.filter((d) => d.index !== Number(index)));
		return { ok: true, rule: { index: ruleIndex, title: entry.title }, backup };
	}
	/** 已禁用规则清单（供面板"已禁用"区展示与恢复） */
	async listDisabledRules() {
		try {
			const disabled = await loadDisabledRules();
			return {
				ok: true,
				rules: disabled.map((d) => ({
					index: d.index,
					title: d.title,
					section: d.section,
					body: d.body,
					disabledAt: d.disabledAt ?? ""
				}))
			};
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	}
	/** 全部可用斜杠命令（全局层，只读清单） */
	async listCommands() {
		try {
			const commands = this.ctx.commands.list(void 0);
			return {
				ok: true,
				commands: commands.map((c) => ({
					name: c.name,
					description: c.description,
					hint: c.input?.hint ?? ""
				}))
			};
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	// ── Remote: 用户自定义命令（C3）─────────────────────────────────────

	/** 用户自定义命令清单 */
	async listUserCommands() {
		try {
			const list = await loadUserCommands();
			return { ok: true, commands: list.map((c) => ({ name: c.name, prompt: c.prompt })) };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	}
	/** 新增/更新用户命令（保存后立即注册/重注册为斜杠命令） */
	async saveUserCommand(name, prompt) {
		if (typeof name !== "string" || !/^[a-z][a-z0-9_-]*$/u.test(name)) {
			return { ok: false, error: "命令名只能用小写字母、数字、连字符或下划线（例如 backup-note）" };
		}
		if (typeof prompt !== "string" || !prompt.trim()) {
			return { ok: false, error: "命令内容不能为空" };
		}
		// 与系统/其他插件命令冲突检查（用户命令本身允许覆盖更新）
		const existing = this.ctx.commands.find(void 0, name);
		if (existing !== void 0 && !this.userCommandNames.has(name)) {
			return { ok: false, error: `命令 /${name} 已被系统或其他插件占用，请换一个名字` };
		}
		const entry = { name, prompt: prompt.trim(), updatedAt: new Date().toISOString() };
		const list = await loadUserCommands();
		const idx = list.findIndex((c) => c.name === name);
		if (idx >= 0) list[idx] = entry;
		else list.push(entry);
		await saveUserCommands(list);
		this.unregisterUserCommand(name);
		this.registerUserCommand(entry);
		return { ok: true, command: { name } };
	}
	/** 删除用户命令（同时注销斜杠命令） */
	async deleteUserCommand(name) {
		const list = await loadUserCommands();
		const next = list.filter((c) => c.name !== name);
		if (next.length === list.length) return { ok: false, error: `没有命令 /${name}` };
		await saveUserCommands(next);
		this.unregisterUserCommand(name);
		return { ok: true };
	}
}

export { RulesManagerService, RulesManagerService as default };
