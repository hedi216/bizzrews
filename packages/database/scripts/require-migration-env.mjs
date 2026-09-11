import process from 'node:process';
import { URL } from 'node:url';

// migrate dev is intentionally restricted to the two approved local databases.
// Future deployment migrations need a separate, explicitly reviewed workflow.
try {
  for (const [name, database] of [
    ['DATABASE_URL', '/bizzres_dev'],
    ['SHADOW_DATABASE_URL', '/bizzres_shadow'],
  ]) {
    const url = new URL(process.env[name] || '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      (url.port || '5432') !== '5432' ||
      decodeURIComponent(url.username) !== 'bizzres_app' ||
      url.pathname !== database ||
      (url.searchParams.get('schema') || 'public') !== 'public'
    ) {
      throw new Error();
    }
  }
} catch {
  process.stderr.write(
    'Migration configuration rejected. Configure the approved local development and separate shadow databases using bizzres_app in the root .env.\n',
  );
  process.exitCode = 1;
}
