import { vi } from "vitest";
import db, { schema } from "@/database";
import {
  AgentModel,
  AgentToolModel,
  InternalMcpCatalogModel,
  McpServerModel,
  SecretModel,
  ToolModel,
} from "@/models";
import { beforeEach, describe, expect, test } from "@/test";
import mcpClient from "./mcp-client";

// Mock the MCP SDK
const mockCallTool = vi.fn();
const mockConnect = vi.fn();
const mockClose = vi.fn();

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test..
  Client: vi.fn(function (this: any) {
    this.connect = mockConnect;
    this.callTool = mockCallTool;
    this.close = mockClose;
  }),
}));

// Track StreamableHTTPClientTransport constructor calls - use vi.hoisted to avoid initialization errors
const { mockStreamableHTTPClientTransport } = vi.hoisted(() => ({
  mockStreamableHTTPClientTransport: vi.fn(),
}));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: mockStreamableHTTPClientTransport,
}));

// Mock McpServerRuntimeManager - use vi.hoisted to avoid initialization errors
const { mockUsesStreamableHttp, mockGetHttpEndpointUrl, mockGetPod } =
  vi.hoisted(() => ({
    mockUsesStreamableHttp: vi.fn(),
    mockGetHttpEndpointUrl: vi.fn(),
    mockGetPod: vi.fn(),
  }));

vi.mock("@/mcp-server-runtime", () => ({
  McpServerRuntimeManager: {
    usesStreamableHttp: mockUsesStreamableHttp,
    getHttpEndpointUrl: mockGetHttpEndpointUrl,
    getPod: mockGetPod,
  },
}));

