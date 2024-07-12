import { HttpMethod, MaybeArray, RequestContext } from "../types";
import { trimEnd } from "lodash";
import { match, pathToRegexp } from "path-to-regexp";
import { HttpMethods } from "../constants";
import { compose, MiddlewareLike } from "../core";

/**
 * Registers a new route.
 * ```ts
 * router.use(route("GET", "/:id", ...)); // GET /:id
 * ```
 *
 * This middleware sets the metadata of the current route, which allows
 * inherited routes to use its path, allowing the creation of nested routes.
 * ```ts
 * route
 *     .use(route("GET", "/users", ...) // GET /users
 *     .use(route("GET", "/:id", ...) // GET /users/:id
 * ```
 *
 * If the route isn't matched, the chain continues to be executed further
 * along nested routes or other middlewares.
 *
 * Note: Not recommended to use this middleware explicitly; for this,
 * there are methods on the router that create a fork, which allows all
 * routes to be executed in parallel.
 */
export function route<Context extends RequestContext>(
    method: HttpMethod,
    pathTemplate: string,
    ...handlers: MaybeArray<MiddlewareLike<Context>>[]
) {
    const initialHandlerChain = compose<Context>();
    initialHandlerChain.filter(
        [routeMethodPredicate(), routeUrlPredicate()],
        ...handlers,
    );

    const middleware = compose<Context>(
        routeMethodDecorator(method),
        routePathDecorator(pathTemplate),
        routeParamsDecorator()
    );
    middleware.fork(initialHandlerChain);

    return middleware;
}

/**
 * Sets base path for nested routes.
 * ```ts
 * const usersRoute = router.prefix("/users");
 * usersRoute.get(":id", ...); // GET /users/:id
 * ```
 */
export function prefix<Context extends RequestContext>(
    template: string,
    nesting = true,
) {
    return compose<Context>(routePathDecorator(template, nesting));
}

function routeMethodDecorator<Context extends RequestContext>(
    method: HttpMethod,
) {
    return (context: Context) => {
        return {
            ...context,
            route: {
                ...(context.route || {}),
                method,
            },
        };
    };
}

function routePathDecorator<Context extends RequestContext>(
    template: string,
    nesting = true,
) {
    return (context: Context) => {
        const baseTemplate = nesting
            ? trimEnd(context.route?.path || "", "/")
            : "";

        return {
            ...context,
            route: {
                ...(context.route || {}),
                path: baseTemplate + template,
            },
        };
    };
}

function routeParamsDecorator<Context extends RequestContext>() {
    return (context: Context) => {
        const template = context.route?.path || "";
        const parse = match(template);
        const parsed = parse((context.req.url || "").split("?")[0] || "");

        context.req.params = parsed ? parsed.params : {};

        return context;
    };
}

function routeMethodPredicate<Context extends RequestContext>() {
    return (context: Context) => {
        return (
            !context.route.method ||
            context.route.method === HttpMethods.Unspecified ||
            context.req.method === context.route.method
        );
    };
}

function routeUrlPredicate<Context extends RequestContext>() {
    return (context: Context) => {
        const validate = pathToRegexp(context.route?.path || "*");

        return validate.exec(context.req.url || "") !== null;
    };
}

