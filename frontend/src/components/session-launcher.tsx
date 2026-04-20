"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FileText,
  FolderOpen,
  History,
  Layers3,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { createApiClient } from "@/lib/api";
import {
  firstSourcePath,
  createSessionAndStartScan,
  startFreshSession,
} from "@/lib/session-launcher-actions";
import {
  getApiBaseUrl,
  getApiToken,
  isTauriDesktop,
  pickDirectoryWithTauri,
  pickDirectoriesWithTauri,
  pickFilesWithTauri,
} from "@/lib/runtime";
import { getSessionStageView } from "@/lib/session-view-model";
import {
  buildStrategySummary,
  CAUTION_LEVEL_OPTIONS,
  DEFAULT_STRATEGY_SELECTION,
  DENSITY_OPTIONS,
  getLaunchStrategyFromConfig,
  getTemplateMeta,
  LANGUAGE_OPTIONS,
  PREFIX_STYLE_OPTIONS,
  STRATEGY_TEMPLATES,
} from "@/lib/strategy-templates";
import { getFriendlyStage, getFriendlyStatus } from "@/lib/utils";
import type {
  HistoryItem,
  OrganizeMethod,
  SessionSnapshot,
  SessionSourceSelection,
  SessionStrategySelection,
  SessionStrategySummary,
  TargetProfile,
  TargetProfileDirectory,
} from "@/types/session";
import { Button } from "@/components/ui/button";
import { LaunchTransitionOverlay } from "./launcher/launch-transition-overlay";
import { ResumePromptDialog } from "./launcher/resume-prompt-dialog";
import { StrategySummaryChips } from "./launcher/strategy-summary-chips";

type SourceDraftType = "directory" | "file";

type TargetDirectoryDraft = {
  path: string;
  label: string;
};

type LaunchRequestState = {
  sources: SessionSourceSelection[];
  resume_if_exists: boolean;
  organize_method: OrganizeMethod;
  strategy: SessionStrategySelection;
  output_dir?: string;
  target_profile_id?: string;
  target_directories?: string[];
  new_directory_root?: string;
  review_root?: string;
  display_path: string;
};

const DEFAULT_STRATEGY_SUMMARY: SessionStrategySummary = buildStrategySummary(DEFAULT_STRATEGY_SELECTION);

