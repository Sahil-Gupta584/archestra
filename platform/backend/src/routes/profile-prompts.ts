import { RouteId } from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AgentPromptModel } from "@/models";
import { constructResponseSchema, UuidIdSchema } from "@/types";

const AgentPromptSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  promptId: z.string(),
  order: z.number(),
  createdAt: z.date(),
});

const AgentPromptWithDetailsSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  promptId: z.string(),
  order: z.number(),
  createdAt: z.date(),
  prompt: z.object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    type: z.enum(["system", "regular"]),
    content: z.string(),
    version: z.number(),
    parentPromptId: z.string().nullable(),
    isActive: z.boolean(),
    createdBy: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  }),
});

const AssignAgentPromptsSchema = z.object({
  systemPromptId: z.string().uuid().optional().nullable(),
  regularPromptIds: z.array(z.string().uuid()).optional(),
});

const profilePromptRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/api/profiles/:profileId/prompts",
    {
      schema: {
        operationId: RouteId.GetProfilePrompts,
        description: "Get all prompts assigned to a profile",
        tags: ["Profile Prompts"],
        params: z.object({
          profileId: UuidIdSchema,
        }),
        response: constructResponseSchema(
          z.array(AgentPromptWithDetailsSchema),
        ),
      },
    },
    async ({ params }, reply) => {
      try {
        const profilePrompts = await AgentPromptModel.findByAgentIdWithPrompts(
          params.profileId,
        );
        return reply.send(profilePrompts);
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
    "/api/profiles/:profileId/prompts",
    {
      schema: {
        operationId: RouteId.AssignProfilePrompts,
        description:
          "Assign prompts to a profile (replaces all existing assignments)",
        tags: ["Profile Prompts"],
        params: z.object({
          profileId: UuidIdSchema,
        }),
        body: AssignAgentPromptsSchema,
        response: constructResponseSchema(z.array(AgentPromptSchema)),
      },
    },
    async ({ params, body }, reply) => {
      try {
        const profilePrompts = await AgentPromptModel.replacePrompts({
          agentId: params.profileId,
          systemPromptId: body.systemPromptId || null,
          regularPromptIds: body.regularPromptIds || [],
        });

        return reply.send(profilePrompts);
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
    "/api/profiles/:profileId/prompts/:promptId",
    {
      schema: {
        operationId: RouteId.DeleteProfilePrompt,
        description: "Remove a prompt from a profile",
        tags: ["Profile Prompts"],
        params: z.object({
          profileId: UuidIdSchema,
          promptId: UuidIdSchema,
        }),
        response: constructResponseSchema(z.object({ success: z.boolean() })),
      },
    },
    async ({ params }, reply) => {
      try {
        const success = await AgentPromptModel.delete(
          params.profileId,
          params.promptId,
        );

        if (!success) {
          return reply.status(404).send({
            error: {
              message: "Profile prompt not found",
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
};

export default profilePromptRoutes;
