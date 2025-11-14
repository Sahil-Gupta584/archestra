import {
  boolean,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { ToolResultTreatment } from "@/types";
import profilesTable from "./profile";
import mcpServerTable from "./mcp-server";
import toolsTable from "./tool";

const profileToolsTable = pgTable(
  "profile_tools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => toolsTable.id, { onDelete: "cascade" }),
    allowUsageWhenUntrustedDataIsPresent: boolean(
      "allow_usage_when_untrusted_data_is_present",
    )
      .notNull()
      .default(false),
    toolResultTreatment: text("tool_result_treatment")
      .$type<ToolResultTreatment>()
      .notNull()
      .default("untrusted"),
    responseModifierTemplate: text("response_modifier_template"),
    credentialSourceMcpServerId: uuid(
      "credential_source_mcp_server_id",
    ).references(() => mcpServerTable.id, { onDelete: "set null" }),
    // executionSourceMcpServerId specifies which MCP server pod to route tool calls to
    // Used for local MCP servers to choose between multiple installations of same catalog
    executionSourceMcpServerId: uuid(
      "execution_source_mcp_server_id",
    ).references(() => mcpServerTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique().on(table.profileId, table.toolId)],
);

export default profileToolsTable;
