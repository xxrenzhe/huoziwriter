import type { ChangeEvent } from "react";

export function createDataUrlFileChangeHandler(input: {
  onEmpty: () => void;
  onLoaded: (result: string, fileName: string) => void;
}) {
  return (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      input.onEmpty();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        input.onLoaded(reader.result, file.name);
      }
    };
    reader.readAsDataURL(file);
  };
}

export async function copyTextToClipboard(input: {
  text: string;
  onSuccess: () => void;
  onError: () => void;
}) {
  try {
    await navigator.clipboard.writeText(input.text);
    input.onSuccess();
  } catch {
    input.onError();
  }
}
