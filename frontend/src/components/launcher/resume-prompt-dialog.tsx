import { motion, AnimatePresence } from "framer-motion";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFriendlyStage } from "@/lib/utils";
import { StrategySummaryChips } from "./strategy-summary-chips";
import { SessionSnapshot, SessionStrategySummary } from "@/types/session";

export function ResumePromptDialog({
  open,
  targetDir,
  resumePrompt,
  resumeStrategy,
  isCompletedResume,
  onConfirmResume,
  onStartFresh,
  onReadOnlyView,
  onCancel,
}: {
  open: boolean;
  targetDir: string;
  resumePrompt: { sessionId: string; snapshot: SessionSnapshot } | null;
  resumeStrategy: SessionStrategySummary;
  isCompletedResume: boolean;
  onConfirmResume: () => void;
  onStartFresh: () => void;
  onReadOnlyView: () => void;
  onCancel: () => void;
}) {
  if (!resumePrompt) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-surface/78 backdrop-blur-md p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="ui-dialog w-full max-w-[760px] bg-surface-container-lowest p-6 sm:p-7"
          >
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[8px] border border-primary/12 bg-primary/10 text-primary">
                <History className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-black font-headline text-on-surface tracking-tight">
                  {isCompletedResume ? "发现之前的整理记录" : "发现上一次还没整理完"}
                </h2>
                <p className="text-ui-body font-medium text-ui-muted">
                  {isCompletedResume
                    ? "你可以先查看之前的结果，也可以按这次的预设重新开始"
                    : "你可以继续上一次任务，或者按这次的预设重新开始"}
                </p>
              </div>
            </div>

            <p className="mb-5 text-sm leading-relaxed text-on-surface-variant">
              检测到这个目录（<strong>{targetDir.split(/[\\/]/).pop()}</strong>）
              {isCompletedResume ? "之前已经整理过一次" : "之前还有一条未完成的记录"}（当前状态：
              <em>{getFriendlyStage(resumePrompt.snapshot.stage)}</em>）。
            </p>

            <div className="mb-6 rounded-[10px] border border-on-surface/8 bg-surface px-5 py-5">
              <p className="text-ui-section font-semibold text-ui-muted">上一次使用的设置</p>
              <StrategySummaryChips strategy={resumeStrategy} />
            </div>

            <div className="flex flex-col gap-4">
              <Button
                variant="primary"
                onClick={onConfirmResume}
                className="w-full py-4 text-sm"
              >
                {isCompletedResume ? "查看之前的结果" : "继续上一次整理"}
              </Button>
              <div className="rounded-[10px] border border-on-surface/8 bg-surface px-5 py-4 text-ui-section font-medium leading-relaxed text-ui-muted">
                {isCompletedResume
                  ? "重新开始会按当前选择的预设重新扫描这个目录。"
                  : "重新开始会结束上一次未完成的状态，并按当前选择的预设重新扫描。"}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="secondary"
                  onClick={onStartFresh}
                  className="py-3.5"
                >
                  重新开始
                </Button>
                <Button
                  variant="secondary"
                  onClick={onReadOnlyView}
                  className="py-3.5"
                >
                  只读打开
                </Button>
                <Button
                  variant="ghost"
                  onClick={onCancel}
                  className="py-3.5"
                >
                  取消
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
