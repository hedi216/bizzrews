export interface AccessTokenClaims {
  sub: string;
  sid: string;
  type: 'access';
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
}
