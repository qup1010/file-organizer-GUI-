"use client";

import React, { useEffect, useState } from "react";
import { 
  FolderOpen, ArrowRight, Activity, 
  History as HistoryIcon, AlertTriangle, Undo2, CheckCircle2,
  Clock, Archive, PlayCircle, Eye
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatDisplayDate, getFriendlyStage } from "@/lib/utils";
import { useRouter } from "next/navigation";

import { getApiBaseUrl, getApiToken } from "@/lib/runtime";
import { createApiClient } from "@/lib/api";
import type { JournalSummary, HistoryItem, SessionSnapshot } from "@/types/session";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [journal, setJournal] = useState<JournalSummary | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionSnapshot | null>(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rollbackSuccess, setRollbackSuccess] = useState(false);
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
  const router = useRouter();
  const api = createApiClient(getApiBaseUrl(), getApiToken());
  const selectedEntry = history.find((entry) => entry.execution_id === selectedSessionId) ?? null;
  const isSelectedSession = Boolean(selectedEntry?.is_session);

  // Load history list
  async function loadHistory() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getHistory();
      setHistory(data);
      if (data.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data[0].execution_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  // Load specific journal details
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

  useEffect(() => {
    void loadHistory();
  }, []);

  useEffect(() => {
    if (!selectedEntry || !selectedSessionId) {
      return;
    }
    setJournal(null);
    setSessionDetail(null);
    if (selectedEntry.is_session) {
      void loadSessionDetail(selectedSessionId);
      return;
    }
    void loadJournal(selectedSessionId);
  }, [selectedEntry, selectedSessionId]);

  const handleRollback = async () => {
    if (!journal || !selectedSessionId) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.rollback(selectedSessionId, true);
      setRollbackConfirmOpen(false);
      setRollbackSuccess(true);
      void loadHistory(); // Refresh list
      void loadJournal(selectedSessionId); // Refresh details
    } catch (err) {
      setError(err instanceof Error ? err.message : "回退过程中发生错误");
    } finally {
      setActionLoading(false);
    }
  };

  const formatPath = (path: string) => {
    const segments = path.split(/[\\/]/);
    if (segments.length > 3) {
      return '...' + segments.slice(-3).join('/');
    }
    return path;
  };

  const formatMovePath = (path: string | null, baseDir: string) => {
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
  };

  const moveRows = journal?.restore_items?.length
    ? journal.restore_items
    : journal?.items?.filter(it => it.action_type === "MOVE") ?? [];

  const handleOpenSession = (readOnly = false) => {
    if (!selectedEntry?.is_session || !selectedSessionId) return;
    const suffix = readOnly ? "&readonly=1" : "";
    router.push(`/workspace?session_id=${selectedSessionId}${suffix}`);
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-surface">
      {/* --- Left Pane: Execution Logs --- */}
      <section className="w-[320px] min-w-[320px] bg-surface-container-low/70 flex flex-col overflow-hidden border-r border-on-surface/5">
        <div className="p-5 pb-4 space-y-2 lg:p-6">
          <h1 className="text-xl font-bold text-on-surface font-headline tracking-tight uppercase tracking-widest leading-none">整理记录</h1>
          <p className="text-[11px] text-on-surface-variant font-bold uppercase tracking-widest opacity-40">这里会保存你之前的整理结果和回退记录</p>
        </div>
        {error ? (
          <div className="px-5 pb-3 lg:px-6">
            <ErrorAlert title="操作失败" message={error} />
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-5 space-y-3 pb-5 scrollbar-thin lg:px-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center opacity-20">
              <Activity className="w-8 h-8 animate-spin mb-4" />
              <p className="text-[11px] font-black uppercase tracking-widest">正在加载记录...</p>
            </div>
          ) : history.length > 0 ? (
            history.map((entry, idx) => (
              <motion.div 
                key={entry.execution_id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                onClick={() => setSelectedSessionId(entry.execution_id)}
                className={cn(
                  "p-4 rounded-[24px] transition-all cursor-pointer border group relative overflow-hidden",
                  selectedSessionId === entry.execution_id
                    ? "bg-white border-primary shadow-xl shadow-primary/5" 
                    : "bg-white/40 border-on-surface/5 hover:border-primary/20"
                )}
              >
                <div className="flex justify-between items-start mb-4">
                  <span className={cn(
                    "text-[11px] font-black tracking-widest uppercase px-2 py-0.5 rounded",
                    entry.is_session
                      ? "bg-primary/10 text-primary"
                      : entry.status === 'rolled_back'
                        ? "bg-surface-container-highest text-on-surface-variant/40"
                        : "bg-emerald-500/10 text-emerald-600"
                  )}>
                    {entry.is_session ? getFriendlyStage(entry.status) : (entry.status === 'rolled_back' ? '已回退' : '已完成')}
                  </span>
                  <span className="text-[11px] font-mono text-on-surface-variant/40">
                    {formatDisplayDate(entry.created_at)}
                  </span>
                </div>
                
                <h3 className="text-[15px] font-black text-on-surface mb-3 line-clamp-1 leading-tight tracking-tight uppercase">
                  {entry.target_dir.split(/[\\/]/).pop() || '未命名记录'}
                </h3>

                <div className="space-y-2 opacity-60">
                  <div className="flex items-center text-[11px] text-on-surface-variant font-mono min-w-0">
                    <FolderOpen className="w-3.5 h-3.5 mr-2 shrink-0" />
                    <span className="truncate" title={entry.target_dir}>{formatPath(entry.target_dir)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">
                    <span>{entry.is_session ? "会话记录" : "执行记录"}</span>
                    <span>{entry.item_count || 0} 项</span>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <EmptyState 
              icon={HistoryIcon}
              title="还没有整理记录"
              description="完成一次整理后，结果会自动保存在这里。"
              className="py-20 opacity-40"
            />
          )}
        </div>
      </section>

      {/* --- Right Pane: Architectural Details --- */}
      <section className="flex-1 bg-surface flex flex-col overflow-hidden relative min-w-0">
        <AnimatePresence mode="wait">
          {selectedSessionId && selectedEntry && (isSelectedSession ? sessionDetail : journal) ? (
            <motion.div 
              key={selectedSessionId}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-5 flex items-center justify-between border-b border-on-surface/5 bg-white/70 backdrop-blur-2xl z-10 min-h-[84px] lg:px-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-on-surface font-headline tracking-tight uppercase leading-none">
                    {isSelectedSession ? "会话记录" : "整理结果"}
                  </h2>
                  <p className="text-[11px] text-on-surface-variant font-mono opacity-40">
                    UID: {selectedSessionId}
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  {isSelectedSession ? (
                    <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary border border-primary/10 transition-all">
                      <PlayCircle className="w-4 h-4" />
                      <span className="text-[11px] font-black uppercase tracking-widest">
                        {getFriendlyStage(sessionDetail?.stage)}
                      </span>
                    </div>
                  ) : journal?.status === 'completed' && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-warning-container/20 rounded-full text-warning border border-warning/10 transition-all">
                       <AlertTriangle className="w-4 h-4" />
                       <span className="text-[11px] font-black uppercase tracking-widest">可以回退</span>
                    </div>
                  )}
                  {!isSelectedSession && journal?.status === 'rolled_back' && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest text-on-surface-variant/40 rounded-full border border-on-surface/5">
                       <CheckCircle2 className="w-4 h-4" />
                       <span className="text-[11px] font-black uppercase tracking-widest">回退完成</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Content Canvas */}
              <div className="px-5 py-5 overflow-y-auto flex-1 space-y-6 scrollbar-thin bg-surface-container-low/20 lg:px-6 lg:py-6">
                {isSelectedSession ? (
                  <>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <div className="bg-white p-5 rounded-[26px] border border-on-surface/5 shadow-sm">
                        <div className="flex items-center gap-2 mb-4 opacity-40">
                          <Archive className="w-4 h-4" />
                          <span className="text-[11px] font-black uppercase tracking-[0.3em]">当前阶段</span>
                        </div>
                        <p className="text-3xl font-black text-on-surface tracking-tighter">
                          {getFriendlyStage(sessionDetail?.stage)}
                        </p>
                      </div>
                      <div className="bg-white p-5 rounded-[26px] border border-on-surface/5 shadow-sm">
                        <div className="flex items-center gap-2 mb-4 opacity-40">
                          <Clock className="w-4 h-4" />
                          <span className="text-[11px] font-black uppercase tracking-[0.3em]">最近更新时间</span>
                        </div>
                        <p className="text-lg font-black text-on-surface tracking-tight">
                          {formatDisplayDate(sessionDetail?.updated_at || selectedEntry.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-[26px] border border-on-surface/5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-on-surface-variant/40">目录</p>
                          <p className="mt-2 text-sm font-mono text-on-surface">{sessionDetail?.target_dir}</p>
                        </div>
                        <div className="rounded-full border border-on-surface/8 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                          {sessionDetail?.plan_snapshot?.stats?.move_count || 0} 项计划
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-on-surface-variant/40">状态说明</p>
                        <p className="text-sm leading-7 text-on-surface-variant">
                          {sessionDetail?.summary || "这是一条未完成的整理记录，可以重新进入工作台继续处理。"}
                        </p>
                        {sessionDetail?.last_error ? (
                          <div className="rounded-2xl border border-warning/15 bg-warning-container/15 px-5 py-4 text-[12px] font-bold leading-relaxed text-warning">
                            最近错误: {sessionDetail.last_error}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex gap-3">
                        <Button variant="primary" onClick={() => handleOpenSession(false)} className="px-8 py-3.5">
                          <PlayCircle className="w-4 h-4 mr-2" />
                          继续整理
                        </Button>
                        <Button variant="secondary" onClick={() => handleOpenSession(true)} className="px-8 py-3.5">
                          <Eye className="w-4 h-4 mr-2" />
                          只读查看
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                {rollbackSuccess && (
                  <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} className="p-5 bg-emerald-500/5 border border-emerald-500/10 rounded-[26px] flex items-center gap-5 shadow-sm">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0">
                      <Undo2 className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-[15px] font-black text-on-surface uppercase tracking-tight">回退完成</h4>
                      <p className="text-[13px] font-bold text-on-surface-variant/60 leading-relaxed uppercase tracking-widest">
                        这次移动过的内容已经按原路径放回。受影响的 {journal?.item_count} 项已恢复到原来的位置。
                      </p>
                    </div>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                   <div className="bg-white p-5 rounded-[26px] border border-on-surface/5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4 opacity-40">
                        <Archive className="w-4 h-4" />
                        <span className="text-[11px] font-black uppercase tracking-[0.3em]">处理条目</span>
                      </div>
                      <p className="text-4xl font-black text-on-surface tabular-nums tracking-tighter">{journal?.item_count}</p>
                   </div>
                   <div className="bg-white p-5 rounded-[26px] border border-on-surface/5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4 opacity-40">
                        <Clock className="w-4 h-4" />
                        <span className="text-[11px] font-black uppercase tracking-[0.3em]">处理耗时</span>
                      </div>
                      <p className="text-4xl font-black text-on-surface tabular-nums tracking-tighter">0.8s</p>
                   </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-[11px] font-black text-on-surface-variant/40 uppercase tracking-[0.3em]">路径变化记录</h3>
                  </div>

                  <div className="bg-white border border-on-surface/5 rounded-[28px] overflow-hidden shadow-xl shadow-on-surface/5">
                    <table className="w-full text-left font-sans border-collapse">
                      <thead className="bg-surface-container-low/50 text-[11px] font-black text-on-surface-variant border-b border-on-surface/5 uppercase tracking-[0.2em]">
                        <tr>
                          <th className="px-8 py-5 w-[200px] lg:w-[280px]">文件</th>
                          <th className="px-8 py-5">路径变化（当前 → 原位置）</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-on-surface/5">
                        {moveRows.length ? (
                          moveRows.map((it, i) => (
                            <tr key={i} className="hover:bg-surface-container-low/40 transition-colors group">
                              <td className="px-8 py-6 max-w-0">
                                <div className="flex flex-col">
                                  <span className="text-[14px] font-black text-on-surface tracking-tight uppercase truncate" title={it.display_name}>
                                    {it.display_name}
                                  </span>
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 text-[12px] font-bold text-on-surface-variant/60 font-mono">
                                   <span
                                     className="truncate text-on-surface-variant leading-6 opacity-60 text-right"
                                     title={it.target || ""}
                                   >
                                     {formatMovePath(it.target, journal?.target_dir || "")}
                                   </span>
                                   <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-20 mx-auto" />
                                   <span
                                     className="truncate text-primary font-black leading-6"
                                     title={it.source || ""}
                                   >
                                     {formatMovePath(it.source, journal?.target_dir || "")}
                                   </span>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={2} className="px-8 py-16 text-center text-[13px] font-bold text-on-surface-variant/30 uppercase tracking-widest italic">
                              暂时没有可显示的记录
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                <div className="h-16" />
                  </>
                )}
              </div>

              {/* Action Bar */}
              {!isSelectedSession && journal?.status === 'completed' && !rollbackSuccess && (
                <div className="absolute bottom-5 left-5 right-5 p-5 rounded-[26px] bg-white border border-on-surface/10 shadow-2xl flex items-center justify-between animate-in slide-in-from-bottom-8 backdrop-blur-xl lg:left-6 lg:right-6">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center text-error shadow-sm">
                       <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                       <p className="text-[13px] font-black uppercase tracking-widest text-on-surface">回退这次整理</p>
                       <p className="text-[11px] font-bold text-on-surface-variant/40 uppercase tracking-widest italic">回退会尽量把这次移动过的文件放回原来的位置。</p>
                    </div>
                  </div>
                  <Button 
                    variant="danger"
                    onClick={() => setRollbackConfirmOpen(true)}
                    disabled={actionLoading}
                    loading={actionLoading}
                    className="px-10 py-5 h-auto text-sm"
                  >
                    回退这次整理
                  </Button>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8 bg-surface-container-low/10">
               <div className="w-24 h-24 rounded-[40px] bg-white border border-on-surface/5 flex items-center justify-center text-on-surface-variant/10 shadow-sm">
                 <HistoryIcon className="w-10 h-10 stroke-[1.5px]" />
               </div>
               <p className="text-[13px] font-black text-on-surface-variant/20 uppercase tracking-[0.4em]">请选择一条记录查看详情</p>
            </div>
          )}
        </AnimatePresence>
        <ConfirmDialog
          open={rollbackConfirmOpen}
          title="确认回退这次整理？"
          description="这会把本次整理已移动的文件尽量放回原位置。若目标文件已被占用或发生冲突，部分回退可能失败。"
          confirmLabel="确认回退"
          cancelLabel="先不回退"
          tone="danger"
          loading={actionLoading}
          onConfirm={handleRollback}
          onCancel={() => setRollbackConfirmOpen(false)}
        />
      </section>
    </div>
  );
}
