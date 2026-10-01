import { createHash } from 'node:crypto';

// Each branch gets a stable Worker name and therefore its own DO namespace.
// Hashing the full branch name also distinguishes slugs such as "a/b" and "a-b".
export function previewWorkerName(branch) {
  if (!branch || branch === 'main')
    throw new Error('Preview deployment requires a non-main branch.');
  // Cloudflare limits names to 54 characters when previews are enabled.
  // Reserve 17 for the prefix, one separator, and eight for the hash.
  const slug =
    branch
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'branch';
  const hash = createHash('sha256').update(branch).digest('hex').slice(0, 8);
  return `wallball-preview-${slug}-${hash}`;
}
