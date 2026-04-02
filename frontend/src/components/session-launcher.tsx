"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FolderOpen,
  FolderTree,
  History,
  Layers3,
  Loader2,
  Palette,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { createApiClient } from "@/lib/api";
import { createSessionAndStartScan, startFreshSession } from "@/lib/session-launcher-actions";
import { getApiBaseUrl, getApiToken, isTauriDesktop, pickDirectoryWithTauri } from "@/lib/runtime";
import {
  buildStrategySummary,
  CAUTION_LEVEL_OPTIONS,
  DEFAULT_STRATEGY_SELECTION,
  getLaunchStrategyFromConfig,
  getSuggestedSelection,
  getTemplateMeta,
  NAMING_STYLE_OPTIONS,
  shouldSkipLaunchStrategyPrompt,
  STRATEGY_TEMPLATES,
} from "@/lib/strategy-templates";
import { SessionSnapshot, SessionStrategySelection, SessionStrategySummary } from "@/types/session";
import { StrategySummaryChips } from "./launcher/strategy-summary-chips";
import { LaunchTransitionOverlay } from "./launcher/launch-transition-overlay";
import { StrategyDialog } from "./launcher/strategy-dialog";
import { ResumePromptDialog } from "./launcher/resume-prompt-dialog";


const DEFAULT_STRATEGY_SUMMARY: SessionStrategySummary = {
  ...DEFAULT_STRATEGY_SELECTION,
  template_label: "通用下载",
  template_description: "适合下载目录、桌面暂存区等混合文件场景。",
  naming_style_label: "中文目录",
  caution_level_label: "平衡",
  preview_directories: ["项目资料", "财务票据", "学习资料", "安装程序", "待确认"],
};

