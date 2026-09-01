// dsh-rule-engine-client —— 浏览器 bundle（回合末裁决卡片 + 判例登记）
// 挂载点：conversation.chat.assistant-actions（list，可共存；官方 feedback=10，本卡片=20）
// UI 范式：官方 message-feedback 的 note popover 同源——
//   默认折叠为一行小按钮（不占操作行空间）；
//   点开 = position:fixed 面板（脱离列 overflow clip），向上展开（下缘不低于对话框），
//   clamp 视口左右 12px，z-index 1100 与官方菜单同级。
window.__ModuleLoader__.load({
	id: "dsh-rule-engine-client",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let { useState, useEffect, useCallback, useRef } = react;

		// ── 1. Remote 贡献（host 面权威；client 只做传输）──────────────
		const passthrough = { parse: (v) => v };
		const TYPERT_REMOTE = {
			package: "rule-engine",
			descriptors: [
				{
					id: "rule-engine#ruleEngine/getTurnCard",
					service: "ruleEngine",
					namespace: "ruleEngine",
					method: "getTurnCard",
					invocation: { kind: "direct" },
					parameters: [
						{ name: "messageId", wire: "messageId", source: "json", codec: { mode: "strict", typeSymbol: "rule-engine#ruleEngine/getTurnCard:messageId", schema: passthrough } }
					],
					result: { mode: "strict", typeSymbol: "rule-engine#ruleEngine/getTurnCard:result", schema: passthrough },
					sourceLocation: { file: "dsh-rule-engine/lib/service.js", line: 1, column: 1 }
				},
				{
					id: "rule-engine#ruleEngine/rateTurnCard",
					service: "ruleEngine",
					namespace: "ruleEngine",
					method: "rateTurnCard",
					invocation: { kind: "direct" },
					parameters: [
						{ name: "messageId", wire: "messageId", source: "json", codec: { mode: "strict", typeSymbol: "rule-engine#ruleEngine/rateTurnCard:messageId", schema: passthrough } },
						{ name: "verdict", wire: "verdict", source: "json", codec: { mode: "strict", typeSymbol: "rule-engine#ruleEngine/rateTurnCard:verdict", schema: passthrough } },
						{ name: "expectedVerdict", wire: "expectedVerdict", source: "json", codec: { mode: "strict", typeSymbol: "rule-engine#ruleEngine/rateTurnCard:expectedVerdict", schema: passthrough } },
						{ name: "blockIndex", wire: "blockIndex", source: "json", codec: { mode: "strict", typeSymbol: "rule-engine#ruleEngine/rateTurnCard:blockIndex", schema: passthrough } }
					],
					result: { mode: "strict", typeSymbol: "rule-engine#ruleEngine/rateTurnCard:result", schema: passthrough },
					sourceLocation: { file: "dsh-rule-engine/lib/service.js", line: 1, column: 1 }
				}
			]
		};

		/** 解包 RPC 信封：client 端 Remote 方法返回 {ok, value}，value 才是 host 返回值 */
		const unwrap = (res) => (res && res.value !== undefined ? res.value : res);

		// ── 2. 回合末裁决卡片组件（assistant-actions 槽位）─────────────
		// props：owner 的 messageId + inject 注入的 cardApi（remote.ruleEngine 服务实例）
		function TurnCardAction(props) {
			const messageId = props.messageId;
			const cardApi = props.cardApi;
			const [card, setCard] = useState(null);
			const [state, setState] = useState("loading"); // loading | ready | none | error
			const [busy, setBusy] = useState(false);
			const [open, setOpen] = useState(false); // 默认折叠：仅一行小按钮
			const [msg, setMsg] = useState("");
			const [err, setErr] = useState("");
			const [pos, setPos] = useState(null); // { top, left, maxHeight }（fixed 面板定位）
			const [openBlocks, setOpenBlocks] = useState({}); // { blockIndex: true }（逐条展开状态）
			const triggerRef = useRef(null);
			const panelRef = useRef(null);
			const alive = useRef(true);
			useEffect(() => {
				alive.current = true;
				return () => { alive.current = false; };
			}, []);

			const load = useCallback(async () => {
				if (!cardApi || typeof cardApi.getTurnCard !== "function") {
					setState("none");
					return;
				}
				try {
					const res = unwrap(await cardApi.getTurnCard(messageId));
					const data = (res && res.ok) ? res.card : null;
					if (!alive.current) return;
					if (data && data.verdict === "denied" && data.blocks && data.blocks.length > 0) {
						setCard(data);
						setState("ready");
					} else {
						setCard(null);
						setState("none");
					}
				} catch (e) {
					if (!alive.current) return;
					setState("error");
					setErr(String((e && e.message) || e));
				}
			}, [cardApi, messageId]);

			useEffect(() => { load(); }, [load]);

			// 放置算法（官方向上的 popover 范式）：
			// 面板锚定 trigger 上方（up 展开），下缘 = trigger top - 6px（不低于对话框上缘）；
			// clamp 视口左右各 12px；maxHeight = 面板顶到视口顶 - 12（向上不超视口）。
			const placePanel = useCallback(() => {
				const trig = triggerRef.current;
				const panel = panelRef.current;
				if (!trig || !panel) return;
				const tRect = trig.getBoundingClientRect();
				const pRect = panel.getBoundingClientRect();
				const MARGIN = 12;
				const GAP = 6;
				let top = tRect.top - GAP - pRect.height;
				const left = Math.min(Math.max(MARGIN, tRect.left), window.innerWidth - pRect.width - MARGIN);
				if (top < MARGIN) {
					// 上方空间不足 → 向下展开（仍 clamp）
					top = tRect.bottom + GAP;
				}
				setPos({
					top,
					left,
					maxHeight: Math.max(120, tRect.top - GAP - MARGIN)
				});
			}, []);

			const toggle = useCallback(() => {
				const next = !open;
				setOpen(next);
				// 先渲染（next tick），再量面板定位
				if (next) setTimeout(placePanel, 0);
			}, [open, placePanel]);

			const onRate = async (verdict, blockIndex) => {
				if (!cardApi || typeof cardApi.rateTurnCard !== "function") return;
				setBusy(true);
				setErr("");
				try {
					const block = (card && card.blocks) ? card.blocks[blockIndex] : null;
					const expected = (block && block.label) || "none";
					const res = unwrap(await cardApi.rateTurnCard(messageId, verdict, expected, blockIndex));
					if (res && res.ok) {
						// 只更新该 block 的 label（per-block 独立判例），其余不动
						const blocks = (card && card.blocks || []).map((b, i) => (i === blockIndex ? { ...b, label: res.verdict } : b));
						setCard({ ...card, blocks });
					} else {
						setErr(res && res.error ? String(res.error) : "登记失败");
					}
				} catch (e) {
					setErr(String((e && e.message) || e));
				} finally {
					setBusy(false);
				}
			};

			// 点击外部/Escape 关闭 + 滚动跟随重定位（fixed 面板不随滚动 → 滚动时重算坐标，不关闭）
			useEffect(() => {
				if (!open) return;
				const onDown = (e) => {
					if (triggerRef.current && e.target && triggerRef.current.contains(e.target)) return;
					if (panelRef.current && e.target && panelRef.current.contains(e.target)) return;
					setOpen(false);
				};
				const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
				const onScroll = () => placePanel(); // 滚动不关：跟随按钮重定位（防漂移）
				document.addEventListener("pointerdown", onDown);
				document.addEventListener("keydown", onKey);
				window.addEventListener("scroll", onScroll, true);
				return () => {
					document.removeEventListener("pointerdown", onDown);
					document.removeEventListener("keydown", onKey);
					window.removeEventListener("scroll", onScroll, true);
				};
			}, [open, placePanel]);

			if (state === "loading") return react.createElement("span", null, "");
			if (state === "none") return null;
			if (state === "error") return null; // 拉取失败静默（卡片是增强层）

			// 判例登记 = 一次性（per-block）：某条已判（block.label 非空）即锁定该条；
			// 逐条独立：一条的判定不影响其他条。
			const isBlockLocked = (b) => b && (b.label === "correct" || b.label === "incorrect");
			const toggleBlock = (i) => setOpenBlocks((prev) => ({ ...prev, [i]: !prev[i] }));

			const s = {
				trigger: { padding: "2px 8px", borderRadius: "14px", border: "none", background: "transparent", color: "var(--dsw-alias-label-secondary, #4e5969)", cursor: "pointer", fontSize: "12px", lineHeight: "20px", fontWeight: 550, fontFamily: "inherit", whiteSpace: "nowrap" },
				triggerHover: { background: "var(--dsw-alias-interactive-bg-hover, #f2f3f5)", color: "var(--dsw-alias-label-primary, #1f2329)" },
				panel: { position: "fixed", zIndex: 1100, boxSizing: "border-box", width: "320px", maxWidth: "min(360px, calc(100vw - 24px))", maxHeight: "40vh", overflowY: "auto", background: "var(--dsw-specific-menu, #fff)", border: "1px solid var(--dsw-alias-border-inverted, #e8eaee)", borderRadius: "12px", boxShadow: "var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,0.12))", padding: "10px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px", lineHeight: "18px" },
				header: { display: "flex", alignItems: "center", gap: "4px", color: "var(--dsw-alias-label-primary, #1f2329)", fontWeight: 600, fontSize: "12.5px" },
				userText: { color: "var(--dsw-alias-label-secondary, #4e5969)", wordBreak: "break-word" },
				chev: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary, #8a919f)", flexShrink: 0 },
				headerRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" },
				closeBtn: { padding: "2px 6px", borderRadius: "8px", border: "none", background: "transparent", color: "var(--dsw-alias-label-tertiary, #8a919f)", cursor: "pointer", fontSize: "14px", lineHeight: "18px", fontFamily: "inherit" },
				block: { display: "flex", flexDirection: "column", gap: "2px", padding: "6px 8px", borderRadius: "8px", background: "var(--dsw-alias-fill-1, #f7f8fa)", wordBreak: "break-word" },
				blockHead: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" },
				ruleTag: { padding: "1px 6px", borderRadius: "999px", fontSize: "10.5px", fontWeight: 600, background: "var(--dsw-alias-danger-1, #ffece8)", color: "var(--dsw-alias-danger-6, #d92d20)" },
				tool: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #8a919f)" },
				reason: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #4e5969)", maxHeight: "54px", overflowY: "auto" },
				buttons: { display: "flex", gap: "6px" },
				btnOk: { padding: "3px 10px", borderRadius: "10px", border: "1px solid #b7e3c4", background: "#e8f7ef", color: "#067647", cursor: "pointer", fontSize: "11.5px", fontWeight: 550 },
				btnNo: { padding: "3px 10px", borderRadius: "10px", border: "1px solid #fbd4d0", background: "#fff1f0", color: "#d92d20", cursor: "pointer", fontSize: "11.5px", fontWeight: 550 },
				btnOkActive: { padding: "3px 10px", borderRadius: "10px", border: "1px solid #067647", background: "#067647", color: "#fff", cursor: "pointer", fontSize: "11.5px", fontWeight: 600 },
				btnNoActive: { padding: "3px 10px", borderRadius: "10px", border: "1px solid #d92d20", background: "#d92d20", color: "#fff", cursor: "pointer", fontSize: "11.5px", fontWeight: 600 },
				status: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #8a919f)" },
				msg: { fontSize: "11.5px", color: "#067647" },
				err: { fontSize: "11.5px", color: "#f53f3f" }
			};

			const statusText = (() => {
				const blocks = (card && card.blocks) || [];
				const labeled = blocks.filter((b) => isBlockLocked(b));
				if (labeled.length === 0) return "";
				const ok = labeled.filter((b) => b.label === "correct").length;
				const no = labeled.filter((b) => b.label === "incorrect").length;
				return `已判 ${labeled.length}/${blocks.length}` + (ok ? `（✅${ok}` : "") + (ok && no ? ", " : "") + (no ? `❌${no}` : "") + (ok || no ? "）" : "");
			})();

			return react.createElement("span", null,
				react.createElement("button", {
					ref: triggerRef,
					type: "button",
					style: open ? { ...s.trigger, ...s.triggerHover } : s.trigger,
					"aria-expanded": open,
					onClick: toggle
				}, statusText ? `回合裁决·${statusText}` : "回合裁决"),
				open ? react.createElement("div", {
					ref: panelRef,
					style: { ...s.panel, top: pos ? pos.top : -9999, left: pos ? pos.left : -9999, maxHeight: pos ? Math.min(pos.maxHeight, 40 * window.innerHeight / 100) : "40vh" },
					role: "dialog",
					"aria-label": "回合裁决"
				},
					react.createElement("div", { style: s.header },
						react.createElement("span", null, "回合裁决"),
						react.createElement("span", { style: s.headerRight },
							react.createElement("button", { type: "button", style: s.closeBtn, "aria-label": "收起", onClick: () => setOpen(false) }, "✕")
						)
					),
					react.createElement("div", { style: s.userText }, `你：${card.userText}`),
					// 一次对话（回合）多次裁决 → 逐条分组：每条独立展开/收起 + 独立 ✅❌
					(card.blocks || []).map((b) => {
						const exp = !!openBlocks[b.i];
						const locked = isBlockLocked(b);
						return react.createElement("div", { key: b.i, style: s.block },
							react.createElement("div", { style: { ...s.blockHead, cursor: "pointer", userSelect: "none" }, onClick: () => toggleBlock(b.i) },
								react.createElement("span", { style: s.chev }, exp ? "▾" : "▸"),
								react.createElement("span", { style: s.ruleTag }, `规则 ${b.ruleId || "?"}`),
								react.createElement("span", { style: s.tool }, String(b.tool || "")),
								locked ? react.createElement("span", { style: { fontSize: "10.5px", fontWeight: 600, color: b.label === "correct" ? "#067647" : "#d92d20" } }, b.label === "correct" ? "已判 ✅" : "已判 ❌") : null
							),
							exp ? react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px", marginTop: "3px" } },
								react.createElement("div", { style: s.reason }, String(b.reason || "").slice(0, 160)),
								react.createElement("div", { style: s.buttons },
									react.createElement("button", {
										style: b.label === "correct" ? s.btnOkActive : s.btnOk,
										disabled: busy || locked,
										onClick: (e) => { e.stopPropagation(); onRate("correct", b.i); }
									}, "✅ 拦对了"),
									react.createElement("button", {
										style: b.label === "incorrect" ? s.btnNoActive : s.btnNo,
										disabled: busy || locked,
										onClick: (e) => { e.stopPropagation(); onRate("incorrect", b.i); }
									}, "❌ 拦错了")
								),
								locked ? react.createElement("div", { style: s.status }, `已登记（一次性；如需改判 /guard label ${b.label} 相关事件）`)
									: react.createElement("div", { style: s.status }, "点选=登记判例（❌ 会使同指纹命令学习放行）")
							) : null
						);
					}),
					err ? react.createElement("div", { style: s.err }, err) : null,
					react.createElement("div", { style: s.status }, "每一条裁决可分别判定（判例一次性锁定）")
				) : null
			);
		}

		// ── 3. apply：挂 Remote 贡献 + 注册 assistant-actions 槽位 ─────
		const inject = ["slots", "remote"];

		async function apply(ctx) {
			await ctx.remote.$mount(TYPERT_REMOTE);
			// 取 remote.ruleEngine 服务实例（普通对象，规避 proxy 守卫）
			let cardApi = null;
			try { cardApi = ctx.get("remote.ruleEngine"); } catch (e) { cardApi = null; }
			ctx.slots.inject("conversation.chat.assistant-actions", () => {
				const dispose = ctx.slots.register({
					name: "conversation.chat.assistant-actions",
					id: "rule-turn-card",
					order: 20, // 官方 feedback = 10；本卡片在其右侧（list 多 entry 共存）
					inject: () => ({ cardApi })
				}, TurnCardAction);
				return () => { dispose(); };
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.TurnCardAction = TurnCardAction;
		return module.exports;
	}
});
