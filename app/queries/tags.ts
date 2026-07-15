import { useQuery } from "@tanstack/react-query";
import api from "~/services/api";
import type { Tag } from "~/types";
import { queryKeys } from "./keys";

export function useTags(mailboxId: string | undefined) {
	return useQuery<Tag[]>({
		queryKey: mailboxId
			? queryKeys.tags.list(mailboxId)
			: ["tags", "_disabled"],
		queryFn: () => api.listTags(mailboxId!) as Promise<Tag[]>,
		enabled: !!mailboxId,
		refetchInterval: 30_000,
	});
}
