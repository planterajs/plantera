import { HttpMethod, MaybeArray } from "../types";
import { trimEnd } from "lodash";
import { match, pathToRegexp } from "path-to-regexp";
import { HttpMethods } from "../constants";
import {
    Composed,
    createPreset,
    MiddlewareLike,
    PresetFunction,
} from "../core";
import { RequestContext } from "../context";

/**
 * **This is preset middleware. Use `apply` to install it in into a composed middleware.**
 *
 * Registers a new route.
 * ```ts
 * router.apply(route("GET", "/:id", ...)); // GET /:id
 * ```
 *
 * This middleware sets the metadata of the current route, which allows
 * inherited routes to use its path, allowing the creation of nested routes.
 * ```ts
 * route
 *     .apply(route("GET", "/users", ...) // GET /users
 *     .apply(route("GET", "/:id", ...) // GET /users/:id
 * ```
 *
 * If the route isn't matched, the chain continues to be executed further
 * along nested routes or other middlewares.
 *
 * Note: Not recommended to use this middleware explicitly; for this,
 * there are methods on the router that create a fork, which allows all
 * routes to be executed in parallel.
 *
 * @param method Method that should be matched.
 * @param pathTemplate Path template that should be matched.
 * @param handlers List of request handlers.
 * @returns Route middleware.
 */
export function route<Context extends RequestContext>(
    method: HttpMethod,
    pathTemplate: string,
    ...handlers: MaybeArray<MiddlewareLike<Context>>[]
) {
    return createPreset((instance: Composed<Context>) => {
        const middleware = instance.fork(
            routeMethodDecorator(method),
            routePathDecorator(pathTemplate),
            routeParamsDecorator(),
        );
        middleware.forkFilter(
            [routeMethodPredicate(), routeUrlPredicate()],
            ...handlers,
        );

        return middleware;
    });
}

/**
 * **This is preset middleware. Use `apply` to install it in into a composed middleware.**
 *
 * Sets base path for nested routes.
 *
 * ```ts
 * const usersRoute = router.apply(prefix("/users"));
 * usersRoute.get(":id", ...); // GET /users/:id
 * ```
 *
 * @param template Path template that will be attached.
 * @param nesting Should imply nesting.
 * @returns Prefix middleware.
 */
export function prefix<Context extends RequestContext>(
    template: string,
    nesting = true,
) {
    return createPreset((instance: Composed<Context>) =>
        instance.fork(routePathDecorator(template, nesting)),
    );
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
