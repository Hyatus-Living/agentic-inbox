// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
	OPENAI_API_KEY: string;
	AUTOPROCESS_WEBHOOK_URL?: string;
	SIMPLE_AI_API_KEY?: string;
	REVIEW_REMOVAL_API_KEY?: string;
	AIRBNB_REVIEW_REMOVAL_API_KEY?: string;
	KEYCAFE_STATUS_UPDATE_URL?: string;
	KEYCAFE_STATUS_UPDATE_API_KEY?: string;
	TWOFA_API_KEY?: string;
}
