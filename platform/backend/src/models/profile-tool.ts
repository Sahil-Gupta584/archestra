import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  type SQL,
  sql,
} from "drizzle-orm";
import db, { schema } from "@/database";
import {
  createPaginatedResult,
  type PaginatedResult,
} from "@/database/utils/pagination";
import type {
  AgentTool,
  AgentToolFilters,
  AgentToolSortBy,
  AgentToolSortDirection,
  InsertAgentTool,
  PaginationQuery,
  UpdateAgentTool,
} from "@/types";
import ProfileTeamModel from "./profile-team";

class ProfileToolModel {
  static async create(
    profileId: string,
    toolId: string,
    options?: Partial<
      Pick<
        InsertAgentTool,
        | "allowUsageWhenUntrustedDataIsPresent"
        | "toolResultTreatment"
        | "responseModifierTemplate"
        | "credentialSourceMcpServerId"
        | "executionSourceMcpServerId"
      >
    >,
  ) {
    const [profileTool] = await db
      .insert(schema.agentToolsTable)
      .values({
        agentId: profileId,
        toolId,
        ...options,
      })
      .returning();
    return profileTool;
  }

  static async delete(profileId: string, toolId: string): Promise<boolean> {
    const result = await db
      .delete(schema.agentToolsTable)
      .where(
        and(
          eq(schema.agentToolsTable.agentId, profileId),
          eq(schema.agentToolsTable.toolId, toolId),
        ),
      );
    return result.rowCount !== null && result.rowCount > 0;
  }

  static async findToolIdsByProfile(profileId: string): Promise<string[]> {
    const results = await db
      .select({ toolId: schema.agentToolsTable.toolId })
      .from(schema.agentToolsTable)
      .where(eq(schema.agentToolsTable.agentId, profileId));
    return results.map((r) => r.toolId);
  }

  static async findProfileIdsByTool(toolId: string): Promise<string[]> {
    const results = await db
      .select({ agentId: schema.agentToolsTable.agentId })
      .from(schema.agentToolsTable)
      .where(eq(schema.agentToolsTable.toolId, toolId));
    return results.map((r) => r.agentId);
  }

  static async findAllAssignedToolIds(): Promise<string[]> {
    const results = await db
      .select({ toolId: schema.agentToolsTable.toolId })
      .from(schema.agentToolsTable);
    return [...new Set(results.map((r) => r.toolId))];
  }

  static async exists(profileId: string, toolId: string): Promise<boolean> {
    const [result] = await db
      .select()
      .from(schema.agentToolsTable)
      .where(
        and(
          eq(schema.agentToolsTable.agentId, profileId),
          eq(schema.agentToolsTable.toolId, toolId),
        ),
      )
      .limit(1);
    return !!result;
  }

  static async createIfNotExists(
    profileId: string,
    toolId: string,
    credentialSourceMcpServerId?: string | null,
    executionSourceMcpServerId?: string | null,
  ) {
    const exists = await ProfileToolModel.exists(profileId, toolId);
    if (!exists) {
      const options: Partial<
        Pick<
          InsertAgentTool,
          | "allowUsageWhenUntrustedDataIsPresent"
          | "toolResultTreatment"
          | "responseModifierTemplate"
          | "credentialSourceMcpServerId"
          | "executionSourceMcpServerId"
        >
      > = {};

      // Only include credentialSourceMcpServerId if it has a real value
      if (credentialSourceMcpServerId) {
        options.credentialSourceMcpServerId = credentialSourceMcpServerId;
      }

      // Only include executionSourceMcpServerId if it has a real value
      if (executionSourceMcpServerId) {
        options.executionSourceMcpServerId = executionSourceMcpServerId;
      }

      return await ProfileToolModel.create(profileId, toolId, options);
    }
    return null;
  }

  static async update(
    id: string,
    data: Partial<
      Pick<
        UpdateAgentTool,
        | "allowUsageWhenUntrustedDataIsPresent"
        | "toolResultTreatment"
        | "responseModifierTemplate"
        | "credentialSourceMcpServerId"
        | "executionSourceMcpServerId"
      >
    >,
  ) {
    const [agentTool] = await db
      .update(schema.agentToolsTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(schema.agentToolsTable.id, id))
      .returning();
    return agentTool;
  }

