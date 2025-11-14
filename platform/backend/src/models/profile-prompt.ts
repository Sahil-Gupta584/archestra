import { and, asc, eq } from "drizzle-orm";
import db, { schema } from "@/database";

export interface AgentPrompt {
  id: string;
  agentId: string;
  promptId: string;
  order: number;
  createdAt: Date;
}

export interface CreateAgentPromptInput {
  agentId: string;
  promptId: string;
  order?: number;
}

export interface AssignPromptsInput {
  agentId: string;
  systemPromptId?: string | null;
  regularPromptIds?: string[];
}

/**
 * Model for managing profile-prompt relationships
 * Handles assigning prompts to profiles
 */
class ProfilePromptModel {
  /**
   * Assign a single prompt to a profile
   */
  static async create(input: CreateAgentPromptInput): Promise<AgentPrompt> {
    const [profilePrompt] = await db
      .insert(schema.agentPromptsTable)
      .values({
        agentId: input.agentId,
        promptId: input.promptId,
        order: input.order || 0,
      })
      .returning();

    return profilePrompt as AgentPrompt;
  }

  /**
   * Get all prompts assigned to a profile
   * Returns prompts ordered by the order field
   */
  static async findByProfileId(profileId: string): Promise<AgentPrompt[]> {
    const profilePrompts = await db
      .select()
      .from(schema.agentPromptsTable)
      .where(eq(schema.agentPromptsTable.agentId, profileId))
      .orderBy(asc(schema.agentPromptsTable.order));

    return profilePrompts as AgentPrompt[];
  }

  /**
   * Get all prompts assigned to a profile with full prompt details
   */
  static async findByProfileIdWithPrompts(profileId: string) {
    const profilePrompts = await db
      .select({
        id: schema.agentPromptsTable.id,
        agentId: schema.agentPromptsTable.agentId,
        promptId: schema.agentPromptsTable.promptId,
        order: schema.agentPromptsTable.order,
        createdAt: schema.agentPromptsTable.createdAt,
        prompt: {
          id: schema.promptsTable.id,
          organizationId: schema.promptsTable.organizationId,
          name: schema.promptsTable.name,
          type: schema.promptsTable.type,
          content: schema.promptsTable.content,
          version: schema.promptsTable.version,
          parentPromptId: schema.promptsTable.parentPromptId,
          isActive: schema.promptsTable.isActive,
          createdBy: schema.promptsTable.createdBy,
          createdAt: schema.promptsTable.createdAt,
          updatedAt: schema.promptsTable.updatedAt,
        },
      })
      .from(schema.agentPromptsTable)
      .innerJoin(
        schema.promptsTable,
        eq(schema.agentPromptsTable.promptId, schema.promptsTable.id),
      )
      .where(eq(schema.agentPromptsTable.agentId, profileId))
      .orderBy(asc(schema.agentPromptsTable.order));

    return profilePrompts;
  }

  /**
   * Remove a prompt from a profile
   */
  static async delete(profileId: string, promptId: string): Promise<boolean> {
    const result = await db
      .delete(schema.agentPromptsTable)
      .where(
        and(
          eq(schema.agentPromptsTable.agentId, profileId),
          eq(schema.agentPromptsTable.promptId, promptId),
        ),
      );

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Remove all prompts from a profile
   */
  static async deleteAllByProfileId(profileId: string): Promise<boolean> {
    const result = await db
      .delete(schema.agentPromptsTable)
      .where(eq(schema.agentPromptsTable.agentId, profileId));

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Replace all prompts for a profile
   * Removes existing prompts and assigns new ones
   */
  static async replacePrompts(
    input: AssignPromptsInput,
  ): Promise<AgentPrompt[]> {
    // Delete all existing prompts for this profile
    await ProfilePromptModel.deleteAllByProfileId(input.agentId);

    const newProfilePrompts: AgentPrompt[] = [];

    // Add system prompt if provided (order 0)
    if (input.systemPromptId) {
      const systemPrompt = await ProfilePromptModel.create({
        agentId: input.agentId,
        promptId: input.systemPromptId,
        order: 0,
      });
      newProfilePrompts.push(systemPrompt);
    }

    // Add regular prompts if provided (order 1, 2, 3, ...)
    if (input.regularPromptIds && input.regularPromptIds.length > 0) {
      for (let i = 0; i < input.regularPromptIds.length; i++) {
        const regularPrompt = await ProfilePromptModel.create({
          agentId: input.agentId,
          promptId: input.regularPromptIds[i],
          order: i + 1,
        });
        newProfilePrompts.push(regularPrompt);
      }
    }

    return newProfilePrompts;
  }
}

export default ProfilePromptModel;
