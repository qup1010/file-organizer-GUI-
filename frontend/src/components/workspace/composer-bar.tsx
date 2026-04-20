import { useRef } from "react";
import { AlertTriangle, Loader2, Send, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getSessionStageView } from "@/lib/session-view-model";
import { cn } from "@/lib/utils";
import { AssistantRuntimeStatus, ComposerMode, SessionStage } from "@/types/session";

export interface ComposerBarProps {
  composerMode: ComposerMode;
  error: string | null;
  composerStatus?: AssistantRuntimeStatus | null;
  plannerStatus?: {
    label: string;
    detail: string | null;
    elapsedLabel: string | null;
    reassureText: string | null;
    attempt: number;
    phase: string | null;
    isRunning: boolean;
  } | null;
  unresolvedCount: number;
  stage: SessionStage;
  isBusy: boolean;
  isComposerLocked: boolean;
  messageInput: string;
  setMessageInput: (val: string) => void;
  onSendMessage: () => void;
}

export function ComposerBar({
  composerMode,
  error,
  composerStatus,
  plannerStatus,
  unresolvedCount,
  stage,
  isBusy,
  isComposerLocked,
  messageInput,
  setMessageInput,
  onSendMessage,
}: ComposerBarProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stageView = getSessionStageView(stage);
  const canShowPrecheckHint =
    unresolvedCount === 0 &&
    stageView.isAwaitingPrecheck &&
    composerMode === "editable" &&
    !isBusy &&
    !composerStatus;
  const shouldShowPlannerStatus = Boolean(plannerStatus?.isRunning && composerMode === "editable");
  const plannerAttemptLabel =
    plannerStatus && plannerStatus.attempt > 1 && (plannerStatus.phase === "retrying" || plannerStatus.phase === "repairing")
      ? `第 ${plannerStatus.attempt} 次尝试`
      : null;

  // Auto-resize textarea logic can be added if needed or just use simple rows

  if (composerMode === "hidden") {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-col justify-center border-t border-on-surface/8 bg-surface-container-low px-5 py-4 lg:px-6">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mb-4 rounded-[4px] border border-error/12 bg-error-container/22 px-4 py-3 text-[13px] text-error"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="leading-6">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shouldShowPlannerStatus ? (
          <motion.div
            key="planner-status-card"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mb-3 rounded-[8px] border border-primary/12 bg-primary/[0.045] px-4 py-3 text-on-surface"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-primary/14 bg-primary/8 text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-bold text-on-surface">{plannerStatus?.label}</p>
                  {plannerAttemptLabel ? (
                    <span className="rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                      {plannerAttemptLabel}
                    </span>
                  ) : null}
                  {plannerStatus?.elapsedLabel ? (
                    <span className="rounded-full border border-on-surface/8 bg-surface px-2 py-0.5 text-[10px] font-bold text-primary">
                      {plannerStatus.elapsedLabel}
                    </span>
                  ) : null}
                </div>
                {plannerStatus?.detail ? (
                  <p className="mt-1 text-[12px] leading-5 text-on-surface-variant">{plannerStatus.detail}</p>
                ) : null}
                {plannerStatus?.reassureText ? (
                  <p className="mt-2 text-[11px] font-bold text-primary/80">{plannerStatus.reassureText}</p>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}

        {composerStatus && composerMode === "editable" && !shouldShowPlannerStatus ? (
          <motion.div
            key="composer-status-badge"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="mb-2 flex items-center gap-2 px-1 text-[12px] font-bold text-primary"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{composerStatus.label}</span>
            {composerStatus.detail && (
              <span className="font-medium text-primary/60 truncate opacity-80">— {composerStatus.detail}</span>
            )}
          </motion.div>
        ) : null}

        {unresolvedCount > 0 && composerMode === "editable" ? (
          <motion.div
            key="unresolved-count-pill"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="mb-2 flex items-center gap-2 rounded-full border border-warning/15 bg-warning-container/10 px-2.5 py-1 text-[11px] font-bold text-warning-dim shadow-sm"
          >
            <AlertTriangle className="h-3 w-3" />
            还有 {unresolvedCount} 项归类需要你确认
          </motion.div>
        ) : canShowPrecheckHint ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mb-2 flex items-center gap-2 px-1 text-[11px] font-bold text-success-dim/70"
          >
            <Sparkles className="h-3 w-3" />
            <p>方案已就绪，可以点击右侧底部的“开始预检”继续。</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {composerMode === "editable" ? (
        <div className={cn(
          "relative flex items-end rounded-[4px] border px-3 pb-1.5 pt-1.5 transition-all duration-300",
          isComposerLocked 
            ? "cursor-not-allowed border-on-surface/[0.06] bg-on-surface/[0.02] grayscale-[0.2]" 
            : "border-on-surface/[0.08] bg-surface-container-lowest focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/[0.015]"
        )}>
          <textarea
            ref={inputRef}
            rows={1}
            className={cn(
              "min-h-[44px] w-full resize-none border-none bg-transparent px-4 py-3 text-[14px] text-on-surface outline-none scrollbar-none transition-opacity placeholder:text-on-surface-variant/35",
              isComposerLocked && "opacity-40 select-none overflow-hidden"
            )}
            placeholder={isComposerLocked ? "系统正在更新方案，完成后会自动恢复输入" : "输入调整意见，或说明你希望修改的地方..."}
            value={messageInput}
            disabled={isComposerLocked}
            onChange={(event) => setMessageInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSendMessage();
              }
            }}
          />
          <button
            onClick={onSendMessage}
            disabled={isComposerLocked || !messageInput.trim()}
            className={cn(
              "mb-1.5 mr-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] transition-all active:scale-90",
              messageInput.trim() && !isComposerLocked
                ? "bg-primary text-white shadow-[0_4px_12px_rgba(0,120,212,0.16)]"
                : "text-on-surface-variant/20 bg-on-surface/[0.03]"
            )}
          >
            {isComposerLocked ? (
              <div className="relative flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                <motion.div 
                  animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-full bg-primary/20"
                />
              </div>
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      ) : (
        <div className="rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-5 py-4 text-[13px] text-on-surface-variant">
          正在扫描，暂时不能继续输入。
        </div>
      )}

    </div>
  );
}
