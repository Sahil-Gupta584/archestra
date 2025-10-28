"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GetInternalMcpCatalogResponses } from "@/lib/clients/api";
import { useUpdateInternalMcpCatalogItem } from "@/lib/internal-mcp-catalog.query";

interface EditCatalogDialogProps {
  item: GetInternalMcpCatalogResponses["200"][number] | null;
  onClose: () => void;
}

// OAuth config schema
const oauthConfigSchema = z.object({
  client_id: z.string().optional().or(z.literal("")),
  client_secret: z.string().optional().or(z.literal("")),
  redirect_uris: z.string().min(1, "At least one redirect URI is required"),
  scopes: z.string().optional().or(z.literal("")),
  supports_resource_metadata: z.boolean(),
});

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  label: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  version: z.string().optional().or(z.literal("")),
  serverUrl: z.string().optional().or(z.literal("")),
  docsUrl: z.string().optional().or(z.literal("")),
  repository: z.string().optional().or(z.literal("")),
  installationCommand: z.string().optional().or(z.literal("")),
  serverType: z.enum(["remote", "local"]),
  authMethod: z.enum(["none", "pat", "oauth"]),
  oauthConfig: oauthConfigSchema.optional(),
});

type FormValues = z.infer<typeof formSchema>;

// API data type matching the mutation expected type
type ApiData = Parameters<
  ReturnType<typeof useUpdateInternalMcpCatalogItem>["mutateAsync"]
>[0]["data"];

// Transform function to convert form values to API format
function transformFormToApiData(values: FormValues): ApiData {
  const data: ApiData = {
    name: values.name,
    serverType: values.serverType,
  };

  if (values.label) {
    data.label = values.label;
  }

  if (values.description) {
    data.description = values.description;
  }

  if (values.version) {
    data.version = values.version;
  }

  if (values.serverUrl) {
    data.serverUrl = values.serverUrl;
  }

  if (values.docsUrl) {
    data.docsUrl = values.docsUrl;
  }

  if (values.repository) {
    data.repository = values.repository;
  }

  if (values.installationCommand) {
    data.installationCommand = values.installationCommand;
  }

  // Handle OAuth configuration
  if (values.authMethod === "oauth" && values.oauthConfig) {
    const redirectUrisList = values.oauthConfig.redirect_uris
      .split(",")
      .map((uri) => uri.trim())
      .filter((uri) => uri.length > 0);

    // Default to ["read", "write"] if scopes not provided or empty
    const scopesList = values.oauthConfig.scopes?.trim()
      ? values.oauthConfig.scopes
          .split(",")
          .map((scope) => scope.trim())
          .filter((scope) => scope.length > 0)
      : ["read", "write"];

    data.oauthConfig = {
      name: values.label || values.name,
      server_url: values.serverUrl || "",
      client_id:
        values.oauthConfig.client_id || "archestra-platform-public-client",
      client_secret: values.oauthConfig.client_secret || undefined,
      redirect_uris: redirectUrisList,
      scopes: scopesList,
      default_scopes: ["read", "write"],
      supports_resource_metadata: values.oauthConfig.supports_resource_metadata,
    };
  }

  // Handle PAT configuration
  if (values.authMethod === "pat") {
    data.userConfig = {
      access_token: {
        type: "string",
        title: "Access Token",
        description: "Personal access token for authentication",
        required: true,
        sensitive: true,
      },
    };
  }

  // Clear OAuth/userConfig if auth method is none
  if (values.authMethod === "none") {
    data.oauthConfig = undefined;
    data.userConfig = undefined;
  }

  return data;
}

// Helper to determine auth method from item
function getAuthMethodFromItem(
  item: GetInternalMcpCatalogResponses["200"][number] | null,
): "none" | "pat" | "oauth" {
  if (!item) return "none";
  if (item.oauthConfig) return "oauth";
  if (item.userConfig?.access_token) return "pat";
  return "none";
}

