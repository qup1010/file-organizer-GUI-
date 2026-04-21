"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  ArrowRight,
  Activity,
  History as HistoryIcon,
  Undo2,
  PlayCircle,
  Eye,
  Search,
  Trash2,
  ShieldCheck,
  PanelLeft,
  FileClock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatDisplayDate, getFriendlyStage } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";

import type { JournalSummary, HistoryItem, SessionSnapshot } from "@/types/session";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  getHistoryEntryName,
  getHistoryEntrySummary,
  isHistoryCompletedEntry,
  isHistoryPartialFailureEntry,
  isHistoryRollbackPartialFailureEntry,
  isHistoryRolledBackEntry,
  isHistorySessionEntry,
  useHistoryList,
} from "@/lib/use-history-list";

function formatPath(path: string) {
  const segments = path.split(/[\\/]/);
  if (segments.length > 4) {
    return `.../${segments.slice(-4).join("/")}`;
  }
  return path;
}

function formatMovePath(path: string | null, baseDir: string) {
  if (!path) {
    return "—";
  }

  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedBaseDir = baseDir.replace(/\\/g, "/").replace(/\/$/, "");
  if (normalizedPath.toLowerCase().startsWith(normalizedBaseDir.toLowerCase())) {
    const relative = normalizedPath.slice(normalizedBaseDir.length).replace(/^\/+/, "");
    return relative || ".";
  }
  return formatPath(normalizedPath);
}

function formatMoveBadge(item: {
  item_id?: string | null;
  target_slot_id?: string | null;
}) {
  const parts = [item.item_id, item.target_slot_id].filter(Boolean);
  return parts.join(" · ");
}

function summarizeMoveNames(items: { display_name: string }[], limit = 3) {
  const names = items.map((item) => item.display_name).filter(Boolean).slice(0, limit);
  if (!names.length) {
    return "";
  }
  return names.join("、") + (items.length > limit ? ` 等 ${items.length} 项` : "");
}

