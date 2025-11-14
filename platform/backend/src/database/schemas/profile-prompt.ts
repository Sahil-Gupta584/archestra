import { integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import profilesTable from "./profile";
import promptsTable from "./prompt";

const profilePromptsTable = pgTable(
  "profile_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => promptsTable.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueProfilePrompt: unique().on(table.profileId, table.promptId),
  }),
);

export default profilePromptsTable;
