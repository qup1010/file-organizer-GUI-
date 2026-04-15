export type SessionStage =
  | "idle"
  | "draft"
  | "scanning"
  | "planning"
  | "ready_for_precheck"
  | "ready_to_execute"
  | "executing"
  | "completed"
  | "rolling_back"
  | "abandoned"
  | "stale"
  | "interrupted";

export type StreamStatus = "connecting" | "connected" | "reconnecting" | "offline";
export type AssistantRuntimePhase = "scan" | "plan";
export type AssistantRuntimeMode = "waiting" | "tool" | "streaming";

export type StrategyTemplateId =
  | "general_downloads"
  | "project_workspace"
  | "study_materials"
  | "office_admin"
  | "personal_archive"
  | "media_assets";

export type StrategyLanguage = "zh" | "en";
export type StrategyDensity = "normal" | "minimal";
export type StrategyPrefixStyle = "none" | "numeric" | "category";

export type StrategyCautionLevel = "conservative" | "balanced";

export interface SessionStrategySelection {
  template_id: StrategyTemplateId;
  language: StrategyLanguage;
  density: StrategyDensity;
  prefix_style: StrategyPrefixStyle;
  caution_level: StrategyCautionLevel;
  note: string;
}

export interface SessionStrategySummary extends SessionStrategySelection {
  template_label: string;
  template_description?: string;
  language_label: string;
  density_label: string;
  prefix_style_label: string;
  caution_level_label: string;
  preview_directories?: string[];
}

export interface LaunchStrategyConfig {
  LAUNCH_DEFAULT_TEMPLATE_ID?: StrategyTemplateId;
  LAUNCH_DEFAULT_LANGUAGE?: StrategyLanguage;
  LAUNCH_DEFAULT_DENSITY?: StrategyDensity;
  LAUNCH_DEFAULT_PREFIX_STYLE?: StrategyPrefixStyle;
  LAUNCH_DEFAULT_CAUTION_LEVEL?: StrategyCautionLevel;
  LAUNCH_DEFAULT_NOTE?: string;
  LAUNCH_SKIP_STRATEGY_PROMPT?: boolean;
}

export interface RecentAnalysisItem {
  item_id: string;
  display_name: string;
  source_relpath: string;
  suggested_purpose: string;
  summary: string;
}

export interface ScannerProgress {
  status?: string;
  processed_count?: number;
  total_count?: number;
  current_item?: string | null;
  recent_analysis_items?: RecentAnalysisItem[];
  batch_count?: number;
  completed_batches?: number;
  message?: string;
  is_retrying?: boolean;
  ai_thinking?: boolean;
}

export type PlannerProgressStatus = "idle" | "running" | "completed" | "failed" | string;
export type PlannerProgressPhase =
  | "waiting_model"
  | "streaming_reply"
  | "validating"
  | "retrying"
  | "repairing"
  | "applying"
  | null
  | string;

export interface PlannerProgress {
  status?: PlannerProgressStatus;
  phase?: PlannerProgressPhase;
  message?: string;
  detail?: string | null;
  attempt?: number;
  started_at?: string | null;
  updated_at?: string | null;
  last_completed_at?: string | null;
  preserving_previous_plan?: boolean;
}

export interface PlanItem {
  item_id: string;
  display_name: string;
  source_relpath: string;
  target_relpath: string | null;
  suggested_purpose?: string;
  content_summary?: string;
  reason?: string;
  confidence?: number | null;
  status: "planned" | "unresolved" | "review" | "invalidated" | string;
}

export interface PlanGroup {
  directory: string;
  count: number;
  items: PlanItem[];
}

export interface PlanSnapshot {
  summary: string;
  items: PlanItem[];
  groups: PlanGroup[];
  display_plan?: any;
  unresolved_items: string[];
  review_items: PlanItem[];
  invalidated_items: PlanItem[];
  change_highlights: string[];
  stats: {
    directory_count: number;
    move_count: number;
    unresolved_count: number;
  };
  readiness: {
    can_precheck: boolean;
  };
}

export interface PrecheckMovePreview {
  item_id: string;
  source: string;
  target: string;
}

export interface PrecheckIssue {
  id: string;
  severity: "blocking" | "warning" | "review";
  issue_type: string;
  message: string;
  related_item_ids: string[];
}

export interface PrecheckSummary {
  can_execute: boolean;
  blocking_errors: string[];
  warnings: string[];
  mkdir_preview: string[];
  move_preview: PrecheckMovePreview[];
  issues: PrecheckIssue[];
}

export interface ExecutionReport {
  execution_id: string | null;
  journal_id: string | null;
  success_count: number;
  failure_count: number;
  status: "success" | "partial_failure" | "aborted" | string;
  has_cleanup_candidates: boolean;
  cleanup_candidate_count: number;
}

