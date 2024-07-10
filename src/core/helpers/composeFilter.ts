import { flatten } from "lodash";
import { MaybeArray } from "../../types";

export function composeFilter<Payload>(
    ...filters: MaybeArray<(payload: Payload) => boolean>[]
) {
    const flattenedFilters = flatten(filters);
    return (payload: Payload) =>
        flattenedFilters.every((filter) => filter(payload));
}
