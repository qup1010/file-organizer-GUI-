"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Download,
  FileText,
  FolderOpen,
  History,
  ImageIcon,
  Layers3,
  Loader2,
  Monitor,
  Music,
  Sparkles,
  Video,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getSessionStageView } from "@/lib/session-view-model";
import { getFriendlyStage, getFriendlyStatus } from "@/lib/utils";
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
  STRATEGY_TEMPLATES,
  taskTypeForOrganizeMode,
} from "@/lib/strategy-templates";
import { HistoryItem, SessionSnapshot, SessionStrategySelection, SessionStrategySummary } from "@/types/session";
import { StrategySummaryChips } from "./launcher/strategy-summary-chips";
import { LaunchTransitionOverlay } from "./launcher/launch-transition-overlay";
import { ResumePromptDialog } from "./launcher/resume-prompt-dialog";

const DEFAULT_STRATEGY_SUMMARY: SessionStrategySummary = buildStrategySummary(DEFAULT_STRATEGY_SELECTION);

export function SessionLauncher() {
  const router = useRouter();
  const apiBaseUrl = getApiBaseUrl();
  const [targetDir, setTargetDir] = useState("");
  const [strategy, setStrategy] = useState<SessionStrategySelection>(DEFAULT_STRATEGY_SELECTION);
  const [launchPreferencesLoaded, setLaunchPreferencesLoaded] = useState(false);
  const [textModelConfigured, setTextModelConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [launchTransitionOpen, setLaunchTransitionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [resumePrompt, setResumePrompt] = useState<{ sessionId: string; snapshot: SessionSnapshot } | null>(null);
  const [commonDirs, setCommonDirs] = useState<{ label: string; path: string }[]>([]);

  const resumeStrategy = resumePrompt?.snapshot.strategy || DEFAULT_STRATEGY_SUMMARY;
  const resumeStage = resumePrompt?.snapshot.stage;
  const resumeStageView = useMemo(
    () => (resumeStage ? getSessionStageView(resumeStage) : null),
    [resumeStage],
  );
  const isCompletedResume = Boolean(resumeStageView?.isCompleted);
  const currentSummary = buildStrategySummary(strategy);
  const currentTemplate = getTemplateMeta(strategy.template_id);
  const isIncrementalStrategy = strategy.organize_mode === "incremental";
  const cautionLabel = currentSummary.caution_level_label;
  const primaryLaunchLabel = isIncrementalStrategy ? "下一步：选择目标目录" : "开始扫描与分析";

  function updateStrategy(updater: (previous: SessionStrategySelection) => SessionStrategySelection) {
    setStrategy((previous) => updater(previous));
  }

  function getHistoryItemMeta(item: HistoryItem) {
    const name = item.target_dir?.replace(/[\\/]$/, "").split(/[\\/]/).pop() || "任务";
    const stage = item.is_session ? getFriendlyStage(item.status) : getFriendlyStatus(item.status);
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
        const nextStrategy = getLaunchStrategyFromConfig(data.global_config);
        setStrategy(nextStrategy);
        setTextModelConfigured(Boolean(data.status?.text_configured));
        setLaunchPreferencesLoaded(true);
      } catch {
        if (cancelled) {
          return;
        }
        setStrategy(DEFAULT_STRATEGY_SELECTION);
        setTextModelConfigured(true);
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
        if (!cancelled) {
          setCommonDirs(dirs);
        }
      } catch {
        // ignore
      }
    }
    void loadCommonDirs();
    return () => {
      cancelled = true;
    };
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
    } catch {
      setError(isTauriDesktop() ? "没有打开目录选择窗口，请再试一次。" : "现在还不能打开目录选择器，请检查本地服务是否正常运行。");
    } finally {
      setLoading(false);
    }
  }

  async function launchWithStrategy(nextStrategy: SessionStrategySelection, dirOverride?: string) {
    const nextTargetDir = (dirOverride ?? targetDir).trim();
    if (!nextTargetDir) {
      setError("请先选择一个需要整理的目录。");
      return;
    }
    setLoading(true);
    setLaunchTransitionOpen(true);
    setError(null);
    try {
      const api = createApiClient(apiBaseUrl, getApiToken());
      const response = await createSessionAndStartScan(api, nextTargetDir, true, nextStrategy);
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
    if (!textModelConfigured) {
      setError("请先在设置中配置文本模型，然后再开始整理分析。");
      return;
    }
    await launchWithStrategy(strategy);
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

  async function handleStartFresh() {
    if (!resumePrompt) {
      return;
    }
    setLoading(true);
    setLaunchTransitionOpen(true);
    setError(null);
    try {
      const api = createApiClient(apiBaseUrl, getApiToken());
      const response = await startFreshSession(
        api,
        resumePrompt.sessionId,
        targetDir,
        strategy,
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
    if (!resumePrompt) {
      return;
    }
    router.push(`/workspace?session_id=${resumePrompt.sessionId}&dir=${encodeURIComponent(targetDir)}`);
  }

  function handleReadOnlyView() {
    if (!resumePrompt) {
      return;
    }
    router.push(`/workspace?session_id=${resumePrompt.sessionId}&dir=${encodeURIComponent(targetDir)}&readonly=1`);
  }

  return (
    <>
      <LaunchTransitionOverlay open={launchTransitionOpen} targetDir={targetDir} />
      <div className="flex h-full w-full antialiased bg-surface">
        <div className="flex flex-1 flex-col justify-start overflow-y-auto px-6 xl:px-10">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mx-auto w-full max-w-[760px] pt-10 pb-10"
          >
            <div className="mb-6">
              <div className="pt-0.5">
                <h1 className="mb-1.5 text-[22px] font-black tracking-tight text-on-surface">开启新整理</h1>
                <p className="text-[13px] font-medium leading-relaxed text-ui-muted/80">
                  先选择任务类型，再补充本轮必要配置。系统会沿用当前后端流程继续创建会话、扫描和进入工作台。
                </p>
              </div>
            </div>

            {!textModelConfigured ? (
              <div className="mb-5 flex items-center justify-between gap-4 rounded-[8px] border border-warning/18 bg-warning-container/18 px-5 py-4 shadow-[0_12px_32px_rgba(0,0,0,0.04)]">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/12 text-warning">
                    <AlertTriangle className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-black tracking-tight text-on-surface">AI 文本模型尚未配置</p>
                    <p className="mt-1 text-[12px] font-medium leading-6 text-ui-muted">
                      未配置文本模型时，系统只能扫描目录结构，无法稳定完成用途分析和整理规划。建议先前往“设置 &gt; 文本模型”完成配置。
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/settings")}
                  className="shrink-0 rounded-[6px] border border-warning/15 bg-surface px-4 py-2 text-[12px] font-black text-on-surface transition-colors hover:border-warning/30 hover:text-warning"
                >
                  去配置文本模型
                </button>
              </div>
            ) : null}

            <AnimatePresence>
              {error ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="mb-5"
                >
                  <div className="rounded-[10px] border border-error/14 bg-error-container/14 px-5 py-4 text-error">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                      <p className="text-[14px] font-semibold leading-relaxed">{error}</p>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="space-y-5">
              <section className="overflow-hidden rounded-[8px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_12px_44px_rgba(0,0,0,0.06)]">
                <div className="border-b border-on-surface/6 bg-on-surface/[0.015] p-5 lg:p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                      <Layers3 className="h-3.5 w-3.5" />
                    </div>
                    <h2 className="font-headline text-[14px] font-bold tracking-tight text-on-surface">第一步：选择任务类型</h2>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      {
                        organize_mode: "initial" as const,
                        label: "整理整个目录",
                        description: "适合整体整理当前目录，系统会直接扫描并生成完整整理方案。",
                      },
                      {
                        organize_mode: "incremental" as const,
                        label: "归入已有目录",
                        description: "适合把散落内容归入现有目录体系，下一步会进入目标目录选择。",
                      },
                    ].map((option) => {
                      const active = strategy.organize_mode === option.organize_mode;
                      return (
                        <button
                          key={option.organize_mode}
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            updateStrategy((previous) => ({
                              ...previous,
                              organize_mode: option.organize_mode,
                              task_type: taskTypeForOrganizeMode(option.organize_mode),
                            }))
                          }
                          className={[
                            "rounded-[8px] border px-4 py-4 text-left transition-all disabled:opacity-50",
                            active
                              ? "border-primary/25 bg-primary/10 shadow-sm"
                              : "border-on-surface/8 bg-surface hover:border-primary/20 hover:bg-surface-container-low",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className={active ? "text-[14px] font-black text-primary" : "text-[14px] font-black text-on-surface"}>
                              {option.label}
                            </p>
                            {active ? <Sparkles className="h-4 w-4 text-primary" /> : null}
                          </div>
                          <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-ui-muted">{option.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-5 lg:p-6">
                  <div className="rounded-[8px] border border-on-surface/8 bg-surface px-4 py-4">
                    <div className="flex flex-col gap-2">
                      <p className="text-[15px] font-bold text-on-surface">{currentSummary.task_type_label}</p>
                      <p className="text-[13px] font-medium leading-relaxed text-ui-muted">
                        {isIncrementalStrategy
                          ? "先选择目标目录，再扫描剩余根级条目，并将它们归入目标目录结构。"
                          : currentTemplate.applicableScenarios}
                      </p>
                      <StrategySummaryChips strategy={currentSummary} />
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-[8px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_12px_44px_rgba(0,0,0,0.06)]">
                <div className="border-b border-on-surface/6 bg-on-surface/[0.015] p-5 lg:p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                      <FolderOpen className="h-3.5 w-3.5" />
                    </div>
                    <h2 className="font-headline text-[14px] font-bold tracking-tight text-on-surface">第二步：选择目标目录</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        value={targetDir}
                        onChange={(event) => setTargetDir(event.target.value)}
                        disabled={loading}
                        className="h-10 w-full min-w-0 rounded-[8px] border border-transparent bg-on-surface/[0.03] px-3 text-[14px] font-bold text-on-surface outline-none transition-all placeholder:text-on-surface-variant/30 focus:border-primary/40 focus:bg-surface focus:ring-4 focus:ring-primary/10"
                        placeholder="请选择文件夹，或在此手动输入路径"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            void handlePrimaryLaunch();
                          }
                        }}
                      />
                    </div>
                    <button
                      onClick={() => void handleSelectDir()}
                      disabled={loading}
                      className="h-10 shrink-0 rounded-[8px] bg-on-surface/[0.04] px-5 text-[13px] font-black text-on-surface transition-all hover:bg-primary/10 hover:text-primary active:scale-95"
                    >
                      选择目录
                    </button>
                  </div>

                  {commonDirs.length > 0 ? (
                    <div className="mt-3.5 flex gap-2.5">
                      {commonDirs.map((dir) => {
                        const IconComponent =
                          dir.label === "下载"
                            ? Download
                            : dir.label === "桌面"
                              ? Monitor
                              : dir.label === "图片"
                                ? ImageIcon
                                : dir.label === "视频"
                                  ? Video
                                  : dir.label === "音乐"
                                    ? Music
                                    : FileText;
                        return (
                          <button
                            key={dir.path}
                            onClick={() => setTargetDir(dir.path)}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 rounded-[6px] border border-on-surface/5 bg-surface-container-low px-2.5 py-1 text-[11px] font-bold text-ui-muted transition-all hover:border-on-surface/10 hover:bg-surface hover:text-on-surface disabled:opacity-50"
                          >
                            <IconComponent className="h-3 w-3" />
                            {dir.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-5 p-5 lg:p-6">
                  {isIncrementalStrategy ? (
                    <>
                      <div className="rounded-[8px] border border-on-surface/8 bg-surface px-4 py-4">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">当前任务说明</div>
                        <p className="text-[13px] font-medium leading-relaxed text-ui-muted">
                          本任务会先让你选择目标目录，再把剩余根级条目作为待整理项进行规划。优先复用已有目录结构，但必要时仍可创建新的顶级目录。
                        </p>
                      </div>

                      <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">目标目录深度</div>
                        <div className="grid gap-2 md:grid-cols-3">
                          {[1, 2, 3].map((depth) => {
                            const active = strategy.destination_index_depth === depth;
                            return (
                              <button
                                key={depth}
                                type="button"
                                onClick={() =>
                                  updateStrategy((previous) => ({
                                    ...previous,
                                    destination_index_depth: depth as SessionStrategySelection["destination_index_depth"],
                                  }))
                                }
                                disabled={loading}
                                className={[
                                  "rounded-[8px] border px-3 py-3 text-left transition-all disabled:opacity-50",
                                  active
                                    ? "border-primary/25 bg-primary/10 shadow-sm"
                                    : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                                ].join(" ")}
                              >
                                <p className={active ? "text-[12px] font-bold text-primary" : "text-[12px] font-bold text-on-surface"}>
                                  目标目录深度 {depth}
                                </p>
                                <p className="mt-0.5 text-[11px] leading-[1.5] text-ui-muted/80">读取已有目录结构到第 {depth} 层。</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">归档倾向</div>
                        <div className="grid gap-2">
                          {CAUTION_LEVEL_OPTIONS.map((option) => {
                            const active = strategy.caution_level === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => updateStrategy((previous) => ({ ...previous, caution_level: option.id }))}
                                disabled={loading}
                                className={[
                                  "rounded-[8px] border px-3 py-2.5 text-left transition-all disabled:opacity-50",
                                  active
                                    ? "border-primary/25 bg-primary/10 shadow-sm"
                                    : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                                ].join(" ")}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>
                                    {option.label}
                                  </p>
                                </div>
                                <p className="mt-0.5 text-[11px] leading-[1.5] text-ui-muted/80">{option.description}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                        <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">整理模板</div>
                          <div className="space-y-2">
                            {STRATEGY_TEMPLATES.map((template) => {
                              const active = strategy.template_id === template.id;
                              return (
                                <button
                                  key={template.id}
                                  type="button"
                                  onClick={() => {
                                    const suggested = getSuggestedSelection(template.id);
                                    updateStrategy((previous) => ({
                                      ...previous,
                                      template_id: template.id,
                                      language: suggested.language,
                                      density: suggested.density,
                                      prefix_style: suggested.prefix_style,
                                      caution_level: suggested.caution_level,
                                    }));
                                  }}
                                  disabled={loading}
                                  className={[
                                    "flex w-full flex-col rounded-[8px] border px-3 py-2.5 text-left transition-all disabled:opacity-50",
                                    active
                                      ? "border-primary/25 bg-primary/10 shadow-sm"
                                      : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                                  ].join(" ")}
                                >
                                  <p className={active ? "text-[13px] font-bold text-primary" : "text-[13px] font-bold text-on-surface"}>
                                    {template.label}
                                  </p>
                                  <p className="mt-0.5 text-[11px] leading-[1.5] text-ui-muted">{template.applicableScenarios}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-[8px] border border-on-surface/8 bg-surface px-4 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-primary/12 bg-primary/8 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                                {currentTemplate.label}
                              </span>
                              <span className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                                {currentSummary.language_label}
                              </span>
                              <span className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                                {currentSummary.density_label}
                              </span>
                              <span className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                                {currentSummary.prefix_style_label}
                              </span>
                              <span className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                                {currentSummary.caution_level_label}
                              </span>
                            </div>
                            <p className="mt-2.5 text-[13px] leading-relaxed text-ui-muted">{currentTemplate.description}</p>
                            <div className="mt-4 rounded-[8px] border border-on-surface/8 bg-surface-container-lowest px-3.5 py-2.5">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ui-muted/60">预计目录结构</div>
                              <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {currentSummary.preview_directories?.map((directory) => (
                                  <span
                                    key={`${strategy.template_id}-${strategy.language}-${strategy.density}-${strategy.prefix_style}-${directory}`}
                                    className="rounded-[4px] border border-on-surface/8 bg-surface px-2 py-0.5 text-[11px] font-semibold text-on-surface"
                                  >
                                    {directory}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">目录语言</div>
                              <div className="grid gap-2">
                                {LANGUAGE_OPTIONS.map((option) => {
                                  const active = strategy.language === option.id;
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => updateStrategy((previous) => ({ ...previous, language: option.id }))}
                                      disabled={loading}
                                      className={[
                                        "rounded-[8px] border px-3 py-2.5 text-left transition-all disabled:opacity-50",
                                        active
                                          ? "border-primary/25 bg-primary/10 shadow-sm"
                                          : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                                      ].join(" ")}
                                    >
                                      <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>
                                        {option.label}
                                      </p>
                                      <p className="mt-0.5 text-[11px] leading-[1.5] text-ui-muted/80">{option.description}</p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">分类粒度</div>
                              <div className="grid gap-2">
                                {DENSITY_OPTIONS.map((option) => {
                                  const active = strategy.density === option.id;
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => updateStrategy((previous) => ({ ...previous, density: option.id }))}
                                      disabled={loading}
                                      className={[
                                        "rounded-[8px] border px-3 py-2.5 text-left transition-all disabled:opacity-50",
                                        active
                                          ? "border-primary/25 bg-primary/10 shadow-sm"
                                          : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                                      ].join(" ")}
                                    >
                                      <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>
                                        {option.label}
                                      </p>
                                      <p className="mt-0.5 text-[11px] leading-[1.5] text-ui-muted/80">{option.description}</p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">目录前缀</div>
                              <div className="grid gap-2">
                                {PREFIX_STYLE_OPTIONS.map((option) => {
                                  const active = strategy.prefix_style === option.id;
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => updateStrategy((previous) => ({ ...previous, prefix_style: option.id }))}
                                      disabled={loading}
                                      className={[
                                        "rounded-[8px] border px-3 py-2.5 text-left transition-all disabled:opacity-50",
                                        active
                                          ? "border-primary/25 bg-primary/10 shadow-sm"
                                          : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                                      ].join(" ")}
                                    >
                                      <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>
                                        {option.label}
                                      </p>
                                      <p className="mt-0.5 text-[11px] leading-[1.5] text-ui-muted/80">{option.description}</p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">整理方式</div>
                              <div className="grid gap-2">
                                {CAUTION_LEVEL_OPTIONS.map((option) => {
                                  const active = strategy.caution_level === option.id;
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => updateStrategy((previous) => ({ ...previous, caution_level: option.id }))}
                                      disabled={loading}
                                      className={[
                                        "rounded-[8px] border px-3 py-2.5 text-left transition-all disabled:opacity-50",
                                        active
                                          ? "border-primary/25 bg-primary/10 shadow-sm"
                                          : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                                      ].join(" ")}
                                    >
                                      <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>
                                        {option.label}
                                      </p>
                                      <p className="mt-0.5 text-[11px] leading-[1.5] text-ui-muted/80">{option.description}</p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">补充说明</div>
                      <span className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-2 py-0.5 text-[10px] font-semibold text-ui-muted/50">可选</span>
                    </div>
                    <textarea
                      value={strategy.note}
                      disabled={loading}
                      onChange={(event) => updateStrategy((previous) => ({ ...previous, note: event.target.value.slice(0, 200) }))}
                      placeholder="例如：项目文件尽量放在一起；拿不准的先放 Review。"
                      className="min-h-[70px] w-full resize-none rounded-[10px] border border-on-surface/8 bg-surface-container-low px-4 py-3 text-[13px] leading-relaxed text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary/30"
                    />
                    <div className="mt-3 flex items-start gap-3 rounded-[8px] border border-primary/10 bg-primary/4 p-2.5">
                      <div className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-[6px] border border-primary/10 bg-primary/10 text-primary shadow-sm">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-[11px] leading-tight text-primary/80">
                        只补充会影响结果的偏好，例如“拿不准的先放 Review”“课程资料按学期整理”。
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <div className="mt-6 flex flex-col items-center justify-end gap-6 sm:flex-row sm:pl-4">
                <div className="flex-1 text-center sm:text-left">
                  {!textModelConfigured ? (
                    <p className="flex items-center justify-center gap-1.5 text-[12px] font-bold text-warning sm:justify-start">
                      <AlertTriangle className="h-4 w-4" /> 未配置文本模型前，不能启动整理分析
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="primary"
                  onClick={() => void handlePrimaryLaunch()}
                  disabled={loading || !targetDir.trim() || !textModelConfigured}
                  loading={loading}
                  className="h-10 w-full min-w-[180px] rounded-[4px] text-[13px] font-bold shadow-sm sm:w-auto"
                >
                  {loading ? "正在启动..." : primaryLaunchLabel}
                  {!loading ? <ArrowRight className="ml-1.5 h-4 w-4" /> : null}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="flex w-[280px] shrink-0 flex-col border-l border-on-surface/8 bg-surface-container-lowest 2xl:w-[320px]">
          <div className="border-b border-on-surface/6 bg-on-surface/[0.015] px-5 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                <History className="h-3.5 w-3.5" />
              </div>
              <h2 className="font-headline text-[14px] font-bold tracking-tight text-on-surface">历史会话流</h2>
            </div>
          </div>

          <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-3.5 py-4">
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
                    className="group relative flex cursor-pointer flex-col gap-1.5 rounded-[8px] border border-on-surface/8 bg-surface p-3 shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/[0.02]"
                    onClick={() => handleHistoryItemClick(item)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate pr-2 text-[13px] font-bold text-on-surface">{name}</span>
                      <span className="shrink-0 text-[10px] font-black uppercase text-primary/70">{stage}</span>
                    </div>
                    <div className="truncate font-mono text-[11px] font-medium text-ui-muted opacity-60">{item.target_dir}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-on-surface-variant/50">{item.item_count || 0} 项</span>
                      <div className="flex items-center gap-1.5 pt-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleHistoryItemReadonly(item);
                          }}
                          className="rounded bg-surface-container-low px-2 py-1 text-[10px] font-bold text-on-surface transition-colors hover:text-primary"
                        >
                          详情
                        </button>
                        {item.is_session ? (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleHistoryItemClick(item);
                            }}
                            className="rounded bg-primary px-2 py-1 text-[10px] font-bold text-white shadow-sm transition-colors hover:bg-primary-dim"
                          >
                            恢复
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
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
