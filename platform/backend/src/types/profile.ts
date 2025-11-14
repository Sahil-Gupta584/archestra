import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import { schema } from "@/database";
import { ProfileLabelWithDetailsSchema } from "./label";
import { SelectToolSchema } from "./tool";

export const SelectProfileSchema = createSelectSchema(schema.agentsTable).extend({
  tools: z.array(SelectToolSchema),
  teams: z.array(z.string()),
  labels: z.array(ProfileLabelWithDetailsSchema),
});
export const InsertProfileSchema = createInsertSchema(schema.agentsTable).extend({
  teams: z.array(z.string()),
  labels: z.array(ProfileLabelWithDetailsSchema).optional(),
});

export const UpdateProfileSchema = createUpdateSchema(schema.agentsTable).extend({
  teams: z.array(z.string()),
  labels: z.array(ProfileLabelWithDetailsSchema).optional(),
});

export type Profile = z.infer<typeof SelectProfileSchema>;
export type InsertProfile = z.infer<typeof InsertProfileSchema>;
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
