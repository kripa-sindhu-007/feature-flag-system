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
  // NOTE (residual by design): the browser EventSource API cannot set request
  // headers, so the SDK key rides in the query string here. This is the SDK key
  // (read-only flag stream), not the admin key — admin mutations go through the
  // same-origin BFF proxy and never expose a key. Where a client call is a plain
  // fetch (e.g. useCluster's /api/client/version) we use the X-SDK-Key header
  // instead; only EventSource is forced to ?key=.
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
