import { HttpMethod, RequestContext } from "../types";
import { match } from "path-to-regexp";
import { compose } from "../core/middleware";

export function route<Context extends RequestContext>(
    method: HttpMethod,
    path: string,
) {
    const validate = match(path);

    const filter = (context: Context) =>
        context.req.method === method &&
        validate(context.req.url || "") !== false;

    const decorator = (context: Context) => {
        const validateResult = validate(
            (context.req.url || "").split("?")[0] || "",
        );

        context.req.params = validateResult ? validateResult.params : {};
        context.req.route = {
            method,
            path,
        };

        return context;
    };

    return compose<Context>().filter(filter, decorator);
}
