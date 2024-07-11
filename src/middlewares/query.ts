import { RequestContext } from "../types";

/**
 * Parses query parameters from the request URL and attach them to the request context.
 *
 * This middleware extracts the query string from the URL, parses it into key-value pairs, and
 * assigns the resulting object to `context.req.query`. This allows subsequent middlewares and
 * handlers to access query parameters easily.
 *
 * ```ts
 * composed.use(query());
 *
 * // Example: For a request with URL '/search?q=cats&sort=asc'
 * // context.req.query will be { q: 'cats', sort: 'asc' }
 * ```
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
