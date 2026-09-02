import { DEFAULT_CONFIG, KitsuneEngine } from '@kitsuneos/core';
import { createHttpMcpServer } from '@kitsuneos/server';
import { setEngine } from '@/lib/require-workspace';

const engine = new KitsuneEngine({ config: DEFAULT_CONFIG });
setEngine(engine);

const httpMcp = createHttpMcpServer(engine);

if (!process.env.KITSUNE_HTTP_STARTED) {
  void httpMcp.listen().then(({ port }) => {
    process.env.KITSUNE_HTTP_PORT = String(port);
    process.env.KITSUNE_HTTP_STARTED = '1';
  });
}

export { engine, httpMcp };
