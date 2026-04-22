import { WechatNativePreview } from "../wechat-native-preview";

type ConnectionLike = {
  accountName: string | null;
  isDefault?: boolean;
} | null;

type WorkspacePreviewViewProps = {
  hasPreviewContent: boolean;
  htmlPreview: string;
  title: string;
  authorName?: string;
  selectedConnection: ConnectionLike;
  initialConnections: Array<ConnectionLike>;
};

export function WorkspacePreviewView({
  hasPreviewContent,
  htmlPreview,
  title,
  authorName,
  selectedConnection,
  initialConnections,
}: WorkspacePreviewViewProps) {
  const fallbackConnection = initialConnections.find((connection) => connection?.isDefault) ?? null;

  return (
    <div className="mt-4 border border-lineStrong bg-surfaceHighlight">
      <WechatNativePreview
        html={hasPreviewContent ? htmlPreview : ""}
        title={title}
        authorName={authorName}
        accountName={selectedConnection?.accountName || fallbackConnection?.accountName || undefined}
      />
    </div>
  );
}
