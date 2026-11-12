import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/** Who a verified token says the caller is. Everything here comes from the identity provider, not the client. */
export interface VerifiedIdentity {
  /** The provider's stable user id (Firebase UID). Stored in users.auth_uid. */
  uid: string;
  /** Present only when the provider has verified the address. */
  email?: string;
  name?: string;
}

/** Thrown for any token we refuse. The message is for our logs; the client only ever sees a 401. */
export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTokenError";
  }
}

/** The seam between the API and the identity provider. Tests pass a fake; production passes Firebase. */
export interface TokenVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}

/** Google publishes the keys that sign Firebase ID tokens here, in JWK form. */
export const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface FirebaseVerifierOptions {
  projectId: string;
  /** Overridable so tests can sign tokens with their own key. Defaults to Google's published keys. */
  keys?: JWTVerifyGetKey;
  /** Overridable clock for tests. */
  now?: () => Date;
}

/**
 * Verifies Firebase ID tokens the way Firebase documents for servers without the Admin SDK (ADR 0007):
 * RS256 signature against Google's keys, `aud` = our project, `iss` = Firebase for our project,
 * not expired, a non-empty `sub`, and an `auth_time` in the past.
 *
 * It needs no service-account secret, only the public project id. Keys are fetched once and cached by
 * jose, which refetches when Google rotates them.
 */
export function createFirebaseVerifier({ projectId, keys, now }: FirebaseVerifierOptions): TokenVerifier {
  const keySet = keys ?? createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

  return {
    async verify(token) {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, keySet, {
          algorithms: ["RS256"],
          audience: projectId,
          issuer: `https://securetoken.google.com/${projectId}`,
          requiredClaims: ["sub", "exp", "iat", "auth_time"],
          clockTolerance: 5,
          currentDate: now?.(),
        }));
      } catch (err) {
        throw new InvalidTokenError(err instanceof Error ? err.message : "token verification failed");
      }

      if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 128) {
        throw new InvalidTokenError("token has no usable subject");
      }
      const nowSeconds = Math.floor((now?.() ?? new Date()).getTime() / 1000);
      if (typeof payload.auth_time !== "number" || payload.auth_time > nowSeconds + 5) {
        throw new InvalidTokenError("token auth_time is in the future");
      }

      const identity: VerifiedIdentity = { uid: payload.sub };
      if (payload.email_verified === true && typeof payload.email === "string") identity.email = payload.email;
      if (typeof payload.name === "string" && payload.name.trim()) identity.name = payload.name.trim();
      return identity;
    },
  };
}
