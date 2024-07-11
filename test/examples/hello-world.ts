import { controller, createRouter } from "../../src";
import { createServer } from "node:http";

const router = createRouter();
createServer(router.callback).listen(3000);

router
    .get(
        "/hello",
        controller(() => "hello!"),
    )
    .get(
        "/:name",
        controller(
            (name: string) => `hello, ${name}!`,
            (context) => context.req.params.name,
        ),
    );
