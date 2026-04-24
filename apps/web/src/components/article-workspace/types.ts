import type { ReactNode } from "react";
import type { ArticleMainStepCode } from "@/lib/article-workflow-registry";
import type { ArticleMainStepStatus, PublishStageStatus } from "@/lib/article-workspace-formatters";

export type WorkspaceView = "workspace" | "edit" | "preview" | "audit";

export type WorkspaceStepPanels = {
  artifactPanel: ReactNode;
  researchPanel?: ReactNode;
  strategyPanel?: ReactNode;
  evidencePanel?: ReactNode;
};

export type WorkspaceShellMainStep = {
  code: ArticleMainStepCode;
  title: string;
  primaryStageCode: string;
  supportLabel: string;
  statusLabel: ArticleMainStepStatus | string;
  disabled?: boolean;
  disabledReason?: string | null;
};

export type WorkspaceShellAuthoringPhase = {
  code: string;
  title: string;
  summary: string;
  supportLabel: string;
  statusLabel: ArticleMainStepStatus | string;
  defaultView: WorkspaceView;
  targetStageCode: string;
};

export type WorkspaceResearchCoverageRibbon = {
  coveredCount: number;
  totalCount: number;
  sufficiencyLabel: string;
  note: string;
  gaps: string[];
  dimensions: Array<{
    key: string;
    label: string;
    covered: boolean;
  }>;
};

export type WorkspaceResearchStepSummary = {
  title: string;
  detail: string;
  status: PublishStageStatus;
};

export type WorkspaceCurrentTask = {
  title: string;
  detail: string;
  badge: string;
  tone: "danger" | "warning" | "ready";
  actionLabel: string;
  actionKind: "goto-step" | "goto-research";
  targetStepCode?: ArticleMainStepCode;
};

export type WorkspacePublishPreviewState = {
  title: string;
  templateId: string | null;
  templateName: string | null;
  templateVersion: string | null;
  templateOwnerLabel: string | null;
  templateSourceLabel: string | null;
  templateSummary: string[];
  finalHtml: string;
  finalHtmlHash: string | null;
  savedHtmlHash: string | null;
  isConsistentWithSavedHtml: boolean;
  mismatchWarnings: string[];
  publishGuard: {
    canPublish: boolean;
    blockers: string[];
    warnings: string[];
    suggestions: string[];
    checks: Array<{
      key: string;
      label: string;
      status: "passed" | "warning" | "blocked";
      severity: "blocking" | "warning" | "suggestion";
      detail: string;
      targetStageCode?: string;
      actionLabel?: string;
    }>;
    stageReadiness: Array<{
      stageCode: string;
      title: string;
      status: "ready" | "needs_attention" | "blocked";
      detail: string;
    }>;
    aiNoise: {
      score: number;
      level: string;
      findings: string[];
      suggestions: string[];
    };
    qualityPanel: ReturnType<typeof import("@/lib/writing-quality").buildWritingQualityPanel>;
    materialReadiness: {
      attachedFragmentCount: number;
      uniqueSourceTypeCount: number;
      screenshotCount: number;
    };
    connectionHealth: {
      connectionName: string | null;
      status: string;
      detail: string;
      tokenExpiresAt: string | null;
    };
    latestAttempt: {
      status: string;
      createdAt: string;
      failureReason: string | null;
      failureCode: string | null;
      retryCount: number;
      mediaId: string | null;
    } | null;
  };
  generatedAt: string;
};
