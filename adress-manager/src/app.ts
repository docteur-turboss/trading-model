import { ResponseException, log, middleware, params } from "packages";
import adressRoutes from "./services/adress/adress.routes";
import { connectDatabase } from "./config/db";
import express from "express";
import path from "path";

const app = express()

let { catchSync, ResponseProtocole } = middleware
let { serviceName, inAppServiceName, loadEnv, env } = params

/*
    CONFIGURATION
*/

env = loadEnv(path.resolve(__dirname, "../../.env"));

app.set("envLoad", env)
app.set("logSys", new log(serviceName.object.adress, path.resolve("src", "log")))

app.disable("x-powered-by")
app.enable("json escalpe")

/*
    CONNECT DB
*/

connectDatabase(app)

/*
    MIDDLEWARE
*/

app.use(express.json())
app.use(express.urlencoded({
    extended: true,
}))

/*
    ADRESS SERVICES ROUTES
*/

app.use("/", adressRoutes)

/*
    ERROR 404
*/

app.use('*', catchSync(async() => {
    throw new ResponseException("Chemin ou méthodes non supporté.").NotFound()
}))

/*
    ERROR HANDLER
*/

app.use(ResponseProtocole);

/*
    CRITIC LOGS
*/
process.on("uncaughtException", (e) => {
    console.log(e)
    let logSys = app.get("logSys")

    if(!logSys) throw new Error("LogSys error : LogSys n'est pas monté");

    logSys.UnknowAppError(inAppServiceName.index, e)
});

export default app;