import { createEffect, Effect, sample, split } from "effector";
import { flatten } from "lodash";
import { MaybeArray, MaybePromise } from "../types";
import { toEffect } from "./helpers/toEffect";
import { watchOnSpot } from "./helpers/watchOnSpot";
import { composeFilter } from "./helpers/composeFilter";

/**
 * Middleware in the form of a function.
 */
export type MiddlewareFn<Context> = (
    context: Context,
) => MaybePromise<Context | void>;

/**
 * Middleware in the form of an effect.
 */
export type MiddlewareEffect<Context, Fail = Error> = Effect<
    Context,
    Context | void,
    Fail
>;

/**
 * Data passed from the effect middleware .done event.
 */
export type MiddlewareEffectDone<Context> = {
    params: Context;
    result: Context | void;
};

/**
 * Input and output effects of the composed middleware.
 */
export type Chain<Context> = {
    first: MiddlewareEffect<Context>;
    last: MiddlewareEffect<Context>;
};

/**
 * Any compatible form of middleware, such as function, effect or composed.
 */
export type MiddlewareLike<Context, Fail = Error> =
    | MiddlewareFn<Context>
    | MiddlewareEffect<Context, Fail>
    | Chain<Context>;

/**
 * Function that runs middleware chain.
 */
export type ExecuteFn<Context> = (context: Context) => Promise<Context>;

/**
 * Interface available in composed middleware.
 */
export type ComposedApi<Context> = Chain<Context> & {
    /**
     * Concatenates/forwards passed middlewares to the current chain. After this
     * method executed, the last effect of the current chain will be the last
     * passed middleware.
     * ```ts
     * // "a" and "b" will be called sequentially after the previous chain.
     * composed.use(a, b);
     * ```
     *
     * This method combines all passed middleware into one chain and
     * returns a new composed. The returned instance can be further extended
     * and all changes will be regarded here.
     */
    use: (
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ) => Composed<Context>;

    /**
     * Concatenates/forwards passed middlewares to the current chain with a
     * filter attached. The following middleware will only be executed
     * if the filter returns true.
     * ```ts
     * // "a" and "b" will be called sequentially after the previous chain
     * // if the filter's predicate returns true.
     * composed.filter(predicate, a, b);
     * ```
     *
     * This method combines all passed middleware into one chain and
     * returns a new composed. The returned instance can be further extended
     * and all changes will be regarded here.
     */
    filter: (
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ) => Composed<Context>;

    /**
     * Concatenates/forwards passed middlewares to the current chain, but
     * without extending the current chain. This behaviour allows to add
     * concurrency in your middleware system.
     * ```ts
     * composed.use(a); // "a" will run first
     * composed.fork(b); // "b" will be started second, but run concurrently
     * composed.use(c); // "c" will also be run second
     * ```
     *
     * As said before, this method doesn't extend the current chain, so
     * the resulting value will not depend on forked middlewares.
     *
     * This method combines all passed middleware into one chain and
     * returns a new composed. The returned instance can be further extended
     * and all changes will be regarded here.
     */
    fork: (
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ) => Composed<Context>;

    /**
     * Combines each passed middleware into individual chains and returns an
     * array of new composed instances. Each middleware will run concurrently,
     * but independently of each other.
     *
     * ```ts
     * composed.use(a); // "a" will run first
     * composed.forkEach(b, c, d);
     * // "b", "c", and "d" will each run concurrently but separately
     * composed.use(e); // "e" will run after "a"
     * ```
     *
     * Unlike `fork`, which combines all passed middleware into a single concurrent chain,
     * `forkEach` creates a separate chain for each middleware. This method does not extend
     * the current chain, so the resulting values will not depend on the forked middlewares.
     *
     * This method combines all passed middleware into one chain and
     * returns a new composed. The returned instance can be further extended
     * and all changes will be regarded here.
     */
    forkEach: (
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ) => Composed<Context>[];

    /**
     * Branches the middleware execution based on a predicate. If the predicate
     * returns true, the `matchMiddlewares` will be executed. Otherwise, the
     * `mismatchMiddlewares` will be executed.
     *
     * ```ts
     * composed.branch(
     *   predicate,
     *   [trueMiddleware],
     *   [falseMiddleware]
     * );
     * // If predicate(...) is true, trueMiddleware runs.
     * // If predicate(...) is false, falseMiddleware runs.
     * ```
     *
     * This method combines all match and mismatch middlewares into one chain
     * respectively and doesn't return any further interface due to branching
     * mechanics.
     */
    branch: (
        predicate: MaybeArray<(MiddlewareLike: Context) => boolean>,
        matchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
        mismatchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
    ) => void;

    /**
     * Splits the middleware execution based on a predicate, similar to `branch`, but
     * utilizes an event-driven approach to handle the execution paths. If the predicate
     * returns true, the `matchMiddlewares` will be executed. Otherwise, the
     * `mismatchMiddlewares` will be executed.
     *
     * ```ts
     * composed.branch(
     *   predicate,
     *   [trueMiddleware],
     *   [falseMiddleware]
     * );
     * // If predicate(...) is true, trueMiddleware runs.
     * // If predicate(...) is false, falseMiddleware runs.
     * ```
     *
     * This method combines all match and mismatch middlewares into one chain
     * respectively and doesn't return any further interface due to branching
     * mechanics.
     */
    split: (
        predicate: MaybeArray<(context: Context) => boolean>,
        matchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
        mismatchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
    ) => void;
};

