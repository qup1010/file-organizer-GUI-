"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Cpu,
  Eye,
  EyeOff,
  FolderPlus,
  FolderOpen,
  Globe,
  ImageIcon,
  Key,
  Layers3,
  Loader2,
  Lock,
  LogOut,
  RefreshCcw,
  RefreshCw,
  Scissors,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/ui/error-alert";
import {
  FieldGroup,
  InputShell,
  PresetSelector,
  SettingsSection,
  StrategyOptionButton,
  ToggleSwitch,
} from "@/components/settings/settings-primitives";
import { buildFamilySavePayload, isEditablePreset } from "@/app/settings/preset-flow";
import { createApiClient } from "@/lib/api";
import { getApiBaseUrl, getApiToken, invokeTauriCommand, isTauriDesktop } from "@/lib/runtime";
import { findDropZoneForPosition, listenToTauriDragDrop } from "@/lib/tauri-drag-drop";
import {
  buildStrategySummary,
  CAUTION_LEVEL_OPTIONS,
  DENSITY_OPTIONS,
  getSuggestedSelection,
  getTemplateMeta,
  LANGUAGE_OPTIONS,
  PREFIX_STYLE_OPTIONS,
  STRATEGY_TEMPLATES,
} from "@/lib/strategy-templates";
import { cn } from "@/lib/utils";
import type {
  IconImageSettingsPreset,
  SecretAction,
  SecretState,
  SettingsFamily,
  SettingsSnapshot,
  SettingsTestResult,
  SettingsUpdatePayload,
  TextSettingsPreset,
  VisionSettingsPreset,
} from "@/types/settings";
import type { TargetProfile, TargetProfileDirectory } from "@/types/session";

type SecretDraft = {
  action: SecretAction;
  value: string;
  visible: boolean;
};

type PresetConfigFamily = Exclude<SettingsFamily, "bg_removal">;

type DraftState = {
  global_config: SettingsSnapshot["global_config"];
  text: TextSettingsPreset;
  vision: VisionSettingsPreset;
  icon_image: SettingsSnapshot["families"]["icon_image"]["active_preset"];
  bg_removal: {
    mode: SettingsSnapshot["families"]["bg_removal"]["mode"];
    preset_id: SettingsSnapshot["families"]["bg_removal"]["preset_id"];
    custom: SettingsSnapshot["families"]["bg_removal"]["custom"];
  };
};

type CreatePresetDialogState = {
  family: PresetConfigFamily;
  value: string;
};

type DeletePresetDialogState = {
  family: PresetConfigFamily;
  presetId: string;
  presetName: string;
};

type SwitchPresetDialogState = {
  family: PresetConfigFamily;
  presetId: string;
};

type TargetProfileDraft = {
  name: string;
  directories: TargetProfileDirectory[];
  newPath: string;
  newLabel: string;
};

type LaunchSection = "strategy" | "placement" | "targets";

const APP_CONTEXT_EVENT = "file-organizer-context-change";
const SETTINGS_CONTEXT_KEY = "settings_header_context";
const IMAGE_SIZE_OPTIONS = ["1024x1024", "512x512", "256x256"] as const;
const COMPACT_SETTINGS_BREAKPOINT = 960;

function normalizeImageSize(value: string | null | undefined): (typeof IMAGE_SIZE_OPTIONS)[number] {
  if (value && IMAGE_SIZE_OPTIONS.includes(value as (typeof IMAGE_SIZE_OPTIONS)[number])) {
    return value as (typeof IMAGE_SIZE_OPTIONS)[number];
  }
  return "1024x1024";
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSecretDraft(initialValue: string = ""): SecretDraft {
  return { action: "keep", value: initialValue, visible: false };
}

function clampConcurrencyInput(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return Math.max(1, Math.min(6, fallback || 1));
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return Math.max(1, Math.min(6, fallback || 1));
  }
  return Math.max(1, Math.min(6, Math.trunc(parsed) || 1));
}

function snapshotToDraft(snapshot: SettingsSnapshot): DraftState {
  const iconImagePreset = cloneValue(snapshot.families.icon_image.active_preset);
  return {
    global_config: cloneValue(snapshot.global_config),
    text: cloneValue(snapshot.families.text.active_preset),
    vision: cloneValue(snapshot.families.vision.active_preset),
    icon_image: {
      ...iconImagePreset,
      image_size: normalizeImageSize(iconImagePreset.image_size),
    },
    bg_removal: {
      mode: snapshot.families.bg_removal.mode,
      preset_id: snapshot.families.bg_removal.preset_id,
      custom: cloneValue(snapshot.families.bg_removal.custom),
    },
  };
}

function buildSecretPayload(secret: SecretDraft) {
  if (secret.action === "replace" && secret.value.trim()) {
    return { action: "replace" as const, value: secret.value.trim() };
  }
  if (secret.action === "clear") {
    return { action: "clear" as const };
  }
  return { action: "keep" as const };
}

function describeSecret(secretState: SecretState, secret: SecretDraft) {
  if (secret.action === "replace" && secret.value.trim()) {
    return "新密钥已输入，保存全部配置后生效。";
  }
  if (secret.action === "clear") {
    return "已标记为移除，保存全部配置后生效。";
  }
  return secretState === "stored" ? "密钥已在本地安全存储。" : "当前还没有保存密钥。";
}

function buildFingerprint(
  draft: DraftState | null,
  secrets: Record<SettingsFamily, SecretDraft>,
  transientInputs?: {
    analysisConcurrencyInput: string;
    imageConcurrencyInput: string;
  },
) {
  if (!draft) {
    return "";
  }
  return JSON.stringify({
    draft,
    transientInputs: transientInputs ?? null,
    secrets: {
      text: { action: secrets.text.action, value: secrets.text.value },
      vision: { action: secrets.vision.action, value: secrets.vision.value },
      icon_image: { action: secrets.icon_image.action, value: secrets.icon_image.value },
      bg_removal: { action: secrets.bg_removal.action, value: secrets.bg_removal.value },
    },
  });
}

function copyTextToClipboard(value: string, onSuccess: (message: string) => void, onError: (message: string) => void) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    onError("当前环境不支持复制日志路径。");
    return;
  }
  void navigator.clipboard.writeText(value).then(
    () => onSuccess("日志路径已复制"),
    () => onError("复制日志路径失败"),
  );
}

function buildTargetProfilesFingerprint(drafts: Record<string, TargetProfileDraft>): string {
  return JSON.stringify(
    Object.entries(drafts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([profileId, draft]) => ({
        profile_id: profileId,
        name: draft.name.trim(),
        directories: draft.directories
          .map((item) => ({
            path: item.path.trim(),
            label: item.label?.trim() || "",
          }))
          .filter((item) => item.path)
          .sort((left, right) => left.path.localeCompare(right.path)),
      })),
  );
}

