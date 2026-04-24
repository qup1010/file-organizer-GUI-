"use client";

import React, { ReactNode } from "react";
import { PageTransition } from "@/components/page-transition";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

// ... (existing imports)
import Link from "next/link";
import { LayoutGrid, History, ChevronRight, Settings, Palette, Sun, Moon, Monitor } from "lucide-react";
import { WindowControls } from "./ui/window-controls";
import { GlobalTaskIndicator } from "./global-task-indicator";
import { useTheme } from "@/lib/theme";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const WORKSPACE_CONTEXT_KEY = "workspace_header_context";
const SETTINGS_CONTEXT_KEY = "settings_header_context";
const HISTORY_CONTEXT_KEY = "history_header_context";
const ICONS_CONTEXT_KEY = "icons_header_context";
const APP_CONTEXT_EVENT = "file-organizer-context-change";
const ACTIVE_WORKSPACE_ROUTE_KEY = "workspace_active_route";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function readStoredContext(key: string) {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as {
      title?: string;
      detail?: string;
      dirName?: string;
      stage?: string;
      sessionId?: string;
      hasTargetPath?: boolean;
    };
  } catch {
    return null;
  }
}

function getWorkspaceLoadingLabel() {
  return {
    title: "当前任务",
    detail: "正在载入任务",
  };
}

function getBaseModuleLabel(pathname: string, searchParams: URLSearchParams) {
  if (pathname === "/history") {
    return {
      title: "整理历史",
      detail: "会话与执行档案",
    };
  }
  if (pathname === "/settings") {
    return {
      title: "设置",
      detail: "模型配置",
    };
  }
  if (pathname === "/icons") {
    return {
      title: "图标工坊",
      detail: "选择目标文件夹并生成图标",
    };
  }
  if (pathname.startsWith("/workspace")) {
    const dirParam = searchParams.get("dir");
    const sessionId = searchParams.get("session_id");
    if (sessionId && !dirParam) {
      return getWorkspaceLoadingLabel();
    }
    const dirName = dirParam
      ? decodeURIComponent(dirParam).replace(/[\\/]$/, "").split(/[\\/]/).pop() || "当前任务"
      : "当前任务";
    return {
      title: dirName,
      detail: "当前整理任务",
    };
  }
  return { title: "开始整理", detail: "选择目录并开始新的整理任务" };
}

function getStoredModuleLabel(pathname: string, searchParams: URLSearchParams) {
  if (pathname === "/history") {
    const stored = readStoredContext(HISTORY_CONTEXT_KEY);
    return {
      title: "整理历史",
      detail: stored?.detail || "会话与执行档案",
    };
  }
  if (pathname === "/settings") {
    const stored = readStoredContext(SETTINGS_CONTEXT_KEY);
    return {
      title: "设置",
      detail: stored?.detail || "模型配置",
    };
  }
  if (pathname === "/icons") {
    const stored = readStoredContext(ICONS_CONTEXT_KEY);
    return {
      title: "图标工坊",
      detail: stored?.detail || "选择目标文件夹并生成图标",
    };
  }
  if (pathname.startsWith("/workspace")) {
    const stored = readStoredContext(WORKSPACE_CONTEXT_KEY);
    const dirParam = searchParams.get("dir");
    const sessionId = searchParams.get("session_id");
    if (dirParam) {
      const dirName = decodeURIComponent(dirParam).replace(/[\\/]$/, "").split(/[\\/]/).pop() || "当前任务";
      return {
        title: dirName,
        detail: stored?.stage || "当前整理任务",
      };
    }
    if (sessionId) {
      if (stored?.sessionId === sessionId && stored?.hasTargetPath && stored?.dirName) {
        return {
          title: stored.dirName,
          detail: stored.stage || "当前整理任务",
        };
      }
      return getWorkspaceLoadingLabel();
    }
    return {
      title: stored?.dirName || "当前任务",
      detail: stored?.stage || "当前整理任务",
    };
  }
  return { title: "开始整理", detail: "选择目录并开始新的整理任务" };
}

function getWorkspaceRoute(pathname: string, searchParams: URLSearchParams) {
  if (pathname.startsWith("/workspace")) {
    const query = searchParams.toString();
    return query ? `/workspace?${query}` : "/workspace";
  }
  if (typeof window === "undefined") {
    return "/";
  }
  return window.localStorage.getItem(ACTIVE_WORKSPACE_ROUTE_KEY) || "/";
}

