import { createEffect, Effect, EventCallable, is } from "effector";
import { MaybePromise } from "../types";

export type EffectCompatible<Params, Done, Fail = Error> =
    | Effect<Params, Done, Fail>
    | EventCallable<Params>
    | ((params: Params) => MaybePromise<Done>);

function wrapEvent<Params>(event: EventCallable<Params>) {
    return (params: Params) => {
        event(params);
        return params;
    };
}

/**
 * Turns a callable into its equivalent effect.
 *
 * @param effectCompatible Any callable.
 * @returns Equivalent effect of a callable.
 */
export function toEffect<Params, Done, Fail>(
    effectCompatible: EffectCompatible<Params, Done, Fail>,
): Effect<Params, Done, Fail> {
    return (
        is.effect(effectCompatible)
            ? effectCompatible
            : createEffect(
                  is.event(effectCompatible)
                      ? wrapEvent(effectCompatible)
                      : effectCompatible,
              )
    ) as Effect<Params, Done, Fail>;
}
