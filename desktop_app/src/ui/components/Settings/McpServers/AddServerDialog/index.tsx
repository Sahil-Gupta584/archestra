import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

import { Button } from '@ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/components/ui/dialog';
import { Input } from '@ui/components/ui/input';
import { Label } from '@ui/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@ui/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { Textarea } from '@ui/components/ui/textarea';
import { useMcpServersStore } from '@ui/stores';

interface AddServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Schema for remote server
const RemoteFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .regex(/^[A-Za-z0-9-\s]{1,63}$/, 'Name can only contain letters, numbers, spaces, and dashes (-)'),
  serverUrl: z.string().url('Must be a valid URL'),
  authType: z.enum(['none', 'pat', 'oauth']),
  token: z.string().optional(),
});

// Schema for local server (reusing existing schema)
const LocalFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .regex(/^[A-Za-z0-9-\s]{1,63}$/, 'Name can only contain letters, numbers, spaces, and dashes (-)'),
  command: z.string().min(1, 'Command is required'),
  args: z.string(),
  env: z.string(),
});

type RemoteFormData = z.infer<typeof RemoteFormSchema>;
type LocalFormData = z.infer<typeof LocalFormSchema>;

const defaultRemoteFormData: RemoteFormData = {
  name: '',
  serverUrl: '',
  authType: 'none',
  token: '',
};

const defaultLocalFormData: LocalFormData = {
  name: '',
  command: '',
  args: '',
  env: '',
};

