import { useRef } from "react";
import { AlertTriangle, Loader2, Send, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { AssistantRuntimeStatus, ComposerMode } from "@/types/session";

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
  canRunPrecheck: boolean;
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
  canRunPrecheck,
  isBusy,
  isComposerLocked,
  messageInput,
  setMessageInput,
  onSendMessage,
}: ComposerBarProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canShowPrecheckHint =
    unresolvedCount === 0 &&
    canRunPrecheck &&
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
    <div className="flex shrink-0 flex-col justify-center border-t border-on-surface/8 bg-surface-container-low px-6 transition-all">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="my-3 rounded-xl border border-error/20 bg-error/[0.03] px-5 py-4 text-[13px] text-error"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-error text-white">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="font-black text-[11px] uppercase tracking-widest opacity-60">系统提示</p>
                <p className="font-medium leading-relaxed">{error}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>

        {composerStatus && composerMode === "editable" && !shouldShowPlannerStatus ? (
          <motion.div
            key="composer-status-badge"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="mb-2 mt-4 flex items-center gap-2.5 px-1 text-[11px] font-black uppercase tracking-widest text-primary opacity-80"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{composerStatus.label}</span>
            {composerStatus.detail && (
              <span className="opacity-40 italic">— {composerStatus.detail}</span>
            )}
          </motion.div>
        ) : null}

        {unresolvedCount > 0 && composerMode === "editable" ? (
          <motion.div
            key="unresolved-count-pill"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mb-3 mt-1 flex items-center gap-2.5 self-start rounded-full border border-warning/20 bg-warning/[0.04] px-4 py-1.5 text-[11px] font-black text-warning-dim"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="uppercase tracking-wide">方案中有 {unresolvedCount} 个待确认项</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {composerMode === "editable" ? (
        <div
          className={cn(
            "mb-4 mt-2 flex flex-col gap-3",
            isComposerLocked && "opacity-40 select-none overflow-hidden",
          )}
        >
          {canShowPrecheckHint ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 self-start rounded-full border border-primary/15 bg-primary/[0.04] px-4 py-1.5 text-[11px] font-black text-primary"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="uppercase tracking-wide">当前方案已确认完毕，可以直接做安全检查</span>
            </motion.div>
          ) : null}

          <div className={cn(
            "relative flex items-end gap-3 rounded-xl border px-3 py-2.5 transition-all duration-500",
            isComposerLocked 
              ? "border-primary/40 bg-primary/5 ring-1 ring-primary/10" 
              : "border-on-surface/8 bg-surface-container-lowest focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20"
          )}>
            {isComposerLocked && (
              <motion.div
                layoutId="composer-shimmer"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-primary/[0.03] to-transparent pointer-events-none"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            )}
            <textarea
              ref={inputRef}
              rows={1}
              className={cn(
                "min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] font-medium leading-relaxed text-on-surface outline-none placeholder:text-on-surface-variant/40",
                isComposerLocked && "cursor-not-allowed",
              )}
              placeholder={isComposerLocked ? "系统正在处理，请稍候..." : "输入调整意见，或说明你希望修改的地方..."}
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
              type="button"
              onClick={onSendMessage}
              disabled={isComposerLocked || !messageInput.trim()}
              className={cn(
                "mb-0.5 mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all active:scale-90",
                messageInput.trim() && !isComposerLocked
                  ? "bg-primary text-white"
                  : "bg-on-surface/5 text-on-surface-variant/20",
              )}
            >
              {isComposerLocked ? (
                <div className="relative flex items-center justify-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </div>
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-5 py-4 text-[13px] text-on-surface-variant">
          正在扫描，暂时不能继续输入。
        </div>
      )}

    </div>
  );
}
