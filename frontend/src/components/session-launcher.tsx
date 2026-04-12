"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  FolderTree,
  History,
  Layers3,
  Loader2,
  Monitor,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { createApiClient } from "@/lib/api";
import { createSessionAndStartScan, startFreshSession } from "@/lib/session-launcher-actions";
import { getApiBaseUrl, getApiToken, isTauriDesktop, pickDirectoryWithTauri } from "@/lib/runtime";
import {
  buildStrategySummary,
  CAUTION_LEVEL_OPTIONS,
  DEFAULT_STRATEGY_SELECTION,
  getLaunchStrategyFromConfig,
  getSuggestedSelection,
  getTemplateMeta,
  NAMING_STYLE_OPTIONS,
  shouldSkipLaunchStrategyPrompt,
  STRATEGY_TEMPLATES,
} from "@/lib/strategy-templates";
import { HistoryItem, SessionSnapshot, SessionStrategySelection, SessionStrategySummary } from "@/types/session";
import { StrategySummaryChips } from "./launcher/strategy-summary-chips";
import { LaunchTransitionOverlay } from "./launcher/launch-transition-overlay";
import { StrategyDialog } from "./launcher/strategy-dialog";
import { ResumePromptDialog } from "./launcher/resume-prompt-dialog";


const DEFAULT_STRATEGY_SUMMARY: SessionStrategySummary = {
  ...DEFAULT_STRATEGY_SELECTION,
  template_label: "通用下载",
  template_description: "适合下载目录、桌面暂存区等混合文件场景。",
  naming_style_label: "中文目录",
  caution_level_label: "平衡",
  preview_directories: ["项目资料", "财务票据", "学习资料", "安装程序", "待确认"],
};

