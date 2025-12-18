import app from "./server";

app.listen(process.env.EXPRESS_PORT || 3003, () => {
    logger.info(`Mail Service is running on port ${process.env.EXPRESS_PORT || 3003}`)
})