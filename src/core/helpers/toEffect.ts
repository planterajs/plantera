import { createEffect, Effect } from "effector";
import { MaybePromise } from "../../types";
const EFFECT_KEYS = Object.keys(createEffect());

export type EffectOrFn<Params, Done, Fail = Error> =
    | Effect<Params, Done, Fail>
    | ((params: Params) => MaybePromise<Done>);

export function isEffect<Params, Done, Fail>(
    effectOrFn: EffectOrFn<Params, Done, Fail>,
): effectOrFn is Effect<Params, Done, Fail> {
    return (
        effectOrFn !== null &&
        EFFECT_KEYS.every((key) => key in effectOrFn)
    );
}

export function toEffect<Params, Done, Fail>(
    effectOrFn: EffectOrFn<Params, Done, Fail>,
): Effect<Params, Done, Fail> {
    return (
        isEffect(effectOrFn) ? effectOrFn : createEffect(effectOrFn)
    ) as Effect<Params, Done, Fail>;
}
