import { MaybePromise, RequestContext } from "./types";
import { createEffect } from "effector/compat";

export function controller<Context extends RequestContext, Params, Done>(
    fn: (params: Params) => MaybePromise<Done>,
    ...map: [Params, Context] extends [void, any] | [any, Params]
        ? [undefined?]
        : [(context: Context) => Params]
) {
    return createEffect(async (context: Context) => {
        try {
            const value = await fn(map[0] ? (map[0](context) as any) : context);

            if (!context.res.headersSent) {
                context.res.statusCode = 200;

                if (value instanceof Object) {
                    context.res.setHeader("Content-Type", "application/json");
                    context.res.end(JSON.stringify(value));
                } else {
                    context.res.end(value);
                }
            }
        } catch (error) {
            if (!context.res.headersSent) {
                context.res.statusCode = 400;

                const responseError =
                    error instanceof Object &&
                    (error instanceof Error ||
                        ("name" in error && "message" in error))
                        ? {
                              error: error.name,
                              message: error.message,
                          }
                        : {
                              error: "UnexpectedError",
                              message: error,
                          };

                context.res.setHeader("Content-Type", "application/json");
                context.res.end(responseError);
            }
        }
    });
}
