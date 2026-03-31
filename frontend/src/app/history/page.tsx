"use client";

import React, { useEffect, useState } from "react";
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
import { useRouter } from "next/navigation";

import type { JournalSummary, HistoryItem, SessionSnapshot } from "@/types/session";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getHistoryEntryName, isHistorySessionEntry, useHistoryList } from "@/lib/use-history-list";

function getEntrySummary(entry: HistoryItem): string {
  return isHistorySessionEntry(entry) ? getFriendlyStage(entry.status) : entry.status === "rolled_back" ? "回退已完成" : "执行结果";
}

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

export default function HistoryPage() {
  const APP_CONTEXT_EVENT = "file-organizer-context-change";
  const HISTORY_CONTEXT_KEY = "history_header_context";
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [journal, setJournal] = useState<JournalSummary | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionSnapshot | null>(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rollbackSuccess, setRollbackSuccess] = useState(false);
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
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
    if (!filteredHistory.length) {
      setSelectedSessionId(null);
      return;
    }

    const exists = filteredHistory.some((entry) => entry.execution_id === selectedSessionId);
    if (!exists) {
      setSelectedSessionId(filteredHistory[0].execution_id);
    }
  }, [filteredHistory, selectedSessionId]);

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
          detail: `${getHistoryEntryName(selectedEntry)} · ${getEntrySummary(selectedEntry)}`,
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

  const activeCount = history.filter((item) => isHistorySessionEntry(item)).length;
  const completedCount = history.filter((item) => !isHistorySessionEntry(item) && item.status !== "rolled_back").length;
  const rollbackCount = history.filter((item) => item.status === "rolled_back").length;
  const historyStats = [
    { label: "进行中", value: activeCount },
    { label: "完成", value: completedCount },
    { label: "回退", value: rollbackCount },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-surface">
      <div className="ui-page flex h-full min-h-0 flex-col gap-4 lg:flex-row">
        <section className="flex min-h-0 w-full flex-col overflow-hidden rounded-[8px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_18px_44px_rgba(0,0,0,0.04)] lg:w-[400px] lg:min-w-[400px]">
          <div className="border-b border-on-surface/6 bg-surface px-4 py-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-primary/55">
                  <PanelLeft className="h-3.5 w-3.5" />
                  记录列表
                </div>
                <h1 className="text-[1.2rem] font-black font-headline tracking-tight text-on-surface">
                  整理记录
                </h1>
                <p className="max-w-[18rem] text-[12px] leading-5 text-ui-muted">
                  搜索、筛选并继续处理之前的会话与执行结果。
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {historyStats.map((item) => (
                  <div key={item.label} className="rounded-[4px] border border-on-surface/8 bg-surface-container-lowest px-3 py-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ui-muted">{item.label}</div>
                    <div className="mt-1 text-[1.1rem] font-black tabular-nums text-on-surface">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-b border-on-surface/6 bg-surface-container-low px-4 py-3">
            <div className="space-y-2.5 rounded-[6px] border border-on-surface/8 bg-surface px-3 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索目录、状态或记录 ID"
                  className="w-full rounded-[4px] border border-on-surface/8 bg-white py-2.5 pl-[2.625rem] pr-4 text-[14px] text-on-surface outline-none transition-all placeholder:text-ui-muted focus:border-primary/40 focus:ring-4 focus:ring-primary/[0.02]"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all", label: "全部" },
                  { id: "active", label: "进行中" },
                  { id: "completed", label: "已完成" },
                  { id: "rolled_back", label: "已回退" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id as typeof filter)}
                    className={cn(
                      "rounded-[4px] border px-3 py-1.5 text-[12px] font-black uppercase tracking-tight transition-all",
                      filter === item.id
                        ? "border-primary bg-primary text-white"
                        : "border-on-surface/8 bg-white text-ui-muted hover:border-primary/15 hover:text-on-surface",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error ? (
            <div className="px-4 py-3">
              <ErrorAlert title="历史操作失败" message={error} />
            </div>
          ) : null}

          <div className="relative flex-1 overflow-y-auto bg-surface-container-low px-4 py-4 scrollbar-thin">
            {/* Timeline Thread Line */}
            <div className="absolute left-[1.75rem] top-0 bottom-0 w-[0.5px] bg-on-surface/10 pointer-events-none" />

            {loading ? (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[4px] border border-on-surface/6 bg-white text-primary">
                  <Activity className="h-6 w-6 animate-spin" />
                </div>
                <p className="text-ui-body font-medium text-ui-muted">正在载入历史记录...</p>
              </div>
            ) : filteredHistory.length > 0 ? (
              <div className="space-y-3">
                {filteredHistory.map((entry, idx) => {
                  const active = selectedSessionId === entry.execution_id;
                  const sessionLike = isHistorySessionEntry(entry);

                  return (
                    <motion.div
                      key={entry.execution_id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
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
                        "group relative overflow-hidden rounded-[4px] border transition-all duration-300 cursor-pointer",
                        active
                          ? "border-primary/25 bg-primary/[0.04] shadow-[inset_0_0_0_1px_rgba(var(--primary-rgb),0.05),0_12px_24px_-8px_rgba(0,0,0,0.06)]"
                          : "border-on-surface/5 bg-surface-container-lowest hover:border-primary/15 hover:bg-white hover:shadow-lg hover:shadow-black/[0.02]",
                      )}
                    >
                      {/* Floating Accent Indicator */}
                      <AnimatePresence>
                        {active && (
                          <motion.div
                            layoutId="history-active-pill"
                            initial={{ opacity: 0, x: -4, scaleY: 0.5 }}
                            animate={{ opacity: 1, x: 0, scaleY: 1 }}
                            exit={{ opacity: 0, x: -4, scaleY: 0.5 }}
                            className="absolute left-0 inset-y-0 z-10 w-[4px] bg-primary shadow-[2px_0_12px_rgba(var(--primary-rgb),0.3)]"
                          />
                        )}
                      </AnimatePresence>

                      <div className="relative space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn(
                                "inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                                sessionLike
                                  ? active
                                    ? "border-primary/20 bg-white text-primary"
                                    : "border-primary/15 bg-primary/10 text-primary"
                                  : entry.status === "rolled_back"
                                    ? "border-on-surface/8 bg-surface-container-high text-on-surface/70"
                                    : "border-emerald-500/15 bg-emerald-500/10 text-emerald-700",
                              )}>
                                <span className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  sessionLike ? "bg-primary" : entry.status === "rolled_back" ? "bg-on-surface/45" : "bg-emerald-600",
                                )} />
                                {sessionLike ? "进行中会话" : entry.status === "rolled_back" ? "已回退" : "执行结果"}
                              </span>
                              <span className="text-[11px] font-medium text-ui-muted opacity-70">{formatDisplayDate(entry.created_at)}</span>
                            </div>
                            <h3 className="line-clamp-1 text-[13.5px] font-bold tracking-tight text-on-surface">
                              {getHistoryEntryName(entry)}
                            </h3>
                            <p className="line-clamp-1 text-[11px] font-medium leading-5 text-ui-muted opacity-60" title={entry.target_dir}>
                              {formatPath(entry.target_dir)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestDelete(entry.execution_id);
                            }}
                            className={cn(
                              "rounded-[4px] border p-2 text-ui-muted transition-all hover:border-error/20 hover:text-error hover:bg-error/5 active:scale-95",
                              active ? "border-on-surface/8 bg-white/85" : "border-on-surface/8 bg-white",
                            )}
                            title="删除记录"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[12px]">
                          <div className="min-w-0">
                            <span className="text-ui-muted font-medium">状态</span>
                            <span className="ml-2 font-bold text-on-surface/80">{getEntrySummary(entry)}</span>
                          </div>
                          <div className={cn(
                            "rounded-[4px] px-2.5 py-1.5 font-bold tabular-nums text-[11px]",
                            active ? "bg-white/80 text-primary" : "bg-on-surface/4 text-ui-muted",
                          )}>
                            {entry.item_count || 0} 个项目
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center px-10 text-center">
                <div className="relative">
                  <div className="absolute inset-0 animate-ping rounded-full bg-primary/5 opacity-40" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-[6px] bg-white text-primary/45 border border-on-surface/8 shadow-sm">
                    <HistoryIcon className="h-8 w-8" />
                  </div>
                </div>
                <h3 className="mt-6 text-[1.15rem] font-bold font-headline tracking-tight text-on-surface">
                  {history.length === 0 ? "还未开启任何整理任务" : "未发现匹配记录"}
                </h3>
                <p className="mt-2 text-[12.5px] leading-6 text-ui-muted opacity-60">
                  {history.length === 0
                    ? "开始第一次整理后，这里会显示任务记录、执行结果和回退记录。"
                    : "请尝试调整搜索词或筛选条件。"}
                </p>
              </div>
            )}

          </div>
        </section>

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_18px_44px_rgba(0,0,0,0.04)]">
          <AnimatePresence mode="wait">
            {selectedSessionId && selectedEntry && (isSelectedSession ? sessionDetail : journal) ? (
              <motion.div
                key={selectedSessionId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="border-b border-on-surface/6 bg-surface px-6 py-6 lg:px-8">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary/8 text-primary">
                           <FileClock className="h-4 w-4" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-primary/60">
                          {isSelectedSession ? "任务记录" : "执行记录"}
                        </span>
                      </div>
                      <h2 className="line-clamp-1 font-headline text-[1.5rem] font-black tracking-tight text-on-surface lg:text-[1.8rem]">
                        {getHistoryEntryName(selectedEntry)}
                      </h2>
                      <div className="flex items-center gap-2 rounded-[10px] border border-on-surface/5 bg-on-surface/[0.02] px-3 py-1.5 w-fit">
                        <FolderOpen className="h-3.5 w-3.5 text-on-surface/40" />
                        <p className="truncate text-[12px] font-medium text-ui-muted">
                          {selectedEntry.target_dir}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className={cn(
                        "inline-flex items-center gap-2 rounded-[4px] border px-4 py-2 text-[12px] font-bold",
                        isSelectedSession
                          ? "border-primary/15 bg-primary/8 text-primary"
                          : journal?.status === "rolled_back"
                            ? "border-on-surface/10 bg-surface-container-high text-on-surface/60"
                            : "border-emerald-500/15 bg-emerald-500/10 text-emerald-700",
                      )}>
                        <span className={cn(
                          "h-2 w-2 rounded-full shadow-sm",
                          isSelectedSession ? "bg-primary" : journal?.status === "rolled_back" ? "bg-on-surface/40" : "bg-emerald-500",
                        )} />
                        {isSelectedSession ? getFriendlyStage(sessionDetail?.stage) : journal?.status === "rolled_back" ? "回退已完成" : "执行结果"}
                      </div>

                      {!isSelectedSession && journal?.status === "completed" && (
                        <div className="inline-flex items-center gap-2 rounded-[6px] border border-warning/20 bg-warning/5 px-4 py-2 text-[12px] font-bold text-warning">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          可以回退
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-surface-container-low px-4 py-4 scrollbar-thin lg:px-5 lg:py-5">
                  {journalLoading ? (
                    <div className="flex min-h-[20rem] flex-col items-center justify-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-[8px] border border-on-surface/6 bg-white text-primary">
                        <Activity className="h-6 w-6 animate-spin" />
                      </div>
                      <p className="text-ui-body text-ui-muted">正在载入详细内容...</p>
                    </div>
                  ) : isSelectedSession ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
                        <div className="rounded-[8px] border border-on-surface/6 bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.03)]">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-ui-meta text-ui-muted">当前状态</p>
                              <h3 className="mt-2.5 text-[1.55rem] font-bold font-headline tracking-tight text-on-surface">
                                {getFriendlyStage(sessionDetail?.stage)}
                              </h3>
                            </div>
                            <div className="rounded-[8px] bg-surface-container-low p-2.5 text-primary">
                              <FolderOpen className="h-6 w-6" />
                            </div>
                          </div>
                          <p className="mt-4 max-w-2xl text-ui-body text-ui-muted">
                            {sessionDetail?.summary || "这是一条未完成的整理记录，你可以重新进入工作台继续调整。"}
                          </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                          <div className="rounded-[8px] border border-on-surface/6 bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.03)]">
                            <p className="text-ui-meta text-ui-muted">最近更新时间</p>
                            <p className="mt-2.5 text-[1.25rem] font-bold tracking-tight text-on-surface">
                              {formatDisplayDate(sessionDetail?.updated_at || selectedEntry.created_at)}
                            </p>
                          </div>
                          <div className="rounded-[8px] border border-on-surface/6 bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.03)]">
                            <p className="text-ui-meta text-ui-muted">计划条目</p>
                            <p className="mt-2.5 text-[1.25rem] font-bold tracking-tight text-on-surface">
                              {sessionDetail?.plan_snapshot?.stats?.move_count || 0}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[12px] border border-on-surface/6 bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.03)]">
                        <div className="space-y-4">
                          <div>
                            <p className="text-ui-meta text-ui-muted">状态说明</p>
                            <p className="mt-2.5 text-ui-body text-on-surface">
                              {sessionDetail?.summary || "这是一条未完成的整理记录，可以重新进入工作台继续处理。"}
                            </p>
                          </div>

                          {sessionDetail?.last_error ? (
                            <div className="rounded-[9px] border border-warning/15 bg-warning-container/15 px-4 py-3 text-[13px] font-semibold leading-relaxed text-warning">
                              最近一次错误：{sessionDetail.last_error}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap gap-3">
                            <Button variant="primary" onClick={() => handleOpenSession(false)} className="px-7 py-3">
                              <PlayCircle className="h-4 w-4" />
                              继续处理
                            </Button>
                            <Button variant="secondary" onClick={() => handleOpenSession(true)} className="px-7 py-3">
                              <Eye className="h-4 w-4" />
                              只读打开
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {rollbackSuccess ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="rounded-[12px] border border-emerald-500/12 bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.03)]"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-emerald-500/12 text-emerald-700">
                              <Undo2 className="h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="text-[1.05rem] font-black tracking-tight text-on-surface">回退已完成</h3>
                              <p className="mt-2 text-ui-body text-ui-muted">
                                这次移动过的内容已经按原路径放回，受影响的 {journal?.item_count || 0} 项内容已完成恢复。
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[8px] border border-on-surface/6 bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.03)]">
                          <p className="text-ui-meta text-ui-muted">处理条目</p>
                          <p className="mt-2.5 text-[1.35rem] font-bold tracking-tight text-on-surface tabular-nums">
                            {journal?.item_count || 0}
                          </p>
                        </div>
                        <div className="rounded-[8px] border border-on-surface/6 bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.03)]">
                          <p className="text-ui-meta text-ui-muted">成功项目</p>
                          <p className="mt-2.5 text-[1.35rem] font-bold tracking-tight text-on-surface tabular-nums">
                            {journal?.success_count || 0}
                          </p>
                        </div>
                        <div className="rounded-[8px] border border-on-surface/6 bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.03)]">
                          <p className="text-ui-meta text-ui-muted">失败项目</p>
                          <p className="mt-2.5 text-[1.35rem] font-bold tracking-tight text-on-surface tabular-nums">
                            {journal?.failure_count || 0}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-[12px] border border-on-surface/6 bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.03)]">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                          <div>
                            <p className="text-ui-meta text-ui-muted">路径变化记录</p>
                            <h3 className="mt-2 text-[1.2rem] font-bold font-headline tracking-tight text-on-surface">
                              本次变更明细
                            </h3>
                            <p className="mt-1.5 text-ui-body text-ui-muted">
                              左侧是当前路径，右侧是原始位置。回退后则显示恢复关系。
                            </p>
                          </div>

                          {!rollbackSuccess && journal?.status === "completed" ? (
                            <Button
                              variant="danger"
                              onClick={() => setRollbackConfirmOpen(true)}
                              disabled={actionLoading}
                              loading={actionLoading}
                              className="px-7 py-3"
                            >
                              <Undo2 className="h-4 w-4" />
                              回退这次执行
                            </Button>
                          ) : null}
                        </div>

                        <div className="mt-5 overflow-hidden rounded-[10px] border border-on-surface/6">
                          <table className="w-full border-collapse text-left">
                            <thead className="bg-surface-container-low/55">
                              <tr className="text-ui-meta font-semibold text-ui-muted">
                                <th className="px-4 py-3.5">文件</th>
                                <th className="px-4 py-3.5">路径变化</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-on-surface/6 bg-white">
                              {moveRows.length ? (
                                moveRows.map((item, index) => (
                                  <tr key={index} className="transition-colors hover:bg-surface-container-low/28">
                                    <td className="px-4 py-3.5 align-top">
                                      <p className="max-w-[18rem] truncate text-[14px] font-semibold text-on-surface" title={item.display_name}>
                                        {item.display_name}
                                      </p>
                                    </td>
                                    <td className="px-4 py-3.5">
                                      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 text-[13px]">
                                        <span className="truncate text-right font-mono text-ui-muted" title={item.target || ""}>
                                          {formatMovePath(item.target, journal?.target_dir || "")}
                                        </span>
                                        <ArrowRight className="h-3.5 w-3.5 text-primary/55" />
                                        <span className="truncate font-mono font-semibold text-primary" title={item.source || ""}>
                                          {formatMovePath(item.source, journal?.target_dir || "")}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={2} className="px-4 py-12 text-center text-ui-body text-ui-muted">
                                    暂时没有可显示的路径变化记录。
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="flex h-full min-h-[24rem] flex-col items-center justify-center px-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-[10px] bg-white text-primary/45 border border-on-surface/6">
                  <HistoryIcon className="h-8 w-8" />
                </div>
                <h3 className="mt-6 text-[1.35rem] font-bold font-headline tracking-tight text-on-surface">
                  选择一条记录查看详情
                </h3>
                <p className="mt-3 max-w-lg text-ui-body text-ui-muted">
                  你可以在左侧搜索目录、筛选状态，或者直接打开某条会话与执行结果继续处理。
                </p>
              </div>
            )}
          </AnimatePresence>
        </section>
      </div>

      <ConfirmDialog
        open={rollbackConfirmOpen}
        title="确认回退这次执行？"
        description="这会把本次整理已移动的文件尽量放回原位置。若目标文件已被占用或发生冲突，部分回退可能失败。"
        confirmLabel="确认回退"
        cancelLabel="先不回退"
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
