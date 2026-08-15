# DSH Session Corruption Incident Report

**Product**: DeepSeek Harness (DSH), desktop app (Electron wrapper, web profile)
**Date**: 2026-08-15 (UTC+8)
**Severity**: High — session log corrupted in three independent validation layers; middle segment permanently lost
**Reported by**: end user (non-programmer) with agent assistance

## 0. Environment Paths (important)

`C:\Users\季涟\.dsh` is a **Windows Junction** pointing to `D:\DeepSeek harness\.dsh`. All data physically resides on drive D; the C: path is only a junction pointer. Physical paths are used throughout.

## 1. Summary

An agent running inside a DSH session replaced the session's own live log file (`session.jsonl.zstd`) with a modified copy **while the DSH process was running and the session was loaded in memory**. DSH continued appending events from its in-memory session to the replaced file, producing a file consisting of two disjoint event ranges with a permanently missing middle segment (3614 events, seq 155812..159425, about 81 seconds of tool-activity records). No backup contains the missing segment.

The resulting log failed three independent validation layers, in order:

1. **Load** — `Session.fromRestore` seed contiguity check
2. **Resume** — agent inbox splice replay validation
3. **Model context** — `deriveMessages()` tool-call/tool-result pairing check

## 2. Session and Plugin Inventory

- Session: `session-568ea370-f2ca-45f2-9218-71fc5c9e304f` (title "读取交接报告继续工作"), workspace `D:\DeepSeek harness\dsh-project`
- Session file: `D:\DeepSeek harness\.dsh\sessions\--D-DeepSeek~0020harness-dsh-project--\session-568ea370-f2ca-45f2-9218-71fc5c9e304f\session.jsonl.zstd` (multi-frame Zstandard; header frame plus appended frames with checksum flag)
- Profile bundles (from `D:\DeepSeek harness\.dsh\profiles\web\package.json`, `dsh.profile.bundles`):
  - `@deepseek-ai/dsh-base`
  - `@deepseek-ai/dsh-web-app`
  - `dsh-rules-manager` (user-developed plugin; includes `dsh-rules-manager-client`)
  - `dsh-vision-router` (community plugin v1.1.1, image recognition for text-only models)
- Previously installed/removed (background only, unrelated to this incident): `@liustack/modlens`

## 3. Timeline

All times UTC+8. Evidence: event `time` fields and file mtimes.

- 16:24 — Session created; agent performs plugin installation, source edits, image-testing
- 17:49:50 — Agent begins an image-cleanup procedure (replacing image content items with text in the log); first backs up the session file
- 17:50:18–17:50:29 — Cleanup script written and run; produces `session-568ea370-clean.jsonl.zstd` (events 0..155811), validated OK
- 17:50:53–17:51:23 — Verification and residue scans pass
- 17:51:43 — **Fault**: cleanup artifact copied over the live session file while DSH running. Tool result at seq 159426: "installed clean session file: 3485228 bytes / install verified OK"
- 17:55:25 — Last DSH write (in-memory continuation range 159426..169536)
- ~17:56 — User reports session will not open
- 18:05 — Rebuild #1 deployed (stitch plus renumber); history loads, resume still fails
- 18:47 — Splice repair generated
- 18:55 — DSH loads repaired file successfully, writes `session/end-seed` (resume passes)
- 19:11 — User restarts DSH; session opens, model picker works, messages send — but continuing the conversation triggers layer-3 error

## 4. Root Cause

The session log is the process's working file. Nothing in DSH detects out-of-band replacement of the file. After the overwrite:

- File = [clean artifact: events 0..155811] + [in-memory continuation: events 159426..169536]
- Events 155812..159425 existed only in process memory and were never durably flushed anywhere

## 5. Error Evidence (verbatim)

Layer 1 — load (`Session.fromRestore`):

```
seed event at index 155812 has seq 159426 (expected 155812); seed must be contiguous from 0
```

Layer 2 — resume (GUI):

