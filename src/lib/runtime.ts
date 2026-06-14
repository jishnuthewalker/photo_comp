export function isDesktopRuntime() {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

function makeFilePicker(accept: string, multiple: boolean) {
  return new Promise<File[] | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "-9999px";

    const cleanup = () => input.remove();

    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      cleanup();
      resolve(files.length > 0 ? files : null);
    });

    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });

    document.body.appendChild(input);
    input.click();
  });
}

export async function pickFiles(accept: string, multiple = false) {
  if (typeof window === "undefined") return null;

  if (!isDesktopRuntime()) {
    return makeFilePicker(accept, multiple);
  }

  return null;
}

export function downloadTextFile(filename: string, text: string, mimeType = "application/json") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
