"use client";

import React, { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertTriangle, FolderTree, Layers, Loader2, LogOut, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getSessionStageView } from "@/lib/session-view-model";
import { cn } from "@/lib/utils";
import { canRunPrecheck as deriveCanRunPrecheck } from "@/lib/workspace-precheck";

import { useSession } from "@/lib/use-session";
import { getFriendlyStage } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createApiClient } from "@/lib/api";
import { getApiBaseUrl, getApiToken } from "@/lib/runtime";
import { MinimalScanningView } from "./workspace/minimal-scanning-view";
import { PrecheckView } from "./workspace/precheck-view";
import { CompletionView } from "./workspace/completion-view";
import { ConversationPanel, type ConversationNotice } from "./workspace/conversation-panel";
import { IncrementalSelectionView } from "./workspace/incremental-selection-view";
import { PreviewFilter, PreviewFocusRequest, PreviewPanel } from "./workspace/preview-panel";

const DEFAULT_LEFT_WIDTH = 50;
const SCAN_PREVIEW_GRACE_MS = 1200;

function getSessionIdFromWorkspaceRoute(route: string | null): string | null {
  if (!route?.startsWith("/workspace")) {
    return null;
  }
  const query = route.split("?")[1] || "";
  return new URLSearchParams(query).get("session_id");
}

function summarizeItemNames(names: string[], limit = 3): string {
  const visible = names.filter(Boolean).slice(0, limit);
  if (!visible.length) {
    return "";
  }
  return visible.join("、") + (names.length > limit ? ` 等 ${names.length} 项` : "");
}

