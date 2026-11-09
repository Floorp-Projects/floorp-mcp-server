/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import fetch from "node-fetch";
import type {
  InstanceType,
  WaitForElementState,
  BrowserTab,
  TabInfo,
  HistoryItem,
  Download,
  BrowserContext,
  ArticleData,
  TextOptions,
  ScreenshotRect,
  ClickOptions,
  FillFormOptions,
  InputOptions,
  EvaluateResult,
  EventOptions,
  CookieData,
  NetworkIdleOptions,
  WorkspaceInfo,
  HealthResponse,
  OkResponse,
  InstanceIdResponse,
  ExistsResponse,
} from "./api-types.js";
import {
  isHeaderSafeToken,
  resolvePort,
  resolveTokenWithSource,
  TOKEN_ENV,
  TOKEN_FILE_DISPLAY,
  type TokenSource,
} from "./auth.js";

// -- Helpers -----------------------------------------------------------------

/**
 * What to tell the user after a 401, naming the token source that was used.
 * Uses the `~` path so the OS user name does not reach the model.
 */
export function unauthorizedHint(source: TokenSource | "explicit"): string {
  switch (source) {
    case "env":
      return ` (the token from ${TOKEN_ENV} was rejected; unset it to use ${TOKEN_FILE_DISPLAY}, or set it to the running Floorp's token)`;
    case "file":
      return ` (the token in ${TOKEN_FILE_DISPLAY} was rejected; it may belong to another Floorp instance, restart the Floorp you want to control or set ${TOKEN_ENV})`;
    case "explicit":
      return " (the token passed to FloorpClient was rejected)";
    case "none":
      return ` (the OS-Server requires a bearer token: start Floorp so it writes ${TOKEN_FILE_DISPLAY}, or set ${TOKEN_ENV})`;
  }
}

type HttpMethod = "GET" | "POST" | "DELETE";

// -- FloorpClient ------------------------------------------------------------

export class FloorpClient {
  private baseUrl: string;
  /** Explicit token; when undefined the token is resolved per request. */
  private token: string | undefined;

