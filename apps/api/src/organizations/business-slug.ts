export const RESERVED_BUSINESS_SLUGS = [
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'businesses',
  'health',
  'login',
  'marketplace',
  'onboarding',
  'organizations',
  'register',
  'search',
  'static',
  'www',
] as const;

export const BUSINESS_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
