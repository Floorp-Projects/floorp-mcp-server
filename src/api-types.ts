export interface Tab {
  id: number;
  browserId?: number; // Added by server for mapping to automation
  index: number;
  windowId: number;
  highlighted: boolean;
  active: boolean;
  attention: boolean;
  pinned: boolean;
  status: "loading" | "complete";
  hidden: boolean;
  discarded: boolean;
  incognito: boolean;
  width: number;
  height: number;
  lastAccessed: number;
  audible: boolean;
  mutedInfo: { muted: boolean };
  isArticle: boolean;
  isInReaderMode: boolean;
  sharingState: { camera: boolean; microphone: boolean; screen: boolean };
  successorTabId: number;
  cookieStoreId: string;
  url: string;
  title: string;
  favIconUrl: string;
}

export interface HistoryItem {
  url: string;
  title: string;
  lastVisitDate: string;
  visitCount: number;
}

export interface Download {
  id: number;
  url: string;
  filename: string;
  status:
    | "downloading"
    | "succeeded"
    | "failed"
    | "canceled"
    | "paused"
    | "queued";
  startTime: string;
}

export interface InstanceInfo {
  instanceId: string;
  type: "tab" | "scraper";
  created: number;
}

// Responses
export interface HealthResponse {
  status: "ok";
}

export interface ErrorResponse {
  error: string;
}

export interface OkResponse {
  ok: boolean;
}