export default function HistoryPage() {
  const APP_CONTEXT_EVENT = "file-organizer-context-change";
  const HISTORY_CONTEXT_KEY = "history_header_context";
  const searchParams = useSearchParams();
  const requestedEntryId = searchParams.get("entry_id");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [journal, setJournal] = useState<JournalSummary | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionSnapshot | null>(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rollbackSuccess, setRollbackSuccess] = useState(false);
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
  const requestedEntryHandledRef = useRef<string | null>(null);
  const router = useRouter();
  const {
    api,
    history,
    loading,
    error,
    setError,
    query,
    setQuery,
    filter,
    setFilter,
    filteredHistory,
    pendingDeleteId,
    deletingId,
    requestDelete,
    cancelDelete,
    confirmDelete,
    loadHistory,
  } = useHistoryList();

  async function loadJournal(id: string) {
    setJournalLoading(true);
    setRollbackSuccess(false);
    try {
      const data = await api.getJournal(id);
      setJournal(data);
    } catch (err) {
      console.error(err);
      setJournal(null);
    } finally {
      setJournalLoading(false);
    }
  }

  async function loadSessionDetail(id: string) {
    setJournalLoading(true);
    setRollbackSuccess(false);
    try {
      const data = await api.getSession(id);
      setSessionDetail(data.session_snapshot);
    } catch (err) {
      console.error(err);
      setSessionDetail(null);
    } finally {
      setJournalLoading(false);
    }
  }

  const selectedEntry = filteredHistory.find((entry) => entry.execution_id === selectedSessionId)
    ?? history.find((entry) => entry.execution_id === selectedSessionId)
    ?? null;
  const isSelectedSession = Boolean(selectedEntry && isHistorySessionEntry(selectedEntry));

  useEffect(() => {
    if (requestedEntryHandledRef.current !== requestedEntryId) {
      requestedEntryHandledRef.current = null;
    }
  }, [requestedEntryId]);

  useEffect(() => {
    if (!selectedEntry || !selectedSessionId) {
      return;
    }
    setJournal(null);
    setSessionDetail(null);
    if (isSelectedSession) {
      void loadSessionDetail(selectedSessionId);
      return;
    }
    void loadJournal(selectedSessionId);
  }, [isSelectedSession, selectedEntry, selectedSessionId]);

  useEffect(() => {
    if (!requestedEntryId || requestedEntryHandledRef.current === requestedEntryId || history.length === 0) {
      return;
    }
    const requestedEntry = history.find((entry) => entry.execution_id === requestedEntryId);
    if (!requestedEntry) {
      requestedEntryHandledRef.current = requestedEntryId;
      return;
    }
    setSelectedSessionId(requestedEntry.execution_id);
    requestedEntryHandledRef.current = requestedEntryId;
  }, [history, requestedEntryId]);

  useEffect(() => {
    if (!filteredHistory.length) {
      setSelectedSessionId(null);
      return;
    }

    if (requestedEntryId && requestedEntryHandledRef.current === requestedEntryId && selectedSessionId !== requestedEntryId) {
      return;
    }

    const exists = filteredHistory.some((entry) => entry.execution_id === selectedSessionId);
    if (!exists) {
      setSelectedSessionId(filteredHistory[0].execution_id);
    }
  }, [filteredHistory, requestedEntryId, selectedSessionId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!selectedEntry) {
      window.localStorage.setItem(
        HISTORY_CONTEXT_KEY,
        JSON.stringify({ detail: "会话与执行档案" }),
      );
      window.dispatchEvent(new Event(APP_CONTEXT_EVENT));
      return;
    }
    window.localStorage.setItem(
        HISTORY_CONTEXT_KEY,
        JSON.stringify({
          detail: `${getHistoryEntryName(selectedEntry)} · ${getHistoryEntrySummary(selectedEntry)}`,
        }),
      );
    window.dispatchEvent(new Event(APP_CONTEXT_EVENT));
  }, [APP_CONTEXT_EVENT, HISTORY_CONTEXT_KEY, selectedEntry]);

  const handleRollback = async () => {
    if (!journal || !selectedSessionId) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.rollback(selectedSessionId, true);
      setRollbackConfirmOpen(false);
      setRollbackSuccess(true);
      await loadHistory();
      void loadJournal(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "回退过程中发生错误");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteHistory = async () => {
    const deletedId = await confirmDelete();
    if (deletedId && selectedSessionId === deletedId) {
      setSelectedSessionId(null);
      setJournal(null);
      setSessionDetail(null);
    }
  };

  const handleOpenSession = (readOnly = false) => {
    if (!selectedEntry || !isHistorySessionEntry(selectedEntry) || !selectedSessionId) return;
    const suffix = readOnly ? "&readonly=1" : "";
    router.push(`/workspace?session_id=${selectedSessionId}${suffix}`);
  };

  const moveRows = journal?.restore_items?.length
    ? journal.restore_items
    : journal?.items?.filter((it) => it.action_type === "MOVE") ?? [];
  const moveRowsSummary = summarizeMoveNames(moveRows);

  const activeCount = history.filter((item) => isHistorySessionEntry(item)).length;
  const completedCount = history.filter((item) => isHistoryCompletedEntry(item)).length;
  const partialFailureCount = history.filter((item) => isHistoryPartialFailureEntry(item)).length;
  const rollbackCount = history.filter((item) => isHistoryRolledBackEntry(item)).length;
  const rollbackPartialFailureCount = history.filter((item) => isHistoryRollbackPartialFailureEntry(item)).length;
  const historyStats = [
    { label: "进行中", value: activeCount },
    { label: "完成", value: completedCount },
    { label: "部分失败", value: partialFailureCount },
    { label: "已回退", value: rollbackCount },
    { label: "回退部分失败", value: rollbackPartialFailureCount },
  ];

  const sessionDetailInterior = (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4 px-1">
          <div className="space-y-1">
             <div className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-primary/45">
                <Activity className="h-3 w-3" />
                SESSION STATE
             </div>
             <p className="text-[13px] font-bold text-on-surface">
               {sessionDetail?.summary || "这是一条未完成的整理记录，你可以继续之前的操作。"}
             </p>
          </div>
          
          <div className="flex divide-x divide-on-surface/8 border-y border-on-surface/8 py-5">
             <div className="flex-1 px-4 space-y-1">
               <p className="text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-60">最近更新</p>
               <p className="text-[14px] font-black tracking-tight text-on-surface tabular-nums leading-none">
                 {formatDisplayDate(sessionDetail?.updated_at || selectedEntry?.created_at || "")}
               </p>
             </div>
             <div className="flex-1 px-4 space-y-1">
               <p className="text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-60">计划项目</p>
               <p className="text-[14px] font-black tracking-tight text-on-surface tabular-nums leading-none">
                 {sessionDetail?.plan_snapshot?.stats?.move_count || 0}
               </p>
             </div>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-[8px] border border-on-surface/8 bg-on-surface/[0.02] p-6 text-center">
          <h3 className="text-[14px] font-black text-on-surface">继续本次整理？</h3>
          <p className="mt-2 text-[12px] font-medium text-ui-muted opacity-70">
            你可以重新进入工作台，检查当前的扫描结果并继续生成整理计划。
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button variant="primary" onClick={() => handleOpenSession(false)} className="h-9 rounded-full px-8 text-[12px] font-black">
              <PlayCircle className="h-3.5 w-3.5" />
              继续处理
            </Button>
            <Button variant="secondary" onClick={() => handleOpenSession(true)} className="h-9 rounded-full px-8 text-[12px] font-black">
              <Eye className="h-3.5 w-3.5" />
              只读查看
            </Button>
          </div>
        </div>
      </div>

      {sessionDetail?.last_error && (
        <div className="rounded-[6px] bg-error/5 border border-error/10 px-4 py-3 text-[12px] font-bold text-error">
          最近一次错误：{sessionDetail.last_error}
        </div>
      )}
    </div>
  );

  const journalInterior = (
    <div className="space-y-6">
      {rollbackSuccess ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-[8px] bg-success/5 border border-success/10 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success-dim">
              <Undo2 className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-[14px] font-black text-on-surface">回滚成功</h3>
              <p className="text-[12px] font-medium text-ui-muted opacity-70">
                受影响的 {journal?.item_count || 0} 项内容已完成路径恢复。
              </p>
            </div>
          </div>
        </motion.div>
      ) : null}

      <div className="flex divide-x divide-on-surface/8 border-y border-on-surface/8 py-5 px-1">
        <div className="flex-1 px-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-60">处理条目</p>
          <p className="text-[20px] font-black tracking-tight text-on-surface tabular-nums leading-none">
            {journal?.item_count || 0}
          </p>
        </div>
        <div className="flex-1 px-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-60">成功项目</p>
          <p className="text-[20px] font-black tracking-tight text-on-surface tabular-nums leading-none">
            {journal?.success_count || 0}
          </p>
        </div>
        <div className="flex-1 px-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-60">失败项目</p>
          <p className="text-[20px] font-black tracking-tight text-on-surface tabular-nums leading-none">
            {journal?.failure_count || 0}
          </p>
        </div>
      </div>

      <div className="px-1">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-primary/45">
              <Activity className="h-3 w-3" />
              JOURNAL DETAIL
            </div>
            <h3 className="text-[15px] font-black text-on-surface">变更执行明细</h3>
          </div>

          {!rollbackSuccess && (journal?.status === "completed" || journal?.status === "partial_failure") ? (
            <Button
              variant="danger"
              onClick={() => setRollbackConfirmOpen(true)}
              disabled={actionLoading}
              loading={actionLoading}
              className="h-9 px-6 rounded-full text-[12px] font-black"
            >
              <Undo2 className="h-3.5 w-3.5" />
              回退执行
            </Button>
          ) : null}
        </div>

        <div className="mt-6 rounded-[8px] border border-on-surface/8 bg-surface overflow-hidden shadow-sm shadow-black/[0.02]">
          <table className="w-full text-left text-[12px] border-collapse">
            <thead className="bg-surface-container-lowest border-b border-on-surface/8">
              <tr className="text-[10.5px] font-bold uppercase tracking-wider text-ui-muted/60">
                <th className="px-4 py-3">文件名称</th>
                <th className="px-4 py-3 text-right">路径映射 (TO / FROM)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-on-surface/4">
              {moveRows.length ? (
                moveRows.map((item, index) => (
                  <tr key={index} className="transition-colors hover:bg-on-surface/[0.015] even:bg-on-surface/[0.008]">
                    <td className="px-4 py-3 align-middle">
                      <div className="space-y-0.5">
                        <p className="max-w-[18rem] truncate font-bold text-on-surface/90" title={item.display_name}>
                          {item.display_name}
                        </p>
                        {formatMoveBadge(item) ? (
                          <p className="text-[10.5px] font-mono font-medium text-ui-muted opacity-50 tracking-tight">
                            {formatMoveBadge(item)}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle min-w-[240px]">
                      <div className="flex items-center justify-end gap-3 text-[11.5px] font-mono">
                        <span className="truncate text-ui-muted opacity-60 text-right" title={item.target || ""}>
                          {formatMovePath(item.target, journal?.target_dir || "")}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-primary/40" />
                        <span className="truncate font-semibold text-primary" title={item.source || ""}>
                          {formatMovePath(item.source, journal?.target_dir || "")}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-4 py-12 text-center text-[12px] font-bold text-ui-muted opacity-40">
                    暂时没有可显示的变更明细。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-surface">
      <div className="ui-page flex h-full min-h-0 flex-row overflow-hidden">
        <section className="flex min-h-0 w-[340px] shrink-0 flex-col border-r border-on-surface/8 bg-surface-container-lowest 2xl:w-[380px]">
          <div className="px-5 py-5">
            <div className="space-y-4">
              <div className="space-y-1.5 px-1">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-primary/45">
                  <PanelLeft className="h-3 w-3" />
                  WORKSPACE
                </div>
                <h1 className="text-[15px] font-black tracking-tight text-on-surface">
                  整理历史记录
                </h1>
              </div>
              
              <div className="flex divide-x divide-on-surface/8 px-1">
                {historyStats.map((item, idx) => (
                  <div key={item.label} className={cn(
                    "flex-1 space-y-0.5",
                    idx === 0 ? "pr-3" : idx === 1 ? "px-3" : "pl-3"
                  )}>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-ui-muted opacity-60">{item.label}</div>
                    <div className="text-[14px] font-black tabular-nums text-on-surface leading-tight">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-5 py-2">
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ui-muted opacity-50" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索记录 ID 或路径..."
                  className="w-full rounded-[6px] border border-on-surface/10 bg-on-surface/[0.02] py-2 pl-[2.25rem] pr-4 text-[12.5px] font-medium text-on-surface outline-none transition-all placeholder:text-ui-muted/50 focus:bg-surface focus:ring-2 focus:ring-primary/5"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "all", label: "全部" },
                  { id: "active", label: "进行中" },
                  { id: "completed", label: "已完成" },
                  { id: "partial_failure", label: "部分失败" },
                  { id: "rolled_back", label: "已回退" },
                  { id: "rollback_partial_failure", label: "回退部分失败" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id as typeof filter)}
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-bold tracking-tight transition-all",
                      filter === item.id
                        ? "bg-primary text-white shadow-sm"
                        : "bg-on-surface/[0.04] text-ui-muted hover:bg-on-surface/[0.08] hover:text-on-surface",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="relative flex-1 overflow-y-auto px-2 py-4 scrollbar-thin">
            {loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 opacity-30">
                <Activity className="h-6 w-6 animate-spin text-primary" />
                <p className="text-[12px] font-bold">载入中...</p>
              </div>
            ) : filteredHistory.length > 0 ? (
              <div className="space-y-0.5">
                {filteredHistory.map((entry, idx) => {
                  const active = selectedSessionId === entry.execution_id;
                  const sessionLike = isHistorySessionEntry(entry);
                  const isRolledBack = isHistoryRolledBackEntry(entry);
                  const isPartialFailure = isHistoryPartialFailureEntry(entry) || isHistoryRollbackPartialFailureEntry(entry);
                  const statusSummary = getHistoryEntrySummary(entry);

                  return (
                    <motion.div
                      key={entry.execution_id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02, duration: 0.3 }}
                      whileTap={{ scale: 0.985 }}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedSessionId(entry.execution_id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedSessionId(entry.execution_id);
                        }
                      }}
                      className={cn(
                        "group relative flex cursor-pointer flex-col gap-0.5 rounded-[4px] px-3 py-2.5 transition-all text-left",
                        active
                          ? "bg-primary/[0.08]"
                          : "bg-transparent hover:bg-on-surface/[0.035]",
                      )}
                    >
                      {active && (
                        <motion.div
                          layoutId="history-active-pill"
                          className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-primary"
                        />
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            sessionLike ? "bg-primary" : isRolledBack ? "bg-on-surface/30" : isPartialFailure ? "bg-warning" : "bg-success",
                          )} />
                          <h3 className={cn(
                            "truncate text-[12.5px] font-black tracking-tight",
                            active ? "text-primary" : "text-on-surface/90"
                          )}>
                            {getHistoryEntryName(entry)}
                          </h3>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold text-ui-muted/50">{formatDisplayDate(entry.created_at)}</span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[10px] font-medium text-ui-muted opacity-60" title={entry.target_dir}>
                          {formatPath(entry.target_dir)}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn(
                            "rounded-[3px] px-1 py-0.5 text-[8.5px] font-black uppercase tracking-wider",
                            active
                              ? "bg-primary/10 text-primary/80"
                              : isPartialFailure
                                ? "bg-warning-container/35 text-warning"
                                : isRolledBack
                                  ? "bg-on-surface/[0.05] text-ui-muted/70"
                                  : "bg-success/10 text-success-dim"
                          )}>
                            {statusSummary}
                          </span>
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          requestDelete(entry.execution_id);
                        }}
                        className="absolute right-2 top-11 opacity-0 group-hover:opacity-100 transition-all p-1 text-error/40 hover:text-error"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center opacity-40">
                <HistoryIcon className="h-8 w-8 opacity-20" />
                <h3 className="mt-4 text-[13px] font-bold">没有发现记录</h3>
              </div>
            )}
          </div>
        </section>

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
          <AnimatePresence mode="wait">
            {selectedSessionId && selectedEntry && (isSelectedSession ? sessionDetail : journal) ? (
              <motion.div
                key={selectedSessionId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="sticky top-0 z-10 shrink-0 border-b border-on-surface/8 bg-surface-container-lowest/80 px-6 py-4 backdrop-blur-md lg:px-8">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 space-y-1">
                       <h2 className="line-clamp-1 font-black tracking-tight text-on-surface text-[16px]">
                         {getHistoryEntryName(selectedEntry)}
                       </h2>
                       <div className="flex items-center gap-2 text-[11px] font-bold opacity-60">
                         <div className="flex items-center gap-1.5 uppercase tracking-widest text-primary/80">
                           <FileClock className="h-3 w-3" />
                           {isSelectedSession ? "SESSION ARCHIVE" : "EXECUTION JOURNAL"}
                         </div>
                         <span>·</span>
                         <div className="flex items-center gap-1.5 truncate">
                           <FolderOpen className="h-3.5 w-3.5 opacity-60" />
                           <span className="truncate">{selectedEntry.target_dir}</span>
                         </div>
                       </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {(() => {
                        const entryIsRolledBack = selectedEntry ? isHistoryRolledBackEntry(selectedEntry) : false;
                        const entryIsPartialFailure = selectedEntry
                          ? isHistoryPartialFailureEntry(selectedEntry) || isHistoryRollbackPartialFailureEntry(selectedEntry)
                          : false;
                        return (
                      <div className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold",
                        isSelectedSession
                          ? "border-primary/20 bg-primary/5 text-primary"
                          : entryIsRolledBack
                            ? "border-on-surface/10 bg-on-surface/5 text-on-surface/50"
                            : entryIsPartialFailure
                              ? "border-warning/20 bg-warning-container/35 text-warning"
                              : "border-success/20 bg-success/5 text-success-dim",
                      )}>
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          isSelectedSession ? "bg-primary" : entryIsRolledBack ? "bg-on-surface/30" : entryIsPartialFailure ? "bg-warning" : "bg-success",
                        )} />
                        {selectedEntry ? getHistoryEntrySummary(selectedEntry) : isSelectedSession ? getFriendlyStage(sessionDetail?.stage) : "—"}
                      </div>
                        );
                      })()}

                      {!isSelectedSession && (journal?.status === "completed" || journal?.status === "partial_failure") && (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/5 px-3 py-1.5 text-[11px] font-bold text-warning">
                          <ShieldCheck className="h-3 w-3" />
                          支持回退
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-surface relative px-4 py-4 scrollbar-thin lg:px-6 lg:py-6">
                  {journalLoading ? (
                    <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 opacity-30">
                      <Activity className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-[12px] font-bold">详情载入中...</p>
                    </div>
                  ) : isSelectedSession ? (
                    sessionDetailInterior
                  ) : (
                    journalInterior
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="flex h-full min-h-[24rem] flex-col items-center justify-center px-8 text-center opacity-30">
                <HistoryIcon className="h-10 w-10 opacity-20" />
                <h3 className="mt-6 text-[15px] font-black text-on-surface">选择记录查看详情</h3>
                <p className="mt-2 max-w-xs text-[12px] font-medium leading-relaxed">
                  在左侧列表中点击任意任务，即可查看其执行报告、变更明细或继续处理。
                </p>
              </div>
            )}
          </AnimatePresence>
        </section>
      </div>

      <ConfirmDialog
        open={rollbackConfirmOpen}
        title="确认回退这次执行？"
        description={`这会把本次整理已移动的 ${moveRows.length} 项内容尽量放回原位置${moveRowsSummary ? `。涉及条目：${moveRowsSummary}` : ""}。若目标文件已被占用或发生冲突，部分回退可能失败。`}
        confirmLabel="确认回退"
        cancelLabel="取消"
        tone="danger"
        loading={actionLoading}
        onConfirm={handleRollback}
        onCancel={() => setRollbackConfirmOpen(false)}
      />
      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="删除这条历史记录？"
        description="删除后，这条会话或执行记录将不会再出现在历史列表中，操作无法撤销。"
        confirmLabel="确认删除"
        cancelLabel="取消"
        tone="danger"
        loading={Boolean(deletingId)}
        onConfirm={handleDeleteHistory}
        onCancel={cancelDelete}
      />
    </div>
  );
}
