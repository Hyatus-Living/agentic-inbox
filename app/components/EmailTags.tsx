import { Badge } from "@cloudflare/kumo";
import type { Tag } from "~/types";

export default function EmailTags({ tags }: { tags?: Tag[] }) {
	if (!tags?.length) return null;
	return (
		<div className="flex items-center gap-1 min-w-0">
			{tags.map((tag) => (
				<Badge key={tag.id} variant="secondary">
					{tag.name}
				</Badge>
			))}
		</div>
	);
}
