import { createServer } from "node:http";
import { handleRequest } from "./src/index.ts";
createServer(handleRequest).listen(4001, () => console.log("up 4001"));