  /**
   * @param port OS-Server port (default: `FLOORP_OS_PORT` or 58261).
   * @param token Bearer token. When omitted, each request uses
   *   `FLOORP_OS_TOKEN` or the browser's `~/.floorp/os-server-token`, read at
   *   request time so a browser started (or a token regenerated) after this
   *   process still works.
   */
  constructor(port: number = resolvePort(), token?: string) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.token = token;
  }

  // -- Internal helpers -------------------------------------------------------

  private stripBase64Prefix(data: string): string {
    return data.replace(/^data:image\/[a-z]+;base64,/, "");
  }

  /**
   * Build an instance-scoped path prefix based on instance type.
   * Tab instances use /tabs/instances/:id, scraper instances use /scraper/instances/:id.
   */
  private instancePath(
    type: InstanceType,
    instanceId: string,
    suffix: string,
  ): string {
    const prefix = type === "scraper" ? "/scraper" : "/tabs";
    return `${prefix}/instances/${instanceId}${suffix}`;
  }

  /**
   * Build a query string with selector and/or fingerprint parameters.
   */
  private selectorQuery(
    selector?: string,
    fingerprint?: string,
  ): string {
    const params = new URLSearchParams();
    if (selector) params.set("selector", selector);
    if (fingerprint) params.set("fingerprint", fingerprint);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  /** The token to send and where it came from (the token is never logged). */
  private resolveAuth(): { token: string; source: TokenSource | "explicit" } {
    if (this.token === undefined) return resolveTokenWithSource();
    if (this.token && !isHeaderSafeToken(this.token)) {
      throw new Error(
        "The OS-Server token passed to FloorpClient contains characters that cannot be sent in an HTTP header.",
      );
    }
    return { token: this.token, source: "explicit" };
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    const { token, source } = this.resolveAuth();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const fetchOptions: any = {
      method,
      headers,
    };
    if (method !== "GET" && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(
      `${this.baseUrl}${path}`,
      fetchOptions,
    );

    if (!response.ok) {
      const text = await response.text();
      const hint = response.status === 401 ? unauthorizedHint(source) : "";
      throw new Error(`Floorp API Error ${response.status}: ${text}${hint}`);
    }

    return response.json() as Promise<T>;
  }

  // -- Browser Info -----------------------------------------------------------

  async checkHealth(): Promise<boolean> {
    try {
      const res = await this.request<HealthResponse>("GET", "/health");
      return res.status === "ok";
    } catch {
      return false;
    }
  }

  async getTabs(): Promise<BrowserTab[]> {
    return this.request<BrowserTab[]>("GET", "/browser/tabs");
  }

  async getHistory(limit: number = 20): Promise<HistoryItem[]> {
    return this.request<HistoryItem[]>(
      "GET",
      `/browser/history?limit=${limit}`,
    );
  }

  async getDownloads(limit: number = 20): Promise<Download[]> {
    return this.request<Download[]>(
      "GET",
      `/browser/downloads?limit=${limit}`,
    );
  }

  async getBrowserContext(
    historyLimit: number = 10,
    downloadLimit: number = 10,
  ): Promise<BrowserContext> {
    return this.request<BrowserContext>(
      "GET",
      `/browser/context?historyLimit=${historyLimit}&downloadLimit=${downloadLimit}`,
    );
  }

  // -- Tab Instance Management ------------------------------------------------

  async listTabInstances(): Promise<TabInfo[]> {
    return this.request<TabInfo[]>("GET", "/tabs/list");
  }

  async createTabInstance(
    url: string,
    options?: { inBackground?: boolean; waitForLoad?: boolean },
  ): Promise<string> {
    const res = await this.request<InstanceIdResponse>(
      "POST",
      "/tabs/instances",
      {
        url,
        inBackground: options?.inBackground ?? true,
        waitForLoad: options?.waitForLoad,
      },
    );
    return res.instanceId;
  }

  async attachToTab(browserId: string): Promise<string | null> {
    const res = await this.request<{ instanceId: string | null }>(
      "POST",
      "/tabs/attach",
      { browserId: String(browserId) },
    );
    return res.instanceId;
  }

  async getInstanceInfo(
    instanceId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.request<Record<string, unknown> | null>(
      "GET",
      `/tabs/instances/${instanceId}`,
    );
  }

  async instanceExists(
    instanceId: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const prefix = type === "scraper" ? "/scraper" : "/tabs";
    const res = await this.request<ExistsResponse>(
      "GET",
      `${prefix}/instances/${instanceId}/exists`,
    );
    return res.exists;
  }

  async destroyInstance(
    instanceId: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const prefix = type === "scraper" ? "/scraper" : "/tabs";
    const res = await this.request<OkResponse>(
      "DELETE",
      `${prefix}/instances/${instanceId}`,
    );
    return res.ok;
  }

  async closeTab(instanceId: string): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      `/tabs/instances/${instanceId}/close`,
    );
    return res.ok;
  }

  // -- Scraper Instance Management --------------------------------------------

  async createScraperInstance(): Promise<string> {
    const res = await this.request<InstanceIdResponse>(
      "POST",
      "/scraper/instances",
    );
    return res.instanceId;
  }

  // -- Navigation & Content ---------------------------------------------------

  async navigate(
    instanceId: string,
    url: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/navigate"),
      { url },
    );
    return res.ok;
  }

  async getURI(
    instanceId: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const res = await this.request<{ uri: string | null }>(
      "GET",
      this.instancePath(type, instanceId, "/uri"),
    );
    return res.uri;
  }

  async getHTML(
    instanceId: string,
    selector?: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const qs = selector ? `?selector=${encodeURIComponent(selector)}` : "";
    const res = await this.request<{ html?: string }>(
      "GET",
      this.instancePath(type, instanceId, `/html${qs}`),
    );
    return res.html ?? null;
  }

  /**
   * Get page text as Markdown with optional fingerprint embedding.
   * This is the primary method for AI agents to read page content.
   */
  async getText(
    instanceId: string,
    options?: TextOptions,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const res = await this.request<{ text?: string }>(
      "POST",
      this.instancePath(type, instanceId, "/text"),
      {
        mode: options?.mode ?? "full",
        selector: options?.selector,
        viewportMargin: options?.viewportMargin,
        enableFingerprints: options?.enableFingerprints ?? true,
        includeSelectorMap: options?.includeSelectorMap ?? true,
      },
    );
    return res.text ?? null;
  }

  /**
   * Legacy GET-based text retrieval (backward compat).
   */
  async getTextLegacy(
    instanceId: string,
    includeSelectorMap: boolean = false,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const qs = includeSelectorMap ? "?includeSelectorMap=true" : "";
    const res = await this.request<{ text?: string }>(
      "GET",
      this.instancePath(type, instanceId, `/text${qs}`),
    );
    return res.text ?? null;
  }

  async getTitle(
    instanceId: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const res = await this.request<{ title?: string }>(
      "GET",
      this.instancePath(type, instanceId, "/title"),
    );
    return res.title ?? null;
  }

  async getAccessibilityTree(
    instanceId: string,
    options?: { interestingOnly?: boolean; root?: string },
    type: InstanceType = "tab",
  ): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.interestingOnly !== undefined) {
      params.set("interestingOnly", String(options.interestingOnly));
    }
    if (options?.root) {
      params.set("root", options.root);
    }
    const qs = params.toString();
    const res = await this.request<{ tree?: unknown }>(
      "GET",
      this.instancePath(type, instanceId, `/ax-tree${qs ? `?${qs}` : ""}`),
    );
    return res.tree ?? null;
  }

  async getArticle(
    instanceId: string,
    type: InstanceType = "tab",
  ): Promise<ArticleData | null> {
    return this.request<ArticleData | null>(
      "GET",
      this.instancePath(type, instanceId, "/article"),
    );
  }

  // -- Element Queries --------------------------------------------------------

  async getElement(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const qs = this.selectorQuery(selector, fingerprint);
    const res = await this.request<{ element?: string }>(
      "GET",
      this.instancePath(type, instanceId, `/element${qs}`),
    );
    return res.element ?? null;
  }

  async getElements(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<string[]> {
    const qs = this.selectorQuery(selector, fingerprint);
    const res = await this.request<{ elements?: string[] }>(
      "GET",
      this.instancePath(type, instanceId, `/elements${qs}`),
    );
    return res.elements ?? [];
  }

  async getElementText(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const qs = this.selectorQuery(selector, fingerprint);
    const res = await this.request<{ text?: string }>(
      "GET",
      this.instancePath(type, instanceId, `/elementText${qs}`),
    );
    return res.text ?? null;
  }

  async getElementTextContent(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const qs = this.selectorQuery(selector, fingerprint);
    const res = await this.request<{ text?: string }>(
      "GET",
      this.instancePath(type, instanceId, `/elementTextContent${qs}`),
    );
    return res.text ?? null;
  }

  async getElementByText(
    instanceId: string,
    text: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const qs = `?text=${encodeURIComponent(text)}`;
    const res = await this.request<{ element?: string }>(
      "GET",
      this.instancePath(type, instanceId, `/elementByText${qs}`),
    );
    return res.element ?? null;
  }

  async getValue(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const qs = this.selectorQuery(selector, fingerprint);
    const res = await this.request<{ value?: string | null }>(
      "GET",
      this.instancePath(type, instanceId, `/value${qs}`),
    );
    return res.value ?? null;
  }

  async getAttribute(
    instanceId: string,
    name: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const params = new URLSearchParams();
    params.set("name", name);
    if (selector) params.set("selector", selector);
    if (fingerprint) params.set("fingerprint", fingerprint);
    const res = await this.request<{ value?: string | null }>(
      "GET",
      this.instancePath(type, instanceId, `/attribute?${params.toString()}`),
    );
    return res.value ?? null;
  }

  async isVisible(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const qs = this.selectorQuery(selector, fingerprint);
    const res = await this.request<{ visible?: boolean }>(
      "GET",
      this.instancePath(type, instanceId, `/isVisible${qs}`),
    );
    return res.visible ?? false;
  }

  async isEnabled(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const qs = this.selectorQuery(selector, fingerprint);
    const res = await this.request<{ enabled?: boolean }>(
      "GET",
      this.instancePath(type, instanceId, `/isEnabled${qs}`),
    );
    return res.enabled ?? false;
  }

  // -- Element Interactions ---------------------------------------------------

  async click(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    options?: ClickOptions,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/click"),
      {
        selector,
        fingerprint,
        button: options?.button,
        clickCount: options?.clickCount,
        force: options?.force,
        stabilityTimeout: options?.stabilityTimeout,
      },
    );
    return res.ok;
  }

  async doubleClick(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/doubleClick"),
      { selector, fingerprint },
    );
    return res.ok;
  }

  async rightClick(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/rightClick"),
      { selector, fingerprint },
    );
    return res.ok;
  }

  async hover(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/hover"),
      { selector, fingerprint },
    );
    return res.ok;
  }

  async scrollTo(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/scrollTo"),
      { selector, fingerprint },
    );
    return res.ok;
  }

  async focus(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/focus"),
      { selector, fingerprint },
    );
    return res.ok;
  }

  async dragAndDrop(
    instanceId: string,
    sourceSelector?: string,
    sourceFingerprint?: string,
    targetSelector?: string,
    targetFingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/dragAndDrop"),
      {
        sourceSelector,
        sourceFingerprint,
        targetSelector,
        targetFingerprint,
      },
    );
    return res.ok;
  }

  // -- Form Operations -------------------------------------------------------

  async fillForm(
    instanceId: string,
    formData: Record<string, string>,
    options?: FillFormOptions,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/fillForm"),
      {
        formData,
        typingMode: options?.typingMode,
        typingDelayMs: options?.typingDelayMs,
      },
    );
    return res.ok;
  }

  async input(
    instanceId: string,
    selector: string,
    value: string,
    options?: InputOptions,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/input"),
      {
        selector,
        value,
        typingMode: options?.typingMode,
        typingDelayMs: options?.typingDelayMs,
      },
    );
    return res.ok;
  }

  async clearInput(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/clearInput"),
      { selector, fingerprint },
    );
    return res.ok;
  }

  async submit(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/submit"),
      { selector, fingerprint },
    );
    return res.ok;
  }

  async selectOption(
    instanceId: string,
    value: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/selectOption"),
      { selector, fingerprint, value },
    );
    return res.ok;
  }

  async setChecked(
    instanceId: string,
    checked: boolean,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/setChecked"),
      { selector, fingerprint, checked },
    );
    return res.ok;
  }

  // -- Waiting ----------------------------------------------------------------

  async waitForElement(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    timeout?: number,
    state?: WaitForElementState,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<{ ok?: boolean; found?: boolean }>(
      "POST",
      this.instancePath(type, instanceId, "/waitForElement"),
      {
        selector,
        fingerprint,
        timeout: timeout ?? 5000,
        state: state ?? "attached",
      },
    );
    return res.found ?? res.ok ?? false;
  }

  async waitForReady(
    instanceId: string,
    timeout?: number,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/waitForReady"),
      { timeout: timeout ?? 15000 },
    );
    return res.ok;
  }

  async waitForNetworkIdle(
    instanceId: string,
    options?: NetworkIdleOptions,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/waitForNetworkIdle"),
      {
        timeout: options?.timeout ?? 5000,
        maxInflight: options?.maxInflight,
        idleDuration: options?.idleDuration,
        ignorePatterns: options?.ignorePatterns,
      },
    );
    return res.ok;
  }

  // -- Screenshots ------------------------------------------------------------

  async takeScreenshot(
    instanceId: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const res = await this.request<{ image?: string }>(
      "GET",
      this.instancePath(type, instanceId, "/screenshot"),
    );
    return res.image ? this.stripBase64Prefix(res.image) : null;
  }

  async takeElementScreenshot(
    instanceId: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const qs = this.selectorQuery(selector, fingerprint);
    const res = await this.request<{ image?: string }>(
      "GET",
      this.instancePath(type, instanceId, `/elementScreenshot${qs}`),
    );
    return res.image ? this.stripBase64Prefix(res.image) : null;
  }

  async takeFullPageScreenshot(
    instanceId: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const res = await this.request<{ image?: string }>(
      "GET",
      this.instancePath(type, instanceId, "/fullPageScreenshot"),
    );
    return res.image ? this.stripBase64Prefix(res.image) : null;
  }

  async takeRegionScreenshot(
    instanceId: string,
    rect?: ScreenshotRect,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const res = await this.request<{ image?: string }>(
      "POST",
      this.instancePath(type, instanceId, "/regionScreenshot"),
      { rect },
    );
    return res.image ? this.stripBase64Prefix(res.image) : null;
  }

  // -- Cookies ----------------------------------------------------------------

  async getCookies(
    instanceId: string,
    type: InstanceType = "tab",
  ): Promise<CookieData[]> {
    const res = await this.request<{ cookies?: CookieData[] }>(
      "GET",
      this.instancePath(type, instanceId, "/cookies"),
    );
    return res.cookies ?? [];
  }

  async setCookie(
    instanceId: string,
    cookie: CookieData,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/cookie"),
      cookie,
    );
    return res.ok;
  }

  // -- Dialogs ----------------------------------------------------------------

  async acceptAlert(
    instanceId: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/acceptAlert"),
    );
    return res.ok;
  }

  async dismissAlert(
    instanceId: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/dismissAlert"),
    );
    return res.ok;
  }

  // -- Advanced DOM -----------------------------------------------------------

  async setInnerHTML(
    instanceId: string,
    html: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/setInnerHTML"),
      { selector, fingerprint, html },
    );
    return res.ok;
  }

  async setTextContent(
    instanceId: string,
    text: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/setTextContent"),
      { selector, fingerprint, text },
    );
    return res.ok;
  }

  async dispatchEvent(
    instanceId: string,
    eventType: string,
    selector?: string,
    fingerprint?: string,
    options?: EventOptions,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/dispatchEvent"),
      { selector, fingerprint, eventType, options },
    );
    return res.ok;
  }

  async pressKey(
    instanceId: string,
    key: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/pressKey"),
      { key },
    );
    return res.ok;
  }

  async uploadFile(
    instanceId: string,
    filePath: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/uploadFile"),
      { selector, fingerprint, filePath },
    );
    return res.ok;
  }

  async dispatchTextInput(
    instanceId: string,
    text: string,
    selector?: string,
    fingerprint?: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/dispatchTextInput"),
      { selector, fingerprint, text },
    );
    return res.ok;
  }

  async resolveFingerprint(
    instanceId: string,
    fingerprint: string,
    type: InstanceType = "tab",
  ): Promise<string | null> {
    const qs = `?fingerprint=${encodeURIComponent(fingerprint)}`;
    const res = await this.request<{ selector?: string }>(
      "GET",
      this.instancePath(type, instanceId, `/resolveFingerprint${qs}`),
    );
    return res.selector ?? null;
  }

  async clearEffects(
    instanceId: string,
    type: InstanceType = "tab",
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      this.instancePath(type, instanceId, "/clearEffects"),
    );
    return res.ok;
  }

  // -- Workspaces -------------------------------------------------------------

  async listWorkspaces(): Promise<WorkspaceInfo[]> {
    const res = await this.request<{ workspaces?: WorkspaceInfo[] }>(
      "GET",
      "/workspaces/",
    );
    return res.workspaces ?? [];
  }

  async getCurrentWorkspace(): Promise<string | null> {
    const res = await this.request<{ currentId?: string }>(
      "GET",
      "/workspaces/current",
    );
    return res.currentId ?? null;
  }

  async switchWorkspace(workspaceId: string): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      `/workspaces/${encodeURIComponent(workspaceId)}/switch`,
    );
    return res.ok;
  }

  async switchToNextWorkspace(): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      "/workspaces/next",
    );
    return res.ok;
  }

  async switchToPreviousWorkspace(): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      "/workspaces/previous",
    );
    return res.ok;
  }

  // -- JavaScript Evaluation --------------------------------------------------

  /**
   * Evaluate a JavaScript string in the page context.
   * Supports async/await. Returns a structured result.
   */
  async evaluate(
    instanceId: string,
    script: string,
    type: InstanceType = "tab",
  ): Promise<EvaluateResult | null> {
    return this.request<EvaluateResult>(
      "POST",
      this.instancePath(type, instanceId, "/evaluate"),
      { script },
    );
  }
}
