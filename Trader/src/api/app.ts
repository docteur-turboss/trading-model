import helmet from "helmet";
import express, { Request, Response, Router } from "express";

import './types/user.types';

// import AuthRoutes from "./routers/auth.routes";
// import UserRoutes from "./routers/user.routes";
// import metricsRoute from "./routers/metrics.routes";
// import ContactRoutes from "./routers/contact.routes";
// import settingRoutes from "./routers/settings.routes";
// import newsletterRoutes from "./routers/newsletter.routes";
// import TransactionRoutes from "./routers/transaction.routes";

import { catchSync } from "./middleware/catchError";
// import { requestLogger } from "./middleware/requestLogger";
// import { securityLogger } from "./middleware/securityLogger";
import { ResponseException } from "./middleware/responseException";
import { ResponseProtocole } from "./middleware/responseProtocole";

const app = express();

/** ===================== Security Middlewares ===================== */
app.use(helmet());

/** ===================== Body Parsing & File Upload ===================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/** ===================== API Routes ===================== */
const apiRoutes: [string, Router][] = [
//   ["/auth", AuthRoutes],
//   ["/newsletter", newsletterRoutes],
//   ["/contact", ContactRoutes],
//   ["/user", UserRoutes],
//   ["/settings", settingRoutes],
//   ["/transaction", TransactionRoutes],
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