export default function AddServerDialog({ open, onOpenChange }: AddServerDialogProps) {
  const [activeTab, setActiveTab] = useState<'archestra' | 'remote' | 'local'>('archestra');
  const [remoteFormData, setRemoteFormData] = useState<RemoteFormData>(defaultRemoteFormData);
  const [localFormData, setLocalFormData] = useState<LocalFormData>(defaultLocalFormData);
  const [formErrors, setFormErrors] = useState<Partial<Record<string, string>>>({});

  const { installMcpServer, installingMcpServerId, errorInstallingMcpServer } = useMcpServersStore();

  const isSubmitting = installingMcpServerId !== null;

  const handleRemoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setFormErrors({});

    // Validate form data
    const result = RemoteFormSchema.safeParse(remoteFormData);

    if (!result.success) {
      // Extract field-specific errors
      const errors: Partial<Record<string, string>> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          const field = issue.path[0] as string;
          if (!errors[field]) {
            errors[field] = issue.message;
          }
        }
      });
      setFormErrors(errors);
      return;
    }

    const validated = result.data;

    try {
      const installData: any = {
        displayName: validated.name,
        serverConfig: {
          type: 'remote',
          url: validated.serverUrl,
        },
        userConfigValues: {},
        remote_url: validated.serverUrl,
      };

      // Handle OAuth authentication differently
      if (validated.authType === 'oauth') {
        // OAuth requires special handling through the OAuth flow
        // For now, we'll just show an error
        setFormErrors({ authType: 'OAuth authentication is not yet supported for custom remote servers' });
        return;
      }

      // Handle PAT authentication
      if (validated.authType === 'pat' && validated.token) {
        // Store token in user config values
        installData.userConfigValues = {
          AUTHORIZATION_TOKEN: validated.token,
        };
      }

      await installMcpServer(false, installData);

      onOpenChange(false);
      setRemoteFormData(defaultRemoteFormData);
      setFormErrors({});
    } catch (error) {
      console.error('Failed to install remote MCP server:', error);
    }
  };

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setFormErrors({});

    // Validate form data
    const result = LocalFormSchema.safeParse(localFormData);

    if (!result.success) {
      // Extract field-specific errors
      const errors: Partial<Record<string, string>> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          const field = issue.path[0] as string;
          if (!errors[field]) {
            errors[field] = issue.message;
          }
        }
      });
      setFormErrors(errors);
      return;
    }

    const validated = result.data;

    // Parse args and env
    const args = validated.args
      .split('\n')
      .map((arg) => arg.trim())
      .filter((arg) => arg.length > 0);

    const envPairs = validated.env
      .split('\n')
      .map((pair) => pair.trim())
      .filter((pair) => pair.length > 0)
      .map((pair) => {
        const [key, value] = pair.split('=');
        return { key: key?.trim(), value: value?.trim() };
      });

    // Validate env pairs
    const invalidEnvPairs = envPairs.filter(({ key, value }) => !key || !value);
    if (invalidEnvPairs.length > 0) {
      setFormErrors({ env: 'Invalid format. Each line must be KEY=value' });
      return;
    }

    try {
      await installMcpServer(false, {
        displayName: validated.name,
        serverConfig: {
          command: validated.command,
          args,
          env: Object.fromEntries(envPairs.map(({ key, value }) => [key, value])),
        },
        userConfigValues: {},
      });

      onOpenChange(false);
      setLocalFormData(defaultLocalFormData);
      setFormErrors({});
    } catch (error) {
      console.error('Failed to install MCP server:', error);
    }
  };

  const handleRemoteInputChange = (field: keyof RemoteFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setRemoteFormData((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
    // Clear error for this field when user starts typing
    if (formErrors[field]) {
      setFormErrors((prev) => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  const handleLocalInputChange =
    (field: keyof LocalFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setLocalFormData((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
      // Clear error for this field when user starts typing
      if (formErrors[field]) {
        setFormErrors((prev) => ({
          ...prev,
          [field]: undefined,
        }));
      }
    };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) {
          // Clear form data and errors when closing
          setRemoteFormData(defaultRemoteFormData);
          setLocalFormData(defaultLocalFormData);
          setFormErrors({});
        }
        onOpenChange(newOpen);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add MCP Server
          </DialogTitle>
          <DialogDescription>
            Add a new MCP server to your private registry from the Archestra Catalog or configure a custom server.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'archestra' | 'remote' | 'local')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="archestra">Archestra Catalog</TabsTrigger>
            <TabsTrigger value="remote">Remote</TabsTrigger>
            <TabsTrigger value="local">Local</TabsTrigger>
          </TabsList>

          <TabsContent value="archestra" className="space-y-4">
            <div className="text-center py-8 text-muted-foreground">
              <p>Browse and install servers from the Archestra Catalog.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  onOpenChange(false);
                  // Navigate to connectors page
                  window.location.hash = '#/connectors';
                }}
              >
                Go to Catalog
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="remote" className="space-y-4">
            <form onSubmit={handleRemoteSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="remote-name">Name*</Label>
                <Input
                  id="remote-name"
                  placeholder="My Remote MCP Server"
                  value={remoteFormData.name}
                  onChange={handleRemoteInputChange('name')}
                  disabled={isSubmitting}
                  className={formErrors.name ? 'border-destructive' : ''}
                />
                {formErrors.name ? (
                  <p className="text-xs text-destructive">{formErrors.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Display name for this server</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="server-url">Server URL*</Label>
                <Input
                  id="server-url"
                  placeholder="https://mcp.example.com/api"
                  value={remoteFormData.serverUrl}
                  onChange={handleRemoteInputChange('serverUrl')}
                  disabled={isSubmitting}
                  className={formErrors.serverUrl ? 'border-destructive' : ''}
                />
                {formErrors.serverUrl ? (
                  <p className="text-xs text-destructive">{formErrors.serverUrl}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">The remote MCP server endpoint</p>
                )}
              </div>

              <div className="space-y-3">
                <Label>Authentication</Label>
                <RadioGroup
                  value={remoteFormData.authType}
                  onValueChange={(value) => {
                    setRemoteFormData((prev) => ({
                      ...prev,
                      authType: value as 'none' | 'pat' | 'oauth',
                    }));
                  }}
                  disabled={isSubmitting}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="none" id="auth-none" />
                    <Label htmlFor="auth-none" className="font-normal cursor-pointer">
                      No authentication required
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pat" id="auth-pat" />
                    <Label htmlFor="auth-pat" className="font-normal cursor-pointer">
                      Personal Access Token (PAT)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="oauth" id="auth-oauth" />
                    <Label htmlFor="auth-oauth" className="font-normal cursor-pointer">
                      OAuth
                    </Label>
                  </div>
                </RadioGroup>

                {remoteFormData.authType === 'pat' && (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="token">Access Token</Label>
                    <Input
                      id="token"
                      type="password"
                      placeholder="Enter your personal access token"
                      value={remoteFormData.token}
                      onChange={handleRemoteInputChange('token')}
                      disabled={isSubmitting}
                    />
                  </div>
                )}
              </div>

              {errorInstallingMcpServer && <div className="text-sm text-destructive">{errorInstallingMcpServer}</div>}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRemoteFormData(defaultRemoteFormData);
                    setFormErrors({});
                    onOpenChange(false);
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Server'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="local" className="space-y-4">
            <form onSubmit={handleLocalSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="local-name">Name</Label>
                <Input
                  id="local-name"
                  placeholder="My Custom MCP Server"
                  value={localFormData.name}
                  onChange={handleLocalInputChange('name')}
                  disabled={isSubmitting}
                  className={formErrors.name ? 'border-destructive' : ''}
                />
                {formErrors.name ? (
                  <p className="text-xs text-destructive">{formErrors.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">A unique name to identify this server</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="command">Command</Label>
                <Input
                  id="command"
                  placeholder="node"
                  value={localFormData.command}
                  onChange={handleLocalInputChange('command')}
                  disabled={isSubmitting}
                  className={formErrors.command ? 'border-destructive' : ''}
                />
                {formErrors.command ? (
                  <p className="text-xs text-destructive">{formErrors.command}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">The executable command to run</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="args">Arguments (one per line)</Label>
                <Textarea
                  id="args"
                  placeholder="/path/to/server.js&#10;--verbose"
                  value={localFormData.args}
                  onChange={handleLocalInputChange('args')}
                  disabled={isSubmitting}
                  rows={3}
                  className={formErrors.args ? 'border-destructive' : ''}
                />
                {formErrors.args ? (
                  <p className="text-xs text-destructive">{formErrors.args}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Command line arguments, one per line</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="env">Environment Variables (KEY=value format)</Label>
                <Textarea
                  id="env"
                  placeholder="API_KEY=your-key&#10;PORT=3000"
                  value={localFormData.env}
                  onChange={handleLocalInputChange('env')}
                  disabled={isSubmitting}
                  rows={3}
                  className={formErrors.env ? 'border-destructive' : ''}
                />
                {formErrors.env ? (
                  <p className="text-xs text-destructive">{formErrors.env}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Environment variables in KEY=value format, one per line
                  </p>
                )}
              </div>

              {errorInstallingMcpServer && <div className="text-sm text-destructive">{errorInstallingMcpServer}</div>}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setLocalFormData(defaultLocalFormData);
                    setFormErrors({});
                    onOpenChange(false);
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    'Install Server'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
