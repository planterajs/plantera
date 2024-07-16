import { RequestContext } from "../context";

/**
 * Parses query parameters from the request URL and attaches them to the
 * request context.
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
