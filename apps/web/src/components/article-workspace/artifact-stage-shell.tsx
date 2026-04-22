import { Button } from "@huoziwriter/ui";
import type { ReactNode } from "react";

type ArtifactStageShellProps = {
  title: string;
  updatedAtLabel: string;
  providerLabel: string;
  summary: string;
  primaryActionLabel: string;
  primaryActionDisabled: boolean;
  onPrimaryAction: () => void;
  extraActions?: ReactNode;
  errorMessage: string;
  children: ReactNode;
};

export function ArtifactStageShell({
  title,
  updatedAtLabel,
  providerLabel,
  summary,
  primaryActionLabel,
  primaryActionDisabled,
  onPrimaryAction,
  extraActions,
  errorMessage,
  children,
}: ArtifactStageShellProps) {
  return (
    <div className="space-y-4 border border-lineStrong bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-serifCn text-2xl text-ink text-balance">{title}</div>
          <div className="mt-1 text-xs text-inkMuted">{updatedAtLabel}</div>
        </div>
        <div className="text-xs text-inkMuted">{providerLabel}</div>
      </div>

      {summary ? (
        <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
          {summary}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={onPrimaryAction}
          disabled={primaryActionDisabled}
          variant="secondary"
          className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
        >
          {primaryActionLabel}
        </Button>
        {extraActions}
      </div>

      {children}

      {errorMessage ? (
        <div className="border border-warning/40 bg-surfaceWarning px-4 py-3 text-sm leading-7 text-warning">
          本次结果使用了降级产物：{errorMessage}
        </div>
      ) : null}
    </div>
  );
}
