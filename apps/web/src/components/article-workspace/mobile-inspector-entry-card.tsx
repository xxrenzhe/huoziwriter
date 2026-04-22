import { Button } from "@huoziwriter/ui";

type MobileInspectorEntryCardProps = {
  onOpen: () => void;
};

export function MobileInspectorEntryCard({ onOpen }: MobileInspectorEntryCardProps) {
  return (
    <div className="border border-lineStrong/40 bg-surfaceWarm p-4 md:hidden">
      <div className="text-sm leading-7 text-inkSoft">
        手机视图默认收起了快照、背景卡、即时语言守卫和视觉联想等辅助面板，优先保证写稿、预览与发布主链路更顺。
      </div>
      <Button
        type="button"
        onClick={onOpen}
        variant="secondary"
        size="sm"
        className="mt-3 w-full"
      >
        打开辅助面板
      </Button>
    </div>
  );
}
