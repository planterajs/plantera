import { HttpMethod, MaybeArray, RequestContext } from "../types";
import { match, pathToRegexp } from "path-to-regexp";
import { compose, MiddlewareLike } from "../core";
import { trimEnd } from "lodash";
import { HttpMethods } from "../constants";

/**
 * Creates a route middleware that handles HTTP requests based on the specified
 * HTTP method and path. The route middleware decorates the request context with
 * route information and then applies a series of handler middlewares if the
 * request matches the specified method and path.
 *
 * ```ts
 * composed.use(route('GET', '/users', getUserMiddleware));
 * composed.use(route('POST', '/users', createUserMiddleware));
 *
 * // Nesting is also allowed
 * composed.use(route('GET', '/users',
 *      route('GET', '/:id', getUserByIdMiddleware),
 * )).use(
 *      route('POST', '/:id', updateUserMiddleware)
 * );
 * ```
 */
export function route<Context extends RequestContext>(
    method: HttpMethod,
    path: string,
    ...handlers: MaybeArray<MiddlewareLike<Context>>[]
) {
    const routeDecorator = (context: Context) => {
        context.req.route = {
            method,
            path: trimEnd(context.req?.route?.path || "", "/") + path,
        };

        return context;
    };

    const filterPredicate = (context: Context) => {
        const template = context.req?.route?.path || "";
        const validate = pathToRegexp(template);

        return (
            (context.req.method === HttpMethods.Unspecified ||
                context.req.method === method) &&
            validate.exec(context.req.url || "") !== null
        );
    };

    const paramsDecorator = (context: Context) => {
        const template = context.req?.route?.path || "";
        const parse = match(template);
        const parsed = parse((context.req.url || "").split("?")[0] || "");

        context.req.params = parsed ? parsed.params : {};

        return context;
    };

    const handlerBranch = compose<Context>();
    handlerBranch.filter(filterPredicate, paramsDecorator, ...handlers);

    const middleware = compose<Context>(routeDecorator);
    middleware.fork(handlerBranch);

    return middleware;
}
