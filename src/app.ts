import { Server } from "http";
import { createServer } from "node:http";
import { createRouter, Router } from "./router";
import { RequestContext } from "./context";

export type AppParams<Context extends RequestContext> = {
    /**
     * External router. If provided, it replaces the default initialization.
     */
    router?: Router<Context>;

    /**
     * External server. If provided, it replaces the default initialization.
     */
    server?: Server;
};

/**
 * Application instance.
 */
export type App<Context extends RequestContext> = Server & Router<Context>;

/**
 * Creates an application instance that includes router and server bindings.
 * It allows to include external router or server for more distributed setup.
 *
 * ```ts
 * const app = createApp();
 * app.get("/hello", controller(() => "hello, plantera!");
 * app.listen(3000);
 * ```
 *
 * @param params Configuration.
 * @returns Application instance.
 */
export function createApp<Context extends RequestContext>(
    params?: AppParams<Context>,
): App<Context> {
    const router = params?.router || createRouter<Context>();
    const server = params?.server || createServer(router.callback);

    return Object.assign(server, router);
}
