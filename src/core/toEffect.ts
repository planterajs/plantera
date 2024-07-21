import { createEffect, Effect, is } from "effector";
import { MaybePromise } from "../types";

export type EffectCompatible<Params, Done, Fail = Error> =
    | Effect<Params, Done, Fail>
    | ((params: Params) => MaybePromise<Done>);

/**
 * Turns a callable into its equivalent effect.
 *
 * @param effectOrFn Any callable.
 * @returns Equivalent effect of a callable.
 */
export function toEffect<Params, Done, Fail>(
    effectOrFn: EffectCompatible<Params, Done, Fail>,
): Effect<Params, Done, Fail> {
    return (
        is.effect(effectOrFn) ? effectOrFn : createEffect(effectOrFn)
    ) as Effect<Params, Done, Fail>;
}
