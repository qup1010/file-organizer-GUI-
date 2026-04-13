import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Layers3, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAUTION_LEVEL_OPTIONS, NAMING_STYLE_OPTIONS, STRATEGY_TEMPLATES, getTemplateMeta } from "@/lib/strategy-templates";
import { SessionStrategySelection } from "@/types/session";

export function StrategyDialog({
  open,
  loading,
  targetDir,
  strategy,
  onClose,
  onConfirm,
  onTemplateSelect,
  onChangeNaming,
  onChangeCaution,
  onChangeNote,
}: {
  open: boolean;
  loading: boolean;
  targetDir: string;
  strategy: SessionStrategySelection;
  onClose: () => void;
  onConfirm: () => void;
  onTemplateSelect: (templateId: SessionStrategySelection["template_id"]) => void;
  onChangeNaming: (id: SessionStrategySelection["naming_style"]) => void;
  onChangeCaution: (id: SessionStrategySelection["caution_level"]) => void;
  onChangeNote: (value: string) => void;
}) {
  const currentTemplate = useMemo(() => getTemplateMeta(strategy.template_id), [strategy.template_id]);
  const previewDirectories = currentTemplate.previewDirectories[strategy.naming_style] || [];
  const namingLabel = NAMING_STYLE_OPTIONS.find((item) => item.id === strategy.naming_style)?.label || "中文目录";
  const cautionLabel = CAUTION_LEVEL_OPTIONS.find((item) => item.id === strategy.caution_level)?.label || "平衡";

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/78 px-4 py-6 backdrop-blur-[6px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 20 }}
            className="ui-dialog flex h-[min(88vh,860px)] w-full max-w-[1100px] flex-col overflow-hidden bg-surface-container-lowest"
          >
            <div className="flex items-start justify-between gap-6 border-b border-on-surface/8 bg-surface px-5 py-4 lg:px-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-[8px] border border-primary/12 bg-primary/8 px-2.5 py-1 text-[12px] font-semibold text-primary">
                  <Layers3 className="h-3.5 w-3.5" />
                  启动配置
                </div>
                <div className="space-y-1">
                  <h2 className="text-[1.16rem] font-black tracking-tight text-on-surface">补充本轮整理策略</h2>
                  <p className="max-w-2xl text-[13px] leading-6 text-ui-muted">同屏完成模板、命名方式、整理方式和补充说明，再进入扫描。</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="ui-panel-muted hidden px-4 py-3 lg:block">
                  <div className="text-ui-meta text-ui-muted">目标目录</div>
                  <p className="mt-1 max-w-[260px] truncate font-mono text-[12px] font-medium text-on-surface" title={targetDir}>{targetDir}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={onClose} className="h-10 w-10 rounded-[8px] p-0" title="关闭">
                  <X className="h-4.5 w-4.5" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-5 lg:px-6">
              <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                <section className="rounded-[10px] border border-on-surface/8 bg-surface p-3">
                  <div className="mb-3 px-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ui-muted">整理模板</p>
                  </div>
                  <div className="space-y-2">
                    {STRATEGY_TEMPLATES.map((template) => {
                      const active = strategy.template_id === template.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => onTemplateSelect(template.id)}
                          disabled={loading}
                          className={cn(
                            "flex w-full flex-col rounded-[8px] border px-3.5 py-3 text-left transition-all disabled:opacity-50",
                            active ? "border-primary/25 bg-primary/10 shadow-sm" : "border-transparent bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                          )}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-3">
                            <p className={cn("text-[13px] font-bold tracking-tight", active ? "text-primary" : "text-on-surface")}>{template.label}</p>
                            {active ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
                          </div>
                          <p className="text-[11.5px] leading-[1.6] text-ui-muted">{template.applicableScenarios}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-5">
                  <div className="rounded-[10px] border border-on-surface/8 bg-surface-container-lowest p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[12px] font-semibold text-primary">{currentTemplate.label}</span>
                      <span className="rounded-full border border-on-surface/8 bg-surface px-3 py-1 text-[12px] font-medium text-on-surface-variant">{namingLabel}</span>
                      <span className="rounded-full border border-on-surface/8 bg-surface px-3 py-1 text-[12px] font-medium text-on-surface-variant">{cautionLabel}</span>
                    </div>
                    <p className="mt-3 text-[13.5px] leading-7 text-ui-muted">{currentTemplate.description}</p>

                    <div className="mt-4 rounded-[10px] border border-on-surface/8 bg-surface px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ui-muted">预计目录结构</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {previewDirectories.map((directory) => (
                          <span key={`${strategy.template_id}-${strategy.naming_style}-${directory}`} className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-3 py-1 text-[12px] font-semibold text-on-surface">
                            {directory}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="rounded-[10px] border border-on-surface/8 bg-surface p-4">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ui-muted">目录命名风格</div>
                      <div className="grid gap-2">
                        {NAMING_STYLE_OPTIONS.map((option) => {
                          const active = strategy.naming_style === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => onChangeNaming(option.id)}
                              disabled={loading}
                              className={cn(
                                "rounded-[8px] border px-3 py-3 text-left transition-all disabled:opacity-50",
                                active ? "border-primary/25 bg-primary/10 shadow-sm" : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className={cn("text-[13px] font-bold", active ? "text-primary" : "text-on-surface")}>{option.label}</p>
                                {active ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : null}
                              </div>
                              <p className="mt-1 text-[11px] leading-[1.6] text-ui-muted">{option.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-[10px] border border-on-surface/8 bg-surface p-4">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ui-muted">整理方式</div>
                      <div className="grid gap-2">
                        {CAUTION_LEVEL_OPTIONS.map((option) => {
                          const active = strategy.caution_level === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => onChangeCaution(option.id)}
                              disabled={loading}
                              className={cn(
                                "rounded-[8px] border px-3 py-3 text-left transition-all disabled:opacity-50",
                                active ? "border-primary/25 bg-primary/10 shadow-sm" : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className={cn("text-[13px] font-bold", active ? "text-primary" : "text-on-surface")}>{option.label}</p>
                                {active ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : null}
                              </div>
                              <p className="mt-1 text-[11px] leading-[1.6] text-ui-muted">{option.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[10px] border border-on-surface/8 bg-surface p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ui-muted">补充说明</div>
                      <span className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-2 py-0.5 text-[10px] font-semibold text-ui-muted">可选</span>
                    </div>
                    <textarea
                      value={strategy.note}
                      disabled={loading}
                      onChange={(event) => onChangeNote(event.target.value.slice(0, 200))}
                      placeholder="例如：项目文件尽量放在一起；拿不准的先放 Review。"
                      className="min-h-[120px] w-full resize-none rounded-[10px] border border-on-surface/8 bg-surface-container-low px-4 py-3.5 text-[13.5px] leading-relaxed text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary/30"
                    />
                    <div className="mt-3 flex items-start gap-3 rounded-[8px] border border-primary/10 bg-primary/4 p-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-primary/10 text-primary shadow-sm border border-primary/10">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <p className="text-[11.5px] leading-snug text-primary/85">
                        只补充会影响结果的偏好，例如“拿不准的先放 Review”“课程资料按学期整理”。
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <div className="shrink-0 border-t border-on-surface/8 bg-surface-container-low px-5 py-4 lg:px-6">
              <div className="ui-panel-muted flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[12px] font-semibold text-primary">{currentTemplate.label}</span>
                  <span className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-3 py-1 text-[12px] font-medium text-on-surface-variant">{namingLabel}</span>
                  <span className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-3 py-1 text-[12px] font-medium text-on-surface-variant">{cautionLabel}</span>
                </div>

                <div className="flex items-center gap-3">
                  <Button variant="secondary" onClick={onClose} className="px-6 py-3">取消</Button>
                  <Button variant="primary" onClick={onConfirm} disabled={loading} className="px-7 py-3">确认并开始</Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
