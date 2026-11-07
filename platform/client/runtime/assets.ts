import { MessageError, message } from "../../src/shared/messages.ts";
export function loadScript(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = path;
    script.onload = () => resolve();
    script.onerror = () => reject(new MessageError(message("runtime.loadFailed")));
    document.head.append(script);
  });
}
export function loadStyle(path: string): void {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = path;
  document.head.append(link);
}