export default function SettingsPage() {
  const api = useMemo(() => createApiClient(getApiBaseUrl(), getApiToken()), []);
  const desktopReady = isTauriDesktop();
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingFamily, setTestingFamily] = useState<SettingsFamily | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<SettingsFamily, SettingsTestResult>>>({});
  const [textSecret, setTextSecret] = useState<SecretDraft>(createSecretDraft());
  const [visionSecret, setVisionSecret] = useState<SecretDraft>(createSecretDraft());
  const [iconSecret, setIconSecret] = useState<SecretDraft>(createSecretDraft());
  const [bgRemovalSecret, setBgRemovalSecret] = useState<SecretDraft>(createSecretDraft());
  const [analysisConcurrencyInput, setAnalysisConcurrencyInput] = useState("1");
  const [imageConcurrencyInput, setImageConcurrencyInput] = useState("1");
  const [baseline, setBaseline] = useState("");
  const [createPresetDialog, setCreatePresetDialog] = useState<CreatePresetDialogState | null>(null);
  const [deletePresetDialog, setDeletePresetDialog] = useState<DeletePresetDialogState | null>(null);
  const [switchPresetDialog, setSwitchPresetDialog] = useState<SwitchPresetDialogState | null>(null);
  const [activeTab, setActiveTab] = useState<string>("text");
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [targetProfiles, setTargetProfiles] = useState<TargetProfile[]>([]);
  const [targetProfilesLoading, setTargetProfilesLoading] = useState(false);
  const [targetProfileDrafts, setTargetProfileDrafts] = useState<Record<string, TargetProfileDraft>>({});
  const [targetProfilesBaseline, setTargetProfilesBaseline] = useState("");
  const [newTargetProfileName, setNewTargetProfileName] = useState("常用目标目录");
  const [selectedTargetProfileId, setSelectedTargetProfileId] = useState<string>("");
  const [targetProfileSelectorOpen, setTargetProfileSelectorOpen] = useState(false);
  const [creatingTargetProfile, setCreatingTargetProfile] = useState(false);
  const [activeLaunchSection, setActiveLaunchSection] = useState<LaunchSection>("strategy");
  const [dragTargetProfileId, setDragTargetProfileId] = useState<string | null>(null);
  const targetProfileSelectorRef = useRef<HTMLDivElement>(null);
  const targetDropZoneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [pendingDeleteTargetProfileId, setPendingDeleteTargetProfileId] = useState<string | null>(null);

  const categories = [
    { id: "text", label: "文本模型", icon: Layers3, description: "核心分析与规划" },
    { id: "vision", label: "图片理解", icon: Globe, description: "多模态识别增强" },
    { id: "icon_image", label: "图标生图", icon: ImageIcon, description: "生图模型配置" },
    { id: "bg_removal", label: "抠图服务", icon: Scissors, description: "图标背景处理" },
    { id: "launch", label: "启动默认值", icon: SettingsIcon, description: "任务启动配置" },
    { id: "system", label: "系统与调试", icon: ShieldCheck, description: "运行状态与日志" },
  ];

  const launchSections: Array<{
    id: LaunchSection;
    label: string;
    description: string;
    icon: typeof SettingsIcon;
  }> = [
    { id: "strategy", label: "启动策略", description: "模板、语言、粒度", icon: SlidersHorizontal },
    { id: "placement", label: "放置规则", description: "新目录与 Review", icon: FolderOpen },
    { id: "targets", label: "目标目录", description: "归档目录池", icon: FolderPlus },
  ];

  const secretMap = useMemo(
    () => ({
      text: textSecret,
      vision: visionSecret,
      icon_image: iconSecret,
      bg_removal: bgRemovalSecret,
    }),
    [bgRemovalSecret, iconSecret, textSecret, visionSecret],
  );
  const activeCategory = categories.find((item) => item.id === activeTab) ?? categories[0];
  const selectedTargetProfile = targetProfiles.find((profile) => profile.profile_id === selectedTargetProfileId) ?? targetProfiles[0] ?? null;
  const selectedTargetProfileDraft = selectedTargetProfile ? targetProfileDrafts[selectedTargetProfile.profile_id] : null;
  const selectedTargetProfileName = selectedTargetProfileDraft?.name || selectedTargetProfile?.name || "选择目标目录配置";
  const selectedTargetDirectoryCount = selectedTargetProfileDraft?.directories.length ?? selectedTargetProfile?.directories.length ?? 0;

  const settingsDirty = useMemo(
    () =>
      buildFingerprint(draft, secretMap, {
        analysisConcurrencyInput,
        imageConcurrencyInput,
      }) !== baseline,
    [analysisConcurrencyInput, baseline, draft, imageConcurrencyInput, secretMap],
  );
  const targetProfilesDirty = useMemo(
    () => buildTargetProfilesFingerprint(targetProfileDrafts) !== targetProfilesBaseline,
    [targetProfileDrafts, targetProfilesBaseline],
  );
  const isDirty = settingsDirty || targetProfilesDirty;

  const hydrate = (nextSnapshot: SettingsSnapshot) => {
    const nextDraft = snapshotToDraft(nextSnapshot);
    const textKey = nextSnapshot.families.text.active_preset.OPENAI_API_KEY || "";
    const visionKey = nextSnapshot.families.vision.active_preset.IMAGE_ANALYSIS_API_KEY || "";
    const iconKey = nextSnapshot.families.icon_image.active_preset.image_model.api_key || "";
    const bgKey = nextSnapshot.families.bg_removal.active_preset.hf_api_token || "";

    const currentSecrets = {
      text: createSecretDraft(textKey),
      vision: createSecretDraft(visionKey),
      icon_image: createSecretDraft(iconKey),
      bg_removal: createSecretDraft(bgKey),
    };

    setSnapshot(nextSnapshot);
    setDraft(nextDraft);
    setTextSecret(currentSecrets.text);
    setVisionSecret(currentSecrets.vision);
    setIconSecret(currentSecrets.icon_image);
    setBgRemovalSecret(currentSecrets.bg_removal);
    setAnalysisConcurrencyInput(String(nextDraft.icon_image.analysis_concurrency_limit));
    setImageConcurrencyInput(String(nextDraft.icon_image.image_concurrency_limit));
    setBaseline(
      buildFingerprint(nextDraft, currentSecrets, {
        analysisConcurrencyInput: String(nextDraft.icon_image.analysis_concurrency_limit),
        imageConcurrencyInput: String(nextDraft.icon_image.image_concurrency_limit),
      }),
    );
    setTestResults({});
  };

  const hydrateTargetProfiles = useCallback((items: TargetProfile[]) => {
    setTargetProfiles(items);
    setSelectedTargetProfileId((current) => {
      if (items.some((item) => item.profile_id === current)) {
        return current;
      }
      return items[0]?.profile_id ?? "";
    });
    const next: Record<string, TargetProfileDraft> = {};
    for (const profile of items) {
      next[profile.profile_id] = {
        name: profile.name,
        directories: profile.directories,
        newPath: "",
        newLabel: "",
      };
    }
    setTargetProfileDrafts(next);
    setTargetProfilesBaseline(buildTargetProfilesFingerprint(next));
  }, []);

  const loadTargetProfiles = useCallback(async () => {
    setTargetProfilesLoading(true);
    try {
      hydrateTargetProfiles(await api.getTargetProfiles());
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取目标目录配置失败");
    } finally {
      setTargetProfilesLoading(false);
    }
  }, [api, hydrateTargetProfiles]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const nextSnapshot = await api.getSettings();
        if (!cancelled) {
          hydrate(nextSnapshot);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "读取设置失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    void loadTargetProfiles();
  }, [loadTargetProfiles]);

  useEffect(() => {
    if (!targetProfileSelectorOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!targetProfileSelectorRef.current?.contains(event.target as Node)) {
        setTargetProfileSelectorOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTargetProfileSelectorOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [targetProfileSelectorOpen]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listenToTauriDragDrop((event) => {
      if (event.payload.type === "over") {
        const profileId = findDropZoneForPosition(
          event.payload.position,
          Object.entries(targetDropZoneRefs.current).map(([key, element]) => ({ key, element })),
        );
        setDragTargetProfileId(profileId);
        return;
      }

      if (event.payload.type === "leave") {
        setDragTargetProfileId(null);
        return;
      }

      if (event.payload.type === "drop") {
        const profileId = findDropZoneForPosition(
          event.payload.position,
          Object.entries(targetDropZoneRefs.current).map(([key, element]) => ({ key, element })),
        );
        setDragTargetProfileId(null);
        if (profileId) {
          void addDirectoriesToTargetProfile(profileId, event.payload.paths);
        }
      }
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten?.();
        return;
      }
      unlisten = nextUnlisten;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [targetProfileDrafts]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      SETTINGS_CONTEXT_KEY,
      JSON.stringify({
        title: "设置",
        detail: "模型与工具配置",
      }),
    );
    window.dispatchEvent(new Event(APP_CONTEXT_EVENT));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncLayoutMode = () => {
      const compact = window.innerWidth < COMPACT_SETTINGS_BREAKPOINT;
      setIsCompactLayout(compact);
      if (!compact) {
        setCategoryDialogOpen(false);
      }
    };

    syncLayoutMode();
    window.addEventListener("resize", syncLayoutMode);
    return () => {
      window.removeEventListener("resize", syncLayoutMode);
    };
  }, []);

  const launchTemplate = getTemplateMeta(draft?.global_config.LAUNCH_DEFAULT_TEMPLATE_ID ?? "general_downloads");
  const launchReviewFollowsNewRoot = draft?.global_config.LAUNCH_REVIEW_FOLLOWS_NEW_ROOT !== false;
  const launchDefaultNewDirectoryRoot = String(draft?.global_config.LAUNCH_DEFAULT_NEW_DIRECTORY_ROOT ?? "");
  const launchDefaultReviewRoot = String(draft?.global_config.LAUNCH_DEFAULT_REVIEW_ROOT ?? "");
  const launchDerivedReviewRoot = launchDefaultNewDirectoryRoot
    ? `${launchDefaultNewDirectoryRoot.replace(/[\\/]$/, "")}/Review`
    : "新目录生成位置/Review";
  const launchStrategyPreview = buildStrategySummary({
    template_id: draft?.global_config.LAUNCH_DEFAULT_TEMPLATE_ID ?? "general_downloads",
    organize_mode: "initial",
    task_type: "organize_full_directory",
    destination_index_depth: 2,
    language: draft?.global_config.LAUNCH_DEFAULT_LANGUAGE ?? "zh",
    density: draft?.global_config.LAUNCH_DEFAULT_DENSITY ?? "normal",
    prefix_style: draft?.global_config.LAUNCH_DEFAULT_PREFIX_STYLE ?? "none",
    caution_level: draft?.global_config.LAUNCH_DEFAULT_CAUTION_LEVEL ?? "balanced",
    note: draft?.global_config.LAUNCH_DEFAULT_NOTE ?? "",
  });

  const updateDraft = <K extends keyof DraftState>(key: K, updater: (current: DraftState[K]) => DraftState[K]) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        [key]: updater(current[key]),
      };
    });
    setSuccess(null);
  };

  const commitAnalysisConcurrencyInput = () => {
    setDraft((current) => {
      if (!current) return current;
      const nextValue = clampConcurrencyInput(analysisConcurrencyInput, current.icon_image.analysis_concurrency_limit);
      setAnalysisConcurrencyInput(String(nextValue));
      return {
        ...current,
        icon_image: {
          ...current.icon_image,
          analysis_concurrency_limit: nextValue,
        },
      };
    });
  };

  const commitImageConcurrencyInput = () => {
    setDraft((current) => {
      if (!current) return current;
      const nextValue = clampConcurrencyInput(imageConcurrencyInput, current.icon_image.image_concurrency_limit);
      setImageConcurrencyInput(String(nextValue));
      return {
        ...current,
        icon_image: {
          ...current.icon_image,
          image_concurrency_limit: nextValue,
        },
      };
    });
  };

  const updateGlobal = (key: string, value: unknown) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        global_config: {
          ...current.global_config,
          [key]: value,
        },
      };
    });
    setSuccess(null);
  };

  const updateTargetProfileDraft = (profileId: string, updater: (current: TargetProfileDraft) => TargetProfileDraft) => {
    setTargetProfileDrafts((current) => {
      const draft = current[profileId];
      if (!draft) {
        return current;
      }
      return {
        ...current,
        [profileId]: updater(draft),
      };
    });
    setSuccess(null);
  };

  const addDirectoriesToTargetProfile = (profileId: string, paths: string[]) => {
    const draft = targetProfileDrafts[profileId];
    if (!draft) {
      return;
    }
    const cleanedPaths = paths.map((path) => path.trim()).filter(Boolean);
    if (!cleanedPaths.length) {
      setError("没有读取到可添加的目录路径。");
      return;
    }

    const seen = new Set(draft.directories.map((item) => item.path.trim().toLowerCase()));
    const additions: TargetProfileDirectory[] = [];
    for (const path of cleanedPaths) {
      const key = path.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      additions.push({ path });
    }

    if (!additions.length) {
      setSuccess("这些目录已经在当前配置里");
      return;
    }

    const directories = [...draft.directories, ...additions];
    updateTargetProfileDraft(profileId, (current) => ({ ...current, directories, newPath: "", newLabel: "" }));
  };

  const saveTargetProfileDrafts = async () => {
    const entries = Object.entries(targetProfileDrafts);
    for (const [, draft] of entries) {
      if (!draft.name.trim()) {
        throw new Error("目标目录配置名称不能为空。");
      }
    }
    setTargetProfilesLoading(true);
    try {
      await Promise.all(
        entries.map(([profileId, draft]) =>
          api.updateTargetProfile(profileId, {
            name: draft.name.trim(),
            directories: draft.directories
              .map((item) => ({ path: item.path.trim(), label: item.label?.trim() || undefined }))
              .filter((item) => item.path),
          }),
        ),
      );
      await loadTargetProfiles();
    } finally {
      setTargetProfilesLoading(false);
    }
  };

  const createTargetProfile = async () => {
    const name = newTargetProfileName.trim();
    if (!name) {
      setError("请先输入目标目录配置名称。");
      return;
    }
    setTargetProfilesLoading(true);
    setError(null);
    try {
      const profile = await api.createTargetProfile({ name, directories: [] });
      setNewTargetProfileName("常用目标目录");
      setSelectedTargetProfileId(profile.profile_id);
      setCreatingTargetProfile(false);
      setTargetProfileSelectorOpen(false);
      await loadTargetProfiles();
      setSuccess("目标目录配置已创建");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建目标目录配置失败");
    } finally {
      setTargetProfilesLoading(false);
    }
  };

  const deleteTargetProfile = async (profileId: string) => {
    setTargetProfilesLoading(true);
    setError(null);
    try {
      await api.deleteTargetProfile(profileId);
      setSelectedTargetProfileId((current) => (current === profileId ? "" : current));
      await loadTargetProfiles();
      setSuccess("目标目录配置已删除");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除目标目录配置失败");
    } finally {
      setTargetProfilesLoading(false);
    }
  };

  const addDirectoryToTargetProfile = (profileId: string) => {
    const draft = targetProfileDrafts[profileId];
    if (!draft) {
      return;
    }
    const path = draft.newPath.trim();
    if (!path) {
      setError("请先输入目标目录路径。");
      return;
    }
    const key = path.toLowerCase();
    const directories = [
      ...draft.directories.filter((item) => item.path.trim().toLowerCase() !== key),
      { path, label: draft.newLabel.trim() || undefined },
    ];
    updateTargetProfileDraft(profileId, (current) => ({ ...current, directories, newPath: "", newLabel: "" }));
  };

  const extractDroppedPaths = (event: React.DragEvent<HTMLElement>): string[] => {
    const textPayload = event.dataTransfer.getData("text/plain");
    const uriPayload = event.dataTransfer.getData("text/uri-list");
    const files = Array.from(event.dataTransfer.files)
      .map((file) => {
        const path = (file as File & { path?: string }).path || (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        return path || "";
      })
      .filter(Boolean);

    const textPaths = `${textPayload}\n${uriPayload}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => (line.startsWith("file:///") ? decodeURIComponent(line.replace(/^file:\/+/, "")) : line));

    return [...files, ...textPaths];
  };

  const removeDirectoryFromTargetProfile = (profileId: string, path: string) => {
    const draft = targetProfileDrafts[profileId];
    if (!draft) {
      return;
    }
    const directories = draft.directories.filter((item) => item.path !== path);
    updateTargetProfileDraft(profileId, (current) => ({ ...current, directories }));
  };

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    setCategoryDialogOpen(false);
  };

  const performActivatePreset = async (family: PresetConfigFamily, presetId: string) => {
    setLoading(true);
    setError(null);
    try {
      await api.activateSettingsPreset(family, presetId);
      hydrate(await api.getSettings());
      setSuccess("预设已切换");
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换预设失败");
    } finally {
      setLoading(false);
    }
  };

  const handleActivatePreset = async (family: PresetConfigFamily, presetId: string) => {
    if (isDirty) {
      setSwitchPresetDialog({ family, presetId });
      return;
    }
    await performActivatePreset(family, presetId);
  };

  const performCreatePreset = async (family: PresetConfigFamily, presetName: string) => {
    if (!draft) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (family === "text") {
        await api.createSettingsPreset("text", {
          name: presetName.trim(),
          copy_from_active: true,
          preset: {
            OPENAI_BASE_URL: draft.text.OPENAI_BASE_URL,
            OPENAI_MODEL: draft.text.OPENAI_MODEL,
          },
          secret: buildSecretPayload(textSecret),
        });
      } else if (family === "vision") {
        await api.createSettingsPreset("vision", {
          name: presetName.trim(),
          copy_from_active: true,
          preset: {
            IMAGE_ANALYSIS_BASE_URL: draft.vision.IMAGE_ANALYSIS_BASE_URL,
            IMAGE_ANALYSIS_MODEL: draft.vision.IMAGE_ANALYSIS_MODEL,
          },
          secret: buildSecretPayload(visionSecret),
        });
      } else {
        await api.createSettingsPreset("icon_image", {
          name: presetName.trim(),
          copy_from_active: true,
          preset: {
            image_model: {
              base_url: draft.icon_image.image_model.base_url,
              model: draft.icon_image.image_model.model,
            },
            image_size: normalizeImageSize(draft.icon_image.image_size),
            analysis_concurrency_limit: clampConcurrencyInput(analysisConcurrencyInput, draft.icon_image.analysis_concurrency_limit),
            image_concurrency_limit: clampConcurrencyInput(imageConcurrencyInput, draft.icon_image.image_concurrency_limit),
            save_mode: draft.icon_image.save_mode,
          },
          secret: buildSecretPayload(iconSecret),
        });
      }
      hydrate(await api.getSettings());
      setSuccess("新预设已创建并激活");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建预设失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePreset = (family: PresetConfigFamily) => {
    setCreatePresetDialog({
      family,
      value: family === "text" ? "新的文本预设" : family === "vision" ? "新的图片理解预设" : "新的图标生图预设",
    });
  };

  const performDeletePreset = async (family: PresetConfigFamily, presetId: string) => {
    setLoading(true);
    setError(null);
    try {
      await api.deleteSettingsPreset(family, presetId);
      hydrate(await api.getSettings());
      setSuccess("预设已删除");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除预设失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePreset = (family: PresetConfigFamily, presetId: string, presetName: string) => {
    setDeletePresetDialog({ family, presetId, presetName });
  };

  const buildSavePayload = (): SettingsUpdatePayload | null => {
    if (!draft) {
      return null;
    }
    const families: NonNullable<SettingsUpdatePayload["families"]> = {
      bg_removal: {
        mode: draft.bg_removal.mode,
        preset: {
          preset_id: draft.bg_removal.preset_id ?? undefined,
        },
        custom: {
          name: draft.bg_removal.custom.name,
          model_id: draft.bg_removal.custom.model_id,
          api_type: draft.bg_removal.custom.api_type,
          payload_template: draft.bg_removal.custom.payload_template,
        },
        secret: buildSecretPayload(bgRemovalSecret),
      },
    };

    if (snapshot?.families.text.active_preset_id) {
      families.text = {
        ...buildFamilySavePayload("text", {
          OPENAI_BASE_URL: draft.text.OPENAI_BASE_URL,
          OPENAI_MODEL: draft.text.OPENAI_MODEL,
        }),
        secret: buildSecretPayload(textSecret),
      };
    }

    families.vision = {
      enabled: Boolean(draft.global_config.IMAGE_ANALYSIS_ENABLED),
      ...(snapshot?.families.vision.active_preset_id
        ? {
            ...buildFamilySavePayload("vision", {
              IMAGE_ANALYSIS_NAME: draft.vision.IMAGE_ANALYSIS_NAME,
              IMAGE_ANALYSIS_BASE_URL: draft.vision.IMAGE_ANALYSIS_BASE_URL,
              IMAGE_ANALYSIS_MODEL: draft.vision.IMAGE_ANALYSIS_MODEL,
            }),
            secret: buildSecretPayload(visionSecret),
          }
        : {}),
    };

    if (snapshot?.families.icon_image.active_preset_id) {
      families.icon_image = {
        ...buildFamilySavePayload("icon_image", {
          image_model: {
            base_url: draft.icon_image.image_model.base_url,
            model: draft.icon_image.image_model.model,
          },
          image_size: normalizeImageSize(draft.icon_image.image_size),
          analysis_concurrency_limit: clampConcurrencyInput(analysisConcurrencyInput, draft.icon_image.analysis_concurrency_limit),
          image_concurrency_limit: clampConcurrencyInput(imageConcurrencyInput, draft.icon_image.image_concurrency_limit),
          save_mode: draft.icon_image.save_mode,
        }),
        secret: buildSecretPayload(iconSecret),
      };
    }

    return {
      global_config: draft.global_config,
      families,
    };
  };

  const handleSave = async () => {
    const payload = buildSavePayload();
    if (!payload) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (targetProfilesDirty && Object.values(targetProfileDrafts).some((profile) => !profile.name.trim())) {
        throw new Error("目标目录配置名称不能为空。");
      }
      if (settingsDirty) {
        const nextSnapshot = await api.updateSettings(payload);
        hydrate(nextSnapshot);
      }
      if (targetProfilesDirty) {
        await saveTargetProfileDrafts();
      }
      setSuccess("设置已保存并生效");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => {
    if (snapshot) {
      hydrate(snapshot);
    }
    hydrateTargetProfiles(targetProfiles);
  };

  const resolveBgRemovalRuntimeConfig = async () => {
    const stored = await api.getSettingsRuntime<{
      name?: string;
      model_id?: string;
      api_type?: string;
      payload_template?: string;
      api_token?: string;
    }>("bg_removal");

    const builtin = snapshot?.families.bg_removal.builtin_presets.find((item) => item.id === draft?.bg_removal.preset_id) ?? null;
    const secretPayload = buildSecretPayload(bgRemovalSecret);

    return {
      modelId: draft?.bg_removal.mode === "custom" ? draft.bg_removal.custom.model_id : builtin?.model_id ?? stored.model_id ?? "",
      apiType: draft?.bg_removal.mode === "custom" ? draft.bg_removal.custom.api_type : builtin?.api_type ?? stored.api_type ?? "gradio_space",
      payloadTemplate:
        draft?.bg_removal.mode === "custom"
          ? draft.bg_removal.custom.payload_template
          : builtin?.payload_template ?? stored.payload_template ?? "",
      apiToken:
        secretPayload.action === "replace"
          ? secretPayload.value ?? null
          : secretPayload.action === "clear"
            ? null
            : stored.api_token ?? null,
    };
  };

  const handleTest = async (family: SettingsFamily) => {
    if (!draft) {
      return;
    }
    setTestingFamily(family);
    setError(null);
    try {
      if (family === "bg_removal") {
        if (!desktopReady) {
          throw new Error("抠图服务测试仅支持桌面端。");
        }
        const runtimeConfig = await resolveBgRemovalRuntimeConfig();
        const tauriResult = await invokeTauriCommand<{ status: string; message: string }>("test_bg_removal_connection", {
          config: runtimeConfig,
        });
        setTestResults((current) => ({
          ...current,
          bg_removal: tauriResult
            ? {
                status: tauriResult.status === "ok" ? "ok" : "error",
                family: "bg_removal",
                code: tauriResult.status === "ok" ? "ok" : "unknown",
                message: tauriResult.message,
              }
            : {
                status: "error",
                family: "bg_removal",
                code: "desktop_unavailable",
                message: "桌面端不可用，无法执行抠图连接测试。",
              },
        }));
        return;
      }
      const result =
        family === "text"
          ? await api.testSettings({
              family,
              ...buildFamilySavePayload("text", {
                OPENAI_BASE_URL: draft.text.OPENAI_BASE_URL,
                OPENAI_MODEL: draft.text.OPENAI_MODEL,
              }),
              secret: buildSecretPayload(textSecret),
            })
          : family === "vision"
            ? await api.testSettings({
                family,
                ...buildFamilySavePayload("vision", {
                  IMAGE_ANALYSIS_NAME: draft.vision.IMAGE_ANALYSIS_NAME,
                  IMAGE_ANALYSIS_BASE_URL: draft.vision.IMAGE_ANALYSIS_BASE_URL,
                  IMAGE_ANALYSIS_MODEL: draft.vision.IMAGE_ANALYSIS_MODEL,
                }),
                secret: buildSecretPayload(visionSecret),
              })
            : await api.testSettings({
                family,
                ...buildFamilySavePayload("icon_image", {
                  image_model: {
                    base_url: draft.icon_image.image_model.base_url,
                    model: draft.icon_image.image_model.model,
                  },
                  image_size: normalizeImageSize(draft.icon_image.image_size),
                  analysis_concurrency_limit: clampConcurrencyInput(analysisConcurrencyInput, draft.icon_image.analysis_concurrency_limit),
                  image_concurrency_limit: clampConcurrencyInput(imageConcurrencyInput, draft.icon_image.image_concurrency_limit),
                  save_mode: draft.icon_image.save_mode,
                }),
                secret: buildSecretPayload(iconSecret),
              });
      setTestResults((current) => ({ ...current, [family]: result }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "连接测试失败");
    } finally {
      setTestingFamily(null);
    }
  };

  const renderResult = (family: SettingsFamily) => {
    const result = testResults[family];
    const isTesting = testingFamily === family;
    const isVision = family === "vision";

    if (isTesting) {
      return (
        <div className="flex items-center gap-3 rounded-[6px] border border-primary/15 bg-primary/5 px-4 py-3">
           <div className="relative h-6 w-6 shrink-0">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/20 opacity-75" />
              <div className="relative flex h-full w-full items-center justify-center rounded-full bg-primary/10 text-primary">
                 <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              </div>
           </div>
           <div className="min-w-0">
              <p className="text-[13px] font-bold tracking-tight text-on-surface">
                {isVision ? "正在验证图片理解能力..." : "正在进行连接测试..."}
              </p>
              <p className="mt-0.5 text-[10px] font-bold tracking-widest text-primary/60">
                {isVision ? "图片能力验证" : "连接探测"}
              </p>
           </div>
        </div>
      );
    }

    if (!result) {
      return null;
    }

    const isOk = result.status === "ok";

    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "flex items-start gap-3.5 rounded-[6px] border px-4 py-3 transition-all",
          isOk
            ? "border-success/20 bg-success/[0.03]"
            : "border-error/20 bg-error/[0.03]",
        )}
      >
        <div className={cn(
           "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border",
           isOk ? "border-success/20 bg-success/10 text-success-dim" : "border-error/20 bg-error/10 text-error"
        )}>
          {isOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-4">
             <h4 className={cn("text-[13px] font-bold tracking-tight", isOk ? "text-success-dim" : "text-error-dim")}>
                {isVision ? (isOk ? "图片能力已验证" : "图片能力验证失败") : isOk ? "服务已成功对齐" : "连接遭到拦截"}
             </h4>
             {isOk && (
                <div className="flex items-center gap-1.5 rounded-[4px] bg-success/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-success-dim">
                   <div className="h-1 w-1 rounded-full bg-success animate-pulse" />
                   可用
                </div>
             )}
          </div>
          <p className="text-[12px] leading-relaxed text-on-surface/70">{result.message}</p>
          {isVision && result.details ? (
            <div className="rounded-[6px] border border-on-surface/8 bg-surface-container-low px-3 py-2 text-[11px] leading-relaxed text-on-surface/70">
              <p>期望结果：{result.details.expected}</p>
              <p>实际返回：{result.details.actual?.trim() ? result.details.actual : "空响应"}</p>
            </div>
          ) : null}
          {!isOk && <p className="text-[10px] font-mono opacity-50">Code: {result.code}</p>}
        </div>
      </motion.div>
    );
  };

  const renderConnectionTestPanel = (family: SettingsFamily, disabled = false) => (
    <div className="rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[12.5px] font-black text-on-surface">连接测试</h3>
          <p className="mt-1 text-[11.5px] font-medium text-ui-muted/65">使用当前表单内容测试，不需要先保存。</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleTest(family)}
          loading={testingFamily === family}
          disabled={disabled}
        >
          {disabled ? "仅桌面端可测试" : "测试连接"}
        </Button>
      </div>
      <div className="mt-3">{renderResult(family)}</div>
    </div>
  );

  const renderSecretField = (
    label: string,
    state: SecretState,
    secret: SecretDraft,
    setSecret: Dispatch<SetStateAction<SecretDraft>>,
  ) => (
    <FieldGroup label={label} hint={describeSecret(state, secret)}>
      <InputShell icon={Key} className="group flex items-center gap-2">
        <input
          type={secret.visible ? "text" : "password"}
          value={secret.value}
          onChange={(event) => {
            const nextValue = event.target.value;
            setSecret((current) => ({
              ...current,
              value: nextValue,
              action: nextValue.trim() ? "replace" : "keep",
            }));
          }}
          className="flex-1 bg-transparent py-2 text-sm font-mono font-medium text-on-surface outline-none placeholder:text-on-surface-variant/35"
          placeholder={state === "stored" ? "输入新密钥以替换当前值" : "输入要保存的新密钥"}
        />
        <div className="flex shrink-0 items-center gap-1 pr-1">
          <button
            type="button"
            onClick={() => setSecret((current) => ({ ...current, visible: !current.visible }))}
            className="rounded-[6px] p-2 text-on-surface-variant/45 transition-colors hover:bg-surface-container-low hover:text-on-surface"
            title={secret.visible ? "隐藏" : "显示"}
          >
            {secret.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          
          {secret.action !== "keep" ? (
            <button
               type="button"
               onClick={() => setSecret((current) => ({ ...current, action: "keep", value: "", visible: false }))}
               className="rounded-[6px] px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/5 transition-colors"
            >
              撤销
            </button>
          ) : state === "stored" ? (
            <button
               type="button"
               onClick={() => setSecret((current) => ({ ...current, action: "clear", value: "", visible: false }))}
               className="rounded-[6px] px-2 py-1 text-[11px] font-bold text-on-surface-variant/60 hover:bg-on-surface/5 transition-colors"
            >
              清空
            </button>
          ) : null}
        </div>
      </InputShell>
    </FieldGroup>
  );

  if (loading || !draft || !snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-9 w-9 animate-spin text-primary/45" />
          <p className="text-[13px] font-semibold text-on-surface-variant/70">正在读取统一设置快照</p>
        </div>
      </div>
    );
  }

  const textPresetEditable = isEditablePreset(snapshot.families.text.active_preset_id);
  const visionPresetEditable = isEditablePreset(snapshot.families.vision.active_preset_id);
  const iconImagePresetEditable = isEditablePreset(snapshot.families.icon_image.active_preset_id);

  const renderCreatePresetHint = (label: string) => (
    <div className="rounded-[12px] border border-dashed border-on-surface/12 bg-surface px-4 py-5">
      <p className="text-sm font-semibold text-on-surface">请先点击 + 创建一个预设</p>
      <p className="mt-1 text-[12px] leading-6 text-on-surface-variant/70">
        {label} 还没有可编辑的用户预设。创建成功后再填写接口地址、模型和 API Key，保存会直接写入当前新预设。
      </p>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <div className="flex w-full flex-1 overflow-hidden">
        {/* Left Sidebar Navigation */}
        {!isCompactLayout && (
        <aside className="w-[260px] 2xl:w-[300px] shrink-0 overflow-y-auto border-r border-on-surface/8 bg-surface-container-lowest px-2 py-4 scrollbar-none">
          <div className="space-y-0.5">
            {categories.map((cat) => {
              const active = activeTab === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleSelectTab(cat.id)}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-[6px] px-3 py-2 text-left transition-colors outline-none",
                    active
                      ? "bg-primary/[0.06] border-primary/20"
                      : "bg-transparent border-transparent hover:bg-on-surface/[0.035]",
                  )}
                  style={{ borderWidth: '1px', borderStyle: 'solid' }}
                >
                  {active && (
                    <div

                      className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-primary"
                    />
                  )}
                  <div className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] transition-colors",
                    active ? "bg-primary text-white" : "bg-transparent group-hover:bg-on-surface/[0.05] text-on-surface/40",
                  )}>
                    <cat.icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[12.5px] font-black leading-none tracking-tight", active ? "text-primary" : "text-on-surface/80")}>{cat.label}</p>
                    <p className="mt-1.5 truncate text-[10.5px] font-medium opacity-50">{cat.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-8 rounded-xl border border-on-surface/8 bg-on-surface/[0.02] p-4">
             <div className="flex items-center gap-2 text-primary">
                <Cpu className="h-3.5 w-3.5" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">引擎状态</span>
             </div>
             <div className="mt-4 space-y-3">
                {[
                  { label: "文本分析", pass: snapshot.status.text_configured, icon: Layers3 },
                  { label: "多模态分析", pass: snapshot.status.vision_configured, icon: Globe },
                  { label: "图标生成", pass: snapshot.status.icon_image_configured, icon: ImageIcon },
                  { label: "背景处理", pass: snapshot.status.bg_removal_configured, icon: Scissors },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                       <item.icon className="h-3 w-3 text-on-surface/25" />
                       <span className="truncate text-[11px] font-bold text-on-surface/40">{item.label}</span>
                    </div>
                    {item.pass ? (
                       <div className="flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5">
                          <div className="h-0.5 w-0.5 rounded-full bg-success" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-success-dim/70">OK</span>
                       </div>
                    ) : (
                       <div className="flex items-center gap-1 rounded-full bg-on-surface/5 px-1.5 py-0.5">
                          <div className="h-0.5 w-0.5 rounded-full bg-on-surface/20" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-on-surface/30">NO</span>
                       </div>
                    )}
                  </div>
                ))}
             </div>
             <div className="mt-4 border-t border-on-surface/5 pt-3">
                <p className="text-[10px] font-bold leading-relaxed text-on-surface/25">
                    已就绪表示当前引擎可直接使用。
                </p>
             </div>
          </div>
        </aside>
        )}

        {/* Right Content Area */}
        <main className="flex-1 overflow-y-auto bg-surface relative scrollbar-thin outline-none">
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="mx-auto max-w-[800px] pb-24 pt-6 px-6"
          >
            {isCompactLayout && (
              <div className="mb-6 flex items-center justify-between gap-3 rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ui-muted">当前分类</p>
                  <p className="truncate text-[14px] font-black text-on-surface">{activeCategory.label}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setCategoryDialogOpen(true)}>
                  切换分类
                </Button>
              </div>
            )}
            {error && (
              <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <ErrorAlert title="操作执行失败" message={error} onClose={() => setError(null)} />
              </div>
            )}
            {success && (
              <div className="mb-6 flex items-center gap-2.5 rounded-[6px] border border-success/15 bg-success/5 px-4 py-3 text-[12.5px] font-bold text-success-dim animate-in fade-in slide-in-from-top-2 duration-300">
                <CheckCircle2 className="h-4 w-4" />
                {success}
              </div>
            )}

            {!snapshot.status.text_configured && (
              <div className="mb-6 flex items-center justify-between gap-4 rounded-[6px] border border-warning/20 bg-warning-container/15 px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-warning/10 text-warning">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-black tracking-tight text-on-surface">当前还没有可用的文本模型</p>
                    <p className="mt-1 text-[12px] font-medium leading-6 text-ui-muted">
                      文本模型是整理分析主链路的核心配置。请先创建并补全文本预设，再回到首页启动任务。
                    </p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => handleSelectTab("text")}>
                  去配置文本模型
                </Button>
              </div>
            )}

            {activeTab === "text" && (
              <SettingsSection
                icon={Layers3}
                title="文本模型"
                description="整理任务和图标工坊都会读取这里当前启用的文本预设。支持 OpenAI 兼容的 Chat Completions 接口。"
              >
                <PresetSelector
                  label="文本预设"
                  presets={snapshot.families.text.presets.map((item) => ({ id: item.id, name: item.name }))}
                  activeId={snapshot.families.text.active_preset_id}
                  onSwitch={(id) => void handleActivatePreset("text", id)}
                  onAdd={() => handleCreatePreset("text")}
                  onDelete={(preset) => void handleDeletePreset("text", preset.id, preset.name)}
                />
                {textPresetEditable ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <FieldGroup label="模型 ID">
                      <InputShell icon={Terminal}>
                        <input value={draft.text.OPENAI_MODEL} onChange={(event) => updateDraft("text", (current) => ({ ...current, OPENAI_MODEL: event.target.value }))} className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none" placeholder="gpt-5.4" />
                      </InputShell>
                    </FieldGroup>
                    <FieldGroup label="接口地址" hint="建议填写到 /v1，不要只填裸域名。">
                      <InputShell icon={Globe}>
                        <input value={draft.text.OPENAI_BASE_URL} onChange={(event) => updateDraft("text", (current) => ({ ...current, OPENAI_BASE_URL: event.target.value }))} className="w-full bg-transparent py-2 text-sm font-mono font-medium text-on-surface outline-none" placeholder="https://api.openai.com/v1" />
                      </InputShell>
                    </FieldGroup>
                    <div className="xl:col-span-2">{renderSecretField("API 密钥", draft.text.secret_state, textSecret, setTextSecret)}</div>
                    <div className="xl:col-span-2">{renderConnectionTestPanel("text")}</div>
                  </div>
                ) : (
                  renderCreatePresetHint("文本模型")
                )}
              </SettingsSection>
            )}

            {activeTab === "vision" && (
              <SettingsSection
                icon={Globe}
                title="图片理解"
                description="开启后，模型可在必要时查看图片内容；关闭时只按文件名判断。"
                actions={
                  <div className="flex items-center gap-2 rounded-[10px] border border-on-surface/8 bg-surface-container-low px-3 py-2">
                    <span className="text-[12px] font-medium text-on-surface-variant/70">启用</span>
                    <ToggleSwitch
                      checked={Boolean(draft.global_config.IMAGE_ANALYSIS_ENABLED)}
                      onClick={() => updateGlobal("IMAGE_ANALYSIS_ENABLED", !draft.global_config.IMAGE_ANALYSIS_ENABLED)}
                    />
                  </div>
                }
              >
                <PresetSelector
                  label="图片理解预设"
                  presets={snapshot.families.vision.presets.map((item) => ({ id: item.id, name: item.name }))}
                  activeId={snapshot.families.vision.active_preset_id}
                  onSwitch={(id) => void handleActivatePreset("vision", id)}
                  onAdd={() => handleCreatePreset("vision")}
                  onDelete={(preset) => void handleDeletePreset("vision", preset.id, preset.name)}
                />
                {visionPresetEditable ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <FieldGroup label="模型 ID">
                      <InputShell icon={ImageIcon}>
                        <input value={draft.vision.IMAGE_ANALYSIS_MODEL} onChange={(event) => updateDraft("vision", (current) => ({ ...current, IMAGE_ANALYSIS_MODEL: event.target.value }))} className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none" placeholder="gpt-4o-mini" />
                      </InputShell>
                    </FieldGroup>
                    <FieldGroup label="接口地址" hint="建议填写到 /v1，并确保该模型支持图片输入。">
                      <InputShell icon={Globe}>
                        <input value={draft.vision.IMAGE_ANALYSIS_BASE_URL} onChange={(event) => updateDraft("vision", (current) => ({ ...current, IMAGE_ANALYSIS_BASE_URL: event.target.value }))} className="w-full bg-transparent py-2 text-sm font-mono font-medium text-on-surface outline-none" placeholder="https://host.example/v1" />
                      </InputShell>
                    </FieldGroup>
                    <div className="xl:col-span-2">{renderSecretField("图片理解密钥", draft.vision.secret_state, visionSecret, setVisionSecret)}</div>
                    <div className="xl:col-span-2">{renderConnectionTestPanel("vision")}</div>
                  </div>
                ) : (
                  renderCreatePresetHint("图片理解")
                )}
              </SettingsSection>
            )}

            {activeTab === "icon_image" && (
              <SettingsSection
                icon={ImageIcon}
                title="图标生成"
                description="这里配置图标预览生成模型。图标工坊会自动读取当前启用的文本预设，不需要单独设置文本密钥。"
              >
                <PresetSelector
                  label="图标生图预设"
                  presets={snapshot.families.icon_image.presets.map((item) => ({ id: item.id, name: item.name }))}
                  activeId={snapshot.families.icon_image.active_preset_id}
                  onSwitch={(id) => void handleActivatePreset("icon_image", id)}
                  onAdd={() => handleCreatePreset("icon_image")}
                  onDelete={(preset) => void handleDeletePreset("icon_image", preset.id, preset.name)}
                />
                {iconImagePresetEditable ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <FieldGroup label="生图模型 ID">
                      <InputShell icon={Terminal}>
                        <input value={draft.icon_image.image_model.model} onChange={(event) => updateDraft("icon_image", (current) => ({ ...current, image_model: { ...current.image_model, model: event.target.value } }))} className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none" placeholder="gpt-image-1" />
                      </InputShell>
                    </FieldGroup>
                    <FieldGroup label="生图接口地址" className="xl:col-span-2" hint="可填写到 /v1，或直接填写完整 /images/generations 端点。">
                      <InputShell icon={Globe}>
                        <input value={draft.icon_image.image_model.base_url} onChange={(event) => updateDraft("icon_image", (current) => ({ ...current, image_model: { ...current.image_model, base_url: event.target.value } }))} className="w-full bg-transparent py-2 text-sm font-mono font-medium text-on-surface outline-none" placeholder="https://host.example/v1" />
                      </InputShell>
                    </FieldGroup>
                    <FieldGroup label="图片尺寸" hint="默认值为 1024x1024。">
                      <div className="grid gap-3 md:grid-cols-3">
                        {IMAGE_SIZE_OPTIONS.map((size) => (
                          <StrategyOptionButton
                            key={size}
                            active={normalizeImageSize(draft.icon_image.image_size) === size}
                            label={size}
                            description={
                              size === "1024x1024"
                                ? "默认尺寸。"
                                : size === "512x512"
                                  ? "可选尺寸。"
                                  : "可选尺寸。"
                            }
                            onClick={() =>
                              updateDraft("icon_image", (current) => ({
                                ...current,
                                image_size: size,
                              }))
                            }
                          />
                        ))}
                      </div>
                    </FieldGroup>
                    <FieldGroup label="分析并发上限" hint="控制文件夹内容分析阶段的并发数，通常可以设得比生图更高。">
                      <InputShell icon={Cpu}>
                        <input
                          value={analysisConcurrencyInput}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            if (/^\d*$/.test(nextValue)) {
                              setAnalysisConcurrencyInput(nextValue);
                            }
                          }}
                          onBlur={commitAnalysisConcurrencyInput}
                          className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none"
                          placeholder="1"
                          inputMode="numeric"
                        />
                      </InputShell>
                    </FieldGroup>
                    <FieldGroup label="生图并发上限" hint="控制图标预览生成阶段的并发数，建议保守设置，避免触发限流。">
                      <InputShell icon={Cpu}>
                        <input
                          value={imageConcurrencyInput}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            if (/^\d*$/.test(nextValue)) {
                              setImageConcurrencyInput(nextValue);
                            }
                          }}
                          onBlur={commitImageConcurrencyInput}
                          className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none"
                          placeholder="1"
                          inputMode="numeric"
                        />
                      </InputShell>
                    </FieldGroup>
                    <FieldGroup label="保存方式" className="xl:col-span-2">
                      <div className="grid gap-3 md:grid-cols-2">
                        <StrategyOptionButton active={draft.icon_image.save_mode === "centralized"} label="集中保存" onClick={() => updateDraft("icon_image", (current) => ({ ...current, save_mode: "centralized" }))} description="图标资源集中写入统一目录，便于管理版本与回看。" />
                        <StrategyOptionButton active={draft.icon_image.save_mode === "in_folder"} label="就地保存" onClick={() => updateDraft("icon_image", (current) => ({ ...current, save_mode: "in_folder" }))} description="处理后资源靠近目标文件夹，适合边做边核对。" />
                      </div>
                    </FieldGroup>
                    <div className="xl:col-span-2">{renderSecretField("生图接口密钥", draft.icon_image.image_model.secret_state, iconSecret, setIconSecret)}</div>
                    <div className="xl:col-span-2">{renderConnectionTestPanel("icon_image")}</div>
                  </div>
                ) : (
                  renderCreatePresetHint("图标生图")
                )}
              </SettingsSection>
            )}

            {activeTab === "bg_removal" && (
              <SettingsSection
                icon={Scissors}
                title="背景处理"
                description="桌面端图标工坊会读取这里的背景处理配置。可使用内置预设，也可切换为自定义服务。"
              >
                <FieldGroup label="服务模式">
                  <div className="grid gap-3 md:grid-cols-2">
                    <StrategyOptionButton
                      active={draft.bg_removal.mode === "preset"}
                      label="使用内置预设"
                      description="直接使用内置的背景处理服务，适合快速开始。"
                      onClick={() => updateDraft("bg_removal", (current) => ({ ...current, mode: "preset" }))}
                    />
                    <StrategyOptionButton
                      active={draft.bg_removal.mode === "custom"}
                      label="自定义服务"
                      description="手动填写 Space ID、API 类型和 payload_template。"
                      onClick={() => updateDraft("bg_removal", (current) => ({ ...current, mode: "custom" }))}
                    />
                  </div>
                </FieldGroup>
                {draft.bg_removal.mode === "preset" ? (
                  <FieldGroup label="内置预设">
                    <div className="grid gap-3 xl:grid-cols-2">
                      {snapshot.families.bg_removal.builtin_presets.map((preset) => (
                        <StrategyOptionButton
                          key={preset.id}
                          active={draft.bg_removal.preset_id === preset.id}
                          label={preset.name}
                          description={`${preset.model_id} · ${preset.api_type}`}
                          onClick={() => updateDraft("bg_removal", (current) => ({ ...current, preset_id: preset.id }))}
                        />
                      ))}
                    </div>
                  </FieldGroup>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <FieldGroup label="自定义名称">
                      <InputShell icon={Cpu}>
                        <input
                          value={draft.bg_removal.custom.name}
                          onChange={(event) =>
                            updateDraft("bg_removal", (current) => ({
                              ...current,
                              custom: { ...current.custom, name: event.target.value },
                            }))
                          }
                          className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none"
                          placeholder="自定义抠图"
                        />
                      </InputShell>
                    </FieldGroup>
                    <FieldGroup label="Space / Model ID">
                      <InputShell icon={Terminal}>
                        <input
                          value={draft.bg_removal.custom.model_id}
                          onChange={(event) =>
                            updateDraft("bg_removal", (current) => ({
                              ...current,
                              custom: { ...current.custom, model_id: event.target.value },
                            }))
                          }
                          className="w-full bg-transparent py-2 text-sm font-mono font-medium text-on-surface outline-none"
                          placeholder="user/space-name"
                        />
                      </InputShell>
                    </FieldGroup>
                    <FieldGroup label="API 类型">
                      <InputShell icon={Globe}>
                        <input
                          value={draft.bg_removal.custom.api_type}
                          onChange={(event) =>
                            updateDraft("bg_removal", (current) => ({
                              ...current,
                              custom: { ...current.custom, api_type: event.target.value },
                            }))
                          }
                          className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none"
                          placeholder="gradio_space"
                        />
                      </InputShell>
                    </FieldGroup>
                    <FieldGroup label="Payload Template" className="xl:col-span-2" hint="填写原始 JSON 文本，可使用 {{uploaded_path}} 与 {{model_id}} 占位符。">
                      <textarea
                        value={draft.bg_removal.custom.payload_template}
                        onChange={(event) =>
                          updateDraft("bg_removal", (current) => ({
                            ...current,
                            custom: { ...current.custom, payload_template: event.target.value },
                          }))
                        }
                        className="min-h-32 w-full resize-y rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3 font-mono text-[13px] leading-6 text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary focus:ring-4 focus:ring-primary/5"
                        placeholder='{"data":[{"path":"{{uploaded_path}}","meta":{"_type":"gradio.FileData"}}],"fn_index":0}'
                      />
                    </FieldGroup>
                  </div>
                )}

                {renderSecretField("Hugging Face Token（可选）", draft.bg_removal.custom.secret_state, bgRemovalSecret, setBgRemovalSecret)}
                {renderConnectionTestPanel("bg_removal", !desktopReady)}
              </SettingsSection>
            )}

            {activeTab === "launch" && (
              <SettingsSection
                icon={SettingsIcon}
                title="新任务默认值"
                description="按启动策略、放置规则和目标目录分开配置，首页会读取这里的默认值。"
              >
                <div className="rounded-[12px] border border-on-surface/8 bg-surface px-4 py-4">
                  <div className="grid gap-2 md:grid-cols-3">
                    {launchSections.map((section) => {
                      const active = activeLaunchSection === section.id;
                      return (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => setActiveLaunchSection(section.id)}
                          className={cn(
                            "flex min-h-[58px] items-center gap-3 rounded-[8px] border px-3 py-2 text-left transition-colors",
                            active
                              ? "border-primary/28 bg-primary/8 text-primary"
                              : "border-on-surface/8 bg-surface-container-lowest text-on-surface hover:border-primary/18 hover:bg-surface-container-low",
                          )}
                        >
                          <section.icon className="h-4 w-4 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-black">{section.label}</p>
                            <p className="mt-1 truncate text-[11px] font-medium text-ui-muted">{section.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeLaunchSection === "strategy" && (
                  <div className="space-y-4">
                    <div className="rounded-[12px] border border-on-surface/8 bg-surface px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[12px] font-semibold text-primary">{launchTemplate.label}</span>
                        <span className="rounded-full border border-on-surface/8 bg-surface-container-low px-3 py-1 text-[12px] font-medium text-on-surface-variant">{launchStrategyPreview.language_label}</span>
                        <span className="rounded-full border border-on-surface/8 bg-surface-container-low px-3 py-1 text-[12px] font-medium text-on-surface-variant">{launchStrategyPreview.density_label}</span>
                        <span className="rounded-full border border-on-surface/8 bg-surface-container-low px-3 py-1 text-[12px] font-medium text-on-surface-variant">{launchStrategyPreview.prefix_style_label}</span>
                        <span className="rounded-full border border-on-surface/8 bg-surface-container-low px-3 py-1 text-[12px] font-medium text-on-surface-variant">{launchStrategyPreview.caution_level_label}</span>
                      </div>
                    </div>
                    <FieldGroup label="默认模板">
                      <div className="grid gap-2 xl:grid-cols-2">
                        {STRATEGY_TEMPLATES.map((template) => (
                          <StrategyOptionButton
                            key={template.id}
                            active={draft.global_config.LAUNCH_DEFAULT_TEMPLATE_ID === template.id}
                            label={template.label}
                            description={template.description}
                            onClick={() => {
                              const suggested = getSuggestedSelection(template.id);
                              updateGlobal("LAUNCH_DEFAULT_TEMPLATE_ID", template.id);
                              updateGlobal("LAUNCH_DEFAULT_LANGUAGE", suggested.language);
                              updateGlobal("LAUNCH_DEFAULT_DENSITY", suggested.density);
                              updateGlobal("LAUNCH_DEFAULT_PREFIX_STYLE", suggested.prefix_style);
                              updateGlobal("LAUNCH_DEFAULT_CAUTION_LEVEL", suggested.caution_level);
                            }}
                          />
                        ))}
                      </div>
                    </FieldGroup>
                    <div className="grid gap-3 xl:grid-cols-4">
                      {[
                        { label: "目录语言", key: "LAUNCH_DEFAULT_LANGUAGE", options: LANGUAGE_OPTIONS },
                        { label: "分类粒度", key: "LAUNCH_DEFAULT_DENSITY", options: DENSITY_OPTIONS },
                        { label: "目录前缀", key: "LAUNCH_DEFAULT_PREFIX_STYLE", options: PREFIX_STYLE_OPTIONS },
                        { label: "整理方式", key: "LAUNCH_DEFAULT_CAUTION_LEVEL", options: CAUTION_LEVEL_OPTIONS },
                      ].map((group) => (
                        <FieldGroup key={group.key} label={group.label}>
                          <div className="grid gap-1.5">
                            {group.options.map((option) => {
                              const active = draft.global_config[group.key] === option.id;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => updateGlobal(group.key, option.id)}
                                  className={cn(
                                    "rounded-[6px] border px-3 py-2 text-left transition-colors",
                                    active
                                      ? "border-primary/35 bg-primary/[0.06] text-primary"
                                      : "border-on-surface/8 bg-surface-container-lowest text-on-surface hover:border-primary/20",
                                  )}
                                >
                                  <span className="text-[12px] font-black">{option.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </FieldGroup>
                      ))}
                    </div>
                    <FieldGroup label="补充说明">
                      <textarea
                        value={draft.global_config.LAUNCH_DEFAULT_NOTE ?? ""}
                        onChange={(event) => updateGlobal("LAUNCH_DEFAULT_NOTE", event.target.value.slice(0, 200))}
                        className="min-h-24 w-full resize-none rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3 text-[13px] leading-6 text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary focus:ring-4 focus:ring-primary/5"
                        placeholder="例如：拿不准的先放待确认区（Review），课程资料尽量按学期整理。"
                      />
                    </FieldGroup>
                  </div>
                )}

                {activeLaunchSection === "placement" && (
                  <div className="space-y-4">
                    <div className="rounded-[12px] border border-on-surface/8 bg-surface px-4 py-4">
                      <div className="mb-4">
                        <h3 className="text-[13px] font-semibold text-on-surface">默认放置规则</h3>
                        <p className="mt-1 text-[12px] leading-5 text-on-surface-variant/65">
                          这里只定义新任务的默认落点；任务页仍然可以按单次任务覆盖。
                        </p>
                      </div>
                      <div className="grid gap-4 xl:grid-cols-2">
                        <FieldGroup label="默认新目录生成位置" hint="留空时，新结构任务默认使用输出目录；归入已有目录任务默认使用当前任务工作区根。">
                          <InputShell icon={FolderOpen}>
                            <input
                              value={launchDefaultNewDirectoryRoot}
                              onChange={(event) => updateGlobal("LAUNCH_DEFAULT_NEW_DIRECTORY_ROOT", event.target.value)}
                              className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none"
                              placeholder="例如：D:/archive/sorted"
                            />
                          </InputShell>
                        </FieldGroup>
                        <FieldGroup
                          label="默认待确认区（Review）位置"
                          hint={
                            launchReviewFollowsNewRoot
                              ? `当前会自动跟随新目录位置，默认使用 ${launchDerivedReviewRoot}。`
                              : "只在关闭“跟随新目录位置”后单独生效。"
                          }
                        >
                          <InputShell icon={FolderOpen}>
                            <input
                              value={launchDefaultReviewRoot}
                              onChange={(event) => updateGlobal("LAUNCH_DEFAULT_REVIEW_ROOT", event.target.value)}
                              disabled={launchReviewFollowsNewRoot}
                              className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none disabled:opacity-60"
                              placeholder={launchReviewFollowsNewRoot ? launchDerivedReviewRoot : "例如：D:/archive/review"}
                            />
                          </InputShell>
                        </FieldGroup>
                      </div>
                      <div className="mt-4 rounded-[12px] border border-on-surface/8 bg-surface-container-low px-4 py-3.5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-[13px] font-semibold text-on-surface">待确认区跟随新目录位置</h3>
                            <p className="mt-1 text-[12px] leading-5 text-on-surface-variant/65">
                              开启后，Review 默认派生为 `新目录生成位置/Review`。
                            </p>
                          </div>
                          <ToggleSwitch
                            checked={launchReviewFollowsNewRoot}
                            onClick={() => updateGlobal("LAUNCH_REVIEW_FOLLOWS_NEW_ROOT", !launchReviewFollowsNewRoot)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[12px] border border-on-surface/8 bg-surface px-4 py-3.5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-[13px] font-semibold text-on-surface">直接使用默认值启动</h3>
                          <p className="mt-1 text-[12px] leading-5 text-on-surface-variant/65">开启后，首页点击开始时直接进入任务。</p>
                        </div>
                        <ToggleSwitch checked={Boolean(draft.global_config.LAUNCH_SKIP_STRATEGY_PROMPT)} onClick={() => updateGlobal("LAUNCH_SKIP_STRATEGY_PROMPT", !draft.global_config.LAUNCH_SKIP_STRATEGY_PROMPT)} />
                      </div>
                    </div>
                  </div>
                )}

                {activeLaunchSection === "targets" && (
                  <div className="rounded-[12px] border border-on-surface/8 bg-surface px-4 py-4">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[13px] font-semibold text-on-surface">目标目录配置</h3>
                        <p className="mt-1 text-[12px] leading-5 text-on-surface-variant/65">
                          “归入已有目录”会使用这里保存的目录。可以直接把文件夹拖到对应配置里添加。
                        </p>
                      </div>
                      {targetProfilesLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                    </div>
                    <div className="mb-4 space-y-3">
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                        <div ref={targetProfileSelectorRef} className="relative">
                          <button
                            type="button"
                            onClick={() => setTargetProfileSelectorOpen((current) => !current)}
                            disabled={targetProfilesLoading || targetProfiles.length === 0}
                            className={cn(
                              "flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[10px] border px-4 py-2.5 text-left transition-colors",
                              targetProfileSelectorOpen
                                ? "border-primary/35 bg-primary/[0.05]"
                                : "border-on-surface/8 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low",
                              (targetProfilesLoading || targetProfiles.length === 0) && "cursor-not-allowed opacity-60",
                            )}
                            aria-expanded={targetProfileSelectorOpen}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-primary/14 bg-primary/8 text-primary">
                                <FolderOpen className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-black text-on-surface">{selectedTargetProfileName}</div>
                                <div className="mt-0.5 text-[11px] font-medium text-ui-muted/65">
                                  {targetProfiles.length ? `${selectedTargetDirectoryCount} 个目录 · 共 ${targetProfiles.length} 个配置` : "还没有可用配置"}
                                </div>
                              </div>
                            </div>
                            <ChevronDown className={cn("h-4 w-4 shrink-0 text-ui-muted transition-transform", targetProfileSelectorOpen && "rotate-180 text-primary")} />
                          </button>

                          <div
                            className={cn(
                              "absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-[10px] border border-on-surface/10 bg-surface-container-lowest shadow-xl shadow-black/20 transition-[opacity,transform,max-height]",
                              targetProfileSelectorOpen ? "max-h-[280px] translate-y-0 opacity-100" : "pointer-events-none max-h-0 -translate-y-1 opacity-0",
                            )}
                          >
                            <div className="max-h-[280px] overflow-y-auto p-1.5 scrollbar-thin">
                              {targetProfiles.map((profile) => {
                                const profileDraft = targetProfileDrafts[profile.profile_id];
                                const directoryCount = profileDraft?.directories.length ?? profile.directories.length;
                                const selected = selectedTargetProfile?.profile_id === profile.profile_id;
                                return (
                                  <div
                                    key={profile.profile_id}
                                    className={cn(
                                      "group flex items-center justify-between gap-1 rounded-[8px] px-1 py-1 transition-colors",
                                      selected ? "bg-primary/10" : "hover:bg-on-surface/[0.04]"
                                    )}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTargetProfileId(profile.profile_id);
                                        setTargetProfileSelectorOpen(false);
                                      }}
                                      className="flex-1 min-w-0 px-2 py-1.5 text-left"
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className="truncate text-[12.5px] font-black">{profileDraft?.name || profile.name}</div>
                                        {selected ? <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" /> : null}
                                      </div>
                                      <div className="mt-0.5 text-[10.5px] font-medium text-ui-muted/65">{directoryCount} 个目录</div>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPendingDeleteTargetProfileId(profile.profile_id);
                                      }}
                                      className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md text-on-surface/20 hover:bg-error/10 hover:text-error transition-all"
                                      title="删除配置"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setCreatingTargetProfile((current) => !current)}
                          disabled={targetProfilesLoading}
                          className="min-h-[52px] px-5"
                        >
                          <FolderPlus className="mr-2 h-4 w-4" />
                          新建配置
                        </Button>
                      </div>

                      <AnimatePresence initial={false}>
                        {creatingTargetProfile && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="grid gap-2 rounded-[10px] border border-primary/14 bg-primary/[0.035] p-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                              <InputShell icon={FolderPlus}>
                                <input
                                  value={newTargetProfileName}
                                  onChange={(event) => setNewTargetProfileName(event.target.value)}
                                  className="w-full bg-transparent py-2 text-sm font-semibold text-on-surface outline-none"
                                  placeholder="例如：下载目录的归档"
                                  autoFocus
                                />
                              </InputShell>
                              <Button type="button" variant="secondary" onClick={() => setCreatingTargetProfile(false)} disabled={targetProfilesLoading}>
                                取消
                              </Button>
                              <Button type="button" onClick={() => void createTargetProfile()} disabled={targetProfilesLoading || !newTargetProfileName.trim()}>
                                创建并切换
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="grid gap-3">
                      {selectedTargetProfile ? (() => {
                        const profile = selectedTargetProfile;
                        const profileDraft = targetProfileDrafts[profile.profile_id] ?? {
                          name: profile.name,
                          directories: profile.directories,
                          newPath: "",
                          newLabel: "",
                        };
                        const dragActive = dragTargetProfileId === profile.profile_id;
                        return (
                          <div
                            key={profile.profile_id}
                            ref={(element) => {
                              targetDropZoneRefs.current[profile.profile_id] = element;
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              setDragTargetProfileId(profile.profile_id);
                            }}
                            onDragLeave={() => setDragTargetProfileId((current) => (current === profile.profile_id ? null : current))}
                            onDrop={(event) => {
                              event.preventDefault();
                              setDragTargetProfileId(null);
                              addDirectoriesToTargetProfile(profile.profile_id, extractDroppedPaths(event));
                            }}
                            className={cn(
                              "rounded-[12px] border px-4 py-3 transition-colors",
                              dragActive
                                ? "border-primary/45 bg-primary/[0.06]"
                                : "border-on-surface/8 bg-surface-container-lowest",
                            )}
                          >
                            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                              <FieldGroup label="当前配置名称">
                                <input
                                  value={profileDraft.name}
                                  onChange={(event) => updateTargetProfileDraft(profile.profile_id, (current) => ({ ...current, name: event.target.value }))}
                                  className="h-10 w-full rounded-[8px] border border-on-surface/8 bg-surface px-3 text-[13px] font-semibold text-on-surface outline-none focus:border-primary/40"
                                  placeholder="配置名称"
                                />
                              </FieldGroup>
                              <div className="flex items-end gap-2">
                                <Button type="button" variant="ghost" onClick={() => void deleteTargetProfile(profile.profile_id)} disabled={targetProfilesLoading}>
                                  删除配置
                                </Button>
                              </div>
                            </div>
                            <div className="mt-3 rounded-[8px] border border-dashed border-on-surface/10 bg-surface px-3 py-2 text-[11px] font-semibold text-ui-muted">
                              拖入文件夹即可加入此配置
                            </div>
                            <div className="mt-3 grid gap-2">
                              {profileDraft.directories.length ? profileDraft.directories.map((directory) => (
                                <div key={directory.path} className="flex items-center justify-between gap-3 rounded-[8px] border border-on-surface/8 bg-surface px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-[12.5px] font-bold text-on-surface">{directory.label || directory.path.split(/[\\/]/).pop() || directory.path}</div>
                                    <div className="truncate font-mono text-[10.5px] text-ui-muted/60" title={directory.path}>{directory.path}</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeDirectoryFromTargetProfile(profile.profile_id, directory.path)}
                                    disabled={targetProfilesLoading}
                                    className="rounded-[6px] px-2 py-1 text-[11px] font-bold text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                                  >
                                    移除
                                  </button>
                                </div>
                              )) : (
                                <div className="rounded-[8px] border border-dashed border-on-surface/10 bg-surface px-3 py-3 text-[12px] font-medium text-ui-muted">
                                  这个配置还没有目录。
                                </div>
                              )}
                            </div>
                            <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(0,1fr)_180px_auto]">
                              <input
                                value={profileDraft.newPath}
                                onChange={(event) => updateTargetProfileDraft(profile.profile_id, (current) => ({ ...current, newPath: event.target.value }))}
                                className="h-9 rounded-[8px] border border-on-surface/8 bg-surface px-3 font-mono text-[12px] text-on-surface outline-none focus:border-primary/40"
                                placeholder="目标目录完整路径，例如 D:/archive/docs"
                              />
                              <input
                                value={profileDraft.newLabel}
                                onChange={(event) => updateTargetProfileDraft(profile.profile_id, (current) => ({ ...current, newLabel: event.target.value }))}
                                className="h-9 rounded-[8px] border border-on-surface/8 bg-surface px-3 text-[12px] text-on-surface outline-none focus:border-primary/40"
                                placeholder="标签（可选）"
                              />
                              <Button type="button" variant="secondary" onClick={() => addDirectoryToTargetProfile(profile.profile_id)} disabled={targetProfilesLoading || !profileDraft.newPath.trim()}>
                                添加目录
                              </Button>
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="rounded-[12px] border border-dashed border-on-surface/10 bg-surface-container-lowest px-4 py-6 text-center text-[13px] font-medium text-ui-muted">
                          还没有目标目录配置。新建一个配置后，在启动页选择“归入现有目录”即可复用。
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </SettingsSection>
            )}

            {activeTab === "system" && (
              <SettingsSection
                icon={ShieldCheck}
                title="运行与日志"
                description="只保留常用的运行和日志开关，避免把这里变成调试控制台。"
              >
                <div className="rounded-[12px] border border-on-surface/8 bg-surface px-4 py-4">
                  <div className="mb-4">
                    <h3 className="text-[13px] font-semibold text-on-surface">日志输出路径</h3>
                    <p className="mt-1 text-[12px] leading-5 text-on-surface-variant/65">
                      运行日志始终会写入以下目录。开启“详细日志”后，还会额外输出调试明细。
                    </p>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {[
                      {
                        label: "运行日志",
                        path: snapshot?.runtime.log_paths.runtime_log || "",
                      },
                      {
                        label: "调试日志",
                        path: snapshot?.runtime.log_paths.debug_log || "",
                      },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-black uppercase tracking-[0.15em] text-ui-muted">{item.label}</span>
                          <button
                            type="button"
                            onClick={() => copyTextToClipboard(item.path, setSuccess, setError)}
                            className="inline-flex items-center gap-1 rounded-[6px] border border-on-surface/8 bg-surface px-2.5 py-1 text-[11px] font-bold text-on-surface transition-colors hover:border-primary/20 hover:text-primary"
                          >
                            <ClipboardCopy className="h-3 w-3" />
                            复制
                          </button>
                        </div>
                        <div className="mt-2 break-all font-mono text-[12px] leading-5 text-on-surface/70">
                          {item.path || "尚未生成"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[12px] border border-on-surface/8 bg-surface px-4 py-3.5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-[13px] font-semibold text-on-surface">详细日志</h3>
                      <p className="mt-1 text-[12px] leading-5 text-on-surface-variant/65">关闭时保留基础运行日志；开启后会额外输出更详细的调试记录。</p>
                    </div>
                    <ToggleSwitch checked={Boolean(draft.global_config.DEBUG_MODE)} onClick={() => updateGlobal("DEBUG_MODE", !draft.global_config.DEBUG_MODE)} />
                  </div>
                </div>
              </SettingsSection>
            )}
          </motion.div>

          <AnimatePresence>
            {isDirty && (
              <motion.div
                initial={{ y: 20, opacity: 0, x: "-50%" }}
                animate={{ y: 0, opacity: 1, x: "-50%" }}
                exit={{ y: 20, opacity: 0, x: "-50%" }}
                className={cn(
                  "fixed bottom-8 z-50 flex items-center gap-3 rounded-[12px] border border-primary/30 bg-surface/90 px-4 py-3 backdrop-blur-xl",
                  isCompactLayout ? "left-1/2" : "left-[calc(50%+130px)] 2xl:left-[calc(50%+150px)]",
                )}
              >
                <div className="mr-4 flex flex-col">
                  <span className="text-[11px] font-black uppercase tracking-wider text-primary">设置已修改</span>
                  <span className="text-[10px] font-medium text-on-surface/40">保存后生效至全局</span>
                </div>
                <div className="h-8 w-px bg-primary/10" />
                <Button variant="secondary" onClick={discardChanges} disabled={saving} className="h-9 px-4 text-[12.5px] font-bold">
                  放弃修改
                </Button>
                <Button onClick={() => void handleSave()} loading={saving} disabled={saving} className="h-9 px-5 text-[12.5px] font-bold border border-primary/20 bg-primary active:bg-primary-dim">
                  保存全部配置
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>切换设置分类</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {categories.map((cat) => {
              const active = activeTab === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectTab(cat.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-[8px] border px-4 py-3 text-left transition-colors",
                    active
                      ? "border-primary/20 bg-primary/8 text-primary"
                      : "border-on-surface/8 bg-surface hover:border-primary/16 hover:bg-surface-container-low",
                  )}
                >
                  <cat.icon className="h-4.5 w-4.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-black">{cat.label}</p>
                    <p className="mt-1 text-[11px] font-medium text-ui-muted">{cat.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(createPresetDialog)}
        title={
          createPresetDialog?.family === "text"
            ? "新建文本预设"
            : createPresetDialog?.family === "vision"
              ? "新建图片理解预设"
              : "新建图标生图预设"
        }
        description="输入一个清晰的预设名称。创建后会基于当前草稿生成新的激活预设。"
        confirmLabel="创建并切换"
        cancelLabel="取消"
        loading={loading}
        onConfirm={async () => {
          if (!createPresetDialog?.value.trim()) {
            setError("请输入预设名称");
            return;
          }
           const dialog = createPresetDialog;
          setCreatePresetDialog(null);
          await performCreatePreset(dialog.family, dialog.value);
        }}
        onCancel={() => setCreatePresetDialog(null)}
      >
        <div className="space-y-2">
          <label className="text-[12px] font-semibold text-on-surface-variant/70">预设名称</label>
          <input
            autoFocus
            value={createPresetDialog?.value ?? ""}
            onChange={(event) => setCreatePresetDialog((current) => (current ? { ...current, value: event.target.value } : current))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && createPresetDialog?.value.trim()) {
                void (async () => {
                   const dialog = createPresetDialog;
                  if (!dialog) {
                    return;
                  }
                  setCreatePresetDialog(null);
                  await performCreatePreset(dialog.family, dialog.value);
                })();
              }
            }}
            className="w-full rounded-[10px] border border-on-surface/8 bg-surface-container-lowest px-4 py-3 text-[14px] font-semibold text-on-surface outline-none transition-all placeholder:text-on-surface-variant/35 focus:border-primary focus:ring-4 focus:ring-primary/5"
            placeholder="例如：Tongyi 生图备用"
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deletePresetDialog)}
        title="删除预设"
        description={deletePresetDialog ? `确定删除“${deletePresetDialog.presetName}”吗？删除后不能恢复。` : ""}
        confirmLabel="确认删除"
        cancelLabel="取消"
        tone="danger"
        loading={loading}
        onConfirm={async () => {
          if (!deletePresetDialog) {
            return;
          }
           const dialog = deletePresetDialog;
          setDeletePresetDialog(null);
          await performDeletePreset(dialog.family, dialog.presetId);
        }}
        onCancel={() => setDeletePresetDialog(null)}
      />

      <ConfirmDialog
        open={Boolean(switchPresetDialog)}
        title="切换预设并放弃草稿？"
        description="当前页面有未保存修改。继续切换会丢失这批草稿内容。"
        confirmLabel="放弃并切换"
        cancelLabel="继续编辑"
        loading={loading}
        onConfirm={async () => {
          if (!switchPresetDialog) {
            return;
          }
           const dialog = switchPresetDialog;
          setSwitchPresetDialog(null);
          await performActivatePreset(dialog.family, dialog.presetId);
        }}
        onCancel={() => setSwitchPresetDialog(null)}
      />
      <ConfirmDialog
        open={Boolean(pendingDeleteTargetProfileId)}
        title="删除目标配置"
        description="确定要删除这个目标目录配置吗？删除后将无法通过此配置快速归档文件。"
        confirmLabel="确认删除"
        cancelLabel="取消"
        tone="danger"
        loading={targetProfilesLoading}
        onConfirm={async () => {
          if (!pendingDeleteTargetProfileId) return;
          const id = pendingDeleteTargetProfileId;
          setPendingDeleteTargetProfileId(null);
          await deleteTargetProfile(id);
        }}
        onCancel={() => setPendingDeleteTargetProfileId(null)}
      />
    </div>
  );
}