```
模型操作失败：internal: resume failed for session "session-568ea370-f2ca-45f2-9218-71fc5c9e304f": Error: invalid persisted inbox splice at session seq 163268 (internal)
```

Layer 3 — model context (recorded in session log, seq 165937, turn/end, turn 27):

```
An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id', The following tool_call_ids did not have response messages: call_00_ET_SKRuzaEerYClnrL5JoPR8408
```

(accompanied by `code=INVALID_REQUEST, status=400`)

## 6. Layer Analysis

### 6.1 Layer 1 — seed discontinuity

`Session.fromRestore` requires seed events contiguous from seq 0. The gap at 155812 fails.

*Reproduction*: load any session log whose event seqs are not contiguous from 0.

### 6.2 Layer 2 — inbox splice replay

`resume` replays `agent/inbox/spliced` events through the agent inbox projection (`dsh-agent/lib/types/inbox.js`), validating `start`/`removedCount` against live queue state and duplicate message ids. The missing range contained an enqueue splice (position 0); the surviving splice at seq 163268 attempts insertion at `start=1` into an empty queue, producing `invalid inbox splice`.

Verified: replaying the original corrupted file fails at the same position. The corruption is in the log, not the validator.

*Reproduction*: delete one enqueue splice from a session log, then resume.

### 6.3 Layer 3 — tool-call/tool-result pairing

`deriveMessages()` requires every `tool-call` block in an `assistant/message` to be answered by a `tool/result` with matching `callId`. The missing range contained:

- the `assistant/message` declaring `call_00_ET_SKRuzaEerYClnrL5JoPR8408` (the install command), and
- the `tool/result` for `call_00_ET_Tl372Bs5xajEv7I6qrUK3064` (the cleanup run)

Survivors (declaration of Tl372 at seq 155810; result of 8408 at seq 155812) cannot pair with anything in the log. The orphan `tool/result` is a `SurfaceEventType` (per `persistence-catalog`): it must carry a valid `surfaceOp`, cannot be deleted (seq continuity), cannot self-replace (replace requires earlier shadowed nodes), and cannot be repointed (its `callId` matches nothing). **No safe in-log repair exists.**

*Reproduction*: remove the `assistant/message` declaring a tool call while keeping its `tool/result`, then derive messages.

## 7. Repair Attempts (for reference; not a supported workflow)

All work was done on byte-level copies with full backups and hash verification. DSH was not running against the file during final replacement.

1. Rebuild: stitch `[0..155811]` plus `[159426..169536]` renumbered by -3614; renumber nested `sourceEventSeqs`. `Session.fromRestore` passes. All 4 user messages preserved.
2. Splice repair: simulate inbox replay; clamp 3 illegal values (163268 start 1 to 0; 164220 start 2 to 1; 164564 removed 1 to 0). Verified: load OK; replay ALL SPLICES VALID; messages intact.
3. Tool pairing: **not cleanly fixable in-log** (see 6.3).

Repair artifacts: `D:\DeepSeek harness\dsh-project\_session-repair\` (rebuild-session.mjs, fix-splices.mjs, fix-orphans.mjs, replay-inbox.mjs, test-load.mjs, scan-orphans.mjs) plus 4 timestamped backups in `backup\`.

## 8. Suggested Product Improvements

1. **Detect out-of-band file replacement**: stat the session file (mtime/size) before each append; if changed since last write, refuse to append and log a clear error instead of silently writing a disjoint file.
2. **Guard the live file**: advisory lock or documented hard requirement ("exit DSH before touching session files"); the desktop wrapper could hold an exclusive handle.
3. **Tolerate gaps with quarantine**: when load/resume/derive hit a gap or orphan, quarantine affected events (log-only, excluded from model surface) and surface a prominent "history gap at seq N" notice instead of a hard failure.
4. **UI affordance for orphan tool results**: offer an official action to mark an orphan `tool/result` as non-surface, avoiding byte-level surgery.

## 9. Availability

Full session file (repaired state), original corrupted file, backups, and all repair scripts are available on request for the maintainers to reproduce or extract fixtures.