/**
 * Middleware that was composed.
 */
export type Composed<Context> = ExecuteFn<Context> & ComposedApi<Context>;

const CHAIN_KEYS: (keyof Chain<any>)[] = ["first", "last"];

function isChain<Context>(
    middleware: MiddlewareLike<Context>,
): middleware is Chain<Context> {
    return CHAIN_KEYS.every((key) => key in middleware);
}

function toSingularChain<Context>(
    effect: MiddlewareEffect<Context>,
): Chain<Context> {
    return {
        first: effect,
        last: effect,
    };
}

/**
 * Creates an empty middleware effect.
 *
 * The resulting effect behaves like a transmitter, passing the context object
 * without modifying it.
 */
export function pass<Params>() {
    return createEffect((context: Params) => context);
}

function extractContext<Context>(effectDone: MiddlewareEffectDone<Context>) {
    return effectDone.result || effectDone.params;
}

/**
 * Runs middleware chain.
 *
 * A chain of middleware will be successfully executed if the first and last
 * effects are connected directly or indirectly by a sample or split.
 * ```js
 * const a = createEffect(...);
 * const b = createEffect(...);
 * const с = createEffect(...);
 *
 * execute(a, c, ...); // This won't run
 * ```
 * ```js
 * compose(a, b, c);
 *
 * execute(a, c, ...); // This will run
 * ```
 *
 * If one of the chain's effects throws an exception, execution will be aborted
 * because the done event will not be sent.
 * ```js
 * const a = createEffect(() => { throw "abort" });
 * const b = createEffect(...);
 *
 * compose(a, b);
 *
 * execute(a, b, ...); // This won't run
 * ```
 * ```js
 * const a = createEffect(() => { if (condition) throw "abort" });
 * const b = createEffect(...);
 *
 * compose(a, b);
 *
 * execute(a, b, ...); // This will run if condition is right
 * ```
 */
export function execute<Context>(
    first: MiddlewareEffect<Context>,
    last: MiddlewareEffect<Context>,
    context: Context,
) {
    return new Promise<Context>((resolve) => {
        watchOnSpot(last.done, (done) => resolve(extractContext(done)));
        first(context);
    });
}

/**
 * Composes middlewares into one chain.
 *
 * The function accepts any middleware that matches the shape of the middleware,
 * be it a function, effect, or other composed. It also accepts array chunks.
 * ```js
 * // This is valid input
 * compose(function, effect, composed, [function], [effect, composed]);
 * ```
 *
 * If you want to include another composite, do not try to pass its chain fields,
 * this may lead to unpredictable behavior.
 * ```js
 * // Good
 * compose(..., composed, ...);
 * ```
 * ```js
 * // Unsafe!
 * compose(composed.first);
 * compose(composed.last);
 * compose(composed.first, ..., composed.last);
 * ```
 */
export function compose<Context>(
    ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
): Composed<Context> {
    if (middlewares.length === 0) middlewares = [pass()];

    const chains = flatten(middlewares).map((middleware) =>
        !isChain(middleware)
            ? toSingularChain(toEffect(middleware))
            : middleware,
    ) as Chain<Context>[];

    const first = chains[0].first;

    const lastChain = chains.reduce((a, b) => {
        sample({
            clock: a.last.done,
            fn: extractContext<Context>,
            target: b.first,
        });

        return b;
    });

    let last = lastChain.last;

    const handle = (context: Context) => execute(first, last, context);

    const api: ComposedApi<Context> = {
        first,
        last,
        use(...middlewares) {
            const next = compose(this.last, ...middlewares);
            this.last = next.last;
            return next;
        },
        filter(predicate, ...middlewares) {
            const filter = composeFilter(predicate);
            const next = compose(...middlewares);

            sample({
                clock: this.last.done,
                filter: (done) => filter(extractContext(done)),
                fn: extractContext<Context>,
                target: next.first,
            });

            this.last = next.last;

            return next;
        },
        fork(...middlewares) {
            return compose(this.last, ...middlewares);
        },
        forkEach(...middlewares) {
            return middlewares.map((middleware) => this.fork(middleware));
        },
        branch(predicate, matchMiddlewares, mismatchMiddlewares) {
            const filter = composeFilter(predicate);
            const match = compose(matchMiddlewares);
            const mismatch = compose(mismatchMiddlewares);

            return this.use((context) =>
                filter(context) ? match(context) : mismatch(context),
            );
        },
        split(predicate, matchMiddlewares, mismatchMiddlewares) {
            const filter = composeFilter(predicate);
            const match = compose(matchMiddlewares);
            const mismatch = compose(mismatchMiddlewares);

            function prependMiddlewareContextResolver<Context>(
                effect: MiddlewareEffect<Context>,
            ) {
                return effect.prepend((done: MiddlewareEffectDone<Context>) =>
                    extractContext(done),
                );
            }

            const matchTarget = prependMiddlewareContextResolver(match.first);
            const mismatchTarget = prependMiddlewareContextResolver(
                mismatch.first,
            );

            split({
                clock: this.last.done,
                source: this.last.done,
                match: (done: MiddlewareEffectDone<Context>) =>
                    filter(extractContext(done)) ? "match" : "mismatch",
                cases: {
                    match: matchTarget,
                    mismatch: mismatchTarget,
                },
            });
        },
    };

    return Object.assign(handle, api);
}
