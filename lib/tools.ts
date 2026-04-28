import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fetchClarityData,
  filterMetrics,
  AVAILABLE_DIMENSIONS,
  AVAILABLE_METRICS,
} from "./clarity-api";

const dimensionEnum = z.enum(AVAILABLE_DIMENSIONS);

const getClarityDataShape = {
  numOfDays: z
    .number()
    .int()
    .min(1)
    .max(3)
    .describe("Number of days to retrieve (1–3)"),
  dimensions: z
    .array(dimensionEnum)
    .max(3)
    .optional()
    .describe(
      `Dimensions to filter by (max 3). Valid values: ${AVAILABLE_DIMENSIONS.join(", ")}`
    ),
  metrics: z
    .array(z.string())
    .optional()
    .describe(
      `Metrics to retrieve. Valid values: ${AVAILABLE_METRICS.join(", ")}`
    ),
  context: z
    .string()
    .max(1024)
    .optional()
    .describe("Additional context for the query (max 1024 chars)"),
};

export function registerTools(server: McpServer): void {
  server.tool(
    "get-clarity-data",
    "Fetch Microsoft Clarity analytics data including session metrics, user behavior, and engagement insights",
    getClarityDataShape,
    async ({ numOfDays, dimensions, metrics, context }) => {
      const data = await fetchClarityData({ numOfDays, dimensions, context });

      if (
        typeof data === "object" &&
        data !== null &&
        "error" in data
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: String((data as Record<string, unknown>)["error"]),
            },
          ],
          isError: true,
        };
      }

      const result =
        metrics && metrics.length > 0 ? filterMetrics(data, metrics) : data;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