export function SessionLauncher() {
  const router = useRouter();
  const apiBaseUrl = getApiBaseUrl();
  const [targetDir, setTargetDir] = useState("");
  const [strategyDialogOpen, setStrategyDialogOpen] = useState(false);
  const [savedLaunchStrategy, setSavedLaunchStrategy] = useState<SessionStrategySelection>(DEFAULT_STRATEGY_SELECTION);
  const [draftStrategy, setDraftStrategy] = useState<SessionStrategySelection>(DEFAULT_STRATEGY_SELECTION);
  const [launchSkipPrompt, setLaunchSkipPrompt] = useState(false);
  const [launchPreferencesLoaded, setLaunchPreferencesLoaded] = useState(false);
  const [effectiveLaunchStrategy, setEffectiveLaunchStrategy] = useState<SessionStrategySelection>(DEFAULT_STRATEGY_SELECTION);
  const [loading, setLoading] = useState(false);
  const [launchTransitionOpen, setLaunchTransitionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumePrompt, setResumePrompt] = useState<{ sessionId: string; snapshot: SessionSnapshot } | null>(null);

  const resumeStrategy = resumePrompt?.snapshot.strategy || DEFAULT_STRATEGY_SUMMARY;
  const resumeStage = resumePrompt?.snapshot.stage;
  const isCompletedResume = resumeStage === "completed";
  const currentSummary = buildStrategySummary(savedLaunchStrategy);
  const currentTemplate = getTemplateMeta(savedLaunchStrategy.template_id);
  const namingLabel = currentSummary.naming_style_label;
  const cautionLabel = currentSummary.caution_level_label;

  useEffect(() => {
    let cancelled = false;

    async function loadLaunchPreferences() {
      try {
        const api = createApiClient(apiBaseUrl, getApiToken());
        const data = await api.getSettings();
        if (cancelled) {
          return;
        }
        const strategy = getLaunchStrategyFromConfig(data.global_config);
        setSavedLaunchStrategy(strategy);
        setDraftStrategy(strategy);
        setEffectiveLaunchStrategy(strategy);
        setLaunchSkipPrompt(shouldSkipLaunchStrategyPrompt(data.global_config));
        setLaunchPreferencesLoaded(true);
      } catch {
        if (cancelled) {
          return;
        }
        setSavedLaunchStrategy(DEFAULT_STRATEGY_SELECTION);
        setDraftStrategy(DEFAULT_STRATEGY_SELECTION);
        setEffectiveLaunchStrategy(DEFAULT_STRATEGY_SELECTION);
        setLaunchSkipPrompt(false);
        setLaunchPreferencesLoaded(true);
      }
    }

    void loadLaunchPreferences();

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
    } catch (_err) {
      setError(isTauriDesktop() ? "没有打开目录选择窗口，请再试一次。" : "现在还不能打开目录选择器，请检查本地服务是否正常运行。");
    } finally {
      setLoading(false);
    }
  }

  function openStrategyDialog() {
    if (!targetDir.trim()) {
      setError("请先选择一个需要整理的目录。");
      return;
    }
    setError(null);
    setDraftStrategy(savedLaunchStrategy);
    setStrategyDialogOpen(true);
  }

  function handleTemplateSelect(templateId: SessionStrategySelection["template_id"]) {
    const suggested = getSuggestedSelection(templateId);
    setDraftStrategy((prev) => ({
      ...prev,
      template_id: templateId,
      naming_style: suggested.naming_style,
      caution_level: suggested.caution_level,
    }));
  }

  async function launchWithStrategy(strategy: SessionStrategySelection) {
    if (!targetDir.trim()) return;
    setLoading(true);
    setLaunchTransitionOpen(true);
    setError(null);
    setEffectiveLaunchStrategy(strategy);
    try {
      const api = createApiClient(apiBaseUrl, getApiToken());
      const response = await createSessionAndStartScan(api, targetDir, true, strategy);
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
      setStrategyDialogOpen(false);
      router.push(`/workspace?session_id=${response.session_id}&dir=${encodeURIComponent(targetDir)}`);
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
    if (launchSkipPrompt) {
      await launchWithStrategy(savedLaunchStrategy);
      return;
    }
    openStrategyDialog();
  }

  async function handleStartFresh() {
    if (!resumePrompt) return;
    setLoading(true);
    setLaunchTransitionOpen(true);
    setError(null);
    try {
      const api = createApiClient(apiBaseUrl, getApiToken());
      const response = await startFreshSession(
        api,
        resumePrompt.sessionId,
        targetDir,
        effectiveLaunchStrategy,
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
    if (!resumePrompt) return;
    router.push(`/workspace?session_id=${resumePrompt.sessionId}&dir=${encodeURIComponent(targetDir)}`);
  }

  function handleReadOnlyView() {
    if (!resumePrompt) return;
    router.push(`/workspace?session_id=${resumePrompt.sessionId}&dir=${encodeURIComponent(targetDir)}&readonly=1`);
  }

  return (
    <>
      <LaunchTransitionOverlay open={launchTransitionOpen} targetDir={targetDir} />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1280px] flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        {/* Abstract Background Accents */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute top-[20%] -right-[10%] h-[30%] w-[30%] rounded-full bg-primary/3 blur-[100px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full"
        >
          <section className="relative overflow-hidden rounded-[8px] border border-on-surface/8 bg-surface-container-lowest/40 p-1 shadow-[0_32px_120px_-20px_rgba(0,0,0,0.08)] backdrop-blur-xl">
            <div className="relative rounded-[6px] border border-on-surface/5 bg-surface-container-lowest p-6 sm:p-10 lg:p-12">
               {/* Decorative Grid Backdrop */}
               <div className="absolute inset-0 z-0 opacity-[0.03] [mask-image:radial-gradient(ellipse_at_center,black,transparent)]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
               
               <div className="relative z-10 grid gap-12 lg:grid-cols-[1fr_360px]">
                  <div className="space-y-12">
                    <div className="space-y-6">
                      <div className="inline-flex items-center gap-2.5 rounded-[4px] border border-primary/12 bg-primary/6 px-4 py-2 text-[12px] font-black uppercase tracking-[0.2em] text-primary/70">
                        <Sparkles className="h-4 w-4" />
                        新任务入口
                      </div>
                      <h1 className="max-w-xl font-headline text-[3rem] font-black leading-[1.02] tracking-tighter text-on-surface sm:text-[4rem] lg:text-[4.8rem]">
                        选择目录，<br/>
                        <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">开始整理。</span>
                      </h1>
                      <p className="max-w-[460px] text-[16px] font-medium leading-relaxed text-ui-muted opacity-80 lg:text-[17px]">
                        先选择一个目录。系统会扫描当前结构、生成整理方案，并在执行前让你确认影响范围。
                      </p>
                    </div>

                    <div className="space-y-6">
                      <div className="group relative">
                        <div className="absolute -inset-4 rounded-[12px] bg-primary/3 opacity-0 transition-opacity group-focus-within:opacity-100" />
                        <div className="relative rounded-[8px] border border-on-surface/10 bg-surface px-5 py-6 shadow-[0_8px_30px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)] transition-all focus-within:border-primary/30">
                          <div className="grid gap-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
                            <Button
                              variant="ghost"
                              onClick={handleSelectDir}
                              disabled={loading}
                              className="h-16 w-16 rounded-[4px] bg-on-surface/[0.03] text-primary transition-all hover:bg-primary/8 active:scale-95"
                              title="浏览文件夹"
                            >
                              <FolderOpen className="h-7 w-7" />
                            </Button>
                            <div className="min-w-0">
                               <div className="mb-2.5 flex items-center gap-2">
                                 <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                 <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">整理目标目录</span>
                               </div>
                               <input
                                 value={targetDir}
                                 onChange={(event) => setTargetDir(event.target.value)}
                                 disabled={loading}
                                 className="h-10 w-full min-w-0 bg-transparent text-[1.1rem] font-bold tracking-tight text-on-surface outline-none placeholder:text-on-surface-variant/20 disabled:opacity-70"
                                 placeholder="粘贴路径或点击图标选择整理目标..."
                                 onKeyDown={(e) => {
                                   if (e.key === "Enter") void handlePrimaryLaunch();
                                 }}
                               />
                            </div>
                            <Button
                              variant="primary"
                              size="lg"
                              onClick={() => void handlePrimaryLaunch()}
                              disabled={loading || !targetDir.trim()}
                              loading={loading}
                              className="h-16 w-full rounded-[4px] px-10 text-[16px] font-black tracking-tight shadow-[0_12px_24px_-4px_rgba(var(--primary-rgb),0.2)] lg:min-w-[240px]"
                            >
                              {loading ? "载入中" : "开始分析整理"}
                              {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-6 pt-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-on-surface/5 bg-on-surface/[0.02] text-primary/40 shadow-sm">
                            <FolderTree className="h-5 w-5" />
                          </div>
                          <div className="space-y-0.5">
                             <p className="text-[11px] font-black uppercase tracking-widest text-ui-muted">目录结构</p>
                             <p className="text-[12px] font-bold text-on-surface/70">扫描后生成整理方案</p>
                          </div>
                        </div>
                        <div className="h-8 w-px bg-on-surface/5 hidden sm:block" />
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-on-surface/5 bg-on-surface/[0.02] text-primary/40 shadow-sm">
                            <Palette className="h-5 w-5" />
                          </div>
                          <div className="space-y-0.5">
                             <p className="text-[11px] font-black uppercase tracking-widest text-ui-muted">命名与图标</p>
                             <p className="text-[12px] font-bold text-on-surface/70">统一目录命名与显示图标</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-5 lg:pt-12">
                     <div className="rounded-[8px] border border-primary/10 bg-primary/[0.02] p-5 lg:p-6 transition-all hover:bg-primary/[0.03]">
                        <div className="mb-5 flex items-center justify-between">
                           <div className="flex items-center gap-2 text-primary">
                             <ShieldCheck className="h-4.5 w-4.5" />
                             <span className="text-[11px] font-black uppercase tracking-[0.25em]">当前默认预设</span>
                           </div>
                        </div>

                        <div className="space-y-4">
                           {launchPreferencesLoaded ? (
                             <>
                               <div className="space-y-1">
                                 <p className="text-[14px] font-black text-on-surface">{currentTemplate.label}</p>
                                 <p className="text-[11.5px] leading-relaxed text-ui-muted/80">{currentTemplate.applicableScenarios}</p>
                               </div>
                               <div className="mt-3 flex flex-wrap gap-2">
                                 <span className="rounded-[4px] border border-on-surface/8 bg-surface-container-low px-2 px-2.5 py-1 text-[11px] font-bold text-on-surface-variant/70">{namingLabel}</span>
                                 <span className="rounded-[4px] border border-on-surface/8 bg-surface-container-low px-2 px-2.5 py-1 text-[11px] font-bold text-on-surface-variant/70">{cautionLabel}</span>
                               </div>
                             </>
                           ) : (
                             <div className="flex items-center gap-3 py-4 text-ui-muted">
                               <Loader2 className="h-4 w-4 animate-spin" />
                               <span className="text-[12px] font-bold">同步配置中...</span>
                             </div>
                           )}
                        </div>

                        <div className="mt-8 space-y-2.5 border-t border-on-surface/5 pt-6">
                           <div className="flex items-center justify-between text-[11px] font-bold text-ui-muted">
                              <span className="uppercase tracking-widest">扫描模式</span>
                              <span className="text-on-surface/60">按当前配置扫描</span>
                           </div>
                           <div className="flex items-center justify-between text-[11px] font-bold text-ui-muted">
                              <span className="uppercase tracking-widest">确认逻辑</span>
                              <span className="text-on-surface/60">预检后手动执行</span>
                           </div>
                           <div className="flex items-center justify-between text-[11px] font-bold text-ui-muted">
                              <span className="uppercase tracking-widest">回退保障</span>
                              <span className="text-success-dim">已开启 (Journal)</span>
                           </div>
                        </div>
                     </div>

                     <div className="rounded-[8px] border border-on-surface/8 bg-on-surface/[0.02] p-5 transition-all hover:bg-on-surface/[0.03]">
                        <p className="text-[12px] font-bold leading-relaxed text-ui-muted">
                          {launchSkipPrompt 
                            ? "已启用直接开始。点击主按钮后，会按这组默认预设立即创建任务。"
                            : "这组预设会作为默认起点。开始前仍会打开启动配置，方便再调整一次。"}
                        </p>
                     </div>
                  </div>
               </div>
            </div>
          </section>
        </motion.div>
      </div>

      <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="mt-4"
            >
              <div className="rounded-[10px] border border-error/14 bg-error-container/14 px-5 py-4 text-[14px] font-semibold text-error">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <p className="leading-relaxed">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      <StrategyDialog
        open={strategyDialogOpen}
        loading={loading}
        targetDir={targetDir}
        strategy={draftStrategy}
        onClose={() => setStrategyDialogOpen(false)}
        onConfirm={() => void launchWithStrategy(draftStrategy)}
        onTemplateSelect={handleTemplateSelect}
        onChangeNaming={(id) => setDraftStrategy((prev) => ({ ...prev, naming_style: id }))}
        onChangeCaution={(id) => setDraftStrategy((prev) => ({ ...prev, caution_level: id }))}
        onChangeNote={(value) => setDraftStrategy((prev) => ({ ...prev, note: value }))}
      />

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
