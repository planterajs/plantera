import { controller, createRouter } from "../../src";
import { createServer } from "node:http";
import { RequestContext } from "../../src";

const router = createRouter();
createServer(router.callback).listen(3000);

router.get(
    "/hello",
    controller(() => "hello!"),
);

router.get(
    "/:name",
    controller(
        (context: RequestContext) => `hello, ${context.req.params.name}!`,
    ),
);