function dedupeSources(items: SessionSourceSelection[]): SessionSourceSelection[] {
  const seen = new Set<string>();
  const result: SessionSourceSelection[] = [];
  for (const item of items) {
    const path = item.path.trim();
    if (!path) {
      continue;
    }
    const key = `${item.source_type}:${path.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ source_type: item.source_type, path });
  }
  return result;
}

function dedupeTargetDirectories(items: TargetProfileDirectory[]): TargetProfileDirectory[] {
  const seen = new Set<string>();
  const result: TargetProfileDirectory[] = [];
  for (const item of items) {
    const path = item.path.trim();
    if (!path) {
      continue;
    }
    const key = path.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ path, label: item.label?.trim() || "" });
  }
  return result;
}

function strategyForMethod(previous: SessionStrategySelection, organizeMethod: OrganizeMethod): SessionStrategySelection {
  if (organizeMethod === "assign_into_existing_categories") {
    return {
      ...previous,
      organize_mode: "incremental",
      task_type: "organize_into_existing",
      organize_method: organizeMethod,
    };
  }
  return {
    ...previous,
    organize_mode: "initial",
    task_type: "organize_full_directory",
    organize_method: organizeMethod,
  };
}

export function SessionLauncher() {
  const router = useRouter();
  const apiBaseUrl = getApiBaseUrl();

  const [step, setStep] = useState<1 | 2>(1);
  const [strategy, setStrategy] = useState<SessionStrategySelection>(DEFAULT_STRATEGY_SELECTION);
  const [sources, setSources] = useState<SessionSourceSelection[]>([]);
  const [sourceDraftType, setSourceDraftType] = useState<SourceDraftType>("directory");
  const [sourceDraftPath, setSourceDraftPath] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [newDirectoryRoot, setNewDirectoryRoot] = useState("");
  const [reviewRoot, setReviewRoot] = useState("");
  const [manualTargetDirectories, setManualTargetDirectories] = useState<TargetDirectoryDraft[]>([]);
  const [targetDirectoryDraft, setTargetDirectoryDraft] = useState("");
  const [selectedTargetProfileId, setSelectedTargetProfileId] = useState("");
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [targetProfiles, setTargetProfiles] = useState<TargetProfile[]>([]);
  const [targetProfilesLoading, setTargetProfilesLoading] = useState(false);
  const [textModelConfigured, setTextModelConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [launchTransitionOpen, setLaunchTransitionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [resumePrompt, setResumePrompt] = useState<{ sessionId: string; snapshot: SessionSnapshot; launch: LaunchRequestState } | null>(null);
  const [commonDirs, setCommonDirs] = useState<{ label: string; path: string }[]>([]);

  const organizeMethod = strategy.organize_method || "categorize_into_new_structure";
  const isAssignExisting = organizeMethod === "assign_into_existing_categories";
  const isFullCategorize = !isAssignExisting;
  const effectiveNewDirectoryRoot = useMemo(
    () => (isFullCategorize ? (newDirectoryRoot.trim() || outputDir.trim()) : newDirectoryRoot.trim()),
    [isFullCategorize, newDirectoryRoot, outputDir],
  );
  const effectiveReviewRoot = useMemo(() => {
    const explicit = reviewRoot.trim();
    if (explicit) return explicit;
    return effectiveNewDirectoryRoot ? `${effectiveNewDirectoryRoot.replace(/[\\/]$/, "")}/Review` : "";
  }, [effectiveNewDirectoryRoot, reviewRoot]);
  const currentSummary = useMemo(
    () =>
      buildStrategySummary({
        ...strategy,
        organize_method: organizeMethod,
        output_dir: outputDir,
        target_profile_id: selectedTargetProfileId || undefined,
        new_directory_root: effectiveNewDirectoryRoot || undefined,
        review_root: effectiveReviewRoot || undefined,
      }),
    [effectiveNewDirectoryRoot, effectiveReviewRoot, organizeMethod, outputDir, selectedTargetProfileId, strategy],
  );
  const currentTemplate = getTemplateMeta(strategy.template_id);

  const selectedProfile = useMemo(
    () => targetProfiles.find((item) => item.profile_id === selectedTargetProfileId) || null,
    [selectedTargetProfileId, targetProfiles],
  );
  const profileDirectories = selectedProfile?.directories || [];
  const effectiveTargetDirectories = useMemo(
    () =>
      dedupeTargetDirectories([
        ...profileDirectories,
        ...manualTargetDirectories.map((item) => ({ path: item.path, label: item.label })),
      ]),
    [manualTargetDirectories, profileDirectories],
  );

  const resumeStrategy = resumePrompt?.snapshot.strategy || DEFAULT_STRATEGY_SUMMARY;
  const resumeStage = resumePrompt?.snapshot.stage;
  const resumeStageView = useMemo(
    () => (resumeStage ? getSessionStageView(resumeStage) : null),
    [resumeStage],
  );
  const isCompletedResume = Boolean(resumeStageView?.isCompleted);
  const primaryLaunchLabel = isAssignExisting ? "开始扫描并进入目标确认" : "开始扫描与分析";
  const displayPath = isFullCategorize ? outputDir.trim() || firstSourcePath(sources) : firstSourcePath(sources);

  useEffect(() => {
    let cancelled = false;

    async function loadLaunchPreferences() {
      try {
        const api = createApiClient(apiBaseUrl, getApiToken());
        const data = await api.getSettings();
        if (cancelled) {
          return;
        }
        setStrategy(getLaunchStrategyFromConfig(data.global_config));
        setTextModelConfigured(Boolean(data.status?.text_configured));
      } catch {
        if (!cancelled) {
          setStrategy(DEFAULT_STRATEGY_SELECTION);
          setTextModelConfigured(true);
        }
      } finally {
        // no-op
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
        if (!cancelled) {
          setCommonDirs([]);
        }
      }
    }

    void loadCommonDirs();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadTargetProfiles() {
      setTargetProfilesLoading(true);
      try {
        const api = createApiClient(apiBaseUrl, getApiToken());
        const items = await api.getTargetProfiles();
        if (!cancelled) {
          setTargetProfiles(items);
        }
      } catch {
        if (!cancelled) {
          setTargetProfiles([]);
        }
      } finally {
        if (!cancelled) {
          setTargetProfilesLoading(false);
        }
      }
    }

    void loadTargetProfiles();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  function getHistoryItemMeta(item: HistoryItem) {
    const name = item.target_dir?.replace(/[\\/]$/, "").split(/[\\/]/).pop() || "任务";
    const stage = item.is_session ? getFriendlyStage(item.status) : getFriendlyStatus(item.status);
    return { name, stage };
  }

  function updateStrategy(updater: (previous: SessionStrategySelection) => SessionStrategySelection) {
    setStrategy((previous) => updater(previous));
  }

  function addSources(nextItems: SessionSourceSelection[]) {
    setSources((previous) => dedupeSources([...previous, ...nextItems]));
  }

  function removeSource(path: string, sourceType: SourceDraftType) {
    setSources((previous) => previous.filter((item) => !(item.path === path && item.source_type === sourceType)));
  }

  function addManualSource() {
    const path = sourceDraftPath.trim();
    if (!path) {
      setError("请先输入文件或目录路径。");
      return;
    }
    addSources([{ source_type: sourceDraftType, path }]);
    setSourceDraftPath("");
    setError(null);
  }

  async function handleAddDirectories() {
    setError(null);
    if (isTauriDesktop()) {
      const paths = await pickDirectoriesWithTauri();
      if (paths?.length) {
        addSources(paths.map((path) => ({ source_type: "directory" as const, path })));
      }
      return;
    }

    try {
      const api = createApiClient(apiBaseUrl, getApiToken());
      const response = await api.selectDir();
      if (response.path) {
        addSources([{ source_type: "directory", path: response.path }]);
      }
    } catch {
      setError("现在还不能打开目录选择器，请检查本地服务是否正常运行。");
    }
  }

  async function handleAddFiles() {
    setError(null);
    if (!isTauriDesktop()) {
      setError("当前仅桌面环境支持文件批量选择。你仍然可以手动输入文件路径。");
      return;
    }

    const paths = await pickFilesWithTauri();
    if (paths?.length) {
      addSources(paths.map((path) => ({ source_type: "file" as const, path })));
    }
  }

  function addManualTargetDirectory() {
    const path = targetDirectoryDraft.trim();
    if (!path) {
      setError("请先输入目标目录路径。");
      return;
    }
    setManualTargetDirectories((previous) => {
      const next = dedupeTargetDirectories([...previous, { path, label: "" }]);
      return next.map((item) => ({ path: item.path, label: item.label || "" }));
    });
    setTargetDirectoryDraft("");
    setError(null);
  }

  async function handleAddTargetDirectories() {
    setError(null);
    if (isTauriDesktop()) {
      const paths = await pickDirectoriesWithTauri();
      if (paths?.length) {
        setManualTargetDirectories((previous) => {
          const next = dedupeTargetDirectories([
            ...previous,
            ...paths.map((path) => ({ path, label: "" })),
          ]);
          return next.map((item) => ({ path: item.path, label: item.label || "" }));
        });
      }
      return;
    }

    try {
      const api = createApiClient(apiBaseUrl, getApiToken());
      const response = await api.selectDir();
      if (response.path) {
        setManualTargetDirectories((previous) => {
          const next = dedupeTargetDirectories([...previous, { path: response.path!, label: "" }]);
          return next.map((item) => ({ path: item.path, label: item.label || "" }));
        });
      }
    } catch {
      setError("现在还不能打开目录选择器，请检查本地服务是否正常运行。");
    }
  }

  async function handleSelectOutputDir() {
    setError(null);
    try {
      if (isTauriDesktop()) {
        const selectedPath = await pickDirectoryWithTauri();
        if (selectedPath) {
          setOutputDir(selectedPath);
        }
        return;
      }

      const api = createApiClient(apiBaseUrl, getApiToken());
      const response = await api.selectDir();
      if (response.path) {
        setOutputDir(response.path);
      }
    } catch {
      setError(isTauriDesktop() ? "没有打开目录选择窗口，请再试一次。" : "现在还不能打开目录选择器，请检查本地服务是否正常运行。");
    }
  }

  async function handleSelectPlacementRoot(kind: "new" | "review") {
    setError(null);
    try {
      let selectedPath: string | null = null;
      if (isTauriDesktop()) {
        selectedPath = await pickDirectoryWithTauri();
      } else {
        const api = createApiClient(apiBaseUrl, getApiToken());
        const response = await api.selectDir();
        selectedPath = response.path;
      }
      if (!selectedPath) {
        return;
      }
      if (kind === "new") {
        setNewDirectoryRoot(selectedPath);
      } else {
        setReviewRoot(selectedPath);
      }
    } catch {
      setError(isTauriDesktop() ? "没有打开目录选择窗口，请再试一次。" : "现在还不能打开目录选择器，请检查本地服务是否正常运行。");
    }
  }

  async function handleSaveCurrentDirectoriesAsProfile() {
    const name = profileNameDraft.trim();
    if (!name) {
      setError("请先输入分类目录配置名称。");
      return;
    }
    if (effectiveTargetDirectories.length === 0) {
      setError("当前没有可保存的目标目录。");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const api = createApiClient(apiBaseUrl, getApiToken());
      const profile = await api.createTargetProfile({
        name,
        directories: effectiveTargetDirectories.map((item) => ({ path: item.path, label: item.label || undefined })),
      });
      setTargetProfiles((previous) => [profile, ...previous.filter((item) => item.profile_id !== profile.profile_id)]);
      setSelectedTargetProfileId(profile.profile_id);
      setProfileNameDraft("");
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "保存目录配置失败，请再试一次。");
    } finally {
      setLoading(false);
    }
  }

  function validateStepOne(): boolean {
    if (sources.length === 0) {
      setError("请先添加至少一个待整理来源。");
      return false;
    }
    return true;
  }

  function validateBeforeLaunch(): boolean {
    if (!validateStepOne()) {
      return false;
    }
    if (isFullCategorize && !outputDir.trim()) {
      setError("整体分类必须先指定输出目录。");
      return false;
    }
    if (isAssignExisting && effectiveTargetDirectories.length === 0 && !selectedTargetProfileId.trim()) {
      setError("归入已有分类时，至少需要选择一个目录配置或手动添加目标目录。");
      return false;
    }
    if (isAssignExisting && !effectiveNewDirectoryRoot) {
      setError("归入已有分类时，必须指定新目录生成位置。");
      return false;
    }
    if (isAssignExisting && !effectiveReviewRoot) {
      setError("归入已有分类时，必须指定 Review 目录位置。");
      return false;
    }
    return true;
  }

  function buildLaunchRequest(resumeIfExists: boolean): LaunchRequestState {
    const normalizedStrategy: SessionStrategySelection = {
      ...strategy,
      organize_method: organizeMethod,
      output_dir: outputDir.trim() || undefined,
      target_profile_id: selectedTargetProfileId.trim() || undefined,
      new_directory_root: effectiveNewDirectoryRoot || undefined,
      review_root: effectiveReviewRoot || undefined,
    };

    return {
      sources,
      resume_if_exists: resumeIfExists,
      organize_method: organizeMethod,
      strategy: normalizedStrategy,
      output_dir: isFullCategorize ? outputDir.trim() : undefined,
      target_profile_id: isAssignExisting ? selectedTargetProfileId.trim() || undefined : undefined,
      target_directories: isAssignExisting ? effectiveTargetDirectories.map((item) => item.path) : undefined,
      new_directory_root: effectiveNewDirectoryRoot || undefined,
      review_root: effectiveReviewRoot || undefined,
      display_path: displayPath,
    };
  }

  async function launchCurrentRequest(resumeIfExists: boolean) {
    if (!textModelConfigured) {
      setError("请先在设置中配置文本模型，然后再开始整理分析。");
      return;
    }
    if (!validateBeforeLaunch()) {
      return;
    }

    const launchRequest = buildLaunchRequest(resumeIfExists);
    setLoading(true);
    setLaunchTransitionOpen(true);
    setError(null);

    try {
      const api = createApiClient(apiBaseUrl, getApiToken());
      const response = await createSessionAndStartScan(api, launchRequest);
      if (response.mode === "resume_available" && response.restorable_session?.session_id) {
        setLaunchTransitionOpen(false);
        setResumePrompt({
          sessionId: response.restorable_session.session_id,
          snapshot: response.restorable_session,
          launch: launchRequest,
        });
        return;
      }
      if (!response.session_id) {
        throw new Error("没有成功创建整理会话，请再试一次。");
      }
      router.push(`/workspace?session_id=${response.session_id}&dir=${encodeURIComponent(launchRequest.display_path || firstSourcePath(launchRequest.sources))}&auto_scan=1`);
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
    await launchCurrentRequest(true);
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
        resumePrompt.snapshot.stage,
        resumePrompt.launch,
      );
      setResumePrompt(null);
      if (!response.session_id) {
        throw new Error("没有成功重新开始，请再试一次。");
      }
      router.push(`/workspace?session_id=${response.session_id}&dir=${encodeURIComponent(resumePrompt.launch.display_path || firstSourcePath(resumePrompt.launch.sources))}&auto_scan=1`);
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

  function handleConfirmResume() {
    if (!resumePrompt) {
      return;
    }
    router.push(`/workspace?session_id=${resumePrompt.sessionId}&dir=${encodeURIComponent(resumePrompt.launch.display_path || firstSourcePath(resumePrompt.launch.sources))}`);
  }

  function handleReadOnlyView() {
    if (!resumePrompt) {
      return;
    }
    router.push(`/workspace?session_id=${resumePrompt.sessionId}&dir=${encodeURIComponent(resumePrompt.launch.display_path || firstSourcePath(resumePrompt.launch.sources))}&readonly=1`);
  }

  function handleCancelResume() {
    setResumePrompt(null);
    setLaunchTransitionOpen(false);
    setLoading(false);
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

  function stepOneAction() {
    if (!validateStepOne()) {
      return;
    }
    setError(null);
    setStep(2);
  }

  return (
    <>
      <LaunchTransitionOverlay open={launchTransitionOpen} targetDir={displayPath} />
      <div className="flex h-full w-full bg-surface antialiased">
        <div className="flex flex-1 flex-col overflow-y-auto px-6 xl:px-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mx-auto flex w-full max-w-[980px] flex-col gap-5 pt-10 pb-10"
          >
            <div>
              <h1 className="mb-1.5 text-[22px] font-black tracking-tight text-on-surface">开启新整理</h1>
              <p className="text-[13px] font-medium leading-relaxed text-ui-muted/80">
                先定义待整理文件集和整理方式，再补充输出目录或分类目录配置。创建会话后仍沿用当前扫描与工作台主链。
              </p>
            </div>

            {!textModelConfigured ? (
              <div className="flex items-center justify-between gap-4 rounded-[8px] border border-warning/18 bg-warning-container/18 px-5 py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/12 text-warning">
                    <AlertTriangle className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-black tracking-tight text-on-surface">AI 文本模型尚未配置</p>
                    <p className="mt-1 text-[12px] font-medium leading-6 text-ui-muted">
                      未配置文本模型时，系统无法稳定完成用途分析和整理规划。建议先前往“设置 &gt; 文本模型”完成配置。
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

            <section className="rounded-[8px] border border-on-surface/8 bg-surface-container-lowest shadow-[0_12px_44px_rgba(0,0,0,0.06)]">
              <div className="border-b border-on-surface/6 bg-on-surface/[0.015] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                    <Layers3 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">启动向导</div>
                    <p className="mt-1 text-[14px] font-bold text-on-surface">
                      {step === 1 ? "第一步：待整理文件集与整理方式" : "第二步：目标定义与策略配置"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 p-5 lg:grid-cols-[1.45fr_0.95fr]">
                <div className="space-y-5">
                  {step === 1 ? (
                    <>
                      <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                          </div>
                          <h2 className="text-[14px] font-bold text-on-surface">整理方式</h2>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {[
                            {
                              method: "categorize_into_new_structure" as const,
                              title: "整体分类",
                              description: "系统为这批文件生成新的分类结构，并写入你指定的输出目录。",
                            },
                            {
                              method: "assign_into_existing_categories" as const,
                              title: "归入现有分类",
                              description: "把这批文件归入你已配置好的目录体系，必要时再补充新目录。",
                            },
                          ].map((option) => {
                            const active = organizeMethod === option.method;
                            return (
                              <button
                                key={option.method}
                                type="button"
                                disabled={loading}
                                onClick={() => updateStrategy((previous) => strategyForMethod(previous, option.method))}
                                className={[
                                  "rounded-[8px] border px-4 py-4 text-left transition-all disabled:opacity-50",
                                  active
                                    ? "border-primary/25 bg-primary/10 shadow-sm"
                                    : "border-on-surface/8 bg-surface hover:border-primary/20 hover:bg-surface-container-low",
                                ].join(" ")}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className={active ? "text-[14px] font-black text-primary" : "text-[14px] font-black text-on-surface"}>
                                    {option.title}
                                  </p>
                                  {active ? <Sparkles className="h-4 w-4 text-primary" /> : null}
                                </div>
                                <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-ui-muted">{option.description}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                            <Upload className="h-3.5 w-3.5" />
                          </div>
                          <h2 className="text-[14px] font-bold text-on-surface">待整理文件集</h2>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-[auto_auto_1fr_auto]">
                          <button
                            type="button"
                            onClick={() => void handleAddDirectories()}
                            disabled={loading}
                            className="rounded-[8px] border border-on-surface/8 bg-surface-container-lowest px-4 py-2.5 text-[12px] font-bold text-on-surface transition-colors hover:border-primary/20 hover:text-primary disabled:opacity-50"
                          >
                            添加目录
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAddFiles()}
                            disabled={loading}
                            className="rounded-[8px] border border-on-surface/8 bg-surface-container-lowest px-4 py-2.5 text-[12px] font-bold text-on-surface transition-colors hover:border-primary/20 hover:text-primary disabled:opacity-50"
                          >
                            添加文件
                          </button>
                          <input
                            value={sourceDraftPath}
                            onChange={(event) => setSourceDraftPath(event.target.value)}
                            disabled={loading}
                            placeholder={sourceDraftType === "directory" ? "手动输入目录路径" : "手动输入文件路径"}
                            className="h-10 rounded-[8px] border border-transparent bg-on-surface/[0.03] px-3 text-[13px] font-medium text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary/40 focus:bg-surface focus:ring-4 focus:ring-primary/10"
                          />
                          <div className="flex gap-2">
                            <select
                              value={sourceDraftType}
                              disabled={loading}
                              onChange={(event) => setSourceDraftType(event.target.value as SourceDraftType)}
                              className="h-10 rounded-[8px] border border-on-surface/8 bg-surface px-3 text-[12px] font-bold text-on-surface outline-none"
                            >
                              <option value="directory">目录</option>
                              <option value="file">文件</option>
                            </select>
                            <button
                              type="button"
                              onClick={addManualSource}
                              disabled={loading}
                              className="h-10 rounded-[8px] bg-primary px-4 text-[12px] font-black text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
                            >
                              添加
                            </button>
                          </div>
                        </div>

                        {commonDirs.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {commonDirs.map((item) => (
                              <button
                                key={item.path}
                                type="button"
                                onClick={() => addSources([{ source_type: "directory", path: item.path }])}
                                disabled={loading}
                                className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-3 py-1 text-[11px] font-semibold text-on-surface transition-colors hover:border-primary/20 hover:text-primary disabled:opacity-50"
                              >
                                + {item.label}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-4 space-y-2">
                          {sources.length > 0 ? (
                            sources.map((item) => (
                              <div
                                key={`${item.source_type}:${item.path}`}
                                className="flex items-center gap-3 rounded-[8px] border border-on-surface/8 bg-surface-container-lowest px-3 py-2.5"
                              >
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-primary/10 text-primary">
                                  {item.source_type === "directory" ? <FolderOpen className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[12px] font-bold text-on-surface">
                                    {item.source_type === "directory" ? "目录来源" : "文件来源"}
                                  </p>
                                  <p className="truncate text-[12px] font-medium text-ui-muted">{item.path}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeSource(item.path, item.source_type)}
                                  className="rounded-[6px] border border-on-surface/8 bg-surface px-2.5 py-2 text-ui-muted transition-colors hover:border-error/20 hover:text-error"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-[8px] border border-dashed border-on-surface/10 bg-surface-container-lowest px-4 py-8 text-center">
                              <p className="text-[13px] font-bold text-on-surface-variant/60">还没有添加任何来源</p>
                              <p className="mt-1 text-[12px] font-medium text-ui-muted">支持目录和文件混选，桌面环境可直接多选。</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {isFullCategorize ? (
                        <>
                          <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                                <FolderOpen className="h-3.5 w-3.5" />
                              </div>
                              <h2 className="text-[14px] font-bold text-on-surface">输出目录</h2>
                            </div>
                            <div className="flex gap-3">
                              <input
                                value={outputDir}
                                onChange={(event) => setOutputDir(event.target.value)}
                                disabled={loading}
                                placeholder="整体分类生成的新目录会写入这里"
                                className="h-10 flex-1 rounded-[8px] border border-transparent bg-on-surface/[0.03] px-3 text-[13px] font-medium text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary/40 focus:bg-surface focus:ring-4 focus:ring-primary/10"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSelectOutputDir()}
                                disabled={loading}
                                className="h-10 rounded-[8px] border border-on-surface/8 bg-surface px-4 text-[12px] font-bold text-on-surface transition-colors hover:border-primary/20 hover:text-primary disabled:opacity-50"
                              >
                                选择目录
                              </button>
                            </div>
                          </div>

                          <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                            <div className="mb-3 text-[14px] font-bold text-on-surface">整理模板</div>
                            <div className="grid gap-2 md:grid-cols-2">
                              {STRATEGY_TEMPLATES.map((template) => {
                                const active = strategy.template_id === template.id;
                                return (
                                  <button
                                    key={template.id}
                                    type="button"
                                    onClick={() => updateStrategy((previous) => ({ ...previous, template_id: template.id }))}
                                    disabled={loading}
                                    className={[
                                      "rounded-[8px] border px-3 py-2.5 text-left transition-all disabled:opacity-50",
                                      active
                                        ? "border-primary/25 bg-primary/10 shadow-sm"
                                        : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                                    ].join(" ")}
                                  >
                                    <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>
                                      {template.label}
                                    </p>
                                    <p className="mt-0.5 text-[11px] leading-[1.5] text-ui-muted/80">{template.applicableScenarios}</p>
                                  </button>
                                );
                              })}
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
                                      <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>{option.label}</p>
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
                                      <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>{option.label}</p>
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
                                      <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>{option.label}</p>
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
                                      <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>{option.label}</p>
                                      <p className="mt-0.5 text-[11px] leading-[1.5] text-ui-muted/80">{option.description}</p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <h2 className="text-[14px] font-bold text-on-surface">已保存分类目录配置</h2>
                              {targetProfilesLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                            </div>
                            <select
                              value={selectedTargetProfileId}
                              disabled={loading || targetProfilesLoading}
                              onChange={(event) => setSelectedTargetProfileId(event.target.value)}
                              className="h-10 w-full rounded-[8px] border border-on-surface/8 bg-surface px-3 text-[13px] font-medium text-on-surface outline-none"
                            >
                              <option value="">不使用已保存配置</option>
                              {targetProfiles.map((item) => (
                                <option key={item.profile_id} value={item.profile_id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                                <FolderOpen className="h-3.5 w-3.5" />
                              </div>
                              <h2 className="text-[14px] font-bold text-on-surface">目标目录集合</h2>
                            </div>

                            <div className="grid gap-3 lg:grid-cols-[auto_1fr_auto]">
                              <button
                                type="button"
                                onClick={() => void handleAddTargetDirectories()}
                                disabled={loading}
                                className="rounded-[8px] border border-on-surface/8 bg-surface-container-lowest px-4 py-2.5 text-[12px] font-bold text-on-surface transition-colors hover:border-primary/20 hover:text-primary disabled:opacity-50"
                              >
                                选择目录
                              </button>
                              <input
                                value={targetDirectoryDraft}
                                onChange={(event) => setTargetDirectoryDraft(event.target.value)}
                                disabled={loading}
                                placeholder="手动输入目标目录路径"
                                className="h-10 rounded-[8px] border border-transparent bg-on-surface/[0.03] px-3 text-[13px] font-medium text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary/40 focus:bg-surface focus:ring-4 focus:ring-primary/10"
                              />
                              <button
                                type="button"
                                onClick={addManualTargetDirectory}
                                disabled={loading}
                                className="h-10 rounded-[8px] bg-primary px-4 text-[12px] font-black text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
                              >
                                添加目录
                              </button>
                            </div>

                            <div className="mt-4 space-y-2">
                              {effectiveTargetDirectories.length > 0 ? (
                                effectiveTargetDirectories.map((item) => {
                                  const isFromProfile = profileDirectories.some((directory) => directory.path === item.path);
                                  const manualIndex = manualTargetDirectories.findIndex((directory) => directory.path === item.path);
                                  return (
                                    <div
                                      key={item.path}
                                      className="grid gap-3 rounded-[8px] border border-on-surface/8 bg-surface-container-lowest px-3 py-3 lg:grid-cols-[1fr_180px_auto]"
                                    >
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <p className="truncate text-[12px] font-bold text-on-surface">{item.path}</p>
                                          {isFromProfile ? (
                                            <span className="rounded-full border border-primary/12 bg-primary/8 px-2 py-0.5 text-[10px] font-bold text-primary">
                                              配置目录
                                            </span>
                                          ) : null}
                                        </div>
                                        <p className="mt-1 text-[11px] font-medium text-ui-muted">
                                          {isFromProfile ? "来自已保存分类目录配置" : "手动补充的目标目录"}
                                        </p>
                                      </div>
                                      <input
                                        value={manualIndex >= 0 ? manualTargetDirectories[manualIndex]?.label || "" : item.label || ""}
                                        disabled={loading || isFromProfile}
                                        onChange={(event) => {
                                          if (manualIndex < 0) {
                                            return;
                                          }
                                          const nextLabel = event.target.value;
                                          setManualTargetDirectories((previous) =>
                                            previous.map((directory, index) =>
                                              index === manualIndex ? { ...directory, label: nextLabel } : directory,
                                            ),
                                          );
                                        }}
                                        placeholder="目录标签（可选）"
                                        className="h-10 rounded-[8px] border border-transparent bg-surface px-3 text-[12px] font-medium text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary/30 focus:ring-4 focus:ring-primary/10 disabled:opacity-60"
                                      />
                                      <button
                                        type="button"
                                        disabled={loading || isFromProfile}
                                        onClick={() =>
                                          setManualTargetDirectories((previous) => previous.filter((directory) => directory.path !== item.path))
                                        }
                                        className="h-10 rounded-[8px] border border-on-surface/8 bg-surface px-3 text-ui-muted transition-colors hover:border-error/20 hover:text-error disabled:opacity-40"
                                      >
                                        <Trash2 className="mx-auto h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="rounded-[8px] border border-dashed border-on-surface/10 bg-surface-container-lowest px-4 py-6 text-center">
                                  <p className="text-[12px] font-bold text-on-surface-variant/60">还没有目标目录</p>
                                  <p className="mt-1 text-[11px] font-medium text-ui-muted">可先选择已保存配置，再手动补充目录。</p>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                            <div className="mb-3 text-[14px] font-bold text-on-surface">保存为分类目录配置</div>
                            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                              <input
                                value={profileNameDraft}
                                onChange={(event) => setProfileNameDraft(event.target.value)}
                                disabled={loading}
                                placeholder="例如：工作资料库 / 个人归档库"
                                className="h-10 rounded-[8px] border border-transparent bg-on-surface/[0.03] px-3 text-[13px] font-medium text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary/40 focus:bg-surface focus:ring-4 focus:ring-primary/10"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSaveCurrentDirectoriesAsProfile()}
                                disabled={loading || effectiveTargetDirectories.length === 0}
                                className="h-10 rounded-[8px] border border-on-surface/8 bg-surface px-4 text-[12px] font-bold text-on-surface transition-colors hover:border-primary/20 hover:text-primary disabled:opacity-50"
                              >
                                保存当前目录集合
                              </button>
                            </div>
                          </div>

                          <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">目标目录深度</div>
                              <div className="grid gap-2">
                                {[1, 2, 3].map((depth) => {
                                  const active = strategy.destination_index_depth === depth;
                                  return (
                                    <button
                                      key={depth}
                                      type="button"
                                      onClick={() => updateStrategy((previous) => ({ ...previous, destination_index_depth: depth as 1 | 2 | 3 }))}
                                      disabled={loading}
                                      className={[
                                        "rounded-[8px] border px-3 py-2.5 text-left transition-all disabled:opacity-50",
                                        active
                                          ? "border-primary/25 bg-primary/10 shadow-sm"
                                          : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                                      ].join(" ")}
                                    >
                                      <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>深度 {depth}</p>
                                      <p className="mt-0.5 text-[11px] leading-[1.5] text-ui-muted/80">
                                        {depth === 1 ? "只索引一层目录。" : depth === 2 ? "适合常规归档目录结构。" : "索引更深层目录，给模型更多分类参考。"}
                                      </p>
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
                                      <p className={active ? "text-[12.5px] font-bold text-primary" : "text-[12.5px] font-bold text-on-surface"}>{option.label}</p>
                                      <p className="mt-0.5 text-[11px] leading-[1.5] text-ui-muted/80">{option.description}</p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                              <FolderOpen className="h-3.5 w-3.5" />
                            </div>
                            <h2 className="text-[14px] font-bold text-on-surface">新目录生成位置</h2>
                          </div>
                          <div className="flex gap-3">
                            <input
                              value={newDirectoryRoot}
                              onChange={(event) => setNewDirectoryRoot(event.target.value)}
                              disabled={loading}
                              placeholder={isFullCategorize ? "默认使用输出目录" : "新增目录会创建到这里"}
                              className="h-10 flex-1 rounded-[8px] border border-transparent bg-on-surface/[0.03] px-3 text-[13px] font-medium text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary/40 focus:bg-surface focus:ring-4 focus:ring-primary/10"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSelectPlacementRoot("new")}
                              disabled={loading}
                              className="h-10 rounded-[8px] border border-on-surface/8 bg-surface px-4 text-[12px] font-bold text-on-surface transition-colors hover:border-primary/20 hover:text-primary disabled:opacity-50"
                            >
                              选择目录
                            </button>
                          </div>
                          <p className="mt-2 text-[11px] font-medium text-ui-muted">
                            {isFullCategorize ? "留空时默认等于输出目录。" : "手动新建目录时，`target_dir` 会相对这里解析。"}
                          </p>
                        </div>

                        <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                              <FolderOpen className="h-3.5 w-3.5" />
                            </div>
                            <h2 className="text-[14px] font-bold text-on-surface">Review 目录位置</h2>
                          </div>
                          <div className="flex gap-3">
                            <input
                              value={reviewRoot}
                              onChange={(event) => setReviewRoot(event.target.value)}
                              disabled={loading}
                              placeholder={effectiveNewDirectoryRoot ? `${effectiveNewDirectoryRoot.replace(/[\\/]$/, "")}/Review` : "Review 会保留到这里"}
                              className="h-10 flex-1 rounded-[8px] border border-transparent bg-on-surface/[0.03] px-3 text-[13px] font-medium text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary/40 focus:bg-surface focus:ring-4 focus:ring-primary/10"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSelectPlacementRoot("review")}
                              disabled={loading}
                              className="h-10 rounded-[8px] border border-on-surface/8 bg-surface px-4 text-[12px] font-bold text-on-surface transition-colors hover:border-primary/20 hover:text-primary disabled:opacity-50"
                            >
                              选择目录
                            </button>
                          </div>
                          <p className="mt-2 text-[11px] font-medium text-ui-muted">
                            留空时默认使用 `{effectiveNewDirectoryRoot ? `${effectiveNewDirectoryRoot.replace(/[\\/]$/, "")}/Review` : "新目录生成位置/Review"}`。Review 下不再细分子目录。
                          </p>
                        </div>
                      </div>

                      <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                        <div className="mb-2.5 flex items-center justify-between">
                          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-ui-muted">补充说明</div>
                          <span className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-2 py-0.5 text-[10px] font-semibold text-ui-muted/50">可选</span>
                        </div>
                        <textarea
                          value={strategy.note}
                          disabled={loading}
                          onChange={(event) => updateStrategy((previous) => ({ ...previous, note: event.target.value.slice(0, 200) }))}
                          placeholder={isAssignExisting ? "例如：拿不准的先放 Review；优先归入现有项目目录。" : "例如：课程资料按学期整理；图片素材按用途分层。"}
                          className="min-h-[80px] w-full resize-none rounded-[10px] border border-on-surface/8 bg-surface-container-low px-4 py-3 text-[13px] leading-relaxed text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary/30"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    {step === 2 ? (
                      <Button
                        variant="secondary"
                        onClick={() => setStep(1)}
                        disabled={loading}
                        className="h-10 rounded-[4px] px-4 text-[13px] font-bold"
                      >
                        <ArrowLeft className="mr-1.5 h-4 w-4" />
                        返回上一步
                      </Button>
                    ) : (
                      <div />
                    )}

                    {step === 1 ? (
                      <Button
                        variant="primary"
                        onClick={stepOneAction}
                        disabled={loading || sources.length === 0}
                        className="h-10 rounded-[4px] px-4 text-[13px] font-bold"
                      >
                        下一步：定义目标
                        <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={() => void handlePrimaryLaunch()}
                        disabled={loading || !textModelConfigured}
                        loading={loading}
                        className="h-10 min-w-[200px] rounded-[4px] px-4 text-[13px] font-bold"
                      >
                        {loading ? "正在启动..." : primaryLaunchLabel}
                        {!loading ? <ArrowRight className="ml-1.5 h-4 w-4" /> : null}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <h2 className="text-[14px] font-bold text-on-surface">当前任务说明</h2>
                    </div>
                    <p className="text-[13px] font-medium leading-relaxed text-ui-muted">
                      {isAssignExisting
                        ? "将当前来源集合归入已有目录体系。你可以直接选用已保存的分类目录配置，也可以在此基础上手动补充目录。"
                        : "系统会为当前来源集合生成新的分类结构，并把结果写入你指定的输出目录。"}
                    </p>
                    <div className="mt-3">
                      <StrategySummaryChips strategy={currentSummary} />
                    </div>
                  </div>

                  <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                    <div className="mb-3 text-[14px] font-bold text-on-surface">来源摘要</div>
                    <div className="space-y-2 text-[12px] font-medium text-ui-muted">
                      <div className="flex items-center justify-between rounded-[8px] bg-surface-container-lowest px-3 py-2">
                        <span>来源数量</span>
                        <span className="font-bold text-on-surface">{sources.length}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-[8px] bg-surface-container-lowest px-3 py-2">
                        <span>目录来源</span>
                        <span className="font-bold text-on-surface">
                          {sources.filter((item) => item.source_type === "directory").length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-[8px] bg-surface-container-lowest px-3 py-2">
                        <span>文件来源</span>
                        <span className="font-bold text-on-surface">
                          {sources.filter((item) => item.source_type === "file").length}
                        </span>
                      </div>
                      {isFullCategorize ? (
                        <div className="rounded-[8px] bg-surface-container-lowest px-3 py-2">
                          <div className="mb-1 font-bold text-on-surface">输出目录</div>
                          <div className="break-all">{outputDir || "尚未指定"}</div>
                        </div>
                      ) : (
                        <div className="rounded-[8px] bg-surface-container-lowest px-3 py-2">
                          <div className="mb-1 font-bold text-on-surface">目标目录数量</div>
                          <div>{effectiveTargetDirectories.length} 个</div>
                        </div>
                      )}
                      <div className="rounded-[8px] bg-surface-container-lowest px-3 py-2">
                        <div className="mb-1 font-bold text-on-surface">新目录生成位置</div>
                        <div className="break-all">{effectiveNewDirectoryRoot || "尚未指定"}</div>
                      </div>
                      <div className="rounded-[8px] bg-surface-container-lowest px-3 py-2">
                        <div className="mb-1 font-bold text-on-surface">Review 目录位置</div>
                        <div className="break-all">{effectiveReviewRoot || "尚未指定"}</div>
                      </div>
                    </div>
                  </div>

                  {isFullCategorize ? (
                    <div className="rounded-[8px] border border-on-surface/8 bg-surface p-4">
                      <div className="mb-3 text-[14px] font-bold text-on-surface">预计目录结构</div>
                      <div className="flex flex-wrap gap-1.5">
                        {currentSummary.preview_directories?.map((directory) => (
                          <span
                            key={`${strategy.template_id}-${strategy.language}-${strategy.density}-${strategy.prefix_style}-${directory}`}
                            className="rounded-[4px] border border-on-surface/8 bg-surface-container-lowest px-2 py-0.5 text-[11px] font-semibold text-on-surface"
                          >
                            {directory}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-[12px] font-medium leading-relaxed text-ui-muted">{currentTemplate.description}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
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
        targetDir={resumePrompt?.launch.display_path || ""}
        resumePrompt={resumePrompt ? { sessionId: resumePrompt.sessionId, snapshot: resumePrompt.snapshot } : null}
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
