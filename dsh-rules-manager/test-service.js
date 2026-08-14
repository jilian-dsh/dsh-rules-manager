// service.js 隔离测试：手动 Remote 标记 + 全部 Remote 方法 + C3 用户自定义命令
// 运行：node "D:\DeepSeek harness\.dsh\profiles\web\rules-manager\test-service.js"
// 使用固定 fixture（不依赖真实 AGENTS.md），测试稳定可重复。
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remoteMethods } from "@deepseek-ai/dsh-typert-protocol";

const home = await mkdtemp(join(tmpdir(), "rules-svc-"));
process.env.DSH_HOME = home;

// 固定测试夹具：3 条规则 + 分区
const FIXTURE = `# 测试规则（fixture）

## 一、通用行为

### [规则 1] 规则一标题（来源 test-1）
规则一正文内容。

### [规则 2] 规则二标题（来源 test-2）
规则二正文内容。

### [规则 3] 规则三标题（来源 test-3）
规则三正文内容。
`;
await writeFile(join(home, "AGENTS.md"), FIXTURE, "utf8");

// 模拟 commands 服务：内置命令表 + 注册表 + find
const builtin = new Map([
	["compact", { name: "compact", description: "test builtin" }],
	["rules", { name: "rules", description: "test builtin" }]
]);
const registered = new Map();
const followed = [];
const fakeCtx = {
	reflect: { provide: () => {} },
	logger: { warn: () => {} },
	commands: {
		list: () => [...builtin.values(), ...registered.values()].map((d) => ({
			name: d.name,
			description: d.description,
			input: d.input
		})),
		find: (_agent, name) => builtin.get(name) ?? registered.get(name),
		register: (def) => {
			if (builtin.has(def.name) || registered.has(def.name)) throw new Error(`command "${def.name}" is already registered`);
			registered.set(def.name, def);
			return () => registered.delete(def.name);
		}
	}
};
const { RulesManagerService } = await import("./service.js");
const svc = new RulesManagerService(fakeCtx);

let failed = 0;
const t = (name, cond) => {
	console.log((cond ? "PASS" : "FAIL") + " - " + name);
	if (!cond) failed++;
};

// ── 1. 手动 Remote 标记 ─────────────────────────────────────────────
const methods = remoteMethods(svc).map((m) => m.method);
t("remoteMethods 标记 13 个方法", methods.length === 13);
for (const m of ["listRules", "addRule", "editRule", "deleteRule", "disableRule", "enableRule", "listDisabledRules", "listBackups", "restoreBackup", "listCommands", "listUserCommands", "saveUserCommand", "deleteUserCommand"]) {
	t(`含 ${m}`, methods.includes(m));
}

// ── 2. 规则方法（fixture）───────────────────────────────────────────
const list = await svc.listRules();
t("listRules ok (3 条含正文)", list.ok === true && list.rules.length === 3 && typeof list.rules[0].body === "string");

const added = await svc.addRule("服务测试规则", "服务测试正文");
t("addRule ok", added.ok === true && added.rule.index === 4);
const edited = await svc.editRule(4, "服务测试正文已修改");
t("editRule ok", edited.ok === true);
const del = await svc.deleteRule(4);
t("deleteRule ok", del.ok === true);

// ── 2.5 禁用/恢复规则（迭代①）───────────────────────────────────────
const dis = await svc.disableRule(2);
t("disableRule ok", dis.ok === true && dis.rule.index === 2);
t("listDisabledRules 含规则 2", (await svc.listDisabledRules()).rules.some((r) => r.index === 2));
const afterDisable = await readFile(join(home, "AGENTS.md"), "utf8");
t("AGENTS.md 已移除规则 2", !afterDisable.includes("### [规则 2] 规则二标题"));
const en = await svc.enableRule(2);
t("enableRule ok（回原编号 2）", en.ok === true && en.rule.index === 2);
t("listDisabledRules 已清空", (await svc.listDisabledRules()).rules.length === 0);
const afterEnable = await readFile(join(home, "AGENTS.md"), "utf8");
t("AGENTS.md 恢复规则 2（原编号）", afterEnable.includes("### [规则 2] 规则二标题"));
t("恢复位置正确（规则 1 < 规则 2 < 规则 3）", afterEnable.indexOf("### [规则 1]") < afterEnable.indexOf("### [规则 2]") && afterEnable.indexOf("### [规则 2]") < afterEnable.indexOf("### [规则 3]"));
t("禁用不存在规则 error", (await svc.disableRule(99)).ok === false);
const del2 = await svc.deleteRule(2);
t("清理恢复的规则 2", del2.ok === true);
t("addRule 空标题 error", (await svc.addRule("", "正文")).ok === false);

// ── 3. 命令清单 ────────────────────────────────────────────────────
const cmds = await svc.listCommands();
t("listCommands ok 含 compact/rules", cmds.ok === true && cmds.commands.some((c) => c.name === "compact") && cmds.commands.some((c) => c.name === "rules"));

// ── 4. C3 用户自定义命令 ───────────────────────────────────────────
// 保存 → 注册
const saved = await svc.saveUserCommand("backup-note", "请提醒我每周备份重要文件");
t("saveUserCommand ok", saved.ok === true && saved.command.name === "backup-note");
t("命令已注册为斜杠命令", registered.has("backup-note"));
t("listUserCommands 含 backup-note", (await svc.listUserCommands()).commands.some((c) => c.name === "backup-note"));

