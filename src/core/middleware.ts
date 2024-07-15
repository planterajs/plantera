import {
    createEffect,
    createEvent,
    Effect,
    Event,
    EventCallable,
    sample,
    split,
} from "effector";
import { flatten } from "lodash";
import { MaybeArray, MaybePromise } from "../types";
import { toEffect } from "./helpers/toEffect";
import { watchOnSpot } from "./helpers/watchOnSpot";
import { composeFilter } from "./helpers/composeFilter";

/**
 * Middleware in the form of a function.
 */
export type MiddlewareFunction<Context> = (
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
    | MiddlewareFunction<Context>
    | MiddlewareEffect<Context, Fail>
    | Composed<Context>;

export type EffectOrComposed<Context> =
    | MiddlewareEffect<Context>
    | Composed<Context>;

export interface ComposedApi<Context> {
    __composed: typeof __composed;

    first: MiddlewareEffect<Context>;
    last: MiddlewareEffect<Context>;
    step: EventCallable<Context>;

    use(
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    filter(
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    forEach<Items extends any[], Product>(
        middlewares: Items,
        factory: (
            item: Items[number],
            instance: Composed<Context>,
        ) => Product,
    ): Product[];

    intercept(
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    on(
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    when(
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    fork(
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

const __composed = Symbol("IsComposed");

function isComposed<Context>(
    middleware: MiddlewareLike<Context> | Event<Context>,
): middleware is Composed<Context> {
    return (
        "__composed" in middleware &&
        Object.is(middleware.__composed, __composed)
    );
}

function linkEffects<Context>(
    from: MiddlewareEffect<Context>,
    to: MiddlewareEffect<Context>,
) {
    sample({
        clock: from.done,
        fn: extractContext<Context>,
        target: to,
    });

    return to;
}

function concatEffectOrComposed<Context>(
    ...middlewares: EffectOrComposed<Context>[]
) {
    middlewares.reduce((from, to) =>
        linkEffects(
            isComposed(from) ? from.last : from,
            isComposed(to) ? to.first : to,
        ),
    );
    return middlewares;
}

function extractFirst<Context>(middleware: EffectOrComposed<Context>) {
    return isComposed(middleware) ? middleware.first : middleware;
}

function extractLast<Context>(middleware: EffectOrComposed<Context>) {
    return isComposed(middleware) ? middleware.last : middleware;
}

function toEffectOrComposed<Context>(middleware: MiddlewareLike<Context>) {
    return isComposed(middleware) ? middleware : toEffect(middleware);
}

export function compose<Context>(
    ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
): Composed<Context> {
    let effectOrComposedList: EffectOrComposed<Context>[] =
        middlewares.length === 0
            ? [pass()]
            : concatEffectOrComposed(
                  ...flatten(middlewares).map(toEffectOrComposed),
              );

    let first = extractFirst(effectOrComposedList[0]);
    let last = extractLast(
        effectOrComposedList.at(-1) as EffectOrComposed<Context>,
    );

    const step = createEvent<Context>();
    effectOrComposedList.forEach((middleware) =>
        isComposed(middleware)
            ? middleware.intercept(step)
            : sample({
                  clock: middleware.done,
                  fn: extractContext<Context>,
                  target: step,
              }),
    );

    function selfExecute(context: Context) {
        return execute(first, last, context);
    }

    function wrap(instance: ComposedApi<Context>) {
        return Object.assign(selfExecute, instance);
    }

    function forward(
        middlewares: MaybeArray<MiddlewareLike<Context>>[],
        shouldExtend = false,
    ) {
        const next = compose(...middlewares);
        linkEffects(last, next.first);
        if (shouldExtend) last = next.last;
        next.intercept(step);

        return next;
    }

    function forwardWithFilter(
        predicate: MaybeArray<(context: Context) => boolean>,
        middlewares: MaybeArray<MiddlewareLike<Context>>[],
        shouldExtend = false,
    ) {
        const next = compose(...middlewares);

        const filter = composeFilter(predicate);
        sample({
            clock: last.done,
            filter: (done) => filter(extractContext(done)),
            fn: extractContext<Context>,
            target: next.first,
        });

        if (shouldExtend) last = next.last;
        next.intercept(step);

        return next;
    }

    const instance: ComposedApi<Context> = {
        __composed: __composed,

        get first() {
            return first;
        },
        get last() {
            return last;
        },
        get step() {
            return step;
        },

        use(...middlewares) {
            return forward(middlewares, true);
        },

        filter(predicate, ...middlewares) {
            return forwardWithFilter(predicate, middlewares, true);
        },

        forEach(middlewares, factory) {
            return middlewares.map((middleware) =>
                factory(middleware, wrap(this)),
            );
        },

        intercept(...middlewares) {
            const next = compose(...middlewares);
            sample({
                clock: this.step,
                target: next.first,
            });

            return next;
        },

        on(predicate, ...middlewares) {
            const next = compose(...middlewares);
            sample({
                clock: first,
                filter: composeFilter(predicate),
                target: next.first,
            });

            return next;
        },

        when(predicate, ...middlewares) {
            const next = compose(...middlewares);
            sample({
                clock: this.step,
                filter: composeFilter(predicate),
                target: next.first,
            });

            return next;
        },

        fork(...middlewares) {
            return forward(middlewares);
        },

        forkFilter(predicate, ...middlewares) {
            return forwardWithFilter(predicate, middlewares);
        },

        branch(predicate, matchMiddlewares, mismatchMiddlewares) {
            const match = compose(matchMiddlewares);
            const mismatch = compose(mismatchMiddlewares);
            match.intercept(this.step);
            mismatch.intercept(this.step);

            const filter = composeFilter(predicate);

            return this.use((context) =>
                filter(context) ? match(context) : mismatch(context),
            );
        },

        split(predicate, matchMiddlewares, mismatchMiddlewares) {
            const match = compose(matchMiddlewares);
            const mismatch = compose(mismatchMiddlewares);
            match.intercept(this.step);
            mismatch.intercept(this.step);

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

            const filter = composeFilter(predicate);

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

    return wrap(instance);
}
