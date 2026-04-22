import { getStrategyCardMissingFields, type FourPointAuditDimension } from "@/lib/article-strategy";
import { parseResponseMessage, type StrategyCardItem } from "./article-workspace-client-data";

type PersistStrategyCardOptions = {
  successMessage?: string;
  incompleteMessage?: string;
};

type ArticleWorkspaceStrategyActionsDeps = {
  articleId: number;
  strategyCardDraft: StrategyCardItem;
  strategyFourPointDrafts: Record<FourPointAuditDimension, string>;
  setSavingStrategyCard: (value: boolean) => void;
  setMessage: (message: string) => void;
  commitSavedStrategyCard: (savedStrategySource: Partial<StrategyCardItem>) => StrategyCardItem;
  setAuditingStrategyCard: (value: boolean) => void;
  setLockingStrategyCard: (value: boolean) => void;
  confirm: (message: string) => boolean;
  setReversingStrategyCardDimension: (dimension: FourPointAuditDimension | null) => void;
};

function buildStrategyCardSavePayload(nextDraft: StrategyCardItem) {
  return {
    archetype: nextDraft.archetype,
    mainstreamBelief: nextDraft.mainstreamBelief,
    targetReader: nextDraft.targetReader,
    coreAssertion: nextDraft.coreAssertion,
    whyNow: nextDraft.whyNow,
    researchHypothesis: nextDraft.researchHypothesis,
    marketPositionInsight: nextDraft.marketPositionInsight,
    historicalTurningPoint: nextDraft.historicalTurningPoint,
    targetPackage: nextDraft.targetPackage,
    publishWindow: nextDraft.publishWindow,
    endingAction: nextDraft.endingAction,
    firstHandObservation: nextDraft.firstHandObservation,
    feltMoment: nextDraft.feltMoment,
    whyThisHitMe: nextDraft.whyThisHitMe,
    realSceneOrDialogue: nextDraft.realSceneOrDialogue,
    wantToComplain: nextDraft.wantToComplain,
    nonDelegableTruth: nextDraft.nonDelegableTruth,
  };
}

export function createArticleWorkspaceStrategyActions({
  articleId,
  strategyCardDraft,
  strategyFourPointDrafts,
  setSavingStrategyCard,
  setMessage,
  commitSavedStrategyCard,
  setAuditingStrategyCard,
  setLockingStrategyCard,
  confirm,
  setReversingStrategyCardDimension,
}: ArticleWorkspaceStrategyActionsDeps) {
  async function persistStrategyCardDraft(
    nextDraft: StrategyCardItem,
    options?: PersistStrategyCardOptions,
  ) {
    setSavingStrategyCard(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/strategy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildStrategyCardSavePayload(nextDraft)),
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "策略卡保存失败");
      }
      const savedStrategyCard = commitSavedStrategyCard((json.data as Partial<StrategyCardItem>) ?? {});
      const nextMissingFields = getStrategyCardMissingFields(savedStrategyCard);
      setMessage(
        nextMissingFields.length === 0
          ? options?.successMessage || "策略卡已保存。"
          : options?.incompleteMessage || "策略卡已保存，仍可继续补齐剩余字段。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "策略卡保存失败");
    } finally {
      setSavingStrategyCard(false);
    }
  }

  async function applyResearchWritebackToStrategyCard() {
    setSavingStrategyCard(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/strategy/apply-research`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "研究写回策略卡失败");
      }
      const savedStrategyCard = commitSavedStrategyCard((json.data?.strategyCard as Partial<StrategyCardItem>) ?? {});
      const nextMissingFields = getStrategyCardMissingFields(savedStrategyCard);
      setMessage(
        nextMissingFields.length === 0
          ? "已把研究结论写回并保存到策略卡。"
          : "已把研究结论写回策略卡，但仍可继续补齐其余字段。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "研究写回策略卡失败");
    } finally {
      setSavingStrategyCard(false);
    }
  }

  async function runStrategyAudit() {
    setAuditingStrategyCard(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/strategy/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildStrategyCardSavePayload(strategyCardDraft)),
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "策略卡四元自检失败");
      }
      commitSavedStrategyCard((json.data?.strategyCard as Partial<StrategyCardItem>) ?? {});
      setMessage("已重跑四元自检。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "策略卡四元自检失败");
    } finally {
      setAuditingStrategyCard(false);
    }
  }

  async function lockStrategyCard(override = false) {
    setLockingStrategyCard(true);
    setMessage("");
    try {
      const auditResponse = await fetch(`/api/articles/${articleId}/strategy/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildStrategyCardSavePayload(strategyCardDraft)),
      });
      if (!auditResponse.ok) {
        throw new Error(await parseResponseMessage(auditResponse));
      }
      const auditJson = await auditResponse.json();
      if (!auditJson.success) {
        throw new Error(auditJson.error || "策略卡四元自检失败");
      }
      const auditedStrategyCard = commitSavedStrategyCard((auditJson.data?.strategyCard as Partial<StrategyCardItem>) ?? {});
      if (!Boolean(auditedStrategyCard.fourPointAudit?.overallLockable) && !override) {
        setMessage("四元强度还没达标，可先补强后再锁定，或使用强行锁定。");
        return;
      }
      if (override && !confirm("当前四元强度未达锁定线，仍要强行锁定吗？")) {
        return;
      }

      const lockResponse = await fetch(`/api/articles/${articleId}/strategy/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ override }),
      });
      if (!lockResponse.ok) {
        throw new Error(await parseResponseMessage(lockResponse));
      }
      const lockJson = await lockResponse.json();
      if (!lockJson.success) {
        throw new Error(lockJson.error || "策略卡锁定失败");
      }
      commitSavedStrategyCard((lockJson.data?.strategyCard as Partial<StrategyCardItem>) ?? {});
      setMessage(override ? "策略卡已强行锁定。" : "策略卡已锁定。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "策略卡锁定失败");
    } finally {
      setLockingStrategyCard(false);
    }
  }

  async function applyStrategyFourPointReverseWriteback(dimension: FourPointAuditDimension) {
    const text = strategyFourPointDrafts[dimension]?.trim() || "";
    if (!text) {
      setMessage("先写入要反写的笔尖视角内容。");
      return;
    }

    setReversingStrategyCardDimension(dimension);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/strategy/reverse-writeback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dimension,
          text,
        }),
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "笔尖视角反写失败");
      }
      commitSavedStrategyCard((json.data?.strategyCard as Partial<StrategyCardItem>) ?? {});
      setMessage("已把笔尖视角反写到底层策略字段。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "笔尖视角反写失败");
    } finally {
      setReversingStrategyCardDimension(null);
    }
  }

  return {
    persistStrategyCardDraft,
    applyResearchWritebackToStrategyCard,
    runStrategyAudit,
    lockStrategyCard,
    applyStrategyFourPointReverseWriteback,
  };
}