export function EditCatalogDialog({ item, onClose }: EditCatalogDialogProps) {
  const updateMutation = useUpdateInternalMcpCatalogItem();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      label: "",
      description: "",
      version: "",
      serverUrl: "",
      docsUrl: "",
      repository: "",
      installationCommand: "",
      serverType: "remote",
      authMethod: "none",
      oauthConfig: {
        client_id: "",
        client_secret: "",
        redirect_uris:
          typeof window !== "undefined"
            ? `${window.location.origin}/oauth-callback`
            : "",
        scopes: "read, write",
        supports_resource_metadata: true,
      },
    },
  });

  const authMethod = form.watch("authMethod");

  // Sync form with item when item changes
  useEffect(() => {
    if (item) {
      const authMethod = getAuthMethodFromItem(item);

      form.reset({
        name: item.name,
        label: item.label || "",
        description: item.description || "",
        version: item.version || "",
        serverUrl: item.serverUrl || "",
        docsUrl: item.docsUrl || "",
        repository: item.repository || "",
        installationCommand: item.installationCommand || "",
        serverType: item.serverType,
        authMethod,
        oauthConfig: item.oauthConfig
          ? {
              client_id: item.oauthConfig.client_id || "",
              client_secret: item.oauthConfig.client_secret || "",
              redirect_uris: item.oauthConfig.redirect_uris?.join(", ") || "",
              scopes: item.oauthConfig.scopes?.join(", ") || "",
              supports_resource_metadata:
                item.oauthConfig.supports_resource_metadata ?? true,
            }
          : {
              client_id: "",
              client_secret: "",
              redirect_uris:
                typeof window !== "undefined"
                  ? `${window.location.origin}/oauth-callback`
                  : "",
              scopes: "read, write",
              supports_resource_metadata: true,
            },
      });
    }
  }, [item, form]);

  const handleClose = () => {
    onClose();
    form.reset();
  };

  const onSubmit = async (values: FormValues) => {
    if (!item) return;
    const apiData = transformFormToApiData(values);
    await updateMutation.mutateAsync({
      id: item.id,
      data: apiData,
    });
    handleClose();
  };

  return (
    <Dialog open={!!item} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Catalog Item</DialogTitle>
          <DialogDescription>
            Update the MCP server configuration in your registry.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="basic">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="auth">Authentication</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Name <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., github"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Unique identifier for this server
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Label</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., GitHub MCP Server"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Display name shown in the UI
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief description of what this server does"
                          className="resize-none"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Help users understand the purpose of this server
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Version</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., 1.0.0"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Server version number</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="serverType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Server Type</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="remote" id="type-remote" />
                            <FormLabel
                              htmlFor="type-remote"
                              className="font-normal cursor-pointer"
                            >
                              Remote Server
                            </FormLabel>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="local" id="type-local" />
                            <FormLabel
                              htmlFor="type-local"
                              className="font-normal cursor-pointer"
                            >
                              Local Server (coming soon)
                            </FormLabel>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="serverUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Server URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://api.example.com/mcp"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        The remote MCP server endpoint
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="docsUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Documentation URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://docs.example.com"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Link to documentation for this server
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="repository"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repository URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://github.com/user/repo"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Source code repository URL
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="installationCommand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Installation Command</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="npm install @example/mcp-server"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Command to install this server locally
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="auth" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FormLabel>Authentication Method</FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">
                            Choose how users will authenticate when installing
                            this server
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <FormField
                    control={form.control}
                    name="authMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="space-y-2"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="none" id="auth-none" />
                              <FormLabel
                                htmlFor="auth-none"
                                className="font-normal cursor-pointer"
                              >
                                No authentication required
                              </FormLabel>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="pat" id="auth-pat" />
                              <FormLabel
                                htmlFor="auth-pat"
                                className="font-normal cursor-pointer"
                              >
                                Personal Access Token (PAT)
                              </FormLabel>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="oauth" id="auth-oauth" />
                              <FormLabel
                                htmlFor="auth-oauth"
                                className="font-normal cursor-pointer"
                              >
                                OAuth
                              </FormLabel>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {authMethod === "pat" && (
                    <div className="bg-muted p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        Users will be prompted to provide their personal access
                        token when installing this server.
                      </p>
                    </div>
                  )}

                  {authMethod === "oauth" && (
                    <div className="space-y-4 pl-6 border-l-2">
                      <FormField
                        control={form.control}
                        name="oauthConfig.client_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client ID</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="your-client-id (optional for dynamic registration)"
                                className="font-mono"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Leave empty if the server supports dynamic client
                              registration
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="oauthConfig.client_secret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client Secret</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="your-client-secret (optional)"
                                className="font-mono"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="oauthConfig.redirect_uris"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Redirect URIs{" "}
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="https://localhost:3000/oauth-callback, https://app.example.com/oauth-callback"
                                className="font-mono"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Comma-separated list of redirect URIs
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="oauthConfig.scopes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Scopes</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="read, write"
                                className="font-mono"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Comma-separated list of OAuth scopes (defaults to
                              read, write)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="oauthConfig.supports_resource_metadata"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                className="mt-1"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="font-normal cursor-pointer">
                                Supports OAuth Resource Metadata
                              </FormLabel>
                              <FormDescription>
                                Enable if the server publishes OAuth metadata at
                                /.well-known/oauth-authorization-server for
                                automatic endpoint discovery
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} type="button">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending || !form.formState.isValid}
              >
                {updateMutation.isPending ? "Updating..." : "Update"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
