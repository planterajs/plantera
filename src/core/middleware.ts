import {
    createEffect,
    createEvent,
    createStore,
    Effect,
    Event,
    EventAsReturnType,
    EventCallable,
    sample,
    split,
    StoreWritable,
} from "effector";
import { flatten } from "lodash";
import { MaybeArray, MaybePromise } from "../types";
import { toEffect } from "./toEffect";

import { composeFilter } from "./composeFilter";
import { Context } from "node:vm";

/**
 * Middleware in the form of a function.
 */
export type MiddlewareFunction<Context> = (
    context: Context,
) => MaybePromise<Context | void>;

/**
 * Middleware in the form of an event.
 */
export type MiddlewareEvent<Context> = EventCallable<Context>;

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
export type MiddlewareEffectDoneData<Context> = {
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
    | MiddlewareEvent<Context>
    | Composed<Context>;

export type EffectOrComposed<Context> =
    | MiddlewareEffect<Context>
    | Composed<Context>;

/**
 * Callable part of preset.
 */
export type PresetFunction<Context> = (
    instance: Composed<Context>,
) => Composed<Context> | void;

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
 *    current => current.filter(predicate, something)
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
 * Creates a middleware that have access to the composed middleware
 * to which it's being attached.
 *
 * Without `aware`:
 * ```ts
 * const guard = createPreset((current) => {
 *     current.use((context) => {
 *         if (isBad(context)) current.terminated();
 *     })
 * });
 * ```
 *
 * With `aware`:
 * ```ts
 * const guard = aware((context, current) => {
 *     if (isBad(context)) current.terminated();
 * });
 * ```
 *
 * @param fn Function of a middleware.
 * @returns Preset middleware.
 */
export function aware<Context>(
    fn: (current: Composed<Context>, context: Context) => Context | void,
) {
    return createPreset<Context>((current) =>
        current.use((context: Context) => fn(current, context)),
    );
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
     * A first effect of the current composed middleware. It can be used as a
     * firing event because of its targeting properties.
     *
     * Not recommended to use it in another `compose` explicitly, it may lead
     * to unpredictable behaviour.
     */
    first: MiddlewareEffect<Context>;

    /**
     * A last effect of the current composed middleware. It can be used as a
     * terminator event because of its targeting properties.
     *
     * Not recommended to use it in another `compose` explicitly, it may lead
     * to unpredictable behaviour.
     */
    last: MiddlewareEffect<Context>;

    /**
     * An event that fires after the successful execution of each of the
     * middleware of the current composed middleware system.
     *
     * Not recommended to use it in another `compose` explicitly, it may lead
     * to unpredictable behaviour.
     */
    step: EventCallable<Context>;

    /**
     * An event that fires when any of the current system's middleware throws
     * an exception.
     *
     * Not recommended to use it in another `compose` explicitly, it may lead
     * to unpredictable behaviour.
     */
    failed: EventCallable<MiddlewareEffectFail<Context, any>>;

    /**
     * An alias event, derived for `last` property. It only fires when `last`
     * effect is fired.
     */
    passed: EventAsReturnType<Context>;

    /**
     * An alias event, derived for `last.done` property.
     * It only fires when `last.done` effect is fired.
     */
    ended: EventAsReturnType<Context>;

    /**
     * Tells if current composed middleware is terminated its execution.
     * Updates when `terminate` is called.
     *
     * Not recommended to use it in another `compose` explicitly, it may lead
     * to unpredictable behaviour.
     */
    $isTerminated: StoreWritable<boolean>;

    /**
     * Prevents further execution by updating `$isTerminating` store to `false`.
     *
     * Not recommended to use it in another `compose` explicitly, it may lead
     * to unpredictable behaviour.
     */
    terminated: EventCallable<void>;

    /**
     * Triggers execution by firing `first` effect and
     * updating `$isTerminating` store to `true`.
     *
     * Not recommended to use it in another `compose` explicitly, it may lead
     * to unpredictable behaviour.
     */
    executed: EventCallable<Context>;

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
     * Composes passed middlewares and forwards `failed` event
     * to the first passed one with filter attached.
     * Returns composed passed middlewares.
     *
     * The `failed` event will fire when any of the current system's middleware
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

    /**
     * Composes passed predicates and middlewares respectively and
     * wires middlewares such way that it acts like a `while`. The `loopMiddlewares`
     * will run in a loop until predicate returns `false`.
     *
     * ```ts
     * const increment = (v: number) => v + 1;
     * const log = (v: number) => console.log(v);
     *
     * const incrementTill = compose<number>();
     * incrementTill.while((v) => v < 5, [increment], log)
     * incrementTill(0); // -> 5
     * ```
     *
     * @param predicate Predicate function or list of predicate functions.
     * @param loopMiddlewares Middlewares that will run in a loop if predicate returns `true`.
     * @param nextMiddlewares Middlewares that will run if predicate returns `false`.
     */
    while(
        predicate: MaybeArray<(context: Context) => boolean>,
        loopMiddlewares: MaybeArray<MiddlewareLike<Context>>,
        ...nextMiddlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    /**
     * Composes passed middlewares and forwards the last current middleware to
     * the first passed one with an adapter attached.
     * Returns a composed passed middleware.
     *
     * ```ts
     * numberMiddleware.pass((n: number) => n.toString(), stringMiddleware);
     * ```
     *
     * @param adapter Function that transforms current context to compatible.
     * @param middlewares List of middlewares to compose and attach.
     */
    pass<ReceiverContext>(
        adapter: (context: Context) => ReceiverContext,
        ...middlewares: MaybeArray<MiddlewareLike<ReceiverContext>>[]
    ): Composed<ReceiverContext>;

    /**
     * Composes passed middlewares and forwards the last current middleware to
     * the queue gate. Each call will be processed after the previous one is executed,
     * depending on the number of parallel executions.
     * Returns a composed passed middleware.
     *
     * ```ts
     * composed.queue(5, worker).use(next);
     * // each 5 requests will be handled in parallel,
     * // next will be executed after each request
     * ```
     *
     * @param inParallel Number of parallel executions.
     * @param middlewares List of middlewares that will be composed as worker.
     */
    queue(
        inParallel: number,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;

    /**
     * Composes passed middlewares and forwards the last current middleware
     * to queue date. Each call will be processed within the specified time and
     * the next call will wait for this time before being executed. This method
     * is useful for rate limiting.
     *
     * ```ts
     * composed.throttle(1000 / 3, worker).use(next);
     * // each request will be handled within 333 milliseconds,
     * // next will be executed after each request
     * ```
     *
     * @param minTime Time during which one processing should take place.
     * @param middlewares List of middlewares that will be composed as worker.
     */
    throttle(
        minTime: number,
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ): Composed<Context>;
}

/**
 * Callable part of a composed middleware. It fires first effect to trigger
 * call chain.
 */
export type ExecuteFunction<Context> = (context: Context) => void;

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
 * @param effectDoneData Data passed from the effect middleware `done` event.
 * @returns Extracted context.
 */
function extractContext<Context>(
    effectDoneData: MiddlewareEffectDoneData<Context>,
) {
    return effectDoneData.result || effectDoneData.params;
}

/**
 * Derives new event that transmits extracted context from effect's `done` event.
 *
 * @param effectDone Effect's `done` event.
 * @returns Derived event.
 */
function mapContextExtractor<Context>(
    effectDone: Event<MiddlewareEffectDoneData<Context>>,
) {
    return effectDone.map(extractContext) as Event<Context>;
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

function createQueueStore<Context>(
    queued: Event<Context> | Effect<any, Context>,
    executes: Event<Context> | Effect<Context, any>,
) {
    return createStore<Context[]>([])
        .on(queued, (state, context) => [...state, context])
        .on(executes, (state, context) =>
            state.filter((e) => !Object.is(e, context)),
        );
}

function sampleQueueConsumption<Context>(
    $queue: StoreWritable<Context[]>,
    consumeOn: Event<Context>,
    consumer: Effect<Context, any>,
) {
    return sample({
        clock: consumeOn,
        source: $queue,
        filter: (inQueue) => inQueue.length > 0,
        fn: (inQueue) => inQueue[inQueue.length - 1],
        target: consumer,
    });
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
    /**
     * Turning functions into effects:
     */

    let effectOrComposedList: EffectOrComposed<Context>[] =
        middlewares.length === 0
            ? [pass()]
            : flatten(middlewares).map(toEffectOrComposed);

    /**
     * Concatenating each middleware:
     */

    effectOrComposedList.reduce((from, to) =>
        forwardInternal(
            isComposed(from) ? from.last : from,
            isComposed(to) ? to.first : to,
        ),
    );

    let first = extractFirst(effectOrComposedList[0]);
    let last = extractLast(
        effectOrComposedList.at(-1) as EffectOrComposed<Context>,
    );

    /**
     * Wiring `step` event that fires on each middleware execution:
     */

    const step = createEvent<Context>();
    effectOrComposedList.forEach((middleware) =>
        isComposed(middleware)
            ? middleware.intercept(step)
            : sample({
                  clock: mapContextExtractor(middleware.done),
                  target: step,
              }),
    );

    /**
     * Wiring `failed` event that fires on each middleware exception:
     */

    const failed = createEvent<MiddlewareEffectFail<Context, any>>();
    effectOrComposedList.forEach((middleware) =>
        isComposed(middleware)
            ? middleware.catch(failed)
            : sample({
                  clock: middleware.fail,
                  target: failed,
              }),
    );

    /**
     * Defining execution/termination logic:
     */

    const $isTerminated = createStore(false);

    const terminated = createEvent();
    $isTerminated.on(terminated, () => true);

    const executed = createEvent<Context>();
    $isTerminated.on(executed, () => false);
    sample({
        clock: executed,
        target: first,
    });

    function shouldExecute() {
        return !$isTerminated.getState();
    }

    /**
     * Callable part of current composed middleware.
     */
    function fn(context: Context) {
        executed(context);
    }

    /**
     * Creates instance of current composed middleware.
     */
    function wrap(instance: ComposedApi<Context>) {
        return Object.assign(fn, instance);
    }

    /**
     * Creates sampling between two effects
     * in aware of current composed middleware.
     */
    function forwardInternal(
        from: MiddlewareEffect<Context>,
        to: MiddlewareEffect<Context>,
        predicate?: MaybeArray<(context: Context) => boolean>,
    ) {
        const filter = composeFilter(shouldExecute, predicate || []);

        sample({
            clock: mapContextExtractor(from.done),
            filter,
            target: to,
        });

        return to;
    }

    /**
     * Wires some composed middleware's events to the current.
     */
    function propagate(next: Composed<Context>) {
        next.intercept(step);
        next.catch(failed);

        return next;
    }

    /**
     * Composes middlewares in aware of current composed middleware.
     */
    function composeInternal(
        ...middlewares: MaybeArray<MiddlewareLike<Context>>[]
    ) {
        return propagate(compose(...middlewares));
    }

    /**
     * Creates forwarding for a list of middlewares.
     */
    function concat(params: {
        middlewares: MaybeArray<MiddlewareLike<Context>>[];
        predicate?: MaybeArray<(context: Context) => boolean>;
        shouldExtend?: boolean;
    }) {
        const next = compose(...params.middlewares);

        propagate(next);
        forwardInternal(last, next.first, params.predicate);
        if (params.shouldExtend) last = next.last;

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
        get failed() {
            return failed;
        },
        get passed() {
            return last.map((params) => params);
        },
        get ended() {
            return last.done.map(extractContext);
        },

        get $isTerminated() {
            return $isTerminated;
        },
        get terminated() {
            return terminated;
        },
        get executed() {
            return executed;
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

            return concat({ middlewares: rest, shouldExtend: true });
        },

        filter(predicate, ...middlewares) {
            return concat({
                predicate,
                middlewares,
                shouldExtend: true,
            });
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
                clock: this.failed,
                target: next.first,
            });

            return next;
        },

        apply(...presets) {
            return (
                (presets
                    .map((preset) => preset(wrap(this)) || wrap(this))
                    .at(-1) as Composed<Context>) || wrap(this)
            );
        },

        fork(...middlewares) {
            return concat({ middlewares });
        },

        forkFilter(predicate, ...middlewares) {
            return concat({ predicate, middlewares });
        },

        branch(predicate, matchMiddlewares, mismatchMiddlewares) {
            const match = composeInternal(matchMiddlewares);
            const mismatch = composeInternal(mismatchMiddlewares);

            const filter = composeFilter(predicate);

            return this.use((context: Context) =>
                filter(context) ? match(context) : mismatch(context),
            );
        },

        split(predicate, matchMiddlewares, mismatchMiddlewares) {
            const match = composeInternal(matchMiddlewares);
            const mismatch = composeInternal(mismatchMiddlewares);

            const prependMiddlewareContextResolver = <Context>(
                effect: MiddlewareEffect<Context>,
            ) =>
                effect.prepend((done: MiddlewareEffectDoneData<Context>) =>
                    extractContext(done),
                );

            const matchTarget = prependMiddlewareContextResolver(match.first);
            const mismatchTarget = prependMiddlewareContextResolver(
                mismatch.first,
            );

            const filter = composeFilter(shouldExecute, predicate);

            split({
                clock: this.last.done,
                source: this.last.done,
                match: (done: MiddlewareEffectDoneData<Context>) =>
                    filter(extractContext(done)) ? "match" : "mismatch",
                cases: {
                    match: matchTarget,
                    mismatch: mismatchTarget,
                },
            });
        },

        while(predicate, loopMiddlewares, ...nextMiddlewares) {
            const filter = composeFilter(predicate);
            const loop = composeInternal(loopMiddlewares, this.last);
            const next = composeInternal(...nextMiddlewares);

            this.split(filter, loop, next);

            return next;
        },

        pass(adapter, ...middlewares) {
            const next = compose(...middlewares);

            sample({
                clock: mapContextExtractor(this.last.done),
                filter: shouldExecute,
                fn: adapter,
                target: next.first,
            });

            return next;
        },

        queue(inParallel, ...middlewares) {
            const worker = composeInternal(...middlewares);

            const queued = mapContextExtractor(this.last.done);
            const executes = worker.first;
            const executed = mapContextExtractor(worker.last.done);

            const $inQueue = createQueueStore<Context>(queued, executes);

            const $inExecution = createStore(0)
                .on(executes, (state) => state + 1)
                .on(executed, (state) => state - 1);

            sampleQueueConsumption($inQueue, executed, executes);

            return this.filter(
                () => $inExecution.getState() < inParallel,
                worker,
            );
        },

        throttle(minTime, ...middlewares) {
            const worker = composeInternal(...middlewares);

            const queued = mapContextExtractor(this.last.done);
            const executes = worker.first;
            const freed = createEvent<Context>();

            const $inQueue = createQueueStore<Context>(queued, executes);

            const $currentlyExecutes = createStore(false)
                .on(executes, () => true)
                .on(freed, () => false);

            const delayFx = createEffect(
                (context: Context) =>
                    new Promise<Context>((resolve) =>
                        setTimeout(() => resolve(context), minTime),
                    ),
            );

            sample({
                clock: executes,
                target: delayFx,
            });

            sample({
                clock: delayFx.doneData,
                target: freed,
            });

            sampleQueueConsumption($inQueue, freed, executes);

            return this.filter(() => !$currentlyExecutes.getState(), worker);
        },
    };

    return wrap(instance);
}