  static async findAll(
    userId?: string,
    isProfileAdmin?: boolean,
  ): Promise<AgentTool[]> {
    // Get all profile-tool relationships with joined profile and tool details
    let query = db
      .select({
        ...getTableColumns(schema.agentToolsTable),
        agent: {
          id: schema.agentsTable.id,
          name: schema.agentsTable.name,
        },
        tool: {
          id: schema.toolsTable.id,
          name: schema.toolsTable.name,
          description: schema.toolsTable.description,
          parameters: schema.toolsTable.parameters,
          createdAt: schema.toolsTable.createdAt,
          updatedAt: schema.toolsTable.updatedAt,
          catalogId: schema.toolsTable.catalogId,
          mcpServerId: schema.toolsTable.mcpServerId,
          mcpServerName: schema.mcpServersTable.name,
          mcpServerCatalogId: schema.mcpServersTable.catalogId,
        },
      })
      .from(schema.agentToolsTable)
      .innerJoin(
        schema.agentsTable,
        eq(schema.agentToolsTable.agentId, schema.agentsTable.id),
      )
      .innerJoin(
        schema.toolsTable,
        eq(schema.agentToolsTable.toolId, schema.toolsTable.id),
      )
      .leftJoin(
        schema.mcpServersTable,
        eq(schema.toolsTable.mcpServerId, schema.mcpServersTable.id),
      )
      .$dynamic();

    // Apply access control filtering for users that are not profile admins if needed
    if (userId && !isProfileAdmin) {
      const accessibleProfileIds = await ProfileTeamModel.getUserAccessibleProfileIds(
        userId,
        false,
      );

      if (accessibleProfileIds.length === 0) {
        return [];
      }

      query = query.where(
        inArray(schema.agentToolsTable.agentId, accessibleProfileIds),
      );
    }

    return query;
  }

