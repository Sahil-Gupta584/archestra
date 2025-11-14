import { RouteId } from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { hasPermission } from "@/auth";
import { initializeMetrics } from "@/llm-metrics";
import { AgentLabelModel, AgentModel } from "@/models";
import {
  constructResponseSchema,
  createPaginatedResponseSchema,
  createSortingQuerySchema,
  InsertAgentSchema,
  PaginationQuerySchema,
  SelectAgentSchema,
  UpdateAgentSchema,
  UuidIdSchema,
} from "@/types";

const profileRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/api/profiles",
    {
      schema: {
        operationId: RouteId.GetProfiles,
        description: "Get all profiles with pagination, sorting, and filtering",
        tags: ["Profiles"],
        querystring: z
          .object({
            name: z.string().optional().describe("Filter by profile name"),
          })
          .merge(PaginationQuerySchema)
          .merge(
            createSortingQuerySchema([
              "name",
              "createdAt",
              "toolsCount",
              "team",
            ] as const),
          ),
        response: constructResponseSchema(
          createPaginatedResponseSchema(SelectAgentSchema),
        ),
      },
    },
    async (
      { query: { name, limit, offset, sortBy, sortDirection }, user, headers },
      reply,
    ) => {
      try {
        const { success: isAgentAdmin } = await hasPermission(
          { agent: ["admin"] },
          headers,
        );
        return reply.send(
          await AgentModel.findAllPaginated(
            { limit, offset },
            { sortBy, sortDirection },
            { name },
            user.id,
            isAgentAdmin,
          ),
        );
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: {
            message:
              error instanceof Error ? error.message : "Internal server error",
            type: "api_error",
          },
        });
      }
    },
  );

  fastify.get(
    "/api/profiles/all",
    {
      schema: {
        operationId: RouteId.GetAllProfiles,
        description: "Get all profiles without pagination",
        tags: ["Profiles"],
        response: constructResponseSchema(z.array(SelectAgentSchema)),
      },
    },
    async (request, reply) => {
      try {
        const { success: isAgentAdmin } = await hasPermission(
          { agent: ["admin"] },
          request.headers,
        );
        return reply.send(
          await AgentModel.findAll(request.user.id, isAgentAdmin),
        );
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: {
            message:
              error instanceof Error ? error.message : "Internal server error",
            type: "api_error",
          },
        });
      }
    },
  );

  fastify.get(
    "/api/profiles/default",
    {
      schema: {
        operationId: RouteId.GetDefaultProfile,
        description: "Get or create default profile",
        tags: ["Profiles"],
        response: constructResponseSchema(SelectAgentSchema),
      },
    },
    async (_request, reply) => {
      try {
        const profile = await AgentModel.getAgentOrCreateDefault();
        return reply.send(profile);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: {
            message:
              error instanceof Error ? error.message : "Internal server error",
            type: "api_error",
          },
        });
      }
    },
  );

  fastify.post(
    "/api/profiles",
    {
      schema: {
        operationId: RouteId.CreateProfile,
        description: "Create a new profile",
        tags: ["Profiles"],
        body: InsertAgentSchema.omit({
          id: true,
          createdAt: true,
          updatedAt: true,
        }),
        response: constructResponseSchema(SelectAgentSchema),
      },
    },
    async (request, reply) => {
      try {
        const profile = await AgentModel.create(request.body);
        const labelKeys = await AgentLabelModel.getAllKeys();
        // We need to re-init metrics with the new label keys in case label keys changed.
        // Otherwise the newly added labels will not make it to metrics. The labels with new keys, that is.
        initializeMetrics(labelKeys);

        return reply.send(profile);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: {
            message:
              error instanceof Error ? error.message : "Internal server error",
            type: "api_error",
          },
        });
      }
    },
  );

  fastify.get(
    "/api/profiles/:id",
    {
      schema: {
        operationId: RouteId.GetProfile,
        description: "Get profile by ID",
        tags: ["Profiles"],
        params: z.object({
          id: UuidIdSchema,
        }),
        response: constructResponseSchema(SelectAgentSchema),
      },
    },
    async (request, reply) => {
      try {
        const { success: isAgentAdmin } = await hasPermission(
          { agent: ["admin"] },
          request.headers,
        );

        const profile = await AgentModel.findById(
          request.params.id,
          request.user.id,
          isAgentAdmin,
        );

        if (!profile) {
          return reply.status(404).send({
            error: {
              message: "Profile not found",
              type: "not_found",
            },
          });
        }

        return reply.send(profile);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: {
            message:
              error instanceof Error ? error.message : "Internal server error",
            type: "api_error",
          },
        });
      }
    },
  );

  fastify.put(
    "/api/profiles/:id",
    {
      schema: {
        operationId: RouteId.UpdateProfile,
        description: "Update a profile",
        tags: ["Profiles"],
        params: z.object({
          id: UuidIdSchema,
        }),
        body: UpdateAgentSchema.omit({
          id: true,
          createdAt: true,
          updatedAt: true,
        }).partial(),
        response: constructResponseSchema(SelectAgentSchema),
      },
    },
    async ({ params: { id }, body }, reply) => {
      try {
        const profile = await AgentModel.update(id, body);

        if (!profile) {
          return reply.status(404).send({
            error: {
              message: "Profile not found",
              type: "not_found",
            },
          });
        }

        const labelKeys = await AgentLabelModel.getAllKeys();
        // We need to re-init metrics with the new label keys in case label keys changed.
        // Otherwise the newly added labels will not make it to metrics. The labels with new keys, that is.
        initializeMetrics(labelKeys);

        return reply.send(profile);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: {
            message:
              error instanceof Error ? error.message : "Internal server error",
            type: "api_error",
          },
        });
      }
    },
  );

  fastify.delete(
    "/api/profiles/:id",
    {
      schema: {
        operationId: RouteId.DeleteProfile,
        description: "Delete a profile",
        tags: ["Profiles"],
        params: z.object({
          id: UuidIdSchema,
        }),
        response: constructResponseSchema(z.object({ success: z.boolean() })),
      },
    },
    async ({ params: { id } }, reply) => {
      try {
        const success = await AgentModel.delete(id);

        if (!success) {
          return reply.status(404).send({
            error: {
              message: "Profile not found",
              type: "not_found",
            },
          });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: {
            message:
              error instanceof Error ? error.message : "Internal server error",
            type: "api_error",
          },
        });
      }
    },
  );

  fastify.get(
    "/api/profiles/labels/keys",
    {
      schema: {
        operationId: RouteId.GetLabelKeys,
        description: "Get all available label keys",
        tags: ["Profiles"],
        response: constructResponseSchema(z.array(z.string())),
      },
    },
    async (_request, reply) => {
      try {
        const keys = await AgentLabelModel.getAllKeys();
        return reply.send(keys);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: {
            message:
              error instanceof Error ? error.message : "Internal server error",
            type: "api_error",
          },
        });
      }
    },
  );

  fastify.get(
    "/api/profiles/labels/values",
    {
      schema: {
        operationId: RouteId.GetLabelValues,
        description: "Get all available label values",
        tags: ["Profiles"],
        querystring: z.object({
          key: z.string().optional().describe("Filter values by label key"),
        }),
        response: constructResponseSchema(z.array(z.string())),
      },
    },
    async ({ query: { key } }, reply) => {
      try {
        return reply.send(
          key
            ? await AgentLabelModel.getValuesByKey(key)
            : await AgentLabelModel.getAllValues(),
        );
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: {
            message:
              error instanceof Error ? error.message : "Internal server error",
            type: "api_error",
          },
        });
      }
    },
  );
};

export default profileRoutes;
