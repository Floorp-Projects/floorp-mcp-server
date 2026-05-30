/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// -- Instance Types ----------------------------------------------------------

export type InstanceType = "tab" | "scraper";

export type WaitForElementState =
  | "attached"
  | "visible"
  | "hidden"
  | "detached";

// -- Browser Info ------------------------------------------------------------

export interface BrowserTab {
  id: number;
  browserId?: number;
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

/** Tab info from /tabs/list (automation-focused) */
export interface TabInfo {
  browserId: string;
  instanceId?: string;
  windowId: string;
  title: string;
  url: string;
  selected: boolean;
  pinned: boolean;
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

export interface BrowserContext {
  history: HistoryItem[];
  tabs: BrowserTab[];
  downloads: Download[];
}

// -- Instance Management -----------------------------------------------------

export interface InstanceInfo {
  instanceId: string;
  type: "tab" | "scraper";
  created: number;
}

// -- Content & Navigation ----------------------------------------------------

export interface ArticleData {
  title: string;
  byline: string;
  markdown: string;
  length: number;
}

export interface TextOptions {
  mode?: "full" | "scoped" | "visible";
  selector?: string;
  viewportMargin?: number;
  enableFingerprints?: boolean;
  includeSelectorMap?: boolean;
}

// -- Element Operations ------------------------------------------------------

export interface ScreenshotRect {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface ClickOptions {
  button?: "left" | "right" | "middle";
  clickCount?: number;
  force?: boolean;
  stabilityTimeout?: number;
}

export interface FillFormOptions {
  typingMode?: boolean;
  typingDelayMs?: number;
}

export interface InputOptions {
  typingMode?: boolean;
  typingDelayMs?: number;
}

export interface EventOptions {
  bubbles?: boolean;
  cancelable?: boolean;
}

// -- Cookies -----------------------------------------------------------------

export interface CookieData {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expirationDate?: number;
}

// -- Network -----------------------------------------------------------------

export interface NetworkIdleOptions {
  timeout?: number;
  maxInflight?: number;
  idleDuration?: number;
  ignorePatterns?: string[];
}

// -- Workspaces --------------------------------------------------------------

export interface WorkspaceInfo {
  id: string;
  name: string;
}

// -- Responses ---------------------------------------------------------------

export interface HealthResponse {
  status: "ok";
}

export interface ErrorResponse {
  error: string;
}

export interface OkResponse {
  ok: boolean;
}

export interface InstanceIdResponse {
  instanceId: string;
}

export interface ExistsResponse {
  exists: boolean;
}

// -- JavaScript Evaluation ---------------------------------------------------

export interface EvaluateResult {
  /** Whether evaluation completed without throwing */
  success: boolean;
  /** JSON-serializable result value */
  result?: unknown;
  /** JS type of the returned value */
  resultType?: string;
  /** Error message (when success is false) */
  error?: string;
  /** Error constructor name, e.g. "SyntaxError" */
  errorType?: string;
}
