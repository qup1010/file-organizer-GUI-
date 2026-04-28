export class UserFacingError extends Error {
  code?: string;
  status?: number;
  rawMessage?: string;

  constructor(message: string, options?: { code?: string; status?: number; rawMessage?: string }) {
    super(message);
    this.name = "UserFacingError";
    this.code = options?.code;
    this.status = options?.status;
    this.rawMessage = options?.rawMessage;
  }
}

function parseErrorPayload(errorText: string): { detail?: string; message?: string } | null {
  const trimmed = String(errorText || "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      return { detail: parsed };
    }
    if (parsed && typeof parsed === "object") {
      const detail = typeof parsed.detail === "string" ? parsed.detail : undefined;
      const message = typeof parsed.message === "string" ? parsed.message : undefined;
      return { detail, message };
    }
  } catch {
    return { detail: trimmed };
  }
  return null;
}

function requestErrorMessage(status: number, detail?: string): string {
  const normalizedDetail = String(detail || "").trim().toUpperCase();
  if (normalizedDetail === "SESSION_NOT_FOUND") {
    return "这条任务记录已不存在或已被删除。";
  }
  if (normalizedDetail === "SESSION_STAGE_CONFLICT") {
    return "当前任务状态已变化，请刷新后重试。";
  }
  if (normalizedDetail === "SESSION_LOCKED") {
    return "当前任务正在被其他操作占用，请稍后再试。";
  }
  if (normalizedDetail === "CONFIRMATION_REQUIRED") {
    return "请先确认当前操作，再继续执行。";
  }

  if (status === 401 || status === 403) {
    return "当前连接已失效，请重新启动应用后再试。";
  }
  if (status === 404) {
    return "这条任务记录已不存在或已被删除。";
  }
  if (status === 409) {
    return "当前任务状态已变化，请刷新后重试。";
  }
  if (status >= 500) {
    return "本地服务处理请求时出错，请稍后再试。";
  }
  if (status >= 400) {
    return "当前请求暂时无法完成，请刷新后重试。";
  }
  return "操作失败，请稍后再试。";
}

export function createUserFacingRequestError(status: number, statusText: string, errorText: string): UserFacingError {
  const payload = parseErrorPayload(errorText);
  const detail = payload?.detail || payload?.message || "";
  const rawMessage = `Request failed (${status} ${statusText}): ${errorText}`;
  return new UserFacingError(requestErrorMessage(status, detail), {
    code: detail || undefined,
    status,
    rawMessage,
  });
}

export function localizeSessionLastError(lastError: string | null | undefined, fallback = "任务处理中断，请重新扫描后再继续。"): string {
  const normalized = String(lastError || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "scanning_interrupted") {
    return "扫描过程中已中断，请重新扫描后再继续。";
  }
  if (normalized === "missing_execution_journal") {
    return "没有找到这次整理的执行记录。";
  }
  if (normalized === "directory_changed") {
    return "目录内容已变化，请重新扫描后再继续。";
  }
  return fallback;
}

export function localizeUserFacingError(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) {
    return error.message || fallback;
  }
  if (error instanceof TypeError) {
    return "暂时无法连接本地服务，请确认 FilePilot 后台仍在运行。";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function getUserFacingErrorCode(error: unknown): string | null {
  if (error instanceof UserFacingError && error.code) {
    return error.code;
  }
  return null;
}

