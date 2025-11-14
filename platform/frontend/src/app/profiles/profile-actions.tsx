import { E2eTestId } from "@shared";
import { MessageCircle, Pencil, Plug, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonGroup } from "@/components/ui/button-group";
import type { useProfilesPaginated } from "@/lib/agent.query";

interface ActionButtonProps {
  children: ReactNode;
  tooltip: string;
  onClick: (e: React.MouseEvent) => void;
  "data-testid"?: string;
  className?: string;
}

// Infer Profile type from the API response
type Profile = NonNullable<
  ReturnType<typeof useProfilesPaginated>["data"]
>["data"][number];

type ProfileActionsProps = {
  profile: Profile;
  userCanDeleteProfiles: boolean;
  onConnect: (profile: Pick<Profile, "id" | "name">) => void;
  onConfigureChat: (profile: Profile) => void;
  onEdit: (profile: Omit<Profile, "tools">) => void;
  onDelete: (profileId: string) => void;
};

export function ProfileActions({
  profile,
  userCanDeleteProfiles,
  onConnect,
  onConfigureChat,
  onEdit,
  onDelete,
}: ProfileActionsProps) {
  return (
    <ButtonGroup>
      <ActionButton
        aria-label="Connect"
        tooltip="Connect"
        onClick={() => onConnect(profile)}
      >
        <Plug className="h-4 w-4" />
      </ActionButton>
      <ActionButton
        aria-label="Prompts"
        tooltip="Prompts"
        onClick={() => onConfigureChat(profile)}
      >
        <MessageCircle className="h-4 w-4" />
      </ActionButton>
      <ActionButton
        tooltip="Edit"
        aria-label="Edit"
        onClick={() =>
          onEdit({
            id: profile.id,
            name: profile.name,
            isDemo: profile.isDemo,
            isDefault: profile.isDefault,
            teams: profile.teams || [],
            labels: profile.labels || [],
            optimizeCost: profile.optimizeCost,
            considerContextUntrusted: profile.considerContextUntrusted,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
          })
        }
      >
        <Pencil className="h-4 w-4" />
      </ActionButton>
      {userCanDeleteProfiles && (
        <ActionButton
          tooltip="Delete"
          onClick={() => onDelete(profile.id)}
          aria-label="Delete"
          data-testid={`${E2eTestId.DeleteProfileButton}-${profile.name}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </ActionButton>
      )}
    </ButtonGroup>
  );
}
