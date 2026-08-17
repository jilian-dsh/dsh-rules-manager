// rules-manager —— /rules 命令插件（host 插件，纯 Node，无需构建）
// 功能：管理用户全局规则文件 $DSH_HOME/AGENTS.md
//   /rules                列出全部规则
//   /rules show <编号>    查看某条规则的完整内容
//   /rules add <标题>｜<正文>    新增一条规则（｜ 为分隔符，全角半角均可）
//   /rules edit <编号> <新正文>  修改某条规则的正文（标题与来源保持不变）
//   /rules delete <编号>  删除某条规则（编号不复用）
// 安全：每次修改前自动备份到 $DSH_HOME/.backups/（保留最近 5 份）
// 解析/写入逻辑见 rules-core.js（与设置页服务共用）。
import {
	addRuleOp,
	deleteRuleOp,
	editRuleOp,
	loadRules,
	ruleView,
	saveLines
} from "./rules-core.js";

export const name = "rules-manager";
export const inject = ["commands"];

const USAGE = [
	"用法：",
	"  /rules                  列出全部规则",
	"  /rules show <编号>      查看某条规则的完整内容",
	"  /rules add <标题>｜<正文>  新增一条规则（用｜分隔标题和正文）",
	"  /rules edit <编号> <新正文>  修改某条规则的正文",
	"  /rules delete <编号>    删除某条规则",
	"说明：每次修改前自动备份到 ~/.dsh/.backups/（保留最近 5 份）",
].join("\n");

/** 解析 /rules 命令输入 */
function parseCommand(rawInput) {
	const text = rawInput.trim();
	if (!text || /^(list|ls)$/i.test(text)) return { kind: "list" };
	if (/^(help|\?)$/i.test(text)) return { kind: "help" };
	let m = text.match(/^(?:show|view|get)\s+([0-9A-Za-z]+)$/i);
	if (m) return { kind: "show", index: m[1] };
	m = text.match(/^edit\s+([0-9A-Za-z]+)\s+([\s\S]+)$/i);
	if (m) return { kind: "edit", index: m[1], body: m[2].trim() };
	m = text.match(/^add\s+([\s\S]+)$/i);
	if (m) {
		const sep = m[1].match(/^(.+?)\s*[｜|]\s*([\s\S]+)$/);
		if (sep && sep[1].trim() && sep[2].trim()) {
			return { kind: "add", title: sep[1].trim(), body: sep[2].trim() };
		}
		return { kind: "add-invalid" };
	}
	m = text.match(/^(?:delete|del|remove|rm)\s+([0-9A-Za-z]+)$/i);
	if (m) return { kind: "delete", index: m[1] };
	return { kind: "invalid" };
}

/** 执行一条 /rules 命令 */
async function executeRules(ctx, invocation) {
	const command = parseCommand(invocation.rawInput);
	const { lines, rules, bom, missing } = await loadRules();
	if (missing) {
		return { kind: "error", text: "未找到 AGENTS.md（$DSH_HOME/AGENTS.md）。请先创建用户全局规则文件，再使用 /rules 命令。" };
	}
	switch (command.kind) {
		case "help": {
			return { kind: "success", text: USAGE };
		}
		case "list": {
			if (rules.length === 0) return { kind: "success", text: "AGENTS.md 中尚未发现规则。" };
			const bySection = new Map();
			for (const rule of rules) {
				const list = bySection.get(rule.section) ?? [];
				list.push(rule);
				bySection.set(rule.section, list);
			}
			const parts = [`共 ${rules.length} 条规则：`, ""];
			for (const [section, list] of bySection) {
				parts.push(`【${section}】`);
				for (const rule of list) parts.push(`  [${rule.index}] ${rule.title}`);
				parts.push("");
			}
			return { kind: "success", text: parts.join("\n") };
		}
		case "show": {
			const rule = rules.find((r) => String(r.index) === String(command.index));
			if (!rule) {
				const available = rules.map((r) => r.index).join("、");
				return { kind: "error", text: `没有编号 ${command.index} 的规则。当前规则编号：${available || "无"}` };
			}
			const view = ruleView(rule, lines);
			return { kind: "success", text: `【规则 ${view.index}】${view.title}\n所属分区：${view.section}\n${view.body}` };
		}
		case "add": {
			const op = addRuleOp(lines, rules, command.title, command.body);
			if (op.error) return { kind: "error", text: op.error };
			const backup = await saveLines(op.lines, bom);
			return {
				kind: "success",
				text: `已新增【规则 ${op.rule.index}】${op.rule.title}，并写入 AGENTS.md（已实时生效）。\n修改前备份：${backup}`,
			};
		}
		case "edit": {
			const op = editRuleOp(lines, rules, command.index, command.body);
			if (op.error) return { kind: "error", text: op.error };
			const backup = await saveLines(op.lines, bom);
			return {
				kind: "success",
				text: `已修改【规则 ${op.rule.index}】${op.rule.title} 的正文，并写入 AGENTS.md（已实时生效）。\n修改前备份：${backup}`,
			};
		}
		case "delete": {
			const op = deleteRuleOp(lines, rules, command.index);
			if (op.error) return { kind: "error", text: op.error };
			const backup = await saveLines(op.lines, bom);
			return {
				kind: "success",
				text: `已删除【规则 ${op.rule.index}】${op.rule.title}（其余规则编号保持不变）。\n修改前备份：${backup}`,
			};
		}
		case "add-invalid": {
			return { kind: "error", text: `新增规则需要「标题｜正文」格式，例如：\n/rules add 我的规则｜这是规则正文\n${USAGE}` };
		}
		default: {
			return { kind: "error", text: USAGE };
		}
	}
}

/** 注册 /rules 全局命令（host 平面，所有会话可见） */
export function apply(ctx) {
	ctx.effect(function* () {
		yield ctx.commands.register({
			name: "rules",
			description: "管理用户全局规则（AGENTS.md）：列出、查看、新增、修改、删除",
			input: { hint: "[list|show <编号>|add <标题>｜<正文>|edit <编号> <正文>|delete <编号>]" },
			handler: async (invocation) => {
				try {
					return await executeRules(ctx, invocation);
				} catch (error) {
					return {
						kind: "error",
						text: `执行出错：${error instanceof Error ? error.message : String(error)}`,
					};
				}
			},
		});
	}, "rules-manager lifecycle");
}
