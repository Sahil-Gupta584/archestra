import { DEFAULT_AGENT_NAME } from "@shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  min,
  type SQL,
  sql,
} from "drizzle-orm";
import db, { schema } from "@/database";
import {
  createPaginatedResult,
  type PaginatedResult,
} from "@/database/utils/pagination";
import type {
  Agent,
  InsertAgent,
  PaginationQuery,
  SortingQuery,
  UpdateAgent,
} from "@/types";
import ProfileLabelModel from "./profile-label";
import ProfileTeamModel from "./profile-team";
import ToolModel from "./tool";

class ProfileModel {
  static async create({
    teams,
    labels,
    ...profile
  }: InsertAgent): Promise<Agent> {
    const [createdProfile] = await db
      .insert(schema.agentsTable)
      .values(profile)
      .returning();

    // Assign teams to the profile if provided
    if (teams && teams.length > 0) {
      await ProfileTeamModel.assignTeamsToProfile(createdProfile.id, teams);
    }

    // Assign labels to the profile if provided
    if (labels && labels.length > 0) {
      await ProfileLabelModel.syncProfileLabels(createdProfile.id, labels);
    }

    // Assign Archestra built-in tools to the profile
    await ToolModel.assignArchestraToolsToProfile(createdProfile.id);

    return {
      ...createdProfile,
      tools: [],
      teams: teams || [],
      labels: await ProfileLabelModel.getLabelsForProfile(createdProfile.id),
    };
  }

