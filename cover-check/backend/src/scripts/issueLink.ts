/**
 * Dev helper: prints a signed Cover Check link, like the one the WhatsApp button carries.
 *   npm run link                         → +919812345214, door "check"
 *   npm run link -- +919876543210 get    → any mobile and door (get | check | company | review)
 */
import { env } from '../config/env.js';
import { linkTokenService } from '../services/linkTokenService.js';

const [mobile = '+919812345214', door = 'check'] = process.argv.slice(2);
const token = linkTokenService(env.LINK_TOKEN_SECRET, env.LINK_TOKEN_TTL_DAYS)
  .issue({ m: mobile, d: door as 'get' | 'check' | 'company' | 'review', c: 'local-test' });
console.log(`\nOpen this in your browser:\n\n  http://localhost:5173/?t=${token}\n`);
