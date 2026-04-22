import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type { FourPointAuditDimension } from "@/lib/article-strategy";
import { StrategyWorkspaceSection } from "./strategy-workspace-section";

type StrategyWorkspaceSectionProps = ComponentProps<typeof StrategyWorkspaceSection>;

type StrategyWorkspaceViewProps = Omit<
  StrategyWorkspaceSectionProps,
  | "onRunStrategyAudit"
  | "onLockStrategyCard"
  | "onChangeStrategyFourPointDraft"
  | "onAppendWhyNowHint"
> & {
  runStrategyAudit: () => void | Promise<unknown>;
  lockStrategyCard: (force: boolean) => void | Promise<unknown>;
  setStrategyFourPointDrafts: Dispatch<SetStateAction<Record<FourPointAuditDimension, string>>>;
};

export function StrategyWorkspaceView({
  strategyWhyNow,
  onChangeStrategyWhyNow,
  runStrategyAudit,
  lockStrategyCard,
  strategyFourPointDrafts,
  setStrategyFourPointDrafts,
  ...props
}: StrategyWorkspaceViewProps) {
  return (
    <StrategyWorkspaceSection
      {...props}
      strategyWhyNow={strategyWhyNow}
      onChangeStrategyWhyNow={onChangeStrategyWhyNow}
      onRunStrategyAudit={() => {
        void runStrategyAudit();
      }}
      onLockStrategyCard={(force) => {
        void lockStrategyCard(force);
      }}
      strategyFourPointDrafts={strategyFourPointDrafts}
      onChangeStrategyFourPointDraft={(key, value) =>
        setStrategyFourPointDrafts((current) => ({ ...current, [key]: value }))
      }
      onAppendWhyNowHint={(value) => {
        const currentValue = strategyWhyNow.trim();
        onChangeStrategyWhyNow(currentValue ? `${currentValue}；${value}` : value);
      }}
    />
  );
}
