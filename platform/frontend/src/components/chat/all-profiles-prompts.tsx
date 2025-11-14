import { MessageSquare, Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProfiles } from "@/lib/agent.query";
import { useProfilePrompts } from "@/lib/profile-prompts.query";
import { usePrompts } from "@/lib/prompts.query";

interface AllProfilesPromptsProps {
  onSelectPrompt: (profileId: string, prompt: string) => void;
}

// Component that renders a section for a single profile
function ProfileSection({
  profile,
  searchQuery,
  onSelectPrompt,
}: {
  profile: {
    id: string;
    name: string;
    tools?: Array<{ id: string; name: string }>;
  };
  searchQuery: string;
  onSelectPrompt: (profileId: string, prompt: string) => void;
}) {
  const { data: profilePrompts } = useProfilePrompts(profile.id);

  // Extract system and regular prompts
  const systemPrompt = profilePrompts.find(
    (ap) => ap.prompt.type === "system",
  )?.prompt;
  const regularPrompts = profilePrompts
    .filter((ap) => ap.prompt.type === "regular")
    .map((ap) => ap.prompt);

  // Filter prompts based on search query
  const filteredPrompts = regularPrompts.filter((prompt) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      profile.name.toLowerCase().includes(query) ||
      prompt.name.toLowerCase().includes(query) ||
      prompt.content.toLowerCase().includes(query)
    );
  });

  // Check if profile matches search (for showing empty prompt card)
  const profileMatchesSearch =
    !searchQuery ||
    profile.name.toLowerCase().includes(searchQuery.toLowerCase());

  // Don't render anything if no prompts match and profile doesn't match search
  if (!profileMatchesSearch && filteredPrompts.length === 0) {
    return null;
  }

  // Render profile section with header and prompts
  return (
    <div className="space-y-4">
      {/* Profile Header */}
      <div className="flex items-center gap-3 pb-2 border-b">
        <h3 className="text-xl font-semibold">{profile.name}</h3>
        <Badge variant="secondary" className="text-xs">
          {profile.tools?.length || 0} tools
        </Badge>
        {systemPrompt && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-help">
                  System: {systemPrompt.name}
                </Badge>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-md max-h-96 overflow-y-auto"
              >
                <div className="whitespace-pre-wrap text-xs">
                  {systemPrompt.content}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Prompts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Empty prompt card - always first if profile matches search */}
        {profileMatchesSearch && (
          <Card
            key={`${profile.id}-empty`}
            className="flex flex-col relative cursor-pointer hover:bg-accent transition-colors border-dashed"
            onClick={() => onSelectPrompt(profile.id, "")}
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                <div className="text-lg font-semibold">Free Chat</div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {systemPrompt
                  ? `Start a conversation with only the system prompt (${systemPrompt.name})`
                  : "Start a conversation without a predefined prompt"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Regular prompt cards */}
        {filteredPrompts.map((prompt) => (
          <Card
            key={`${profile.id}-${prompt.id}`}
            className="flex flex-col relative cursor-pointer hover:bg-accent transition-colors"
            onClick={() => onSelectPrompt(profile.id, prompt.content)}
          >
            <CardHeader>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-lg font-semibold cursor-help overflow-hidden whitespace-nowrap text-ellipsis">
                      {prompt.name}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs break-words">{prompt.name}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {prompt.content}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AllProfilesPrompts({ onSelectPrompt }: AllProfilesPromptsProps) {
  const { data: profiles } = useProfiles();
  const { data: allPrompts } = usePrompts({ type: "regular" });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");

  // Filter prompts that are not assigned to any profile (or show all for selection)
  const unassignedPrompts =
    allPrompts?.filter((prompt) => {
      // Check if prompt has no profiles assigned
      const hasNoProfiles = !prompt.agents || prompt.agents.length === 0;
      if (!hasNoProfiles) return false;

      // Apply search filter
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        prompt.name.toLowerCase().includes(query) ||
        prompt.content.toLowerCase().includes(query)
      );
    }) || [];

  const handleUnassignedPromptClick = (name: string, content: string) => {
    setSelectedPrompt({ name, content });
    setSelectedProfileId("");
  };

  const handleConfirmProfileSelection = () => {
    if (selectedPrompt && selectedProfileId) {
      onSelectPrompt(selectedProfileId, selectedPrompt.content);
      setSelectedPrompt(null);
      setSelectedProfileId("");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 w-full space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">Start a Conversation</h2>
          <p className="text-muted-foreground">
            Choose a prompt below to get started
          </p>
        </div>

        {/* Search Input */}
        <div className="relative max-w-xl mx-auto">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search profiles and prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Profile Sections */}
        {profiles && profiles.length > 0 ? (
          <div className="space-y-8">
            {profiles.map((profile) => (
              <ProfileSection
                key={profile.id}
                profile={profile}
                searchQuery={searchQuery}
                onSelectPrompt={onSelectPrompt}
              />
            ))}

            {/* Unassigned Prompts Section */}
            {unassignedPrompts.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b">
                  <h3 className="text-xl font-semibold">Unassigned Prompts</h3>
                  <Badge
                    variant="outline"
                    className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                  >
                    Select Profile to Use
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {unassignedPrompts.map((prompt) => (
                    <Card
                      key={`unassigned-${prompt.id}`}
                      className="flex flex-col relative cursor-pointer hover:bg-accent transition-colors border-2 border-muted"
                      onClick={() =>
                        handleUnassignedPromptClick(prompt.name, prompt.content)
                      }
                    >
                      <CardHeader>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-lg font-semibold cursor-help overflow-hidden whitespace-nowrap text-ellipsis">
                                {prompt.name}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs break-words">
                                {prompt.name}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {prompt.content}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>No profiles available</p>
            <p className="text-sm mt-1">Create a profile to get started</p>
          </div>
        )}
      </div>

      {/* Profile Selection Dialog */}
      <Dialog
        open={selectedPrompt !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPrompt(null);
            setSelectedProfileId("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select a Profile</DialogTitle>
            <DialogDescription>
              Choose which profile to use with the prompt &quot;
              {selectedPrompt?.name}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="profile-select">Profile</Label>
              <Select
                value={selectedProfileId}
                onValueChange={setSelectedProfileId}
              >
                <SelectTrigger id="profile-select">
                  <SelectValue placeholder="Select a profile..." />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedPrompt(null);
                setSelectedProfileId("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmProfileSelection}
              disabled={!selectedProfileId}
            >
              Start Conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
