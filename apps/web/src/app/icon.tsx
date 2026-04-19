import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

const iconPaperTone = "rgb(250 247 240)";
const iconPaperStrongTone = "rgb(242 237 226)";
const iconCinnabarTone = "rgb(167 48 50)";

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
          background: iconPaperTone,
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
            position: "relative",
            background: iconPaperStrongTone,
            border: `2px solid ${iconCinnabarTone}`,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              right: 6,
              bottom: 6,
              border: `2px solid ${iconCinnabarTone}`,
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 8,
              left: "50%",
              width: 3,
              height: 16,
              transform: "translateX(-50%)",
              background: iconCinnabarTone,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 8,
              right: 8,
              height: 3,
              transform: "translateY(-50%)",
              background: iconCinnabarTone,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              width: 8,
              height: 3,
              background: iconCinnabarTone,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              width: 8,
              height: 3,
              background: iconCinnabarTone,
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
