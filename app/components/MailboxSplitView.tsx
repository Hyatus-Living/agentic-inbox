// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { lazy, Suspense, type ReactNode } from "react";

const ComposePanel = lazy(() => import("~/components/ComposePanel"));
const EmailPanel = lazy(() => import("~/components/EmailPanel"));

interface MailboxSplitViewProps {
	selectedEmailId: string | null;
	isComposing: boolean;
	children: ReactNode;
}

export default function MailboxSplitView({
	selectedEmailId,
	isComposing,
	children,
}: MailboxSplitViewProps) {
	const isPanelOpen = selectedEmailId !== null || isComposing;

	return (
		<div className="flex h-full">
			<div
				className={`flex flex-col min-w-0 shrink-0 ${
					isPanelOpen
						? "hidden md:flex md:w-[380px] md:border-r md:border-kumo-line"
						: "w-full"
				}`}
			>
				{children}
			</div>
			{isPanelOpen && (
				<div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full md:w-auto">
					<Suspense fallback={<PanelLoading />}>
						{isComposing && !selectedEmailId ? (
							<ComposePanel />
						) : isComposing && selectedEmailId ? (
							<div className="flex flex-col h-full overflow-y-auto">
								<ComposePanel />
								<div className="border-t border-kumo-line">
									<EmailPanel emailId={selectedEmailId} />
								</div>
							</div>
						) : selectedEmailId ? (
							<EmailPanel emailId={selectedEmailId} />
						) : null}
					</Suspense>
				</div>
			)}
		</div>
	);
}

function PanelLoading() {
	return <div className="h-full w-full bg-kumo-base" />;
}
