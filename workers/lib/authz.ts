// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";

export type PrincipalType = "human" | "service_token";
export type GrantRole = "viewer" | "service_agent";

export interface AuthPrincipal {
	type: PrincipalType;
	id: string;
	email?: string;
	label?: string;
}

export interface MailboxSummary {
	id: string;
	email: string;
	name?: string;
	settings?: unknown;
}

export interface MailboxGrant {
	mailboxId: string;
	principalType: PrincipalType;
	principalId: string;
	role: GrantRole;
	label: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface SuperAdmin {
	email: string;
	label: string | null;
	source: "configured" | "managed";
	createdAt: string | null;
	updatedAt: string | null;
}

interface GrantRow {
	mailbox_id: string;
	principal_type: PrincipalType;
	principal_id: string;
	role: GrantRole;
	label: string | null;
	created_at: string;
	updated_at: string;
}

interface SuperAdminRow {
	email: string;
	label: string | null;
	created_at: string;
	updated_at: string;
}

interface BootstrapGrant {
	mailboxId: string;
	principalType: PrincipalType;
	principalId: string;
	role?: GrantRole;
	label?: string;
}

function parseJsonOrCsvArray(raw: unknown): string[] {
	if (Array.isArray(raw)) return raw.map((value) => String(value).trim()).filter(Boolean);
	if (typeof raw !== "string") return [];
	const trimmed = raw.trim();
	if (!trimmed) return [];
	if (trimmed.startsWith("[")) return (JSON.parse(trimmed) as string[]).map((value) => String(value).trim()).filter(Boolean);
	return trimmed.split(",").map((value) => value.trim()).filter(Boolean);
}

function parseBootstrapGrants(raw: unknown): BootstrapGrant[] {
	if (!raw) return [];
	if (Array.isArray(raw)) return raw as BootstrapGrant[];
	if (typeof raw === "string" && raw.trim()) return JSON.parse(raw) as BootstrapGrant[];
	return [];
}

export function getSuperAdminEmails(env: { SUPER_ADMIN_EMAILS?: unknown }) {
	return parseJsonOrCsvArray(env.SUPER_ADMIN_EMAILS).map((email) => email.toLowerCase());
}

export function normalizePrincipal(type: PrincipalType, id: string) {
	const trimmed = id.trim();
	return type === "human" ? trimmed.toLowerCase() : trimmed;
}

export function principalFromAccessPayload(payload: Record<string, unknown>): AuthPrincipal {
	const email = payload.email;
	if (typeof email === "string" && email.trim()) {
		const normalized = email.trim().toLowerCase();
		return { type: "human", id: normalized, email: normalized, label: normalized };
	}

	const commonName = payload.common_name;
	if (typeof commonName === "string" && commonName.trim()) {
		const normalized = commonName.trim();
		return { type: "service_token", id: normalized, label: normalized };
	}

	throw new Error("Cloudflare Access token has no email or common_name principal");
}

export function principalFromProps(value: unknown): AuthPrincipal | null {
	if (!value || typeof value !== "object") return null;
	const candidate = value as Partial<AuthPrincipal>;
	if (candidate.type !== "human" && candidate.type !== "service_token") return null;
	if (!candidate.id) return null;
	return {
		type: candidate.type,
		id: normalizePrincipal(candidate.type, candidate.id),
		email: candidate.email,
		label: candidate.label,
	};
}

export function isConfiguredSuperAdmin(env: { SUPER_ADMIN_EMAILS?: unknown }, principal: AuthPrincipal | null | undefined) {
	return principal?.type === "human" && getSuperAdminEmails(env).includes(principal.id);
}

export function getAuthzStub(env: Env) {
	return env.AUTHZ.get(env.AUTHZ.idFromName("global"));
}

export async function isSuperAdmin(env: Env, principal: AuthPrincipal | null | undefined) {
	if (isConfiguredSuperAdmin(env, principal)) return true;
	if (principal?.type !== "human") return false;
	return getAuthzStub(env).isSuperAdmin(principal.id);
}

export async function canAccessMailbox(env: Env, principal: AuthPrincipal | null | undefined, mailboxId: string) {
	if (!principal) return false;
	if (await isSuperAdmin(env, principal)) return true;
	const authz = getAuthzStub(env);
	return authz.canAccessMailbox(mailboxId, principal);
}

export async function filterVisibleMailboxes<T extends MailboxSummary>(env: Env, principal: AuthPrincipal | null | undefined, mailboxes: T[]) {
	if (!principal) return [];
	if (await isSuperAdmin(env, principal)) return mailboxes;
	const visibleIds = await getAuthzStub(env).listVisibleMailboxIds(principal, mailboxes.map((mailbox) => mailbox.id));
	const visible = new Set(visibleIds);
	return mailboxes.filter((mailbox) => visible.has(mailbox.id));
}

export class AuthzDO extends DurableObject<Env> {
	declare __DURABLE_OBJECT_BRAND: never;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS authz_meta (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`);
		this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS mailbox_grants (
			mailbox_id TEXT NOT NULL,
			principal_type TEXT NOT NULL CHECK (principal_type IN ('human', 'service_token')),
			principal_id TEXT NOT NULL,
			role TEXT NOT NULL CHECK (role IN ('viewer', 'service_agent')),
			label TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (mailbox_id, principal_type, principal_id)
		)`);
		this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_mailbox_grants_principal ON mailbox_grants (principal_type, principal_id)");
		this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS super_admins (
			email TEXT PRIMARY KEY,
			label TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`);
	}

	private ensureBootstrapGrants() {
		const grants = parseBootstrapGrants(this.env.BOOTSTRAP_MAILBOX_GRANTS);
		const signature = JSON.stringify(grants.map((grant) => ({
			...grant,
			mailboxId: grant.mailboxId.toLowerCase(),
			principalId: normalizePrincipal(grant.principalType, grant.principalId),
			role: grant.role ?? (grant.principalType === "service_token" ? "service_agent" : "viewer"),
		})));
		const existing = [...this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM authz_meta WHERE key = 'bootstrap_grants_signature'")][0];
		if (existing?.value === signature) return;

		const now = new Date().toISOString();
		for (const grant of grants) {
			const principalId = normalizePrincipal(grant.principalType, grant.principalId);
			const role = grant.role ?? (grant.principalType === "service_token" ? "service_agent" : "viewer");
			this.ctx.storage.sql.exec(
				`INSERT INTO mailbox_grants
					(mailbox_id, principal_type, principal_id, role, label, created_at, updated_at)
				 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
				 ON CONFLICT(mailbox_id, principal_type, principal_id)
				 DO UPDATE SET role = excluded.role, label = excluded.label, updated_at = excluded.updated_at`,
				grant.mailboxId.toLowerCase(),
				grant.principalType,
				principalId,
				role,
				grant.label ?? null,
				now,
			);
		}
		this.ctx.storage.sql.exec(
			"INSERT OR REPLACE INTO authz_meta (key, value) VALUES ('bootstrap_grants_signature', ?1)",
			signature,
		);
	}

	private mapGrant(row: GrantRow): MailboxGrant {
		return {
			mailboxId: row.mailbox_id,
			principalType: row.principal_type,
			principalId: row.principal_id,
			role: row.role,
			label: row.label,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	private mapSuperAdmin(row: SuperAdminRow): SuperAdmin {
		return {
			email: row.email,
			label: row.label,
			source: "managed",
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	async isSuperAdmin(email: string) {
		const normalized = email.trim().toLowerCase();
		const row = [...this.ctx.storage.sql.exec<{ allowed: number }>(
			"SELECT 1 as allowed FROM super_admins WHERE email = ?1 LIMIT 1",
			normalized,
		)][0];
		return !!row;
	}

	async listSuperAdmins() {
		const configured = getSuperAdminEmails(this.env).map((email) => ({
			email,
			label: "Configured super admin",
			source: "configured" as const,
			createdAt: null,
			updatedAt: null,
		}));
		const configuredEmails = new Set(configured.map((admin) => admin.email));
		const rows = [...this.ctx.storage.sql.exec(
			"SELECT email, label, created_at, updated_at FROM super_admins ORDER BY email",
		)] as unknown as SuperAdminRow[];
		return [
			...configured,
			...rows.map((row) => this.mapSuperAdmin(row)).filter((admin) => !configuredEmails.has(admin.email)),
		];
	}

	async upsertSuperAdmin(email: string, label?: string) {
		const normalized = email.trim().toLowerCase();
		const now = new Date().toISOString();
		this.ctx.storage.sql.exec(
			`INSERT INTO super_admins (email, label, created_at, updated_at)
			 VALUES (?1, ?2, ?3, ?3)
			 ON CONFLICT(email)
			 DO UPDATE SET label = excluded.label, updated_at = excluded.updated_at`,
			normalized,
			label?.trim() || null,
			now,
		);
		return this.listSuperAdmins();
	}

	async deleteSuperAdmin(email: string) {
		this.ctx.storage.sql.exec("DELETE FROM super_admins WHERE email = ?1", email.trim().toLowerCase());
		return this.listSuperAdmins();
	}

	async canAccessMailbox(mailboxId: string, principal: AuthPrincipal) {
		this.ensureBootstrapGrants();
		const principalId = normalizePrincipal(principal.type, principal.id);
		const row = [...this.ctx.storage.sql.exec<{ allowed: number }>(
			`SELECT 1 as allowed FROM mailbox_grants
			 WHERE mailbox_id = ?1 AND principal_type = ?2 AND principal_id = ?3
			 LIMIT 1`,
			mailboxId.toLowerCase(),
			principal.type,
			principalId,
		)][0];
		return !!row;
	}

	async listVisibleMailboxIds(principal: AuthPrincipal, mailboxIds: string[]) {
		this.ensureBootstrapGrants();
		if (mailboxIds.length === 0) return [];
		const principalId = normalizePrincipal(principal.type, principal.id);
		const rows = [...this.ctx.storage.sql.exec<{ mailbox_id: string }>(
			`SELECT mailbox_id FROM mailbox_grants
			 WHERE principal_type = ?1 AND principal_id = ?2`,
			principal.type,
			principalId,
		)];
		const granted = new Set(rows.map((row) => row.mailbox_id));
		return mailboxIds.filter((mailboxId) => granted.has(mailboxId.toLowerCase()));
	}

	async listGrants(mailboxId: string) {
		this.ensureBootstrapGrants();
		const rows = [...this.ctx.storage.sql.exec(
			`SELECT mailbox_id, principal_type, principal_id, role, label, created_at, updated_at
			 FROM mailbox_grants
			 WHERE mailbox_id = ?1
			 ORDER BY principal_type, principal_id`,
			mailboxId.toLowerCase(),
		)] as unknown as GrantRow[];
		return rows.map((row) => this.mapGrant(row));
	}

	async listPrincipals() {
		this.ensureBootstrapGrants();
		const rows = [...this.ctx.storage.sql.exec(
			`SELECT mailbox_id, principal_type, principal_id, role, label, created_at, updated_at
			 FROM mailbox_grants
			 ORDER BY principal_type, principal_id, mailbox_id`,
		)] as unknown as GrantRow[];
		return rows.map((row) => this.mapGrant(row));
	}

	async upsertGrant(grant: BootstrapGrant) {
		this.ensureBootstrapGrants();
		const now = new Date().toISOString();
		const principalId = normalizePrincipal(grant.principalType, grant.principalId);
		const role = grant.role ?? (grant.principalType === "service_token" ? "service_agent" : "viewer");
		this.ctx.storage.sql.exec(
			`INSERT INTO mailbox_grants
				(mailbox_id, principal_type, principal_id, role, label, created_at, updated_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
			 ON CONFLICT(mailbox_id, principal_type, principal_id)
			 DO UPDATE SET role = excluded.role, label = excluded.label, updated_at = excluded.updated_at`,
			grant.mailboxId.toLowerCase(),
			grant.principalType,
			principalId,
			role,
			grant.label ?? null,
			now,
		);
		return this.listGrants(grant.mailboxId);
	}

	async deleteGrant(mailboxId: string, principalId: string) {
		this.ensureBootstrapGrants();
		this.ctx.storage.sql.exec(
			"DELETE FROM mailbox_grants WHERE mailbox_id = ?1 AND (principal_id = ?2 OR principal_id = ?3)",
			mailboxId.toLowerCase(),
			principalId,
			principalId.toLowerCase(),
		);
		return this.listGrants(mailboxId);
	}
}