function ThemeToggle() {
  const { mode, setMode } = useTheme();

  const cycle = () => {
    const next = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    setMode(next);
  };

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const label = mode === "light" ? "浅色" : mode === "dark" ? "深色" : "跟随系统";

  return (
    <button
      type="button"
      onClick={cycle}
      title={`当前：${label}，点击切换`}
      className="flex h-7 w-7 items-center justify-center rounded-[4px] text-on-surface-variant/50 transition-colors hover:bg-on-surface/5 hover:text-on-surface active:scale-90"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [moduleCopy, setModuleCopy] = React.useState(() => getBaseModuleLabel(pathname, searchParams));
  const [workspaceRoute, setWorkspaceRoute] = React.useState("/");

  React.useEffect(() => {
    setIsHydrated(true);
  }, []);

  React.useEffect(() => {
    setModuleCopy(getBaseModuleLabel(pathname, searchParams));
    setWorkspaceRoute(isHydrated ? getWorkspaceRoute(pathname, searchParams) : "/");
  }, [isHydrated, pathname, searchParams]);

  React.useEffect(() => {
    if (!isHydrated) {
      return;
    }
    setWorkspaceRoute(getWorkspaceRoute(pathname, searchParams));
  }, [pathname, searchParams]);

  React.useEffect(() => {
    const syncModuleCopy = () => {
      setModuleCopy(getStoredModuleLabel(pathname, searchParams));
      setWorkspaceRoute(getWorkspaceRoute(pathname, searchParams));
    };

    if (!isHydrated) {
      return;
    }

    syncModuleCopy();

    const handleContextChange = () => {
      syncModuleCopy();
    };

    window.addEventListener(APP_CONTEXT_EVENT, handleContextChange);
    return () => {
      window.removeEventListener(APP_CONTEXT_EVENT, handleContextChange);
    };
  }, [isHydrated, pathname, searchParams]);

  const navItems = [
    { href: workspaceRoute, icon: LayoutGrid, label: workspaceRoute === "/" ? "开始整理" : "当前任务" },
    { href: "/history", icon: History, label: "整理历史" },
    { href: "/icons", icon: Palette, label: "图标工坊" },
    { href: "/settings", icon: Settings, label: "设置" },
  ];

  const isNavActive = (href: string) => {
    if (href === "/" || href.startsWith("/workspace")) {
      return pathname === "/" || pathname.startsWith("/workspace");
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-on-surface font-sans">
      <div className="premium-bg" aria-hidden="true" />
      <header 
        data-tauri-drag-region
        className="z-50 grid h-[40px] shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center border-b border-on-surface/5 bg-surface-container-lowest px-2 backdrop-blur sm:px-3"
      >
        <div className="flex shrink-0 items-center gap-2 pr-3 select-none">
           <div className="flex h-5.5 w-5.5 items-center justify-center rounded-[6px] bg-primary/10 ring-1 ring-primary/20">
              <img src="/app-icon.png" alt="FilePilot" className="h-[14px] w-[14px] object-contain" />
           </div>
           
           <div className="flex items-center tracking-[-0.03em] pointer-events-none">
              <span className="text-[13px] font-black text-on-surface">File</span>
              <span className="text-[13px] font-black text-primary ml-0.5">Pilot</span>
           </div>
           
           <div className="ml-3 h-3.5 w-[1.5px] bg-on-surface/10 rounded-full" />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 border-none px-1 overflow-hidden pointer-events-none">
          <p className="truncate text-ui-h2 text-on-surface/85">
            {moduleCopy.title}
          </p>
          <span className="text-ui-meta leading-none opacity-20 select-none mt-0.5">/</span>
          <p className="truncate text-ui-meta font-bold">
            {moduleCopy.detail}
          </p>
        </div>

        <div className="flex items-center justify-end gap-1 sm:gap-2">
          <nav className="flex items-center rounded-lg bg-on-surface/[0.03] p-1 ring-1 ring-black/[0.02]">
            {navItems.map((item) => {
              const isActive = isNavActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative inline-flex items-center gap-2 rounded-[6px] px-3 py-1.5 text-[11.5px] font-black tracking-tight transition-all duration-300",
                    isActive
                      ? "bg-surface-container-lowest text-on-surface ring-1 ring-black/[0.03]"
                      : "text-on-surface/40 hover:bg-on-surface/5 hover:text-on-surface border border-transparent hover:border-on-surface/8",
                  )}
                >
                  <item.icon className={cn("h-3.5 w-3.5", isActive ? "text-primary" : "text-current")} />
                  <span className="hidden lg:inline">{item.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-active-glow"
                      className="absolute inset-0 rounded-[6px] bg-primary/[0.03] ring-1 ring-primary/10"
                      initial={false}
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <ThemeToggle />
          <WindowControls />
        </div>
      </header>
      <GlobalTaskIndicator />

      <main className="relative flex flex-1 flex-col overflow-hidden">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
