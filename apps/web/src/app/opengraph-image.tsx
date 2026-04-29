import { ImageResponse } from "next/og";

import {
  MARKETING_PROJECT_SURFACE_SIZE,
  MarketingProjectSurface,
} from "@/lib/marketing-project-surface";
import { getOpenGraphChineseFonts } from "@/lib/opengraph-fonts";

export const size = MARKETING_PROJECT_SURFACE_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(<MarketingProjectSurface />, {
    ...size,
    fonts: await getOpenGraphChineseFonts(),
  });
}
