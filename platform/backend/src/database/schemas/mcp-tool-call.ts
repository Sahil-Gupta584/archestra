import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { CommonToolCall } from "@/types";
import profilesTable from "./profile";

const mcpToolCallsTable = pgTable(
  "mcp_tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    mcpServerName: varchar("mcp_server_name", { length: 255 }).notNull(),
    method: varchar("method", { length: 255 }).notNull(),
    toolCall: jsonb("tool_call").$type<CommonToolCall | null>(),
    // toolResult structure varies by method type:
    // - tools/call: { id, content, isError, error? }
    // - tools/list: { tools: [...] }
    // - initialize: { capabilities, serverInfo }
    toolResult: jsonb("tool_result").$type<unknown>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    profileIdIdx: index("mcp_tool_calls_profile_id_idx").on(table.profileId),
    createdAtIdx: index("mcp_tool_calls_created_at_idx").on(table.createdAt),
  }),
);

export default mcpToolCallsTable;