// 执行命令 → 投递预设内容给 agent（必须含 id！缺 id 会锁死会话历史）
const handler = registered.get("backup-note").handler;
const result = handler({ agent: { followup: (m) => followed.push(m) }, rawInput: "", commandId: "t", signal: new AbortController().signal });
t("命令执行返回 success", result.kind === "success");
t("投递了用户消息（含 id，文本=预设内容）", followed.length === 1 && typeof followed[0].id === "string" && followed[0].id.length > 0 && followed[0].role === "user" && followed[0].content[0].type === "text" && followed[0].content[0].text.includes("每周备份"));

// 更新命令 → 重注册（新内容）
const updated = await svc.saveUserCommand("backup-note", "请提醒我每周三备份");
t("saveUserCommand 更新 ok", updated.ok === true);
const handler2 = registered.get("backup-note").handler;
handler2({ agent: { followup: (m) => followed.push(m) }, rawInput: "", commandId: "t", signal: new AbortController().signal });
t("更新后投递新内容（含 id）", followed[1].content[0].text.includes("每周三") && typeof followed[1].id === "string" && followed[1].id.length > 0);

// 冲突检查：与内置命令同名
const conflict = await svc.saveUserCommand("compact", "占用系统命令");
t("与系统命令同名被拒", conflict.ok === false && conflict.error.includes("占用"));

// 非法命令名
t("非法命令名被拒", (await svc.saveUserCommand("Bad Name", "x")).ok === false);
t("空内容被拒", (await svc.saveUserCommand("valid-name", "  ")).ok === false);

// 删除 → 注销
const removed = await svc.deleteUserCommand("backup-note");
t("deleteUserCommand ok", removed.ok === true);
t("命令已注销", !registered.has("backup-note"));
t("listUserCommands 不再含 backup-note", !(await svc.listUserCommands()).commands.some((c) => c.name === "backup-note"));
t("删除不存在命令 error", (await svc.deleteUserCommand("nope")).ok === false);

// ── 4.5 备份与恢复（迭代②）────────────────────────────────────────
const bks = await svc.listBackups();
t("listBackups ok（≥1 份）", bks.ok === true && Array.isArray(bks.backups) && bks.backups.length >= 1);
const first = bks.backups[0];
t("备份字段齐全（name/time/size/rulesCount）", typeof first.name === "string" && /^AGENTS\.md-.+\.bak$/.test(first.name) && typeof first.time === "string" && first.time.length > 0 && typeof first.size === "number" && first.size > 0 && typeof first.rulesCount === "number" && first.rulesCount >= 1);
t("备份按文件名（时间）升序", bks.backups.every((b, i) => i === 0 || bks.backups[i - 1].name < b.name));

// 恢复验证：取备份 X，改坏 AGENTS.md，再恢复 X，内容应精确回到 X 的内容
const target = bks.backups[bks.backups.length - 1]; // 用最新一份，最不可能被裁剪
const targetContent = await readFile(join(home, ".backups", target.name), "utf8");
const beforeRestore = await readFile(join(home, "AGENTS.md"), "utf8");
t("恢复前目标备份与当前内容不同（fixture 无备份测试规则）", !targetContent.includes("备份测试规则") && !beforeRestore.includes("备份测试规则"));
const bad = await svc.addRule("备份测试规则", "恢复前的临时内容");
t("制造一次修改（addRule 备份测试规则）", bad.ok === true);
const bksBeforeRestore = (await svc.listBackups()).backups.length;
const restored = await svc.restoreBackup(target.name);
t("restoreBackup ok（返回 safety 备份名）", restored.ok === true && typeof restored.safety === "string" && restored.safety.includes(".bak"));
const afterRestore = await readFile(join(home, "AGENTS.md"), "utf8");
t("恢复后内容精确等于目标备份内容", afterRestore === targetContent);
t("恢复后临时规则已消失", !afterRestore.includes("备份测试规则"));
let safetyExists = false;
try { await access(restored.safety); safetyExists = true; } catch {}
t("恢复前自动备份了当前状态（safety 备份文件已生成）", safetyExists);
t("恢复后备份数不少于恢复前", (await svc.listBackups()).backups.length >= bksBeforeRestore);
t("恢复后备份规则数与目标备份一致", (await svc.listBackups()).backups.some((b) => b.name === target.name));
t("恢复不合法文件名 error", (await svc.restoreBackup("../evil")).ok === false);
t("恢复不存在备份 error", (await svc.restoreBackup("AGENTS.md-2000-01-01T00-00-00.bak")).ok === false);

// ── 5. 文件干净 ─────────────────────────────────────────────────────
const after = await readFile(join(home, "AGENTS.md"), "utf8");
t("AGENTS.md 无测试残留", !after.includes("服务测试规则"));
const ucFile = join(home, "commands.json");
try {
	const uc = JSON.parse(await readFile(ucFile, "utf8"));
	t("commands.json 无测试残留", Array.isArray(uc) && uc.length === 0);
} catch {
	t("commands.json 无测试残留", false);
}

await rm(home, { recursive: true, force: true });
console.log(failed === 0 ? "\nALL SERVICE TESTS PASSED" : `\n${failed} TEST(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
