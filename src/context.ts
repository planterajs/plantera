import { IncomingMessage, ServerResponse } from "http";

/**
 * Meta part of the `RequestContext` object. It used by `route` and `prefix`
 * middlewares to inform the middlewares about the current route.
 */
export type RouteMetadata = {
    method: string;
    path: string;
};

/**
 * Request part of the `RequestContext` object. It provides additional fields
 * such as `body` that can be used in middlewares or controllers.
 */
export type Request<
    Params extends Record<string, any> = Record<string, any>,
    Query extends Record<string, any> = Record<string, any>,
    Body extends Record<string, any> = Record<string, any>,
> = IncomingMessage & {
    body: Body;
    params: Params;
    query: Query;
};

/**
 * Response part of the `RequestContext` object. It provides extended API
 * for convenient response sending.
 */
export type Response = ServerResponse & {
    sent: boolean;
    send: (data: any) => Response;
};

/**
 * HTTP request data object with extended API.
 */
export type RequestContext<
    Params extends Record<string, any> = Record<string, any>,
    Query extends Record<string, any> = Record<string, any>,
    Body extends Record<string, any> = Record<string, any>,
> = {
    route: RouteMetadata;
    req: Request<Params, Query, Body>;
    res: Response;
};

/**
 * Content types that can be used in response.
 */
type ResponseContentType =
    | "text/plain"
    | "application/json"
    | "application/octet-stream";


/**
 * Wraps `req` and `res` into request context object.
 *
 * @param req `IncomingMessage` object.
 * @param res `ServerResponse` object.
 * @returns Request context.
 */
export function createContext<T extends RequestContext>(
    req: IncomingMessage,
    res: ServerResponse,
): T {
    return {
        route: createContextRouteMetadata(),
        req: createContextRequest(req),
        res: createContextResponse(res),
    } as T;
}

function createContextResponse(res: ServerResponse): Response {
    return Object.assign(res, {
        sent: false,
        send(data: any) {
            if (!res.headersSent && !this.sent) {
                const contentType = toResponseContentType(data);
                res.setHeader("Content-Type", contentType);
                const responseBody = toResponseBody(data, contentType);
                res.end(responseBody);
            }

            this.sent = true;
            return this;
        },
    }) as Response;
}

function createContextRouteMetadata(): RouteMetadata {
    return {
        method: "",
        path: "",
    };
}

function createContextRequest(req: IncomingMessage): Request {
    return Object.assign(req, {
        body: {},
        params: {},
        query: {},
    });
}

/**
 * Detects response content type of some value.
 *
 * @param data Any value.
 * @returns Detected content type.
 */
function toResponseContentType(data: any): ResponseContentType {
    if (typeof data === "string") {
        return "text/plain";
    } else if (data instanceof Object) {
        return "application/json";
    } else {
        return "application/octet-stream";
    }
}

/**
 * Transforms any value into its response-compatible form based on passed
 * content type.
 *
 * @param data Any value.
 * @param contentType Pre-detected content type of value.
 * @returns Response compatible form of a value.
 */
function toResponseBody(data: any, contentType: ResponseContentType) {
    switch (contentType) {
        case "application/json":
            return JSON.stringify(data);
        default:
            return data;
    }
}
