// rules-manager 本地隔离测试（不触碰真实 AGENTS.md）
// 用临时 DSH_HOME + 固定 fixture，端到端测试 /rules 命令全部功能。
// 运行：node "D:\DeepSeek harness\.dsh\profiles\web\rules-manager\test-local.js"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = await mkdtemp(join(tmpdir(), "rules-test-"));
process.env.DSH_HOME = home;
// 固定测试夹具（3 条规则 + 分区）
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

const mod = await import("./index.js");
const registered = [];
const ctx = {
  effect: (gen) => {
    const it = gen();
    const step = it.next();
    if (!step.done && typeof step.value === "function") step.value();
  },
  commands: {
    register: (def) => {
      registered.push(def);
      return () => {};
    },
  },
};
mod.apply(ctx);
const cmd = registered[0];
const invoke = (rawInput) =>
  cmd.handler({ rawInput, agent: {}, commandId: "t", signal: new AbortController().signal });

let failed = 0;
const t = (name, cond) => {
  console.log((cond ? "PASS" : "FAIL") + " - " + name);
  if (!cond) failed++;
};

// 1. list
const list = await invoke("");
t("list: success", list.kind === "success");
t("list: 共 3 条规则", /共 3 条规则/.test(list.text));
t("list: 含规则三标题", list.text.includes("规则三标题"));

// 2. show
const show = await invoke("show 2");
t("show 2: success", show.kind === "success" && /【规则 2】规则二标题/.test(show.text));

// 3. add（追加规则 4，自动编号 + 来源标注 + 备份；P1-5：自动补执行等级 D）
const add = await invoke("add 测试规则｜这是一条测试规则正文");
t("add: success", add.kind === "success" && add.text.includes("【规则 4】测试规则"));
const afterAdd = await readFile(join(home, "AGENTS.md"), "utf8");
t("add: 已写入文件", afterAdd.includes("### [规则 4] 测试规则（执行等级：D）（来源：/rules 命令"));
t("add: 备份目录已生成", add.text.includes(".backups"));
t("add: 未声明等级默认补 D 级提示", add.text.includes("默认补 D 级"));
t("add: 文件含执行等级 D", afterAdd.includes("测试规则（执行等级：D）"));

// 4. edit
const edit = await invoke("edit 4 修改后的正文内容");
t("edit: success", edit.kind === "success");
const afterEdit = await readFile(join(home, "AGENTS.md"), "utf8");
t("edit: 正文已替换", afterEdit.includes("修改后的正文内容") && !afterEdit.includes("这是一条测试规则正文"));

// 5. delete
const del = await invoke("delete 4");
t("delete: success", del.kind === "success");
const afterDel = await readFile(join(home, "AGENTS.md"), "utf8");
t("delete: 已删除", !afterDel.includes("### [规则 4] 测试规则") && !afterDel.includes("修改后的正文内容"));

// 6. 边界
const bad = await invoke("show 99");
t("show 99: error", bad.kind === "error" && bad.text.includes("没有编号 99"));
const usage = await invoke("乱写的命令");
t("invalid: 显示用法", usage.kind === "error" && usage.text.includes("用法"));
const addBad = await invoke("add 只有标题没有正文");
t("add 缺分隔符: error", addBad.kind === "error");

// 7. 原文件完整性（增删改后其余规则仍在）
t("规则 1 仍在", afterDel.includes("### [规则 1] 规则一标题"));
t("规则 3 仍在", afterDel.includes("### [规则 3] 规则三标题"));

// 8. 自由区域测试（独立 fixture：free-zone 区 + 区内 F 规则）
const FIXTURE_FREE = `# 测试规则（free-zone fixture）

## 一、通用行为

### [规则 1] 规则一标题（来源 test-1）
规则一正文内容。

## 五、自由区域（引擎不强制，正常生效）

<!-- free-zone:start -->

### [规则 F1] 中国法律工作守则
任务涉及中国法律实务时：
- 所有法律输出均为律师审查草稿。

<!-- free-zone:end -->
`;
await writeFile(join(home, "AGENTS.md"), FIXTURE_FREE, "utf8");

const list2 = await invoke("");
t("free: list 含 F1", list2.kind === "success" && list2.text.includes("F1"));
t("free: list 含自由区域分区", list2.text.includes("自由区域"));

// add：新规则应插入在 free-zone:start 之前，不进自由区
const add2 = await invoke("add 新规则｜新规则正文");
t("free: add 成功", add2.kind === "success");
const afterAdd2 = await readFile(join(home, "AGENTS.md"), "utf8");
const zoneIdx = afterAdd2.indexOf("free-zone:start");
const newRuleIdx = afterAdd2.indexOf("### [规则 2] 新规则");
t("free: 新规则在自由区之前", newRuleIdx !== -1 && newRuleIdx < zoneIdx);

// edit F1
const editF1 = await invoke("edit F1 修改后的守则正文");
t("free: edit F1 成功", editF1.kind === "success");
const afterEditF1 = await readFile(join(home, "AGENTS.md"), "utf8");
t("free: F1 正文已改", afterEditF1.includes("修改后的守则正文"));

// delete F1
const delF1 = await invoke("delete F1");
t("free: delete F1 成功", delF1.kind === "success");
const afterDelF1 = await readFile(join(home, "AGENTS.md"), "utf8");
t("free: F1 已删除", !afterDelF1.includes("### [规则 F1]"));

// 9. P1-5：标题已声明执行等级时不再追加默认等级
await writeFile(join(home, "AGENTS.md"), FIXTURE, "utf8");
const addLevel = await invoke("add 硬拦规则（执行等级：A）｜这是一条 A 级规则正文");
t("p1-5: 自带等级 add 成功", addLevel.kind === "success");
const afterAddLevel = await readFile(join(home, "AGENTS.md"), "utf8");
t("p1-5: 保留原等级不重复补", afterAddLevel.includes("### [规则 4] 硬拦规则（执行等级：A）（来源：/rules 命令"));
t("p1-5: 自带等级无默认提示", !addLevel.text.includes("默认补 D 级"));

// 10. 规则体检（只读命令）
const health = await invoke("health");
t("health: success", health.kind === "success");
t("health: 规则总数 4", health.text.includes("规则总数：4"));
t("health: 缺失执行等级提示", health.text.includes("缺失执行等级：3"));
t("health: 含分区统计", health.text.includes("【分区】"));

await rm(home, { recursive: true, force: true });
console.log(failed === 0 ? "\nALL TESTS PASSED" : `\n${failed} TEST(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
