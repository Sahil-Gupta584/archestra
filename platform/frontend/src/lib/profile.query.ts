import { archestraApiSdk, type archestraApiTypes } from "@shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

const {
  createProfile,
  deleteProfile,
  getProfiles,
  getAllProfiles,
  getDefaultProfile,
  getProfile,
  updateProfile,
  getLabelKeys,
  getLabelValues,
} = archestraApiSdk;

// For backward compatibility - returns all profiles as an array
export function useProfiles(params?: {
  initialData?: archestraApiTypes.GetAllProfilesResponses["200"];
}) {
  return useSuspenseQuery({
    queryKey: ["profiles", "all"],
    queryFn: async () => {
      const response = await getAllProfiles();
      return response.data ?? [];
    },
    initialData: params?.initialData,
  });
}

// New paginated hook for the profiles page
export function useProfilesPaginated(params?: {
  limit?: number;
  offset?: number;
  sortBy?: "name" | "createdAt" | "toolsCount" | "team";
  sortDirection?: "asc" | "desc";
  name?: string;
}) {
  const { limit, offset, sortBy, sortDirection, name } = params || {};

  return useSuspenseQuery({
    queryKey: ["profiles", { limit, offset, sortBy, sortDirection, name }],
    queryFn: async () =>
      (
        await getProfiles({
          query: {
            limit,
            offset,
            sortBy,
            sortDirection,
            name,
          },
        })
      ).data ?? null,
  });
}

export function useDefaultProfile(params?: {
  initialData?: archestraApiTypes.GetDefaultProfileResponses["200"];
}) {
  return useQuery({
    queryKey: ["profiles", "default"],
    queryFn: async () => (await getDefaultProfile()).data ?? null,
    initialData: params?.initialData,
  });
}

export function useProfile(id: string | undefined) {
  return useQuery({
    queryKey: ["profiles", id],
    queryFn: async () => {
      if (!id) return null;
      const response = await getProfile({ path: { id } });
      return response.data ?? null;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: archestraApiTypes.CreateProfileData["body"]) => {
      const response = await createProfile({ body: data });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: archestraApiTypes.UpdateProfileData["body"];
    }) => {
      const response = await updateProfile({ path: { id }, body: data });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteProfile({ path: { id } });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function useLabelKeys() {
  return useQuery({
    queryKey: ["profiles", "labels", "keys"],
    queryFn: async () => (await getLabelKeys()).data ?? [],
  });
}

export function useLabelValues(params?: { key?: string }) {
  const { key } = params || {};
  return useQuery({
    queryKey: ["profiles", "labels", "values", key],
    queryFn: async () =>
      (await getLabelValues({ query: key ? { key } : {} })).data ?? [],
    enabled: key !== undefined,
  });
}
