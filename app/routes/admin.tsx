// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader, Select, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowLeftIcon, PlusIcon, RobotIcon, ShieldCheckIcon, TrashIcon, UserCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import { queryKeys } from "~/queries/keys";
import api from "~/services/api";
import type { GrantRole, MailboxGrant, PrincipalType } from "~/types";

export function meta() {
	return [{ title: "Inbox Admin" }];
}

function principalIcon(type: PrincipalType) {
	return type === "human"
		? <UserCircleIcon size={16} weight="duotone" />
		: <RobotIcon size={16} weight="duotone" />;
}

function roleLabel(role: GrantRole) {
	return role === "service_agent" ? "Service agent" : "Viewer";
}

export default function AdminRoute() {
	const toastManager = useKumoToastManager();
	const queryClient = useQueryClient();
	const { data: me, isLoading: isLoadingMe } = useQuery({
		queryKey: queryKeys.me,
		queryFn: () => api.getMe(),
	});
	const { data: mailboxes = [], isLoading: isLoadingMailboxes } = useQuery({
		queryKey: queryKeys.mailboxes.all,
		queryFn: () => api.listMailboxes(),
		enabled: !!me?.isSuperAdmin,
	});

	const [selectedMailboxId, setSelectedMailboxId] = useState("");
	const [principalType, setPrincipalType] = useState<PrincipalType>("human");
	const [principalId, setPrincipalId] = useState("");
	const [role, setRole] = useState<GrantRole>("viewer");
	const [label, setLabel] = useState("");

	useEffect(() => {
		if (!selectedMailboxId && mailboxes.length > 0) {
			setSelectedMailboxId(mailboxes[0].id);
		}
	}, [mailboxes, selectedMailboxId]);

	useEffect(() => {
		setRole(principalType === "service_token" ? "service_agent" : "viewer");
	}, [principalType]);

	const { data: grants = [], isLoading: isLoadingGrants } = useQuery({
		queryKey: selectedMailboxId
			? queryKeys.admin.mailboxGrants(selectedMailboxId)
			: ["admin", "mailboxes", "_disabled", "grants"],
		queryFn: () => api.listMailboxGrants(selectedMailboxId),
		enabled: !!me?.isSuperAdmin && !!selectedMailboxId,
	});

	const upsertGrant = useMutation({
		mutationFn: () =>
			api.upsertMailboxGrant(selectedMailboxId, {
				principalType,
				principalId,
				role,
				label: label.trim() || undefined,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.admin.mailboxGrants(selectedMailboxId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.admin.principals });
			setPrincipalId("");
			setLabel("");
			toastManager.add({ title: "Grant saved" });
		},
		onError: (error) => {
			const message = error instanceof Error ? error.message : "Failed to save grant";
			toastManager.add({ title: message, variant: "error" });
		},
	});

	const deleteGrant = useMutation({
		mutationFn: (grant: MailboxGrant) =>
			api.deleteMailboxGrant(selectedMailboxId, grant.principalId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.admin.mailboxGrants(selectedMailboxId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.admin.principals });
			toastManager.add({ title: "Grant removed" });
		},
		onError: () => toastManager.add({ title: "Failed to remove grant", variant: "error" }),
	});

	const selectedMailbox = useMemo(
		() => mailboxes.find((mailbox) => mailbox.id === selectedMailboxId),
		[mailboxes, selectedMailboxId],
	);

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (!selectedMailboxId || !principalId.trim()) return;
		upsertGrant.mutate();
	};

	if (isLoadingMe) {
		return (
			<div className="min-h-screen bg-kumo-recessed flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	if (!me?.isSuperAdmin) {
		return (
			<div className="min-h-screen bg-kumo-recessed">
				<div className="mx-auto max-w-2xl px-4 py-12">
					<RouterLink to="/" className="inline-flex items-center gap-2 text-sm text-kumo-subtle no-underline hover:text-kumo-default">
						<ArrowLeftIcon size={14} />
						Mailboxes
					</RouterLink>
					<div className="mt-8 rounded-lg border border-kumo-line bg-kumo-base p-6">
						<h2 className="text-lg font-semibold text-kumo-default">Admin access required</h2>
						<p className="mt-2 text-sm text-kumo-subtle">
							Mailbox access is managed by a Hyatus inbox super admin.
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
				<div className="mb-6 flex items-center justify-between gap-3">
					<div>
						<RouterLink to="/" className="inline-flex items-center gap-2 text-sm text-kumo-subtle no-underline hover:text-kumo-default">
							<ArrowLeftIcon size={14} />
							Mailboxes
						</RouterLink>
						<div className="mt-3 flex items-center gap-2">
							<ShieldCheckIcon size={22} weight="duotone" className="text-kumo-default" />
							<h1 className="text-2xl font-bold text-kumo-default">Inbox Admin</h1>
						</div>
					</div>
					<div className="text-right text-xs text-kumo-subtle">
						<div>{me.principal.email || me.principal.id}</div>
						<div>Super admin</div>
					</div>
				</div>

				<div className="grid gap-5 lg:grid-cols-[280px_1fr]">
					<div className="rounded-lg border border-kumo-line bg-kumo-base overflow-hidden">
						<div className="border-b border-kumo-line px-4 py-3">
							<div className="text-sm font-semibold text-kumo-default">Mailboxes</div>
						</div>
						{isLoadingMailboxes ? (
							<div className="flex justify-center py-10"><Loader /></div>
						) : (
							<div className="divide-y divide-kumo-line">
								{mailboxes.map((mailbox) => (
									<button
										type="button"
										key={mailbox.id}
										onClick={() => setSelectedMailboxId(mailbox.id)}
										className={`w-full px-4 py-3 text-left text-sm transition-colors ${
											selectedMailboxId === mailbox.id
												? "bg-kumo-fill text-kumo-default font-semibold"
												: "text-kumo-strong hover:bg-kumo-tint"
										}`}
									>
										<div className="truncate">{mailbox.email}</div>
									</button>
								))}
							</div>
						)}
					</div>

					<div className="space-y-5">
						<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
							<div className="mb-4">
								<div className="text-sm font-semibold text-kumo-default">
									{selectedMailbox?.email || "Select a mailbox"}
								</div>
								<p className="mt-1 text-xs text-kumo-subtle">
									Grant Google Workspace users or Cloudflare Access service-token client IDs to this mailbox.
								</p>
							</div>

							<form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-[160px_1fr_150px_auto]">
								<Select
									aria-label="Principal type"
									value={principalType}
									onValueChange={(value) => value && setPrincipalType(value as PrincipalType)}
								>
									<Select.Option value="human">Google user</Select.Option>
									<Select.Option value="service_token">Service token</Select.Option>
								</Select>
								<Input
									aria-label="Principal ID"
									placeholder={principalType === "human" ? "user@hyatus.com" : "client-id.access"}
									value={principalId}
									onChange={(event) => setPrincipalId(event.target.value)}
								/>
								<Select
									aria-label="Role"
									value={role}
									onValueChange={(value) => value && setRole(value as GrantRole)}
								>
									<Select.Option value="viewer">Viewer</Select.Option>
									<Select.Option value="service_agent">Service agent</Select.Option>
								</Select>
								<Button
									type="submit"
									variant="primary"
									icon={<PlusIcon size={16} />}
									loading={upsertGrant.isPending}
									disabled={!selectedMailboxId || !principalId.trim()}
								>
									Add
								</Button>
								<div className="md:col-span-4">
									<Input
										aria-label="Grant label"
										placeholder="Optional label"
										value={label}
										onChange={(event) => setLabel(event.target.value)}
									/>
								</div>
							</form>
						</div>

						<div className="rounded-lg border border-kumo-line bg-kumo-base overflow-hidden">
							<div className="border-b border-kumo-line px-5 py-3">
								<div className="text-sm font-semibold text-kumo-default">Current grants</div>
							</div>
							{isLoadingGrants ? (
								<div className="flex justify-center py-12"><Loader /></div>
							) : grants.length > 0 ? (
								<div className="divide-y divide-kumo-line">
									{grants.map((grant) => (
										<div key={`${grant.principalType}:${grant.principalId}`} className="flex items-center gap-3 px-5 py-3">
											<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kumo-fill text-kumo-default">
												{principalIcon(grant.principalType)}
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-medium text-kumo-default">
													{grant.label || grant.principalId}
												</div>
												<div className="truncate text-xs text-kumo-subtle">
													{grant.principalId} · {roleLabel(grant.role)}
												</div>
											</div>
											<Button
												variant="ghost"
												shape="square"
												size="sm"
												icon={<TrashIcon size={16} />}
												aria-label={`Remove ${grant.principalId}`}
												loading={deleteGrant.isPending}
												onClick={() => deleteGrant.mutate(grant)}
											/>
										</div>
									))}
								</div>
							) : (
								<div className="px-5 py-10 text-center text-sm text-kumo-subtle">
									No direct grants yet.
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
