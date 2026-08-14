// rules-manager 本地隔离测试（不触碰真实 AGENTS.md）
// 用临时 DSH_HOME + 复制的 AGENTS.md 副本，端到端测试 /rules 命令全部功能。
// 运行：node "D:\DeepSeek harness\.dsh\profiles\web\rules-manager\test-local.js"
import { mkdtemp, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = await mkdtemp(join(tmpdir(), "rules-test-"));
process.env.DSH_HOME = home;
await copyFile("D:/DeepSeek harness/.dsh/AGENTS.md", join(home, "AGENTS.md"));

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
t("list: 共 17 条规则", /共 17 条规则/.test(list.text));
t("list: 含规则 17 压缩建议", list.text.includes("压缩建议"));

// 2. show
const show = await invoke("show 2");
t("show 2: success", show.kind === "success" && /【规则 2】时间信息须真实/.test(show.text));

// 3. add（追加规则 18，自动编号 + 来源标注 + 备份）
const add = await invoke("add 测试规则｜这是一条测试规则正文");
t("add: success", add.kind === "success" && add.text.includes("【规则 18】测试规则"));
const afterAdd = await readFile(join(home, "AGENTS.md"), "utf8");
t("add: 已写入文件", afterAdd.includes("### [规则 18] 测试规则（来源：/rules 命令"));
t("add: 备份目录已生成", add.text.includes(".backups"));

// 4. edit
const edit = await invoke("edit 18 修改后的正文内容");
t("edit: success", edit.kind === "success");
const afterEdit = await readFile(join(home, "AGENTS.md"), "utf8");
t("edit: 正文已替换", afterEdit.includes("修改后的正文内容") && !afterEdit.includes("这是一条测试规则正文"));

// 5. delete
const del = await invoke("delete 18");
t("delete: success", del.kind === "success");
const afterDel = await readFile(join(home, "AGENTS.md"), "utf8");
t("delete: 已删除", !afterDel.includes("测试规则") && !afterDel.includes("修改后的正文内容"));

// 6. 边界
const bad = await invoke("show 99");
t("show 99: error", bad.kind === "error" && bad.text.includes("没有编号 99"));
const usage = await invoke("乱写的命令");
t("invalid: 显示用法", usage.kind === "error" && usage.text.includes("用法"));
const addBad = await invoke("add 只有标题没有正文");
t("add 缺分隔符: error", addBad.kind === "error");

// 7. 原文件完整性（增删改后其余规则仍在）
t("规则 1 仍在", afterDel.includes("### [规则 1] 异常处理"));
t("规则 17 仍在", afterDel.includes("### [规则 17] 压缩建议"));

await rm(home, { recursive: true, force: true });
console.log(failed === 0 ? "\nALL TESTS PASSED" : `\n${failed} TEST(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
