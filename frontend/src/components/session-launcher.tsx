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
  ImageIcon,
  Layers3,
  Loader2,
  Monitor,
  Music,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
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
  DENSITY_OPTIONS,
  getLaunchStrategyFromConfig,
  getSuggestedSelection,
  getTemplateMeta,
  LANGUAGE_OPTIONS,
  PREFIX_STYLE_OPTIONS,
  shouldSkipLaunchStrategyPrompt,
  STRATEGY_TEMPLATES,
} from "@/lib/strategy-templates";
import { HistoryItem, SessionSnapshot, SessionStrategySelection, SessionStrategySummary } from "@/types/session";
import { StrategySummaryChips } from "./launcher/strategy-summary-chips";
import { LaunchTransitionOverlay } from "./launcher/launch-transition-overlay";
import { StrategyDialog } from "./launcher/strategy-dialog";
import { ResumePromptDialog } from "./launcher/resume-prompt-dialog";


const DEFAULT_STRATEGY_SUMMARY: SessionStrategySummary = buildStrategySummary(DEFAULT_STRATEGY_SELECTION);

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
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [resumePrompt, setResumePrompt] = useState<{ sessionId: string; snapshot: SessionSnapshot } | null>(null);
  const [commonDirs, setCommonDirs] = useState<{ label: string; path: string }[]>([]);

  const resumeStrategy = resumePrompt?.snapshot.strategy || DEFAULT_STRATEGY_SUMMARY;
  const resumeStage = resumePrompt?.snapshot.stage;
  const isCompletedResume = resumeStage === "completed";
  const currentSummary = buildStrategySummary(savedLaunchStrategy);
  const currentTemplate = getTemplateMeta(savedLaunchStrategy.template_id);
  const languageLabel = currentSummary.language_label;
  const densityLabel = currentSummary.density_label;
  const prefixStyleLabel = currentSummary.prefix_style_label;
  const cautionLabel = currentSummary.caution_level_label;
  function getHistoryItemMeta(item: HistoryItem) {
    const name = item.target_dir?.replace(/[\\/]$/, "").split(/[\\/]/).pop() || "任务";
    const stage = item.is_session
      ? (item.status === "ready_to_execute" ? "等待执行" : item.status === "ready_for_precheck" ? "可开始预检" : item.status === "planning" ? "正在调整方案" : item.status === "scanning" ? "正在扫描" : item.status === "completed" ? "已完成" : item.status || "任务")
      : item.status === "rolled_back"
        ? "已回退"
        : item.status === "partial_failure"
          ? "部分完成"
          : item.status === "success"
            ? "已完成"
            : item.status || "任务";
    return { name, stage };
  }

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
          setHistoryItems(history.slice(0, 12));
        }
      } catch {
        if (!cancelled) {
          setHistoryItems([]);
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
      language: suggested.language,
      density: suggested.density,
      prefix_style: suggested.prefix_style,
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

  function handleHistoryItemClick(item: HistoryItem) {
    if (!item.is_session) {
      router.push("/history");
      return;
    }
    router.push(`/workspace?session_id=${item.execution_id}`);
  }

  function handleHistoryItemReadonly(item: HistoryItem) {
    if (!item.is_session) {
      router.push("/history");
      return;
    }
    router.push(`/workspace?session_id=${item.execution_id}&readonly=1`);
  }

  function handleOpenLatestContinue() {
    const latest = historyItems[0];
    if (!latest) {
      router.push("/history");
      return;
    }
    handleHistoryItemClick(latest);
  }

  function handleOpenLatestReadonly() {
    const latest = historyItems[0];
    if (!latest) {
      router.push("/history");
      return;
    }
    handleHistoryItemReadonly(latest);
  }

  async function handleRestartLatest() {
    const latest = historyItems[0];
    const nextTargetDir = latest?.target_dir?.trim();
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
      <div className="flex h-full w-full antialiased bg-surface">
        {/* Left Pane - Configuration */}
        <div className="flex flex-1 flex-col justify-start px-6 xl:px-10 overflow-y-auto">
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mx-auto max-w-[720px] w-full pt-10 pb-10">

            <div className="mb-6">
              <div className="pt-0.5">
                <h1 className="mb-1.5 text-[22px] font-black text-on-surface tracking-tight">开启新整理</h1>
                <p className="text-[13px] font-medium text-ui-muted/80 leading-relaxed">
                  选择目标目录与预设规则。AI 将在本地扫描结构，并为你生成安全、可视化的自动整理方案。
                </p>
              </div>
            </div>

            {/* List-style Settings Group */}
            <div className="overflow-hidden rounded-[8px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_12px_44px_rgba(0,0,0,0.06)]">

              {/* Item 1: Directory */}
              <div className="border-b border-on-surface/6 bg-on-surface/[0.015] p-5 lg:p-6 relative">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                    <FolderOpen className="h-3.5 w-3.5" />
                  </div>
                  <h2 className="font-headline text-[14px] font-bold tracking-tight text-on-surface">目标目录</h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <input
                      value={targetDir}
                      onChange={(event) => setTargetDir(event.target.value)}
                      disabled={loading}
                      className="h-10 w-full min-w-0 rounded-[8px] bg-on-surface/[0.03] border border-transparent px-3 text-[14px] font-bold text-on-surface outline-none placeholder:text-on-surface-variant/30 focus:bg-surface focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all"
                      placeholder="请选择文件夹,或在此手动输入路径"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handlePrimaryLaunch();
                      }}
                    />
                  </div>
                  <button
                    onClick={() => void handleSelectDir()}
                    disabled={loading}
                    className="shrink-0 h-10 px-5 rounded-[8px] text-[13px] font-black bg-on-surface/[0.04] text-on-surface hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
                  >
                    选择目录
                  </button>
                </div>

                {/* Quick links */}
                {commonDirs.length > 0 && (
                  <div className="flex gap-2.5 mt-3.5">
                    {commonDirs.map((dir) => {
                      const IconComponent =
                        dir.label === "下载" ? Download :
                          dir.label === "桌面" ? Monitor :
                            dir.label === "图片" ? ImageIcon :
                              dir.label === "视频" ? Video :
                                dir.label === "音乐" ? Music :
                                  FileText;
                      return (
                        <button
                          key={dir.path}
                          onClick={() => setTargetDir(dir.path)}
                          disabled={loading}
                          className="inline-flex items-center gap-1.5 rounded-[6px] bg-surface-container-low px-2.5 py-1 text-[11px] font-bold text-ui-muted hover:bg-surface border border-on-surface/5 hover:border-on-surface/10 hover:text-on-surface transition-all disabled:opacity-50"
                        >
                          <IconComponent className="h-3 w-3" />
                          {dir.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Item 2: Strategy */}
              <div className="p-5 lg:p-6 bg-surface-container-lowest flex flex-col sm:flex-row sm:items-start justify-between gap-6 relative">
                <div className="space-y-4 flex-1 min-w-0">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                        <Layers3 className="h-3.5 w-3.5" />
                      </div>
                      <h2 className="font-headline text-[14px] font-bold tracking-tight text-on-surface">预设策略与规则推演</h2>
                    </div>
                    <div className="flex flex-col xl:flex-row xl:items-center gap-2 xl:gap-3">
                      {launchPreferencesLoaded ? (
                        <>
                          <p className="text-[15px] font-bold text-on-surface shrink-0">{currentTemplate.label}</p>
                          <div className="h-1 w-1 rounded-full bg-on-surface/20 hidden xl:block"></div>
                          <p className="text-[13px] font-medium text-ui-muted min-w-0 pr-4 leading-relaxed">{currentTemplate.applicableScenarios}</p>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 py-0.5 text-ui-muted text-[13px] font-bold">
                          <Loader2 className="h-4 w-4 animate-spin" /> 同步配置中...
                        </div>
                      )}
                    </div>
                  </div>

                  {launchPreferencesLoaded && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-bold text-ui-muted/60 uppercase tracking-widest">主要生成分类目录示例</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {currentSummary.preview_directories?.slice(0, 6).map(dir => (
                          <span key={dir} className="inline-flex items-center rounded bg-on-surface/[0.04] px-1.5 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                            <FolderOpen className="w-3 h-3 mr-1.5 opacity-50" /> {dir}
                          </span>
                        ))}
                        {(currentSummary.preview_directories?.length || 0) > 6 && (
                          <span className="inline-flex items-center text-[11px] font-bold text-ui-muted/50 px-1">
                            等...
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between gap-2.5 shrink-0 pt-0.5">
                  <button
                    onClick={() => openStrategyDialog()}
                    disabled={loading || !targetDir.trim()}
                    className="flex shrink-0 items-center justify-center gap-1.5 h-9 px-4 rounded-[4px] border border-on-surface/8 bg-surface hover:bg-on-surface/5 text-[12px] font-bold text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50 shadow-sm"
                  >
                    修改规则 <ChevronRight className="h-3.5 w-3.5 opacity-70" />
                  </button>
                  <div className="flex flex-row sm:flex-col items-center sm:items-end gap-1.5 opacity-80 pt-1 pointer-events-none">
                    <span className="inline-flex rounded-[4px] bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-black tracking-widest text-primary uppercase border border-primary/5">{languageLabel}</span>
                    <span className="inline-flex rounded-[4px] bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-black tracking-widest text-primary uppercase border border-primary/5">{densityLabel}</span>
                    <span className="inline-flex rounded-[4px] bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-black tracking-widest text-primary uppercase border border-primary/5">{prefixStyleLabel}</span>
                    <span className="inline-flex rounded-[4px] bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-black tracking-widest text-primary uppercase border border-primary/5">{cautionLabel}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-end gap-6 sm:pl-4">
              <div className="flex-1 text-center sm:text-left">
                {launchSkipPrompt && (
                  <p className="text-[12px] font-bold text-primary/80 flex items-center justify-center sm:justify-start gap-1.5">
                    <Sparkles className="w-4 h-4" /> 快速直达已开启
                  </p>
                )}
              </div>
              <Button
                variant="primary"
                onClick={() => void handlePrimaryLaunch()}
                disabled={loading || !targetDir.trim()}
                loading={loading}
                className="h-10 w-full sm:w-auto min-w-[160px] rounded-[4px] text-[13px] font-bold shadow-sm"
              >
                {loading ? "正在启动..." : "开始整理分析"}
                {!loading && <ArrowRight className="ml-1.5 h-4 w-4" />}
              </Button>
            </div>

          </motion.div>
        </div>

        {/* Right Pane - History Sidebar */}
        <div className="w-[280px] 2xl:w-[320px] shrink-0 border-l border-on-surface/8 bg-surface-container-lowest flex flex-col">
          <div className="px-5 py-4 border-b border-on-surface/6 bg-on-surface/[0.015]">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                <History className="h-3.5 w-3.5" />
              </div>
              <h2 className="font-headline text-[14px] font-bold tracking-tight text-on-surface">历史会话流</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-2 scrollbar-thin">
            {historyLoading ? (
              <div className="flex items-center justify-center p-8 opacity-50">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : historyItems.length > 0 ? (
              historyItems.map((item) => {
                const { name, stage } = getHistoryItemMeta(item);
                return (
                  <div
                    key={item.execution_id}
                    className="group relative flex flex-col gap-1.5 rounded-[8px] bg-surface p-3 border border-on-surface/8 hover:border-primary/30 hover:bg-primary/[0.02] cursor-pointer transition-colors shadow-sm"
                    onClick={() => handleHistoryItemClick(item)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate text-[13px] font-bold text-on-surface pr-2">{name}</span>
                      <span className="shrink-0 text-[10px] font-black uppercase text-primary/70">{stage}</span>
                    </div>
                    <div className="text-[11px] font-medium text-ui-muted font-mono truncate opacity-60">
                      {item.target_dir}
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-on-surface-variant/50">{item.item_count || 0} 项</span>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 pt-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleHistoryItemReadonly(item); }}
                          className="rounded bg-surface-container-low px-2 py-1 text-[10px] font-bold text-on-surface hover:text-primary transition-colors"
                        >
                          详情
                        </button>
                        {item.is_session && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleHistoryItemClick(item); }}
                            className="rounded bg-primary px-2 py-1 text-[10px] font-bold text-white shadow-sm transition-colors hover:bg-primary-dim"
                          >
                            恢复
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-on-surface/[0.03] text-on-surface/20">
                  <History className="h-5 w-5" />
                </div>
                <p className="text-[12px] font-bold text-on-surface/30">暂无任务流水记录</p>
                <p className="mt-1 text-[11px] font-medium text-on-surface/20">开启整理后将在此显示</p>
              </div>
            )}

          </div>
        </div>
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
        onChangeLanguage={(id) => setDraftStrategy((prev) => ({ ...prev, language: id }))}
        onChangeDensity={(id) => setDraftStrategy((prev) => ({ ...prev, density: id }))}
        onChangePrefixStyle={(id) => setDraftStrategy((prev) => ({ ...prev, prefix_style: id }))}
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
