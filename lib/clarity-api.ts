const API_BASE_URL =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";

export const AVAILABLE_METRICS = [
  "ScrollDepth",
  "EngagementTime",
  "Traffic",
  "PopularPages",
  "Browser",
  "Device",
  "OS",
  "Country/Region",
  "PageTitle",
  "ReferrerURL",
  "DeadClickCount",
  "ExcessiveScroll",
  "RageClickCount",
  "QuickbackClick",
  "ScriptErrorCount",
  "ErrorClickCount",
] as const;

export const AVAILABLE_DIMENSIONS = [
  "Browser",
  "Device",
  "Country/Region",
  "OS",
  "Source",
  "Medium",
  "Campaign",
  "Channel",
  "URL",
] as const;

export type Metric = (typeof AVAILABLE_METRICS)[number];
export type Dimension = (typeof AVAILABLE_DIMENSIONS)[number];

export interface FetchClarityDataOptions {
  numOfDays: number;
  dimensions?: string[];
  context?: string;
  apiToken?: string;
}

export async function fetchClarityData(
  options: FetchClarityDataOptions
): Promise<unknown> {
  const { numOfDays, dimensions, context, apiToken } = options;
  const token =
    apiToken ??
    process.env["CLARITY_API_TOKEN"] ??
    process.env["clarity_api_token"];

  if (!token) {
    return {
      error:
        "No Clarity API token provided. Please set CLARITY_API_TOKEN environment variable.",
    };
  }

  const params = new URLSearchParams({
    numOfDays: String(numOfDays),
    src: "mcp",
  });

  if (dimensions?.length) {
    dimensions.slice(0, 3).forEach((dim, i) => {
      params.set(`dimension${i + 1}`, dim);
    });
  }

  if (context) {
    params.set("context", context.slice(0, 1024));
  }

  const url = `${API_BASE_URL}?${params.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { error: `API request failed with status ${response.status}` };
    }

    return await response.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { error: "Request timeout - the API took too long to respond" };
    }
    return { error: "Request error - failed to connect to the API" };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function filterMetrics(data: unknown, metrics: string[]): unknown {
  if (!metrics.length || !Array.isArray(data)) return data;

  return data.filter((item: unknown) => {
    if (typeof item !== "object" || item === null || !("metricName" in item))
      return false;
    const name = String((item as Record<string, unknown>)["metricName"])
      .toLowerCase()
      .replace(/\s+/g, "");
    return metrics.some(
      (m) => m.toLowerCase().replace(/\s+/g, "") === name
    );
  });
}
