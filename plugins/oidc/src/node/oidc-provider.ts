import {
	authorizationCodeGrant,
	buildAuthorizationUrl,
	calculatePKCECodeChallenge,
	ClientSecretBasic,
	ClientSecretPost,
	discovery,
	enableNonRepudiationChecks,
	None,
	randomNonce,
	randomPKCECodeVerifier,
	randomState,
	type Configuration,
} from 'openid-client';
import { HttpFailure } from 'nexus-terminal/node';
import { OidcHttpsUrlSchema, type OidcConfig } from '../shared/oidc-http-types.js';

const authentication = {
	client_secret_basic: ClientSecretBasic,
	client_secret_post: ClientSecretPost,
	none: None,
};

export interface OidcAuthorization {
	readonly state: string;
	readonly nonce: string;
	readonly verifier: string;
	readonly client: Configuration;
	readonly redirectUri: string;
}

export async function discoverOidc(config: OidcConfig, secret?: string): Promise<Configuration> {
	try {
		const issuer = new URL(config.issuer);
		const client = await discovery(issuer, config.clientId, undefined, authentication[config.authMethod](secret), {
			timeout: 10,
			execute: [enableNonRepudiationChecks],
		});
		const metadata = client.serverMetadata();
		const endpoints = [metadata.authorization_endpoint, metadata.token_endpoint, metadata.jwks_uri];
		if (
			new URL(metadata.issuer).href !== issuer.href ||
			endpoints.some((url) => !OidcHttpsUrlSchema.safeParse(url).success)
		)
			throw new Error('OIDC_METADATA_INVALID');
		return client;
	} catch {
		throw new HttpFailure(502, 'OIDC_DISCOVERY_FAILED');
	}
}

export async function beginOidcAuthorization(client: Configuration, redirectUri: string) {
	const state = randomState();
	const nonce = randomNonce();
	const verifier = randomPKCECodeVerifier();
	const authorizationUrl = buildAuthorizationUrl(client, {
		redirect_uri: redirectUri,
		scope: 'openid',
		response_mode: 'query',
		code_challenge: await calculatePKCECodeChallenge(verifier),
		code_challenge_method: 'S256',
		state,
		nonce,
	});
	return { authorizationUrl: authorizationUrl.href, flow: { state, nonce, verifier, client, redirectUri } };
}

export async function verifyOidcAuthorization(flow: OidcAuthorization, callback: URL, subject: string) {
	const url = new URL(flow.redirectUri);
	url.search = callback.search;
	try {
		const response = await authorizationCodeGrant(flow.client, url, {
			pkceCodeVerifier: flow.verifier,
			expectedState: flow.state,
			expectedNonce: flow.nonce,
			idTokenExpected: true,
		});
		return response.claims()?.sub === subject;
	} catch {
		return false;
	}
}
