import { describe, expect, it } from "vitest";

import {
  UserFacingError,
  createUserFacingRequestError,
  getUserFacingErrorCode,
  localizeSessionLastError,
  localizeUserFacingError,
} from "./user-facing-copy";

describe("user-facing copy helpers", () => {
  it("maps API not-found errors to readable Chinese copy", () => {
    const error = createUserFacingRequestError(404, "Not Found", JSON.stringify({ detail: "SESSION_NOT_FOUND" }));

    expect(error.message).toBe("这条任务记录已不存在或已被删除。");
    expect(getUserFacingErrorCode(error)).toBe("SESSION_NOT_FOUND");
  });

  it("maps network failures to a backend connection hint", () => {
    expect(localizeUserFacingError(new TypeError("Failed to fetch"), "fallback")).toBe(
      "暂时无法连接本地服务，请确认 FilePilot 后台仍在运行。",
    );
  });

  it("humanizes known session last_error values", () => {
    expect(localizeSessionLastError("scanning_interrupted")).toBe("扫描过程中已中断，请重新扫描后再继续。");
    expect(localizeSessionLastError("missing_execution_journal")).toBe("没有找到这次整理的执行记录。");
  });

  it("falls back conservatively for unknown session issues", () => {
    expect(localizeSessionLastError("unexpected_code")).toBe("任务处理中断，请重新扫描后再继续。");
  });

  it("keeps explicit user-facing error messages", () => {
    const error = new UserFacingError("当前任务状态已变化，请刷新后重试。", { code: "SESSION_STAGE_CONFLICT", status: 409 });

    expect(localizeUserFacingError(error, "fallback")).toBe("当前任务状态已变化，请刷新后重试。");
  });
});
