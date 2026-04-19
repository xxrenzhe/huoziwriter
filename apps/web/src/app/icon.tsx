import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf7f0",
          padding: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            height: "100%",
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(180deg, #fdfaf4 0%, #f2ede2 100%)",
            border: "2px solid #a73032",
            boxSizing: "border-box",
            color: "#a73032",
            fontFamily: '"Noto Serif SC", "Songti SC", serif',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          活
        </div>
      </div>
    ),
    size,
  );
}
