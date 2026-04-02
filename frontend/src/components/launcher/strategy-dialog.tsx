import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Layers3, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CAUTION_LEVEL_OPTIONS,
  NAMING_STYLE_OPTIONS,
  STRATEGY_TEMPLATES,
  getTemplateMeta,
} from "@/lib/strategy-templates";
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
  const [step, setStep] = useState<1 | 2>(1);
  const currentTemplate = useMemo(() => getTemplateMeta(strategy.template_id), [strategy.template_id]);
  const previewDirectories = currentTemplate.previewDirectories[strategy.naming_style] || [];
  const namingLabel = NAMING_STYLE_OPTIONS.find((item) => item.id === strategy.naming_style)?.label || "中文目录";
  const cautionLabel = CAUTION_LEVEL_OPTIONS.find((item) => item.id === strategy.caution_level)?.label || "平衡";
  const directoryPreview = previewDirectories.map((directory, index) => {
    const suffix =
      strategy.template_id === "project_workspace"
        ? ["需求", "文档", "交付", "素材", "Review"][index] || "资料"
        : strategy.template_id === "study_materials"
          ? ["课程", "讲义", "练习", "参考", "Review"][index] || "资料"
          : strategy.template_id === "office_admin"
            ? ["报销", "合同", "周报", "表单", "Review"][index] || "资料"
            : strategy.template_id === "conservative"
              ? ["文档", "媒体", "安装包", "归档", "Review"][index] || "资料"
              : ["项目", "票据", "课程", "安装包", "Review"][index] || "资料";
    return `${directory}/${suffix}`;
  });
  const templateTag = currentTemplate.defaultCautionLevel === "conservative" ? "改动更克制" : "适合常规整理";

  // When opening, reset to step 1
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/78 px-4 py-6 backdrop-blur-[6px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 20 }}
            className="ui-dialog flex h-[min(84vh,820px)] w-full max-w-[1120px] flex-col overflow-hidden bg-surface-container-lowest"
          >
            <div className="flex shrink-0 items-start justify-between gap-6 border-b border-on-surface/8 bg-surface px-5 py-4 lg:px-6">
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-[8px] border border-primary/12 bg-primary/8 px-2.5 py-1 text-[12px] font-semibold text-primary">
                    <Layers3 className="h-3.5 w-3.5" />
                    启动配置
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn("h-1.5 w-7 rounded-full transition-all duration-300", step === 1 ? "bg-primary" : "bg-primary/12")} />
                    <div className={cn("h-1.5 w-7 rounded-full transition-all duration-300", step === 2 ? "bg-primary" : "bg-primary/12")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-[1.12rem] font-black font-headline tracking-tight text-on-surface leading-tight lg:text-[1.28rem]">
                    {step === 1 ? "选择本轮整理模板" : "补充这次的整理偏好"}
                  </h2>
                  <p className="max-w-2xl text-[13px] leading-6 text-ui-muted">
                    {step === 1 ? "先决定目录结构和整体风险取向，再进入扫描。" : "只保留会影响结果的关键偏好，不展开无关说明。"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="ui-panel-muted hidden px-4 py-3 lg:block">
                  <div className="text-ui-meta text-ui-muted">目标目录</div>
                  <p className="mt-1 max-w-[260px] truncate font-mono text-[12px] font-medium text-on-surface" title={targetDir}>{targetDir}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                  className="h-10 w-10 rounded-[10px] p-0"
                  title="关闭"
                >
                  <X className="h-4.5 w-4.5" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-5 py-5 lg:px-6">
              <AnimatePresence mode="wait">
                {step === 1 ? (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex h-full flex-col overflow-hidden"
                  >
                    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
                      <div className="flex flex-col overflow-hidden rounded-[10px] border border-on-surface/8 bg-surface">
                        <div className="shrink-0 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ui-muted">整理模板群组</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 pt-0 space-y-1.5 scrollbar-thin">
                          {STRATEGY_TEMPLATES.map((template) => {
                            const active = strategy.template_id === template.id;
                            const defaultTag = template.defaultCautionLevel === "conservative" ? "保守" : "平衡";
                            return (
                              <button
                                key={template.id}
                                type="button"
                                disabled={loading}
                                onClick={() => onTemplateSelect(template.id)}
                                className={cn(
                                  "group relative flex w-full flex-col rounded-[8px] border px-3.5 py-3.5 text-left transition-all duration-200 disabled:opacity-50",
                                  active
                                    ? "border-primary/22 bg-primary/6 shadow-[0_8px_20px_rgba(0,0,0,0.05)]"
                                    : "border-transparent bg-surface-container-lowest hover:border-primary/16 hover:bg-white",
                                )}
                              >
                                <div className="mb-1.5 flex items-center justify-between gap-3">
                                  <p className={cn("text-[13px] font-bold tracking-tight", active ? "text-primary" : "text-on-surface")}>{template.label}</p>
                                  {active && (
                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                                      <CheckCircle2 className="h-3 w-3" />
                                    </div>
                                  )}
                                </div>
                                <p className="line-clamp-2 text-[11.5px] leading-[1.6] text-ui-muted">{template.applicableScenarios}</p>
                                <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                                  <span className="rounded-full border border-on-surface/8 bg-surface-container-low px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                                    {template.defaultNamingStyle === "en" ? "英文目录" : template.defaultNamingStyle === "minimal" ? "极简" : "中文目录"}
                                  </span>
                                  <span className="rounded-full border border-on-surface/8 bg-surface-container-low px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                                    {defaultTag}
                                  </span>
                                </div>
                                {active && (
                                  <motion.div
                                    layoutId="active-indicator"
                                    className="absolute bottom-0 left-3 right-3 h-[2.5px] rounded-full bg-primary"
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-col gap-4 overflow-hidden">
                        <div className="shrink-0 flex flex-col rounded-[10px] border border-on-surface/8 bg-surface-container-lowest p-5">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[12px] font-semibold text-primary">{currentTemplate.label}</span>
                            <span className="rounded-full border border-on-surface/8 bg-surface-container-low px-3 py-1 text-[12px] font-medium text-on-surface-variant">{templateTag}</span>
                          </div>
                          <p className="mt-3 text-[13.5px] leading-7 text-ui-muted">{currentTemplate.description}</p>

                          <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[10px] border border-on-surface/6 bg-surface-container-low px-4 py-3">
                              <div className="text-[10.5px] font-medium uppercase tracking-widest text-ui-muted">适用场景</div>
                              <p className="mt-1.5 text-[13px] font-semibold leading-6 text-on-surface">{currentTemplate.applicableScenarios}</p>
                            </div>
                            <div className="rounded-[10px] border border-on-surface/6 bg-surface-container-low px-4 py-3">
                              <div className="text-[10.5px] font-medium uppercase tracking-widest text-ui-muted">目录风格/整理方式</div>
                              <p className="mt-1.5 text-[13px] font-semibold text-on-surface">{namingLabel} · {cautionLabel}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-[10px] border border-on-surface/8 bg-surface">
                          <div className="shrink-0 px-4 py-3 border-b border-on-surface/6">
                            <div className="text-[11px] font-medium uppercase tracking-widest text-ui-muted">预计目录结构预览</div>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
                            {directoryPreview.map((directory, index) => (
                              <motion.div
                                initial={{ opacity: 0, x: 12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.06 }}
                                key={`${strategy.template_id}-${strategy.naming_style}-${directory}`}
                                className="flex items-center gap-2.5 rounded-[8px] border border-on-surface/6 bg-surface-container-lowest px-3 py-2.5 transition-colors hover:border-primary/16"
                              >
                                <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                                <span className="text-[12.5px] font-semibold text-on-surface">{directory}</span>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="flex h-full flex-col gap-5"
                  >
                    <div className="ui-panel-muted border-primary/12 bg-primary/5 px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-primary/90">
                        <span className="rounded-full border border-primary/12 bg-white/70 px-3 py-1">{currentTemplate.label}</span>
                        <span className="rounded-full border border-primary/12 bg-white/70 px-3 py-1">{namingLabel}</span>
                        <span className="rounded-full border border-primary/12 bg-white/70 px-3 py-1">{cautionLabel}</span>
                        <p className="ml-2 text-[12.5px] leading-6 text-primary/80">
                          补充本轮偏好后，即可进入“扫描 → 预检 → 执行确认”流程。
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 min-h-0 flex-1">
                      <div className="flex flex-col gap-5">
                        <div className="rounded-[8px] border border-on-surface/8 bg-surface-container-lowest p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-[11px] font-medium uppercase tracking-widest text-ui-muted">目录命名风格</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2.5">
                            {NAMING_STYLE_OPTIONS.map((option) => {
                              const active = strategy.naming_style === option.id;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  disabled={loading}
                                  onClick={() => onChangeNaming(option.id)}
                                  className={cn(
                                    "flex flex-col rounded-[10px] border px-3 py-3 text-left transition-all duration-200 disabled:opacity-50",
                                    active ? "border-primary/25 bg-primary/6 shadow-[0_2px_10px_rgba(0,0,0,0.04)]" : "border-on-surface/8 bg-surface-container-low hover:border-primary/16",
                                  )}
                                >
                                  <div className="mb-1.5 flex items-center justify-between w-full">
                                    <p className={cn("text-[13px] font-bold tracking-tight", active ? "text-primary" : "text-on-surface")}>{option.label}</p>
                                    {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                                  </div>
                                  <p className="text-[11px] leading-[1.5] text-ui-muted">{option.description}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="rounded-[8px] border border-on-surface/8 bg-surface-container-lowest p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-[11px] font-medium uppercase tracking-widest text-ui-muted">整理方式</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {CAUTION_LEVEL_OPTIONS.map((option) => {
                              const active = strategy.caution_level === option.id;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  disabled={loading}
                                  onClick={() => onChangeCaution(option.id)}
                                  className={cn(
                                    "flex flex-col rounded-[10px] border px-3.5 py-3 text-left transition-all duration-200 disabled:opacity-50",
                                    active ? "border-primary/25 bg-primary/6 shadow-[0_2px_10px_rgba(0,0,0,0.04)]" : "border-on-surface/8 bg-surface-container-low hover:border-primary/16",
                                  )}
                                >
                                  <div className="mb-1.5 flex items-center justify-between w-full">
                                    <p className={cn("text-[13px] font-bold tracking-tight", active ? "text-primary" : "text-on-surface")}>{option.label}</p>
                                    {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                                  </div>
                                  <p className="text-[11px] leading-[1.5] text-ui-muted">{option.description}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col rounded-[8px] border border-on-surface/8 bg-surface-container-lowest p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-[11px] font-medium uppercase tracking-widest text-ui-muted">补充说明</span>
                          <span className="text-[10px] font-semibold text-ui-muted bg-surface-container-low px-2 py-0.5 rounded-full">可选</span>
                        </div>
                        <textarea
                          value={strategy.note}
                          disabled={loading}
                          onChange={(event) => onChangeNote(event.target.value.slice(0, 200))}
                          placeholder="例如：项目文件尽量放在一起；拿不准的先放 Review。"
                          className="flex-1 w-full resize-none rounded-[10px] border border-on-surface/8 bg-surface-container-low px-4 py-3.5 text-[13.5px] leading-relaxed text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/5 disabled:opacity-50"
                        />
                        <div className="mt-3 flex items-start gap-3 rounded-[8px] border border-primary/10 bg-primary/4 p-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-white text-primary shadow-sm border border-primary/10">
                             <Sparkles className="h-4 w-4" />
                          </div>
                          <p className="text-[11.5px] leading-snug text-primary/85 pt-0.5">
                            这些说明会作为本轮偏好参考，适合补充“拿不准的先放 Review”之类的整体规则。
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="shrink-0 border-t border-on-surface/8 bg-surface-container-low px-5 py-4 lg:px-6">
              <div className="ui-panel-muted flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-[12px] font-medium text-ui-muted">当前选择</div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[12px] font-semibold text-primary">{currentTemplate.label}</span>
                    {step === 2 && (
                      <span className="rounded-full border border-on-surface/8 bg-surface-container-lowest px-3 py-1 text-[12px] font-medium text-on-surface-variant">
                        {namingLabel} · {cautionLabel}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {step === 1 ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={onClose}
                        className="px-6 py-3"
                      >
                        取消
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => setStep(2)}
                        className="px-7 py-3"
                      >
                        下一步
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => setStep(1)}
                        className="px-6 py-3"
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        返回上一步
                      </Button>
                      <Button
                        variant="primary"
                        onClick={onConfirm}
                        disabled={loading}
                        loading={loading}
                        className="px-7 py-3"
                      >
                        {loading ? "正在启动扫描" : "确认并开始扫描"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