export function SessionLauncher() {
  const router = useRouter();
  const apiBaseUrl = getApiBaseUrl();
  const [targetDir, setTargetDir] = useState("");
  const [strategyDialogOpen, setStrategyDialogOpen] = useState(false);
  const [savedLaunchStrategy, setSavedLaunchStrategy] = useState<SessionStrategySelection>(DEFAULT_STRATEGY_SELECTION);
  const [draftStrategy, setDraftStrategy] = useState<SessionStrategySelection>(DEFAULT_STRATEGY_SELECTION);
  const [launchSkipPrompt, setLaunchSkipPrompt] = useState(false);
  const [launchPreferencesLoaded, setLaunchPreferencesLoaded] = useState(false);
  const [effectiveLaunchStrategy, setEffectiveLaunchStrategy] = useState<SessionStrategySelection>(DEFAULT_STRATEGY_SELECTION);
  const [loading, setLoading] = useState(false);
  const [launchTransitionOpen, setLaunchTransitionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestHistory, setLatestHistory] = useState<HistoryItem | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [resumePrompt, setResumePrompt] = useState<{ sessionId: string; snapshot: SessionSnapshot } | null>(null);
  const [commonDirs, setCommonDirs] = useState<{ label: string; path: string }[]>([]);

  const resumeStrategy = resumePrompt?.snapshot.strategy || DEFAULT_STRATEGY_SUMMARY;
  const resumeStage = resumePrompt?.snapshot.stage;
  const isCompletedResume = resumeStage === "completed";
  const currentSummary = buildStrategySummary(savedLaunchStrategy);
  const currentTemplate = getTemplateMeta(savedLaunchStrategy.template_id);
  const namingLabel = currentSummary.naming_style_label;
  const cautionLabel = currentSummary.caution_level_label;
  const latestHistoryName = latestHistory?.target_dir?.replace(/[\\/]$/, "").split(/[\\/]/).pop() || "最近任务";
  const latestHistoryStage = latestHistory?.is_session
    ? (latestHistory.status === "ready_to_execute" ? "等待执行" : latestHistory.status === "ready_for_precheck" ? "可开始预检" : latestHistory.status === "planning" ? "正在调整方案" : latestHistory.status === "scanning" ? "正在扫描" : latestHistory.status === "completed" ? "已完成" : latestHistory?.status || "最近任务")
    : latestHistory?.status === "rolled_back"
      ? "已回退"
      : latestHistory?.status === "partial_failure"
        ? "部分完成"
        : latestHistory?.status === "success"
          ? "已完成"
          : latestHistory?.status || "最近任务";

  useEffect(() => {
    let cancelled = false;

    async function loadLaunchPreferences() {
      try {
        const api = createApiClient(apiBaseUrl, getApiToken());
        const data = await api.getSettings();
        if (cancelled) {
          return;
        }
        const strategy = getLaunchStrategyFromConfig(data.global_config);
        setSavedLaunchStrategy(strategy);
        setDraftStrategy(strategy);
        setEffectiveLaunchStrategy(strategy);
        setLaunchSkipPrompt(shouldSkipLaunchStrategyPrompt(data.global_config));
        setLaunchPreferencesLoaded(true);
      } catch {
        if (cancelled) {
          return;
        }
        setSavedLaunchStrategy(DEFAULT_STRATEGY_SELECTION);
        setDraftStrategy(DEFAULT_STRATEGY_SELECTION);
        setEffectiveLaunchStrategy(DEFAULT_STRATEGY_SELECTION);
        setLaunchSkipPrompt(false);
        setLaunchPreferencesLoaded(true);
      }
    }

    void loadLaunchPreferences();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadLatestHistory() {
      setHistoryLoading(true);
      try {
        const api = createApiClient(apiBaseUrl, getApiToken());
        const history = await api.getHistory();
        if (!cancelled) {
          setLatestHistory(history[0] || null);
        }
      } catch {
        if (!cancelled) {
          setLatestHistory(null);
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    void loadLatestHistory();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    let cancelled = false;
    async function loadCommonDirs() {
      try {
        const api = createApiClient(apiBaseUrl, getApiToken());
        const dirs = await api.getCommonDirs();
        if (!cancelled) setCommonDirs(dirs);
      } catch { /* ignore */ }
    }
    void loadCommonDirs();
    return () => { cancelled = true; };
  }, [apiBaseUrl]);

  async function handleSelectDir() {
    setLoading(true);
    setError(null);
    try {
      if (isTauriDesktop()) {
        const selectedPath = await pickDirectoryWithTauri();
        if (selectedPath) {
          setTargetDir(selectedPath);
        }
        return;
      }

      const api = createApiClient(apiBaseUrl, getApiToken());
      const response = await api.selectDir();
      if (response.path) {
        setTargetDir(response.path);
      }
    } catch (_err) {
      setError(isTauriDesktop() ? "没有打开目录选择窗口，请再试一次。" : "现在还不能打开目录选择器，请检查本地服务是否正常运行。");
    } finally {
      setLoading(false);
    }
  }

  function openStrategyDialog(dirOverride?: string) {
    const nextTargetDir = (dirOverride ?? targetDir).trim();
    if (!nextTargetDir) {
      setError("请先选择一个需要整理的目录。");
      return;
    }
    setError(null);
    if (dirOverride) {
      setTargetDir(dirOverride);
    }
    setDraftStrategy(savedLaunchStrategy);
    setStrategyDialogOpen(true);
  }

  function handleTemplateSelect(templateId: SessionStrategySelection["template_id"]) {
    const suggested = getSuggestedSelection(templateId);
    setDraftStrategy((prev) => ({
      ...prev,
      template_id: templateId,
      naming_style: suggested.naming_style,
      caution_level: suggested.caution_level,
    }));
  }

  async function launchWithStrategy(strategy: SessionStrategySelection, dirOverride?: string) {
    const nextTargetDir = (dirOverride ?? targetDir).trim();
    if (!nextTargetDir) return;
    setLoading(true);
    setLaunchTransitionOpen(true);
    setError(null);
    setEffectiveLaunchStrategy(strategy);
    try {
      const api = createApiClient(apiBaseUrl, getApiToken());
      const response = await createSessionAndStartScan(api, nextTargetDir, true, strategy);
      if (response.mode === "resume_available" && response.restorable_session?.session_id) {
        setLaunchTransitionOpen(false);
        setResumePrompt({
          sessionId: response.restorable_session.session_id,
          snapshot: response.restorable_session,
        });
        return;
      }
      if (!response.session_id) {
        throw new Error("没有成功创建整理会话，请再试一次。");
      }
      setStrategyDialogOpen(false);
      router.push(`/workspace?session_id=${response.session_id}&dir=${encodeURIComponent(nextTargetDir)}`);
    } catch (err: any) {
      setLaunchTransitionOpen(false);
      if (err.message && err.message.toLowerCase().includes("failed to fetch")) {
        setError(`现在连不上本地服务，请确认它是否已经启动（${apiBaseUrl}）。`);
      } else {
        setError(err instanceof Error ? err.message : "创建会话或启动扫描失败，请再试一次。");
      }
    } finally {
      if (!resumePrompt) {
        setLoading(false);
      }
    }
  }

  async function handlePrimaryLaunch() {
    if (launchSkipPrompt) {
      await launchWithStrategy(savedLaunchStrategy);
      return;
    }
    openStrategyDialog();
  }

  function handleOpenLatestContinue() {
    if (!latestHistory?.is_session) {
      router.push("/history");
      return;
    }
    router.push(`/workspace?session_id=${latestHistory.execution_id}`);
  }

  function handleOpenLatestReadonly() {
    if (!latestHistory?.is_session) {
      router.push("/history");
      return;
    }
    router.push(`/workspace?session_id=${latestHistory.execution_id}&readonly=1`);
  }

  async function handleRestartLatest() {
    const nextTargetDir = latestHistory?.target_dir?.trim();
    if (!nextTargetDir) {
      return;
    }
    setTargetDir(nextTargetDir);
    if (launchSkipPrompt) {
      await launchWithStrategy(savedLaunchStrategy, nextTargetDir);
      return;
    }
    openStrategyDialog(nextTargetDir);
  }

  async function handleStartFresh() {
    if (!resumePrompt) return;
    setLoading(true);
    setLaunchTransitionOpen(true);
    setError(null);
    try {
      const api = createApiClient(apiBaseUrl, getApiToken());
      const response = await startFreshSession(
        api,
        resumePrompt.sessionId,
        targetDir,
        effectiveLaunchStrategy,
        resumePrompt.snapshot.stage,
      );
      setResumePrompt(null);
      if (!response.session_id) {
        throw new Error("没有成功重新开始，请再试一次。");
      }
      router.push(`/workspace?session_id=${response.session_id}&dir=${encodeURIComponent(targetDir)}`);
    } catch (err: any) {
      setLaunchTransitionOpen(false);
      if (err.message && err.message.toLowerCase().includes("failed to fetch")) {
        setError(`现在连不上本地服务，请确认它是否已经启动（${apiBaseUrl}）。`);
      } else {
        setError(err instanceof Error ? err.message : "重新开始并启动扫描失败，请再试一次。");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCancelResume() {
    setResumePrompt(null);
    setLaunchTransitionOpen(false);
    setLoading(false);
  }

  function handleConfirmResume() {
    if (!resumePrompt) return;
    router.push(`/workspace?session_id=${resumePrompt.sessionId}&dir=${encodeURIComponent(targetDir)}`);
  }

  function handleReadOnlyView() {
    if (!resumePrompt) return;
    router.push(`/workspace?session_id=${resumePrompt.sessionId}&dir=${encodeURIComponent(targetDir)}&readonly=1`);
  }

  return (
    <>
      <LaunchTransitionOverlay open={launchTransitionOpen} targetDir={targetDir} />
      <div className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-4 py-6 sm:px-6 lg:px-8">

        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full"
        >
          <section className="overflow-hidden rounded-[10px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_20px_48px_rgba(0,0,0,0.05)]">
            <div className="p-6 sm:p-8">
               <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        任务启动台
                      </div>
                      <h1 className="font-headline text-[32px] font-black leading-tight tracking-tight text-on-surface sm:text-[40px]">
                        开始整理工作
                      </h1>
                      <p className="max-w-[560px] text-[15px] leading-relaxed tracking-tight text-ui-muted/80">
                        选择一个目录开始整理。在执行前，你可以预览并确认 AI 生成的整理计划。
                      </p>
                    </div>

                    <div className="space-y-6">
                      <div className="group relative overflow-hidden rounded-[16px] border border-on-surface/10 bg-surface shadow-[0_8px_40px_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_12px_50px_rgba(0,0,0,0.06)]">
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
                          <div className="relative p-6 sm:p-7">
                            <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                              <div className="min-w-0 flex-1">
                                <div className="mb-4 flex items-center gap-2.5">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    <FolderTree className="h-3.5 w-3.5" />
                                  </div>
                                  <span className="text-[11px] font-black uppercase tracking-[0.25em] text-primary/70">整理目标目录</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <button
                                    onClick={handleSelectDir}
                                    disabled={loading}
                                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-on-surface/8 bg-on-surface/[0.03] text-on-surface transition-all hover:bg-primary/5 hover:text-primary active:scale-95"
                                  >
                                    <FolderOpen className="h-5.5 w-5.5" />
                                  </button>
                                  <input
                                    value={targetDir}
                                    onChange={(event) => setTargetDir(event.target.value)}
                                    disabled={loading}
                                    title={targetDir}
                                    className="h-10 w-full min-w-0 flex-1 truncate bg-transparent text-[15px] font-bold tracking-tight text-on-surface outline-none placeholder:text-on-surface-variant/20 disabled:opacity-70 sm:text-[16px]"
                                    placeholder="粘贴路径或点击左侧图标选择"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") void handlePrimaryLaunch();
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 lg:pt-0">
                                <Button
                                  variant="ghost"
                                  onClick={() => openStrategyDialog()}
                                  disabled={loading || !targetDir.trim()}
                                  className="h-12 rounded-[10px] px-4 text-[13px] font-bold text-ui-muted hover:text-on-surface bg-on-surface/[0.03] transition-colors sm:h-14 sm:rounded-[12px] sm:px-5 sm:text-[14px]"
                                >
                                  <Layers3 className="mr-2 sm:mr-2.5 h-4 w-4 sm:h-4.5 sm:w-4.5" />
                                  自定义配置
                                </Button>
                                <Button
                                  variant="primary"
                                  onClick={() => void handlePrimaryLaunch()}
                                  disabled={loading || !targetDir.trim()}
                                  loading={loading}
                                  className="h-12 min-w-[140px] rounded-[10px] px-6 text-[14px] font-black tracking-tight sm:h-14 sm:min-w-[160px] sm:rounded-[12px] sm:px-8 sm:text-[16px]"
                                >
                                  {loading ? "载入中" : "开始整理"}
                                  {!loading && <ArrowRight className="ml-2 sm:ml-2.5 h-4 w-4 sm:h-5 sm:w-5" />}
                                </Button>
                              </div>
                            </div>

                            {/* 快捷按钮整合进主卡片底部 */}
                            {commonDirs.length > 0 && (
                              <div className="mt-6 flex items-center gap-3 border-t border-on-surface/5 pt-5 sm:mt-8 sm:pt-6">
                                <span className="text-[10px] font-black uppercase tracking-widest text-ui-muted opacity-50 sm:text-[11px]">快捷选择</span>
                                <div className="flex flex-wrap gap-2">
                                  {commonDirs.map((dir) => {
                                    const IconComponent = dir.label === "下载" ? Download : dir.label === "桌面" ? Monitor : FileText;
                                    return (
                                      <button
                                        key={dir.path}
                                        type="button"
                                        onClick={() => setTargetDir(dir.path)}
                                        disabled={loading}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-on-surface/8 bg-on-surface/[0.01] px-3 py-1.5 text-[11px] font-bold text-on-surface-variant/70 transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary active:scale-95 disabled:opacity-40 sm:gap-2 sm:px-3.5"
                                      >
                                        <IconComponent className="h-3 w-3" />
                                        {dir.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                      </div>

                      {/* 三步流程引导 - 更加精致的横向步骤，增加大小和占位 */}
                      <div className="mx-auto flex w-full max-w-[85%] items-center justify-between py-4 sm:py-6">
                        {[
                          { step: "1", label: "选择目录", icon: FolderOpen },
                          { step: "2", label: "扫描分析", icon: Search },
                          { step: "3", label: "核对并执行", icon: ShieldCheck },
                        ].map((item, idx) => (
                          <div key={item.step} className="flex flex-1 items-center last:flex-none">
                            <div className="flex flex-col items-center gap-3">
                              <div className={cn(
                                "flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full transition-all duration-300 shadow-sm",
                                idx === 0 ? "bg-primary text-white shadow-primary/20 scale-105" : "bg-on-surface/[0.03] text-on-surface-variant/40"
                              )}>
                                <item.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                              </div>
                              <span className={cn("text-[11px] sm:text-[12px] font-black uppercase tracking-widest whitespace-nowrap", idx === 0 ? "text-primary" : "text-ui-muted/50")}>
                                {item.label}
                              </span>
                            </div>
                            {idx < 2 && (
                              <div className="mx-4 sm:mx-8 h-px flex-1 bg-gradient-to-r from-on-surface/5 via-on-surface/10 to-on-surface/5" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-5">
                     <div className="rounded-[10px] border border-on-surface/8 bg-surface p-5 lg:p-6">
                        <div className="mb-5 flex items-center justify-between">
                           <div className="flex items-center gap-2 text-on-surface">
                             <History className="h-4.5 w-4.5 text-primary" />
                             <span className="text-[11px] font-black uppercase tracking-[0.22em] text-primary/70">最近任务</span>
                           </div>
                        </div>

                        {historyLoading ? (
                          <div className="flex items-center gap-3 py-3 text-ui-muted opacity-60">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span className="text-[12px] font-bold">同步历史记录...</span>
                          </div>
                        ) : latestHistory ? (
                          <div className="space-y-6">
                            <div className="space-y-1.5">
                              <p className="line-clamp-1 text-[16px] font-black tracking-tight text-on-surface">{latestHistoryName}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">{latestHistory.is_session ? "会话" : "记录"}</span>
                                <div className="h-1 w-1 rounded-full bg-on-surface/10" />
                                <span className="line-clamp-1 flex-1 font-mono text-[10px] text-ui-muted/60 lowercase tracking-tight">{latestHistory.target_dir}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 rounded-[12px] bg-on-surface/[0.02] p-4">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-widest text-ui-muted/50">当前阶段</span>
                                <span className="text-[12px] font-black text-on-surface/70 truncate">{latestHistoryStage}</span>
                              </div>
                              <div className="flex flex-col border-l border-on-surface/6 pl-4">
                                <span className="text-[10px] font-black uppercase tracking-widest text-ui-muted/50">规模</span>
                                <span className="text-[12px] font-black text-on-surface/70">{latestHistory.item_count || 0} 项</span>
                              </div>
                            </div>
                            <div className="grid gap-2 pt-2 sm:grid-cols-2">
                              <Button variant="secondary" onClick={handleOpenLatestContinue} className="h-11 rounded-[10px] text-[13px] font-bold">
                                {latestHistory.is_session ? "继续" : "预览"}
                              </Button>
                              <Button variant="secondary" onClick={handleOpenLatestReadonly} className="h-11 rounded-[10px] text-[13px] font-bold">
                                详情
                              </Button>
                            </div>
                            <Button variant="primary" onClick={() => void handleRestartLatest()} className="h-12 w-full rounded-[10px] text-[14px] font-black tracking-tight" disabled={!latestHistory.target_dir}>
                              以此开启新任务
                            </Button>
                          </div>
                        ) : (
                          <p className="text-[12px] leading-6 text-ui-muted opacity-50">还没有记录，开始整理后会显示在这里。</p>
                        )}
                     </div>

                     <div className="rounded-[16px] border border-primary/10 bg-primary/[0.02] p-5 lg:p-6 transition-all hover:bg-primary/[0.03]">
                         <div className="mb-5 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-primary">
                              <ShieldCheck className="h-4.5 w-4.5" />
                              <span className="text-[11px] font-black uppercase tracking-[0.25em]">当前任务策略预设</span>
                            </div>
                         </div>

                        <div className="space-y-4">
                           {launchPreferencesLoaded ? (
                               <div className="group relative">
                                 <div className="space-y-1.5">
                                   <p className="text-[15px] font-black tracking-tight text-on-surface">{currentTemplate.label}</p>
                                   <p className="text-[12px] leading-relaxed text-ui-muted/80">{currentTemplate.applicableScenarios}</p>
                                 </div>
                                 <div className="mt-4 flex flex-wrap gap-2">
                                   <span className="rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-[11px] font-black text-primary/80">{namingLabel}</span>
                                   <span className="rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-[11px] font-black text-primary/80">{cautionLabel}</span>
                                 </div>
                               </div>
                           ) : (
                             <div className="flex items-center gap-3 py-4 text-ui-muted">
                               <Loader2 className="h-4 w-4 animate-spin" />
                               <span className="text-[12px] font-bold">同步配置中...</span>
                             </div>
                           )}
                        </div>

                        <div className="mt-8 space-y-3 border-t border-on-surface/5 pt-6">
                           <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-ui-muted/50">
                              <span>扫描核心</span>
                              <span className="text-on-surface/40">启发式深度遍历</span>
                           </div>
                           <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-ui-muted/60">
                              <span>回退保护</span>
                              <span className="font-bold text-success-dim/80">Active (Journal)</span>
                           </div>
                        </div>
                     </div>

                     <div className="rounded-[16px] border border-on-surface/8 bg-on-surface/[0.02] p-5 transition-all hover:bg-on-surface/[0.03]">
                        <p className="text-[12px] font-bold leading-relaxed tracking-tight text-ui-muted/70">
                          {launchSkipPrompt 
                            ? "已开启快速直达模式。点击开始整理后，系统将按当前默认预设立即执行初始化扫描。"
                            : "当前处于配置确认模式。开始前仍会打开策略对话框，确认无误后开启 AI 分析。"}
                        </p>
                     </div>
                  </div>
               </div>
            </div>
          </section>
        </motion.div>
      </div>

      <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="mt-4"
            >
              <div className="rounded-[10px] border border-error/14 bg-error-container/14 px-5 py-4 text-[14px] font-semibold text-error">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <p className="leading-relaxed">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      <StrategyDialog
        open={strategyDialogOpen}
        loading={loading}
        targetDir={targetDir}
        strategy={draftStrategy}
        onClose={() => setStrategyDialogOpen(false)}
        onConfirm={() => void launchWithStrategy(draftStrategy)}
        onTemplateSelect={handleTemplateSelect}
        onChangeNaming={(id) => setDraftStrategy((prev) => ({ ...prev, naming_style: id }))}
        onChangeCaution={(id) => setDraftStrategy((prev) => ({ ...prev, caution_level: id }))}
        onChangeNote={(value) => setDraftStrategy((prev) => ({ ...prev, note: value }))}
      />

      <ResumePromptDialog
        open={!!resumePrompt}
        targetDir={targetDir}
        resumePrompt={resumePrompt}
        resumeStrategy={resumeStrategy}
        isCompletedResume={isCompletedResume}
        onConfirmResume={handleConfirmResume}
        onStartFresh={() => void handleStartFresh()}
        onReadOnlyView={handleReadOnlyView}
        onCancel={handleCancelResume}
      />
    </>
  );
}
