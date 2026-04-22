import { createArticleWorkspaceAssetActions } from "./article-workspace-asset-actions";
import { createArticleWorkspaceDraftActions } from "./article-workspace-draft-actions";
import { createArticleWorkspacePublishActions } from "./article-workspace-publish-actions";
import { createArticleWorkspaceRuntimeActions } from "./article-workspace-runtime-actions";
import { createArticleWorkspaceStageActions } from "./article-workspace-stage-actions";
import { createArticleWorkspaceStageHandlers } from "./article-workspace-stage-handlers";
import { createArticleWorkspaceSupportActions } from "./article-workspace-support-actions";

type DraftDeps = Parameters<typeof createArticleWorkspaceDraftActions>[0];
type RuntimeDeps = Parameters<typeof createArticleWorkspaceRuntimeActions>[0];
type SupportDeps = Parameters<typeof createArticleWorkspaceSupportActions>[0];
type PublishDeps = Parameters<typeof createArticleWorkspacePublishActions>[0];
type AssetDeps = Parameters<typeof createArticleWorkspaceAssetActions>[0];
type StageDeps = Parameters<typeof createArticleWorkspaceStageActions>[0];
type StageHandlerDeps = Parameters<typeof createArticleWorkspaceStageHandlers>[0];

type BuildArticleWorkspaceActionBundleInput = {
  draft: Omit<DraftDeps, "reloadArticleMeta">;
  runtime: Omit<RuntimeDeps, "saveArticleDraft">;
  support: Omit<SupportDeps, "saveArticleDraft" | "reloadArticleMeta">;
  publish: Omit<PublishDeps, "saveArticleDraft" | "reloadArticleMeta">;
  asset: Omit<AssetDeps, "saveArticleDraft" | "requestPublishPreview" | "reloadArticleMeta">;
  stage: Omit<StageDeps, "saveArticleDraft" | "reloadArticleMeta">;
  stageHandlers: Omit<
    StageHandlerDeps,
    | "loadOutlineMaterials"
    | "saveSupplementalViewpoints"
    | "submitOutlineMaterial"
    | "generateStageArtifact"
    | "addFactCheckEvidenceSource"
    | "saveAudienceSelection"
    | "saveOutlineSelection"
    | "saveFactCheckSelection"
  >;
};

export function buildArticleWorkspaceActionBundle({
  draft,
  runtime,
  support,
  publish,
  asset,
  stage,
  stageHandlers,
}: BuildArticleWorkspaceActionBundleInput) {
  let reloadArticleMetaProxy: (() => Promise<void>) | null = null;

  const draftActions = createArticleWorkspaceDraftActions({
    ...draft,
    reloadArticleMeta: async () => {
      if (reloadArticleMetaProxy) {
        await reloadArticleMetaProxy();
      }
    },
  });

  const runtimeActions = createArticleWorkspaceRuntimeActions({
    ...runtime,
    saveArticleDraft: async () => await draftActions.saveArticleDraft(),
  });
  reloadArticleMetaProxy = runtimeActions.reloadArticleMeta;

  const supportActions = createArticleWorkspaceSupportActions({
    ...support,
    saveArticleDraft: draftActions.saveArticleDraft,
    reloadArticleMeta: runtimeActions.reloadArticleMeta,
  });

  const publishActions = createArticleWorkspacePublishActions({
    ...publish,
    saveArticleDraft: draftActions.saveArticleDraft,
    reloadArticleMeta: runtimeActions.reloadArticleMeta,
  });

  const assetActions = createArticleWorkspaceAssetActions({
    ...asset,
    saveArticleDraft: draftActions.saveArticleDraft,
    requestPublishPreview: publishActions.requestPublishPreview,
    reloadArticleMeta: runtimeActions.reloadArticleMeta,
  });

  const stageActions = createArticleWorkspaceStageActions({
    ...stage,
    saveArticleDraft: draftActions.saveArticleDraft,
    reloadArticleMeta: runtimeActions.reloadArticleMeta,
  });

  const stageHandlerActions = createArticleWorkspaceStageHandlers({
    ...stageHandlers,
    loadOutlineMaterials: runtimeActions.loadOutlineMaterials,
    saveSupplementalViewpoints: runtimeActions.saveSupplementalViewpoints,
    submitOutlineMaterial: runtimeActions.submitOutlineMaterial,
    generateStageArtifact: draftActions.generateStageArtifact,
    addFactCheckEvidenceSource: supportActions.addFactCheckEvidenceSource,
    saveAudienceSelection: stageActions.saveAudienceSelection,
    saveOutlineSelection: stageActions.saveOutlineSelection,
    saveFactCheckSelection: stageActions.saveFactCheckSelection,
  });

  return {
    ...draftActions,
    ...runtimeActions,
    ...supportActions,
    ...publishActions,
    ...assetActions,
    ...stageActions,
    ...stageHandlerActions,
  };
}