export interface RollbackReport {
  journal_id: string;
  restored_from_execution_id: string;
  success_count: number;
  failure_count: number;
  status: "success" | "partial_failure" | "aborted" | string;
}

export interface UnresolvedChoiceItem {
  item_id: string;
  display_name: string;
  question: string;
  suggested_folders: string[];
}

export interface UnresolvedChoiceResolution {
  item_id: string;
  display_name?: string;
  selected_folder: string;
  note: string;
}

export interface UnresolvedChoicesBlock {
  type: "unresolved_choices";
  request_id: string;
  summary: string;
  status?: "pending" | "submitted" | string;
  items: UnresolvedChoiceItem[];
  submitted_resolutions?: UnresolvedChoiceResolution[];
}

export type AssistantMessageBlock = UnresolvedChoicesBlock;

export interface AssistantMessage {
  id: string;
  role: string;
  content: string;
  blocks?: AssistantMessageBlock[];
  visibility?: "public" | "internal" | string;
}

export interface ActivityFeedEntry {
  id: string;
  phase: "scan" | "plan" | "execution" | "rollback" | "system";
  message: string;
  time: string;
  important?: boolean;
}

export interface AssistantRuntimeStatus {
  phase: AssistantRuntimePhase;
  mode: AssistantRuntimeMode;
  label: string;
  detail?: string;
}

export type ComposerMode = "hidden" | "readonly" | "editable";

export type IntegrityFlags = Record<string, unknown> & {
  notes?: string[];
};

export interface SessionSnapshot {
  session_id: string;
  target_dir: string;
  stage: SessionStage;
  summary: string;
  strategy: SessionStrategySummary;
  assistant_message: AssistantMessage | null;
  scanner_progress: ScannerProgress;
  planner_progress: PlannerProgress;
  plan_snapshot: PlanSnapshot;
  precheck_summary: PrecheckSummary | null;
  execution_report: ExecutionReport | null;
  rollback_report: RollbackReport | null;
  last_journal_id: string | null;
  integrity_flags: IntegrityFlags;
  available_actions: string[];
  messages: AssistantMessage[];
  updated_at: string;
  stale_reason?: string | null;
  last_error?: string | null;
}

export interface SessionEvent {
  event_type: string;
  session_id: string;
  stage: SessionStage;
  session_snapshot?: SessionSnapshot;
  content?: string;
  action?: Record<string, any>;
}

export interface CreateSessionResponse {
  mode: "created" | "resume_available";
  session_id: string | null;
  restorable_session: SessionSnapshot | null;
  session_snapshot: SessionSnapshot | null;
}

export interface ScanAcceptedResponse {
  session_id: string;
  session_snapshot: SessionSnapshot;
}

export interface GetSessionResponse {
  session_id: string;
  session_snapshot: SessionSnapshot;
}

export interface ResumeSessionResponse {
  session_id: string;
  session_snapshot: SessionSnapshot;
}

export interface MessageResponse {
  session_id: string;
  assistant_message: AssistantMessage | null;
  session_snapshot: SessionSnapshot;
}

export interface ResolveUnresolvedChoicesResponse {
  session_id: string;
  assistant_message: AssistantMessage | null;
  session_snapshot: SessionSnapshot;
}

export interface HistoryItem {
  execution_id: string;
  target_dir: string;
  status: string;
  created_at: string;
  item_count: number;
  failure_count?: number;
  is_session?: boolean;
}

export interface UpdateItemRequest {
  item_id: string;
  target_dir?: string;
  move_to_review?: boolean;
}

export interface ResolveUnresolvedChoicesRequest {
  request_id: string;
  resolutions: UnresolvedChoiceResolution[];
}

export interface PrecheckResponse {
  session_id: string;
  session_snapshot: SessionSnapshot;
}

export interface ExecuteResponse {
  session_id: string;
  session_snapshot: SessionSnapshot;
}

export interface CleanupResponse {
  session_id: string;
  cleaned_count: number;
  session_snapshot: SessionSnapshot;
}

export interface RollbackResponse {
  session_id: string;
  session_snapshot: SessionSnapshot;
}

export interface JournalSummary {
  journal_id: string;
  execution_id: string;
  target_dir: string;
  status: string;
  created_at: string;
  item_count: number;
  success_count: number;
  failure_count: number;
  rollback_attempt_count: number;
  restore_items?: {
    action_type: string;
    status: string;
    source: string | null;
    target: string | null;
    display_name: string;
  }[];
  items?: {
    action_type: string;
    status: string;
    source: string | null;
    target: string | null;
    display_name: string;
  }[];
}

export interface RuntimeConfig {
  base_url?: string;
  started_at?: string;
  api_token?: string;
}
