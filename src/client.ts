import fetch from "node-fetch";
import {
  Tab,
  HistoryItem,
  Download,
  HealthResponse,
  OkResponse,
  InstanceInfo,
} from "./api-types.js";

export class FloorpClient {
  private baseUrl: string;
  private token: string;

  constructor(port: number = 58261, token: string = "") {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.token = token;
  }

  private stripBase64Prefix(data: string): string {
    return data.replace(/^data:image\/[a-z]+;base64,/, "");
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
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

    const response = await fetch(`${this.baseUrl}${path}`, fetchOptions);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Floorp API Error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  // -- Browser Info --

  async checkHealth(): Promise<boolean> {
    try {
      const res = await this.request<HealthResponse>("GET", "/health");
      return res.status === "ok";
    } catch {
      return false;
    }
  }

  async getTabs(): Promise<Tab[]> {
    return this.request<Tab[]>("GET", "/browser/tabs");
  }

  async getHistory(limit: number = 20): Promise<HistoryItem[]> {
    return this.request<HistoryItem[]>(
      "GET",
      `/browser/history?limit=${limit}`
    );
  }

  async getDownloads(limit: number = 20): Promise<Download[]> {
    return this.request<Download[]>("GET", `/browser/downloads?limit=${limit}`);
  }

  // -- Tab Automation --

  async listTabInstances(): Promise<InstanceInfo[]> {
    return this.request<InstanceInfo[]>("GET", "/tabs/list");
  }

  async createTab(url: string, inBackground: boolean = false): Promise<string> {
    const res = await this.request<{ instanceId: string }>(
      "POST",
      "/tabs/instances",
      { url, inBackground }
    );
    return res.instanceId;
  }

  async attachToTab(browserId: number): Promise<string> {
    const res = await this.request<{ instanceId: string }>(
      "POST",
      "/tabs/attach",
      { browserId: String(browserId) }
    );
    return res.instanceId;
  }

  // -- Shared Automation --

  async navigate(instanceId: string, url: string): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      `/tabs/instances/${instanceId}/navigate`,
      { url }
    );
    return res.ok;
  }

  async getURI(instanceId: string): Promise<string | null> {
    const res = await this.request<{ uri: string | null }>(
      "GET",
      `/tabs/instances/${instanceId}/uri`
    );
    return res.uri;
  }

  async getHTML(instanceId: string): Promise<string | null> {
    const res = await this.request<{ html?: string }>(
      "GET",
      `/tabs/instances/${instanceId}/html`
    );
    return res.html ?? null;
  }

  async getElementTextContent(
    instanceId: string,
    selector: string
  ): Promise<string | null> {
    const res = await this.request<{ text?: string }>(
      "GET",
      `/tabs/instances/${instanceId}/elementTextContent?selector=${encodeURIComponent(
        selector
      )}`
    );
    return res.text ?? null;
  }

  async click(instanceId: string, selector: string): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      `/tabs/instances/${instanceId}/click`,
      { selector }
    );
    return res.ok;
  }

  async hover(instanceId: string, selector: string): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      `/tabs/instances/${instanceId}/hover`,
      { selector }
    );
    return res.ok;
  }

  async scrollTo(instanceId: string, selector: string): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      `/tabs/instances/${instanceId}/scrollTo`,
      { selector }
    );
    return res.ok;
  }

  async waitForElement(
    instanceId: string,
    selector: string,
    timeout: number = 5000
  ): Promise<boolean> {
    const res = await this.request<{ found: boolean }>(
      "POST",
      `/tabs/instances/${instanceId}/waitForElement`,
      { selector, timeout }
    );
    return res.found;
  }

  async fillForm(
    instanceId: string,
    formData: Record<string, string>
  ): Promise<boolean> {
    const res = await this.request<OkResponse>(
      "POST",
      `/tabs/instances/${instanceId}/fillForm`,
      { formData }
    );
    return res.ok;
  }

  async getValue(instanceId: string, selector: string): Promise<string | null> {
    const res = await this.request<{ value?: string }>(
      "GET",
      `/tabs/instances/${instanceId}/value?selector=${encodeURIComponent(
        selector
      )}`
    );
    return res.value ?? null;
  }

  async getCookies(instanceId: string): Promise<Record<string, any>> {
    const res = await this.request<{ cookies: any }>(
      "GET",
      `/tabs/instances/${instanceId}/cookies`
    );
    return res.cookies;
  }

  async takeScreenshot(
    instanceId: string,
    selector?: string
  ): Promise<string | null> {
    const path = selector
      ? `/tabs/instances/${instanceId}/elementScreenshot?selector=${encodeURIComponent(
          selector
        )}`
      : `/tabs/instances/${instanceId}/screenshot`;
    const res = await this.request<{ image?: string }>("GET", path);
    return res.image ? this.stripBase64Prefix(res.image) : null;
  }

  async takeFullPageScreenshot(instanceId: string): Promise<string | null> {
    const res = await this.request<{ image?: string }>(
      "GET",
      `/tabs/instances/${instanceId}/fullPageScreenshot`
    );
    return res.image ? this.stripBase64Prefix(res.image) : null;
  }
}
