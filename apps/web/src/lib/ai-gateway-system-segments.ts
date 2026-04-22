import type { GatewaySystemSegment } from "./ai-gateway";

export type GatewaySystemSegmentInput = {
  text?: string | null;
  cacheable?: boolean;
};

export function buildGatewaySystemSegments(inputs: GatewaySystemSegmentInput[]) {
  return inputs.reduce<GatewaySystemSegment[]>((segments, input) => {
    const text = String(input.text || "").trim();
    if (!text) {
      return segments;
    }
    segments.push({
      text,
      cacheable: input.cacheable,
    });
    return segments;
  }, []);
}
