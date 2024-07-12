import { IncomingMessage, ServerResponse } from "http";

export type MaybeArray<T> = T | T[];
export type MaybePromise<T> = T | Promise<T>;

export type RouteMetadata = {
    method: string | undefined;
    path: string | undefined;
}
export type RequestContext<
    Params extends Record<string, any> = Record<string, any>,
    Query extends Record<string, any> = Record<string, any>,
> = {
    route: RouteMetadata,
    req: IncomingMessage & {
        params: Params;
        query: Query;
    };
    res: ServerResponse & {
        sent: boolean;
        send: ServerResponse["end"]
    };
};

export type HttpMethod =
    | "UNSPECIFIED"
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "OPTIONS"
    | "HEAD";
