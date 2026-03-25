"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Edit3,
  Eye,
  EyeOff,
  Globe,
  Info,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Terminal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { createApiClient } from "@/lib/api";
import { getApiBaseUrl, getApiToken } from "@/lib/runtime";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}

interface FieldGroupProps {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

interface InputShellProps {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  actions,
  children,
  disabled = false,
}: SettingsSectionProps) {
  return (
    <section
      className={cn(
        "rounded-[12px] border border-on-surface/8 bg-surface-container-lowest p-4 shadow-[0_6px_18px_rgba(36,48,42,0.05)] lg:p-5",
        disabled && "opacity-55",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-on-surface/6 pb-3.5">
        <div className="flex min-w-0 items-start gap-3.5">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border",
              disabled
                ? "border-on-surface/6 bg-surface-container-low text-on-surface-variant/30"
                : "border-primary/12 bg-primary/10 text-primary",
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-black tracking-tight text-on-surface">{title}</h2>
            <p className="text-[12px] leading-5 text-on-surface-variant/75">{description}</p>
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function FieldGroup({ label, hint, className, children }: FieldGroupProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="flex items-center gap-2 px-1 text-[12px] font-medium text-on-surface-variant/65">
        {label}
      </label>
      {children}
      {hint ? <p className="px-1 text-[12px] leading-5 text-on-surface-variant/55">{hint}</p> : null}
    </div>
  );
}

function InputShell({ icon: Icon, children, className }: InputShellProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-[10px] border border-on-surface/8 bg-white px-3 py-2 transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/5",
        className,
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-surface-container-low text-on-surface-variant/45 transition-colors group-focus-within:text-primary">
        <Icon className="h-4 w-4" />
      </div>
      {children}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onClick,
  disabled = false,
}: {
  checked: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full p-1 transition-all disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-surface-container-highest",
      )}
    >
      <span
        className={cn(
          "inline-block h-4.5 w-4.5 rounded-full bg-white transition-transform duration-300",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [config, setConfig] = useState<any>(null);
  const [originalConfig, setOriginalConfig] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testVision, setTestVision] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    type: "text" | "vision";
    status: "success" | "error";
    message: string;
  } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showVisionKey, setShowVisionKey] = useState(false);

  const [dialog, setDialog] = useState<{
    type: "prompt" | "confirm";
    title: string;
    message: string;
    value?: string;
    onConfirm: (val?: string) => void;
  } | null>(null);

  const api = useMemo(() => createApiClient(getApiBaseUrl(), getApiToken()), []);

  const isDirty = useMemo(() => {
    if (!config || !originalConfig) return false;
    return JSON.stringify(config) !== JSON.stringify(originalConfig);
  }, [config, originalConfig]);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeId) ?? null,
    [profiles, activeId],
  );

  const fetchAll = async () => {
    setLoading(true);
    try {
      const data = await api.getConfig();
      setProfiles(data.profiles);
      setActiveId(data.active_id);
      setConfig(data.config);
      setOriginalConfig(data.config);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const handleChange = (key: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [key]: value }));
    setSuccess(null);
    setTestResult(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateConfig(config);
      setSuccess("设置已保存");
      setOriginalConfig(config);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const performSwitch = async (id: string) => {
    setDialog(null);
    setLoading(true);
    try {
      await api.switchProfile(id);
      await fetchAll();
      setSuccess("已切换配置方案");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSwitchProfile = async (id: string) => {
    if (id === activeId) return;
    if (isDirty) {
      setDialog({
        type: "confirm",
        title: "放弃未保存修改？",
        message: "当前配置还有未保存内容，切换方案后这些修改会丢失。",
        onConfirm: () => {
          void performSwitch(id);
        },
      });
      return;
    }
    await performSwitch(id);
  };

  const handleAddProfile = async () => {
    setDialog({
      type: "prompt",
      title: "新建配置方案",
      message: "输入一个便于识别的方案名称。",
      value: "我的新方案",
      onConfirm: async (name) => {
        if (!name) return;
        setDialog(null);
        setLoading(true);
        try {
          await api.addProfile(name, true);
          await fetchAll();
        } catch (err: any) {
          setError(err.message);
          setLoading(false);
        }
      },
    });
  };

  const handleDeleteProfile = async (id: string, name: string) => {
    if (id === "default") {
      setDialog({
        type: "confirm",
        title: "无法删除默认方案",
        message: "默认方案会一直保留。",
        onConfirm: () => setDialog(null),
      });
      return;
    }
    setDialog({
      type: "confirm",
      title: "确认删除方案？",
      message: `确定删除“${name}”吗？删除后不能恢复。`,
      onConfirm: async () => {
        setDialog(null);
        setLoading(true);
        try {
          await api.deleteProfile(id);
          await fetchAll();
        } catch (err: any) {
          setError(err.message);
          setLoading(false);
        }
      },
    });
  };

  const handleTest = async (type: "text" | "vision") => {
    if (type === "text") {
      setTesting(true);
    } else {
      setTestVision(true);
    }
    setTestResult(null);
    try {
      const data = await api.testLlm({ ...config, test_type: type });
      setTestResult({
        type,
        status: data.status === "ok" ? "success" : "error",
        message: data.message,
      });
    } catch (err: any) {
      setTestResult({
        type,
        status: "error",
        message: err?.message || "没有连上本地服务",
      });
    } finally {
      setTesting(false);
      setTestVision(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-5">
          <RefreshCw className="h-9 w-9 animate-spin text-primary/40" />
          <p className="text-[12px] font-medium text-on-surface-variant/55">
            正在读取设置
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-surface">
      <aside className="w-[236px] shrink-0 overflow-y-auto border-r border-on-surface/6 bg-surface-container-low px-4 py-4">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-[13px] font-semibold tracking-tight text-on-surface">
                配置方案
              </h2>
              <p className="text-[12px] leading-5 text-on-surface-variant/70">
                每个方案保存一套模型和偏好设置。
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddProfile}
              className="h-9 w-9 rounded-[10px] p-0"
              title="新建方案"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <nav className="space-y-2">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={cn(
                  "group flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border px-3.5 py-3 transition-all",
                  activeId === profile.id
                    ? "border-on-surface/8 bg-white text-on-surface"
                    : "border-transparent bg-transparent text-on-surface-variant/70 hover:border-primary/10 hover:bg-white/70 hover:text-on-surface",
                )}
                onClick={() => void handleSwitchProfile(profile.id)}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      activeId === profile.id ? "bg-primary" : "bg-on-surface/12",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold tracking-tight">{profile.name}</p>
                    <p className="text-[11px] text-on-surface-variant/40">
                      {profile.id}
                    </p>
                  </div>
                </div>

                {profile.id !== "default" ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteProfile(profile.id, profile.name);
                    }}
                    className="rounded-[8px] p-1.5 text-on-surface-variant/25 opacity-0 transition-all hover:bg-error/5 hover:text-error hover:opacity-100 group-hover:opacity-70"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </nav>

          <div className="rounded-[12px] border border-primary/10 bg-primary/6 p-3.5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-white text-primary">
                <Info className="h-4 w-4" />
              </div>
              <div className="space-y-1.5">
                <p className="text-[12px] font-semibold text-primary/85">
                  桌面版建议
                </p>
                <p className="text-[12px] leading-5 text-on-surface-variant/70">
                  为不同目录准备不同方案，后续切换时会更快，也更不容易改错配置。
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-surface">
        <div className="mx-auto flex w-full max-w-[940px] flex-col gap-4 px-4 py-4 lg:px-5 lg:py-5">
          <div className="sticky top-0 z-20 rounded-[12px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3.5 shadow-[0_8px_22px_rgba(36,48,42,0.06)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-[1.35rem] font-black tracking-tight text-on-surface">设置与偏好</h1>
                  <span className="rounded-[8px] border border-on-surface/8 bg-surface-container-low px-2.5 py-1 text-[12px] font-medium text-on-surface-variant/65">
                    {activeProfile?.name || "当前方案"}
                  </span>
                  {isDirty ? (
                    <span className="rounded-[8px] border border-warning/10 bg-warning-container/20 px-2.5 py-1 text-[12px] font-medium text-warning">
                      未保存
                    </span>
                  ) : null}
                </div>
                <p className="max-w-[620px] text-[13px] leading-5 text-on-surface-variant/70">
                  调整文本模型、图片理解和调试选项。设置页会和工作区保持同一套更紧凑的桌面风格。
                </p>
              </div>

              <div className="flex items-center gap-3">
                <AnimatePresence>
                  {success ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="flex items-center gap-2 rounded-[8px] border border-emerald-500/10 bg-emerald-500/5 px-3 py-2 text-[12px] font-medium text-emerald-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {success}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <Button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  loading={saving}
                  variant={isDirty ? "primary" : "secondary"}
                  className="px-6 py-3 text-sm"
                >
                  {saving ? "保存中" : "保存更改"}
                </Button>
              </div>
            </div>
          </div>

          {error ? <ErrorAlert title="设置操作失败" message={error} /> : null}

          <SettingsSection
            icon={Cpu}
            title="文本模型设置"
            description="决定系统如何理解目录内容、生成整理建议，以及整理对话的稳定性。"
            actions={
              <Button
                onClick={() => void handleTest("text")}
                disabled={testing}
                loading={testing}
                variant="secondary"
                size="sm"
                className="px-5 py-2.5"
              >
                测试连接
              </Button>
            }
          >
            {testResult?.type === "text" ? (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-[10px] border px-4 py-3 text-[12px] font-medium",
                  testResult.status === "success"
                    ? "border-emerald-500/10 bg-emerald-500/5 text-emerald-700"
                    : "border-error/10 bg-error/5 text-error",
                )}
              >
                {testResult.status === "success" ? (
                  <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-4.5 w-4.5 shrink-0" />
                )}
                <p>{testResult.message}</p>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <FieldGroup
                label="方案名称"
                hint="这个名字会显示在侧边栏和会话页面中。"
                className="xl:col-span-2"
              >
                <InputShell icon={Edit3}>
                  <input
                    value={config.name}
                    onChange={(event) => handleChange("name", event.target.value)}
                    className="w-full bg-transparent py-2 text-[14px] font-semibold text-on-surface outline-none"
                    placeholder="例如：下载目录默认方案"
                  />
                </InputShell>
              </FieldGroup>

              <FieldGroup label="接口地址 / Base URL">
                <InputShell icon={Globe}>
                  <input
                    value={config.OPENAI_BASE_URL}
                    onChange={(event) => handleChange("OPENAI_BASE_URL", event.target.value)}
                    className="w-full bg-transparent py-2 text-sm font-mono font-medium text-on-surface outline-none"
                    placeholder="https://api.openai.com/v1"
                  />
                </InputShell>
              </FieldGroup>

              <FieldGroup
                label="模型 ID / Model"
                hint="建议选择更擅长长文本理解和指令跟随的模型。"
              >
                <InputShell icon={Terminal}>
                  <input
                    value={config.OPENAI_MODEL}
                    onChange={(event) => handleChange("OPENAI_MODEL", event.target.value)}
                    className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none"
                    placeholder="gpt-4o"
                  />
                </InputShell>
              </FieldGroup>

              <FieldGroup
                label="API 密钥 / Key"
                hint="只在当前本地方案中保存，切换其他方案时不会自动同步。"
                className="xl:col-span-2"
              >
                <InputShell icon={ShieldCheck}>
                  <input
                    type={showKey ? "text" : "password"}
                    value={config.OPENAI_API_KEY}
                    onChange={(event) => handleChange("OPENAI_API_KEY", event.target.value)}
                    className="w-full bg-transparent py-2 pr-2 text-sm font-mono font-medium text-on-surface outline-none"
                    placeholder="sk-..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((current) => !current)}
                    className="rounded-[8px] p-2 text-on-surface-variant/35 transition-colors hover:bg-surface-container-low hover:text-on-surface"
                  >
                    {showKey ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </InputShell>
              </FieldGroup>
            </div>
          </SettingsSection>

          <SettingsSection
            icon={Globe}
            title="图片理解设置"
            description="开启后，系统可以读取图片和扫描件里的内容；未开启时会完全跳过图片分析。"
            actions={
              <div className="flex items-center gap-3">
                {config.IMAGE_ANALYSIS_ENABLED ? (
                  <Button
                    onClick={() => void handleTest("vision")}
                    disabled={testVision}
                    loading={testVision}
                    variant="secondary"
                    size="sm"
                    className="px-5 py-2.5"
                  >
                    测试图片能力
                  </Button>
                ) : null}
                <div className="flex items-center gap-3 rounded-[10px] border border-on-surface/8 bg-surface-container-low px-3 py-2">
                  <span className="text-[12px] font-medium text-on-surface-variant/55">
                    开关
                  </span>
                  <ToggleSwitch
                    checked={Boolean(config.IMAGE_ANALYSIS_ENABLED)}
                    onClick={() => handleChange("IMAGE_ANALYSIS_ENABLED", !config.IMAGE_ANALYSIS_ENABLED)}
                  />
                </div>
              </div>
            }
            disabled={!config.IMAGE_ANALYSIS_ENABLED}
          >
            {testResult?.type === "vision" ? (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-[10px] border px-4 py-3 text-[12px] font-medium",
                  testResult.status === "success"
                    ? "border-emerald-500/10 bg-emerald-500/5 text-emerald-700"
                    : "border-error/10 bg-error/5 text-error",
                )}
              >
                {testResult.status === "success" ? (
                  <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-4.5 w-4.5 shrink-0" />
                )}
                <p>{testResult.message}</p>
              </div>
            ) : null}

            <div
              className={cn(
                "grid gap-4 xl:grid-cols-2",
                !config.IMAGE_ANALYSIS_ENABLED && "pointer-events-none",
              )}
            >
              <FieldGroup
                label="图片接口地址"
                hint="留空时沿用上面的文本接口地址。"
              >
                <InputShell icon={Globe}>
                  <input
                    value={config.IMAGE_ANALYSIS_BASE_URL}
                    onChange={(event) => handleChange("IMAGE_ANALYSIS_BASE_URL", event.target.value)}
                    className="w-full bg-transparent py-2 text-sm font-mono font-medium text-on-surface outline-none"
                    placeholder="留空时会沿用文本接口地址"
                  />
                </InputShell>
              </FieldGroup>

              <FieldGroup
                label="图片模型 ID"
                hint="如需独立图片模型，可在这里覆盖文本模型配置。"
              >
                <InputShell icon={Terminal}>
                  <input
                    value={config.IMAGE_ANALYSIS_MODEL}
                    onChange={(event) => handleChange("IMAGE_ANALYSIS_MODEL", event.target.value)}
                    className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none"
                    placeholder="例如：gpt-4o"
                  />
                </InputShell>
              </FieldGroup>

              <FieldGroup
                label="图片接口密钥"
                hint="留空时沿用上面的文本 API 密钥。"
                className="xl:col-span-2"
              >
                <InputShell icon={ShieldCheck}>
                  <input
                    type={showVisionKey ? "text" : "password"}
                    value={config.IMAGE_ANALYSIS_API_KEY}
                    onChange={(event) => handleChange("IMAGE_ANALYSIS_API_KEY", event.target.value)}
                    className="w-full bg-transparent py-2 pr-2 text-sm font-mono font-medium text-on-surface outline-none"
                    placeholder="留空时会沿用文本 API 密钥"
                  />
                  <button
                    type="button"
                    onClick={() => setShowVisionKey((current) => !current)}
                    className="rounded-[8px] p-2 text-on-surface-variant/35 transition-colors hover:bg-surface-container-low hover:text-on-surface"
                  >
                    {showVisionKey ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </InputShell>
              </FieldGroup>
            </div>
          </SettingsSection>

          <SettingsSection
            icon={ShieldCheck}
            title="其他设置"
            description="保留少量调试选项，避免把桌面版设置页做成过长的开发面板。"
          >
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-[12px] border border-on-surface/8 bg-surface-container-low px-4 py-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <h3 className="text-[13px] font-semibold tracking-tight text-on-surface">详细日志</h3>
                    <p className="text-[12px] leading-5 text-on-surface-variant/65">
                      在 `logs/` 目录保存更完整的排查信息。
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(config.DEBUG_MODE)}
                    onClick={() => handleChange("DEBUG_MODE", !config.DEBUG_MODE)}
                  />
                </div>
              </div>

              <div className="rounded-[12px] border border-dashed border-on-surface/10 bg-white px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-surface-container-low text-on-surface-variant/30">
                    <SettingsIcon className="h-4.5 w-4.5" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-[13px] font-semibold tracking-tight text-on-surface">补充说明</h3>
                    <p className="text-[12px] leading-5 text-on-surface-variant/65">
                      如果还需要更底层的调整，可以再查看项目里的 `config.yaml`。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </SettingsSection>

          <div className="pb-3 text-center">
            <p className="text-[12px] font-medium text-on-surface-variant/35">
              Local Settings
            </p>
            <p className="mt-1 text-[11px] leading-5 text-on-surface-variant/35">
              保存后，新配置会在后续整理会话中直接生效。
            </p>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {dialog ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm"
              onClick={() => setDialog(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="relative w-full max-w-[440px] rounded-[14px] border border-on-surface/8 bg-white p-6 shadow-[0_20px_48px_rgba(36,48,42,0.14)]"
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <h3 className="text-[1.05rem] font-black tracking-tight text-on-surface">{dialog.title}</h3>
                  <p className="text-[14px] leading-6 text-on-surface-variant/75">{dialog.message}</p>
                </div>

                {dialog.type === "prompt" ? (
                  <InputShell icon={Edit3}>
                    <input
                      autoFocus
                      value={dialog.value}
                      onChange={(event) => setDialog({ ...dialog, value: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          dialog.onConfirm(dialog.value);
                        }
                      }}
                      className="w-full bg-transparent py-2 text-[14px] font-semibold text-on-surface outline-none"
                    />
                  </InputShell>
                ) : null}

                <div className="flex items-center gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setDialog(null)} className="flex-1 py-3">
                    取消
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => dialog.onConfirm(dialog.value)}
                    className="flex-1 py-3"
                  >
                    {dialog.type === "confirm" ? "确定" : "创建"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
