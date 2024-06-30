import { createServer, IncomingMessage, ServerResponse } from "http";
import { createEvent, EventCallable } from "effector";

export type RequestContext = { req: IncomingMessage; res: ServerResponse };
export type RequestHandler = (context: RequestContext) => void;
export type RequestEvent = EventCallable<RequestContext>;

export type RouteApi = {
    join: (requestEvent: RequestEvent) => void;
};
export type RouteData = {
    method: string;
    path: string;
};
export type Route = RequestEvent & RouteApi & RouteData;

function createRequestEvent() {
    return createEvent<RequestContext>();
}

function createRoute(method: string, path: string): Route {
    const requestEvent = createRequestEvent();

    const matcher = (request: IncomingMessage) => {
        return request.method === method && request.url === path;
    };

    const handler = (context: RequestContext) => {
        if (matcher(context.req)) requestEvent(context);
    };

    const join = (routerEvent: EventCallable<RequestContext>) => {
        routerEvent.watch(handler);
    };

    return Object.assign(
        requestEvent,
        { join },
        {
            method,
            path,
        },
    );
}

export type RouterApi = {
    registerRoute: (route: Route) => void;
    get: (path: string, handler: RequestHandler) => void;
    post: (path: string, handler: RequestHandler) => void;
};
export type Router = RequestEvent & RouterApi;

function createRouter(): Router {
    const requestEvent = createRequestEvent();
    const routes: Route[] = [];

    const registerRoute = (route: Route) => {
        route.join(requestEvent);
        routes.push(route);
    };

    const getSimilarRoute = (method: string, path: string) => {
        return routes.find(
            (route) => route.method === method && route.path === path,
        );
    };

    const resolveRoute = (method: string, path: string) => {
        let route = getSimilarRoute(method, path);

        if (!route) {
            route = createRoute(method, path);
            registerRoute(route);
        }

        return route;
    };

    const get = (path: string, handler: RequestHandler) => {
        const route = resolveRoute("GET", path);
        route.watch(handler);
    };

    const post = (path: string, handler: RequestHandler) => {
        const route = resolveRoute("POST", path);
        route.watch(handler);
    };

    return Object.assign(requestEvent, { registerRoute, get, post });
}

const router = createRouter();

router.get("/hello", ({ res }) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("hello, effector!");
});

const server = createServer((req, res) => router({ req, res }));

server.listen(3000);

console.log("ready");
