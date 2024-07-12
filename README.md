<p align="center">
    <img src="https://raw.githubusercontent.com/ncor/plantera/main/assets/logo.png" height="128">
    <h1 align="center">Plantera</h1>
    <p align="center">Server routing with ease.</p>
</p>

> [!WARNING]  
> This is a experimental project in the proof of concept stage. While this warning is here, the code is not ready for production.

# Why?
This project is an attempt to prove that the [effector](https://effector.dev) can be used as a base of backend framework.

# Getting started

Install the package using your favorite package manager. For example: [npm](https://npmjs.com), [pnpm](https://pnpm.io), [yarn](https://yarnpkg.com) or [bun](https://bun.sh/guides/install/add).
```bash
npm install plantera
```

Basic usage:
```ts
import { createServer } from "http"; 
import { router, controller } from "plantera";

const router = createRouter();

router.get("/hello", controller(() => "hello, plantera!");

createServer(router.callback).listen(3000);
```

# Context
Context is an object containing information about the request, response and current route.

## Query
You can access passed search parameters via `context.req.query`.
```ts
// GET /search?q=...
router.get("/search", context => search(context.req.query.q));
```

## Parameters
If route with slug parameters is present, parsed parameters can be accessed via `context.req.params`.
```ts
// GET /users/:name
router.get("/users/:name", context =>
    getUser(context.req.params.name)
);
```

## Route metadata
If a route is registered, all subsequent controllers and middlewares will have information about it, which can be accessed via `context.route`.

# Controller

A controller is a decorator function that allows you to turn any function or effect into a request handler. The function passed to this function can be of the following types:
1. A function that takes no arguments and returns some value.
```ts
const hello = controller(() => "hello!");
```
2. A function that takes an argument of its type and returns some value.
```ts
const hello = controller(
    (name: string) => `hello, ${name}!`,
    (context) => context.req.params.name
);
```
3. A function that already works with the request context and returns some value. 
```ts
const hello = controller((context: RequestContext) =>
    `hello, ${context.req.params.name}!`
);
```
4. A function that already works with the request context and sends a response using it.
```ts
const hello = controller((context: RequestContext) =>
    context.res.send(`hello, ${context.req.params.name}!`)
);
```

# Router

The router is a middleware system that processes requests from the server. Besides middleware interface extension, it provides macros for convenient registration of routes.

## Initialization

To initialize the router, use `createRouter` function.
```ts
const router = createRouter();
```

To start processing requests, pass the router callback when creating the server.
```ts
createServer(router.callback)
    .listen(port);
```

## Routes

Routes can be registered using special methods for each HTTP method.
```ts
router.get(path, handlers);
router.post(path, handlers);
router.put(path, handlers);
router.patch(path, handlers);
router.delete(path, handlers);
router.options(path, handlers);
router.head(path, handlers);
```

### Nesting
Routes can be nested with chaining or forwarding methods, such as `use`.
```ts
router
    .get("/users", allUsers) // GET /users
    .get("/:id", getUser); // GET /users/:id
// or
router
    .get("/users", allUsers)
    .use(nestedRouter);

router.get("/items"); // This isn't nested
```

### Prefixes
You can specify a prefix that will be used as the base path for nested routes.
```ts
router
    .prefix("/users")
    .get("/admins", allAdmins) // GET /users/admins
    .get("/:id", getUser) // Get /users/:id

router.get("/items"); // Doesn't imply prefix
```

### Composition
Multiple routers can be composed with `use`, `route` or other forwarding methods.
```ts
const userRouter = createRouter().route("/user");
// or
const userRouter = createRouter().prefix("/user");
    
userRouter.get("/", allUsers);
userRouter.get("/:id", getUser);

router.use(userRouter);
```

# Middlewares

The middleware system is based on [effector](https://effector.dev) API and provides methods for composing and executing middleware chains.

### compose()
Composes middlewares into one chain.

The function accepts any middleware that matches the shape of the middleware,
be it a function, effect, or other composed. It also accepts array chunks.
```ts
// This is valid input
compose(function, effect, composed, [function], [effect, composed]);
```

If you want to include another composed, do not try to pass its chain fields,
this may lead to unpredictable behavior.
```ts
// Good
compose(..., composed, ...);
```
```ts
// Unsafe!
compose(composed.first);
compose(composed.last);
compose(composed.first, ..., composed.last);
```

### use()

Concatenates/forwards passed middlewares to the current chain. After this method executed, the last effect of the current chain will be the last passed middleware.

```ts
// "a" and "b" will be called sequentially after the previous chain.
composed.use(a, b);
```

This method combines all passed middleware into one chain and returns a new composed. The returned instance can be further extended, and all changes

### filter()

Concatenates/forwards passed middlewares to the current chain with a filter attached. The following middleware will only be executed if the filter returns true.

```ts
// "a" and "b" will be called sequentially after the previous chain
// if the filter's predicate returns true.
composed.filter(predicate, a, b);
```

This method combines all passed middleware into one chain and returns a new composed. The returned instance can be further extended, and all changes will be regarded here.

### fork()

Concatenates/forwards passed middlewares to the current chain, but without extending the current chain. This behavior allows adding concurrency in your middleware system.

```ts
composed.use(a); // "a" will run first
composed.fork(b); // "b" will be started second, but run concurrently
composed.use(c); // "c" will also be run second
```

As said before, this method doesn't extend the current chain, so the resulting value will not depend on forked middlewares.

This method combines all passed middleware into one chain and returns a new composed. The returned instance can be further extended, and all changes will be regarded here.

### forkEach()

Combines each passed middleware into individual chains and returns an array of new composed instances. Each middleware will run concurrently but independently of each other.

```ts
composed.use(a); // "a" will run first
composed.forkEach(b, c, d);
// "b", "c", and "d" will each run concurrently but separately
composed.use(e); // "e" will run after "a"
```

Unlike `fork`, which combines all passed middleware into a single concurrent chain, `forkEach` creates a separate chain for each middleware. This method does not extend the current chain, so the resulting values will not depend on the forked middlewares.

This method combines all passed middleware into one chain and returns a new composed. The returned instance can be further extended, and all changes will be regarded here.

### branch()

Branches the middleware execution based on a predicate.

```ts
composed.branch(
  predicate,
  [trueMiddleware],
  [falseMiddleware]
);
// If predicate(...) is true, trueMiddleware runs.
// If predicate(...) is false, falseMiddleware runs.
```

This method combines all match and mismatch middlewares into one chain respectively and doesn't return any further interface due to branching mechanics.

### split()

Splits the middleware execution based on a predicate, similar to `branch`, but utilizes an event-driven approach to handle the execution paths.

```ts
composed.branch(
  predicate,
  [trueMiddleware],
  [falseMiddleware]
);
// If predicate(...) is true, trueMiddleware runs.
// If predicate(...) is false, falseMiddleware runs.
```

This method combines all match and mismatch middlewares into one chain respectively and doesn't return any further interface due to branching mechanics.

# Links
- [Package](https://npmjs.com/package/plantera)
- [Effector](https://effector.dev)
