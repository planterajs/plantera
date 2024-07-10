import { IncomingMessage, ServerResponse } from "http";

export type MaybeArray<T> = T | T[];
export type MaybePromise<T> = T | Promise<T>;

export type RequestContext<
    Params extends Record<string, any> = Record<string, any>,
    Query extends Record<string, any> = Record<string, any>,
> = {
    req: IncomingMessage & {
        params: Params;
        query: Query;
        route: {
            method: string | undefined;
            path: string | undefined;
        };
    };
    res: ServerResponse;
};

export type HttpMethod =
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "OPTIONS"
    | "HEAD";
