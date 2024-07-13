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
 * Any compatible form of middleware, such as function, effect or composed.
 */
export type MiddlewareLike<Context, Fail = Error> =
    | MiddlewareFn<Context>
    | MiddlewareEffect<Context, Fail>
    | Composed<Context>;

export type EffectOrComposed<Context> =
    | MiddlewareEffect<Context>
    | Composed<Context>;

/**
 * Representation of composed middleware tree.
 */
export type PlainComposedTree<Context> = {
    chain: MiddlewareEffect<Context>[];
    forks: (MiddlewareEffect<Context> | PlainComposedTree<Context>)[][];
};

export interface ComposedApi<Context> {
    __composed: typeof __composed;

    chain: EffectOrComposed<Context>[];
    forks: EffectOrComposed<Context>[][];

    first: MiddlewareEffect<Context>;
    last: MiddlewareEffect<Context>;

    unrollChain(): MiddlewareEffect<Context>[];

    unroll(): PlainComposedTree<Context>;

    fork(
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    forkEach(
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>[];

    use(
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    filter(
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    forkFilter(
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    branch(
        predicate: MaybeArray<(MiddlewareLike: Context) => boolean>,
        matchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
        mismatchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
    ): Composed<Context>;

    split(
        predicate: MaybeArray<(context: Context) => boolean>,
        matchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
        mismatchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
    ): void;
}

export type ExecuteFunction<Context> = (context: Context) => Promise<Context>;
export type Composed<Context> = ExecuteFunction<Context> & ComposedApi<Context>;

/**
 * Creates an empty middleware effect.
 *
 * The resulting effect behaves like a transmitter, passing the context object
 * without modifying it.
 */
export function pass<Context>(): MiddlewareEffect<Context> {
    return createEffect(
        (context: Context) => context,
    ) as MiddlewareEffect<Context>;
}

function extractContext<Context>(effectDone: MiddlewareEffectDone<Context>) {
    return effectDone.result || effectDone.params;
}

/**
 * Runs middleware chain.
 *
 * A chain of middleware will be successfully executed if the first and last
 * effects are connected directly or indirectly by a sample or split.
 * ```ts
 * const a = createEffect(...);
 * const b = createEffect(...);
 * const с = createEffect(...);
 *
 * execute(a, c, ...); // This won't run
 * ```
 * ```ts
 * compose(a, b, c);
 *
 * execute(a, c, ...); // This will run
 * ```
 *
 * If one of the chain's effects throws an exception, execution will be aborted
 * because the done event will not be sent.
 * ```ts
 * const a = createEffect(() => { throw "abort" });
 * const b = createEffect(...);
 *
 * compose(a, b);
 *
 * execute(a, b, ...); // This won't run
 * ```
 * ```ts
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

function concat<Context>(
    from: EffectOrComposed<Context>,
    to: EffectOrComposed<Context>,
) {
    const first = isComposed(from) ? from.last : from;
    const second = isComposed(to) ? to.first : to;

    sample({
        clock: first.done,
        fn: extractContext<Context>,
        target: second,
    });

    return to;
}

function concatEach<Context>(...middlewares: EffectOrComposed<Context>[]) {
    middlewares.reduce(concat);
    return middlewares;
}

const __composed = Symbol("IsComposed");

function isComposed<Context>(
    middleware: MiddlewareLike<Context>,
): middleware is Composed<Context> {
    return (
        "__composed" in middleware &&
        Object.is(middleware.__composed, __composed)
    );
}

function extractFirst<Context>(middleware: EffectOrComposed<Context>) {
    return isComposed(middleware) ? middleware.first : middleware;
}

function extractLast<Context>(middleware: EffectOrComposed<Context>) {
    return isComposed(middleware) ? middleware.first : middleware;
}

function toEffectOrComposed<Context>(middleware: MiddlewareLike<Context>) {
    return isComposed(middleware) ? middleware : toEffect(middleware);
}

export function compose<Context>(
    ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
): Composed<Context> {
    let chain: EffectOrComposed<Context>[] =
        middlewares.length === 0
            ? [pass()]
            : concatEach(...flatten(middlewares).map(toEffectOrComposed));
    let forks: EffectOrComposed<Context>[][] = [];

    const first = () => extractFirst(chain[0]);
    const last = () => extractLast(chain.at(-1) as EffectOrComposed<Context>);

    function trimLeaf(middlewares: EffectOrComposed<Context>[]) {
        if (Object.is(extractFirst(middlewares[0]), last()))
            return middlewares.slice(1);
        return middlewares;
    }

    function pushToChain(middlewares: EffectOrComposed<Context>[]) {
        chain.push(...trimLeaf(middlewares));
    }

    function pushToForks(middlewares: EffectOrComposed<Context>[]) {
        forks.push(trimLeaf(middlewares));
    }

    function concatWithFilter(
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context> {
        const filter = composeFilter(predicate);
        const next = compose(...middlewares);

        sample({
            clock: last().done,
            filter: (done) => filter(extractContext(done)),
            fn: extractContext<Context>,
            target: next.first,
        });

        return next;
    }

    function selfExecute(context: Context) {
        return execute(first(), last(), context);
    }

    const api: ComposedApi<Context> = {
        __composed: __composed,

        get chain() {
            return chain;
        },
        get forks() {
            return forks;
        },
        get first(): MiddlewareEffect<Context> {
            return first();
        },
        get last(): MiddlewareEffect<Context> {
            return last();
        },

        unrollChain() {
            return flatten(
                this.chain.map((middleware) =>
                    isComposed(middleware)
                        ? middleware.unrollChain()
                        : middleware,
                ),
            );
        },

        unroll() {
            return {
                chain: this.unrollChain(),
                forks: this.forks.map((chain) =>
                    chain.map((middleware) =>
                        isComposed(middleware)
                            ? middleware.unroll()
                            : middleware,
                    ),
                ),
            };
        },

        fork(...middlewares): Composed<Context> {
            const next = compose(this.last, ...middlewares);
            pushToForks(next.chain);
            return next;
        },

        forkEach(...middlewares): Composed<Context>[] {
            return middlewares.map((middleware) => this.fork(middleware));
        },

        use(...middlewares): Composed<Context> {
            const next = compose(this.last, ...middlewares);
            pushToChain(next.chain);
            return next;
        },

        filter(predicate, ...middlewares): Composed<Context> {
            const next = concatWithFilter(predicate, ...middlewares);
            pushToChain(next.chain);
            return next;
        },

        forkFilter(predicate, ...middlewares): Composed<Context> {
            const next = concatWithFilter(predicate, ...middlewares);
            pushToForks(next.chain);
            return next;
        },

        branch(predicate, matchMiddlewares, mismatchMiddlewares) {
            const filter = composeFilter(predicate);
            const match = compose(matchMiddlewares);
            const mismatch = compose(mismatchMiddlewares);

            return this.use((context) =>
                filter(context)
                    ? match(context)
                    : mismatch(context),
            );
        },

        split(predicate, matchMiddlewares, mismatchMiddlewares) {
            const filter = composeFilter(predicate);
            const match = compose(matchMiddlewares);
            const mismatch = compose(mismatchMiddlewares);

            const prependMiddlewareContextResolver = <Context>(
                effect: MiddlewareEffect<Context>,
            ) =>
                effect.prepend((done: MiddlewareEffectDone<Context>) =>
                    extractContext(done),
                );

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

            pushToForks(match.chain);
            pushToForks(mismatch.chain);
        },
    };

    return Object.assign(selfExecute, api);
}
