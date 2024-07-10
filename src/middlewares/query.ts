import { RequestContext } from "../types";

export function query<Context extends RequestContext>() {
    return (context: Context) => {
        const searchString = (context.req.url || "").split("?")[1] || "";

        context.req.query = Object.fromEntries(
            new URLSearchParams(searchString),
        );

        return context;
    };
}
