import { Subscription } from "effector";

type Watchable<Payload> = {
    watch(watcher: (payload: Payload) => any): Subscription;
};

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
