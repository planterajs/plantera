import {
    createEffect,
    createEvent,
    Effect,
    Event, EventAsReturnType,
    EventCallable,
    sample,
    split
} from "effector";
import { flatten } from "lodash";
import { MaybeArray, MaybePromise } from "../types";
import { toEffect } from "./helpers/toEffect";
import { watchOnSpot } from "./helpers/watchOnSpot";
import { composeFilter } from "./helpers/composeFilter";
import { Context } from "node:vm";

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
 * Data passed from the effect middleware .fail event.
 */
export type MiddlewareEffectFail<Context, Fail = Error> = {
    params: Context;
    error: Fail;
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

/**
 * Callable part of preset.
 */
export type PresetFunction<Context> = (
    instance: Composed<Context>,
) => Composed<Context>;

/**
 * Middleware that works with composed middleware API.
 * Presets are used to directly modify and update an instance. For example,
 * use `fork` or `filter` on it without the need to create a separate composed.
 *
 * Use `createPreset` method to create new presets.
 */
export type Preset<Context> = PresetFunction<Context> & {
    __preset: typeof __preset;
};

/**
 * Symbol marker for presets.
 */
const __preset = Symbol("IsPreset");

/**
 * Checks if function is preset.
 *
 * @param fn Function that can be a preset.
 */
function isPreset(fn: any): fn is Preset<Context> {
    return "__preset" in fn && Object.is(fn.__preset, __preset);
}

/**
 * Creates a middlewares that works with composed middleware API.
 * Presets are used to directly modify and update an instance. For example,
 * use `fork` or `filter` on it without the need to create a separate composed.
 *
 * Presets can be registered in composed middleware with `use` or `apply` methods.
 *
 * Without presets:
 * ```ts
 * const applyCustomFilter = () => {
 *     const separateComposed = compose();
 *     separateComposed.filter(predicate, something);
 *     return separateComposed;
 * }
 *
 * composed.use(applyCustomFilter());
 * ```
 *
 * With presets:
 * ```ts
 * const applyCustomFilter = createPreset(
 *    source => source.filter(predicate, something)
 * );
 *
 * composed.use(applyCustomFilter);
 * ```
 *
 * @param fn Function of the preset.
 * @returns Preset middleware.
 */
export function createPreset<Context>(fn: PresetFunction<Context>) {
    return Object.assign(fn, { __preset }) as Preset<Context>;
}

/**
 * Interface of a composed middleware.
 */
export interface ComposedApi<Context> {
    /**
     * Mark for composed middlewares.
     */
    __composed: typeof __composed;

    /**
     * First effect of the current composed middleware. It can be used as a
     * firing event because of its targeting properties.
     *
     * Not recommended to use it in another `compose` explicitly, it may lead
     * to unpredictable behaviour.
     */
    first: MiddlewareEffect<Context>;

    /**
     * Last effect of the current composed middleware. It can be used as a
     * terminator event because of its targeting properties.
     *
     * Not recommended to use it in another `compose` explicitly, it may lead
     * to unpredictable behaviour.
     */
    last: MiddlewareEffect<Context>;

    /**
     * Event that fires after the successful execution of each of the
     * middleware of the current composed middleware system.
     *
     * Not recommended to use it in another `compose` explicitly, it may lead
     * to unpredictable behaviour.
     */
    step: EventCallable<Context>;

    /**
     * Event that fires when any of the current system's middleware throws
     * an exception.
     *
     * Not recommended to use it in another `compose` explicitly, it may lead
     * to unpredictable behaviour.
     */
    fail: EventCallable<MiddlewareEffectFail<Context, any>>;

    /**
     * An alias event, derived for `last` property. It only fires when `last`
     * effect is fired.
     */
    passes: EventAsReturnType<Context>;

    /**
     * An alias event, derived for `last.done` property.
     * It only fires when `last.done` effect is fired.
     */
    ends: EventAsReturnType<Context>;

    /**
     * Composes passed middlewares and forwards the last current middleware to
     * the first passed one. Returns an extension of the current composed middleware.
     *
     * ```ts
     * composed.use(first, second);
     * // first and second will run after
     * ```
     *
     * If you look for a method that works with preset middlewares - try `apply`.
     *
     * @param middlewares List of middlewares to compose and attach.
     * @returns Extension of the current composed middleware.
     */
    use(
        ...middlewares: MaybeArray<MiddlewareLike<Context> | Preset<Context>>[]
    ): Composed<Context>;

    /**
     * Composes passed predicates and middlewares respectively and forwards
     * the last current middleware to the first passed one with filter attached.
     * Returns an extension of the current composed middleware.
     *
     * ```ts
     * composed.filter(predicate, next);
     * // next will run if predicate returns true
     * ```
     *
     * @param predicate Predicate function or list of predicate functions.
     * @param middlewares List of middlewares to compose and attach.
     * @returns Extension of the current composed middleware.
     */
    filter(
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    /**
     * Iterates through passed items with a provided relevant instance.
     * Returns a list of values that were returned from callback.
     *
     * ```ts
     * // forks each middleware separately
     * composed.forEach(
     *     [first, second, third],
     *     (it, instance) => instance.fork(it)
     * );
     * ```
     *
     * @param items List of items that should be iterated.
     * @param factory Callback that will run for each item.
     * @returns List of values that were returned from callback.
     */
    forEach<Items extends any[], Product>(
        items: Items,
        factory: (item: Items[number], instance: Composed<Context>) => Product,
    ): Product[];

    /**
     * Composes passed middlewares and forwards `step` event
     * to the first passed one. Returns composed passed middlewares.
     *
     * The `step` event will fire after the successful execution of each of the
     * middleware of the current composed middleware system. It means, that
     * next composed will run each time some middleware executes.
     *
     * ```ts
     * composed.intercept(first).use(second);
     * // first and second will run after each step
     * ```
     *
     * @param middlewares List of middlewares to compose and attach.
     * @returns Composed passed middlewares.
     */
    intercept(
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    /**
     * Composes passed middlewares and forwards `first` effect
     * to the first passed one with filter attached.
     * Returns composed passed middlewares.
     *
     * The `first` event will fire after each execution of the current
     * composed middleware. It means, that next composed will run each time
     * this middleware executes.
     *
     * ```ts
     * composed.on(predicate, next);
     * // next will run if predicate returns true after each execution
     * ```
     *
     * @param predicate Predicate function or list of predicate functions.
     * @param middlewares List of middlewares to compose and attach.
     * @returns Composed passed middlewares.
     */
    on(
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    /**
     * Composes passed middlewares and forwards `step` event
     * to the first passed one with filter attached.
     * Returns composed passed middlewares.
     *
     * The `step` event will fire after the successful execution of each of the
     * middleware of the current composed middleware system. It means, that
     * next composed will run each time some middleware executes and predicate
     * returns true.
     *
     * ```ts
     * composed.when(predicate, next);
     * // next will run if predicate returns true after each step
     * ```
     *
     * @param predicate Predicate function or list of predicate functions.
     * @param middlewares List of middlewares to compose and attach.
     * @returns Composed passed middlewares.
     */
    when(
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    /**
     * Composes passed middlewares and forwards `fail` event
     * to the first passed one with filter attached.
     * Returns composed passed middlewares.
     *
     * The `fail` event will fire when any of the current system's middleware
     * throws an exception. It means, that next composed will run each time some
     * middleware throws an exception.
     *
     * ```ts
     * composed.catch(next);
     * // next will run after each fail
     * ```
     *
     * @param middlewares List of middlewares to compose and attach.
     * @returns Composed passed middlewares.
     */
    catch(
        ...middlewares: MaybeArray<
            MiddlewareLike<MiddlewareEffectFail<Context, any>>
        >[]
    ): Composed<MiddlewareEffectFail<Context, any>>;

    /**
     * Iterates through passed presents with a provided relevant instance.
     * Returns updated instance of the current composed middleware.
     *
     * Presets are functions that works with provided instance and can
     * define its next structure with API calls.
     *
     * ```ts
     * const preset = (instance: Composed<Context>) => instance.use(next);
     * compose.apply(preset);
     * // next will run after
     * ```
     *
     * If you look for a method that works with static middlewares - try `use`.
     *
     * @params presets List of preset middlewares.
     * @returns Updated instance of the current composed middleware.
     */
    apply(...presets: PresetFunction<Context>[]): Composed<Context>;

    /**
     * Composes passed middlewares and forwards the last current middleware to
     * the first passed one without extension. It can be used for high-level
     * concurrency or separation in use middleware system.
     * Returns an untouched instance of the current composed middleware.
     *
     * ```ts
     * composed.use(first); // will run first
     * composed.fork(second, third); // will run after first, but concurrently
     * composed.use(fourth); // will run after first
     * ```
     *
     * If you look for a method that also extends
     * current composed middleware - try `use`.
     *
     * @param middlewares List of middlewares to compose and attach.
     * @returns Untouched instance of the current composed middleware.
     */
    fork(
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    /**
     * Composes passed predicates and middlewares respectively and forwards
     * the last current middleware to the first passed one with filter attached
     * (like `filter`) without extension.
     * Returns an untouched instance of the current composed middleware.
     *
     * ```ts
     * // will run first
     * composed.use(first);
     * // will run after first as filter, but concurrently
     * composed.forkFilter(predicate, second);
     *  // will run after first
     * composed.use(third);
     * ```
     *
     * @param predicate Predicate function or list of predicate functions.
     * @param middlewares List of middlewares to compose and attach.
     * @returns Untouched instance of the current composed middleware.
     */
    forkFilter(
        predicate: MaybeArray<(context: Context) => boolean>,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    /**
     * Composes passed predicates and middlewares respectively and creates
     * a new attached middleware that will execute match or mismatch middlewares
     * based on predicate's return value.
     * Returns an extension of the current composed middleware.
     *
     * ```ts
     * composed.branch(predicate, match, mismatch);
     * // if predicates returns true, match will run, otherwise - mismatch
     * ```
     *
     * @param predicate Predicate function or list of predicate functions.
     * @param matchMiddlewares Middlewares that will run if predicate returns `true`.
     * @param mismatchMiddlewares Middlewares that will run if predicate returns `false`.
     * @returns Extension of the current composed middleware.
     */
    branch(
        predicate: MaybeArray<(MiddlewareLike: Context) => boolean>,
        matchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
        mismatchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
    ): Composed<Context>;

    /**
     * Composes passed predicates and middlewares respectively and splits
     * execution result of last middleware of the current composed middleware
     * based on predicate's return value.
     *
     * This method is similar to `branch`, but doesn't extend current composed
     * middleware.
     *
     * ```ts
     * composed.split(predicate, match, mismatch);
     * // if predicates returns true, match will run, otherwise - mismatch
     * ```
     *
     * @param predicate Predicate function or list of predicate functions.
     * @param matchMiddlewares Middlewares that will run if predicate returns `true`.
     * @param mismatchMiddlewares Middlewares that will run if predicate returns `false`.
     */
    split(
        predicate: MaybeArray<(context: Context) => boolean>,
        matchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
        mismatchMiddlewares: MaybeArray<MiddlewareLike<Context>>,
    ): void;
}

/**
 * Callable part of a composed middleware. It fires first effect to trigger
 * call chain, which may lead to successful execution or an exception.
 *
 * If you want to run composed middleware explicitly, try `execute`.
 */
export type ExecuteFunction<Context> = (context: Context) => Promise<Context>;

/**
 * Middlewares that was composed.
 */
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

/**
 * Finds relevant context in `result` and `params` fields
 * of effect's `done` event value.
 *
 * @param effectDone
 * @returns Extracted context.
 */
function extractContext<Context>(effectDone: MiddlewareEffectDone<Context>) {
    return effectDone.result || effectDone.params;
}

/**
 * Executes middleware chain by firing first effect and intercepting the last one.
 * Used as callable part of a composed middleware.
 *
 * @param first Effect to call.
 * @param last Effect to intercept.
 * @param context Context to call first effect with.
 * @returns Final context or an exception.
 */
export function execute<Context>(
    first: MiddlewareEffect<Context>,
    last: MiddlewareEffect<Context>,
    context: Context,
) {
    return new Promise<Context>((resolve) => {
        watchOnSpot(last.finally, (result) => {
            if (result.status === "fail") throw result.error;
            resolve(extractContext(result));
        });
        first(context);
    });
}

/**
 * Symbol marker for composed middlewares.
 */
const __composed = Symbol("IsComposed");

/**
 * Checks if middleware is composed.
 *
 * @param middleware Middleware that can be composed middleware.
 */
function isComposed<Context>(
    middleware: MiddlewareLike<Context>,
): middleware is Composed<Context> {
    return (
        "__composed" in middleware &&
        Object.is(middleware.__composed, __composed)
    );
}

/**
 * Produces forwarding sampling of two middlewares.
 *
 * @param from Middleware to forward from.
 * @param to Middleware to forward to.
 */
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

/**
 * Produces forwarding sampling for each middleware
 * (that may be composed or just an effect) pair respectively.
 *
 * @param middlewares Effects or composed middlewares.
 */
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

/**
 * Finds the starting edge effect of some composed middleware or effect.
 *
 * @param middleware Effect or composed middleware.
 */
function extractFirst<Context>(middleware: EffectOrComposed<Context>) {
    return isComposed(middleware) ? middleware.first : middleware;
}

/**
 * Finds the final edge effect of some composed middleware or effect.
 *
 * @param middleware Effect or composed middleware.
 */
function extractLast<Context>(middleware: EffectOrComposed<Context>) {
    return isComposed(middleware) ? middleware.last : middleware;
}

/**
 * Turns function into effect if it's a function, resulting into a value
 * that can be an effect or a composed middleware.
 *
 * @param middleware Middleware-like value.
 */
function toEffectOrComposed<Context>(middleware: MiddlewareLike<Context>) {
    return isComposed(middleware) ? middleware : toEffect(middleware);
}

/**
 * Creates an executable chain from a list of middlewares, proving an API for
 * its subsequent extension and binding.
 *
 * The passed middleware can be any callable: a function, effect,
 * or other composed middleware, or a sublist of similar elements.
 *
 * Simplest usage:
 * ```ts
 * const composed = compose(a, b);
 * composed(); // executes
 * execute(composed.first, composed.last); // more explicit variant
 * ```
 * Right after execute, `a` will run. After `a` finishes, b will run with the
 * return value of `a`. The return value of `composed()` will be the promise of
 * return value of `b`.
 *
 * @param middlewares
 */
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

    const fail = createEvent<MiddlewareEffectFail<Context, any>>();
    effectOrComposedList.forEach((middleware) =>
        isComposed(middleware)
            ? middleware.catch(fail)
            : sample({
                  clock: middleware.fail,
                  target: fail,
              }),
    );

    const passes = last.map(params => params);
    const ends = last.done.map(extractContext);

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
        __composed,

        get first() {
            return first;
        },
        get last() {
            return last;
        },
        get step() {
            return step;
        },
        get fail() {
            return fail;
        },
        get passes() {
            return passes;
        },
        get ends() {
            return ends;
        },

        use(...middlewares) {
            const flattenedMiddlewares = flatten(middlewares);

            const presets = flattenedMiddlewares.filter(
                isPreset,
            ) as Preset<Context>[];
            this.apply(...presets);

            const rest = flattenedMiddlewares.filter(
                (middleware) => !isPreset(middleware),
            ) as MiddlewareLike<Context>[];

            return forward(rest, true);
        },

        filter(predicate, ...middlewares) {
            return forwardWithFilter(predicate, middlewares, true);
        },

        forEach(items, factory) {
            return items.map((middleware) => factory(middleware, wrap(this)));
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

        catch(...middlewares) {
            const next = compose<MiddlewareEffectFail<Context, any>>(
                ...middlewares,
            );
            sample({
                clock: this.fail,
                target: next.first,
            });

            return next;
        },

        apply(...presets) {
            return (
                (presets
                    .map((preset) => preset(wrap(this)))
                    .at(-1) as Composed<Context>) || wrap(this)
            );
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

            return this.use((context: Context) =>
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