export default function WorkspaceClient() {
  const APP_CONTEXT_EVENT = "file-organizer-context-change";
  const WORKSPACE_CONTEXT_KEY = "workspace_header_context";
  const ACTIVE_WORKSPACE_ROUTE_KEY = "workspace_active_route";
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionIdParam = searchParams.get("session_id");
  const dirParam = searchParams.get("dir");
  const isReadOnly = searchParams.get("readonly") === "1";
  const autoStartScan = searchParams.get("auto_scan") === "1";

  const {
    snapshot,
    stage,
    journal,
    journalLoading,
    loading,
    chatMessages,
    assistantDraft,
    assistantRuntime,
    plannerStatus,
    composerStatus,
    chatError,
    streamStatus,
    composerMode,
    isComposerLocked,
    retryStream,
    sendMessage,
    scan,
    refreshPlan,
    confirmTargetDirectories,
    runPrecheck,
    returnToPlanning,
    execute,
    rollback,
    cleanupEmptyDirs,
    abandonSession,
    openExplorer,
    loadJournal,
    updateItem,
  } = useSession(sessionIdParam);

  const [globalConfig, setGlobalConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(true);

  React.useEffect(() => {
    const api = createApiClient(getApiBaseUrl(), getApiToken());
    api.getSettings().then(data => {
      setGlobalConfig(data.status);
    }).finally(() => {
      setConfigLoading(false);
    });
  }, []);

  const isTextModelConfigured = useMemo(() => {
    if (!globalConfig) return true; // Default to true while loading to avoid flash
    return Boolean(globalConfig.text_configured);
  }, [globalConfig]);

  const [messageInput, setMessageInput] = useState("");
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [layoutReady, setLayoutReady] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [executeConfirmOpen, setExecuteConfirmOpen] = useState(false);
  const [scanAbortConfirmOpen, setScanAbortConfirmOpen] = useState(false);
  const [showExitMenu, setShowExitMenu] = useState(false);
  const [dividerLeft, setDividerLeft] = useState<number | null>(null);
  const [previewFocusRequest, setPreviewFocusRequest] = useState<PreviewFocusRequest | null>(null);
  const [scanPreviewHoldUntil, setScanPreviewHoldUntil] = useState<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dividerRef = React.useRef<HTMLDivElement>(null);
  const leftPaneRef = React.useRef<HTMLElement>(null);
  const rightPaneRef = React.useRef<HTMLElement>(null);
  const draggedWidthRef = React.useRef(DEFAULT_LEFT_WIDTH);
  const [isResizingState, setIsResizingState] = useState(false);
  const isResizing = React.useRef(false);
  const scanPreviewTimerRef = React.useRef<number | null>(null);
  const autoScanRequestedRef = React.useRef(false);

  React.useEffect(() => {
    autoScanRequestedRef.current = false;
  }, [sessionIdParam]);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("workspace_sidebar_width");
      if (saved) {
        const val = parseFloat(saved);
        if (val > 32 && val < 72) {
          setLeftWidth(val);
        }
      }
    } finally {
      setLayoutReady(true);
    }
  }, []);

  React.useEffect(() => {
    if (chatError?.includes("SESSION_NOT_FOUND")) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ACTIVE_WORKSPACE_ROUTE_KEY);
      }
      router.push("/");
    }
  }, [chatError, router]);

  const saveWidth = React.useCallback((width: number) => {
    localStorage.setItem("workspace_sidebar_width", width.toString());
  }, []);

  const scanner = useMemo(
    () => ({
      status: snapshot?.scanner_progress?.status || "idle",
      processed_count: snapshot?.scanner_progress?.processed_count || 0,
      total_count: snapshot?.scanner_progress?.total_count || 0,
      current_item: snapshot?.scanner_progress?.current_item || null,
      recent_analysis_items: snapshot?.scanner_progress?.recent_analysis_items || [],
      batch_count: snapshot?.scanner_progress?.batch_count,
      completed_batches: snapshot?.scanner_progress?.completed_batches,
      message: snapshot?.scanner_progress?.message || undefined,
      is_retrying: snapshot?.scanner_progress?.is_retrying,
      ai_thinking: snapshot?.scanner_progress?.ai_thinking,
    }),
    [snapshot?.scanner_progress],
  );

  const plan = useMemo(
    () => ({
      summary: snapshot?.plan_snapshot?.summary || "",
      placement: snapshot?.plan_snapshot?.placement || { new_directory_root: "", review_root: "" },
      items: snapshot?.plan_snapshot?.items || [],
      groups: snapshot?.plan_snapshot?.groups || [],
      target_slots: snapshot?.plan_snapshot?.target_slots || [],
      mappings: snapshot?.plan_snapshot?.mappings || [],
      unresolved_items: snapshot?.plan_snapshot?.unresolved_items || [],
      review_items: snapshot?.plan_snapshot?.review_items || [],
      invalidated_items: snapshot?.plan_snapshot?.invalidated_items || [],
      change_highlights: snapshot?.plan_snapshot?.change_highlights || [],
      stats: snapshot?.plan_snapshot?.stats || {
        directory_count: 0,
        move_count: 0,
        unresolved_count: 0,
      },
      readiness: snapshot?.plan_snapshot?.readiness || { can_precheck: false },
    }),
    [snapshot?.plan_snapshot],
  );

  const precheck = snapshot?.precheck_summary ?? null;
  const incrementalSelection = snapshot?.incremental_selection ?? null;
  const stageView = useMemo(() => getSessionStageView(stage), [stage]);
  const isBusy = stageView.isBusyStage || loading;
  const isPlanSyncing = plannerStatus.isRunning;
  const canRunPrecheck = deriveCanRunPrecheck(stage, plan.readiness, isPlanSyncing);
  const progressPercent = scanner.total_count > 0 ? (scanner.processed_count / scanner.total_count) * 100 : 0;
  const showConversationPane = true;
  const effectiveComposerMode = isReadOnly ? "hidden" : composerMode;
  const targetPath = snapshot?.target_dir || dirParam || "";
  const targetDirName = useMemo(
    () => targetPath.replace(/[\\/]$/, "").split(/[\\/]/).pop() || "当前任务",
    [targetPath],
  );
  const reviewMoveCount = useMemo(
    () => precheck?.move_preview.filter((move) => move.target.split(/[\\/]/).some((part) => part.toLowerCase() === "review")).length ?? 0,
    [precheck],
  );
  const precheckItemNames = useMemo(() => {
    const itemNameById = new Map((snapshot?.plan_snapshot?.items || []).map((item) => [item.item_id, item.display_name] as const));
    return (precheck?.move_preview || []).map((move) => itemNameById.get(move.item_id) || move.item_id);
  }, [precheck?.move_preview, snapshot?.plan_snapshot?.items]);
  const precheckItemsSummary = useMemo(() => summarizeItemNames(precheckItemNames), [precheckItemNames]);
  const nextStepHint = useMemo(() => {
    if (isReadOnly && !stageView.isCompleted) {
      return "当前为只读查看模式。如需继续整理，请返回首页重新启动或恢复任务。";
    }
    if (stageView.isDraftLike) {
      return "下一步请先开始扫描。系统会读取目录结构并建立初始分析范围。";
    }
    if (stageView.isScanning) {
      return "扫描完成后会自动显示整理方案。";
    }
    if (stageView.isTargetSelection) {
      return "先选择目标目录，系统会把剩余根级条目作为待整理项，再生成归入已有目录方案。";
    }
    if (stageView.isPlanning) {
      return isPlanSyncing ? "方案正在同步，完成后会更新是否可预检。" : "可以继续调整要求，等待方案进入预检阶段。";
    }
    if (stageView.isAwaitingPrecheck) {
      return canRunPrecheck ? "方案已就绪，建议开始运行预检。" : "方案同步中，完成后即可预检。";
    }
    if (stageView.isReadyToExecute) {
      return `预检完成，待执行 ${precheck?.move_preview.length ?? 0} 项${reviewMoveCount > 0 ? `，其中 ${reviewMoveCount} 项进入 Review` : ""}。`;
    }
    if (stageView.isExecuting) {
      return "正在执行文件变更，请稍后...";
    }
    if (stageView.isCompleted) {
      return "整理已完成。你可以处理失败项或清理空目录。";
    }
    if (stageView.isRecovery) {
      return "建议先重新扫描，确认目录状态后再继续整理。";
    }
    return "当前任务正在继续推进。";
  }, [canRunPrecheck, isReadOnly, precheck?.move_preview.length, reviewMoveCount, stageView]);
  const isRootTarget = useMemo(() => /^[a-zA-Z]:[\\/]?$/.test((snapshot?.target_dir || "").trim()), [snapshot?.target_dir]);
  const beginScanPreviewHold = React.useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (scanPreviewTimerRef.current !== null) {
      window.clearTimeout(scanPreviewTimerRef.current);
      scanPreviewTimerRef.current = null;
    }
    setScanPreviewHoldUntil(Date.now() + SCAN_PREVIEW_GRACE_MS);
  }, []);
  const shouldShowScanningPreview = stageView.isScanning || (
    scanPreviewHoldUntil !== null &&
    stageView.isPlanningConversation &&
    scanner.status !== "idle" &&
    !plannerStatus.isRunning
  );

  const handleMouseMove = React.useCallback((event: MouseEvent) => {
    if (!isResizing.current) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const minLeft = Math.max(380, rect.width * 0.2);
    const maxLeft = Math.min(rect.width - 420, rect.width * 0.7);
    const finalMaxLeft = Math.max(minLeft, maxLeft);
    const boundedX = Math.min(Math.max(event.clientX - rect.left, minLeft), finalMaxLeft);
    const newWidth = (boundedX / rect.width) * 100;

    if (leftPaneRef.current && rightPaneRef.current) {
      leftPaneRef.current.style.width = `${newWidth}%`;
      rightPaneRef.current.style.width = `${100 - newWidth}%`;
    }
    
    if (dividerRef.current) {
      dividerRef.current.style.left = `${boundedX - 1.25}px`;
    }
    
    draggedWidthRef.current = newWidth;
  }, []);

  const stopResizing = React.useCallback(() => {
    isResizing.current = false;
    setIsResizingState(false);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", stopResizing);
    document.body.style.cursor = "default";
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
    const finalWidth = draggedWidthRef.current;
    setLeftWidth(finalWidth);
    saveWidth(finalWidth);
  }, [handleMouseMove, saveWidth]);

  const handleStartResizing = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isResizing.current = true;
    setIsResizingState(true);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopResizing);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
  };

  const handleSendMessage = async () => {
    if (isReadOnly || !messageInput.trim() || isBusy || isComposerLocked) {
      return;
    }
    const content = messageInput;
    setMessageInput("");
    await sendMessage(content);
  };

  const handleExitWorkbench = () => {
    setShowExitMenu(false);
    if (isReadOnly || stageView.isCompleted) {
      if (typeof window !== "undefined" && sessionIdParam) {
        const storedRoute = window.localStorage.getItem(ACTIVE_WORKSPACE_ROUTE_KEY);
        if (getSessionIdFromWorkspaceRoute(storedRoute) === sessionIdParam) {
          window.localStorage.removeItem(ACTIVE_WORKSPACE_ROUTE_KEY);
        }
      }
      router.push("/");
      return;
    }
    setExitConfirmOpen(true);
  };

  const handleConfirmExitWorkbench = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_WORKSPACE_ROUTE_KEY);
    }
    setExitConfirmOpen(false);
    router.push("/");
  };

  const handleConfirmAbortScan = async () => {
    const success = await abandonSession();
    if (success) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ACTIVE_WORKSPACE_ROUTE_KEY);
      }
      setScanAbortConfirmOpen(false);
      router.push("/");
    }
  };
  const handleStartScan = React.useCallback(() => {
    beginScanPreviewHold();
    void scan();
  }, [beginScanPreviewHold, scan]);

  React.useEffect(() => {
    if (!autoStartScan || isReadOnly || !sessionIdParam || !snapshot || loading) {
      return;
    }
    if (autoScanRequestedRef.current) {
      return;
    }
    if (!stageView.isDraftLike) {
      return;
    }
    autoScanRequestedRef.current = true;
    handleStartScan();
  }, [autoStartScan, handleStartScan, isReadOnly, loading, sessionIdParam, snapshot, stageView.isDraftLike]);

  const statusNotice = useMemo<ConversationNotice | null>(() => {
    if (streamStatus === "offline") {
      return {
        tone: "warning",
        title: "实时连接已断开",
        description: stageView.isCompleted
          ? "当前页面会保留已同步的记录和结果，输入已关闭。你可以先查看右侧结果，或重新连接恢复实时状态。"
          : "当前页面仍可查看已同步内容。重新连接后，会恢复实时事件更新并重新同步当前任务。",
        primaryAction: {
          label: "重新连接",
          onClick: () => {
            void retryStream();
          },
        },
      };
    }

    if (isReadOnly && !stageView.isCompleted) {
      return {
        tone: "warning",
        title: "这是只读模式",
        description: "当前只能查看之前的方案和记录，不能继续修改、预检或执行。如需继续整理，请返回首页重新打开任务。",
      };
    }

    if (canRunPrecheck) {
      return null;
    }

    if (stageView.isReadyToExecute) {
      return {
        tone: "info",
        title: "预检已完成",
        description: `系统已经检查过真实文件系统。本次待执行 ${precheck?.move_preview.length ?? 0} 项${reviewMoveCount > 0 ? `，其中 ${reviewMoveCount} 项进入 Review` : ""}${precheckItemsSummary ? `。涉及条目：${precheckItemsSummary}` : ""}。`,
        primaryAction: isReadOnly ? undefined : {
          label: "返回继续修改",
          onClick: () => {
            void returnToPlanning();
          },
        },
      };
    }

    if (stageView.isStale) {
      return {
        tone: "warning",
        title: "当前方案已过期",
        description: "目录内容已发生变化。建议先重新扫描，再继续整理。",
        primaryAction: {
          label: "重新扫描",
          onClick: () => void refreshPlan(),
        },
        secondaryAction: {
          label: "结束本次任务",
          onClick: handleExitWorkbench,
        },
      };
    }

    if (stageView.isInterrupted) {
      return {
        tone: "danger",
        title: "任务已中断",
        description: snapshot?.last_error || "建议重新扫描一次，确认目录状态后再继续。",
        primaryAction: {
          label: "重新扫描",
          onClick: () => void refreshPlan(),
        },
        secondaryAction: {
          label: "结束本次任务",
          onClick: handleExitWorkbench,
        },
      };
    }

    if (stageView.isCompleted) {
      return {
        tone: "info",
        title: isReadOnly ? "这是之前的整理结果" : "整理完成",
        description: isReadOnly
          ? "左侧保留了当时的记录，输入已关闭；右侧可以继续查看这次整理结果。"
          : "左侧会保留本轮记录供你回看，输入已关闭；请在右侧查看结果、失败项、Review 和后续操作。",
      };
    }

    return null;
  }, [canRunPrecheck, isReadOnly, precheck?.move_preview.length, precheckItemsSummary, refreshPlan, returnToPlanning, retryStream, reviewMoveCount, snapshot?.last_error, stageView, streamStatus]);

  React.useEffect(() => {
    if (stageView.isScanning) {
      beginScanPreviewHold();
    }
  }, [beginScanPreviewHold, stageView]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (scanPreviewTimerRef.current !== null) {
      window.clearTimeout(scanPreviewTimerRef.current);
      scanPreviewTimerRef.current = null;
    }
    if (scanPreviewHoldUntil === null) {
      return;
    }
    if (shouldShowScanningPreview) {
      const remaining = Math.max(0, scanPreviewHoldUntil - Date.now());
      if (remaining > 0) {
        scanPreviewTimerRef.current = window.setTimeout(() => {
          setScanPreviewHoldUntil(null);
          scanPreviewTimerRef.current = null;
        }, remaining);
        return () => {
          if (scanPreviewTimerRef.current !== null) {
            window.clearTimeout(scanPreviewTimerRef.current);
            scanPreviewTimerRef.current = null;
          }
        };
      }
    }
    setScanPreviewHoldUntil(null);
  }, [scanPreviewHoldUntil, shouldShowScanningPreview]);

  React.useEffect(() => {
    if (stageView.isCompleted && !journal && !journalLoading && !isBusy) {
      void loadJournal();
    }
  }, [stageView, journal, journalLoading, isBusy, loadJournal]);

  React.useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && scanPreviewTimerRef.current !== null) {
        window.clearTimeout(scanPreviewTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!showConversationPane) {
      setDividerLeft(null);
      return;
    }

    const container = containerRef.current;
    const leftPane = leftPaneRef.current;
    if (!container || !leftPane) {
      return;
    }

    const updateDivider = () => {
      if (isResizing.current) return;
      setDividerLeft(leftPane.getBoundingClientRect().width);
    };

    updateDivider();
    const observer = new ResizeObserver(() => {
      updateDivider();
    });
    observer.observe(container);
    observer.observe(leftPane);
    return () => {
      observer.disconnect();
    };
  }, [showConversationPane, leftWidth]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const targetPath = snapshot?.target_dir || dirParam || "";
    const hasTargetPath = Boolean(targetPath);
    const dirName = hasTargetPath ? targetPath.replace(/[\\/]$/, "").split(/[\\/]/).pop() || "当前任务" : "当前任务";
    window.localStorage.setItem(
      WORKSPACE_CONTEXT_KEY,
      JSON.stringify({
        dirName,
        stage: getFriendlyStage(stage),
        sessionId: sessionIdParam || undefined,
        hasTargetPath,
      }),
    );
    window.dispatchEvent(new Event(APP_CONTEXT_EVENT));
  }, [APP_CONTEXT_EVENT, WORKSPACE_CONTEXT_KEY, dirParam, sessionIdParam, snapshot?.target_dir, stage]);

  React.useEffect(() => {
    if (typeof window === "undefined" || !sessionIdParam) {
      return;
    }
    const canRememberWorkspaceRoute = !isReadOnly && !stageView.isCompleted;
    if (canRememberWorkspaceRoute) {
      window.localStorage.setItem(ACTIVE_WORKSPACE_ROUTE_KEY, `/workspace${window.location.search}`);
      return;
    }
    const storedRoute = window.localStorage.getItem(ACTIVE_WORKSPACE_ROUTE_KEY);
    if (getSessionIdFromWorkspaceRoute(storedRoute) === sessionIdParam) {
      window.localStorage.removeItem(ACTIVE_WORKSPACE_ROUTE_KEY);
    }
  }, [ACTIVE_WORKSPACE_ROUTE_KEY, isReadOnly, sessionIdParam, stageView.isCompleted]);

  const focusPreviewItems = React.useCallback((itemIds: string[], filter?: PreviewFilter) => {
    setPreviewFocusRequest({
      token: Date.now(),
      itemIds,
      filter,
    });
  }, []);

  const renderPreviewContent = () => (
    <ErrorBoundary fallbackTitle="预览区加载失败">
      <AnimatePresence mode="wait">
        <motion.div
           key={shouldShowScanningPreview ? "scanning-preview" : stage}
           initial={{ opacity: 0, y: 4 }}
           animate={{ opacity: 1, y: 0 }}
           exit={{ opacity: 0, y: -4 }}
           transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
           className="h-full w-full"
        >
          {(() => {
            if (shouldShowScanningPreview) {
              return (
                <MinimalScanningView
                  scanner={scanner}
                  progressPercent={progressPercent}
                  onAbort={() => setScanAbortConfirmOpen(true)}
                  aborting={loading}
                  isModelConfigured={isTextModelConfigured}
                />
              );
            }

            if (stageView.isCompleted) {
              return (
                <CompletionView
                  journal={journal}
                  summary={snapshot?.summary || ""}
                  loading={journalLoading || !journal}
                  targetDir={snapshot?.target_dir || ""}
                  isBusy={isBusy}
                  readOnly={isReadOnly}
                  onOpenExplorer={(path) => void openExplorer(path || snapshot?.target_dir || "")}
                  onCleanupDirs={() => {
                    if (!isReadOnly) void cleanupEmptyDirs();
                  }}
                  onRollback={() => {
                    if (!isReadOnly) void rollback();
                  }}
                  onGoHome={handleExitWorkbench}
                />
              );
            }

            if (stageView.isReadyToExecute) {
              return (
                <PrecheckView
                  summary={snapshot?.precheck_summary || null}
                  planItems={snapshot?.plan_snapshot?.items || []}
                  targetSlots={snapshot?.plan_snapshot?.target_slots || []}
                  isBusy={isBusy}
                  readOnly={isReadOnly}
                  onRequestExecute={() => {
                    if (!isReadOnly) {
                      setExecuteConfirmOpen(true);
                    }
                  }}
                  onBack={() => {
                    if (!isReadOnly) void returnToPlanning();
                  }}
                  onLocateIssue={(itemIds, filter) => {
                    if (isReadOnly) return;
                    void (async () => {
                      await returnToPlanning();
                      focusPreviewItems(itemIds, filter as PreviewFilter | undefined);
                    })();
                  }}
                />
              );
            }

            if (stageView.isDraftLike) {
              return (
                <EmptyState
                  icon={Layers}
                  title="整理预览准备中"
                  description="先开始扫描，系统会在这里显示整理前后的目录变化。"
                  className="mx-auto h-[70vh] max-w-[1360px]"
                />
              );
            }

            if (stageView.isTargetSelection) {
              return (
                <IncrementalSelectionView
                  rootDirectoryOptions={incrementalSelection?.root_directory_options || []}
                  sourceTreeEntries={snapshot?.source_tree_entries || []}
                  loading={loading}
                  onConfirm={(selectedTargetDirs) => {
                    if (!isReadOnly) {
                      void confirmTargetDirectories(selectedTargetDirs);
                    }
                  }}
                />
              );
            }

            return (
              <div className="flex h-full flex-col">
                {stageView.isRecovery && (
                  <div className="z-10 border-b border-warning/15 bg-warning-container/8 px-4 py-2.5 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-warning/15 text-warning">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <p className="text-[13px] font-medium text-on-surface">
                          {stageView.isStale ? "当前方案已过期，建议重新扫描以同步目录状态。" : "任务已中断，建议重新扫描后再继续。"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleExitWorkbench}
                          className="rounded-[6px] px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant transition-colors hover:bg-on-surface/5"
                        >
                          稍后再说
                        </button>
                        <button
                          type="button"
                          onClick={() => void refreshPlan()}
                          className="inline-flex items-center gap-1.5 rounded-[8px] bg-warning px-3 py-1.5 text-[12px] font-bold text-white shadow-sm transition-opacity hover:opacity-90"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          重新扫描
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex-1 overflow-hidden">
                  <PreviewPanel
                    plan={plan}
                    stage={stage}
                    organizeMode={snapshot?.strategy?.organize_mode || "initial"}
                    isBusy={isBusy}
                    isPlanSyncing={isPlanSyncing}
                    plannerStatus={plannerStatus}
                    plannerRunKey={snapshot?.planner_progress?.started_at || null}
                    readOnly={isReadOnly}
                    focusRequest={previewFocusRequest}
                    sourceTreeEntries={snapshot?.source_tree_entries || []}
                    incrementalSelection={incrementalSelection}
                    precheckSummary={snapshot?.precheck_summary}
                    onRunPrecheck={() => {
                      if (!isReadOnly) void runPrecheck();
                    }}
                    onUpdateItem={async (id, payload) => {
                      if (!isReadOnly) await updateItem({ item_id: id, ...payload });
                    }}
                  />
                </div>
              </div>
            );
          })()}
        </motion.div>
      </AnimatePresence>
    </ErrorBoundary>
  );

  const renderLayoutSkeleton = () => (
    <div className="flex flex-1 min-h-0 animate-pulse">
      <section
        style={{ width: `${DEFAULT_LEFT_WIDTH}%` }}
        className="flex min-h-0 min-w-[360px] flex-col border-r border-on-surface/7 bg-surface-container-lowest"
      >
        <div className="border-b border-on-surface/6 px-5 py-4">
          <div className="h-5 w-32 rounded bg-surface-container-low" />
          <div className="mt-3 h-3 w-56 rounded bg-surface-container-low" />
        </div>
        <div className="flex-1 space-y-4 px-5 py-5">
          <div className="h-24 rounded-[8px] bg-surface-container-low" />
          <div className="h-24 rounded-[8px] bg-surface-container-low" />
          <div className="h-24 rounded-[8px] bg-surface-container-low" />
        </div>
        <div className="border-t border-on-surface/6 px-5 py-4">
          <div className="h-14 rounded-[8px] bg-surface-container-low" />
        </div>
      </section>
      <section
        style={{ width: `${100 - DEFAULT_LEFT_WIDTH}%` }}
        className="flex min-h-0 min-w-[320px] flex-col bg-surface-container-low/45 p-5"
      >
        <div className="h-28 rounded-[8px] bg-surface-container-low" />
        <div className="mt-4 grid flex-1 gap-4 md:grid-cols-2">
          <div className="rounded-[8px] bg-surface-container-low" />
          <div className="rounded-[8px] bg-surface-container-low" />
        </div>
      </section>
    </div>
  );

  const conversationPanel = (
    <ConversationPanel
      messages={chatMessages}
      assistantDraft={assistantDraft}
      error={chatError}
      composerMode={effectiveComposerMode}
      isBusy={isBusy}
      isComposerLocked={isComposerLocked}
      composerStatus={composerStatus}
      plannerStatus={plannerStatus}
      stage={stage}
      messageInput={messageInput}
      setMessageInput={setMessageInput}
      onSendMessage={handleSendMessage}
      onStartScan={handleStartScan}
      unresolvedCount={plan.unresolved_items.length}
      canRunPrecheck={canRunPrecheck}
      notice={statusNotice}
      scanner={scanner}
      progressPercent={progressPercent}
    />
  );

  const conversationHeader = (
    <div className="z-20 flex shrink-0 items-center justify-between gap-3 border-b border-on-surface/8 bg-surface px-4 py-2 lg:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-on-surface/8 bg-surface-container-low px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              stageView.isCompleted ? "bg-success" : "bg-primary/60"
            )} />
            {getFriendlyStage(stage)}
          </span>
          {assistantRuntime && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/10 bg-primary/6 px-2 py-0.5 text-[10px] font-bold text-primary/75">
              <Loader2 className="h-3 w-3 animate-spin-slow" />
              {assistantRuntime.label}
            </span>
          )}
          {streamStatus !== "connected" && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                streamStatus === "connecting" && "border-warning/20 bg-warning-container/20 text-warning",
                streamStatus === "reconnecting" && "border-warning/20 bg-warning-container/30 text-warning",
                streamStatus === "offline" && "border-on-surface/10 bg-surface-container-low text-ui-muted",
              )}
            >
              {streamStatus === "connecting" ? "正在连接" : streamStatus === "reconnecting" ? "重连中" : "连接已断开"}
            </span>
          )}
        </div>
        <div className="h-3 w-[1px] bg-on-surface/10 hidden sm:block" />
        <p className="hidden md:block truncate text-[11px] font-medium text-ui-muted" title={targetPath}>
          {nextStepHint}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={handleExitWorkbench}
          className="inline-flex items-center gap-1.5 rounded-[6px] border border-on-surface/10 bg-on-surface/[0.02] px-2.5 py-1 text-[11px] font-bold text-on-surface-variant transition-all hover:bg-on-surface/5 hover:text-on-surface active:scale-95"
        >
          <LogOut className="h-3.5 w-3.5" />
          退出
        </button>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="relative flex min-h-0 flex-1 overflow-hidden bg-surface">
      <ErrorBoundary fallbackTitle="页面加载出错了" className="flex-1">
        {layoutReady ? (
          <div className="flex flex-1 min-h-0 bg-transparent">
            {showConversationPane && (
              <section
                ref={leftPaneRef}
                style={{ width: `${leftWidth}%` }}
                className="relative flex h-full min-h-0 min-w-[360px] flex-col border-r border-on-surface/6 bg-surface-container-lowest"
              >
                {conversationHeader}
                {conversationPanel}
              </section>
            )}

            {showConversationPane && (
              <div
                ref={dividerRef}
                onMouseDown={handleStartResizing}
                className={cn(
                  "absolute top-0 bottom-0 w-2.5 z-40 transition-colors cursor-col-resize flex items-center justify-center select-none group",
                  isResizingState ? "bg-transparent" : "hover:bg-primary/[0.018]",
                )}
                style={{ left: dividerLeft !== null ? `${dividerLeft - 1.25}px` : `calc(${leftWidth}% - 1.25px)` }}
              >
                <div
                  className={cn(
                    "w-[1px] h-full transition-all duration-300",
                    isResizingState
                      ? "bg-primary/35 shadow-[0_0_12px_rgba(0,120,212,0.18)] scale-x-[1.5]"
                      : "bg-on-surface/[0.06] group-hover:bg-primary/18",
                  )}
                />
                <div
                  className={cn(
                    "absolute top-1/2 flex h-9 w-5 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-[8px] border border-on-surface/8 bg-surface-container-lowest transition-all duration-200",
                    isResizingState
                      ? "scale-110 border-primary/20 opacity-100 shadow-[0_4px_10px_rgba(0,0,0,0.08)]"
                      : "opacity-0 group-hover:opacity-100 scale-100",
                  )}
                >
                  <div className={cn("w-[1.5px] h-3 rounded-sm transition-colors", isResizingState ? "bg-primary/40" : "bg-on-surface/15")} />
                  <div className={cn("w-[1.5px] h-3 rounded-sm transition-colors", isResizingState ? "bg-primary/40" : "bg-on-surface/15")} />
                </div>
              </div>
            )}

            <section
              ref={rightPaneRef as any}
              style={{ width: showConversationPane ? `${100 - leftWidth}%` : "100%" }}
              className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-container-lowest/30"
            >
              <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">{renderPreviewContent()}</div>
            </section>
          </div>
        ) : renderLayoutSkeleton()}
      </ErrorBoundary>
      <ConfirmDialog
        open={exitConfirmOpen}
        title="返回首页？"
        description="当前的整理进度会自动保存。之后你可以从首页继续这项任务。"
        confirmLabel="确认退出"
        cancelLabel="留在工作台"
        tone="primary"
        loading={loading}
        onConfirm={handleConfirmExitWorkbench}
        onCancel={() => setExitConfirmOpen(false)}
      />
      <ConfirmDialog
        open={scanAbortConfirmOpen}
        title="确认中断本次扫描？"
        description="中断后会结束当前整理任务并返回首页。这一轮扫描不会继续生成后续方案。"
        confirmLabel="确认中断"
        cancelLabel="继续扫描"
        tone="danger"
        loading={loading}
        onConfirm={handleConfirmAbortScan}
        onCancel={() => setScanAbortConfirmOpen(false)}
      />
      <ConfirmDialog
        open={executeConfirmOpen}
        title="确认执行这次整理？"
        description={`执行后会真实移动本地文件。本次将处理 ${precheck?.move_preview.length ?? 0} 项${reviewMoveCount > 0 ? `，其中 ${reviewMoveCount} 项进入 Review` : ""}${precheckItemsSummary ? `。涉及条目：${precheckItemsSummary}` : ""}。`}
        confirmLabel="开始执行"
        cancelLabel="再看看"
        tone="primary"
        loading={loading}
        onConfirm={async () => {
          const success = await execute();
          if (success) setExecuteConfirmOpen(false);
        }}
        onCancel={() => setExecuteConfirmOpen(false)}
      >
        <div className="grid gap-2 text-[13px]">
          <div className="flex items-center justify-between rounded-[10px] bg-surface-container-low px-3 py-2">
            <span className="text-ui-muted">本次将移动</span>
            <span className="font-semibold text-on-surface">{precheck?.move_preview.length ?? 0} 项</span>
          </div>
          <div className="flex items-center justify-between rounded-[10px] bg-surface-container-low px-3 py-2">
            <span className="text-ui-muted">本次将创建目录</span>
            <span className="font-semibold text-on-surface">{precheck?.mkdir_preview.length ?? 0} 个</span>
          </div>
          <div className="flex items-center justify-between rounded-[10px] bg-surface-container-low px-3 py-2">
            <span className="text-ui-muted">将进入 Review</span>
            <span className="font-semibold text-on-surface">{reviewMoveCount} 项</span>
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
