export type MaybeArray<T> = T | T[];
export type MaybePromise<T> = T | Promise<T>;

export type HttpMethod =
    | "UNSPECIFIED"
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "OPTIONS"
    | "HEAD";