  /**
   * Find all profile-tool relationships with pagination, sorting, and filtering support
   */
  static async findAllPaginated(
    pagination: PaginationQuery,
    sorting?: {
      sortBy?: AgentToolSortBy;
      sortDirection?: AgentToolSortDirection;
    },
    filters?: AgentToolFilters,
    userId?: string,
    isProfileAdmin?: boolean,
  ): Promise<PaginatedResult<AgentTool>> {
    // Build WHERE conditions
    const whereConditions: SQL[] = [];

    // Apply access control filtering for users that are not profile admins
    if (userId && !isProfileAdmin) {
      const accessibleProfileIds = await ProfileTeamModel.getUserAccessibleProfileIds(
        userId,
        false,
      );

      if (accessibleProfileIds.length === 0) {
        return createPaginatedResult([], 0, pagination);
      }

      whereConditions.push(
        inArray(schema.agentToolsTable.agentId, accessibleProfileIds),
      );
    }

    // Filter by search query (tool name)
    if (filters?.search) {
      whereConditions.push(
        sql`LOWER(${schema.toolsTable.name}) LIKE ${`%${filters.search.toLowerCase()}%`}`,
      );
    }

    // Filter by agent
    if (filters?.agentId) {
      whereConditions.push(eq(schema.agentToolsTable.agentId, filters.agentId));
    }

    // Filter by origin (either "llm-proxy" or a catalogId)
    if (filters?.origin) {
      if (filters.origin === "llm-proxy") {
        // LLM Proxy tools have null catalogId
        whereConditions.push(sql`${schema.toolsTable.catalogId} IS NULL`);
      } else {
        // MCP tools have a catalogId
        whereConditions.push(eq(schema.toolsTable.catalogId, filters.origin));
      }
    }

    // Filter by credential source
    if (filters?.credentialSourceMcpServerId) {
      whereConditions.push(
        eq(
          schema.agentToolsTable.credentialSourceMcpServerId,
          filters.credentialSourceMcpServerId,
        ),
      );
    }

    // Exclude Archestra built-in tools for test isolation
    if (filters?.excludeArchestraTools) {
      whereConditions.push(
        sql`${schema.toolsTable.name} NOT LIKE 'archestra__%'`,
      );
    }

    const whereClause =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Determine the ORDER BY clause based on sorting params
    const direction = sorting?.sortDirection === "asc" ? asc : desc;
    let orderByClause: SQL;

    switch (sorting?.sortBy) {
      case "name":
        orderByClause = direction(schema.toolsTable.name);
        break;
      case "agent":
        orderByClause = direction(schema.agentsTable.name);
        break;
      case "origin":
        // Sort by catalogId (null values last for LLM Proxy)
        orderByClause = direction(
          sql`CASE WHEN ${schema.toolsTable.catalogId} IS NULL THEN '2-llm-proxy' ELSE '1-mcp' END`,
        );
        break;
      case "allowUsageWhenUntrustedDataIsPresent":
        orderByClause = direction(
          schema.agentToolsTable.allowUsageWhenUntrustedDataIsPresent,
        );
        break;
      default:
        orderByClause = direction(schema.agentToolsTable.createdAt);
        break;
    }

    // Run both queries in parallel
    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          ...getTableColumns(schema.agentToolsTable),
          agent: {
            id: schema.agentsTable.id,
            name: schema.agentsTable.name,
          },
          tool: {
            id: schema.toolsTable.id,
            name: schema.toolsTable.name,
            description: schema.toolsTable.description,
            parameters: schema.toolsTable.parameters,
            createdAt: schema.toolsTable.createdAt,
            updatedAt: schema.toolsTable.updatedAt,
            catalogId: schema.toolsTable.catalogId,
            mcpServerId: schema.toolsTable.mcpServerId,
            mcpServerName: schema.mcpServersTable.name,
            mcpServerCatalogId: schema.mcpServersTable.catalogId,
          },
        })
        .from(schema.agentToolsTable)
        .innerJoin(
          schema.agentsTable,
          eq(schema.agentToolsTable.agentId, schema.agentsTable.id),
        )
        .innerJoin(
          schema.toolsTable,
          eq(schema.agentToolsTable.toolId, schema.toolsTable.id),
        )
        .leftJoin(
          schema.mcpServersTable,
          eq(schema.toolsTable.mcpServerId, schema.mcpServersTable.id),
        )
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ total: count() })
        .from(schema.agentToolsTable)
        .innerJoin(
          schema.agentsTable,
          eq(schema.agentToolsTable.agentId, schema.agentsTable.id),
        )
        .innerJoin(
          schema.toolsTable,
          eq(schema.agentToolsTable.toolId, schema.toolsTable.id),
        )
        .leftJoin(
          schema.mcpServersTable,
          eq(schema.toolsTable.mcpServerId, schema.mcpServersTable.id),
        )
        .where(whereClause),
    ]);

    return createPaginatedResult(data, Number(total), pagination);
  }

  static async getSecurityConfig(
    profileId: string,
    toolName: string,
  ): Promise<{
    allowUsageWhenUntrustedDataIsPresent: boolean;
    toolResultTreatment: "trusted" | "sanitize_with_dual_llm" | "untrusted";
  } | null> {
    const [profileTool] = await db
      .select({
        allowUsageWhenUntrustedDataIsPresent:
          schema.agentToolsTable.allowUsageWhenUntrustedDataIsPresent,
        toolResultTreatment: schema.agentToolsTable.toolResultTreatment,
      })
      .from(schema.agentToolsTable)
      .innerJoin(
        schema.toolsTable,
        eq(schema.agentToolsTable.toolId, schema.toolsTable.id),
      )
      .where(
        and(
          eq(schema.agentToolsTable.agentId, profileId),
          eq(schema.toolsTable.name, toolName),
        ),
      );

    return profileTool || null;
  }

  /**
   * Clean up invalid credential sources when a user is removed from a team.
   * Sets credentialSourceMcpServerId to null for profile-tools where:
   * - The credential source is a personal token owned by the removed user
   * - The user no longer has access to the profile through any team
   */
  static async cleanupInvalidCredentialSourcesForUser(
    userId: string,
    teamId: string,
    isProfileAdmin: boolean,
  ): Promise<number> {
    // Get all profiles assigned to this team
    const profilesInTeam = await db
      .select({ agentId: schema.agentTeamsTable.agentId })
      .from(schema.agentTeamsTable)
      .where(eq(schema.agentTeamsTable.teamId, teamId));

    if (profilesInTeam.length === 0) {
      return 0;
    }

    const profileIds = profilesInTeam.map((p) => p.agentId);

    // Get all personal MCP servers owned by this user
    const userPersonalServers = await db
      .select({ id: schema.mcpServersTable.id })
      .from(schema.mcpServersTable)
      .where(
        and(
          eq(schema.mcpServersTable.ownerId, userId),
          eq(schema.mcpServersTable.authType, "personal"),
        ),
      );

    if (userPersonalServers.length === 0) {
      return 0;
    }

    const serverIds = userPersonalServers.map((s) => s.id);

    // For each profile, check if user still has access through other teams
    let cleanedCount = 0;

    for (const profileId of profileIds) {
      // Check if user still has access to this profile through other teams
      const hasAccess = await ProfileTeamModel.userHasProfileAccess(
        userId,
        profileId,
        isProfileAdmin,
      );

      // If user no longer has access, clean up their personal tokens
      if (!hasAccess) {
        const result = await db
          .update(schema.agentToolsTable)
          .set({ credentialSourceMcpServerId: null })
          .where(
            and(
              eq(schema.agentToolsTable.agentId, profileId),
              inArray(
                schema.agentToolsTable.credentialSourceMcpServerId,
                serverIds,
              ),
            ),
          );

        cleanedCount += result.rowCount ?? 0;
      }
    }

    return cleanedCount;
  }
}

export default ProfileToolModel;
