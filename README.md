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
- [Links](#links)

## Introduction

Plantera implements the most convenient way to create routing for your server applications in a server-side JavaScript. It uses an effector under the hood to achieve maximum reactivity and performance, while also allowing integration of existing codebases written in the effector.

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

# Links
- [Package](https://npmjs.com/package/plantera)
- [Effector](https://effector.dev)
