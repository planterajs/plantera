import { RequestContext } from "../types";

/**
 * Parses query parameters from the request URL and attach them to the
 * request context.
 * ```ts
 * composed.use(query()); // { ...context, req: { ...req, query: <data> }
 * ```
 *
 * This middleware is installed by default when the router is initialized,
 * so there is no need to install it manually.
 */
export function query<Context extends RequestContext>() {
    return (context: Context) => {
        const searchString = (context.req.url || "").split("?")[1] || "";

        context.req.query = Object.fromEntries(
            new URLSearchParams(searchString),
        );

        return context;
    };
}
