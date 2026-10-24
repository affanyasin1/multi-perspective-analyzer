import 'dotenv/config';
import { Store } from './store';
import { runPipeline } from './pipeline';

async function main(): Promise<void> {
  const store = new Store();
  console.log('[seed] fetching live feeds and clustering…');
  const clusters = await runPipeline(store);
  if (clusters.length === 0) {
    console.log('[seed] no clusters produced — feeds may be unreachable.');
    return;
  }
  console.log(`[seed] wrote ${clusters.length} live clusters`);
}

main().catch((err) => {
  console.error('[seed] fatal:', err);
  process.exit(1);
});
