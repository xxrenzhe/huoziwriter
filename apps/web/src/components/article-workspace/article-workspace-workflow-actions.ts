import { getDefaultWorkspaceViewForStageCode } from "./authoring-phase";
import type { PendingPublishIntent } from "./article-workspace-client-data";

type WorkflowStageState = {
  code: string;
  title: string;
  status: "pending" | "current" | "completed" | "failed";
};

type WorkflowRuntimeState = {
  currentStageCode: string;
  stages: WorkflowStageState[];
  pendingPublishIntent?: PendingPublishIntent | null;
  updatedAt: string;
};

type WorkspaceView = "workspace" | "edit" | "preview" | "audit";

type WorkflowAction = "set" | "complete" | "fail";

type ArticleMainStepLike = {
  code: string;
  primaryStageCode: string;
};

type ArticleWorkspaceWorkflowActionsDeps = {
  articleId: number;
  status: string;
  setUpdatingWorkflowCode: (value: string | null) => void;
  setWorkflow: (value: WorkflowRuntimeState) => void;
  setView: (value: WorkspaceView) => void;
  setMessage: (value: string) => void;
};

export function createArticleWorkspaceWorkflowActions({
  articleId,
  status,
  setUpdatingWorkflowCode,
  setWorkflow,
  setView,
  setMessage,
}: ArticleWorkspaceWorkflowActionsDeps) {
  async function updateWorkflow(stageCode: string, action: WorkflowAction = "set", silent = false) {
    setUpdatingWorkflowCode(stageCode);
    try {
      const response = await fetch(`/api/articles/${articleId}/workflow/runtime`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageCode, action }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "稿件步骤更新失败");
      }
      setWorkflow(json.data);
      if (action === "set" || action === "complete") {
        setView(getDefaultWorkspaceViewForStageCode(stageCode));
      }
    } catch (error) {
      if (!silent) {
        setMessage(error instanceof Error ? error.message : "稿件步骤更新失败");
      }
    } finally {
      setUpdatingWorkflowCode(null);
    }
  }

  function handleArticleMainStepSelect(step: ArticleMainStepLike) {
    if (step.code === "result") {
      if (status !== "published") {
        return;
      }
      setView("workspace");
      return;
    }
    void updateWorkflow(step.primaryStageCode, "set");
  }

  function goToResearchStep() {
    void updateWorkflow("researchBrief", "set");
  }

  return {
    updateWorkflow,
    handleArticleMainStepSelect,
    goToResearchStep,
  };
}
