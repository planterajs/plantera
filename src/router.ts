import { HttpMethod, MaybeArray, RequestContext } from "./types";
import { compose, Composed, MiddlewareLike } from "./core/middleware";
import { IncomingMessage, ServerResponse } from "http";
import { query, route } from "./middlewares";
import { HttpMethods } from "./constants";

export type RouterApi<Context> = {
    /**
     * Callback function to handle incoming HTTP requests.
     */
    callback: (req: IncomingMessage, res: ServerResponse) => Promise<Context>;
    /**
     * Defines a route for the specified path.
     */
    route: (
        path: string,
        ...handlers: MaybeArray<MiddlewareLike<Context>>[]
    ) => Router<Context>;
} & Record<
    Lowercase<Exclude<HttpMethod, "UNSPECIFIED">>,
    (
        path: string,
        ...handlers: MaybeArray<MiddlewareLike<Context>>[]
    ) => Router<Context>
>;
export type Router<Context> = Composed<Context> & RouterApi<Context>;

/**
 * Creates a router with middleware capabilities for handling HTTP requests.
 *
 * The router allows defining routes with HTTP methods and provides a callback
 * function for handling incoming requests. It also supports nesting, enabling
 * complex routing hierarchies.
 *
 * ```ts
 * const router = createRouter();
 *
 * router.get('/users', getUsersMiddleware);
 * router.post('/users', createUserMiddleware);
 *
 * // Nested routes
 * const userRouter = createRouter();
 * userRouter.get('/:id', getUserByIdMiddleware);
 * userRouter.put('/:id', updateUserMiddleware);
 * router.route('/users', userRouter);
 *
 * // Handling requests
 * const server = http.createServer((req, res) => {
 *   router.callback(req, res);
 * });
 * server.listen(3000);
 * ```
 */
export function createRouter<Context extends RequestContext>(
    ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
): Router<Context> {
    const middleware = compose(...middlewares, query());

    const useRoute = (
        method: HttpMethod,
        path: string,
        ...handlers: MaybeArray<MiddlewareLike<Context>>[]
    ) => {
        middleware.use(route(method, path, ...handlers));

        return createRouter(middleware);
    };

    const api: RouterApi<Context> = {
        callback(req, res) {
            return middleware({ req, res } as Context);
        },
        route(path, ...handlers) {
            return useRoute(HttpMethods.Unspecified, path, ...handlers);
        },
        get(path, ...handlers) {
            return useRoute("GET", path, ...handlers);
        },
        post(path, ...handlers) {
            return useRoute("POST", path, ...handlers);
        },
        put(path, ...handlers) {
            return useRoute("PUT", path, ...handlers);
        },
        patch(path, ...handlers) {
            return useRoute("PATCH", path, ...handlers);
        },
        delete(path, ...handlers) {
            return useRoute("DELETE", path, ...handlers);
        },
        options(path, ...handlers) {
            return useRoute("OPTIONS", path, ...handlers);
        },
        head(path, ...handlers) {
            return useRoute("HEAD", path, ...handlers);
        },
    };

    return Object.assign(middleware, api);
}
