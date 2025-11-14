import { archestraApiSdk, type archestraApiTypes } from "@shared";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

const { getProfilePrompts, assignProfilePrompts, deleteProfilePrompt } =
  archestraApiSdk;

export function useProfilePrompts(
  profileId: string,
  params?: {
    initialData?: archestraApiTypes.GetProfilePromptsResponses["200"];
  },
) {
  return useSuspenseQuery({
    queryKey: ["profiles", profileId, "prompts"],
    queryFn: async () =>
      (await getProfilePrompts({ path: { profileId } })).data ?? [],
    initialData: params?.initialData,
  });
}

export function useAssignProfilePrompts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      data,
    }: {
      profileId: string;
      data: {
        systemPromptId?: string | null;
        regularPromptIds?: string[];
      };
    }) => {
      const response = await assignProfilePrompts({
        path: { profileId },
        body: data,
      });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["profiles", variables.profileId, "prompts"],
      });
      // Invalidate general prompts queries to update "Unassigned Prompts" section in chat
      queryClient.invalidateQueries({
        queryKey: ["prompts"],
      });
    },
  });
}

export function useDeleteProfilePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      promptId,
    }: {
      profileId: string;
      promptId: string;
    }) => {
      const response = await deleteProfilePrompt({ path: { profileId, promptId } });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["profiles", variables.profileId, "prompts"],
      });
      // Invalidate general prompts queries to update "Unassigned Prompts" section in chat
      queryClient.invalidateQueries({
        queryKey: ["prompts"],
      });
    },
  });
}
