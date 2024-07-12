import { MaybePromise, RequestContext } from "./types";
import { createEffect } from "effector/compat";

/**
 * Creates a controller middleware that executes a given function and sends the result
 * as an HTTP response. The function can be mapped from the context, and the response
 * is automatically formatted based on the function's return value.
 *
 * ```ts
 * const getUserController = controller(async (params) => {
 *   const user = await getUserFromDatabase(params.id);
 *   return user;
 * }, (context) => ({ id: context.req.params.id }));
 *
 * composed.use(route('GET', '/user/:id', getUserController));
 * ```
 */
export function controller<Context extends RequestContext, Params, Done>(
    fn: (params: Params) => MaybePromise<Done>,
    ...map: [Params, Context] extends [void, any] | [any, Params]
        ? [undefined?]
        : [(context: Context) => Params]
) {
    return createEffect(async (context: Context) => {
        try {
            const value = await fn(map[0] ? (map[0](context) as any) : context);

            if (!context.res.headersSent && !context.res.sent) {
                context.res.statusCode = 200;

                if (value instanceof Object) {
                    context.res.setHeader("Content-Type", "application/json");
                    context.res.send(JSON.stringify(value));
                } else {
                    context.res.send(value);
                }
            }
        } catch (error) {
            if (!context.res.headersSent && !context.res.sent) {
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
                context.res.send(responseError);
            }
        }
    });
}
