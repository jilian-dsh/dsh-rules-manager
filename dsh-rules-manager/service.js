// service.js —— 规则管理服务（host 端 Remote 服务）
// 供设置页（client 插件）通过 ctx.remote.rulesManager.* 调用。
// 说明：Node 的 ESM 不支持装饰器语法，故 @Remote 用 typert-protocol 的
// 直接调用形态手动标记（Remote(method, fakeContext)，构造函数内执行）。
// C3：新增用户自定义命令（存储 $DSH_HOME/commands.json，动态注册为斜杠命令，
//     执行时把预设内容作为用户消息投递给 AI：agent.followup）。
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
	addRuleOp,
	deleteRuleOp,
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
				const message = {
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
