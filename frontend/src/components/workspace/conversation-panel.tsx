"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Bot,
  ChevronDown,
  Cpu,
  Loader2,
  Sparkles,
  User,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type {
  AssistantRuntimeStatus,
  AssistantMessage,
  ComposerMode,
  ScannerProgress,
  SessionStage,
  UnresolvedChoiceResolution,
  UnresolvedChoicesBlock,
} from "@/types/session";

import { MarkdownProse } from "./markdown-prose";
import { UnresolvedChoicesBubble, type ResolutionDraft, type ResolutionDraftMap } from "./unresolved-choices-bubble";
import { ComposerBar } from "./composer-bar";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ConversationNotice {
  tone: "info" | "warning" | "danger";
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

interface ConversationPanelProps {
  messages: AssistantMessage[];
  assistantDraft: string;
  error: string | null;
  composerMode: ComposerMode;
  isBusy: boolean;
  isComposerLocked: boolean;
  composerStatus?: AssistantRuntimeStatus | null;
  stage: SessionStage;
  messageInput: string;
  setMessageInput: (val: string) => void;
  onSendMessage: () => void;
  onStartScan: () => void;
  onResolveUnresolved: (payload: { request_id: string; resolutions: UnresolvedChoiceResolution[] }) => Promise<void> | void;
  unresolvedCount: number;
  notice?: ConversationNotice | null;
  scanner?: ScannerProgress;
  progressPercent?: number;
  plannerStatus?: {
    label: string;
    detail: string | null;
    elapsedLabel: string | null;
    reassureText: string | null;
    attempt: number;
    phase: string | null;
    isRunning: boolean;
  } | null;
}


export function ConversationPanel({
  messages,
  assistantDraft,
  error,
  composerMode,
  isBusy,
  isComposerLocked,
  composerStatus,
  stage,
  messageInput,
  setMessageInput,
  onSendMessage,
  onStartScan,
  onResolveUnresolved,
  unresolvedCount,
  notice,
  scanner,
  progressPercent = 0,
  plannerStatus,
}: ConversationPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, ResolutionDraftMap>>({});
  const [resolutionWarnings, setResolutionWarnings] = useState<Record<string, string | null>>({});
  const [submittingRequestId, setSubmittingRequestId] = useState<string | null>(null);

  useEffect(() => {
    setResolutionDrafts((prev) => {
      const next = { ...prev };
      for (const message of messages) {
        for (const block of message.blocks || []) {
          if (block.type !== "unresolved_choices") continue;
          const existing = next[block.request_id] || {};
          const merged: ResolutionDraftMap = { ...existing };
          for (const item of block.items) {
            if (!merged[item.item_id]) {
              merged[item.item_id] = { selected_folder: "", note: "", custom_selected: false };
            }
          }
          next[block.request_id] = merged;
        }
      }
      return next;
    });
  }, [messages]);


  useEffect(() => {
    if (!isPinnedToBottom) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, assistantDraft, isPinnedToBottom]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 120;
    const pinned = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    setIsPinnedToBottom(pinned);
  };

  const handleJumpToBottom = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setIsPinnedToBottom(true);
  };

  const updateDraft = (requestId: string, itemId: string, updater: (draft: ResolutionDraft) => ResolutionDraft) => {
    setResolutionDrafts((prev) => ({
      ...prev,
      [requestId]: {
        ...(prev[requestId] || {}),
        [itemId]: updater(prev[requestId]?.[itemId] || { selected_folder: "", note: "", custom_selected: false }),
      },
    }));
  };

  const handleSubmitUnresolved = async (block: UnresolvedChoicesBlock) => {
    const drafts = resolutionDrafts[block.request_id] || {};
    const missing = block.items
      .filter((item) => {
        const draft = drafts[item.item_id] || { selected_folder: "", note: "", custom_selected: false };
        const customNote = draft.custom_selected ? draft.note.trim() : "";
        return !draft.selected_folder && !customNote;
      })
      .map((item) => item.display_name);

    if (missing.length > 0) {
      setResolutionWarnings((prev) => ({
        ...prev,
        [block.request_id]: `以下条目仍未处理：${missing.join("、")}`,
      }));
      return;
    }

    setResolutionWarnings((prev) => ({ ...prev, [block.request_id]: null }));
    setSubmittingRequestId(block.request_id);
    try {
      await onResolveUnresolved({
        request_id: block.request_id,
        resolutions: block.items.map((item) => {
          const draft = drafts[item.item_id] || { selected_folder: "", note: "", custom_selected: false };
          return {
            item_id: item.item_id,
            selected_folder: draft.selected_folder,
            note: draft.custom_selected ? draft.note.trim() : "",
          };
        }),
      });
    } finally {
      setSubmittingRequestId((current) => (current === block.request_id ? null : current));
    }
  };

  const renderNotice = notice ? (
    <div
      className={cn(
        "rounded-[4px] border p-4",
        notice.tone === "danger" && "border-error/20 bg-error-container/10",
        notice.tone === "warning" && "border-warning/20 bg-warning-container/20",
        notice.tone === "info" && "border-primary/12 bg-surface-container-lowest",
      )}
    >
      <div className="space-y-3">
        <div>
          <h3 className="text-[14px] font-semibold text-on-surface">{notice.title}</h3>
          <p className="mt-1 text-[13px] leading-6 text-ui-muted">{notice.description}</p>
        </div>
        {(notice.primaryAction || notice.secondaryAction) && (
          <div className="flex flex-wrap gap-3">
            {notice.primaryAction && (
              <button
                type="button"
                onClick={notice.primaryAction.onClick}
                className="rounded-[10px] border border-primary/20 bg-primary px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dim"
              >
                {notice.primaryAction.label}
              </button>
            )}
            {notice.secondaryAction && (
              <button
                type="button"
                onClick={notice.secondaryAction.onClick}
                className="rounded-[4px] border border-on-surface/8 bg-surface-container-lowest px-4 py-2.5 text-[13px] font-bold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
              >
                {notice.secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const scanningItems = [...(scanner?.recent_analysis_items || [])].slice(-5).reverse();
  const currentScanningItem = scanner?.current_item || scanningItems[0]?.display_name || "正在准备扫描";
  const scanningPercent = Math.max(0, Math.min(100, Math.round(progressPercent)));

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div ref={scrollContainerRef} onScroll={handleScroll} className="relative min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 scroll-smooth lg:px-6 lg:py-6">
        {(stage === "idle" || stage === "draft") && messages.length === 0 && !notice && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="flex flex-col items-center justify-center space-y-5 py-18 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-[6px] border border-primary/12 bg-primary/6 text-primary/55">
              <Cpu className="w-7 h-7" />
            </div>
            <div className="max-w-[360px] space-y-3">
              <h3 className="text-[1.1rem] font-black font-headline leading-tight text-on-surface tracking-tight">
                {isBusy ? "正在启动扫描" : "开始扫描以生成初始方案"}
              </h3>
              <p className="text-ui-body font-medium leading-relaxed text-ui-muted">
                {isBusy
                  ? "系统正在进入扫描阶段，读取目录结构后会生成第一版整理方案。"
                  : "先扫描当前目录并分析文件结构，再生成第一版整理方案。"}
              </p>
              {isBusy ? (
                <div className="pt-2">
                  <div className="inline-flex items-center gap-2.5 rounded-[4px] border border-primary/16 bg-primary/8 px-6 py-3 text-[13px] font-black text-primary">
                    <Loader2 className="w-4 h-4 animate-spin" /> 正在自动开始
                  </div>
                </div>
              ) : (
                <div className="pt-2">
                  <button
                    onClick={onStartScan}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2.5 rounded-[4px] border border-primary/20 bg-primary px-6 py-3 text-[13px] font-black text-white transition-colors hover:bg-primary/90 active:scale-[0.96] disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" /> 开始扫描
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
        
        {stage === "scanning" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-[6px] border border-on-surface/8 bg-surface-container-low px-4 py-3 shadow-sm shadow-black/[0.02]"
          >
            <div className="flex items-start gap-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-primary/20 bg-primary/5 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-[13px] font-bold text-on-surface">正在扫描</p>
                    <div className="flex items-center gap-2 text-[10px] text-ui-muted font-bold uppercase tracking-wider">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75"></span>
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary/60"></span>
                      </span>
                      当前处理：{currentScanningItem}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-primary/10 px-2.5 py-0.5 text-[12px] font-black tabular-nums text-primary">
                    {scanningPercent}%
                  </div>
                </div>
                {scanningItems.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {scanningItems.slice(0, 3).map((item) => (
                      <span
                        key={item.item_id}
                        className="max-w-[180px] truncate rounded-full border border-on-surface/8 bg-surface px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant"
                        title={item.display_name}
                      >
                        {item.display_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        <div className="space-y-1.5">
          {messages.map((message, idx) => {
            const isAssistant = message.role === "assistant";
            const prevMessage = messages[idx - 1];
            const isPrevSystemLog = prevMessage?.role === "assistant" && !prevMessage.content?.trim() && (prevMessage.blocks || []).length === 0;
            const isGrouped = prevMessage && prevMessage.role === message.role && !isPrevSystemLog;
            const isSystemLog = isAssistant && !message.content?.trim() && (message.blocks || []).length === 0;

            if (isSystemLog) {
              return (
                <div key={message.id} className="ml-10 py-1.5 text-[11.5px] font-bold text-on-surface-variant/40 flex items-center gap-2">
                  <div className="h-[1px] w-4 bg-on-surface-variant/10" />
                  系统记录已同步
                </div>
              );
            }
            
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "relative flex gap-4", 
                  isAssistant ? "flex-row" : "flex-row-reverse justify-start",
                  isGrouped ? "mt-2" : "mt-8",
                  isGrouped ? "pb-0" : "pb-1"
                )}
              >
                {isAssistant && (
                  <div className={cn(
                    "absolute left-[13px] w-[1px] bg-on-surface-variant/8 transition-all pointer-events-none",
                    !isGrouped ? "top-9" : "top-0",
                    messages[idx + 1]?.role === "assistant" ? "bottom-[-2rem]" : "bottom-0"
                  )} />
                )}
                <div className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-opacity z-10 mt-0.5",
                  isAssistant ? "bg-surface-container border border-on-surface/8 text-primary shadow-[0_2px_8px_rgba(0,0,0,0.04)]" : "bg-primary text-white shadow-md shadow-primary/20",
                  isGrouped ? "opacity-0" : "opacity-100"
                )}>
                  {isAssistant ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  {message.content && (
                    <div
                      className={cn(
                        "transition-all",
                        isAssistant
                          ? "text-on-surface pt-0.5"
                          : "text-[14.5px] font-medium text-on-surface/80 whitespace-pre-wrap ml-auto max-w-[85%] pt-1 text-right leading-relaxed"
                      )}
                    >
                      {isAssistant ? <MarkdownProse content={message.content} /> : message.content}
                    </div>
                  )}
                  {isAssistant && (message.blocks || []).map((block) => {
                    if (block.type !== "unresolved_choices") return null;
                    return (
                      <div key={block.request_id} className="max-w-[90%] 2xl:max-w-[88%] transform group">
                        <UnresolvedChoicesBubble
                          block={block}
                          drafts={resolutionDrafts[block.request_id] || {}}
                          warning={resolutionWarnings[block.request_id] || null}
                          isSubmitting={submittingRequestId === block.request_id}
                          onPickFolder={(itemId, folder) => {
                            updateDraft(block.request_id, itemId, (draft) => ({ ...draft, selected_folder: folder, custom_selected: false }));
                          }}
                          onPickCustom={(itemId) => {
                            updateDraft(block.request_id, itemId, (draft) => ({ ...draft, selected_folder: "", custom_selected: true }));
                          }}
                          onChangeNote={(itemId, note) => {
                            updateDraft(block.request_id, itemId, (draft) => ({ ...draft, note, custom_selected: true, selected_folder: "" }));
                          }}
                          onSetAllReview={() => {
                            setResolutionDrafts((prev) => ({
                              ...prev,
                              [block.request_id]: Object.fromEntries(
                                block.items.map((item) => {
                                  const current = prev[block.request_id]?.[item.item_id] || { selected_folder: "", note: "", custom_selected: false };
                                  return [item.item_id, { ...current, selected_folder: "Review", custom_selected: false }];
                                }),
                              ),
                            }));
                            setResolutionWarnings((prev) => ({ ...prev, [block.request_id]: null }));
                          }}
                          onSubmit={() => void handleSubmitUnresolved(block)}
                        />
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}

          {assistantDraft && (
            <motion.div
              key="assistant-streaming-bubble"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4 mt-8"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-on-surface/8 bg-surface-container text-primary shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-0.5">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 pt-0.5 text-on-surface">
                <div className="mb-2 flex items-center gap-2 text-primary/70">
                  <div className="flex gap-0.5">
                    {[0, 0.2, 0.4].map((delay) => (
                      <motion.span key={delay} animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2, delay }} className="w-1.5 h-1.5 bg-current rounded-full" />
                    ))}
                  </div>
                  <span className="ml-0 text-[11.5px] font-semibold uppercase tracking-wider">系统思考中</span>
                </div>
                <div className="relative">
                  <MarkdownProse content={assistantDraft} />
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} className="inline-block w-1.5 h-4 bg-primary/40 ml-1 translate-y-0.5" />
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {!isPinnedToBottom && (messages.length > 0 || assistantDraft) && (
          <div className="sticky bottom-4 z-40 flex justify-end pr-2 pb-2">
            <button
              type="button"
              onClick={handleJumpToBottom}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-surface shadow-xl shadow-primary/10 transition-all hover:scale-110 hover:border-primary/40 active:scale-95 text-primary backdrop-blur-sm"
              title="回到底部"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <ComposerBar
        composerMode={composerMode}
        error={error}
        composerStatus={composerStatus}
        plannerStatus={plannerStatus}
        unresolvedCount={unresolvedCount}
        stage={stage}
        isBusy={isBusy}
        isComposerLocked={isComposerLocked}
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        onSendMessage={onSendMessage}
      />
    </div>
  );
}
