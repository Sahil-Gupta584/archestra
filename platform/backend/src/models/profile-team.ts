import { and, eq, inArray } from "drizzle-orm";
import db, { schema } from "@/database";

class ProfileTeamModel {
  /**
   * Get all profile IDs that a user has access to (through team membership)
   */
  static async getUserAccessibleProfileIds(
    userId: string,
    isProfileAdmin: boolean,
  ): Promise<string[]> {
    // Profile admins have access to all profiles
    if (isProfileAdmin) {
      const allProfiles = await db
        .select({ id: schema.agentsTable.id })
        .from(schema.agentsTable);
      return allProfiles.map((profile) => profile.id);
    }

    // Get all team IDs the user is a member of
    const userTeams = await db
      .select({ teamId: schema.teamMembersTable.teamId })
      .from(schema.teamMembersTable)
      .where(eq(schema.teamMembersTable.userId, userId));

    const teamIds = userTeams.map((t) => t.teamId);

    if (teamIds.length === 0) {
      return [];
    }

    // Get all profiles assigned to these teams
    const profileTeams = await db
      .select({ agentId: schema.agentTeamsTable.agentId })
      .from(schema.agentTeamsTable)
      .where(inArray(schema.agentTeamsTable.teamId, teamIds));

    return profileTeams.map((pt) => pt.agentId);
  }

  /**
   * Check if a user has access to a specific profile (through team membership)
   */
  static async userHasProfileAccess(
    userId: string,
    profileId: string,
    isProfileAdmin: boolean,
  ): Promise<boolean> {
    // Profile admins have access to all profiles
    if (isProfileAdmin) {
      return true;
    }

    // Get all team IDs the user is a member of
    const userTeams = await db
      .select({ teamId: schema.teamMembersTable.teamId })
      .from(schema.teamMembersTable)
      .where(eq(schema.teamMembersTable.userId, userId));

    const teamIds = userTeams.map((t) => t.teamId);

    if (teamIds.length === 0) {
      return false;
    }

    // Check if the profile is assigned to any of the user's teams
    const profileTeam = await db
      .select()
      .from(schema.agentTeamsTable)
      .where(
        and(
          eq(schema.agentTeamsTable.agentId, profileId),
          inArray(schema.agentTeamsTable.teamId, teamIds),
        ),
      )
      .limit(1);

    return profileTeam.length > 0;
  }

  /**
   * Get all team IDs assigned to a specific profile
   */
  static async getTeamsForProfile(profileId: string): Promise<string[]> {
    const profileTeams = await db
      .select({ teamId: schema.agentTeamsTable.teamId })
      .from(schema.agentTeamsTable)
      .where(eq(schema.agentTeamsTable.agentId, profileId));

    return profileTeams.map((pt) => pt.teamId);
  }

  /**
   * Sync team assignments for a profile (replaces all existing assignments)
   */
  static async syncProfileTeams(
    profileId: string,
    teamIds: string[],
  ): Promise<number> {
    await db.transaction(async (tx) => {
      // Delete all existing team assignments
      await tx
        .delete(schema.agentTeamsTable)
        .where(eq(schema.agentTeamsTable.agentId, profileId));

      // Insert new team assignments (if any teams provided)
      if (teamIds.length > 0) {
        await tx.insert(schema.agentTeamsTable).values(
          teamIds.map((teamId) => ({
            agentId: profileId,
            teamId,
          })),
        );
      }
    });

    return teamIds.length;
  }

  /**
   * Assign teams to a profile (idempotent)
   */
  static async assignTeamsToProfile(
    profileId: string,
    teamIds: string[],
  ): Promise<void> {
    if (teamIds.length === 0) return;

    await db
      .insert(schema.agentTeamsTable)
      .values(
        teamIds.map((teamId) => ({
          agentId: profileId,
          teamId,
        })),
      )
      .onConflictDoNothing();
  }

  /**
   * Remove a team assignment from a profile
   */
  static async removeTeamFromProfile(
    profileId: string,
    teamId: string,
  ): Promise<boolean> {
    const result = await db
      .delete(schema.agentTeamsTable)
      .where(
        and(
          eq(schema.agentTeamsTable.agentId, profileId),
          eq(schema.agentTeamsTable.teamId, teamId),
        ),
      );

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Check if a profile and MCP server share any teams
   * Returns true if there's at least one team that both the profile and MCP server are assigned to
   */
  static async profileAndMcpServerShareTeam(
    profileId: string,
    mcpServerId: string,
  ): Promise<boolean> {
    const result = await db
      .select({ teamId: schema.agentTeamsTable.teamId })
      .from(schema.agentTeamsTable)
      .innerJoin(
        schema.mcpServerTeamsTable,
        eq(schema.agentTeamsTable.teamId, schema.mcpServerTeamsTable.teamId),
      )
      .where(
        and(
          eq(schema.agentTeamsTable.agentId, profileId),
          eq(schema.mcpServerTeamsTable.mcpServerId, mcpServerId),
        ),
      )
      .limit(1);

    return result.length > 0;
  }
}

export default ProfileTeamModel;
