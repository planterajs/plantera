import { IncomingMessage, ServerResponse } from "http";

export type RouteMetadata = {
    method: string;
    path: string;
};
export type Request<
    Params extends Record<string, any> = Record<string, any>,
    Query extends Record<string, any> = Record<string, any>,
    Body extends Record<string, any> = Record<string, any>,
> = IncomingMessage & {
    body: Body;
    params: Params;
    query: Query;
};
export type Response = ServerResponse & {
    sent: boolean;
    send: (data: any) => Response;
};
export type RequestContext<
    Params extends Record<string, any> = Record<string, any>,
    Query extends Record<string, any> = Record<string, any>,
    Body extends Record<string, any> = Record<string, any>,
> = {
    route: RouteMetadata;
    req: Request<Params, Query, Body>;
    res: Response;
};

type ResponseContentType =
    | "text/plain"
    | "application/json"
    | "application/octet-stream";


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
                const contentType = toContentType(data);
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

function toContentType(data: any): ResponseContentType {
    if (typeof data === "string") {
        return "text/plain";
    } else if (data instanceof Object) {
        return "application/json";
    } else {
        return "application/octet-stream";
    }
}

function toResponseBody(data: any, contentType: ResponseContentType) {
    switch (contentType) {
        case "application/json":
            return JSON.stringify(data);
        default:
            return data;
    }
}
