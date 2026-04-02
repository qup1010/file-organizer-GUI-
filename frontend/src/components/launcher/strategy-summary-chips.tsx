import { SessionStrategySummary } from "@/types/session";

export function StrategySummaryChips({ strategy }: { strategy: SessionStrategySummary }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="ui-pill border-primary/12 bg-primary/8 text-primary">{strategy.template_label}</span>
      <span className="ui-pill">{strategy.naming_style_label}</span>
      <span className="ui-pill">{strategy.caution_level_label}</span>
      {strategy.note ? (
        <span className="ui-pill border-warning/12 bg-warning-container/30">
          偏好：{strategy.note}
        </span>
      ) : null}
    </div>
  );
}
