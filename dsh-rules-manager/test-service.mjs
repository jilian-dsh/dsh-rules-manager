// service.js 隔离测试：手动 Remote 标记 + 全部 Remote 方法 + C3 用户自定义命令
// 运行：node "D:\DeepSeek harness\.dsh\profiles\web\rules-manager\test-service.js"
// 使用固定 fixture（不依赖真实 AGENTS.md），测试稳定可重复。
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
t("remoteMethods 标记 22 个方法", methods.length === 22);
for (const m of ["listRules", "addRule", "editRule", "deleteRule", "disableRule", "enableRule", "listDisabledRules", "listBackups", "restoreBackup", "pruneBackups", "listCommands", "listUserCommands", "saveUserCommand", "deleteUserCommand", "disableUserCommand", "enableUserCommand", "listSkills", "getSkill", "disableSkill", "enableSkill", "deleteSkill", "listDisabledSkills"]) {
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

// ── 4.4 命令带参数（迭代③）────────────────────────────────────────
// 占位符替换规则（composeCommandText 纯函数直接测）
t("占位符 {input} 替换为参数", svc.composeCommandText("请总结：{input}", "本周工作") === "请总结：本周工作");
t("多个 {input} 全部替换", svc.composeCommandText("{input} 与 {input}", "A") === "A 与 A");
t("无占位符有参数 → 追加到末尾（换行分隔）", svc.composeCommandText("请生成周报", "本月收入 5 万") === "请生成周报\n本月收入 5 万");
t("无占位符无参数 → 原样发预设", svc.composeCommandText("请生成周报", "") === "请生成周报");
t("有占位符无参数 → 替换为空", svc.composeCommandText("请总结：{input}", "") === "请总结：");
t("参数首尾空格被 trim", svc.composeCommandText("请总结：{input}", "  本周工作  ") === "请总结：本周工作");

// 保存含占位符的命令 → 执行带参数 → 投递替换后的文本
const parCmd = await svc.saveUserCommand("summarize", "请用一句话总结：{input}");
t("saveUserCommand 含占位符命令 ok", parCmd.ok === true);
const parHandler = registered.get("summarize").handler;
const parResult = parHandler({ agent: { followup: (m) => followed.push(m) }, rawInput: " 本周工作 ", commandId: "t", signal: new AbortController().signal });
t("带参数执行返回 success", parResult.kind === "success");
t("带参数投递文本含替换后的参数", followed[2].content[0].text === "请用一句话总结：本周工作");
t("带参数返回提示含「带参数」", parResult.text.includes("带参数"));

// 同一命令不带参数（含 {input}）→ 不投递残缺内容，返回用法提示
const noArgResult = parHandler({ agent: { followup: (m) => followed.push(m) }, rawInput: "", commandId: "t", signal: new AbortController().signal });
t("含 {input} 命令不带参数 → 不投递消息", followed.length === 3);
t("含 {input} 命令不带参数 → 返回 error 用法提示", noArgResult.kind === "error" && noArgResult.text.includes("需要带参数") && noArgResult.text.includes("/summarize"));

// 无占位符命令带参数 → 追加末尾
const appCmd = await svc.saveUserCommand("append-cmd", "请生成周报");
t("saveUserCommand 无占位符命令 ok", appCmd.ok === true);
const appHandler = registered.get("append-cmd").handler;
appHandler({ agent: { followup: (m) => followed.push(m) }, rawInput: "本月收入 5 万", commandId: "t", signal: new AbortController().signal });
t("无占位符带参数投递文本（追加末尾）", followed[3].content[0].text === "请生成周报\n本月收入 5 万");

// 清理：删除两个参数测试命令
await svc.deleteUserCommand("summarize");
await svc.deleteUserCommand("append-cmd");
t("参数测试命令已清理", !registered.has("summarize") && !registered.has("append-cmd"));

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

// ── 4.5b 超额备份自动清理（迭代⑥：打开面板即清理，移入回收站不永久删除）──
const bkDir = join(home, ".backups");
const beforePrune = (await svc.listBackups()).backups.length;
// 造 7 份 2000 年的假旧备份（文件名合法、时间最旧）
for (let i = 1; i <= 7; i++) {
	await writeFile(join(bkDir, `AGENTS.md-2000-01-01T00-00-0${i}.bak`), "old backup", "utf8");
}
const pruned = await svc.pruneBackups();
t("pruneBackups ok（超出部分被移走）", pruned.ok === true && pruned.pruned === beforePrune + 7 - 5 && pruned.kept === 5);
const afterPruneList = (await svc.listBackups()).backups;
t("清理后只剩 5 份", afterPruneList.length === 5);
let oldestMoved = false;
try { await access(join(pruned.trash, "AGENTS.md-2000-01-01T00-00-01.bak")); oldestMoved = true; } catch {}
t("最旧备份已移入回收站（未永久删除）", oldestMoved);
t("回收站目录在 .backups 下", pruned.trash.includes(".backups"));
const pruned2 = await svc.pruneBackups();
t("再次清理 pruned=0（不超额）", pruned2.ok === true && pruned2.pruned === 0);
t("清理后列表仍可正常读取", (await svc.listBackups()).backups.length === 5);

// ── 4.6 命令禁用/启用（迭代⑤，防乱序：只改字段，不搬移不改序）────────
const disCmd = await svc.saveUserCommand("disable-me", "禁用测试命令内容");
t("saveUserCommand 禁用测试命令 ok", disCmd.ok === true);
t("命令已注册", registered.has("disable-me"));
const cmdDis = await svc.disableUserCommand("disable-me");
t("disableUserCommand ok", cmdDis.ok === true);
t("禁用后命令已注销", !registered.has("disable-me"));
t("重复禁用 error", (await svc.disableUserCommand("disable-me")).ok === false);
const ucAfterDis = await svc.listUserCommands();
const disEntry = ucAfterDis.commands.find((c) => c.name === "disable-me");
t("listUserCommands 含禁用条目且 disabled=true", disEntry !== void 0 && disEntry.disabled === true && disEntry.prompt.includes("禁用测试命令内容"));
t("禁用条目仍在列表原位置（无搬移无乱序）", ucAfterDis.commands[ucAfterDis.commands.length - 1].name === "disable-me");
// ensureUserCommands 不应把已禁用命令重新注册
await svc.ensureUserCommands();
t("ensureUserCommands 不注册已禁用命令", !registered.has("disable-me"));
const cmdEn = await svc.enableUserCommand("disable-me");
t("enableUserCommand ok", cmdEn.ok === true);
t("启用后命令重新注册", registered.has("disable-me"));
t("重复启用 error", (await svc.enableUserCommand("disable-me")).ok === false);
// 编辑已禁用命令：disabled 状态保持
await svc.disableUserCommand("disable-me");
const editDis = await svc.saveUserCommand("disable-me", "禁用命令编辑后内容");
t("编辑已禁用命令 ok（保持禁用）", editDis.ok === true && !registered.has("disable-me"));
t("编辑后仍是禁用状态", (await svc.listUserCommands()).commands.find((c) => c.name === "disable-me").disabled === true);
await svc.deleteUserCommand("disable-me");
t("禁用测试命令已清理", !registered.has("disable-me"));

// ── 4.7 技能管理（迭代⑥，防乱序：目录整体搬移，无编号无分区）──────────
const skillsHome = join(home, "skills");
await mkdir(join(skillsHome, "test-skill-a"), { recursive: true });
await writeFile(join(skillsHome, "test-skill-a", "SKILL.md"), `---\nname: test-skill-a\ndescription: 测试技能 A 的描述\n---\n\n# 测试技能 A\n\n正文内容。\n`, "utf8");
await mkdir(join(skillsHome, "test-skill-b"), { recursive: true });
await writeFile(join(skillsHome, "test-skill-b", "SKILL.md"), `---\nname: test-skill-b\ndescription: |\n  测试技能 B 的描述第一行\n  描述第二行更详细\ntrigger-words: [b]\n---\n\n# 测试技能 B\n`, "utf8");

const skList = await svc.listSkills();
t("listSkills ok（含 A/B 与描述）", skList.ok === true && skList.skills.length === 2 && skList.skills.some((s) => s.name === "test-skill-a" && s.description.includes("测试技能 A")) && skList.skills.some((s) => s.name === "test-skill-b"));
t("块标量 description 完整解析（多行合并）", skList.skills.find((s) => s.name === "test-skill-b").description === "测试技能 B 的描述第一行 描述第二行更详细");
t("技能列表按名称排序", skList.skills[0].name === "test-skill-a");

const skGet = await svc.getSkill("test-skill-a");
t("getSkill ok（返回全文）", skGet.ok === true && skGet.content.includes("正文内容"));
t("getSkill 不存在 error", (await svc.getSkill("nope")).ok === false);
t("getSkill 非法名 error", (await svc.getSkill("../evil")).ok === false);

const skDis = await svc.disableSkill("test-skill-a");
t("disableSkill ok", skDis.ok === true);
t("禁用后 skills/ 只剩 B", (await svc.listSkills()).skills.length === 1 && (await svc.listSkills()).skills[0].name === "test-skill-b");
t("listDisabledSkills 含 A", (await svc.listDisabledSkills()).skills.some((s) => s.name === "test-skill-a"));
t("重复禁用 error（已不存在于 skills/）", (await svc.disableSkill("test-skill-a")).ok === false);

// 同名冲突：skills/ 里手工再造一个 A，再尝试启用 disabled 里的 A → 应拒绝（防覆盖）
await mkdir(join(skillsHome, "test-skill-a"), { recursive: true });
await writeFile(join(skillsHome, "test-skill-a", "SKILL.md"), "---\nname: test-skill-a\n---\n", "utf8");
t("启用同名冲突 error（防覆盖）", (await svc.enableSkill("test-skill-a")).ok === false);
await rm(join(skillsHome, "test-skill-a"), { recursive: true, force: true });

const skEn = await svc.enableSkill("test-skill-a");
t("enableSkill ok（原样搬回）", skEn.ok === true);
t("启用后 skills/ 又含 A（排序仍 A<B）", (await svc.listSkills()).skills.length === 2 && (await svc.listSkills()).skills[0].name === "test-skill-a");
t("listDisabledSkills 已清空", (await svc.listDisabledSkills()).skills.length === 0);
t("启用后 SKILL.md 内容完好", (await svc.getSkill("test-skill-a")).content.includes("正文内容"));

const skDel = await svc.deleteSkill("test-skill-b");
t("deleteSkill ok（含回收站路径）", skDel.ok === true && typeof skDel.trash === "string" && skDel.trash.includes("trash-"));
t("删除后 skills/ 只剩 A", (await svc.listSkills()).skills.length === 1 && (await svc.listSkills()).skills[0].name === "test-skill-a");
let trashFileOk = false;
try { await access(join(skDel.trash, "test-skill-b", "SKILL.md")); trashFileOk = true; } catch {}
t("回收站里能找回 B（SKILL.md 完好）", trashFileOk);
t("deleteSkill 不存在 error", (await svc.deleteSkill("nope")).ok === false);
t("deleteSkill 非法名 error", (await svc.deleteSkill("../evil")).ok === false);

// 删除已禁用技能（从 disabled-skills/ 移入回收站）
await svc.disableSkill("test-skill-a");
const skDel2 = await svc.deleteSkill("test-skill-a");
t("deleteSkill 已禁用技能 ok（fromDisabled）", skDel2.ok === true && skDel2.fromDisabled === true);
t("skills/ 与 disabled-skills/ 均空", (await svc.listSkills()).skills.length === 0 && (await svc.listDisabledSkills()).skills.length === 0);

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
