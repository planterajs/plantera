import { HttpMethod, MaybeArray, RequestContext } from "./types";
import { compose, Composed, MiddlewareLike } from "./core/middleware";
import { IncomingMessage, ServerResponse } from "http";
import { query, route } from "./middlewares";

export type RouterApi<Context> = {
    callback: (req: IncomingMessage, res: ServerResponse) => Promise<Context>;
    route: (
        method: HttpMethod,
        path: string,
        ...handlers: MaybeArray<MiddlewareLike<Context>>[]
    ) => Composed<Context>;
} & Record<
    Lowercase<HttpMethod>,
    (
        path: string,
        ...handlers: MaybeArray<MiddlewareLike<Context>>[]
    ) => Composed<Context>
>;
export type Router<Context> = Composed<Context> & RouterApi<Context>;

export function createRouter<Context extends RequestContext>(
    ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
): Router<Context> {
    const middleware = compose(...middlewares).use(query());

    const api: RouterApi<Context> = {
        callback(req, res) {
            return middleware({ req, res } as Context);
        },
        route(method, path, ...handlers) {
            return middleware.use(route(method, path), ...handlers);
        },
        get(path, ...handlers) {
            return this.route("GET", path, ...handlers);
        },
        post(path, ...handlers) {
            return this.route("POST", path, ...handlers);
        },
        put(path, ...handlers) {
            return this.route("PUT", path, ...handlers);
        },
        patch(path, ...handlers) {
            return this.route("PATCH", path, ...handlers);
        },
        delete(path, ...handlers) {
            return this.route("DELETE", path, ...handlers);
        },
        options(path, ...handlers) {
            return this.route("OPTIONS", path, ...handlers);
        },
        head(path, ...handlers) {
            return this.route("HEAD", path, ...handlers);
        },
    };

    return Object.assign(middleware, api);
}
