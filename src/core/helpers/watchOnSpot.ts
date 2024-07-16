import { Subscription } from "effector";

type Watchable<Payload> = {
    watch(watcher: (payload: Payload) => any): Subscription;
};

/**
 * Listens for a value from an event, effect or any watchable unit **once**,
 * then unsubscribes.
 *
 * @param watchable Any watchable unit.
 * @param watcher Callback that will be called after value intercepts.
 */
export function watchOnSpot<Payload>(
    watchable: Watchable<Payload>,
    watcher: (payload: Payload) => any,
) {
    let unsubscribe = watchable.watch(async (payload) => {
        try {
            await watcher(payload);
        } finally {
            unsubscribe();
        }
    });
}
