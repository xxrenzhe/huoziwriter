import type { ComponentProps } from "react";
import { Button } from "@huoziwriter/ui";
import { SentenceRhythmMap } from "../sentence-rhythm-map";
import { AuthoringBlankSlate } from "./authoring-phase";

type DraftStarterOption = {
  label: string;
  text: string;
};

type DraftBlankSlateInspiration = {
  key: string;
  title: string;
  detail: string;
  meta: string;
};

type DraftEditorViewProps = {
  hasDraftContent: boolean;
  draftBlankSlate: Pick<ComponentProps<typeof AuthoringBlankSlate>, "eyebrow" | "title" | "detail" | "prompts">;
  draftStarterOptions: DraftStarterOption[];
  draftBlankSlateInspirations: DraftBlankSlateInspiration[];
  markdown: string;
  onChangeMarkdown: (value: string) => void;
  onApplyStarterOption: (value: string) => void;
  onSwitchToWorkspace: () => void;
};

export function DraftEditorView({
  hasDraftContent,
  draftBlankSlate,
  draftStarterOptions,
  draftBlankSlateInspirations,
  markdown,
  onChangeMarkdown,
  onApplyStarterOption,
  onSwitchToWorkspace,
}: DraftEditorViewProps) {
  return (
    <>
      {!hasDraftContent ? (
        <div className="mt-4">
          <div className="space-y-4">
            <AuthoringBlankSlate
              eyebrow={draftBlankSlate.eyebrow}
              title={draftBlankSlate.title}
              detail={draftBlankSlate.detail}
              prompts={draftBlankSlate.prompts}
            >
              {draftStarterOptions.map((option) => (
                <Button
                  key={option.label}
                  type="button"
                  onClick={() => onApplyStarterOption(option.text)}
                  variant="secondary"
                >
                  {option.label}
                </Button>
              ))}
              <Button
                type="button"
                onClick={onSwitchToWorkspace}
                variant="secondary"
                className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
              >
                先看阶段工作台
              </Button>
            </AuthoringBlankSlate>
            {draftBlankSlateInspirations.length > 0 ? (
              <div className="border border-lineStrong bg-[radial-gradient(circle_at_top_left,rgba(196,138,58,0.10),transparent_32%),linear-gradient(180deg,rgba(255,253,250,1)_0%,rgba(250,247,240,1)_100%)] p-5">
                <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">灵感启发</div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">
                  白页不只给提示，也直接给你几张可借的起手卡。可以拿素材切口起笔，也可以借经典开场方式破冰。
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {draftBlankSlateInspirations.map((item) => (
                    <div key={item.key} className="border border-lineStrong/70 bg-surface/85 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-cinnabar">{item.title}</div>
                      <div className="mt-3 text-sm leading-7 text-inkSoft">{item.detail}</div>
                      <div className="mt-3 text-xs leading-6 text-inkMuted">{item.meta}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <textarea
        aria-label="草稿编辑区"
        value={markdown}
        onChange={(event) => onChangeMarkdown(event.target.value)}
        placeholder="铺开稿纸，落笔生花。&#10;&#10;「文章千古事，得失寸心知。」&#10;—— 在这里写下你的第一段草稿，或从左侧素材板中汲取灵感..."
        className="mt-4 min-h-[420px] w-full resize-y border border-lineStrong bg-surfaceHighlight px-4 py-6 text-base leading-8 text-ink bg-[linear-gradient(transparent_31px,rgba(27,28,26,0.04)_32px)] bg-[length:100%_32px] md:min-h-[560px] md:px-6 md:py-8"
      />
      <div className="mt-4">
        <SentenceRhythmMap text={markdown} />
      </div>
    </>
  );
}
