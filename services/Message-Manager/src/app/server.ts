import helmet from "helmet";
import express, { Request, Response, Router } from "express";

import { catchSync } from "cash-lib/middleware/catchError";
import { ResponseException } from "cash-lib/middleware/responseException";
import { ResponseProtocole } from "cash-lib/middleware/responseProtocole";

const app = express();

/** ===================== Security Middlewares ===================== */
app.use(helmet());

/** ===================== Body Parsing & File Upload ===================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/** ===================== API Routes ===================== */
const apiRoutes: [string, Router][] = [



];

apiRoutes.forEach(([path, router]) => app.use(path, router));

/** ===================== Health Check ===================== */
app.get('/ping', catchSync(async(req : Request, res: Response)=> {
    const response = ResponseException("Service en ligne").Success();
    res.status(response.status).json({data:response.data});
}));

/** ===================== 404 Handler ===================== */
app.use(/(.*)/, catchSync(async(req : Request, res: Response) => {
    const response = ResponseException("Chemin ou méthode non supporté.").NotFound();
    res.status(response.status).json({data:response.data});
}))

/** ===================== Global Error Handler ===================== */
app.use(ResponseProtocole);

export default app;