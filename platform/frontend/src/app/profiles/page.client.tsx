"use client";

import { archestraApiSdk, E2eTestId } from "@shared";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  Tag,
  Wrench,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ErrorBoundary } from "@/app/_parts/error-boundary";
import {
  type ProfileLabel,
  ProfileLabels,
  type ProfileLabelsRef,
} from "@/components/profile-labels";
import { DebouncedInput } from "@/components/debounced-input";
import { LoadingSpinner } from "@/components/loading";
import { McpConnectionInstructions } from "@/components/mcp-connection-instructions";
import { ProxyConnectionInstructions } from "@/components/proxy-connection-instructions";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useProfilesPaginated,
  useCreateProfile,
  useDeleteProfile,
  useLabelKeys,
  useUpdateProfile,
} from "@/lib/agent.query";
import { useHasPermissions } from "@/lib/auth.query";
import { formatDate } from "@/lib/utils";
import { ProfileActions } from "./profile-actions";
import { AssignToolsDialog } from "./assign-tools-dialog";
import { ChatConfigDialog } from "./chat-config-dialog";

export default function ProfilesPage() {
  return (
    <div className="w-full h-full">
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner />}>
          <Profiles />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

function SortIcon({ isSorted }: { isSorted: false | "asc" | "desc" }) {
  const upArrow = <ChevronUp className="h-3 w-3" />;
  const downArrow = <ChevronDown className="h-3 w-3" />;
  if (isSorted === "asc") {
    return upArrow;
  }
  if (isSorted === "desc") {
    return downArrow;
  }
  return (
    <div className="text-muted-foreground/50 flex flex-col items-center">
      {upArrow}
      <span className="mt-[-4px]">{downArrow}</span>
    </div>
  );
}

function ProfileTeamsBadges({
  teamIds,
  teams,
}: {
  teamIds: string[];
  teams:
    | Array<{ id: string; name: string; description: string | null }>
    | undefined;
}) {
  const MAX_TEAMS_TO_SHOW = 3;
  if (!teams || teamIds.length === 0) {
    return <span className="text-sm text-muted-foreground">None</span>;
  }

  const getTeamById = (teamId: string) => {
    return teams.find((team) => team.id === teamId);
  };

  const visibleTeams = teamIds.slice(0, MAX_TEAMS_TO_SHOW);
  const remainingTeams = teamIds.slice(MAX_TEAMS_TO_SHOW);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {visibleTeams.map((teamId) => {
        const team = getTeamById(teamId);
        return (
          <Badge key={teamId} variant="secondary" className="text-xs">
            {team?.name || teamId}
          </Badge>
        );
      })}
      {remainingTeams.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground cursor-help">
                +{remainingTeams.length} more
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-1">
                {remainingTeams.map((teamId) => {
                  const team = getTeamById(teamId);
                  return (
                    <div key={teamId} className="text-xs">
                      {team?.name || teamId}
                    </div>
                  );
                })}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

function Profiles() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const { data: userCanCreateProfiles } = useHasPermissions({
    profile: ["create"],
  });
  const { data: userCanDeleteProfiles } = useHasPermissions({
    profile: ["delete"],
  });

  // Get pagination/filter params from URL
  const pageFromUrl = searchParams.get("page");
  const pageSizeFromUrl = searchParams.get("pageSize");
  const nameFilter = searchParams.get("name") || "";
  const sortByFromUrl = searchParams.get("sortBy") as
    | "name"
    | "createdAt"
    | "toolsCount"
    | "team"
    | null;
  const sortDirectionFromUrl = searchParams.get("sortDirection") as
    | "asc"
    | "desc"
    | null;

  const pageIndex = Number(pageFromUrl || "1") - 1;
  const pageSize = Number(pageSizeFromUrl || "20");
  const offset = pageIndex * pageSize;

  // Default sorting
  const sortBy = sortByFromUrl || "createdAt";
  const sortDirection = sortDirectionFromUrl || "desc";

  const { data: profilesResponse } = useProfilesPaginated({
    limit: pageSize,
    offset,
    sortBy,
    sortDirection,
    name: nameFilter || undefined,
  });

  const profiles = profilesResponse?.data || [];
  const pagination = profilesResponse?.pagination;

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await archestraApiSdk.getTeams();
      return data || [];
    },
  });

  const [searchQuery, setSearchQuery] = useState(nameFilter);
  const [sorting, setSorting] = useState<SortingState>([
    { id: sortBy, desc: sortDirection === "desc" },
  ]);

  // Sync sorting state with URL params
  useEffect(() => {
    setSorting([{ id: sortBy, desc: sortDirection === "desc" }]);
  }, [sortBy, sortDirection]);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [connectingProfile, setConnectingProfile] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [assigningToolsProfile, setAssigningToolsProfile] = useState<
    (typeof profiles)[number] | null
  >(null);
  const [chatConfigProfile, setChatConfigProfile] = useState<
    (typeof profiles)[number] | null
  >(null);
  const [editingProfile, setEditingProfile] = useState<{
    id: string;
    name: string;
    teams: string[];
    labels: ProfileLabel[];
    optimizeCost?: boolean;
    considerContextUntrusted: boolean;
  } | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);

  type ProfileData = (typeof profiles)[number];

  // Update URL when search query changes
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("name", value);
      } else {
        params.delete("name");
      }
      params.set("page", "1"); // Reset to first page on search
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  // Update URL when sorting changes
  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);

      const params = new URLSearchParams(searchParams.toString());
      if (newSorting.length > 0) {
        params.set("sortBy", newSorting[0].id);
        params.set("sortDirection", newSorting[0].desc ? "desc" : "asc");
      } else {
        params.delete("sortBy");
        params.delete("sortDirection");
      }
      params.set("page", "1"); // Reset to first page when sorting changes
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [sorting, searchParams, router, pathname],
  );

  // Update URL when pagination changes
  const handlePaginationChange = useCallback(
    (newPagination: { pageIndex: number; pageSize: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(newPagination.pageIndex + 1));
      params.set("pageSize", String(newPagination.pageSize));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const columns: ColumnDef<ProfileData>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="h-auto !p-0 font-medium hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <SortIcon isSorted={column.getIsSorted()} />
        </Button>
      ),
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <div className="font-medium">
            <div className="flex items-center gap-2">
              {profile.name}
              {profile.isDefault && (
                <Badge
                  variant="outline"
                  className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 text-xs font-bold"
                >
                  DEFAULT
                </Badge>
              )}
              {profile.labels && profile.labels.length > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {profile.labels.map((label) => (
                          <Badge
                            key={label.key}
                            variant="secondary"
                            className="text-xs"
                          >
                            <span className="font-semibold">{label.key}:</span>
                            <span className="ml-1">{label.value}</span>
                          </Badge>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="h-auto !p-0 font-medium hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Created
          <SortIcon isSorted={column.getIsSorted()} />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-mono text-xs">
          {formatDate({ date: row.original.createdAt })}
        </div>
      ),
    },
    {
      id: "toolsCount",
      accessorKey: "toolsCount",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="h-auto !p-0 font-medium hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Connected Tools
          <SortIcon isSorted={column.getIsSorted()} />
        </Button>
      ),
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <div className="flex items-center gap-2">
            {row.original.tools.length}
            <ActionButton
              tooltip="Assign Tools"
              aria-label="Assign Tools"
              onClick={() => setAssigningToolsProfile(profile)}
            >
              <Wrench className="h-4 w-4" />
            </ActionButton>
          </div>
        );
      },
    },
    {
      id: "team",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="h-auto !p-0 font-medium hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Teams
          <SortIcon isSorted={column.getIsSorted()} />
        </Button>
      ),
      cell: ({ row }) => (
        <ProfileTeamsBadges teamIds={row.original.teams || []} teams={teams} />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      size: 176,
      enableHiding: false,
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <ProfileActions
            profile={profile}
            userCanDeleteProfiles={userCanDeleteProfiles || false}
            onConnect={setConnectingProfile}
            onConfigureChat={setChatConfigProfile}
            onEdit={setEditingProfile}
            onDelete={setDeletingProfileId}
          />
        );
      },
    },
  ];

  return (
    <div className="w-full h-full">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight mb-2">
                Profiles
              </h1>
              <p className="text-sm text-muted-foreground">
                Profiles are a way to organize access and logging. <br />
                <br />
                A profile can be: an N8N workflow, a custom application, or a
                team sharing an MCP gateway.{" "}
                <a
                  href="https://www.archestra.ai/docs/platform-agents"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Read more in the docs
                </a>
              </p>
            </div>
            {userCanCreateProfiles && (
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                data-testid={E2eTestId.CreateProfileButton}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Profile
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <DebouncedInput
              placeholder="Search profiles by name..."
              initialValue={searchQuery}
              onChange={handleSearchChange}
              className="pl-9"
            />
          </div>
        </div>

        {!profiles || profiles.length === 0 ? (
          <div className="text-muted-foreground">
            {nameFilter
              ? "No profiles found matching your search"
              : "No profiles found"}
          </div>
        ) : (
          <div data-testid={E2eTestId.ProfilesTable}>
            <DataTable
              columns={columns}
              data={profiles}
              sorting={sorting}
              onSortingChange={handleSortingChange}
              manualSorting={true}
              manualPagination={true}
              pagination={{
                pageIndex,
                pageSize,
                total: pagination?.total || 0,
              }}
              onPaginationChange={handlePaginationChange}
            />
          </div>
        )}

        <CreateProfileDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
        />

        {connectingProfile && (
          <ConnectProfileDialog
            profile={connectingProfile}
            open={!!connectingProfile}
            onOpenChange={(open) => !open && setConnectingProfile(null)}
          />
        )}

        {assigningToolsProfile && (
          <AssignToolsDialog
            profile={assigningToolsProfile}
            open={!!assigningToolsProfile}
            onOpenChange={(open) => !open && setAssigningToolsProfile(null)}
          />
        )}

        {chatConfigProfile && (
          <ChatConfigDialog
            profile={chatConfigProfile}
            open={!!chatConfigProfile}
            onOpenChange={(open) => !open && setChatConfigProfile(null)}
          />
        )}

        {editingProfile && (
          <EditProfileDialog
            profile={editingProfile}
            open={!!editingProfile}
            onOpenChange={(open) => !open && setEditingProfile(null)}
          />
        )}

        {deletingProfileId && (
          <DeleteProfileDialog
            profileId={deletingProfileId}
            open={!!deletingProfileId}
            onOpenChange={(open) => !open && setDeletingProfileId(null)}
          />
        )}
      </div>
    </div>
  );
}

function CreateProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>([]);
  const [labels, setLabels] = useState<ProfileLabel[]>([]);
  const [optimizeCost, setOptimizeCost] = useState<boolean>(false);
  const [considerContextUntrusted, setConsiderContextUntrusted] =
    useState(false);
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const response = await archestraApiSdk.getTeams();
      return response.data || [];
    },
  });
  const { data: availableKeys = [] } = useLabelKeys();
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [createdProfile, setCreatedProfile] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const createProfile = useCreateProfile();
  const profileLabelsRef = useRef<ProfileLabelsRef>(null);

  const handleAddTeam = useCallback(
    (teamId: string) => {
      if (teamId && !assignedTeamIds.includes(teamId)) {
        setAssignedTeamIds([...assignedTeamIds, teamId]);
        setSelectedTeamId("");
      }
    },
    [assignedTeamIds],
  );

  const handleRemoveTeam = useCallback(
    (teamId: string) => {
      setAssignedTeamIds(assignedTeamIds.filter((id) => id !== teamId));
    },
    [assignedTeamIds],
  );

  const getUnassignedTeams = useCallback(() => {
    if (!teams) return [];
    return teams.filter((team) => !assignedTeamIds.includes(team.id));
  }, [teams, assignedTeamIds]);

  const getTeamById = useCallback(
    (teamId: string) => {
      return teams?.find((team) => team.id === teamId);
    },
    [teams],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        toast.error("Please enter a profile name");
        return;
      }

      // Save any unsaved label before submitting
      const updatedLabels =
        profileLabelsRef.current?.saveUnsavedLabel() || labels;

      try {
        const profile = await createProfile.mutateAsync({
          name: name.trim(),
          teams: assignedTeamIds,
          labels: updatedLabels,
          optimizeCost,
          considerContextUntrusted,
        });
        if (!profile) {
          throw new Error("Failed to create profile");
        }
        toast.success("Profile created successfully");
        setCreatedProfile({ id: profile.id, name: profile.name });
      } catch (_error) {
        toast.error("Failed to create profile");
      }
    },
    [
      name,
      assignedTeamIds,
      labels,
      optimizeCost,
      considerContextUntrusted,
      createProfile,
    ],
  );

  const handleClose = useCallback(() => {
    setName("");
    setAssignedTeamIds([]);
    setLabels([]);
    setOptimizeCost(false);
    setSelectedTeamId("");
    setCreatedProfile(null);
    setConsiderContextUntrusted(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {!createdProfile ? (
          <>
            <DialogHeader>
              <DialogTitle>Create new profile</DialogTitle>
              <DialogDescription>
                Create a new profile to use with the Archestra Platform proxy.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={handleSubmit}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="grid gap-4 overflow-y-auto pr-2 pb-4 space-y-2">
                <div className="grid gap-2">
                  <Label htmlFor="name">Profile Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My AI Profile"
                    autoFocus
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Team Access</Label>
                  <p className="text-sm text-muted-foreground">
                    Assign teams to grant their members access to this profile.
                  </p>
                  <Select value={selectedTeamId} onValueChange={handleAddTeam}>
                    <SelectTrigger id="assign-team">
                      <SelectValue placeholder="Select a team to assign" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams?.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No teams available
                        </div>
                      ) : getUnassignedTeams().length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          All teams are already assigned
                        </div>
                      ) : (
                        getUnassignedTeams().map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {assignedTeamIds.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {assignedTeamIds.map((teamId) => {
                        const team = getTeamById(teamId);
                        return (
                          <Badge
                            key={teamId}
                            variant="secondary"
                            className="flex items-center gap-1 pr-1"
                          >
                            <span>{team?.name || teamId}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTeam(teamId)}
                              className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No teams assigned yet. Admins have access to all profiles.
                    </p>
                  )}
                </div>

                <ProfileLabels
                  ref={profileLabelsRef}
                  labels={labels}
                  onLabelsChange={setLabels}
                  availableKeys={availableKeys}
                />

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="create-optimize-cost">
                        Cost Optimization
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically select cheaper models when appropriate
                        (e.g., gpt-4o-mini for short contexts)
                      </p>
                    </div>
                    <Switch
                      id="create-optimize-cost"
                      checked={optimizeCost}
                      onCheckedChange={setOptimizeCost}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="consider-context-untrusted"
                    checked={considerContextUntrusted}
                    onCheckedChange={(checked) =>
                      setConsiderContextUntrusted(checked === true)
                    }
                  />
                  <div className="grid gap-1">
                    <Label
                      htmlFor="consider-context-untrusted"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Treat user context as untrusted
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Enable when user prompts may contain untrusted and
                      sensitive data.
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createProfile.isPending}>
                  {createProfile.isPending ? "Creating..." : "Create profile"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                How to connect "{createdProfile.name}" to Archestra
              </DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto py-4 flex-1">
              <ProfileConnectionTabs profileId={createdProfile.id} />
            </div>
            <DialogFooter className="shrink-0">
              <Button
                type="button"
                onClick={handleClose}
                data-testid={E2eTestId.CreateProfileCloseHowToConnectButton}
              >
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditProfileDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: {
    id: string;
    name: string;
    teams: string[];
    labels: ProfileLabel[];
    optimizeCost?: boolean;
    considerContextUntrusted: boolean;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>(
    profile.teams || [],
  );
  const [labels, setLabels] = useState<ProfileLabel[]>(profile.labels || []);
  const [optimizeCost, setOptimizeCost] = useState<boolean>(
    profile.optimizeCost || false,
  );
  const [considerContextUntrusted, setConsiderContextUntrusted] = useState(
    profile.considerContextUntrusted,
  );
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const response = await archestraApiSdk.getTeams();
      return response.data || [];
    },
  });
  const { data: availableKeys = [] } = useLabelKeys();
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const updateProfile = useUpdateProfile();
  const profileLabelsRef = useRef<ProfileLabelsRef>(null);

  const handleAddTeam = useCallback(
    (teamId: string) => {
      if (teamId && !assignedTeamIds.includes(teamId)) {
        setAssignedTeamIds([...assignedTeamIds, teamId]);
        setSelectedTeamId("");
      }
    },
    [assignedTeamIds],
  );

  const handleRemoveTeam = useCallback(
    (teamId: string) => {
      setAssignedTeamIds(assignedTeamIds.filter((id) => id !== teamId));
    },
    [assignedTeamIds],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        toast.error("Please enter a profile name");
        return;
      }

      // Save any unsaved label before submitting
      const updatedLabels =
        profileLabelsRef.current?.saveUnsavedLabel() || labels;

      try {
        await updateProfile.mutateAsync({
          id: profile.id,
          data: {
            name: name.trim(),
            teams: assignedTeamIds,
            labels: updatedLabels,
            optimizeCost,
            considerContextUntrusted,
          },
        });
        toast.success("Profile updated successfully");
        onOpenChange(false);
      } catch (_error) {
        toast.error("Failed to update profile");
      }
    },
    [
      profile.id,
      name,
      assignedTeamIds,
      labels,
      optimizeCost,
      updateProfile,
      onOpenChange,
      considerContextUntrusted,
    ],
  );

  const getUnassignedTeams = useCallback(() => {
    if (!teams) return [];
    return teams.filter((team) => !assignedTeamIds.includes(team.id));
  }, [teams, assignedTeamIds]);

  const getTeamById = useCallback(
    (teamId: string) => {
      return teams?.find((team) => team.id === teamId);
    },
    [teams],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Update the profile's name and assign teams.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="grid gap-4 overflow-y-auto pr-2 pb-4 space-y-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Profile Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My AI Profile"
                autoFocus
              />
            </div>

            <div className="grid gap-2">
              <Label>Team Access</Label>
              <p className="text-sm text-muted-foreground">
                Assign teams to grant their members access to this profile.
              </p>
              <Select value={selectedTeamId} onValueChange={handleAddTeam}>
                <SelectTrigger id="assign-team">
                  <SelectValue placeholder="Select a team to assign" />
                </SelectTrigger>
                <SelectContent>
                  {teams?.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No teams available
                    </div>
                  ) : getUnassignedTeams().length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      All teams are already assigned
                    </div>
                  ) : (
                    getUnassignedTeams().map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {assignedTeamIds.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {assignedTeamIds.map((teamId) => {
                    const team = getTeamById(teamId);
                    return (
                      <Badge
                        key={teamId}
                        variant="secondary"
                        className="flex items-center gap-1 pr-1"
                      >
                        <span>{team?.name || teamId}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTeam(teamId)}
                          className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No teams assigned yet. Admins have access to all profiles.
                </p>
              )}
            </div>

            <ProfileLabels
              ref={profileLabelsRef}
              labels={labels}
              onLabelsChange={setLabels}
              availableKeys={availableKeys}
            />

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="optimize-cost">Cost Optimization</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically select cheaper models when appropriate (e.g.,
                    gpt-4o-mini for short contexts)
                  </p>
                </div>
                <Switch
                  id="optimize-cost"
                  checked={optimizeCost}
                  onCheckedChange={setOptimizeCost}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-consider-context-untrusted"
                checked={considerContextUntrusted}
                onCheckedChange={(checked) =>
                  setConsiderContextUntrusted(checked === true)
                }
              />
              <div className="grid gap-1">
                <Label
                  htmlFor="edit-consider-context-untrusted"
                  className="text-sm font-medium cursor-pointer"
                >
                  Treat user context as untrusted
                </Label>
                <p className="text-sm text-muted-foreground">
                  Enable when user prompts may contain untrusted and sensitive
                  data.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? "Updating..." : "Update profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProfileConnectionTabs({ profileId }: { profileId: string }) {
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b">
          <h3 className="font-medium">LLM Proxy</h3>
          <h4 className="text-sm text-muted-foreground">
            For security, observibility and enabling tools
          </h4>
        </div>
        <ProxyConnectionInstructions profileId={profileId} />
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b">
          <h3 className="font-medium">MCP Gateway</h3>
          <h4 className="text-sm text-muted-foreground">
            To enable tools for the profile
          </h4>
        </div>
        <McpConnectionInstructions profileId={profileId} />
      </div>
    </div>
  );
}

function ConnectProfileDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>How to connect "{profile.name}" to Archestra</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <ProfileConnectionTabs profileId={profile.id} />
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProfileDialog({
  profileId,
  open,
  onOpenChange,
}: {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteProfile = useDeleteProfile();

  const handleDelete = useCallback(async () => {
    try {
      await deleteProfile.mutateAsync(profileId);
      toast.success("Profile deleted successfully");
      onOpenChange(false);
    } catch (_error) {
      toast.error("Failed to delete profile");
    }
  }, [profileId, deleteProfile, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delete profile</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this profile? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteProfile.isPending}
          >
            {deleteProfile.isPending ? "Deleting..." : "Delete profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
