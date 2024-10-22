import { HttpMethod, MaybeArray } from "./types";
import { compose, Composed, MiddlewareLike } from "./core";
import { IncomingMessage, ServerResponse } from "http";
import { query, route, prefix } from "./middlewares";
import { HttpMethods } from "./constants";
import { createContext, RequestContext } from "./context";
import { createEvent, EventCallable } from "effector";
import { omit } from "lodash";

type MethodMacros<Context> = Record<
    Lowercase<Exclude<HttpMethod, "UNSPECIFIED">>,
    (
        path: string,
        ...handlers: MaybeArray<MiddlewareLike<Context>>[]
    ) => RouterWithEvent<Context>
>;

export type RouterApi<Context> = {
    /**
     * Callback function to handle incoming HTTP requests.
     */
    callback: (req: IncomingMessage, res: ServerResponse) => Promise<Context>;

    /**
     * Defines a prefix for nested routes.
     * ```ts
     * const usersRoute = router.prefix("/users");
     * usersRoute.get(":id", ...); // GET /users/:id
     * ```
     */
    prefix: (path: string, nesting?: boolean) => Router<Context>;

    /**
     * Defines a prefix for nested routes and acts like an endpoint as well.
     * ```ts
     * router
     *     .route("/users", allUsers)
     *     .get("/:id", getUser);
     * ```
     */
    route: (
        path: string,
        ...handlers: MaybeArray<MiddlewareLike<Context>>[]
    ) => RouterWithEvent<Context>;
} & MethodMacros<Context>;

export type Router<Context> = Composed<Context> & RouterApi<Context>;

/**
 * Router instance that holds some event.
 */
export type RouterWithEvent<Context> = Router<Context> &
    Omit<EventCallable<Context>, "filter" | "filterMap">;

/**
 * Creates a new router. It extends the basic middleware interface, allowing
 * to install custom middleware and define control flow.
 *
 * Basic usage:
 * ```ts
 * const router = createRouter();
 *
 * router.get("/hello", controller(() => "hello, plantera!");
 *
 * createServer(router.callback).listen(3000);
 * ```
 *
 * Using custom middlewares:
 * ```ts
 * router.use(customMiddlewareA, customMiddlewareB, ...);
 * ```
 *
 * Using basic routes:
 * ```ts
 * router.get("/users", getAllUsers); // GET /users
 * ```
 *
 * Using nested routes:
 * ```ts
 * router
 *     .get("/users", getAllUsers); // GET /users
 *     .get("/:id", getUser); // GET /users/:id
 * ```
 *
 * External router:
 * ```ts
 * // With chaining
 * const userRouter = createRouter()
 *     .get("/users", getAllUsers); // GET /users
 *     .get("/:id", getUser); // GET /users/:id
 * // Or with prefix
 * const userRouter = createRouter().prefix("/users")
 *     .get("/", getAllUsers); // GET /users
 *     .get("/:id", getUser); // GET /users/:id
 *
 * router.use(userRouter);
 * ```
 *
 * @param middlewares Pre-installed middlewares.
 * @returns Router instance.
 */
export function createRouter<Context extends RequestContext>(
    ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
): Router<Context> {
    return decorateWithRouter(compose(query(), ...middlewares));
}

/**
 * Decorates some composed middleware with router API.
 *
 * @param middleware Composed middleware.
 * @returns Router instance.
 */
export function decorateWithRouter<Context extends RequestContext>(
    middleware: Composed<Context>,
): Router<Context> {
    const useRoute = (
        method: HttpMethod,
        path: string,
        ...handlers: MaybeArray<MiddlewareLike<Context>>[]
    ) => {
        const matches = createEvent<Context>();

        return Object.assign(
            decorateWithRouter(
                middleware.use(route(method, path, ...handlers, matches)),
            ),
            omit(matches, ["filter", "filterMap"]),
        );
    };

    const methodMacros = Object.fromEntries(
        Object.values(HttpMethods).map((method) => [
            method.toLowerCase(),
            (
                path: string,
                ...handlers: MaybeArray<MiddlewareLike<Context>>[]
            ) => useRoute(method, path, ...handlers),
        ]),
    ) as MethodMacros<Context>;

    const api: RouterApi<Context> = {
        callback(req, res) {
            return middleware(createContext(req, res) as Context);
        },
        prefix(path, nesting = true) {
            return decorateWithRouter(middleware.use(prefix(path, nesting)));
        },
        route(path, ...handlers) {
            return useRoute(HttpMethods.Unspecified, path, ...handlers);
        },
        ...methodMacros,
    };

    return Object.assign(middleware, api);
}
