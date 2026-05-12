import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, '..', 'manifest.json'), 'utf8'));

export const VERSION = manifest.version;
export const USER_AGENT = `PennyPilot/${VERSION} (HOLCO; https://holco.co)`;
