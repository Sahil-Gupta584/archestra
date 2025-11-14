import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import { schema } from "@/database";
import { UuidIdSchema } from "./api";
import { ToolParametersContentSchema } from "./tool";

const ToolResultTreatmentSchema = z.enum([
  "trusted",
  "sanitize_with_dual_llm",
  "untrusted",
]);

export const SelectProfileToolSchema = createSelectSchema(
  schema.agentToolsTable,
  {
    toolResultTreatment: ToolResultTreatmentSchema,
  },
)
  .omit({
    profileId: true,
    toolId: true,
  })
  .extend({
    profile: z.object({
      id: z.string(),
      name: z.string(),
    }),
    tool: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      parameters: ToolParametersContentSchema,
      createdAt: z.date(),
      updatedAt: z.date(),
      catalogId: z.string().nullable(),
      mcpServerId: z.string().nullable(),
      mcpServerName: z.string().nullable(),
      mcpServerCatalogId: z.string().nullable(),
    }),
  });

export const InsertProfileToolSchema = createInsertSchema(
  schema.agentToolsTable,
  {
    toolResultTreatment: ToolResultTreatmentSchema,
  },
);
export const UpdateProfileToolSchema = createUpdateSchema(
  schema.agentToolsTable,
  {
    toolResultTreatment: ToolResultTreatmentSchema,
  },
);

export const ProfileToolFilterSchema = z.object({
  search: z.string().optional(),
  profileId: UuidIdSchema.optional(),
  origin: z.string().optional().describe("Can be 'llm-proxy' or a catalogId"),
  credentialSourceMcpServerId:
    UuidIdSchema.optional().describe("MCP server ID"),
  excludeArchestraTools: z.boolean().optional().describe("For test isolation"),
});
export const ProfileToolSortBySchema = z.enum([
  "name",
  "profile",
  "origin",
  "createdAt",
  "allowUsageWhenUntrustedDataIsPresent",
]);
export const ProfileToolSortDirectionSchema = z.enum(["asc", "desc"]);

export type ProfileTool = z.infer<typeof SelectProfileToolSchema>;
export type InsertProfileTool = z.infer<typeof InsertProfileToolSchema>;
export type UpdateProfileTool = z.infer<typeof UpdateProfileToolSchema>;

export type ToolResultTreatment = z.infer<typeof ToolResultTreatmentSchema>;

export type ProfileToolFilters = z.infer<typeof ProfileToolFilterSchema>;
export type ProfileToolSortBy = z.infer<typeof ProfileToolSortBySchema>;
export type ProfileToolSortDirection = z.infer<
  typeof ProfileToolSortDirectionSchema
>;
