import { createEffect, Effect, is } from "effector";
import { MaybePromise } from "../../types";

export type EffectOrFn<Params, Done, Fail = Error> =
    | Effect<Params, Done, Fail>
    | ((params: Params) => MaybePromise<Done>);

export function toEffect<Params, Done, Fail>(
    effectOrFn: EffectOrFn<Params, Done, Fail>,
): Effect<Params, Done, Fail> {
    return (
        is.effect(effectOrFn) ? effectOrFn : createEffect(effectOrFn)
    ) as Effect<Params, Done, Fail>;
}
