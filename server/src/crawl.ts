import 'dotenv/config';
import { Archive } from './archive';
import { config } from './config';
import { runPipeline } from './pipeline';
import { Store } from './store';

// One-shot crawl: ingest -> cluster -> analyze -> save -> archive, then exit.
// Schedule externally (e.g. Windows Task Scheduler / cron) if you want hourly
// crawls without keeping the server running.
async function main(): Promise<void> {
  const store = new Store();
  const archive = new Archive(config.archiveFile);
  const clusters = await runPipeline(store, archive);
  console.log(`[crawl] done — ${clusters.length} clusters, ${archive.size} archived articles total`);
}

main().catch((err) => {
  console.error('[crawl] fatal:', err);
  process.exit(1);
});
