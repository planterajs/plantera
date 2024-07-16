import { MaybePromise } from "./types";
import { createEffect } from "effector/compat";
import { RequestContext } from "./context";

/**
 * Creates a controller middleware that executes a given function and sends the result
 * as an HTTP response. The function can be mapped from the context, and the response
 * is automatically formatted based on the function's return value.
 *
 * ```ts
 * const greetingController = controller(
 *     (name) => `hello, ${name}!`,
 *     (context) => context.req.params.name
 * );
 *
 * router.get("/hello/:name", greetingController);
 * ```
 *
 * @param fn Controller's callback.
 * @param map Adapter function.
 * @returns Controller middleware.
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

            if (!context.res.sent) {
                context.res.statusCode = 200;
                context.res.send(value);
            }
        } catch (error) {
            if (!context.res.sent) {
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

                context.res.end(responseError);
            }
        }
    });
}
