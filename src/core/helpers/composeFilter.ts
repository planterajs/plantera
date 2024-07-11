import { flatten } from "lodash";
import { MaybeArray } from "../../types";

/**
 * Combines multiple filter functions into a single filter function.
 *
 * The returned filter function evaluates the given payload against each
 * of the provided filter functions. If all filter functions return true,
 * the combined filter returns true; otherwise, it returns false.
 *
 * ```ts
 * const isEven = (n: number) => n % 2 === 0;
 * const isPositive = (n: number) => n > 0;
 * const isEvenAndPositive = composeFilter(isEven, isPositive);
 *
 * console.log(isEvenAndPositive(4)); // true
 * console.log(isEvenAndPositive(-4)); // false
 * console.log(isEvenAndPositive(3)); // false
 * ```
 */
export function composeFilter<Payload>(
    ...filters: MaybeArray<(payload: Payload) => boolean>[]
) {
    const flattenedFilters = flatten(filters);
    return (payload: Payload) =>
        flattenedFilters.every((filter) => filter(payload));
}
