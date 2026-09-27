import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { createServer as createViteServer } from "vite";
import { expect, it } from "vitest";
import config from "./vite.config";

it("preserves the browser host through the API proxy so sign-in does not loop", async () => {
  let publicOrigin;
  const backend = createHttpServer((request, response) => {
    response.writeHead(307, {
      Location:
        `http://${request.headers.host}` === publicOrigin
          ? "https://github.com/login/oauth/authorize"
          : "http://127.0.0.1:5173/api/auth/github",
    });
    response.end();
  });
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const route = config.server.proxy["/api"];
  const target = `http://127.0.0.1:${backend.address().port}`;
  const proxy = await createViteServer({
    configFile: false,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, entries: [] },
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: {
        "/api": typeof route === "string" ? target : { ...route, target },
      },
    },
  });
  try {
    await proxy.listen();
    publicOrigin = `http://127.0.0.1:${proxy.httpServer.address().port}`;
    const response = await fetch(`${publicOrigin}/api/auth/github`, {
      redirect: "manual",
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://github.com/login/oauth/authorize",
    );
  } finally {
    await proxy.close();
    backend.close();
    await once(backend, "close");
  }
});
