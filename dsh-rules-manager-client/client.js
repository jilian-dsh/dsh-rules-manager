// rules-manager-client —— 浏览器 bundle（设置页"命令与规则"面板）
// 手写 bundle：window.__ModuleLoader__.load({ id, factory })，CJS factory。
// 结构：
//   1) TYPERT_REMOTE 贡献：把 host 端 rulesManager 服务挂到 ctx.remote（schema 用 passthrough）
//   2) RulesCommandsPanel：设置页 settings.section 面板（规则可视化编辑 + 命令清单 + 自定义命令）
//   3) apply：先 $mount 贡献，再用 ctx.get() 取服务实例注入组件（绕开 Cordis 代理守卫）
window.__ModuleLoader__.load({
	id: "rules-manager-client",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let { useState, useEffect, useCallback } = react;

		// ── 1. Remote 贡献：rulesManager 服务（client 端调用面）──────────────
		// schema 用 passthrough：client 侧只做传输，不做强校验（host 端是权威）。
		const passthrough = { parse: (v) => v };
		const TYPERT_REMOTE = {
			package: "rules-manager",
			descriptors: [
				{
					id: "rules-manager#rulesManager/listRules",
					service: "rulesManager",
					namespace: "rulesManager",
					method: "listRules",
					invocation: { kind: "direct" },
					parameters: [],
					result: { mode: "strict", typeSymbol: "rules-manager#rulesManager/listRules:result", schema: passthrough },
					sourceLocation: { file: "profiles/rules-manager/service.js", line: 30, column: 1 }
				},
				{
					id: "rules-manager#rulesManager/addRule",
					service: "rulesManager",
					namespace: "rulesManager",
					method: "addRule",
					invocation: { kind: "direct" },
					parameters: [
						{ name: "title", wire: "title", source: "json", codec: { mode: "strict", typeSymbol: "rules-manager#rulesManager/addRule:title", schema: passthrough } },
						{ name: "body", wire: "body", source: "json", codec: { mode: "strict", typeSymbol: "rules-manager#rulesManager/addRule:body", schema: passthrough } }
					],
					result: { mode: "strict", typeSymbol: "rules-manager#rulesManager/addRule:result", schema: passthrough },
					sourceLocation: { file: "profiles/rules-manager/service.js", line: 36, column: 1 }
				},
				{
					id: "rules-manager#rulesManager/editRule",
					service: "rulesManager",
					namespace: "rulesManager",
					method: "editRule",
					invocation: { kind: "direct" },
					parameters: [
						{ name: "index", wire: "index", source: "json", codec: { mode: "strict", typeSymbol: "rules-manager#rulesManager/editRule:index", schema: passthrough } },
						{ name: "body", wire: "body", source: "json", codec: { mode: "strict", typeSymbol: "rules-manager#rulesManager/editRule:body", schema: passthrough } }
					],
					result: { mode: "strict", typeSymbol: "rules-manager#rulesManager/editRule:result", schema: passthrough },
					sourceLocation: { file: "profiles/rules-manager/service.js", line: 44, column: 1 }
				},
				{
					id: "rules-manager#rulesManager/deleteRule",
					service: "rulesManager",
					namespace: "rulesManager",
					method: "deleteRule",
					invocation: { kind: "direct" },
					parameters: [
						{ name: "index", wire: "index", source: "json", codec: { mode: "strict", typeSymbol: "rules-manager#rulesManager/deleteRule:index", schema: passthrough } }
					],
					result: { mode: "strict", typeSymbol: "rules-manager#rulesManager/deleteRule:result", schema: passthrough },
					sourceLocation: { file: "profiles/rules-manager/service.js", line: 52, column: 1 }
				},
				{
					id: "rules-manager#rulesManager/listCommands",
					service: "rulesManager",
					namespace: "rulesManager",
					method: "listCommands",
					invocation: { kind: "direct" },
					parameters: [],
					result: { mode: "strict", typeSymbol: "rules-manager#rulesManager/listCommands:result", schema: passthrough },
					sourceLocation: { file: "profiles/rules-manager/service.js", line: 60, column: 1 }
				},
				{
					id: "rules-manager#rulesManager/listUserCommands",
					service: "rulesManager",
					namespace: "rulesManager",
					method: "listUserCommands",
					invocation: { kind: "direct" },
					parameters: [],
					result: { mode: "strict", typeSymbol: "rules-manager#rulesManager/listUserCommands:result", schema: passthrough },
					sourceLocation: { file: "profiles/rules-manager/service.js", line: 68, column: 1 }
				},
				{
					id: "rules-manager#rulesManager/saveUserCommand",
					service: "rulesManager",
					namespace: "rulesManager",
					method: "saveUserCommand",
					invocation: { kind: "direct" },
					parameters: [
						{ name: "name", wire: "name", source: "json", codec: { mode: "strict", typeSymbol: "rules-manager#rulesManager/saveUserCommand:name", schema: passthrough } },
						{ name: "prompt", wire: "prompt", source: "json", codec: { mode: "strict", typeSymbol: "rules-manager#rulesManager/saveUserCommand:prompt", schema: passthrough } }
					],
					result: { mode: "strict", typeSymbol: "rules-manager#rulesManager/saveUserCommand:result", schema: passthrough },
					sourceLocation: { file: "profiles/rules-manager/service.js", line: 76, column: 1 }
				},
				{
					id: "rules-manager#rulesManager/deleteUserCommand",
					service: "rulesManager",
					namespace: "rulesManager",
					method: "deleteUserCommand",
					invocation: { kind: "direct" },
					parameters: [
						{ name: "name", wire: "name", source: "json", codec: { mode: "strict", typeSymbol: "rules-manager#rulesManager/deleteUserCommand:name", schema: passthrough } }
					],
					result: { mode: "strict", typeSymbol: "rules-manager#rulesManager/deleteUserCommand:result", schema: passthrough },
					sourceLocation: { file: "profiles/rules-manager/service.js", line: 84, column: 1 }
				}
			]
		};

		// ── 2. 面板组件（React，内联样式，中文界面）──────────────────────────
		const s = {
			wrap: { display: "flex", flexDirection: "column", gap: "12px", width: "100%", boxSizing: "border-box" },
			header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" },
			title: { fontSize: "15px", fontWeight: 600, color: "var(--dsw-alias-label-primary, #1f2329)" },
			sub: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #8a919f)", lineHeight: "18px" },
			tabs: { display: "flex", gap: "8px", borderBottom: "1px solid var(--dsw-alias-border-1, #e8eaee)", paddingBottom: "8px" },
			tab: { padding: "6px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", background: "transparent", color: "var(--dsw-alias-label-secondary, #4e5969)" },
			tabActive: { padding: "6px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", background: "var(--dsw-alias-interactive-bg-active, #e8f3ff)", color: "var(--dsw-alias-brand-6, #3370ff)" },
			groupTitle: { fontSize: "13px", fontWeight: 600, margin: "12px 0 6px", color: "var(--dsw-alias-label-primary, #1f2329)" },
			card: { border: "1px solid var(--dsw-alias-border-1, #e8eaee)", borderRadius: "10px", padding: "10px 12px", marginBottom: "8px", background: "var(--dsw-alias-bg-layer-1, #ffffff)" },
			cardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
			cardTitle: { fontSize: "13px", fontWeight: 600, color: "var(--dsw-alias-label-primary, #1f2329)" },
			cardBody: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #4e5969)", whiteSpace: "pre-wrap", lineHeight: "20px", margin: "6px 0 0", wordBreak: "break-word" },
			btn: { padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-2, #d5d9e0)", background: "transparent", cursor: "pointer", fontSize: "12px", color: "var(--dsw-alias-label-secondary, #4e5969)" },
			btnPrimary: { padding: "4px 10px", borderRadius: "6px", border: "none", background: "var(--dsw-alias-brand-6, #3370ff)", color: "#fff", cursor: "pointer", fontSize: "12px" },
			btnDanger: { padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--dsw-alias-danger-5, #f53f3f)", background: "transparent", color: "var(--dsw-alias-danger-5, #f53f3f)", cursor: "pointer", fontSize: "12px" },
			input: { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-2, #d5d9e0)", fontSize: "12px", background: "var(--dsw-alias-bg-layer-1, #fff)", color: "var(--dsw-alias-label-primary, #1f2329)", fontFamily: "inherit" },
			textarea: { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-2, #d5d9e0)", fontSize: "12px", minHeight: "90px", resize: "vertical", background: "var(--dsw-alias-bg-layer-1, #fff)", color: "var(--dsw-alias-label-primary, #1f2329)", fontFamily: "inherit", lineHeight: "20px" },
			msg: { fontSize: "12px", color: "var(--dsw-alias-success-6, #00b42a)" },
			msgErr: { fontSize: "12px", color: "var(--dsw-alias-danger-5, #f53f3f)" },
			empty: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #8a919f)", padding: "12px 0", textAlign: "center" },
			row: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", borderRadius: "8px", fontSize: "13px", borderBottom: "1px solid var(--dsw-alias-border-1, #e8eaee)" },
			cmdName: { fontWeight: 600, color: "var(--dsw-alias-brand-6, #3370ff)", minWidth: "90px" },
			cmdDesc: { flex: 1, color: "var(--dsw-alias-label-secondary, #4e5969)", fontSize: "12px" },
			cmdHint: { color: "var(--dsw-alias-label-tertiary, #8a919f)", fontSize: "12px", fontFamily: "monospace" }
		};

		/** 解包 RPC 信封：client 端 Remote 方法返回 {ok, value}，value 才是 host 返回值 */
		const unwrap = (res) => (res && res.value !== void 0 ? res.value : res);

		function RulesCommandsPanel(props) {
			// props.rulesApi = rulesManager 服务实例（apply 里 ctx.get() 取得，普通对象，无代理守卫）
			const rulesApi = props.rulesApi;
			const [tab, setTab] = useState("rules");
			// 规则
			const [rules, setRules] = useState(null);
			const [rulesError, setRulesError] = useState("");
			const [editing, setEditing] = useState(null);
			const [editBody, setEditBody] = useState("");
			const [showAdd, setShowAdd] = useState(false);
			const [newTitle, setNewTitle] = useState("");
			const [newBody, setNewBody] = useState("");
			const [message, setMessage] = useState("");
			// 命令清单
			const [commands, setCommands] = useState(null);
			const [cmdError, setCmdError] = useState("");
			// 自定义命令
			const [userCmds, setUserCmds] = useState(null);
			const [ucError, setUcError] = useState("");
			const [ucShowAdd, setUcShowAdd] = useState(false);
			const [ucNewName, setUcNewName] = useState("");
			const [ucNewPrompt, setUcNewPrompt] = useState("");
			const [ucEditing, setUcEditing] = useState(null);
			const [ucEditPrompt, setUcEditPrompt] = useState("");
			const [ucMessage, setUcMessage] = useState("");

			const refresh = useCallback(async () => {
				try {
					const res = await rulesApi.listRules();
					const data = unwrap(res);
					if (data && data.ok) {
						setRules(data.rules);
						setRulesError("");
					} else setRulesError((data && data.error) || "未知错误");
				} catch (e) {
					setRulesError(String((e && e.message) || e));
				}
			}, [rulesApi]);
			useEffect(() => { refresh(); }, [refresh]);

			const loadCommands = useCallback(async () => {
				try {
					const res = await rulesApi.listCommands();
					const data = unwrap(res);
					if (data && data.ok) {
						setCommands(data.commands);
						setCmdError("");
					} else setCmdError((data && data.error) || "未知错误");
				} catch (e) {
					setCmdError(String((e && e.message) || e));
				}
			}, [rulesApi]);
			useEffect(() => {
				if (tab === "commands" && commands === null) loadCommands();
			}, [tab, commands, loadCommands]);

			const loadUserCommands = useCallback(async () => {
				try {
					const res = await rulesApi.listUserCommands();
					const data = unwrap(res);
					if (data && data.ok) {
						setUserCmds(data.commands);
						setUcError("");
					} else setUcError((data && data.error) || "未知错误");
				} catch (e) {
					setUcError(String((e && e.message) || e));
				}
			}, [rulesApi]);
			useEffect(() => {
				if (tab === "uc" && userCmds === null) loadUserCommands();
			}, [tab, userCmds, loadUserCommands]);

			const doEdit = (rule) => {
				setEditing(rule.index);
				setEditBody(rule.body);
			};
			const doSaveEdit = async () => {
				try {
					const res = await rulesApi.editRule(editing, editBody);
					const data = unwrap(res);
					setMessage(data && data.ok ? `已修改规则 ${editing}` : `出错了：${(data && data.error) || "未知错误"}`);
				} catch (e) {
					setMessage(`出错了：${String((e && e.message) || e)}`);
				}
				setEditing(null);
				refresh();
			};
			const doDelete = async (index) => {
				if (!window.confirm(`确定删除规则 ${index} 吗？删除前会自动备份到 ~/.dsh/.backups/，删除后编号不复用。`)) return;
				try {
					const res = await rulesApi.deleteRule(index);
					const data = unwrap(res);
					setMessage(data && data.ok ? `已删除规则 ${index}` : `出错了：${(data && data.error) || "未知错误"}`);
				} catch (e) {
					setMessage(`出错了：${String((e && e.message) || e)}`);
				}
				refresh();
			};
			const doAdd = async () => {
				try {
					const res = await rulesApi.addRule(newTitle, newBody);
					const data = unwrap(res);
					if (data && data.ok) {
						setMessage(`已新增规则 ${data.rule.index}，已写入 AGENTS.md 并实时生效`);
						setNewTitle("");
						setNewBody("");
						setShowAdd(false);
					} else setMessage(`出错了：${(data && data.error) || "未知错误"}`);
				} catch (e) {
					setMessage(`出错了：${String((e && e.message) || e)}`);
				}
				refresh();
			};

			const doSaveUserCommand = async () => {
				try {
					const res = await rulesApi.saveUserCommand(ucNewName, ucNewPrompt);
					const data = unwrap(res);
					if (data && data.ok) {
						setUcMessage(`已保存命令 /${data.command.name}（在聊天框输入即可使用）`);
						setUcNewName("");
						setUcNewPrompt("");
						setUcShowAdd(false);
					} else setUcMessage(`出错了：${(data && data.error) || "未知错误"}`);
				} catch (e) {
					setUcMessage(`出错了：${String((e && e.message) || e)}`);
				}
				loadUserCommands();
			};
			const doEditUserCommand = (cmd) => {
				setUcEditing(cmd.name);
				setUcEditPrompt(cmd.prompt);
			};
			const doSaveUserCommandEdit = async () => {
				try {
					const res = await rulesApi.saveUserCommand(ucEditing, ucEditPrompt);
					const data = unwrap(res);
					setUcMessage(data && data.ok ? `已更新命令 /${ucEditing}` : `出错了：${(data && data.error) || "未知错误"}`);
				} catch (e) {
					setUcMessage(`出错了：${String((e && e.message) || e)}`);
				}
				setUcEditing(null);
				loadUserCommands();
			};
			const doDeleteUserCommand = async (name) => {
				if (!window.confirm(`确定删除自定义命令 /${name} 吗？`)) return;
				try {
					const res = await rulesApi.deleteUserCommand(name);
					const data = unwrap(res);
					setUcMessage(data && data.ok ? `已删除命令 /${name}` : `出错了：${(data && data.error) || "未知错误"}`);
				} catch (e) {
					setUcMessage(`出错了：${String((e && e.message) || e)}`);
				}
				loadUserCommands();
			};

			// 按分区分组
			const groups = [];
			if (rules) {
				const map = new Map();
				for (const r of rules) {
					const list = map.get(r.section) ?? [];
					list.push(r);
					map.set(r.section, list);
				}
				for (const [section, list] of map) groups.push({ section, list });
			}

			return react.createElement("div", { style: s.wrap },
				react.createElement("div", { style: s.header },
					react.createElement("div", null,
						react.createElement("div", { style: s.title }, "命令与规则"),
						react.createElement("div", { style: s.sub }, "可视化编辑用户全局规则（AGENTS.md，保存即生效，自动备份）；查看斜杠命令；创建你自己的自定义命令。")
					)
				),
				react.createElement("div", { style: s.tabs },
					react.createElement("button", { style: tab === "rules" ? s.tabActive : s.tab, onClick: () => setTab("rules") }, "规则"),
					react.createElement("button", { style: tab === "commands" ? s.tabActive : s.tab, onClick: () => setTab("commands") }, "命令"),
					react.createElement("button", { style: tab === "uc" ? s.tabActive : s.tab, onClick: () => setTab("uc") }, "自定义命令")
				),
				message ? react.createElement("div", { style: s.msg }, message) : null,
				tab === "rules" ? renderRules() : tab === "commands" ? renderCommands() : renderUserCommands()
			);

			function renderRules() {
				if (rules === null && !rulesError) return react.createElement("div", { style: s.empty }, "加载中…");
				if (rulesError) return react.createElement("div", { style: s.msgErr }, `加载失败：${rulesError}`);
				return react.createElement("div", null,
					react.createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: "8px" } },
						react.createElement("button", { style: s.btnPrimary, onClick: () => setShowAdd(!showAdd) }, showAdd ? "收起新增" : "＋ 新增规则")
					),
					showAdd ? react.createElement("div", { style: s.card },
						react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
							react.createElement("input", { style: s.input, placeholder: "规则标题（例如：每周备份提醒）", value: newTitle, onChange: (e) => setNewTitle(e.target.value) }),
							react.createElement("textarea", { style: s.textarea, placeholder: "规则正文…", value: newBody, onChange: (e) => setNewBody(e.target.value) }),
							react.createElement("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
								react.createElement("button", { style: s.btnPrimary, onClick: doAdd }, "保存新规则")
							)
						)
					) : null,
					groups.length === 0 ? react.createElement("div", { style: s.empty }, "尚未发现规则") : null,
					groups.map((g) => react.createElement("div", { key: g.section },
						react.createElement("div", { style: s.groupTitle }, g.section),
						g.list.map((rule) => react.createElement("div", { key: rule.index, style: s.card },
							react.createElement("div", { style: s.cardHead },
								react.createElement("div", { style: s.cardTitle }, `[${rule.index}] ${rule.title}`),
								react.createElement("div", { style: { display: "flex", gap: "6px" } },
									editing === rule.index
										? react.createElement("button", { style: s.btnPrimary, onClick: doSaveEdit }, "保存")
										: react.createElement("button", { style: s.btn, onClick: () => doEdit(rule) }, "编辑"),
									editing === rule.index
										? react.createElement("button", { style: s.btn, onClick: () => setEditing(null) }, "取消")
										: react.createElement("button", { style: s.btnDanger, onClick: () => doDelete(rule.index) }, "删除")
								)
							),
							editing === rule.index
								? react.createElement("textarea", { style: { ...s.textarea, marginTop: "8px" }, value: editBody, onChange: (e) => setEditBody(e.target.value) })
								: react.createElement("div", { style: s.cardBody }, rule.body)
						))
					))
				);
			}

			function renderCommands() {
				if (commands === null && !cmdError) return react.createElement("div", { style: s.empty }, "加载中…");
				if (cmdError) return react.createElement("div", { style: s.msgErr }, `加载失败：${cmdError}`);
				if (commands.length === 0) return react.createElement("div", { style: s.empty }, "暂无可用命令");
				return react.createElement("div", null,
					react.createElement("div", { style: { ...s.sub, marginBottom: "8px" } }, `共 ${commands.length} 个可用命令（由各插件注册，仅只读展示）`),
					commands.map((c) => react.createElement("div", { key: c.name, style: s.row },
						react.createElement("div", { style: s.cmdName }, `/${c.name}`),
						react.createElement("div", { style: s.cmdDesc }, c.description),
						c.hint ? react.createElement("div", { style: s.cmdHint }, c.hint) : null
					))
				);
			}

			function renderUserCommands() {
				if (userCmds === null && !ucError) return react.createElement("div", { style: s.empty }, "加载中…");
				if (ucError) return react.createElement("div", { style: s.msgErr }, `加载失败：${ucError}`);
				return react.createElement("div", null,
					ucMessage ? react.createElement("div", { style: s.msg, marginBottom: "8px" }, ucMessage) : null,
					react.createElement("div", { style: s.sub, marginBottom: "8px" }, "自定义命令 = 你自己定义的快捷指令：在聊天框输入 /命令名，即可把预设内容发送给 AI。命令名只能用小写字母、数字、连字符或下划线（例如 weekly-report）。"),
					react.createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: "8px" } },
						react.createElement("button", { style: s.btnPrimary, onClick: () => setUcShowAdd(!ucShowAdd) }, ucShowAdd ? "收起新增" : "＋ 新增命令")
					),
					ucShowAdd ? react.createElement("div", { style: s.card },
						react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
							react.createElement("input", { style: s.input, placeholder: "命令名（例如 weekly-report，不用带 /）", value: ucNewName, onChange: (e) => setUcNewName(e.target.value) }),
							react.createElement("textarea", { style: s.textarea, placeholder: "发送给 AI 的预设内容（例如：请帮我总结本周工作进展…）", value: ucNewPrompt, onChange: (e) => setUcNewPrompt(e.target.value) }),
							react.createElement("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
								react.createElement("button", { style: s.btnPrimary, onClick: doSaveUserCommand }, "保存命令")
							)
						)
					) : null,
					(userCmds || []).length === 0 ? react.createElement("div", { style: s.empty }, "还没有自定义命令，点「＋ 新增命令」创建一个") : null,
					(userCmds || []).map((cmd) => react.createElement("div", { key: cmd.name, style: s.card },
						react.createElement("div", { style: s.cardHead },
							react.createElement("div", { style: s.cardTitle }, `/${cmd.name}`),
							react.createElement("div", { style: { display: "flex", gap: "6px" } },
								ucEditing === cmd.name
									? react.createElement("button", { style: s.btnPrimary, onClick: doSaveUserCommandEdit }, "保存")
									: react.createElement("button", { style: s.btn, onClick: () => doEditUserCommand(cmd) }, "编辑"),
								ucEditing === cmd.name
									? react.createElement("button", { style: s.btn, onClick: () => setUcEditing(null) }, "取消")
									: react.createElement("button", { style: s.btnDanger, onClick: () => doDeleteUserCommand(cmd.name) }, "删除")
							)
						),
						ucEditing === cmd.name
							? react.createElement("textarea", { style: { ...s.textarea, marginTop: "8px" }, value: ucEditPrompt, onChange: (e) => setUcEditPrompt(e.target.value) })
							: react.createElement("div", { style: s.cardBody }, cmd.prompt)
					))
				);
			}
		}

		// ── 3. apply：先挂 Remote 贡献，再用 ctx.get() 取服务实例注入组件 ─────
		const inject = ["slots", "remote"];

		async function apply(ctx) {
			await ctx.remote.$mount(TYPERT_REMOTE);
			// ctx.get 走内部服务表（不经 Proxy 属性守卫），拿到 rulesManager 服务实例；
			// 以普通对象注入组件 props，避免组件内访问 ctx.remote.<svc> 触发 "without inject"。
			const rulesApi = ctx.get("remote.rulesManager");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "rules-commands",
				order: 100,
				label: () => "命令与规则",
				inject: () => ({ rulesApi })
			}, RulesCommandsPanel));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