describe("McpClient", () => {
  let agentId: string;
  let mcpServerId: string;
  let catalogId: string;

  beforeEach(async () => {
    // Create test agent
    const agent = await AgentModel.create({ name: "Test Agent", teams: [] });
    agentId = agent.id;

    // Create secret with access token
    const secret = await SecretModel.create({
      secret: {
        access_token: "test-github-token-123",
      },
    });

    // Create catalog entry for the MCP server
    const catalogItem = await InternalMcpCatalogModel.create({
      name: "github-mcp-server",
      serverType: "remote",
      serverUrl: "https://api.githubcopilot.com/mcp/",
    });
    catalogId = catalogItem.id;

    // Create MCP server for testing with secret and catalog reference
    const mcpServer = await McpServerModel.create({
      name: "github-mcp-server",
      secretId: secret.id,
      catalogId: catalogItem.id,
      serverType: "remote",
    });
    mcpServerId = mcpServer.id;

    // Reset all mocks
    vi.clearAllMocks();
    mockCallTool.mockReset();
    mockConnect.mockReset();
    mockClose.mockReset();
    mockUsesStreamableHttp.mockReset();
    mockGetHttpEndpointUrl.mockReset();
    mockGetPod.mockReset();
    mockStreamableHTTPClientTransport.mockReset();
  });

  describe("executeToolCall", () => {
    test("returns error when tool not found for agent", async () => {
      const toolCall = {
        id: "call_123",
        name: "non_mcp_tool",
        arguments: { param: "value" },
      };

      const result = await mcpClient.executeToolCall(toolCall, agentId);
      expect(result).toMatchObject({
        id: "call_123",
        isError: true,
        error: expect.stringContaining("Tool not found"),
      });
    });

    describe("Response Modifier Templates", () => {
      test("applies simple text template to tool response", async () => {
        // Create MCP tool with response modifier template
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__test_tool",
          description: "Test MCP tool",
          parameters: {},
          catalogId,
          mcpServerId,
        });

        // Assign tool to agent with response modifier
        await AgentToolModel.create(agentId, tool.id, {
          responseModifierTemplate:
            'Modified: {{{lookup (lookup response 0) "text"}}}',
        });

        // Mock the MCP client response with realistic GitHub issues data
        mockCallTool.mockResolvedValueOnce({
          content: [
            {
              type: "text",
              text: '{"issues":[{"id":3550499726,"number":816,"state":"OPEN","title":"Add authentication for MCP gateways"}]}',
            },
          ],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__test_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result).toEqual({
          id: "call_1",
          content: [
            {
              type: "text",
              text: 'Modified: {"issues":[{"id":3550499726,"number":816,"state":"OPEN","title":"Add authentication for MCP gateways"}]}',
            },
          ],
          isError: false,
          name: "github-mcp-server__test_tool",
        });
      });

      test("applies JSON template to tool response", async () => {
        // Create MCP tool with JSON response modifier template
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__json_tool",
          description: "Test MCP tool with JSON",
          parameters: {},
          catalogId,
          mcpServerId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          responseModifierTemplate:
            '{{#with (lookup response 0)}}{"formatted": true, "data": "{{{this.text}}}"}{{/with}}',
        });

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "test data" }],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__json_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result).toEqual({
          id: "call_1",
          content: { formatted: true, data: "test data" },
          isError: false,
          name: "github-mcp-server__json_tool",
        });
      });

      test("transforms GitHub issues to id:title mapping using json helper", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__github_issues",
          description: "GitHub issues tool",
          parameters: {},
          catalogId,
          mcpServerId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          responseModifierTemplate: `{{#with (lookup response 0)}}{{#with (json this.text)}}
  {
  {{#each this.issues}}
    "{{this.id}}": "{{{escapeJson this.title}}}"{{#unless @last}},{{/unless}}
  {{/each}}
}
{{/with}}{{/with}}`,
        });

        // Realistic GitHub MCP response with stringified JSON
        mockCallTool.mockResolvedValueOnce({
          content: [
            {
              type: "text",
              text: '{"issues":[{"id":3550499726,"number":816,"state":"OPEN","title":"Add authentication for MCP gateways"},{"id":3550391199,"number":815,"state":"OPEN","title":"ERROR: role \\"postgres\\" already exists"}]}',
            },
          ],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__github_issues",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result).toEqual({
          id: "call_1",
          content: {
            "3550499726": "Add authentication for MCP gateways",
            "3550391199": 'ERROR: role "postgres" already exists',
          },
          isError: false,
          name: "github-mcp-server__github_issues",
        });
      });

      test("uses {{response}} to access full response content", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__content_tool",
          description: "Test tool accessing full content",
          parameters: {},
          catalogId,
          mcpServerId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          responseModifierTemplate: "{{{json response}}}",
        });

        mockCallTool.mockResolvedValueOnce({
          content: [
            { type: "text", text: "Line 1" },
            { type: "text", text: "Line 2" },
          ],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__content_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result?.content).toEqual([
          { type: "text", text: "Line 1" },
          { type: "text", text: "Line 2" },
        ]);
      });

      test("falls back to original content when template fails", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__bad_template",
          description: "Test tool with bad template",
          parameters: {},
          catalogId,
          mcpServerId,
        });

        // Invalid Handlebars template
        await AgentToolModel.create(agentId, tool.id, {
          responseModifierTemplate: "{{#invalid",
        });

        const originalContent = [{ type: "text", text: "Original" }];
        mockCallTool.mockResolvedValueOnce({
          content: originalContent,
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__bad_template",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Should fall back to original content when template fails

        expect(result).toEqual({
          id: "call_1",
          content: originalContent,
          isError: false,
          name: "github-mcp-server__bad_template",
        });
      });

      test("handles non-text content gracefully", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__image_tool",
          description: "Test tool with image content",
          parameters: {},
          catalogId,
          mcpServerId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          responseModifierTemplate:
            'Type: {{lookup (lookup response 0) "type"}}',
        });

        // Response with image instead of text
        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "image", data: "base64data" }],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__image_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result?.content).toEqual([
          { type: "text", text: "Type: image" },
        ]);
      });

      test("executes tool without template when none is set", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__no_template",
          description: "Test tool without template",
          parameters: {},
          catalogId,
          mcpServerId,
        });

        // Assign tool without response modifier template
        await AgentToolModel.create(agentId, tool.id, {
          responseModifierTemplate: null,
        });

        const originalContent = [{ type: "text", text: "Unmodified" }];
        mockCallTool.mockResolvedValueOnce({
          content: originalContent,
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__no_template",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result).toEqual({
          id: "call_1",
          content: originalContent,
          isError: false,
          name: "github-mcp-server__no_template",
        });
      });

      test("applies different templates to different tools", async () => {
        // Create two tools with different templates
        const tool1 = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__tool1",
          description: "First tool",
          parameters: {},
          catalogId,
          mcpServerId,
        });

        const tool2 = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__tool2",
          description: "Second tool",
          parameters: {},
          catalogId,
          mcpServerId,
        });

        await AgentToolModel.create(agentId, tool1.id, {
          responseModifierTemplate:
            'Template 1: {{lookup (lookup response 0) "text"}}',
        });

        await AgentToolModel.create(agentId, tool2.id, {
          responseModifierTemplate:
            'Template 2: {{lookup (lookup response 0) "text"}}',
        });

        mockCallTool
          .mockResolvedValueOnce({
            content: [{ type: "text", text: "Response 1" }],
            isError: false,
          })
          .mockResolvedValueOnce({
            content: [{ type: "text", text: "Response 2" }],
            isError: false,
          });

        const toolCall1 = {
          id: "call_1",
          name: "github-mcp-server__tool1",
          arguments: {},
        };

        const toolCall2 = {
          id: "call_2",
          name: "github-mcp-server__tool2",
          arguments: {},
        };

        const result1 = await mcpClient.executeToolCall(toolCall1, agentId);
        const result2 = await mcpClient.executeToolCall(toolCall2, agentId);

        expect(result1).toEqual({
          id: "call_1",
          content: [{ type: "text", text: "Template 1: Response 1" }],
          isError: false,
          name: "github-mcp-server__tool1",
        });
        expect(result2).toEqual({
          id: "call_2",
          content: [{ type: "text", text: "Template 2: Response 2" }],
          isError: false,
          name: "github-mcp-server__tool2",
        });
      });
    });

    describe("Streamable HTTP Transport (Local Servers)", () => {
      let localMcpServerId: string;
      let localCatalogId: string;

      beforeEach(async () => {
        // Create test user for local MCP servers
        const testUserId = "test-user-id";
        await db.insert(schema.usersTable).values({
          id: testUserId,
          name: "Test User",
          email: "test@example.com",
          emailVerified: true,
        });

        // Create catalog entry for local streamable-http server
        const localCatalog = await InternalMcpCatalogModel.create({
          name: "local-streamable-http-server",
          serverType: "local",
          localConfig: {
            command: "npx",
            arguments: [
              "@modelcontextprotocol/server-everything",
              "streamableHttp",
            ],
            transportType: "streamable-http",
            httpPort: 3001,
            httpPath: "/mcp",
          },
        });
        localCatalogId = localCatalog.id;

        // Create MCP server for local streamable-http testing
        const localMcpServer = await McpServerModel.create({
          name: "local-streamable-http-server",
          catalogId: localCatalogId,
          serverType: "local",
          userId: testUserId,
        });
        localMcpServerId = localMcpServer.id;

        // Reset mocks
        mockUsesStreamableHttp.mockReset();
        mockGetHttpEndpointUrl.mockReset();
        mockCallTool.mockReset();
        mockConnect.mockReset();
      });

      test("executes tools using HTTP transport for streamable-http servers", async () => {
        // Create tool assigned to agent
        const tool = await ToolModel.createToolIfNotExists({
          name: "local-streamable-http-server__test_tool",
          description: "Test tool",
          parameters: {},
          catalogId: localCatalogId,
          mcpServerId: localMcpServerId,
        });

        await AgentToolModel.create(agentId, tool.id);

        // Mock runtime manager responses
        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://localhost:30123/mcp");

        // Mock successful tool call
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Success from HTTP transport" }],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "local-streamable-http-server__test_tool",
          arguments: { input: "test" },
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Verify HTTP transport was detected
        expect(mockUsesStreamableHttp).toHaveBeenCalledWith(localMcpServerId);
        expect(mockGetHttpEndpointUrl).toHaveBeenCalledWith(localMcpServerId);

        // Verify tool was called via HTTP client
        expect(mockCallTool).toHaveBeenCalledWith({
          name: "test_tool", // Server prefix stripped
          arguments: { input: "test" },
        });

        // Verify result

        expect(result).toEqual({
          id: "call_1",
          content: [{ type: "text", text: "Success from HTTP transport" }],
          isError: false,
          name: "local-streamable-http-server__test_tool",
        });
      });

      test("returns error when HTTP endpoint URL is missing", async () => {
        // Create tool assigned to agent
        const tool = await ToolModel.createToolIfNotExists({
          name: "local-streamable-http-server__test_tool",
          description: "Test tool",
          parameters: {},
          catalogId: localCatalogId,
          mcpServerId: localMcpServerId,
        });

        await AgentToolModel.create(agentId, tool.id);

        // Mock runtime manager responses - no endpoint URL
        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue(undefined);

        const toolCall = {
          id: "call_1",
          name: "local-streamable-http-server__test_tool",
          arguments: { input: "test" },
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Verify error result

        expect(result).toEqual({
          id: "call_1",
          content: null,
          isError: true,
          error: expect.stringContaining("No HTTP endpoint URL found"),
          name: "local-streamable-http-server__test_tool",
        });
      });

      test("applies response modifier template with streamable-http", async () => {
        // Create tool with response modifier template
        const tool = await ToolModel.createToolIfNotExists({
          name: "local-streamable-http-server__formatted_tool",
          description: "Tool with template",
          parameters: {},
          catalogId: localCatalogId,
          mcpServerId: localMcpServerId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          responseModifierTemplate:
            'Result: {{{lookup (lookup response 0) "text"}}}',
        });

        // Mock runtime manager responses
        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://localhost:30123/mcp");

        // Mock tool call response
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Original content" }],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "local-streamable-http-server__formatted_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Verify template was applied

        expect(result).toEqual({
          id: "call_1",
          content: [{ type: "text", text: "Result: Original content" }],
          isError: false,
          name: "local-streamable-http-server__formatted_tool",
        });
      });

      test("uses K8s attach transport when streamable-http is false", async () => {
        // Create tool assigned to agent
        const tool = await ToolModel.createToolIfNotExists({
          name: "local-streamable-http-server__stdio_tool",
          description: "Tool using K8s attach",
          parameters: {},
          catalogId: localCatalogId,
          mcpServerId: localMcpServerId,
        });

        await AgentToolModel.create(agentId, tool.id);

        // Mock runtime manager to indicate stdio transport (not HTTP)
        mockUsesStreamableHttp.mockResolvedValue(false);

        // Mock K8sPod instance
        const mockK8sPod = {
          k8sAttachClient: {} as import("@kubernetes/client-node").Attach,
          k8sNamespace: "default",
          k8sPodName: "mcp-test-pod",
        };
        mockGetPod.mockReturnValue(mockK8sPod);

        // Mock the tool call response
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Success from K8s attach" }],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "local-streamable-http-server__stdio_tool",
          arguments: { input: "test" },
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Verify K8s attach transport was used (not HTTP transport)
        expect(mockUsesStreamableHttp).toHaveBeenCalledWith(localMcpServerId);
        expect(mockGetHttpEndpointUrl).not.toHaveBeenCalled();
        expect(mockGetPod).toHaveBeenCalledWith(localMcpServerId);

        // Verify MCP SDK client was used
        expect(mockCallTool).toHaveBeenCalledWith({
          name: "stdio_tool",
          arguments: { input: "test" },
        });

        // Verify result
        expect(result).toMatchObject({
          id: "call_1",
          content: [{ type: "text", text: "Success from K8s attach" }],
          isError: false,
        });
      });
    });

    describe("Remote Server Authentication", () => {
      test("uses query parameter authentication when URL contains 'token' param (WindMill-style)", async () => {
        // Create catalog entry with token in URL (WindMill pattern)
        const windmillCatalog = await InternalMcpCatalogModel.create({
          name: "windmill-mcp-server",
          serverType: "remote",
          serverUrl:
            "https://app.windmill.dev/api/mcp/w/demo/sse?token=lQqUwyDeiAHSKwarkbrq7WNUP2XZ1HdP",
        });

        // Create MCP server WITHOUT a secret (token is in URL)
        const windmillServer = await McpServerModel.create({
          name: "windmill-mcp-server",
          catalogId: windmillCatalog.id,
          serverType: "remote",
        });

        // Create tool and assign to agent
        const tool = await ToolModel.createToolIfNotExists({
          name: "windmill-mcp-server__test_tool",
          description: "WindMill test tool",
          parameters: {},
          catalogId: windmillCatalog.id,
          mcpServerId: windmillServer.id,
        });

        await AgentToolModel.create(agentId, tool.id);

        // Mock successful tool call
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "WindMill response" }],
          isError: false,
        });

        const toolCall = {
          id: "call_windmill",
          name: "windmill-mcp-server__test_tool",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        // Verify StreamableHTTPClientTransport was created with correct params
        expect(mockStreamableHTTPClientTransport).toHaveBeenCalled();
        const [url, options] =
          mockStreamableHTTPClientTransport.mock.calls[0] || [];

        // Verify URL contains token
        expect(url.toString()).toContain(
          "token=lQqUwyDeiAHSKwarkbrq7WNUP2XZ1HdP",
        );

        // Verify no Authorization header was added (URL has auth)
        const headers = options?.requestInit?.headers;
        expect(headers.get("Authorization")).toBeNull();
      });

      test("uses query parameter authentication when URL contains 'access_token' param", async () => {
        // Create catalog with access_token in URL
        const accessTokenCatalog = await InternalMcpCatalogModel.create({
          name: "access-token-mcp-server",
          serverType: "remote",
          serverUrl: "https://api.example.com/mcp?access_token=abc123",
        });

        const accessTokenServer = await McpServerModel.create({
          name: "access-token-mcp-server",
          catalogId: accessTokenCatalog.id,
          serverType: "remote",
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "access-token-mcp-server__test_tool",
          description: "Test tool",
          parameters: {},
          catalogId: accessTokenCatalog.id,
          mcpServerId: accessTokenServer.id,
        });

        await AgentToolModel.create(agentId, tool.id);
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Success" }],
          isError: false,
        });

        const toolCall = {
          id: "call_access_token",
          name: "access-token-mcp-server__test_tool",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        expect(mockStreamableHTTPClientTransport).toHaveBeenCalled();
        const [url, options] =
          mockStreamableHTTPClientTransport.mock.calls[0] || [];

        expect(url.toString()).toContain("access_token=abc123");
        const headers = options?.requestInit?.headers;
        expect(headers.get("Authorization")).toBeNull();
      });

      test("uses query parameter authentication when URL contains 'api_key' param", async () => {
        // Create catalog with api_key in URL
        const apiKeyCatalog = await InternalMcpCatalogModel.create({
          name: "api-key-mcp-server",
          serverType: "remote",
          serverUrl: "https://api.example.com/mcp?api_key=xyz789",
        });

        const apiKeyServer = await McpServerModel.create({
          name: "api-key-mcp-server",
          catalogId: apiKeyCatalog.id,
          serverType: "remote",
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "api-key-mcp-server__test_tool",
          description: "Test tool",
          parameters: {},
          catalogId: apiKeyCatalog.id,
          mcpServerId: apiKeyServer.id,
        });

        await AgentToolModel.create(agentId, tool.id);
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Success" }],
          isError: false,
        });

        const toolCall = {
          id: "call_api_key",
          name: "api-key-mcp-server__test_tool",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        expect(mockStreamableHTTPClientTransport).toHaveBeenCalled();
        const [url, options] =
          mockStreamableHTTPClientTransport.mock.calls[0] || [];

        expect(url.toString()).toContain("api_key=xyz789");
        const headers = options?.requestInit?.headers;
        expect(headers.get("Authorization")).toBeNull();
      });

      test("uses Bearer token authentication when URL has no auth params but secrets.access_token exists", async () => {
        // This is the existing behavior - URL without auth params + secret with access_token
        // The beforeEach already creates a GitHub-style server with secrets

        // Create tool and assign to agent
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__bearer_tool",
          description: "GitHub tool with Bearer auth",
          parameters: {},
          catalogId,
          mcpServerId,
        });

        // Set credentialSourceMcpServerId to ensure secrets are loaded
        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
        });
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "GitHub response" }],
          isError: false,
        });

        const toolCall = {
          id: "call_bearer",
          name: "github-mcp-server__bearer_tool",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        // Verify StreamableHTTPClientTransport was created with Bearer header
        expect(mockStreamableHTTPClientTransport).toHaveBeenCalled();
        const [, options] =
          mockStreamableHTTPClientTransport.mock.calls[0] || [];

        const headers = options?.requestInit?.headers;
        expect(headers.get("Authorization")).toBe(
          "Bearer test-github-token-123",
        );
      });

      test("ignores secrets.access_token when URL already contains auth params", async () => {
        // Create secret with access_token
        const secret = await SecretModel.create({
          secret: { access_token: "should-be-ignored" },
        });

        // Create catalog with token in URL
        const mixedAuthCatalog = await InternalMcpCatalogModel.create({
          name: "mixed-auth-mcp-server",
          serverType: "remote",
          serverUrl: "https://app.windmill.dev/api/mcp?token=url-token",
        });

        // Create MCP server WITH a secret (but URL has auth already)
        const mixedAuthServer = await McpServerModel.create({
          name: "mixed-auth-mcp-server",
          catalogId: mixedAuthCatalog.id,
          secretId: secret.id,
          serverType: "remote",
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "mixed-auth-mcp-server__test_tool",
          description: "Mixed auth test tool",
          parameters: {},
          catalogId: mixedAuthCatalog.id,
          mcpServerId: mixedAuthServer.id,
        });

        await AgentToolModel.create(agentId, tool.id);
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Response" }],
          isError: false,
        });

        const toolCall = {
          id: "call_mixed",
          name: "mixed-auth-mcp-server__test_tool",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        expect(mockStreamableHTTPClientTransport).toHaveBeenCalled();
        const [url, options] =
          mockStreamableHTTPClientTransport.mock.calls[0] || [];

        // URL should still contain the token param
        expect(url.toString()).toContain("token=url-token");

        // No Authorization header should be added (URL auth takes precedence)
        const headers = options?.requestInit?.headers;
        expect(headers.get("Authorization")).toBeNull();
      });

      test("works without any authentication when URL has no auth and no secrets", async () => {
        // Create catalog without auth in URL
        const noAuthCatalog = await InternalMcpCatalogModel.create({
          name: "no-auth-mcp-server",
          serverType: "remote",
          serverUrl: "https://api.public.example.com/mcp",
        });

        // Create MCP server without secret
        const noAuthServer = await McpServerModel.create({
          name: "no-auth-mcp-server",
          catalogId: noAuthCatalog.id,
          serverType: "remote",
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "no-auth-mcp-server__test_tool",
          description: "Public test tool",
          parameters: {},
          catalogId: noAuthCatalog.id,
          mcpServerId: noAuthServer.id,
        });

        await AgentToolModel.create(agentId, tool.id);
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Public response" }],
          isError: false,
        });

        const toolCall = {
          id: "call_no_auth",
          name: "no-auth-mcp-server__test_tool",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        expect(mockStreamableHTTPClientTransport).toHaveBeenCalled();
        const [, options] =
          mockStreamableHTTPClientTransport.mock.calls[0] || [];

        // No Authorization header should be set
        const headers = options?.requestInit?.headers;
        expect(headers.get("Authorization")).toBeNull();
      });

      test("handles complex query strings with token param", async () => {
        // Create catalog with complex URL containing multiple query params
        const complexUrlCatalog = await InternalMcpCatalogModel.create({
          name: "complex-url-mcp-server",
          serverType: "remote",
          serverUrl:
            "https://app.windmill.dev/api/mcp/w/demo/sse?workspace=demo&format=json&token=secret123&version=2",
        });

        const complexUrlServer = await McpServerModel.create({
          name: "complex-url-mcp-server",
          catalogId: complexUrlCatalog.id,
          serverType: "remote",
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "complex-url-mcp-server__test_tool",
          description: "Complex URL test tool",
          parameters: {},
          catalogId: complexUrlCatalog.id,
          mcpServerId: complexUrlServer.id,
        });

        await AgentToolModel.create(agentId, tool.id);
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Success" }],
          isError: false,
        });

        const toolCall = {
          id: "call_complex",
          name: "complex-url-mcp-server__test_tool",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        expect(mockStreamableHTTPClientTransport).toHaveBeenCalled();
        const [url, options] =
          mockStreamableHTTPClientTransport.mock.calls[0] || [];

        // URL should preserve all query params
        expect(url.toString()).toContain("workspace=demo");
        expect(url.toString()).toContain("format=json");
        expect(url.toString()).toContain("token=secret123");
        expect(url.toString()).toContain("version=2");

        // No Authorization header (URL has token param)
        const headers = options?.requestInit?.headers;
        expect(headers.get("Authorization")).toBeNull();
      });
    });
  });
});
