import { createEffect, Effect, sample, split } from "effector";
import { flatten } from "lodash";
import { MaybeArray, MaybePromise } from "../types";
import { toEffect } from "./helpers/toEffect";
import { watchOnSpot } from "./helpers/watchOnSpot";
import { composeFilter } from "./helpers/composeFilter";

export type MiddlewareFn<Context> = (
    context: Context,
) => MaybePromise<Context | void>;
export type MiddlewareEffect<Context, Fail = Error> = Effect<
    Context,
    Context | void,
    Fail
>;
export type MiddlewareEffectDone<Context> = {
    params: Context;
    result: Context | void;
};
export type Chain<Context> = {
    first: MiddlewareEffect<Context>;
    last: MiddlewareEffect<Context>;
};
export type ChainOrEffect<Context, Fail = Error> =
    | MiddlewareEffect<Context, Fail>
    | Chain<Context>;
export type MiddlewareLike<Context, Fail = Error> =
    | MiddlewareFn<Context>
    | ChainOrEffect<Context, Fail>;

export type ExecuteFn<Context> = (context: Context) => Promise<Context>;
export type ComposedApi<Context> = Chain<Context> & {
    fork: (...middlewares: MaybeArray<MiddlewareLike<Context>>[]) => Composed<Context>;
    forkEach: (...middlewares: MaybeArray<MiddlewareLike<Context>>[]) => Composed<Context>[];
    use: (...middlewares: MaybeArray<MiddlewareLike<Context>>[]) => Composed<Context>;
    filter: (
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ) => Composed<Context>;
    split: (
        predicate: MaybeArray<(context: Context) => boolean>,
        matchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
        mismatchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
    ) => void;
    branch: (
        predicate: MaybeArray<(MiddlewareLike: Context) => boolean>,
        matchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
        mismatchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
    ) => void;
};
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

export function pass<Params>() {
    return createEffect((context: Params) => context);
}

function extractContext<Context>(effectDone: MiddlewareEffectDone<Context>) {
    return effectDone.result || effectDone.params;
}

export function execute<Context>(
    from: MiddlewareEffect<Context>,
    to: MiddlewareEffect<Context>,
    context: Context,
) {
    return new Promise<Context>((resolve) => {
        watchOnSpot(to.done, (done) => resolve(extractContext(done)));
        from(context);
    });
}

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
        get last() {
            return last;
        },
        fork(...middlewares) {
            return compose(last, ...middlewares);
        },
        forkEach(...middlewares) {
            return middlewares.map((middleware) => this.fork(middleware));
        },
        use(...middlewares) {
            const next = compose(last, ...middlewares);
            last = next.last;
            return next;
        },
        filter(predicate, ...middlewares) {
            const filter = composeFilter(predicate);
            const next = compose(...middlewares);

            sample({
                clock: last.done,
                filter: (done) => filter(extractContext(done)),
                fn: extractContext<Context>,
                target: next.first,
            });

            last = next.last;

            return next;
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
                clock: last.done,
                source: last.done,
                match: (done: MiddlewareEffectDone<Context>) =>
                    filter(extractContext(done)) ? "match" : "mismatch",
                cases: {
                    match: matchTarget,
                    mismatch: mismatchTarget,
                },
            });
        },
        branch(predicate, matchMiddlewares, mismatchMiddlewares) {
            const filter = composeFilter(predicate);
            const match = compose(matchMiddlewares);
            const mismatch = compose(mismatchMiddlewares);

            return this.use((context) =>
                filter(context) ? match(context) : mismatch(context),
            );
        },
    };

    return Object.assign(handle, api);
}
