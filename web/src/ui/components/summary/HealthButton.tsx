import { AlertTriangle, CheckCircle2 } from "lucide-react";

export type HealthTone = "success" | "warning" | "danger";

const STYLES: Record<
  HealthTone,
  { border: string; bg: string; text: string; muted: string }
> = {
  danger: {
    border: "border-danger/30",
    bg: "bg-danger/[0.06] hover:bg-danger/10",
    text: "text-danger",
    muted: "text-danger/60",
  },
  warning: {
    border: "border-warning/30",
    bg: "bg-warning/[0.06] hover:bg-warning/10",
    text: "text-warning",
    muted: "text-warning/60",
  },
  success: {
    border: "border-success/30",
    bg: "bg-success/[0.06] hover:bg-success/10",
    text: "text-success",
    muted: "text-success/60",
  },
};

/** Colour-coded health summary button with a "View →" affordance that opens the relevant detail modal. */
const HealthButton: React.FC<{
  tone: HealthTone;
  label: string;
  onClick: () => void;
}> = ({ tone, label, onClick }) => {
  const s = STYLES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border ${s.border} ${s.bg} transition-colors text-left`}
    >
      {tone === "success" ? (
        <CheckCircle2 className={`w-3.5 h-3.5 ${s.text} flex-shrink-0`} />
      ) : (
        <AlertTriangle className={`w-3.5 h-3.5 ${s.text} flex-shrink-0`} />
      )}
      <span className={`text-xs flex-1 ${s.text}`}>{label}</span>
      <span className={`text-xs ${s.muted}`}>View →</span>
    </button>
  );
};

export default HealthButton;