  static async findAll(
    userId?: string,
    isProfileAdmin?: boolean,
  ): Promise<Agent[]> {
    let query = db
      .select()
      .from(schema.agentsTable)
      .leftJoin(
        schema.agentToolsTable,
        eq(schema.agentsTable.id, schema.agentToolsTable.agentId),
      )
      .leftJoin(
        schema.toolsTable,
        eq(schema.agentToolsTable.toolId, schema.toolsTable.id),
      )
      .$dynamic();

    // Build where conditions
    const whereConditions: SQL[] = [];

    // Apply access control filtering for non-profile admins
    if (userId && !isProfileAdmin) {
      const accessibleProfileIds = await ProfileTeamModel.getUserAccessibleProfileIds(
        userId,
        false,
      );

      if (accessibleProfileIds.length === 0) {
        return [];
      }

      whereConditions.push(inArray(schema.agentsTable.id, accessibleProfileIds));
    }

    // Apply all where conditions if any exist
    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions));
    }

    const rows = await query;

    // Group the flat join results by profile
    const profilesMap = new Map<string, Agent>();

    for (const row of rows) {
      const profile = row.agents;
      const tool = row.tools;

      if (!profilesMap.has(profile.id)) {
        profilesMap.set(profile.id, {
          ...profile,
          tools: [],
          teams: [],
          labels: [],
        });
      }

      // Add tool if it exists (leftJoin returns null for profiles with no tools)
      if (tool) {
        profilesMap.get(profile.id)?.tools.push(tool);
      }
    }

    const profiles = Array.from(profilesMap.values());

    // Populate teams and labels for each profile
    for (const profile of profiles) {
      profile.teams = await ProfileTeamModel.getTeamsForProfile(profile.id);
      profile.labels = await ProfileLabelModel.getLabelsForProfile(profile.id);
    }

    return profiles;
  }

  /**
   * Find all profiles with pagination, sorting, and filtering support
   */
  static async findAllPaginated(
    pagination: PaginationQuery,
    sorting?: SortingQuery,
    filters?: { name?: string },
    userId?: string,
    isProfileAdmin?: boolean,
  ): Promise<PaginatedResult<Agent>> {
    // Determine the ORDER BY clause based on sorting params
    const orderByClause = ProfileModel.getOrderByClause(sorting);

    // Build where clause for filters and access control
    const whereConditions: SQL[] = [];

    // Add name filter if provided
    if (filters?.name) {
      whereConditions.push(ilike(schema.agentsTable.name, `%${filters.name}%`));
    }

    // Apply access control filtering for non-profile admins
    if (userId && !isProfileAdmin) {
      const accessibleProfileIds = await ProfileTeamModel.getUserAccessibleProfileIds(
        userId,
        false,
      );

      if (accessibleProfileIds.length === 0) {
        return createPaginatedResult([], 0, pagination);
      }

      whereConditions.push(inArray(schema.agentsTable.id, accessibleProfileIds));
    }

    const whereClause =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Step 1: Get paginated profile IDs with proper sorting
    // This ensures LIMIT/OFFSET applies to profiles, not to joined rows with tools
    let query = db
      .select({ id: schema.agentsTable.id })
      .from(schema.agentsTable)
      .where(whereClause)
      .$dynamic();

    const direction = sorting?.sortDirection === "asc" ? asc : desc;

    // Add sorting-specific joins and order by
    if (sorting?.sortBy === "toolsCount") {
      const toolsCountSubquery = db
        .select({
          agentId: schema.agentToolsTable.agentId,
          toolsCount: count(schema.agentToolsTable.toolId).as("toolsCount"),
        })
        .from(schema.agentToolsTable)
        .groupBy(schema.agentToolsTable.agentId)
        .as("toolsCounts");

      query = query
        .leftJoin(
          toolsCountSubquery,
          eq(schema.agentsTable.id, toolsCountSubquery.agentId),
        )
        .orderBy(direction(sql`COALESCE(${toolsCountSubquery.toolsCount}, 0)`));
    } else if (sorting?.sortBy === "team") {
      const teamNameSubquery = db
        .select({
          agentId: schema.agentTeamsTable.agentId,
          teamName: min(schema.teamsTable.name).as("teamName"),
        })
        .from(schema.agentTeamsTable)
        .leftJoin(
          schema.teamsTable,
          eq(schema.agentTeamsTable.teamId, schema.teamsTable.id),
        )
        .groupBy(schema.agentTeamsTable.agentId)
        .as("teamNames");

      query = query
        .leftJoin(
          teamNameSubquery,
          eq(schema.agentsTable.id, teamNameSubquery.agentId),
        )
        .orderBy(direction(sql`COALESCE(${teamNameSubquery.teamName}, '')`));
    } else {
      query = query.orderBy(orderByClause);
    }

    const sortedProfiles = await query
      .limit(pagination.limit)
      .offset(pagination.offset);

    const sortedProfileIds = sortedProfiles.map((p) => p.id);

    // If no profiles match, return early
    if (sortedProfileIds.length === 0) {
      const [{ total }] = await db
        .select({ total: count() })
        .from(schema.agentsTable)
        .where(whereClause);
      return createPaginatedResult([], Number(total), pagination);
    }

    // Step 2: Get full profile data with tools for the paginated profile IDs
    const [profilesData, [{ total: totalResult }]] = await Promise.all([
      db
        .select()
        .from(schema.agentsTable)
        .leftJoin(
          schema.agentToolsTable,
          eq(schema.agentsTable.id, schema.agentToolsTable.agentId),
        )
        .leftJoin(
          schema.toolsTable,
          eq(schema.agentToolsTable.toolId, schema.toolsTable.id),
        )
        .where(inArray(schema.agentsTable.id, sortedProfileIds)),
      db.select({ total: count() }).from(schema.agentsTable).where(whereClause),
    ]);

    // Sort in memory to maintain the order from the sorted query
    const orderMap = new Map(sortedProfileIds.map((id, index) => [id, index]));
    profilesData.sort(
      (a, b) =>
        (orderMap.get(a.agents.id) ?? 0) - (orderMap.get(b.agents.id) ?? 0),
    );

    // Group the flat join results by profile
    const profilesMap = new Map<string, Agent>();

    for (const row of profilesData) {
      const profile = row.agents;
      const tool = row.tools;

      if (!profilesMap.has(profile.id)) {
        profilesMap.set(profile.id, {
          ...profile,
          tools: [],
          teams: [],
          labels: [],
        });
      }

      // Add tool if it exists (leftJoin returns null for profiles with no tools)
      if (tool) {
        profilesMap.get(profile.id)?.tools.push(tool);
      }
    }

    const profiles = Array.from(profilesMap.values());

    // Populate teams and labels for each profile
    for (const profile of profiles) {
      profile.teams = await ProfileTeamModel.getTeamsForProfile(profile.id);
      profile.labels = await ProfileLabelModel.getLabelsForProfile(profile.id);
    }

    return createPaginatedResult(profiles, Number(totalResult), pagination);
  }

  /**
   * Helper to get the appropriate ORDER BY clause based on sorting params
   */
  private static getOrderByClause(sorting?: SortingQuery) {
    const direction = sorting?.sortDirection === "asc" ? asc : desc;

    switch (sorting?.sortBy) {
      case "name":
        return direction(schema.agentsTable.name);
      case "createdAt":
        return direction(schema.agentsTable.createdAt);
      case "toolsCount":
      case "team":
        // toolsCount and team sorting use a separate query path (see lines 168-267).
        // This fallback should never be reached for these sort types.
        return direction(schema.agentsTable.createdAt); // Fallback
      default:
        // Default: newest first
        return desc(schema.agentsTable.createdAt);
    }
  }

  static async findById(
    id: string,
    userId?: string,
    isProfileAdmin?: boolean,
  ): Promise<Agent | null> {
    // Check access control for non-profile admins
    if (userId && !isProfileAdmin) {
      const hasAccess = await ProfileTeamModel.userHasProfileAccess(
        userId,
        id,
        false,
      );
      if (!hasAccess) {
        return null;
      }
    }

    const rows = await db
      .select()
      .from(schema.agentsTable)
      .leftJoin(
        schema.toolsTable,
        eq(schema.agentsTable.id, schema.toolsTable.agentId),
      )
      .where(eq(schema.agentsTable.id, id));

    if (rows.length === 0) {
      return null;
    }

    const profile = rows[0].agents;
    const tools = rows.map((row) => row.tools).filter((tool) => tool !== null);

    const teams = await ProfileTeamModel.getTeamsForProfile(id);
    const labels = await ProfileLabelModel.getLabelsForProfile(id);

    return {
      ...profile,
      tools,
      teams,
      labels,
    };
  }

  static async getProfileOrCreateDefault(name?: string): Promise<Agent> {
    // First, try to find a profile with isDefault=true
    const rows = await db
      .select()
      .from(schema.agentsTable)
      .leftJoin(
        schema.toolsTable,
        eq(schema.agentsTable.id, schema.toolsTable.agentId),
      )
      .where(eq(schema.agentsTable.isDefault, true));

    if (rows.length > 0) {
      // Default profile exists, return it
      const profile = rows[0].agents;
      const tools = rows
        .map((row) => row.tools)
        .filter((tool) => tool !== null);

      return {
        ...profile,
        tools,
        teams: await ProfileTeamModel.getTeamsForProfile(profile.id),
        labels: await ProfileLabelModel.getLabelsForProfile(profile.id),
      };
    }

    // No default profile exists, create one
    return ProfileModel.create({
      name: name || DEFAULT_AGENT_NAME,
      isDefault: true,
      teams: [],
      labels: [],
    });
  }

  static async update(
    id: string,
    { teams, labels, ...profile }: Partial<UpdateAgent>,
  ): Promise<Agent | null> {
    let updatedProfile: Omit<Agent, "tools" | "teams" | "labels"> | undefined;

    // If setting isDefault to true, unset all other profiles' isDefault first
    if (profile.isDefault === true) {
      await db
        .update(schema.agentsTable)
        .set({ isDefault: false })
        .where(eq(schema.agentsTable.isDefault, true));
    }

    // Only update profile table if there are fields to update
    if (Object.keys(profile).length > 0) {
      [updatedProfile] = await db
        .update(schema.agentsTable)
        .set(profile)
        .where(eq(schema.agentsTable.id, id))
        .returning();

      if (!updatedProfile) {
        return null;
      }
    } else {
      // If only updating teams, fetch the existing profile
      const [existingProfile] = await db
        .select()
        .from(schema.agentsTable)
        .where(eq(schema.agentsTable.id, id));

      if (!existingProfile) {
        return null;
      }

      updatedProfile = existingProfile;
    }

    // Sync team assignments if teams is provided
    if (teams !== undefined) {
      await ProfileTeamModel.syncProfileTeams(id, teams);
    }

    // Sync label assignments if labels is provided
    if (labels !== undefined) {
      await ProfileLabelModel.syncProfileLabels(id, labels);
    }

    // Fetch the tools for the updated profile
    const tools = await db
      .select()
      .from(schema.toolsTable)
      .where(eq(schema.toolsTable.agentId, updatedProfile.id));

    // Fetch current teams and labels
    const currentTeams = await ProfileTeamModel.getTeamsForProfile(id);
    const currentLabels = await ProfileLabelModel.getLabelsForProfile(id);

    return {
      ...updatedProfile,
      tools,
      teams: currentTeams,
      labels: currentLabels,
    };
  }

  static async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.agentsTable)
      .where(eq(schema.agentsTable.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
}

export default ProfileModel;
