import type { RuntimeConfig } from "@/types/session";

declare global {
  interface Window {
    __FILE_ORGANIZER_RUNTIME__?: RuntimeConfig;
    __TAURI_INTERNALS__?: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    };
  }
}

const DEFAULT_BASE_URL = "http://127.0.0.1:8765";
const RUNTIME_READY_EVENT = "file-organizer-runtime-ready";

function hasInjectedDesktopRuntime(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      window.__FILE_ORGANIZER_RUNTIME__?.base_url?.trim(),
  );
}

export function readRuntimeConfig(): RuntimeConfig {
  if (typeof window !== "undefined" && window.__FILE_ORGANIZER_RUNTIME__) {
    return window.__FILE_ORGANIZER_RUNTIME__;
  }

  return {
    base_url:
      process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || DEFAULT_BASE_URL,
  };
}

export function getApiBaseUrl(): string {
  const baseUrl = readRuntimeConfig().base_url?.trim() || DEFAULT_BASE_URL;
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

export function getApiToken(): string {
  return readRuntimeConfig().api_token?.trim() || "";
}

export function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__?.invoke;
}

export async function waitForRuntimeConfig(
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<RuntimeConfig> {
  if (!isTauriDesktop() || hasInjectedDesktopRuntime()) {
    return readRuntimeConfig();
  }

  await new Promise<void>((resolve) => {
    const deadline = Date.now() + timeoutMs;
    let timer: number | null = null;

    const cleanup = () => {
      window.removeEventListener(RUNTIME_READY_EVENT, onReady);
      if (timer !== null) {
        window.clearInterval(timer);
      }
    };

    const onReady = () => {
      cleanup();
      resolve();
    };

    window.addEventListener(RUNTIME_READY_EVENT, onReady, { once: true });
    timer = window.setInterval(() => {
      if (hasInjectedDesktopRuntime() || Date.now() >= deadline) {
        cleanup();
        resolve();
      }
    }, intervalMs);
  });

  return readRuntimeConfig();
}

export async function invokeTauriCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  if (!isTauriDesktop()) {
    return null;
  }
  return window.__TAURI_INTERNALS__!.invoke<T>(command, args);
}

export async function pickDirectoryWithTauri(): Promise<string | null> {
  return invokeTauriCommand<string | null>("pick_directory");
}

export async function pickDirectoriesWithTauri(): Promise<string[] | null> {
  return invokeTauriCommand<string[] | null>("pick_directories");
}

export async function openDirectoryWithTauri(path: string): Promise<void> {
  await invokeTauriCommand<void>("open_directory", { path });
}

export async function saveFileAsTauri(sourcePath: string, filename: string): Promise<boolean> {
  const result = await invokeTauriCommand<boolean>("save_file_as", { sourcePath, filename });
  return result ?? false;
}
