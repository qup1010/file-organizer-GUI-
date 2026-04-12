import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnresolvedChoicesBlock } from "@/types/session";

export interface ResolutionDraft {
  selected_folder: string;
  note: string;
  custom_selected: boolean;
}

export type ResolutionDraftMap = Record<string, ResolutionDraft>;

export interface UnresolvedChoicesBubbleProps {
  block: UnresolvedChoicesBlock;
  drafts: ResolutionDraftMap;
  warning: string | null;
  isSubmitting: boolean;
  onPickFolder: (itemId: string, folder: string) => void;
  onPickCustom: (itemId: string) => void;
  onChangeNote: (itemId: string, note: string) => void;
  onSetAllReview: () => void;
  onSubmit: () => void;
}

export function UnresolvedChoicesBubble({
  block,
  drafts,
  warning,
  isSubmitting,
  onPickFolder,
  onPickCustom,
  onChangeNote,
  onSetAllReview,
  onSubmit,
}: UnresolvedChoicesBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSubmitted = block.status === "submitted";
  const submittedItems = block.submitted_resolutions || [];

  const COLLAPSE_THRESHOLD = 3;
  const showExpandButton = !isSubmitted && block.items.length > COLLAPSE_THRESHOLD;
  const visibleItems = isExpanded || isSubmitted ? block.items : block.items.slice(0, COLLAPSE_THRESHOLD);

  if (isSubmitted) {
    return (
      <div className="mt-2.5 rounded-[4px] border border-success/15 bg-success[0.03] p-3 text-ui-body">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-success-dim">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
              <Check className="h-3 w-3" />
            </div>
            <span className="text-[13px] font-bold">已记录这些归类</span>
          </div>
          <span className="text-[12px] font-medium text-success-dim/60 tabular-nums">
            共处理 {block.items.length} 项
          </span>
        </div>
        <div className="mt-2 space-y-1.5 border-t border-success/10 pt-2 text-[12px]">
          {block.items.map((item, index) => {
            const submitted = submittedItems[index] || submittedItems.find((entry) => entry.item_id === item.item_id);
            return (
              <div key={`${item.item_id}-${index}`} className="flex items-baseline gap-2 text-on-surface/60">
                <span className="shrink-0 font-bold text-on-surface/80">{item.display_name}</span>
                <div className="h-[1px] flex-1 border-b border-dashed border-on-surface/5" />
                <span className="shrink-0 rounded-md bg-success/10 px-1.5 py-0.5 font-semibold text-success-dim">
                  {submitted?.selected_folder || "自定义/Review"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2.5 rounded-[6px] border border-on-surface/[0.04] bg-surface-container-low/70 backdrop-blur-md p-4 font-sans shadow-sm ring-1 ring-inset ring-white/5 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="flex items-center gap-2 text-[13px] font-bold tracking-tight text-on-surface/90">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-warning/10 text-warning">
              <Sparkles className="h-3 w-3" />
            </div>
            待决策项目
          </h4>
          <p className="text-[12px] font-medium leading-relaxed text-on-surface-variant/70">
            {block.summary || "请先为以下文件选择更稳妥的归类位置。"}
          </p>
        </div>
        <button
          type="button"
          onClick={onSetAllReview}
          className="shrink-0 rounded-[8px] border border-on-surface/5 bg-on-surface/[0.02] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/60 transition-all hover:bg-surface-container-lowest hover:text-on-surface active:scale-95"
        >
          全部 Review
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {visibleItems.map((item, index) => {
          const draft = drafts[item.item_id] || { selected_folder: "", note: "", custom_selected: false };
          const selectedFolder = draft.selected_folder;
          const currentNote = draft.note;
          const customSelected = draft.custom_selected;
          
          return (
            <div key={`${item.item_id}-${index}`} className="group/item rounded-[4px] border border-on-surface/[0.03] bg-surface-container-lowest/50 p-3.5 transition-all hover:border-primary/10 hover:shadow-md hover:shadow-black/[0.02]">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3 min-w-0">
                <span className="shrink-0 text-[13.5px] font-bold text-on-surface truncate max-w-[70%] sm:max-w-[60%]">{item.display_name}</span>
                <span className="text-[12px] font-medium text-ui-muted opacity-60 truncate flex-1">{item.question}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {item.suggested_folders.map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => onPickFolder(item.item_id, folder)}
                    className={cn(
                      "rounded-[4px] border px-3 py-1 text-[11.5px] font-black transition-all active:scale-95",
                      selectedFolder === folder
                        ? "border-primary bg-primary text-white shadow-lg shadow-primary/20"
                        : "border-on-surface/[0.06] bg-surface/80 text-on-surface-variant/80 hover:border-on-surface/20 hover:text-on-surface",
                    )}
                  >
                    {folder}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onPickFolder(item.item_id, "Review")}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11.5px] font-black transition-all active:scale-95",
                    selectedFolder === "Review"
                      ? "border-warning bg-warning text-white shadow-lg shadow-warning/20"
                      : "border-warning/10 bg-warning/5 text-warning/80 hover:bg-warning/10 hover:text-warning",
                  )}
                >
                  Review
                </button>
                <button
                  type="button"
                  onClick={() => onPickCustom(item.item_id)}
                  className={cn(
                    "rounded-[4px] border px-3 py-1 text-[11.5px] font-black transition-all active:scale-95",
                    customSelected
                      ? "border-on-surface bg-on-surface text-white"
                      : "border-on-surface/[0.06] bg-surface/80 text-on-surface-variant/80 hover:bg-on-surface/5 hover:text-on-surface",
                  )}
                >
                  自定义
                </button>
              </div>

              {customSelected && (
                <textarea
                  value={currentNote}
                  onChange={(event) => onChangeNote(item.item_id, event.target.value)}
                  placeholder="补充你的分类建议..."
                  className="mt-3 min-h-[64px] w-full rounded-[4px] border border-on-surface/[0.08] bg-surface-container-low/50 px-3 py-2.5 text-[12px] font-medium leading-relaxed text-on-surface outline-none transition-all focus:border-primary/30"
                />
              )}
            </div>
          );
        })}

        {showExpandButton && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full items-center justify-center gap-2 py-1 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/40 transition-colors hover:text-primary"
          >
            {isExpanded ? (
              <>收起所有项目 <ChevronDown className="h-3 w-3 rotate-180" /></>
            ) : (
              <>展开其余 {block.items.length - COLLAPSE_THRESHOLD} 个项目 <ChevronDown className="h-3 w-3" /></>
            )}
          </button>
        )}
      </div>

      {warning && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[4px] border border-error/10 bg-error-container/10 px-4 py-2.5 text-[11.5px] font-bold text-error">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {warning}
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting}
        className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-[4px] border border-primary/20 bg-primary py-2.5 text-[13px] font-black text-white transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-40"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        记录这些决策
      </button>
    </div>
  );
}
