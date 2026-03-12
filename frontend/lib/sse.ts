import { FlagConfig } from "@/types/flag";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const SDK_KEY = process.env.NEXT_PUBLIC_SDK_KEY || "sdk-secret-key";

export function createSSEConnection(
  handlers: {
    onFlagUpdated: (flag: FlagConfig) => void;
    onFlagDeleted: (key: string) => void;
    onError?: (error: Event) => void;
  },
  url: string = API_URL,
  sdkKey: string = SDK_KEY
): EventSource {
  const eventSource = new EventSource(
    `${url}/api/client/stream?key=${sdkKey}`
  );

  eventSource.addEventListener("flag_updated", (e: MessageEvent) => {
    const flag: FlagConfig = JSON.parse(e.data);
    handlers.onFlagUpdated(flag);
  });

  eventSource.addEventListener("flag_deleted", (e: MessageEvent) => {
    const { key } = JSON.parse(e.data);
    handlers.onFlagDeleted(key);
  });

  eventSource.onerror = (e) => {
    handlers.onError?.(e);
  };

  return eventSource;
}
