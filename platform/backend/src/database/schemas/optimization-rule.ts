import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import profilesTable from "./profile";

const optimizationRulesTable = pgTable("optimization_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  ruleType: text("rule_type").notNull(),
  conditions: jsonb("conditions").notNull(),
  provider: text("provider").notNull(),
  targetModel: text("target_model").notNull(),
  priority: integer("priority").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export default optimizationRulesTable;

// Type-safe condition types
export type ContentLengthConditions = {
  maxLength: number;
};

export type ToolPresenceConditions = {
  hasTools: boolean;
};

export type RuleConditions = ContentLengthConditions | ToolPresenceConditions;
