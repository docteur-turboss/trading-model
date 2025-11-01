import app from "./app";
// import { logger } from "./services/logger";

const port = process.env.EXPRESS_PORT || 3000;

app.listen(port, () => {
//   logger.info(`Backend running on port ${port}`)
});