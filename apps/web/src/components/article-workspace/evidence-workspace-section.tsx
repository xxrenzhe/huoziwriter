import type { ComponentProps } from "react";
import { EVIDENCE_HOOK_TAG_OPTIONS } from "@/lib/article-evidence";
import { EvidencePackagePanel } from "./evidence-package-panel";

type EvidenceItemLike = ComponentProps<typeof EvidencePackagePanel>["items"][number];
type EvidenceDraftStatsLike = ComponentProps<typeof EvidencePackagePanel>["draftStats"];

type EvidenceWorkspaceSectionProps = {
  evidenceDraftStats: EvidenceDraftStatsLike;
  savedEvidenceReady: boolean;
  evidenceHasUnsavedChanges: boolean;
  savingEvidenceItems: boolean;
  taggingEvidenceItems: boolean;
  evidenceDraftItems: EvidenceItemLike[];
  suggestedEvidenceItems: EvidenceItemLike[];
  getItemSignature: (item: EvidenceItemLike) => string;
  onOpenImaDrawer: () => void | Promise<unknown>;
  onUseSuggestedPackage: () => void | Promise<unknown>;
  onClearDraft: () => void | Promise<unknown>;
  onToggleItem: (item: EvidenceItemLike) => void | Promise<unknown>;
  onToggleHookTag: (signature: string, tag: string) => void | Promise<unknown>;
  onChangeHookStrength: (signature: string, value: string) => void | Promise<unknown>;
  onAutoTag: () => void | Promise<unknown>;
  onSave: () => void | Promise<unknown>;
};

export function EvidenceWorkspaceSection({
  evidenceDraftStats,
  savedEvidenceReady,
  evidenceHasUnsavedChanges,
  savingEvidenceItems,
  taggingEvidenceItems,
  evidenceDraftItems,
  suggestedEvidenceItems,
  getItemSignature,
  onOpenImaDrawer,
  onUseSuggestedPackage,
  onClearDraft,
  onToggleItem,
  onToggleHookTag,
  onChangeHookStrength,
  onAutoTag,
  onSave,
}: EvidenceWorkspaceSectionProps) {
  const evidenceStatusTone = !evidenceDraftStats.ready
    ? "border-danger/30 bg-surface text-danger"
    : !savedEvidenceReady || evidenceHasUnsavedChanges
      ? "border-warning/40 bg-surfaceWarning text-warning"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const missingHookTags = EVIDENCE_HOOK_TAG_OPTIONS.filter((tag) => !evidenceDraftStats.hookTagCoverage.includes(tag));
  const selectedKeys = new Set(evidenceDraftItems.map(getItemSignature));
  const availableSuggestedItems = suggestedEvidenceItems.filter((item) => !selectedKeys.has(getItemSignature(item)));

  return (
    <EvidencePackagePanel
      evidenceStatusTone={evidenceStatusTone}
      evidenceStatusText={
        !evidenceDraftStats.ready
          ? "未达最低标准"
          : !savedEvidenceReady || evidenceHasUnsavedChanges
            ? "待确认保存"
            : "已确认保存"
      }
      draftStats={evidenceDraftStats}
      savedReady={savedEvidenceReady}
      hasUnsavedChanges={evidenceHasUnsavedChanges}
      saving={savingEvidenceItems}
      tagging={taggingEvidenceItems}
      missingHookTags={missingHookTags}
      items={evidenceDraftItems}
      availableSuggestedItems={availableSuggestedItems}
      getItemSignature={getItemSignature}
      onOpenImaDrawer={() => void onOpenImaDrawer()}
      onUseSuggestedPackage={() => void onUseSuggestedPackage()}
      onClearDraft={() => void onClearDraft()}
      onToggleItem={(item) => void onToggleItem(item)}
      onToggleHookTag={(signature, tag) => void onToggleHookTag(signature, tag)}
      onChangeHookStrength={(signature, value) => void onChangeHookStrength(signature, value)}
      onAutoTag={() => void onAutoTag()}
      onSave={() => void onSave()}
    />
  );
}
