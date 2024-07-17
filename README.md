<p align="center">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://github.com/planterajs/plantera/blob/10dfd96e02fc2899cc7513d324eb8483c3e812e0/assets/logo-light.png"/>
        <img src="https://github.com/planterajs/plantera/blob/10dfd96e02fc2899cc7513d324eb8483c3e812e0/assets/logo-dark.png" height="96">
    </picture>
    <h1 align="center">Plantera</h1>
    <p align="center">Server routing with ease.</p>
</p>

> [!WARNING]  
> This is a experimental project in the proof of concept stage. While this warning is here, the code is not ready for production. This project is an attempt to prove that the [effector](https://effector.dev) can be used as a base of backend framework.

## Table of contents

- [Introduction](#introduction)
- [Getting started](#getting-started)
- [Documentation](#documentation)
  - [Setup](#setup)
  - [Routing](#routing)
    - [Basic endpoints](#basic-endpoints)
    - [Nesting](#nesting)
    - [Prefixes](#prefixes)
  - [Controllers](#controllers)
  - [Request context](#request-context)
  - [Composition](#composition)
- [Links](#links)

## Introduction

Plantera implements the most convenient way to create routing for your server applications in a server-side JavaScript with event-driven approch. It uses an effector under the hood to achieve maximum reactivity and performance, while also allowing integration of existing codebases written in the effector.

### Core concepts:
- All handlers (or middlewares) are effects that can be interconnected and monitored by different parts of the system.
- All routing is built on chains of effects that can be composed and expanded using its API.
- The construction of the middleware system follows the declarative programming principles, that is, the system will work exactly as you described it.

## Getting started

Install the package using your favorite package manager. For example: [npm](https://npmjs.com), [pnpm](https://pnpm.io), [yarn](https://yarnpkg.com) or [bun](https://bun.sh/guides/install/add).
```bash
npm install plantera
```

Basic usage:
```ts
import { createApp, controller } from "plantera";

const app = createApp();

app.get("/hello", controller(() => "hello, plantera!"));

app.listen(3000);
```

# Documentation

## References

- [Setup](#setup)
- [Routing](#routing)
  - [Basic endpoints](#basic-endpoints)
  - [Prefixes](#prefixes)
  - [Nesting](#nesting)
  - [Decomposition](#decomposition)
- [Controllers](#controllers)
- [Request context](#request-context)
- [Composition](#composition)

## Setup

The mechanics of web servers are based on the exchange of requests and responses between the client and the server, so it is necessary to initialize the server as well as the router instance.

To do this, you can use the `createApp` that creates both of these entities and links them together, or you can initialize everything separately for greater flexibility.

### Examples

Using default `createApp` behaviour:
```ts
const app = createApp();

app.listen(port);
```

Using separate instances as parameters for `createApp`:
```ts
const router = createRouter();
const server = createServer(router.callback);
const app = createApp({ router, server });

app.listen(port);
```

Using manual initialization:
```ts
const router = createRouter();
const server = createServer(router.callback);

server.listen(port);
```

## Routing

Routing can be implemented using custom middleware composition system, but it is recommended to use pre-designed router instance that can be created with `createRouter` or `createApp`.

```ts
// This is a router:
const router = createRouter();
// This is a router with server attached:
const app = createApp();
```

The router entity is a composed middleware instance with an extended API for defining endpoints. Let's look at how to define endpoints and nest them.

### Basic endpoints

To define an endpoint, you can use `route`, `get`, `post`, `put` and other HTTP method specific methods.

The `route` method accepts a method, path template and a list of methods. The handlers will only be called when the request matches this route.
```ts
router.route("GET", "/path", handlers);
```

Like the `route` method, HTTP method specific methods imply similar logic, but without having to specify the method with string parameter.
```ts
router.get("/path", handlers);
```

The endpoint definition returns an event that can be used as a firing event for external handlers.
```ts
import { sample } from "effector";

// ...
sample({
  clock: router.post("/action"),
  target: actionFx
});
```

### Nesting

Route nesting can be implemented by chaining route definitions.

With decomposition:
```ts
// GET /users
const getUsers = router.get("/users", handlers);
// POST /users/:id
const updateUser = getUsers.post("/:id");

// GET /items
const getItems = router.get("/items", handlers);
// POST /items/:id
const updateItem = getItems.post("/:id", handlers);
```

With inline chaining:
```ts
router
    .get("/users", handlers) // GET /users
    .get("/:id", handlers); // POST /users/:id

router
    .get("/items", handlers) // GET /items
    .get("/:id", handlers); // POST /items/:id
```

### Prefixes

To specify the base path for a router branch, you can use `prefix` method. It attaches a string to `context.route.path` that will be used as a base path for all further routes.

```ts
// GET /users
const withPrefix = router.prefix("/users");
// GET /users/:id
withPrefix.get("/:id", handlers);

// GET /items
router.get("/items", handlers);
```

### Decomposition

The router instance can be decomposed into multiple routers to achieve modularity. Multiple routers can be connected to each other using `use` and other forwarding methods.

Examples:
```ts
const childRouter = createRouter();
// ...
parentRouter.use(childRouter);
```
```ts
const childRouter = createRouter();
// ...
parentRouter.prefix("/base-path").use(childRouter);
```
```ts
const childRouter = createRouter().prefix("/base-path");
// ...
parentRouter.use(childRouter);
```
```ts
const childRouter = createRouter();
// ...
parentRouter.route(HttpMethods.Unspecified, "/base-path", childRouter);
```

### Complex control-flow

To achieve complex control flow with filtering, forking and other useful patterns, try other methods that provided in [composed middleware API](#composition).

## Controllers

When it comes time to process a request, it is necessary to have a function that accepts the request context and can return some value to the client. Such functions and effects can be defined manually, but there is a `controller` function for such a thing.

This method turns any function into a handler that will work with the request data and send a response to the client. A function can initially work with a context object from parameters, or accept its own parameters, or not accept parameters at all. Let's look at all  cases.

With no params and return value:
```ts
const empty = () => {};
const controller = controller(empty);
// the controller will send 200 status code with no data
```

With no params:
```ts
const generator = () => value;
const controller = controller(generator);
// the controller will send a value
```

With possible exception:
```ts
const throwsError = () => {
    throw new Error(...);
};
const controller = controller(throwsError);
// the controller will send 400 status code with error message
```

With context as parameter:
```ts
const withContext = (context) => value;
const controller = controller(withContext);
```

With own parameters. The `adapter` converts context object to the expected value:
```ts
const withCustomParams = (params) => value;
const controller = controller(withCustomParams, adapter);
```

With context as parameter that used to send response. There's no need to use `controller` decorator:
```ts
const someController = (context) => {
    // ...
    context.res.send(...);
};
```

## Request context

The request context is an object that is passed between effects in the router middleware system. It consists of familiar `req` and `res` fields and own API. A new context object is created when a new request is received from the server instance. You also can manually create new context object with `createContext`.

### `req`

The `req` field consists of [`IncomingMessage`](https://nodejs.org/api/http.html#class-httpincomingmessage) and an additional data fields.

- `query` contains URL-encoded parameters from the request URL.
```ts
router.get("/search", controller((context) =>
    search(context.req.query.q || "")
));
// GET /search?q=cats --> context.req.query == { q: "cats" } 
```

- `params` contains a slug parameters based on the relevant route path template from the request URL.
```ts
router.get("/search/:query", controller((context) =>
    search(context.req.params.query || "")
));
// GET /search/cats --> context.req.params == { query: "cats" } 
```

- `body` contains interpreted request body data passed from the client.
> Not implemented yet
```ts
router.put("/items", controller((context) =>
    insertItems(context.req.body.items)
));
// PUT /items { items: [...] }  --> context.req.body == { items: [...] }
```

### `res`

The `res` field consists of [`ServerResponse`](https://nodejs.org/api/http.html#class-httpserverresponse) and an additional API.

- `send` - the function that transforms passed data and sends it as a response.
```ts
router.get("/birds", async (context) =>
    context.res.send(await getBirds())
);
```
- `sent` - the flag indicating whether the response has been sent or not.

### `route`

The `route` field consists of a current route metadata.

- `method` - current method that have been applied to filter requests.
- `path` - current path **template** that have been applied to filter requests or to set base path.

## Composition

Plantera uses an event-driven architecture to implement application logic. To simplify the construction of reactive systems, an API has been implemented that allows you to combine effects (further middlewares) and events into extensible chains. This approach is used by default in routing and can be used independently of it, for example in separate modules.

`compose` function is used to combine middlewares into a callable chain and provide them with an API for expansion and distribution. It returns an entity with sufficient properties and methods to further define any flow declaratively. The passed middleware can be any callable: a function, effect,
or other composed middleware, or a sublist of similar elements.
```ts
const increment = (n: number) => n + 1;
const square = (n: number) => n ** 2;

const incrementAndSquare = compose(increment, square);

incrementAndSquare(5); // -> 36
```

Let's look at the API that allows to extend it further.

### Basic methods

### `.use`
Composes passed middlewares and forwards the last current middleware to
the first passed one. Returns an extension of the current composed middleware.
```ts
composed.use(first, second);
// first and second will run after
```
This method is often used to include middlewares in routing.

### `.filter`
Composes passed predicates and middlewares respectively and forwards
the last current middleware to the first passed one with filter attached.
Returns an extension of the current composed middleware.
```ts
composed.filter(predicate, next);
// next will run if predicate returns true
```
This method can be used to add guards on top of your handlers.

### `.fork`
Composes passed middlewares and forwards the last current middleware to
the first passed one without extension. It can be used for high-level
concurrency or separation in use middleware system.
Returns an untouched instance of the current composed middleware.
```ts
composed.use(first); // will run first
composed.fork(second, third); // will run after first, but concurrently
composed.use(fourth); // will run after first
```

### `.branch`
Composes passed predicates and middlewares respectively and creates
a new attached middleware that will execute match or mismatch middlewares
based on predicate's return value.
Returns an extension of the current composed middleware.
```ts
composed.branch(predicate, match, mismatch);
// if predicates returns true, match will run, otherwise - mismatch
```

### Advanced methods

### `.forkFilter`
Composes passed predicates and middlewares respectively and forwards
the last current middleware to the first passed one with filter attached
(like `filter`) without extension.
Returns an untouched instance of the current composed middleware.
```ts
// will run first
composed.use(first);
// will run after first as filter, but concurrently
composed.forkFilter(predicate, second);
 // will run after first
composed.use(third);
```

### `.split`
Composes passed predicates and middlewares respectively and splits
execution result of last middleware of the current composed middleware
based on predicate's return value.

This method is similar to `branch`, but doesn't extend current composed
middleware.
```ts
composed.split(predicate, match, mismatch);
// if predicates returns true, match will run, otherwise - mismatch
```

### `.forEach`
Iterates through passed items with a provided relevant instance.
Returns a list of values that were returned from callback.
```ts
// forks each middleware separately
composed.forEach(
    [first, second, third],
    (it, instance) => instance.fork(it)
);
```

### Interception

### `.on`
Composes passed middlewares and forwards `first` effect
to the first passed one with filter attached.
Returns composed passed middlewares.

The `first` event will fire after each execution of the current
composed middleware. It means, that next composed will run each time
this middleware executes.
```ts
composed.on(predicate, next);
// next will run if predicate returns true after each execution
```

### `.when`

Composes passed middlewares and forwards `step` event
to the first passed one with filter attached.
Returns composed passed middlewares.

The `step` event will fire after the successful execution of each of the
middleware of the current composed middleware system. It means, that
next composed will run each time some middleware executes and predicate
returns true.
```ts
composed.when(predicate, next);
// next will run if predicate returns true after each step
```

### `.intercept`

Composes passed middlewares and forwards `step` event
to the first passed one. Returns composed passed middlewares.

The `step` event will fire after the successful execution of each of the
middleware of the current composed middleware system. It means, that
next composed will run each time some middleware executes.
```ts
composed.intercept(first).use(second);
// first and second will run after each step
```

### Error handling

### `.catch`
Composes passed middlewares and forwards `fail` event
to the first passed one with filter attached.
Returns composed passed middlewares.

The `fail` event will fire when any of the current system's middleware
throws an exception. It means, that next composed will run each time some
middleware throws an exception.
```ts
composed.catch(next);
// next will run after each fail
```

### Presets

Presets are used to directly modify and update an instance. For example,
use `fork` or `filter` on it without the need to create a separate composed.
Presets can be registered in composed middleware with `use` or `apply` methods.

Without presets:
```ts
const applyCustomFilter = () => {
    const separateComposed = compose();
    separateComposed.filter(predicate, something);
    return separateComposed;
}

composed.use(applyCustomFilter());
```

With presets:
```ts
const applyCustomFilter = createPreset(
   source => source.filter(predicate, something)
);

composed.use(applyCustomFilter);
```

### Built-in units

`compose` produces events and effects that can be used to externally extend the system.

- `.first` - a first effect of the current composed middleware. It can be used as a
firing event because of its targeting properties.
- `.last` - a last effect of the current composed middleware. It can be used as a
  terminator event because of its targeting properties.
- `.step` - an event that fires after the successful execution of each of the
  middleware of the current composed middleware system.
- `.fail` - An event that fires when any of the current system's middleware throws
  an exception.
- `.passed` - an alias event, derived for `last` property. It only fires when `last`
  effect is fired.
- `.ended` - an alias event, derived for `last.done` property.
  It only fires when `last.done` effect is fired.

## Links
- [Package](https://npmjs.com/package/plantera)
- [Effector](https://effector.dev)
