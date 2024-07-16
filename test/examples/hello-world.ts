import { controller } from "../../src";
import { RequestContext } from "../../src";
import { createApp } from "../../src";

const app = createApp();

app.get(
    "/hello",
    controller(() => "hello!"),
);
app.get(
    "/:name",
    controller(
        (context: RequestContext) => `hello, ${context.req.params.name}!`,
    ),
);

app.listen(3000);
